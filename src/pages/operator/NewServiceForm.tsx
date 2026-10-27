import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import {
  getActiveMachines,
  calculateTotalHours,
  validateWorkLogInput,
  submitWorkLog,
  type WorkLogFormData,
} from '../../services/workLogService';
import type { Machine } from '../../types/database';
import {
  ArrowLeft,
  Truck,
  Clock,
  RotateCw,
  User,
  Building,
  Calendar,
  FileText,
  AlertCircle,
  Loader2,
  Phone,
} from 'lucide-react';

interface NewServiceFormProps {
  onBack: () => void;
  onSuccess: (data: WorkLogFormData) => void;
}

export const NewServiceForm: React.FC<NewServiceFormProps> = ({ onBack, onSuccess }) => {
  const { profile, user } = useAuth();
  const { isOnline } = useNetworkStatus();

  const [machines, setMachines] = useState<Machine[]>([]);
  const [selectedMachineId, setSelectedMachineId] = useState<string>('');
  const [selectedMachineName, setSelectedMachineName] = useState<string>('');

  const [startHours, setStartHours] = useState<string>('');
  const [endHours, setEndHours] = useState<string>('');
  const [operatorName, setOperatorName] = useState<string>(
    profile?.full_name || user?.user_metadata?.full_name || 'Operador'
  );
  const [clientName, setClientName] = useState<string>('');
  const [clientPhone, setClientPhone] = useState<string>('');
  const [serviceDate, setServiceDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [observations, setObservations] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);

  // Máscara amigável de telefone brasileiro: (XX) XXXXX-XXXX
  const formatPhoneMask = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 2) return digits ? `(${digits}` : '';
    if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
  };

  // Carrega máquinas ativas (sem mocks, exclusivamente do banco/Dexie)
  useEffect(() => {
    getActiveMachines(isOnline).then((loaded) => {
      setMachines(loaded);
      if (loaded.length > 0) {
        setSelectedMachineId(loaded[0].id);
        setSelectedMachineName(loaded[0].name);
        setStartHours(loaded[0].current_hours ? String(loaded[0].current_hours) : '0');
      } else {
        setSelectedMachineId('');
        setSelectedMachineName('');
        setStartHours('');
      }
    });
  }, [isOnline]);

  // Quando o operador troca de máquina, atualiza o horômetro inicial automaticamente
  const handleMachineChange = (machineId: string) => {
    setSelectedMachineId(machineId);
    const chosen = machines.find((m) => m.id === machineId);
    if (chosen) {
      setSelectedMachineName(chosen.name);
      setStartHours(chosen.current_hours ? String(chosen.current_hours) : '0');
    }
  };

  // Cálculo reativo das horas trabalhadas
  const numStart = parseFloat(startHours.replace(',', '.')) || 0;
  const numEnd = parseFloat(endHours.replace(',', '.')) || 0;
  const calculatedHours = calculateTotalHours(numStart, numEnd);
  const isHorometerInvalid = endHours !== '' && numEnd <= numStart;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);

    const formData: WorkLogFormData = {
      machine_id: selectedMachineId,
      machine_name: selectedMachineName || 'Retroescavadeira',
      operator_id: profile?.id || user?.id || 'op-offline',
      operator_name: operatorName.trim() || 'Operador',
      client_name: clientName.trim(),
      client_phone: clientPhone.trim() || undefined,
      service_date: serviceDate,
      start_hours: numStart,
      end_hours: numEnd,
      observations: observations.trim() || null,
    };

    // Validação estrita
    const validation = validateWorkLogInput(formData);
    if (!validation.isValid) {
      setFormErrors(validation.errors as Record<string, string>);
      return;
    }
    setFormErrors({});

    try {
      setIsSubmitting(true);
      const result = await submitWorkLog(formData, isOnline);

      if (result.success) {
        onSuccess(formData);
      } else {
        setGeneralError(result.error || 'Não foi possível salvar o serviço. Tente novamente.');
      }
    } catch (err) {
      console.error('[NewServiceForm] Erro ao submeter:', err);
      setGeneralError('Ocorreu um erro inesperado ao salvar o serviço.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative flex flex-col justify-between w-full max-w-md mx-auto min-h-screen bg-[#F8FAFC] shadow-2xl">
      
      {/* 1. TOPO: BOTÃO VOLTAR E TÍTULO CENTRAL */}
      <header className="w-full flex items-center justify-between px-6 pt-5 pb-4 bg-white border-b border-[#E2E8F0] sticky top-0 z-20">
        <button
          id="btn-back-home"
          type="button"
          onClick={onBack}
          className="w-10 h-10 -ml-2 rounded-full flex items-center justify-center text-[#0F172A] hover:bg-[#F1F5F9] active:scale-95 transition-all cursor-pointer"
          aria-label="Voltar"
        >
          <ArrowLeft className="w-5 h-5 stroke-[2.5]" />
        </button>

        <h1 className="text-lg font-bold text-[#0F172A] tracking-tight">
          Novo Serviço
        </h1>

        <div className="w-8"></div>
      </header>

      {/* 2. FORMULÁRIO DE APONTAMENTO */}
      <main className="flex-1 px-6 py-6 overflow-y-auto">
        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* Mensagem de Erro Geral */}
          {generalError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-center gap-2 animate-fade-in">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-600" />
              <span>{generalError}</span>
            </div>
          )}

          {/* Campo: Máquina */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#0F172A] flex items-center gap-1.5">
              <Truck className="w-4 h-4 text-[#64748B]" />
              Máquina
            </label>
            <div className="relative">
              <select
                id="select-machine"
                value={selectedMachineId}
                onChange={(e) => handleMachineChange(e.target.value)}
                className="w-full h-13 px-3.5 bg-white border border-[#E2E8F0] rounded-xl text-sm font-medium text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#FBBF24] focus:border-transparent transition-all appearance-none cursor-pointer"
              >
                {machines.length === 0 ? (
                  <option value="">Nenhuma máquina cadastrada</option>
                ) : (
                  machines.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.model})
                    </option>
                  ))
                )}
              </select>
              <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-[#64748B]">
                ▼
              </div>
            </div>
            {formErrors.machine_id && (
              <p className="text-[11px] text-red-600">{formErrors.machine_id}</p>
            )}
          </div>

          {/* Campo: Horímetro Inicial */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#0F172A] flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-[#64748B]" />
              Horímetro inicial
            </label>
            <input
              id="input-start-hours"
              type="text"
              inputMode="decimal"
              value={startHours}
              onChange={(e) => setStartHours(e.target.value)}
              placeholder="Ex: 1250"
              className="w-full h-13 px-3.5 bg-white border border-[#E2E8F0] rounded-xl text-sm font-medium text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#FBBF24] focus:border-transparent transition-all placeholder:text-[#94A3B8]"
            />
            {formErrors.start_hours && (
              <p className="text-[11px] text-red-600">{formErrors.start_hours}</p>
            )}
          </div>

          {/* Campo: Horímetro Final */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#0F172A] flex items-center gap-1.5">
              <RotateCw className="w-4 h-4 text-[#64748B]" />
              Horímetro final
            </label>
            <input
              id="input-end-hours"
              type="text"
              inputMode="decimal"
              value={endHours}
              onChange={(e) => setEndHours(e.target.value)}
              placeholder="Ex: 1258"
              className={`w-full h-13 px-3.5 bg-white border rounded-xl text-sm font-medium text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#FBBF24] focus:border-transparent transition-all placeholder:text-[#94A3B8] ${
                isHorometerInvalid ? 'border-amber-400 bg-amber-50/30' : 'border-[#E2E8F0]'
              }`}
            />
            {isHorometerInvalid && (
              <p className="text-[11px] text-amber-700 font-medium">
                O horímetro final deve ser maior que o inicial ({startHours || 0}).
              </p>
            )}
            {formErrors.end_hours && !isHorometerInvalid && (
              <p className="text-[11px] text-red-600">{formErrors.end_hours}</p>
            )}
          </div>

          {/* Destaque Dinâmico do Total Calculado */}
          {calculatedHours > 0 && (
            <div className="p-3 bg-white border border-[#CBD5E1] rounded-xl flex items-center justify-between text-xs font-bold text-[#0F172A] shadow-xs">
              <span className="text-[#64748B]">Total calculado:</span>
              <span className="text-sm px-2.5 py-0.5 rounded-lg bg-[#DCFCE7] text-[#166534]">
                {calculatedHours} {calculatedHours === 1 ? 'hora' : 'horas'}
              </span>
            </div>
          )}

          {/* Campo: Funcionário */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#0F172A] flex items-center gap-1.5">
              <User className="w-4 h-4 text-[#64748B]" />
              Funcionário
            </label>
            <input
              id="input-operator"
              type="text"
              value={operatorName}
              onChange={(e) => setOperatorName(e.target.value)}
              className="w-full h-13 px-3.5 bg-white border border-[#E2E8F0] rounded-xl text-sm font-medium text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#FBBF24] focus:border-transparent transition-all"
            />
          </div>

          {/* Campo: Cliente */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#0F172A] flex items-center gap-1.5">
              <Building className="w-4 h-4 text-[#64748B]" />
              Cliente
            </label>
            <input
              id="input-client"
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Ex: Construtora Alfa, Fazenda Boa Vista"
              className="w-full h-13 px-3.5 bg-white border border-[#E2E8F0] rounded-xl text-sm font-medium text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#FBBF24] focus:border-transparent transition-all placeholder:text-[#94A3B8]"
            />
            {formErrors.client_name && (
              <p className="text-[11px] text-red-600">{formErrors.client_name}</p>
            )}
          </div>

          {/* Campo: WhatsApp do Cliente (opcional) */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#0F172A] flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Phone className="w-4 h-4 text-emerald-600" />
                WhatsApp do Cliente (opcional)
              </span>
              <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                Cobrança Direta
              </span>
            </label>
            <input
              id="input-client-phone"
              type="tel"
              inputMode="tel"
              value={clientPhone}
              onChange={(e) => setClientPhone(formatPhoneMask(e.target.value))}
              placeholder="Ex: (35) 99999-9999"
              className="w-full h-13 px-3.5 bg-white border border-[#E2E8F0] rounded-xl text-sm font-medium text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#FBBF24] focus:border-transparent transition-all placeholder:text-[#94A3B8]"
            />
          </div>

          {/* Campo: Data do serviço */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#0F172A] flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-[#64748B]" />
              Data do serviço
            </label>
            <input
              id="input-service-date"
              type="date"
              value={serviceDate}
              onChange={(e) => setServiceDate(e.target.value)}
              className="w-full h-13 px-3.5 bg-white border border-[#E2E8F0] rounded-xl text-sm font-medium text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#FBBF24] focus:border-transparent transition-all"
            />
          </div>

          {/* Campo: Observações (opcional) */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#0F172A] flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-[#64748B]" />
              Observações (opcional)
            </label>
            <textarea
              id="textarea-observations"
              rows={3}
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              placeholder="Ex: Serviço de limpeza de terreno."
              className="w-full p-3.5 bg-white border border-[#E2E8F0] rounded-xl text-sm font-medium text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#FBBF24] focus:border-transparent transition-all placeholder:text-[#94A3B8] resize-none"
            />
          </div>

          <div className="pt-2"></div>
        </form>
      </main>

      {/* 3. RODAPÉ: BOTÃO SALVAR SERVIÇO */}
      <footer className="p-6 bg-white border-t border-[#E2E8F0] sticky bottom-0 z-20">
        <button
          id="btn-submit-service"
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting || isHorometerInvalid}
          className="w-full h-14 bg-[#0F172A] hover:bg-[#1E293B] active:scale-[0.98] text-white font-bold text-base rounded-2xl shadow-sm transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin text-[#FBBF24]" />
              <span>Salvando Serviço...</span>
            </>
          ) : (
            <span>Salvar Serviço</span>
          )}
        </button>
      </footer>
    </div>
  );
};

export default NewServiceForm;
