import React, { useState, useEffect } from 'react';
import {
  fetchAdminWorkLogs,
  fetchMachines,
  updateAdminWorkLog,
  updateWorkLogPaymentStatus,
  approveWorkLog,
  rejectWorkLog,
  deleteWorkLog,
  type ExtendedWorkLog,
} from '../../services/adminService';
import type { Machine, PaymentStatus } from '../../types/database';
import { toast } from '../../services/syncService';
import { generateSingleServiceReceiptPdf } from '../../utils/pdfGenerator';
import {
  formatDateBr,
  formatTimeHHMM,
  formatCurrencyBRL,
  applyPhoneMask,
  calculateTotalHours,
} from '../../utils/formatters';
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
  Save,
  ChevronDown,
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
  const [machines, setMachines] = useState<Machine[]>([]);

  // Estados editáveis pelo Administrador
  const [clientNameInput, setClientNameInput] = useState<string>('');
  const [clientPhoneInput, setClientPhoneInput] = useState<string>('');
  const [serviceDateInput, setServiceDateInput] = useState<string>('');
  const [machineIdInput, setMachineIdInput] = useState<string>('');
  const [machineNameInput, setMachineNameInput] = useState<string>('');
  const [startHoursInput, setStartHoursInput] = useState<string>('0');
  const [endHoursInput, setEndHoursInput] = useState<string>('0');
  const [hourlyRateInput, setHourlyRateInput] = useState<string>('0');
  const [observationsInput, setObservationsInput] = useState<string>('');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('a_receber');
  const [isUpdatingPayment, setIsUpdatingPayment] = useState<boolean>(false);

  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isSavingEdits, setIsSavingEdits] = useState<boolean>(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);
  const [isPdfMenuOpen, setIsPdfMenuOpen] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    fetchMachines().then(setMachines);

    fetchAdminWorkLogs('todos').then((all) => {
      const found = all.find((s) => String(s.id) === String(serviceId));
      if (found) {
        setService(found);
        const rawClient = found.client_name || '';
        const cleanClient =
          rawClient !== 'Em andamento' && rawClient !== 'A definir'
            ? rawClient
            : '';
        setClientNameInput(cleanClient);
        setClientPhoneInput(found.client_phone ? applyPhoneMask(found.client_phone) : '');
        setServiceDateInput((found.service_date || '').split('T')[0]);
        setMachineIdInput(found.machine_id || '');
        setMachineNameInput(found.machine_model || found.machine_name || '');
        const initialHorometer =
          found.start_hours ??
          (found as any).km_initial ??
          (found as any).initial_horimeter ??
          (found as any).horimeter_initial ??
          (found as any).initial_meter ??
          0;
        const finalHorometer =
          found.end_hours ??
          (found as any).km_final ??
          (found as any).final_horimeter ??
          (found as any).horimeter_final ??
          (found as any).final_meter ??
          0;
        setStartHoursInput(String(initialHorometer));
        setEndHoursInput(String(finalHorometer));
        setHourlyRateInput(String(found.hourly_rate ?? 0));
        setObservationsInput(found.observations || '');
        setPaymentStatus(found.payment_status || 'a_receber');
      }
    });
  }, [serviceId]);

  const numStart = parseFloat(String(startHoursInput).replace(',', '.')) || 0;
  const numEnd = parseFloat(String(endHoursInput).replace(',', '.')) || 0;
  const numericRate =
    parseFloat(String(hourlyRateInput).replace(/[^\d.,-]/g, '').replace(',', '.')) || 0;
  const calculatedHours = calculateTotalHours(numStart, numEnd);
  const calculatedTotal = Number((calculatedHours * numericRate).toFixed(2));

  const selectedMachine = machines.find((m) => m.id === machineIdInput);
  const isKm = (selectedMachine?.billing_unit === 'km') || (service?.billing_unit === 'km');

  const handleMachineSelect = (newMachineId: string) => {
    setMachineIdInput(newMachineId);
    const chosen = machines.find((m) => m.id === newMachineId);
    if (chosen) {
      setMachineNameInput(
        chosen.model && chosen.model.trim() !== '' && chosen.model.trim() !== 'Padrão'
          ? chosen.model.trim()
          : chosen.name
      );
      if (chosen.hourly_rate !== undefined && chosen.hourly_rate > 0) {
        setHourlyRateInput(String(chosen.hourly_rate));
      }
    }
  };

  /**
   * Atualiza imediatamente o status de pagamento ('pago' | 'a_receber') no Supabase e Dexie
   */
  const handleChangePaymentStatus = async (newStatus: PaymentStatus) => {
    if (!service || isUpdatingPayment || paymentStatus === newStatus) return;
    setIsUpdatingPayment(true);
    setPaymentStatus(newStatus);

    const res = await updateWorkLogPaymentStatus(service.id, newStatus);
    setIsUpdatingPayment(false);

    if (res.success) {
      setService((prev) => (prev ? { ...prev, payment_status: newStatus } : null));
      setFeedback({
        type: 'success',
        message:
          newStatus === 'pago'
            ? 'Status de pagamento atualizado para Pago!'
            : 'Status de pagamento atualizado para A receber!',
      });
    } else {
      setFeedback({
        type: 'error',
        message: res.error || 'Erro ao atualizar status de pagamento.',
      });
    }
  };

  /**
   * Salva as alterações editadas pelo administrador no Supabase (`work_logs`) e no Dexie local
   */
  const handleSaveChanges = async (): Promise<boolean> => {
    if (!service || isSavingEdits || isProcessing) return false;

    if (!clientNameInput.trim()) {
      setFeedback({ type: 'error', message: 'Informe o nome do cliente.' });
      return false;
    }
    if (numEnd < numStart) {
      setFeedback({
        type: 'error',
        message: 'O horímetro final deve ser maior ou igual ao horímetro inicial.',
      });
      return false;
    }

    setIsSavingEdits(true);
    setFeedback(null);

    const cleanPhone = clientPhoneInput.trim() || null;
    const cleanObs = observationsInput.trim() || null;

    const result = await updateAdminWorkLog(service.id, {
      client_name: clientNameInput.trim(),
      client_phone: cleanPhone,
      service_date: serviceDateInput,
      machine_id: machineIdInput,
      machine_name: machineNameInput,
      start_hours: numStart,
      end_hours: numEnd,
      hourly_rate: numericRate,
      total_amount: calculatedTotal,
      billing_unit: isKm ? 'km' : 'hour',
      observations: cleanObs,
    });

    setIsSavingEdits(false);

    if (result.success) {
      setService((prev) =>
        prev
          ? {
              ...prev,
              client_name: clientNameInput.trim(),
              client_phone: cleanPhone,
              service_date: serviceDateInput,
              machine_id: machineIdInput,
              machine_name: machineNameInput,
              start_hours: numStart,
              end_hours: numEnd,
              total_hours: calculatedHours,
              hourly_rate: numericRate,
              total_amount: calculatedTotal,
              billing_unit: isKm ? 'km' : 'hour',
              observations: cleanObs,
            }
          : null
      );
      toast.success('Alterações salvas com sucesso!');
      setFeedback({ type: 'success', message: 'Alterações salvas com sucesso!' });
      onActionComplete();
      return true;
    } else {
      setFeedback({ type: 'error', message: result.error || 'Erro ao salvar alterações.' });
      return false;
    }
  };

  const handleApprove = async () => {
    if (!service || isProcessing) return;

    if (!clientNameInput.trim()) {
      setFeedback({ type: 'error', message: 'Informe o nome do cliente antes de aprovar.' });
      return;
    }
    if (numEnd < numStart) {
      setFeedback({
        type: 'error',
        message: 'O horímetro final deve ser maior ou igual ao horímetro inicial.',
      });
      return;
    }

    setIsProcessing(true);
    setFeedback(null);

    // 1. Garante que quaisquer edições feitas nos campos sejam persistidas no Supabase e Dexie
    const cleanPhone = clientPhoneInput.trim() || null;
    const cleanObs = observationsInput.trim() || null;
    const updateRes = await updateAdminWorkLog(service.id, {
      client_name: clientNameInput.trim(),
      client_phone: cleanPhone,
      service_date: serviceDateInput,
      machine_id: machineIdInput,
      machine_name: machineNameInput,
      start_hours: numStart,
      end_hours: numEnd,
      hourly_rate: numericRate,
      total_amount: calculatedTotal,
      billing_unit: isKm ? 'km' : 'hour',
      observations: cleanObs,
    });

    if (!updateRes.success) {
      setIsProcessing(false);
      setFeedback({ type: 'error', message: updateRes.error || 'Erro ao salvar dados antes de aprovar.' });
      return;
    }

    // 2. Aprova o apontamento e gera o lançamento financeiro
    const result = await approveWorkLog(service.id, numericRate, calculatedTotal);
    setIsProcessing(false);

    if (result.success) {
      setService((prev) =>
        prev
          ? {
              ...prev,
              status: 'aprovado',
              client_name: clientNameInput.trim(),
              client_phone: cleanPhone,
              service_date: serviceDateInput,
              machine_id: machineIdInput,
              machine_name: machineNameInput,
              start_hours: numStart,
              end_hours: numEnd,
              total_hours: calculatedHours,
              hourly_rate: numericRate,
              total_amount: calculatedTotal,
              observations: cleanObs,
            }
          : null
      );
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
   * Envio de comprovante / notinha digital via WhatsApp (usando dados atuais editados)
   */
  const handleSendWhatsApp = () => {
    if (!service) return;
    const dateFormatted = formatDateBr(serviceDateInput || service.service_date);
    const rateFmt = formatCurrencyBRL(numericRate);
    const totalFmt = formatCurrencyBRL(calculatedTotal);
    const resolvedFallback =
      service.client_name && service.client_name !== 'Em andamento' && service.client_name !== 'A definir'
        ? service.client_name
        : 'Cliente';
    const currentClient = clientNameInput.trim() || resolvedFallback;
    const currentMachine = machineNameInput || service.machine_name;
    const currentObs = observationsInput.trim();

    const messageLines = isKm
      ? [
          `🚚 *RETROSCAVE - COMPROVANTE DE SERVIÇO (GUINCHO)*`,
          `━━━━━━━━━━━━━━━━━━━━━━`,
          `👤 *Cliente:* ${currentClient}`,
          `📅 *Data:* ${dateFormatted}`,
          `🚚 *Veículo:* ${currentMachine}`,
          `👷 *Operador:* ${service.operator_name}`,
          `━━━━━━━━━━━━━━━━━━━━━━`,
          `🛣️ *KM Inicial:* ${numStart} km`,
          `🛣️ *KM Final:* ${numEnd} km`,
          `🚗 *Distância Percorrida:* ${calculatedHours} km`,
          `💵 *Valor por KM:* ${rateFmt}`,
          `💰 *VALOR TOTAL A ACERTAR:* ${totalFmt}`,
          `━━━━━━━━━━━━━━━━━━━━━━`,
          currentObs ? `📝 *Observações:* ${currentObs}\n━━━━━━━━━━━━━━━━━━━━━━\n` : '',
          `✅ *Status:* Serviço Conferido`,
          `_Obrigado pela preferência e parceria!_`,
        ]
      : [
          `🚜 *RETROSCAVE - COMPROVANTE DE SERVIÇO*`,
          `━━━━━━━━━━━━━━━━━━━━━━`,
          `👤 *Cliente:* ${currentClient}`,
          `📅 *Data:* ${dateFormatted}`,
          `🚜 *Máquina:* ${currentMachine}`,
          `👷 *Operador:* ${service.operator_name}`,
          `━━━━━━━━━━━━━━━━━━━━━━`,
          `⏱️ *Horímetro Inicial:* ${numStart}h`,
          `⏱️ *Horímetro Final:* ${numEnd}h`,
          `⏳ *Total de Horas:* ${calculatedHours}h`,
          `💵 *Valor por Hora:* ${rateFmt}`,
          `💰 *VALOR TOTAL A ACERTAR:* ${totalFmt}`,
          `━━━━━━━━━━━━━━━━━━━━━━`,
          currentObs ? `📝 *Observações:* ${currentObs}\n━━━━━━━━━━━━━━━━━━━━━━\n` : '',
          `✅ *Status:* Serviço Conferido`,
          `_Obrigado pela preferência e parceria!_`,
        ];

    const message = messageLines.filter(Boolean).join('\n');
    const encoded = encodeURIComponent(message);

    const cleanPhone = (clientPhoneInput || service.client_phone || '').replace(/\D/g, '');
    if (cleanPhone.length >= 10) {
      const ddi = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
      window.open(`https://wa.me/${ddi}?text=${encoded}`, '_blank');
    } else {
      window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
    }
  };

  /**
   * Exporta comprovante individual timbrado em formato PDF (notinha A5).
   * Permite exportar com ou sem valores financeiros (`showPricing`).
   */
  const handleExportPdf = (showPricing: boolean = true) => {
    if (!service) return;
    setIsPdfMenuOpen(false);
    const resolvedPdfClient =
      clientNameInput.trim() ||
      ((service.client_name && service.client_name !== 'Em andamento' && service.client_name !== 'A definir')
        ? service.client_name
        : 'Cliente a definir');

    generateSingleServiceReceiptPdf(
      {
        id: service.id,
        client_name: resolvedPdfClient,
        client_phone: clientPhoneInput.trim() || service.client_phone || null,
        machine_name: machineNameInput || service.machine_name,
        operator_name: service.operator_name,
        service_date: serviceDateInput || service.service_date,
        start_hours: numStart,
        end_hours: numEnd,
        total_hours: calculatedHours,
        billing_unit: isKm ? 'km' : 'hour',
        observations: observationsInput.trim() || null,
      },
      numericRate,
      calculatedTotal,
      showPricing
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

  if (!service) {
    return (
      <div className="w-full max-w-md mx-auto min-h-screen bg-[#F8FAFC] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#FBBF24] animate-spin" />
      </div>
    );
  }

  const startClock = formatTimeHHMM(service.start_time, service.started_at || service.created_at);
  const endClock =
    service.status === 'em_andamento'
      ? 'Em andamento'
      : formatTimeHHMM(service.end_time, service.finished_at);

  // Garante que a máquina atual do serviço apareça nas opções mesmo se não estiver no cache ainda
  const machineOptions: Array<{ id: string; name: string; model?: string }> =
    machines.length > 0
      ? machines.some((m) => m.id === machineIdInput)
        ? machines.map((m) => ({ id: m.id, name: m.name, model: m.model }))
        : [
            {
              id: machineIdInput,
              name: service.machine_model || machineNameInput || 'Máquina Atual',
              model: service.machine_model || machineNameInput,
            },
            ...machines.map((m) => ({ id: m.id, name: m.name, model: m.model })),
          ]
      : [
          {
            id: machineIdInput,
            name: service.machine_model || machineNameInput || 'Retroescavadeira',
            model: service.machine_model || machineNameInput,
          },
        ];

  return (
    <div className="relative flex flex-col justify-between w-full max-w-md mx-auto min-h-screen bg-[#F8FAFC] shadow-2xl">
      
      {/* 1. TOPO: BOTÃO VOLTAR E TÍTULO */}
      <header className="px-6 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] pb-4 bg-white border-b border-[#E2E8F0] sticky top-0 z-20 flex items-center justify-between">
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

      {/* 2. CARD DETALHADO E EDITÁVEL DO SERVIÇO */}
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

        {/* Barra de Ações Rápidas de Cobrança (WhatsApp e PDF) */}
        <div className="p-4 bg-gradient-to-br from-emerald-50 via-teal-50/50 to-white border border-emerald-200 rounded-2xl shadow-xs space-y-3 animate-fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-emerald-800">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span className="text-xs font-bold uppercase tracking-wider">Ações de Cobrança</span>
            </div>
            {clientPhoneInput.replace(/\D/g, '').length >= 10 ? (
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Phone className="w-3 h-3" /> WhatsApp Vinculado
              </span>
            ) : (
              <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                Preencha o WhatsApp abaixo
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              id="btn-whatsapp-receipt"
              type="button"
              onClick={handleSendWhatsApp}
              className="h-11 px-2.5 bg-[#10B981] hover:bg-[#059669] active:scale-[0.98] text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              <MessageCircle className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">Comprovante WhatsApp</span>
            </button>

            <button
              id="btn-pdf-receipt"
              type="button"
              aria-expanded={isPdfMenuOpen}
              aria-haspopup="menu"
              onClick={() => setIsPdfMenuOpen((prev) => !prev)}
              className="h-11 px-2.5 bg-[#0F172A] hover:bg-[#1E293B] active:scale-[0.98] text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              <FileText className="w-4 h-4 text-[#FBBF24] flex-shrink-0" />
              <span className="truncate">Exportar Notinha (PDF)</span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-400 flex-shrink-0 transition-transform ${
                  isPdfMenuOpen ? 'rotate-180' : ''
                }`}
              />
            </button>
          </div>

          {/* Menu Dropdown / Popover de Seleção do Formato da Notinha PDF */}
          {isPdfMenuOpen && (
            <div
              role="menu"
              aria-label="Opções de exportação de PDF"
              className="mt-2 p-2 bg-white border border-[#CBD5E1] rounded-xl shadow-md space-y-1.5 animate-fade-in"
            >
              <p className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
                Escolha o formato da notinha:
              </p>

              <button
                id="btn-pdf-with-pricing"
                type="button"
                role="menuitem"
                onClick={() => handleExportPdf(true)}
                className="w-full p-2.5 rounded-lg hover:bg-amber-50/70 active:bg-amber-100/60 border border-transparent hover:border-amber-200 flex items-center gap-3 text-left transition-all cursor-pointer"
              >
                <div className="w-8 h-8 rounded-lg bg-[#FEF3C7] text-[#B45309] flex items-center justify-center shrink-0">
                  <DollarSign className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-extrabold text-[#0F172A]">
                    Com Valores (Completo)
                  </p>
                  <p className="text-[11px] text-[#64748B] truncate">
                    {isKm
                      ? `Inclui tarifa/km e valor total (${formatCurrencyBRL(calculatedTotal)})`
                      : `Inclui tarifa/hora e valor total (${formatCurrencyBRL(calculatedTotal)})`}
                  </p>
                </div>
              </button>

              <button
                id="btn-pdf-without-pricing"
                type="button"
                role="menuitem"
                onClick={() => handleExportPdf(false)}
                className="w-full p-2.5 rounded-lg hover:bg-slate-100 active:bg-slate-200/70 border border-transparent hover:border-slate-200 flex items-center gap-3 text-left transition-all cursor-pointer"
              >
                <div className="w-8 h-8 rounded-lg bg-slate-100 text-[#0F172A] flex items-center justify-center shrink-0">
                  <Clock className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-extrabold text-[#0F172A]">
                    Sem Valores (Apenas {isKm ? 'Quilômetros' : 'Horas'})
                  </p>
                  <p className="text-[11px] text-[#64748B] truncate">
                    {isKm
                      ? `Exibe somente quilometragem e distância (${calculatedHours} km)`
                      : `Exibe somente horímetros e total de horas (${calculatedHours}h)`}
                  </p>
                </div>
              </button>
            </div>
          )}
        </div>

        {/* Card Principal: Conferência e Edição pelo Administrador */}
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-sm space-y-4">
          
          {/* Informações de Auditoria do Expediente (Operador + Horário Real de Início e Fim) */}
          <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-2 bg-white rounded-lg border border-slate-200 text-[#0F172A] shrink-0">
                <User className="w-4 h-4 text-[#0F172A]" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-[#64748B]">Funcionário</p>
                <p className="text-sm font-bold text-[#0F172A] truncate">
                  {service.operator_name}
                </p>
              </div>
            </div>

            <div className="text-right shrink-0">
              <p className="text-[11px] font-medium text-[#64748B] flex items-center justify-end gap-1">
                <Clock className="w-3 h-3 text-[#F59E0B]" />
                <span>Janela do Dia</span>
              </p>
              <p id="service-real-time-window" className="text-xs font-extrabold text-[#0F172A]">
                Horário: {startClock} - {endClock}
              </p>
            </div>
          </div>

          {/* Controle de Status de Pagamento: "A receber" vs "Pago" */}
          <div className="p-3.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#0F172A] flex items-center gap-1.5">
                <DollarSign className="w-4 h-4 text-[#F59E0B]" />
                <span>Status de Pagamento</span>
              </span>
              <span className="text-[11px] font-semibold text-[#64748B]">
                Toque para alterar
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                id="btn-payment-status-a-receber"
                type="button"
                disabled={isUpdatingPayment}
                onClick={() => handleChangePaymentStatus('a_receber')}
                className={`h-10 px-3 rounded-xl text-xs font-extrabold border transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  paymentStatus === 'a_receber'
                    ? 'bg-[#FEF3C7] text-[#B45309] border-[#F59E0B] shadow-2xs ring-2 ring-[#FDE68A]'
                    : 'bg-white text-[#64748B] border-[#CBD5E1] hover:bg-amber-50/40'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>A receber</span>
              </button>

              <button
                id="btn-payment-status-pago"
                type="button"
                disabled={isUpdatingPayment}
                onClick={() => handleChangePaymentStatus('pago')}
                className={`h-10 px-3 rounded-xl text-xs font-extrabold border transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  paymentStatus === 'pago'
                    ? 'bg-[#DCFCE7] text-[#166534] border-[#16A34A] shadow-2xs ring-2 ring-[#86EFAC]'
                    : 'bg-white text-[#64748B] border-[#CBD5E1] hover:bg-emerald-50/40'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Pago</span>
              </button>
            </div>
          </div>

          {/* Campo 1: Máquina (Dropdown) */}
          <div className="flex items-start gap-3">
            <div className="p-2 bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] text-[#0F172A] mt-6">
              <Truck className="w-4 h-4 text-[#0F172A]" />
            </div>
            <div className="flex-1 min-w-0">
              <label htmlFor="admin-edit-machine" className="text-xs font-bold text-[#0F172A] block mb-1">
                Máquina
              </label>
              <select
                id="admin-edit-machine"
                value={machineIdInput}
                onChange={(e) => handleMachineSelect(e.target.value)}
                className="w-full h-11 px-3 bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl text-sm font-bold text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#FBBF24] cursor-pointer"
              >
                {machineOptions.map((machine) => (
                  <option key={machine.id} value={machine.id}>
                    {machine.model &&
                    machine.model.trim() !== '' &&
                    machine.model.trim() !== 'Padrão' &&
                    machine.model.trim() !== machine.name.trim()
                      ? `${machine.model} (${machine.name})`
                      : machine.model && machine.model.trim() !== 'Padrão'
                      ? machine.model
                      : machine.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Campo 2: Nome do Cliente */}
          <div className="flex items-start gap-3">
            <div className="p-2 bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] text-[#0F172A] mt-6">
              <Users className="w-4 h-4 text-[#0F172A]" />
            </div>
            <div className="flex-1 min-w-0">
              <label htmlFor="admin-edit-client-name" className="text-xs font-bold text-[#0F172A] block mb-1">
                Nome do Cliente
              </label>
              <input
                id="admin-edit-client-name"
                type="text"
                value={clientNameInput}
                onChange={(e) => setClientNameInput(e.target.value)}
                placeholder="Nome do cliente ou obra"
                className="w-full h-11 px-3 bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl text-sm font-bold text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
              />
            </div>
          </div>

          {/* Campo 3: WhatsApp / Telefone do Cliente */}
          <div className="flex items-start gap-3">
            <div className="p-2 bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] text-[#0F172A] mt-6">
              <Phone className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <label htmlFor="admin-edit-client-phone" className="text-xs font-bold text-[#0F172A] block mb-1">
                WhatsApp / Telefone do Cliente
              </label>
              <input
                id="admin-edit-client-phone"
                type="tel"
                value={clientPhoneInput}
                onChange={(e) => setClientPhoneInput(applyPhoneMask(e.target.value))}
                placeholder="(00) 00000-0000"
                className="w-full h-11 px-3 bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl text-sm font-bold text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
              />
            </div>
          </div>

          {/* Campo 4: Data do Serviço */}
          <div className="flex items-start gap-3">
            <div className="p-2 bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] text-[#0F172A] mt-6">
              <Calendar className="w-4 h-4 text-[#0F172A]" />
            </div>
            <div className="flex-1 min-w-0">
              <label htmlFor="admin-edit-service-date" className="text-xs font-bold text-[#0F172A] block mb-1">
                Data do serviço
              </label>
              <input
                id="admin-edit-service-date"
                type="date"
                value={serviceDateInput}
                onChange={(e) => setServiceDateInput(e.target.value)}
                className="w-full h-11 px-3 bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl text-sm font-bold text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
              />
            </div>
          </div>

          {/* Campos 5 e 6: Horímetro / KM Inicial e Horímetro / KM Final */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <label htmlFor="admin-edit-start-hours" className="text-xs font-bold text-[#0F172A] flex items-center gap-1 mb-1">
                <Clock className="w-3.5 h-3.5 text-[#64748B]" />
                <span>{isKm ? 'KM Inicial (km)' : 'Horím. Inicial (h)'}</span>
              </label>
              <input
                id="admin-edit-start-hours"
                type="number"
                step={isKm ? '1' : '0.1'}
                value={startHoursInput}
                onChange={(e) => setStartHoursInput(e.target.value)}
                className="w-full h-11 px-3 bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl text-sm font-bold text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
              />
            </div>

            <div>
              <label htmlFor="admin-edit-end-hours" className="text-xs font-bold text-[#0F172A] flex items-center gap-1 mb-1">
                <RotateCw className="w-3.5 h-3.5 text-[#64748B]" />
                <span>{isKm ? 'KM Final (km)' : 'Horím. Final (h)'}</span>
              </label>
              <input
                id="admin-edit-end-hours"
                type="number"
                step={isKm ? '1' : '0.1'}
                value={endHoursInput}
                onChange={(e) => setEndHoursInput(e.target.value)}
                className="w-full h-11 px-3 bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl text-sm font-bold text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
              />
            </div>
          </div>

          {/* Item 7: Horas trabalhadas ou Distância percorrida (Recalculadas automaticamente) */}
          <div className="flex items-center justify-between p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl">
            <div className="flex items-center gap-2">
              <Fuel className="w-4 h-4 text-[#0F172A]" />
              <span className="text-xs font-semibold text-[#64748B]">
                {isKm ? 'Distância percorrida' : 'Horas trabalhadas'}
              </span>
            </div>
            <span className="text-sm font-extrabold text-[#0F172A]">
              {calculatedHours}{isKm ? ' km' : 'h'}
            </span>
          </div>

          {/* Item 8: Valor por hora / KM (Editável para o Administrador) */}
          <div className="flex items-start gap-3 pt-1">
            <div className="p-2 bg-[#FEF3C7] rounded-xl border border-[#FDE68A] text-[#B45309] mt-6">
              <DollarSign className="w-4 h-4 text-[#B45309]" />
            </div>
            <div className="flex-1 min-w-0">
              <label htmlFor="input-applied-hourly-rate" className="text-xs font-bold text-[#0F172A] block mb-1">
                {isKm ? 'Valor por KM (R$/km)' : 'Valor por hora (R$)'}
              </label>
              <input
                id="input-applied-hourly-rate"
                type="text"
                inputMode="decimal"
                value={hourlyRateInput}
                onChange={(e) => setHourlyRateInput(e.target.value)}
                className="w-full h-11 px-3 bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl text-sm font-bold text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                placeholder={isKm ? '8.50' : '160.00'}
              />
            </div>
          </div>

          {/* Campo 9: Observações */}
          <div className="space-y-1 pt-1">
            <label htmlFor="admin-edit-observations" className="text-xs font-bold text-[#0F172A] block">
              Observações
            </label>
            <textarea
              id="admin-edit-observations"
              rows={2}
              value={observationsInput}
              onChange={(e) => setObservationsInput(e.target.value)}
              placeholder="Adicione ou edite observações deste serviço..."
              className="w-full p-3 bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl text-xs font-medium text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#FBBF24] resize-none"
            />
          </div>

          {/* Item 10: Total Calculado em Tempo Real */}
          <div className="pt-3 border-t border-[#E2E8F0] flex items-center justify-between">
            <span className="text-sm font-bold text-[#64748B]">Total</span>
            <span className="text-xl font-extrabold text-[#0F172A]">
              {formatCurrencyBRL(calculatedTotal)}
            </span>
          </div>

          {/* Botão Salvar Alterações */}
          <button
            id="btn-save-service-changes"
            type="button"
            onClick={handleSaveChanges}
            disabled={isSavingEdits || isProcessing}
            className="w-full h-11 bg-[#FBBF24] hover:bg-[#F59E0B] active:scale-[0.98] text-[#0F172A] font-extrabold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isSavingEdits ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-[#0F172A]" />
                <span>Salvando alterações...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Salvar Alterações</span>
              </>
            )}
          </button>
        </div>

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
              <p>
                <span className="font-semibold text-slate-900">Cliente:</span>{' '}
                {clientNameInput.trim() ||
                  ((service.client_name && service.client_name !== 'Em andamento' && service.client_name !== 'A definir')
                    ? service.client_name
                    : 'Cliente a definir')}
              </p>
              <p><span className="font-semibold text-slate-900">Máquina:</span> {machineNameInput || service.machine_name}</p>
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
