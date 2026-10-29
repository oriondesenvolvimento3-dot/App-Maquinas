import React, { useState } from 'react';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import {
  finishWorkLog,
  calculateTotalHours,
  type WorkLogFormData,
  type FinishServiceFormData,
} from '../../services/workLogService';
import type { OfflineWorkLog } from '../../types/database';
import {
  ArrowLeft,
  Truck,
  Clock,
  Users,
  Phone,
  Calendar,
  FileText,
  AlertCircle,
  Loader2,
  CheckCircle,
  Sparkles,
} from 'lucide-react';

interface FinishServiceFormProps {
  activeLog: OfflineWorkLog;
  onBack: () => void;
  onSuccess: (data: WorkLogFormData) => void;
}

export const FinishServiceForm: React.FC<FinishServiceFormProps> = ({
  activeLog,
  onBack,
  onSuccess,
}) => {
  const { isOnline } = useNetworkStatus();

  const [endHours, setEndHours] = useState<string>('');
  const [clientName, setClientName] = useState<string>('');
  const [clientPhone, setClientPhone] = useState<string>('');
  const [serviceDate, setServiceDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [observations, setObservations] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);

  // Máscara amigável de WhatsApp/telefone brasileiro: (XX) XXXXX-XXXX
  const formatPhoneMask = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 2) return digits ? `(${digits}` : '';
    if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setClientPhone(formatPhoneMask(e.target.value));
  };

  // Formata hora de início
  const formatStartTime = (isoString?: string) => {
    if (!isoString) return '--:--';
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '--:--';
    }
  };

  // Cálculo reativo das horas trabalhadas
  const numStart = Number(activeLog.start_hours || 0);
  const numEnd = parseFloat(endHours.replace(',', '.')) || 0;
  const calculatedHours = calculateTotalHours(numStart, numEnd);
  const isHorometerInvalid = endHours !== '' && numEnd < numStart;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);
    const errors: Record<string, string> = {};

    if (!clientName.trim()) {
      errors.client_name = 'Informe o nome do cliente ou da obra.';
    }

    if (!endHours || isNaN(numEnd)) {
      errors.end_hours = 'Informe o horímetro final.';
    } else if (numEnd < numStart) {
      errors.end_hours = `O horímetro final (${numEnd}h) deve ser maior ou igual ao inicial (${numStart}h).`;
    }

    if (!serviceDate) {
      errors.service_date = 'Informe a data do serviço.';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setFormErrors({});
    setIsSubmitting(true);

    const finishPayload: FinishServiceFormData = {
      localId: activeLog.id,
      serverId: activeLog.server_id,
      machine_id: activeLog.machine_id,
      machine_name: activeLog.machine_name,
      operator_id: activeLog.operator_id,
      operator_name: activeLog.operator_name,
      client_name: clientName.trim(),
      client_phone: clientPhone.trim() || null,
      service_date: serviceDate,
      start_hours: numStart,
      end_hours: numEnd,
      observations: observations.trim() || null,
      started_at: activeLog.started_at,
    };

    try {
      const result = await finishWorkLog(finishPayload, isOnline);
      if (result.success) {
        onSuccess({
          machine_id: activeLog.machine_id,
          machine_name: activeLog.machine_name,
          operator_id: activeLog.operator_id,
          operator_name: activeLog.operator_name,
          client_name: clientName.trim(),
          client_phone: clientPhone.trim() || undefined,
          service_date: serviceDate,
          start_hours: numStart,
          end_hours: numEnd,
          observations: observations.trim() || null,
        });
      } else {
        setGeneralError(result.error || 'Erro ao concluir apontamento.');
      }
    } catch (err) {
      console.error('[FinishServiceForm] Erro ao salvar:', err);
      setGeneralError('Falha inesperada ao registrar finalização do serviço.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative flex flex-col justify-between w-full max-w-md mx-auto min-h-screen bg-[#F8FAFC] shadow-2xl">
      {/* 1. CABEÇALHO COM BOTÃO VOLTAR */}
      <header className="px-6 pt-5 pb-3 bg-white border-b border-[#E2E8F0] sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center justify-center w-10 h-10 -ml-2 rounded-xl text-[#0F172A] hover:bg-[#F1F5F9] active:bg-[#E2E8F0] transition-colors cursor-pointer"
            aria-label="Voltar"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-extrabold text-[#0F172A] tracking-tight">
              Finalizar Serviço
            </h1>
            <p className="text-xs font-medium text-[#64748B]">
              Etapa 2 de 2 • Check-out e Apontamento
            </p>
          </div>
        </div>
      </header>

      {/* 2. CONTEÚDO PRINCIPAL */}
      <main className="flex-1 px-6 pt-5 pb-8 space-y-6">
        {/* Banner de Erro Geral */}
        {generalError && (
          <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl flex items-start gap-3 animate-fade-in shadow-sm">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="text-xs leading-relaxed font-semibold">
              {generalError}
            </div>
          </div>
        )}

        {/* Card Fixo de Dados de Início (Apenas Leitura) */}
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Dados do Início (Fixos)
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
              Em andamento
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Máquina */}
            <div className="flex items-start gap-2.5">
              <div className="p-2 bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] text-[#0F172A] mt-0.5 shrink-0">
                <Truck className="w-4 h-4 text-[#F59E0B]" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-[#64748B]">Máquina</p>
                <p className="text-sm font-extrabold text-[#0F172A] truncate">
                  {activeLog.machine_name}
                </p>
              </div>
            </div>

            {/* Horímetro Inicial */}
            <div className="flex items-start gap-2.5">
              <div className="p-2 bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] text-[#0F172A] mt-0.5 shrink-0">
                <Clock className="w-4 h-4 text-[#F59E0B]" />
              </div>
              <div>
                <p className="text-[11px] font-medium text-[#64748B]">Horímetro Inicial</p>
                <p className="text-sm font-extrabold text-[#0F172A]">
                  {numStart.toFixed(1)}h
                </p>
              </div>
            </div>
          </div>

          {activeLog.started_at && (
            <div className="text-[11px] text-slate-500 pt-1 flex items-center justify-between">
              <span>Horário de início:</span>
              <strong className="text-slate-700 font-semibold">{formatStartTime(activeLog.started_at)}</strong>
            </div>
          )}
        </div>

        {/* Formulário de Conclusão */}
        <form id="finish-service-form" onSubmit={handleSubmit} className="space-y-4">
          
          {/* Horímetro Final */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="end_hours"
                className="flex items-center gap-1.5 text-xs font-bold text-[#0F172A] uppercase tracking-wider"
              >
                <Clock className="w-4 h-4 text-[#F59E0B]" />
                <span>Horímetro Final (h) *</span>
              </label>
              <span className="text-[11px] font-medium text-slate-500">
                Mínimo: {numStart.toFixed(1)}h
              </span>
            </div>

            <div className="relative">
              <input
                id="end_hours"
                type="number"
                step="0.1"
                min={numStart}
                placeholder={`Ex: ${(numStart + 4.5).toFixed(1)}`}
                value={endHours}
                onChange={(e) => {
                  setEndHours(e.target.value);
                  if (formErrors.end_hours) {
                    setFormErrors((prev) => ({ ...prev, end_hours: '' }));
                  }
                }}
                className={`w-full h-12 px-4 rounded-xl border bg-white text-base font-bold text-[#0F172A] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FBBF24] focus:border-transparent transition-all shadow-sm ${
                  formErrors.end_hours || isHorometerInvalid
                    ? 'border-rose-400 ring-1 ring-rose-400 bg-rose-50/20'
                    : 'border-[#CBD5E1]'
                }`}
                required
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                HORAS
              </span>
            </div>

            {formErrors.end_hours ? (
              <p className="text-xs font-medium text-rose-600 animate-fade-in">
                {formErrors.end_hours}
              </p>
            ) : isHorometerInvalid ? (
              <p className="text-xs font-medium text-rose-600 animate-fade-in">
                O horímetro final deve ser maior ou igual ao inicial ({numStart}h).
              </p>
            ) : null}
          </div>

          {/* Destaque Reativo: Horas Trabalhadas Calculadas */}
          <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200/80 rounded-2xl p-4 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-500 text-white flex items-center justify-center shadow-sm">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-emerald-800">
                  Horas Trabalhadas
                </p>
                <p className="text-[11px] text-emerald-600">
                  Cálculo automático (Final - Inicial)
                </p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-2xl font-black text-emerald-800 tracking-tight">
                {calculatedHours.toFixed(1)}h
              </span>
            </div>
          </div>

          {/* Cliente */}
          <div className="space-y-1.5">
            <label
              htmlFor="client_name"
              className="flex items-center gap-1.5 text-xs font-bold text-[#0F172A] uppercase tracking-wider"
            >
              <Users className="w-4 h-4 text-[#F59E0B]" />
              <span>Cliente / Obra *</span>
            </label>
            <input
              id="client_name"
              type="text"
              placeholder="Ex: Construtora Silva / Obra Fazenda Sul"
              value={clientName}
              onChange={(e) => {
                setClientName(e.target.value);
                if (formErrors.client_name) {
                  setFormErrors((prev) => ({ ...prev, client_name: '' }));
                }
              }}
              className={`w-full h-12 px-4 rounded-xl border bg-white text-base font-semibold text-[#0F172A] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FBBF24] focus:border-transparent transition-all shadow-sm ${
                formErrors.client_name ? 'border-rose-400 ring-1 ring-rose-400' : 'border-[#CBD5E1]'
              }`}
              required
            />
            {formErrors.client_name && (
              <p className="text-xs font-medium text-rose-600 animate-fade-in">
                {formErrors.client_name}
              </p>
            )}
          </div>

          {/* WhatsApp do Cliente */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="client_phone"
                className="flex items-center gap-1.5 text-xs font-bold text-[#0F172A] uppercase tracking-wider"
              >
                <Phone className="w-4 h-4 text-[#F59E0B]" />
                <span>WhatsApp do Cliente</span>
              </label>
              <span className="text-[11px] font-medium text-slate-400">
                Opcional
              </span>
            </div>
            <input
              id="client_phone"
              type="tel"
              placeholder="(00) 00000-0000"
              value={clientPhone}
              onChange={handlePhoneChange}
              className="w-full h-12 px-4 rounded-xl border border-[#CBD5E1] bg-white text-base font-semibold text-[#0F172A] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FBBF24] focus:border-transparent transition-all shadow-sm"
            />
            <p className="text-[11px] text-slate-500">
              Permite enviar o comprovante de serviço diretamente pelo WhatsApp ao cliente.
            </p>
          </div>

          {/* Data do Serviço */}
          <div className="space-y-1.5">
            <label
              htmlFor="service_date"
              className="flex items-center gap-1.5 text-xs font-bold text-[#0F172A] uppercase tracking-wider"
            >
              <Calendar className="w-4 h-4 text-[#F59E0B]" />
              <span>Data do Serviço *</span>
            </label>
            <input
              id="service_date"
              type="date"
              value={serviceDate}
              onChange={(e) => setServiceDate(e.target.value)}
              className="w-full h-12 px-4 rounded-xl border border-[#CBD5E1] bg-white text-base font-semibold text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#FBBF24] focus:border-transparent transition-all shadow-sm"
              required
            />
          </div>

          {/* Observações */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="observations"
                className="flex items-center gap-1.5 text-xs font-bold text-[#0F172A] uppercase tracking-wider"
              >
                <FileText className="w-4 h-4 text-[#F59E0B]" />
                <span>Observações</span>
              </label>
              <span className="text-[11px] font-medium text-slate-400">
                Opcional
              </span>
            </div>
            <textarea
              id="observations"
              rows={3}
              placeholder="Descreva detalhes como troca de óleo, tipo de solo ou paradas..."
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              className="w-full min-h-[90px] p-3 rounded-xl border border-[#CBD5E1] bg-white text-base font-medium text-[#0F172A] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FBBF24] focus:border-transparent transition-all shadow-sm resize-none"
            />
          </div>

        </form>
      </main>

      {/* 3. BOTÃO DE AÇÃO PRINCIPAL: CONCLUIR E ENVIAR APONTAMENTO */}
      <footer className="p-6 bg-white border-t border-[#E2E8F0] shadow-lg sticky bottom-0 z-20">
        <button
          form="finish-service-form"
          type="submit"
          disabled={isSubmitting || isHorometerInvalid}
          className="w-full h-14 bg-[#FBBF24] hover:bg-[#F59E0B] active:scale-[0.98] text-[#0F172A] font-extrabold text-base rounded-2xl shadow-md transition-all duration-200 flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin text-[#0F172A]" />
              <span>Concluindo serviço...</span>
            </>
          ) : (
            <>
              <div className="w-7 h-7 rounded-full bg-[#0F172A] text-[#FBBF24] flex items-center justify-center">
                <CheckCircle className="w-4 h-4 stroke-[2.5]" />
              </div>
              <span>Concluir e Enviar Apontamento</span>
            </>
          )}
        </button>
      </footer>
    </div>
  );
};

export default FinishServiceForm;
