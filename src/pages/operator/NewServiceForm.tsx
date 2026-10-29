import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import {
  getActiveMachines,
  startWorkLog,
  type StartServiceFormData,
} from '../../services/workLogService';
import type { Machine } from '../../types/database';
import {
  ArrowLeft,
  Truck,
  Clock,
  Play,
  AlertCircle,
  Loader2,
  CheckCircle2,
} from 'lucide-react';

interface NewServiceFormProps {
  onBack: () => void;
  onSuccess: () => void;
}

export const NewServiceForm: React.FC<NewServiceFormProps> = ({ onBack, onSuccess }) => {
  const { profile, user } = useAuth();
  const { isOnline } = useNetworkStatus();

  const [machines, setMachines] = useState<Machine[]>([]);
  const [selectedMachineId, setSelectedMachineId] = useState<string>('');
  const [selectedMachineName, setSelectedMachineName] = useState<string>('');
  const [startHours, setStartHours] = useState<string>('');
  const [isLoadingMachines, setIsLoadingMachines] = useState<boolean>(true);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Carrega máquinas ativas do Supabase ou do cache local Dexie
  useEffect(() => {
    setIsLoadingMachines(true);
    getActiveMachines(isOnline)
      .then((loaded) => {
        setMachines(loaded);
        if (loaded.length > 0) {
          setSelectedMachineId(loaded[0].id);
          setSelectedMachineName(loaded[0].name);
          setStartHours(loaded[0].current_hours !== undefined ? String(loaded[0].current_hours) : '0');
        }
      })
      .catch((err) => {
        console.error('[NewServiceForm] Erro ao carregar máquinas:', err);
      })
      .finally(() => {
        setIsLoadingMachines(false);
      });
  }, [isOnline]);

  // Atualiza o horômetro inicial ao trocar a máquina
  const handleMachineChange = (machineId: string) => {
    setSelectedMachineId(machineId);
    const chosen = machines.find((m) => m.id === machineId);
    if (chosen) {
      setSelectedMachineName(chosen.name);
      setStartHours(chosen.current_hours !== undefined ? String(chosen.current_hours) : '0');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const numStart = parseFloat(startHours.replace(',', '.'));
    if (!selectedMachineId) {
      setErrorMessage('Por favor, selecione uma máquina.');
      return;
    }

    if (isNaN(numStart) || numStart < 0) {
      setErrorMessage('Informe um horímetro inicial válido.');
      return;
    }

    const operatorId = profile?.id || user?.id || '';
    const operatorName = profile?.full_name || user?.user_metadata?.full_name || 'Operador';

    if (!operatorId) {
      setErrorMessage('Sessão expirada. Faça login novamente para iniciar o serviço.');
      return;
    }

    const payload: StartServiceFormData = {
      machine_id: selectedMachineId,
      machine_name: selectedMachineName || 'Retroescavadeira',
      operator_id: operatorId,
      operator_name: operatorName,
      start_hours: numStart,
    };

    setIsSubmitting(true);
    try {
      const result = await startWorkLog(payload, isOnline);
      if (result.success) {
        onSuccess();
      } else {
        setErrorMessage(result.error || 'Falha ao iniciar o serviço. Tente novamente.');
      }
    } catch (err) {
      console.error('[NewServiceForm] Falha ao iniciar serviço:', err);
      setErrorMessage('Erro inesperado ao salvar início do serviço.');
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
              Iniciar Serviço
            </h1>
            <p className="text-xs font-medium text-[#64748B]">
              Etapa 1 de 2 • Check-in Operacional
            </p>
          </div>
        </div>
      </header>

      {/* 2. FORMULÁRIO ENXUTO */}
      <main className="flex-1 px-6 pt-6 pb-8 space-y-6">
        {/* Banner de Erro Geral */}
        {errorMessage && (
          <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl flex items-start gap-3 animate-fade-in shadow-sm">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="text-xs leading-relaxed font-semibold">
              {errorMessage}
            </div>
          </div>
        )}

        {/* Card Informativo com Dica */}
        <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-4 text-[#92400E] flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs leading-relaxed">
            Selecione o equipamento e confira o <strong>horímetro inicial</strong>. Os detalhes do cliente e horas trabalhadas serão preenchidos ao finalizar o serviço.
          </p>
        </div>

        <form id="start-service-form" onSubmit={handleSubmit} className="space-y-5">
          {/* Campo 1: Máquina */}
          <div className="space-y-1.5">
            <label
              htmlFor="machine_id"
              className="flex items-center gap-1.5 text-xs font-bold text-[#0F172A] uppercase tracking-wider"
            >
              <Truck className="w-4 h-4 text-[#F59E0B]" />
              <span>Máquina *</span>
            </label>

            {isLoadingMachines ? (
              <div className="w-full h-12 bg-white border border-[#E2E8F0] rounded-xl flex items-center px-4 gap-2 text-slate-400 text-sm">
                <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                <span>Carregando máquinas disponíveis...</span>
              </div>
            ) : machines.length === 0 ? (
              <div className="w-full p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs">
                Nenhuma máquina ativa cadastrada no momento.
              </div>
            ) : (
              <div className="relative">
                <select
                  id="machine_id"
                  value={selectedMachineId}
                  onChange={(e) => handleMachineChange(e.target.value)}
                  className="w-full h-12 px-4 rounded-xl border border-[#CBD5E1] bg-white text-base font-semibold text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#FBBF24] focus:border-transparent transition-all shadow-sm appearance-none cursor-pointer"
                  required
                >
                  {machines.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} {m.model ? `(${m.model})` : ''}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-[#64748B]">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            )}
          </div>

          {/* Campo 2: Horímetro Inicial */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="start_hours"
                className="flex items-center gap-1.5 text-xs font-bold text-[#0F172A] uppercase tracking-wider"
              >
                <Clock className="w-4 h-4 text-[#F59E0B]" />
                <span>Horímetro Inicial (h) *</span>
              </label>
              <span className="text-[11px] font-medium text-slate-500">
                Valor do painel
              </span>
            </div>

            <div className="relative">
              <input
                id="start_hours"
                type="number"
                step="0.1"
                min="0"
                placeholder="Ex: 1450.5"
                value={startHours}
                onChange={(e) => setStartHours(e.target.value)}
                className="w-full h-12 px-4 rounded-xl border border-[#CBD5E1] bg-white text-base font-bold text-[#0F172A] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FBBF24] focus:border-transparent transition-all shadow-sm"
                required
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                HORAS
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              O sistema preenche automaticamente com o último horímetro registrado. Ajuste se necessário.
            </p>
          </div>
        </form>
      </main>

      {/* 3. BOTÃO PRINCIPAL FIXO NO RODAPÉ: "INICIAR SERVIÇO" */}
      <footer className="p-6 bg-white border-t border-[#E2E8F0] shadow-lg sticky bottom-0 z-20">
        <button
          form="start-service-form"
          type="submit"
          disabled={isSubmitting || isLoadingMachines || machines.length === 0}
          className="w-full h-14 bg-[#FBBF24] hover:bg-[#F59E0B] active:scale-[0.98] text-[#0F172A] font-extrabold text-base rounded-2xl shadow-md transition-all duration-200 flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin text-[#0F172A]" />
              <span>Iniciando serviço...</span>
            </>
          ) : (
            <>
              <div className="w-7 h-7 rounded-full bg-[#0F172A] text-[#FBBF24] flex items-center justify-center">
                <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
              </div>
              <span>Iniciar Serviço</span>
            </>
          )}
        </button>
      </footer>
    </div>
  );
};

export default NewServiceForm;
