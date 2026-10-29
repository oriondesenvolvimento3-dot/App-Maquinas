import React, { useState, useEffect } from 'react';
import {
  fetchAdminWorkLogs,
  approveWorkLog,
  rejectWorkLog,
  deleteWorkLog,
  type ExtendedWorkLog,
} from '../../services/adminService';
import { generateSingleServiceReceiptPdf } from '../../utils/pdfGenerator';
import {
  ArrowLeft,
  Truck,
  User,
  Users,
  Calendar,
  Clock,
  RotateCw,
  Fuel,
  DollarSign,
  Loader2,
  CheckCircle2,
  AlertCircle,
  MessageCircle,
  FileText,
  Phone,
  Trash2,
} from 'lucide-react';

interface AdminServiceDetailProps {
  serviceId: string | number;
  onBack: () => void;
  onActionComplete: () => void;
}

export const AdminServiceDetail: React.FC<AdminServiceDetailProps> = ({
  serviceId,
  onBack,
  onActionComplete,
}) => {
  const [service, setService] = useState<ExtendedWorkLog | null>(null);
  const [hourlyRateInput, setHourlyRateInput] = useState<string>('0');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    fetchAdminWorkLogs('todos').then((all) => {
      const found = all.find((s) => String(s.id) === String(serviceId));
      if (found) {
        setService(found);
        setHourlyRateInput(String(found.hourly_rate ?? 0));
      }
    });
  }, [serviceId]);

  const numericRate = parseFloat(hourlyRateInput.replace(',', '.')) || 0;
  const calculatedHours = service
    ? service.total_hours || (Number(service.end_hours) - Number(service.start_hours)) || 0
    : 0;
  const calculatedTotal = calculatedHours * numericRate;

  const handleApprove = async () => {
    if (!service || isProcessing) return;
    setIsProcessing(true);
    setFeedback(null);

    const result = await approveWorkLog(service.id, numericRate, calculatedTotal);
    setIsProcessing(false);

    if (result.success) {
      setFeedback({ type: 'success', message: 'Serviço aprovado e lançado no financeiro com sucesso!' });
      setTimeout(() => onActionComplete(), 1200);
    } else {
      setFeedback({ type: 'error', message: result.error || 'Erro ao aprovar serviço.' });
    }
  };

  const handleReject = async () => {
    if (!service || isProcessing) return;
    setIsProcessing(true);
    setFeedback(null);

    const result = await rejectWorkLog(service.id, 'Rejeitado na conferência pelo administrador');
    setIsProcessing(false);

    if (result.success) {
      setFeedback({ type: 'success', message: 'Serviço marcado como rejeitado.' });
      setTimeout(() => onActionComplete(), 1200);
    } else {
      setFeedback({ type: 'error', message: result.error || 'Erro ao rejeitar serviço.' });
    }
  };

  /**
   * Exclusão permanente do apontamento de serviço
   */
  const handleDelete = async () => {
    if (!service || isProcessing) return;
    setIsProcessing(true);
    setFeedback(null);

    const result = await deleteWorkLog(service.id);
    setIsProcessing(false);
    setIsDeleteModalOpen(false);

    if (result.success) {
      setFeedback({ type: 'success', message: 'Serviço excluído com sucesso!' });
      setTimeout(() => onActionComplete(), 1000);
    } else {
      setFeedback({ type: 'error', message: result.error || 'Erro ao excluir serviço.' });
    }
  };

  /**
   * Envio de comprovante / notinha digital via WhatsApp
   */
  const handleSendWhatsApp = () => {
    if (!service) return;
    const dateFormatted = formatDate(service.service_date);
    const rateFmt = `R$ ${numericRate.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    const totalFmt = `R$ ${calculatedTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

    const messageLines = [
      `🚜 *RETROSCAVE - COMPROVANTE DE SERVIÇO*`,
      `━━━━━━━━━━━━━━━━━━━━━━`,
      `👤 *Cliente:* ${service.client_name}`,
      `📅 *Data:* ${dateFormatted}`,
      `🚜 *Máquina:* ${service.machine_name}`,
      `👷 *Operador:* ${service.operator_name}`,
      `━━━━━━━━━━━━━━━━━━━━━━`,
      `⏱️ *Horímetro Inicial:* ${service.start_hours}h`,
      `⏱️ *Horímetro Final:* ${service.end_hours}h`,
      `⏳ *Total de Horas:* ${calculatedHours}h`,
      `💵 *Valor por Hora:* ${rateFmt}`,
      `💰 *VALOR TOTAL A ACERTAR:* ${totalFmt}`,
      `━━━━━━━━━━━━━━━━━━━━━━`,
      service.observations ? `📝 *Observações:* ${service.observations}\n━━━━━━━━━━━━━━━━━━━━━━\n` : '',
      `✅ *Status:* Serviço Aprovado e Concluído`,
      `_Obrigado pela preferência e parceria!_`
    ];

    const message = messageLines.filter(Boolean).join('\n');
    const encoded = encodeURIComponent(message);

    const cleanPhone = (service.client_phone || '').replace(/\D/g, '');
    if (cleanPhone.length >= 10) {
      const ddi = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
      window.open(`https://wa.me/${ddi}?text=${encoded}`, '_blank');
    } else {
      window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
    }
  };

  /**
   * Exporta comprovante individual timbrado em formato PDF (notinha A5)
   */
  const handleExportPdf = () => {
    if (!service) return;
    generateSingleServiceReceiptPdf(
      { ...service, total_hours: calculatedHours },
      numericRate,
      calculatedTotal
    );
  };

  const getStatusBadge = (status: 'pendente' | 'aprovado' | 'rejeitado' | 'em_andamento') => {
    switch (status) {
      case 'aprovado':
        return (
          <span className="px-3 py-1 bg-[#DCFCE7] text-[#166534] rounded-full text-xs font-bold">
            Aprovado
          </span>
        );
      case 'pendente':
        return (
          <span className="px-3 py-1 bg-[#FEF3C7] text-[#B45309] rounded-full text-xs font-bold">
            Pendente
          </span>
        );
      case 'rejeitado':
        return (
          <span className="px-3 py-1 bg-[#FEE2E2] text-[#991B1B] rounded-full text-xs font-bold">
            Rejeitado
          </span>
        );
      case 'em_andamento':
        return (
          <span className="px-3 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-xs font-bold inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
            Em andamento
          </span>
        );
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      const [year, month, day] = dateStr.split('T')[0].split('-');
      return `${day}/${month}/${year}`;
    } catch {
      return dateStr;
    }
  };

  if (!service) {
    return (
      <div className="w-full max-w-md mx-auto min-h-screen bg-[#F8FAFC] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#FBBF24] animate-spin" />
      </div>
    );
  }

  return (
    <div className="relative flex flex-col justify-between w-full max-w-md mx-auto min-h-screen bg-[#F8FAFC] shadow-2xl">
      
      {/* 1. TOPO: BOTÃO VOLTAR E TÍTULO */}
      <header className="px-6 pt-5 pb-4 bg-white border-b border-[#E2E8F0] sticky top-0 z-20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="w-10 h-10 -ml-2 rounded-full flex items-center justify-center text-[#0F172A] hover:bg-[#F1F5F9] active:scale-95 transition-all cursor-pointer"
            aria-label="Voltar"
          >
            <ArrowLeft className="w-5 h-5 stroke-[2.5]" />
          </button>
          <h1 className="text-lg font-bold text-[#0F172A] tracking-tight">
            Detalhe do serviço
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {getStatusBadge(service.status)}
          <button
            id="btn-delete-service-header"
            type="button"
            onClick={() => setIsDeleteModalOpen(true)}
            disabled={isProcessing}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-red-500 hover:text-red-700 hover:bg-red-50 active:scale-95 transition-all cursor-pointer"
            title="Excluir serviço"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 2. CARD DETALHADO DO SERVIÇO */}
      <main
        className={`flex-1 px-6 py-6 space-y-5 overflow-y-auto ${
          service.status === 'aprovado' ? 'pb-8' : 'pb-28'
        }`}
      >
        
        {feedback && (
          <div
            className={`p-3.5 rounded-xl text-xs font-semibold flex items-center gap-2 animate-fade-in ${
              feedback.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}

        {/* Barra de Ações Rápidas de Cobrança (Apenas para Serviços Aprovados) */}
        {service.status === 'aprovado' && (
          <div className="p-4 bg-gradient-to-br from-emerald-50 via-teal-50/50 to-white border border-emerald-200 rounded-2xl shadow-xs space-y-3 animate-fade-in">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-emerald-800">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span className="text-xs font-bold uppercase tracking-wider">Ações de Cobrança</span>
              </div>
              {service.client_phone ? (
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Phone className="w-3 h-3" /> WhatsApp Vinculado
                </span>
              ) : (
                <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                  Sem WhatsApp direto
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                id="btn-whatsapp-receipt"
                type="button"
                onClick={handleSendWhatsApp}
                className="h-12 px-2.5 bg-[#10B981] hover:bg-[#059669] active:scale-[0.98] text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
              >
                <MessageCircle className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">Comprovante WhatsApp</span>
              </button>

              <button
                id="btn-pdf-receipt"
                type="button"
                onClick={handleExportPdf}
                className="h-12 px-2.5 bg-[#0F172A] hover:bg-[#1E293B] active:scale-[0.98] text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
              >
                <FileText className="w-4 h-4 text-[#FBBF24] flex-shrink-0" />
                <span className="truncate">Exportar Notinha (PDF)</span>
              </button>
            </div>
          </div>
        )}

        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-sm space-y-4">
          
          {/* Item 1: Máquina */}
          <div className="flex items-start gap-3">
            <div className="p-2 bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] text-[#0F172A] mt-0.5">
              <Truck className="w-4 h-4 text-[#0F172A]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-[#64748B]">Máquina</p>
              <p className="text-sm font-bold text-[#0F172A] truncate">
                {service.machine_name}
              </p>
            </div>
          </div>

          {/* Item 2: Funcionário */}
          <div className="flex items-start gap-3">
            <div className="p-2 bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] text-[#0F172A] mt-0.5">
              <User className="w-4 h-4 text-[#0F172A]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-[#64748B]">Funcionário</p>
              <p className="text-sm font-bold text-[#0F172A] truncate">
                {service.operator_name}
              </p>
            </div>
          </div>

          {/* Item 3: Cliente */}
          <div className="flex items-start gap-3">
            <div className="p-2 bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] text-[#0F172A] mt-0.5">
              <Users className="w-4 h-4 text-[#0F172A]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-[#64748B]">Cliente</p>
              <p className="text-sm font-bold text-[#0F172A] truncate">
                {service.client_name}
              </p>
              {service.client_phone && (
                <p className="text-xs text-emerald-700 font-semibold mt-0.5 flex items-center gap-1">
                  <Phone className="w-3 h-3 text-emerald-600" />
                  {service.client_phone}
                </p>
              )}
            </div>
          </div>

          {/* Item 4: Data */}
          <div className="flex items-start gap-3">
            <div className="p-2 bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] text-[#0F172A] mt-0.5">
              <Calendar className="w-4 h-4 text-[#0F172A]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-[#64748B]">Data</p>
              <p className="text-sm font-bold text-[#0F172A]">
                {formatDate(service.service_date)}
              </p>
            </div>
          </div>

          {/* Item 5: Horímetro Inicial */}
          <div className="flex items-start gap-3">
            <div className="p-2 bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] text-[#0F172A] mt-0.5">
              <Clock className="w-4 h-4 text-[#0F172A]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-[#64748B]">Horário Inicial</p>
              <p className="text-sm font-bold text-[#0F172A]">
                {service.start_hours}h
              </p>
            </div>
          </div>

          {/* Item 6: Horímetro Final */}
          <div className="flex items-start gap-3">
            <div className="p-2 bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] text-[#0F172A] mt-0.5">
              <RotateCw className="w-4 h-4 text-[#0F172A]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-[#64748B]">Horário Final</p>
              <p className="text-sm font-bold text-[#0F172A]">
                {service.end_hours}h
              </p>
            </div>
          </div>

          {/* Item 7: Horas trabalhadas */}
          <div className="flex items-start gap-3">
            <div className="p-2 bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] text-[#0F172A] mt-0.5">
              <Fuel className="w-4 h-4 text-[#0F172A]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-[#64748B]">Horas trabalhadas</p>
              <p className="text-sm font-bold text-[#0F172A]">
                {calculatedHours}h
              </p>
            </div>
          </div>

          {/* Item 8: Valor por hora (Editável para o Administrador) */}
          <div className="flex items-start gap-3 pt-1">
            <div className="p-2 bg-[#FEF3C7] rounded-xl border border-[#FDE68A] text-[#B45309] mt-0.5">
              <DollarSign className="w-4 h-4 text-[#B45309]" />
            </div>
            <div className="flex-1 min-w-0">
              <label className="text-xs font-bold text-[#0F172A] block mb-1">
                Valor por hora (R$)
              </label>
              <input
                id="input-applied-hourly-rate"
                type="text"
                inputMode="decimal"
                value={hourlyRateInput}
                onChange={(e) => setHourlyRateInput(e.target.value)}
                className="w-full h-11 px-3 bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl text-sm font-bold text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                placeholder="160.00"
              />
            </div>
          </div>

          {/* Item 9: Total Calculado em Tempo Real */}
          <div className="pt-2 border-t border-[#E2E8F0] flex items-center justify-between">
            <span className="text-sm font-bold text-[#64748B]">Total</span>
            <span className="text-xl font-extrabold text-[#0F172A]">
              R$ {calculatedTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Seção: Observações */}
        {service.observations && (
          <div className="space-y-1.5">
            <h3 className="text-xs font-bold text-[#0F172A]">Observações</h3>
            <p className="text-xs text-[#64748B] bg-white border border-[#E2E8F0] rounded-xl p-3.5 leading-relaxed">
              {service.observations}
            </p>
          </div>
        )}
        {/* Botão discreto de Exclusão no final do card */}
        <div className="pt-2 flex justify-center">
          <button
            id="btn-delete-service-bottom"
            type="button"
            onClick={() => setIsDeleteModalOpen(true)}
            disabled={isProcessing}
            className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50/80 active:scale-95 rounded-xl border border-red-200/70 transition-all cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Excluir este serviço</span>
          </button>
        </div>
      </main>

      {/* 3. RODAPÉ FIXO DE AÇÕES (APENAS PARA SERVIÇOS NÃO APROVADOS: REJEITAR / APROVAR) */}
      {service.status !== 'aprovado' && (
        <footer
          className="fixed bottom-0 left-0 right-0 max-w-md mx-auto p-4 pb-6 bg-white border-t border-slate-100 flex items-center gap-3 w-full z-30 shadow-lg"
          style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
        >
          <button
            id="btn-reject-service"
            type="button"
            onClick={handleReject}
            disabled={isProcessing || service.status === 'rejeitado'}
            className="flex-1 h-12 border border-red-200 text-red-600 bg-red-50/50 hover:bg-red-100 active:scale-[0.98] font-semibold text-sm rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center"
          >
            Rejeitar
          </button>

          <button
            id="btn-approve-service"
            type="button"
            onClick={handleApprove}
            disabled={isProcessing}
            className="flex-1 h-12 bg-slate-900 text-white hover:bg-slate-800 active:scale-[0.98] font-semibold text-sm rounded-xl transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
          >
            {isProcessing ? (
              <Loader2 className="w-4 h-4 animate-spin text-[#FBBF24]" />
            ) : (
              <span>Aprovar</span>
            )}
          </button>
        </footer>
      )}

      {/* Modal de Confirmação de Exclusão */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#0F172A]">Excluir Serviço</h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Tem certeza que deseja excluir este serviço? Esta ação removerá o registro e atualizará os totais.
                </p>
              </div>
            </div>

            {/* Resumo do serviço a excluir */}
            <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-700 space-y-1 border border-slate-200">
              <p><span className="font-semibold text-slate-900">Cliente:</span> {service.client_name}</p>
              <p><span className="font-semibold text-slate-900">Máquina:</span> {service.machine_name}</p>
              <p><span className="font-semibold text-slate-900">Horas:</span> {calculatedHours}h • R$ {calculatedTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(false)}
                disabled={isProcessing}
                className="flex-1 h-11 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                id="btn-confirm-delete"
                type="button"
                onClick={handleDelete}
                disabled={isProcessing}
                className="flex-1 h-11 bg-red-600 hover:bg-red-700 active:scale-[0.98] text-white font-semibold text-xs rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isProcessing ? (
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Confirmar Exclusão</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminServiceDetail;
