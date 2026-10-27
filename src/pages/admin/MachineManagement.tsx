import React, { useState, useEffect } from 'react';
import {
  fetchMachines,
  saveMachine,
} from '../../services/adminService';
import type { Machine } from '../../types/database';
import {
  ArrowLeft,
  Truck,
  Plus,
  Edit2,
  Clock,
  DollarSign,
  CheckCircle2,
  XCircle,
  Loader2,
  X,
  AlertTriangle,
} from 'lucide-react';

interface MachineManagementProps {
  onBack: () => void;
}

export const MachineManagement: React.FC<MachineManagementProps> = ({ onBack }) => {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Modal de edição / criação
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingMachine, setEditingMachine] = useState<Partial<Machine> | null>(null);
  const [formName, setFormName] = useState<string>('');
  const [formModel, setFormModel] = useState<string>('');
  const [formRate, setFormRate] = useState<string>('0');
  const [formHours, setFormHours] = useState<string>('0');
  const [formActive, setFormActive] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Feedback de erro / sucesso
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadAllMachines = async () => {
    setIsLoading(true);
    const data = await fetchMachines();
    setMachines(data);
    setIsLoading(false);
  };

  useEffect(() => {
    loadAllMachines();
  }, []);

  const openNewMachineModal = () => {
    setEditingMachine(null);
    setFormName('');
    setFormModel('');
    setFormRate('0');
    setFormHours('0');
    setFormActive(true);
    setErrorMessage(null);
    setIsModalOpen(true);
  };

  const openEditMachineModal = (m: Machine) => {
    setEditingMachine(m);
    setFormName(m.name);
    setFormModel(m.model);
    setFormRate(String(m.hourly_rate));
    setFormHours(String(m.current_hours));
    setFormActive(m.active);
    setErrorMessage(null);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || isSaving) return;

    setIsSaving(true);
    setErrorMessage(null);

    const result = await saveMachine({
      id: editingMachine?.id,
      name: formName.trim(),
      model: formModel.trim() || 'Padrão',
      hourly_rate: parseFloat(formRate.replace(',', '.')) || 0,
      current_hours: parseFloat(formHours.replace(',', '.')) || 0,
      active: formActive,
    });

    setIsSaving(false);

    if (result.success) {
      setIsModalOpen(false);
      setSuccessMessage('Máquina salva com sucesso!');
      setTimeout(() => setSuccessMessage(null), 4000);
      await loadAllMachines();
    } else {
      const msg = result.error || 'Erro ao salvar máquina no Supabase.';
      setErrorMessage(msg);
    }
  };

  return (
    <div className="relative flex flex-col justify-between w-full max-w-md mx-auto min-h-screen bg-[#F8FAFC] shadow-2xl pb-10">
      
      {/* Toast de Sucesso Flutuante */}
      {successMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 bg-emerald-600 text-white text-xs font-bold rounded-xl shadow-lg flex items-center gap-2 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-white" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* 1. TOPO: CABEÇALHO */}
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
            Gestão de Máquinas
          </h1>
        </div>

        <button
          id="btn-add-machine"
          type="button"
          onClick={openNewMachineModal}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FBBF24] hover:bg-[#F59E0B] text-[#0F172A] font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>Nova</span>
        </button>
      </header>

      {/* 2. LISTA DE MÁQUINAS */}
      <main className="flex-1 px-6 py-5 space-y-3">
        {isLoading ? (
          <div className="py-12 text-center text-xs font-semibold text-[#64748B]">
            Carregando máquinas...
          </div>
        ) : machines.length === 0 ? (
          <div className="py-12 text-center bg-white border border-[#E2E8F0] rounded-2xl p-6">
            <p className="text-sm font-bold text-[#0F172A]">Nenhuma máquina cadastrada</p>
            <p className="text-xs text-[#64748B] mt-1">
              Clique em &quot;Nova Máquina&quot; acima para começar.
            </p>
          </div>
        ) : (
          machines.map((machine) => (
            <div
              key={machine.id}
              className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-xs flex items-center justify-between hover:border-[#CBD5E1] transition-all"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-11 h-11 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] flex items-center justify-center text-[#0F172A] flex-shrink-0">
                  <Truck className="w-5 h-5 text-[#0F172A]" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-[#0F172A] truncate">
                      {machine.name}
                    </p>
                    {machine.active ? (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-700 font-bold bg-[#DCFCE7] px-2 py-0.2 rounded-full">
                        <CheckCircle2 className="w-2.5 h-2.5" /> Ativa
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-500 font-bold bg-slate-100 px-2 py-0.2 rounded-full">
                        <XCircle className="w-2.5 h-2.5" /> Inativa
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#64748B] truncate mt-0.5">
                    {machine.model}
                  </p>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-[#0F172A]">
                    <span className="flex items-center gap-1 font-semibold text-[11px] text-[#64748B]">
                      <Clock className="w-3.5 h-3.5 text-[#F59E0B]" />
                      {machine.current_hours}h
                    </span>
                    <span className="flex items-center gap-1 font-bold text-[11px] text-[#0F172A]">
                      <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                      R$ {machine.hourly_rate?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/h
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => openEditMachineModal(machine)}
                className="w-9 h-9 rounded-xl border border-[#E2E8F0] hover:bg-[#F8FAFC] flex items-center justify-center text-[#64748B] hover:text-[#0F172A] transition-all cursor-pointer flex-shrink-0 ml-2"
                title="Editar máquina"
              >
                <Edit2 className="w-4 h-4 stroke-[2]" />
              </button>
            </div>
          ))
        )}
      </main>

      {/* 3. MODAL DE CADASTRO / EDIÇÃO DE MÁQUINA */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-extrabold text-[#0F172A]">
                {editingMachine ? 'Editar Máquina' : 'Nova Máquina'}
              </h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-[#64748B] hover:bg-[#F1F5F9] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Alerta de erro da API Supabase */}
            {errorMessage && (
              <div
                role="alert"
                className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2 animate-fade-in"
              >
                <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-bold">Erro ao salvar máquina</p>
                  <p className="mt-0.5 break-words font-mono text-[11px]">{errorMessage}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setErrorMessage(null)}
                  className="text-red-400 hover:text-red-700 cursor-pointer"
                  aria-label="Fechar alerta"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-xs font-bold text-[#0F172A]">Nome da Máquina</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Ex: Retroescavadeira 04"
                  className="w-full h-11 px-3.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl text-sm font-medium text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-[#0F172A]">Modelo / Fabricante</label>
                <input
                  type="text"
                  value={formModel}
                  onChange={(e) => setFormModel(e.target.value)}
                  placeholder="Ex: Caterpillar 416F2"
                  className="w-full h-11 px-3.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl text-sm font-medium text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#0F172A]">Valor por hora (R$)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={formRate}
                    onChange={(e) => setFormRate(e.target.value)}
                    placeholder="160.00"
                    className="w-full h-11 px-3.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl text-sm font-medium text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#0F172A]">Horímetro Atual</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={formHours}
                    onChange={(e) => setFormHours(e.target.value)}
                    placeholder="1250"
                    className="w-full h-11 px-3.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl text-sm font-medium text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="chk-active"
                  checked={formActive}
                  onChange={(e) => setFormActive(e.target.checked)}
                  className="w-4 h-4 rounded text-[#F59E0B] focus:ring-[#FBBF24] cursor-pointer"
                />
                <label htmlFor="chk-active" className="text-xs font-bold text-[#0F172A] cursor-pointer">
                  Máquina ativa para operação
                </label>
              </div>

              <div className="pt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 h-12 bg-white border border-[#E2E8F0] text-[#64748B] hover:text-[#0F172A] font-bold text-xs rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 h-12 bg-[#0F172A] hover:bg-[#1E293B] text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin text-[#FBBF24]" /> : 'Salvar Máquina'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default MachineManagement;
