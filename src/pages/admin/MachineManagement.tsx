import React, { useState, useEffect, useMemo } from 'react';
import {
  fetchMachines,
  saveMachine,
  fetchAdminClients,
  saveAdminClient,
  deleteAdminClient,
} from '../../services/adminService';
import type { Machine, Client, BillingUnit } from '../../types/database';
import { applyPhoneMask } from '../../utils/formatters';
import { AdminBottomNav } from '../../components/AdminBottomNav';
import {
  ArrowLeft,
  Truck,
  Users,
  User,
  Plus,
  Edit2,
  Clock,
  DollarSign,
  CheckCircle2,
  XCircle,
  Loader2,
  X,
  AlertTriangle,
  Search,
  MessageCircle,
  Trash2,
  Phone,
} from 'lucide-react';

export interface MachineManagementProps {
  onBack: () => void;
  onNavigateToDashboard?: () => void;
  onNavigateToServices?: () => void;
  onNavigateToFinancial?: () => void;
  onNavigateToAgenda?: () => void;
}

type ManagementTab = 'machines' | 'clients';

export const MachineManagement: React.FC<MachineManagementProps> = ({
  onBack,
  onNavigateToDashboard,
  onNavigateToServices,
  onNavigateToFinancial,
  onNavigateToAgenda,
}) => {
  const [activeSection, setActiveSection] = useState<ManagementTab>('machines');

  // Estados de Máquinas
  const [machines, setMachines] = useState<Machine[]>([]);
  const [isLoadingMachines, setIsLoadingMachines] = useState<boolean>(true);

  // Estados de Clientes (Meus Clientes)
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoadingClients, setIsLoadingClients] = useState<boolean>(true);
  const [clientSearch, setClientSearch] = useState<string>('');

  // Modal de Máquina (Edição / Criação)
  const [isMachineModalOpen, setIsMachineModalOpen] = useState<boolean>(false);
  const [editingMachine, setEditingMachine] = useState<Partial<Machine> | null>(null);
  const [formName, setFormName] = useState<string>('');
  const [formModel, setFormModel] = useState<string>('');
  const [formRate, setFormRate] = useState<string>('0');
  const [formHours, setFormHours] = useState<string>('0');
  const [formBillingUnit, setFormBillingUnit] = useState<BillingUnit>('hour');
  const [formActive, setFormActive] = useState<boolean>(true);
  const [isSavingMachine, setIsSavingMachine] = useState<boolean>(false);

  // Modal de Cliente (Novo / Editar)
  const [isClientModalOpen, setIsClientModalOpen] = useState<boolean>(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [clientNameInput, setClientNameInput] = useState<string>('');
  const [clientPhoneInput, setClientPhoneInput] = useState<string>('');
  const [isSavingClient, setIsSavingClient] = useState<boolean>(false);

  // Modal de Confirmação de Exclusão de Cliente
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
  const [isDeletingClient, setIsDeletingClient] = useState<boolean>(false);

  // Feedback de erro / sucesso
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => {
      setSuccessMessage((prev) => (prev === msg ? null : prev));
    }, 3800);
  };

  const loadAllMachines = async () => {
    setIsLoadingMachines(true);
    const data = await fetchMachines();
    setMachines(data);
    setIsLoadingMachines(false);
  };

  const loadAllClients = async () => {
    setIsLoadingClients(true);
    const data = await fetchAdminClients();
    setClients(data);
    setIsLoadingClients(false);
  };

  useEffect(() => {
    loadAllMachines();
    loadAllClients();
  }, []);

  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.phone && c.phone.toLowerCase().includes(q))
    );
  }, [clients, clientSearch]);

  // --- Handlers de Máquinas ---
  const openNewMachineModal = () => {
    setEditingMachine(null);
    setFormName('');
    setFormModel('');
    setFormRate('0');
    setFormHours('0');
    setFormBillingUnit('hour');
    setFormActive(true);
    setErrorMessage(null);
    setIsMachineModalOpen(true);
  };

  const openEditMachineModal = (m: Machine) => {
    setEditingMachine(m);
    setFormName(m.name);
    setFormModel(m.model);
    setFormRate(String(m.hourly_rate));
    setFormHours(String(m.current_hours));
    setFormBillingUnit(m.billing_unit === 'km' ? 'km' : 'hour');
    setFormActive(m.active);
    setErrorMessage(null);
    setIsMachineModalOpen(true);
  };

  const handleSaveMachine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || isSavingMachine) return;

    setIsSavingMachine(true);
    setErrorMessage(null);

    const result = await saveMachine({
      id: editingMachine?.id,
      name: formName.trim(),
      model: formModel.trim() || 'Padrão',
      hourly_rate: parseFloat(formRate.replace(',', '.')) || 0,
      current_hours: parseFloat(formHours.replace(',', '.')) || 0,
      billing_unit: formBillingUnit,
      active: formActive,
    });

    setIsSavingMachine(false);

    if (result.success) {
      setIsMachineModalOpen(false);
      showSuccess('Máquina salva com sucesso!');
      await loadAllMachines();
    } else {
      const msg = result.error || 'Erro ao salvar máquina no Supabase.';
      setErrorMessage(msg);
    }
  };

  // --- Handlers de Clientes ---
  const openNewClientModal = () => {
    setEditingClient(null);
    setClientNameInput('');
    setClientPhoneInput('');
    setErrorMessage(null);
    setIsClientModalOpen(true);
  };

  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientNameInput.trim() || isSavingClient) return;

    setIsSavingClient(true);
    setErrorMessage(null);

    const result = await saveAdminClient({
      id: editingClient?.id,
      name: clientNameInput.trim(),
      phone: clientPhoneInput.trim() || null,
    });

    setIsSavingClient(false);

    if (result.success) {
      setIsClientModalOpen(false);
      showSuccess('Cliente salvo com sucesso!');
      await loadAllClients();
    } else {
      setErrorMessage(result.error || 'Erro ao salvar cliente.');
    }
  };

  const handleWhatsAppClient = (client: Client) => {
    const rawDigits = (client.phone || '').replace(/\D/g, '');
    const message = `Olá *${client.name}*! Tudo bem?`;
    const encoded = encodeURIComponent(message);

    if (rawDigits.length >= 10) {
      const fullPhone = rawDigits.startsWith('55') ? rawDigits : `55${rawDigits}`;
      window.open(`https://wa.me/${fullPhone}?text=${encoded}`, '_blank');
    } else {
      window.open(`https://wa.me/?text=${encoded}`, '_blank');
    }
  };

  const handleConfirmDeleteClient = async () => {
    if (!clientToDelete || isDeletingClient) return;

    setIsDeletingClient(true);
    const target = clientToDelete;
    // Remoção otimista imediata na UI
    setClients((prev) =>
      prev.filter(
        (c) =>
          c.id !== target.id &&
          c.name.trim().toLowerCase() !== target.name.trim().toLowerCase()
      )
    );

    const res = await deleteAdminClient({ id: target.id, name: target.name });
    setIsDeletingClient(false);
    setClientToDelete(null);

    if (res.success) {
      showSuccess('Cliente removido!');
      await loadAllClients();
    } else {
      await loadAllClients();
    }
  };

  return (
    <div className="relative flex flex-col justify-between w-full max-w-md mx-auto min-h-screen overflow-x-hidden bg-[#F8FAFC] shadow-2xl pb-24">
      {/* Toast de Sucesso Flutuante */}
      {successMessage && (
        <div
          role="status"
          className="fixed top-[max(1rem,env(safe-area-inset-top))] left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 bg-emerald-600 text-white text-xs font-bold rounded-xl shadow-lg flex items-center gap-2 animate-fade-in"
        >
          <CheckCircle2 className="w-4 h-4 text-white shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* 1. TOPO: CABEÇALHO E SEGMENTED CONTROL ("Máquinas" vs "Meus Clientes") */}
      <header className="px-4 sm:px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3 bg-white border-b border-[#E2E8F0] sticky top-0 z-20 space-y-3">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={onBack}
              className="w-9 h-9 -ml-1.5 rounded-full flex items-center justify-center text-[#0F172A] hover:bg-[#F1F5F9] active:scale-95 transition-all cursor-pointer shrink-0"
              aria-label="Voltar"
            >
              <ArrowLeft className="w-5 h-5 stroke-[2.5]" />
            </button>
            <h1 className="text-base sm:text-lg font-extrabold text-[#0F172A] tracking-tight truncate">
              {activeSection === 'machines' ? 'Gestão de Máquinas' : 'Meus Clientes'}
            </h1>
          </div>

          {activeSection === 'machines' ? (
            <button
              id="btn-add-machine"
              type="button"
              onClick={openNewMachineModal}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FBBF24] hover:bg-[#F59E0B] text-[#0F172A] font-extrabold text-xs rounded-xl shadow-xs transition-all cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>+ Nova</span>
            </button>
          ) : (
            <button
              id="btn-add-client"
              type="button"
              onClick={openNewClientModal}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FBBF24] hover:bg-[#F59E0B] text-[#0F172A] font-extrabold text-xs rounded-xl shadow-xs transition-all cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>+ Novo Cliente</span>
            </button>
          )}
        </div>

        {/* Segmented Control: Máquinas | Meus Clientes */}
        <div
          role="tablist"
          aria-label="Seções de gestão"
          className="grid grid-cols-2 w-full bg-[#F1F5F9] p-1 rounded-xl border border-[#E2E8F0]"
        >
          <button
            id="tab-section-machines"
            type="button"
            role="tab"
            aria-selected={activeSection === 'machines'}
            onClick={() => setActiveSection('machines')}
            className={`w-full py-1.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeSection === 'machines'
                ? 'bg-white text-[#0F172A] shadow-2xs'
                : 'text-[#64748B] hover:text-[#0F172A]'
            }`}
          >
            <Truck className="w-3.5 h-3.5 text-[#F59E0B] shrink-0" />
            <span className="truncate">Máquinas</span>
          </button>

          <button
            id="tab-section-clients"
            type="button"
            role="tab"
            aria-selected={activeSection === 'clients'}
            onClick={() => setActiveSection('clients')}
            className={`w-full py-1.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeSection === 'clients'
                ? 'bg-white text-[#0F172A] shadow-2xs'
                : 'text-[#64748B] hover:text-[#0F172A]'
            }`}
          >
            <Users className="w-3.5 h-3.5 text-[#F59E0B] shrink-0" />
            <span className="truncate">Meus Clientes</span>
          </button>
        </div>

        {/* Barra de busca rápida quando a aba "Meus Clientes" estiver ativa */}
        {activeSection === 'clients' && (
          <div className="relative">
            <Search className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="input-search-clients"
              type="text"
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              placeholder="Buscar cliente por nome ou telefone..."
              className="w-full h-10 pl-9 pr-8 bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl text-xs font-semibold text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
            />
            {clientSearch && (
              <button
                type="button"
                onClick={() => setClientSearch('')}
                aria-label="Limpar busca"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-[10px] hover:bg-slate-300 cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>
        )}
      </header>

      {/* 2. CONTEÚDO PRINCIPAL: MÁQUINAS OU MEUS CLIENTES */}
      <main className="flex-1 px-4 sm:px-5 py-4 space-y-2.5 w-full overflow-hidden">
        {activeSection === 'machines' ? (
          isLoadingMachines ? (
            <div className="py-12 text-center text-xs font-semibold text-[#64748B] flex flex-col items-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-[#FBBF24]" />
              <span>Carregando máquinas...</span>
            </div>
          ) : machines.length === 0 ? (
            <div className="py-10 text-center bg-white border border-[#E2E8F0] rounded-2xl p-6 space-y-3">
              <div className="w-11 h-11 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center mx-auto">
                <Truck className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-[#0F172A]">
                  Nenhum item cadastrado ainda
                </p>
                <p className="text-xs text-[#64748B] mt-1">
                  Nenhuma máquina cadastrada. Adicione a primeira máquina para iniciar os registros.
                </p>
              </div>
              <button
                type="button"
                onClick={openNewMachineModal}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-[#FBBF24] hover:bg-[#F59E0B] text-[#0F172A] font-extrabold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>+ Cadastrar Máquina</span>
              </button>
            </div>
          ) : (
            machines.map((machine) => (
              <div
                key={machine.id}
                className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-xs flex items-center justify-between hover:border-[#CBD5E1] transition-all"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-11 h-11 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] flex items-center justify-center text-[#0F172A] shrink-0">
                    <Truck className="w-5 h-5 text-[#0F172A]" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-[#0F172A] truncate">
                        {machine.name}
                      </p>
                      {machine.billing_unit === 'km' && (
                        <span className="inline-flex items-center text-[10px] text-amber-800 font-extrabold bg-[#FEF3C7] border border-[#FDE68A] px-2 py-0.5 rounded-full shrink-0">
                          Guincho • KM
                        </span>
                      )}
                      {machine.active ? (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-700 font-bold bg-[#DCFCE7] px-2 py-0.5 rounded-full shrink-0">
                          <CheckCircle2 className="w-2.5 h-2.5" /> Ativa
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-500 font-bold bg-slate-100 px-2 py-0.5 rounded-full shrink-0">
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
                        {machine.billing_unit === 'km' ? `${machine.current_hours} km` : `${machine.current_hours}h`}
                      </span>
                      <span className="flex items-center gap-1 font-bold text-[11px] text-[#0F172A]">
                        <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                        R${' '}
                        {machine.hourly_rate?.toLocaleString('pt-BR', {
                          minimumFractionDigits: 2,
                        })}
                        {machine.billing_unit === 'km' ? '/km' : '/h'}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => openEditMachineModal(machine)}
                  className="w-9 h-9 rounded-xl border border-[#E2E8F0] hover:bg-[#F8FAFC] flex items-center justify-center text-[#64748B] hover:text-[#0F172A] transition-all cursor-pointer shrink-0 ml-2"
                  title="Editar máquina"
                >
                  <Edit2 className="w-4 h-4 stroke-[2]" />
                </button>
              </div>
            ))
          )
        ) : /* =========================================================
           * ABA 2: MEUS CLIENTES (CONSOLIDADO DE CLIENTS + HISTÓRICO)
           * ========================================================= */
        isLoadingClients ? (
          <div className="py-12 text-center text-xs font-semibold text-[#64748B] flex flex-col items-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-[#FBBF24]" />
            <span>Carregando lista de clientes...</span>
          </div>
        ) : filteredClients.length === 0 ? (
          <div className="py-10 text-center bg-white border border-[#E2E8F0] rounded-2xl p-6 space-y-3">
            <div className="w-11 h-11 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center mx-auto">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-[#0F172A]">
                {clientSearch ? 'Nenhum cliente encontrado' : 'Nenhum item cadastrado ainda'}
              </p>
              <p className="text-xs text-[#64748B] mt-1">
                {clientSearch
                  ? 'Tente outro termo de busca.'
                  : 'Nenhum cliente cadastrado. Adicione um cliente ou registre serviços.'}
              </p>
            </div>
            {!clientSearch && (
              <button
                type="button"
                onClick={openNewClientModal}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-[#FBBF24] hover:bg-[#F59E0B] text-[#0F172A] font-extrabold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>+ Cadastrar Cliente</span>
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1 pb-0.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
                Clientes Consolidados
              </span>
              <span className="text-[11px] font-semibold text-[#64748B]">
                {filteredClients.length}{' '}
                {filteredClients.length === 1 ? 'cliente' : 'clientes'}
              </span>
            </div>

            {filteredClients.map((client) => (
              <div
                key={client.id}
                className="bg-white border border-[#E2E8F0] rounded-2xl p-3.5 shadow-2xs flex items-center justify-between gap-3 hover:border-[#CBD5E1] transition-all"
              >
                {/* Esquerda: Ícone circular suave + Nome + Telefone */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200/80 flex items-center justify-center text-slate-600 shrink-0">
                    <User className="w-4 h-4 text-slate-600" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900 text-sm truncate">
                      {client.name}
                    </p>
                    <p className="text-xs text-slate-500 truncate mt-0.5">
                      {client.phone ? applyPhoneMask(client.phone) : 'Sem WhatsApp cadastrado'}
                    </p>
                  </div>
                </div>

                {/* Direita: Ações Rápidas (WhatsApp + Lixeira) */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleWhatsAppClient(client)}
                    title="Conversar no WhatsApp"
                    aria-label={`Conversar no WhatsApp com ${client.name}`}
                    className="w-9 h-9 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 flex items-center justify-center transition-all cursor-pointer active:scale-95"
                  >
                    <MessageCircle className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setClientToDelete(client)}
                    title="Excluir cliente"
                    aria-label={`Excluir cliente ${client.name}`}
                    className="w-9 h-9 rounded-xl bg-white hover:bg-red-50 border border-slate-200 hover:border-red-200 text-slate-400 hover:text-red-600 flex items-center justify-center transition-all cursor-pointer active:scale-95"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* 3. MODAL DE CADASTRO / EDIÇÃO DE MÁQUINA */}
      {isMachineModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-extrabold text-[#0F172A]">
                {editingMachine ? 'Editar Máquina' : 'Nova Máquina'}
              </h2>
              <button
                type="button"
                onClick={() => setIsMachineModalOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-[#64748B] hover:bg-[#F1F5F9] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMessage && (
              <div
                role="alert"
                className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2 animate-fade-in"
              >
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
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

            <form onSubmit={handleSaveMachine} className="space-y-3.5">
              {/* Seletor da Modalidade de Cobrança: Hora vs KM */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#0F172A] block">
                  Modalidade de Cobrança
                </label>
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#F1F5F9] rounded-xl border border-[#CBD5E1]">
                  <button
                    type="button"
                    onClick={() => setFormBillingUnit('hour')}
                    className={`h-9 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      formBillingUnit === 'hour'
                        ? 'bg-white text-[#0F172A] shadow-xs'
                        : 'text-[#64748B] hover:text-[#0F172A]'
                    }`}
                  >
                    <span>⏱️ Por Hora (R$/h)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormBillingUnit('km')}
                    className={`h-9 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      formBillingUnit === 'km'
                        ? 'bg-white text-[#0F172A] shadow-xs'
                        : 'text-[#64748B] hover:text-[#0F172A]'
                    }`}
                  >
                    <span>🚚 Por KM (Guincho)</span>
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-[#0F172A]">Nome do Operador</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Ex: Pedro, João, Samuel..."
                  className="w-full h-11 px-3.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl text-sm font-medium text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-[#0F172A]">Modelo / Fabricante</label>
                <input
                  type="text"
                  value={formModel}
                  onChange={(e) => setFormModel(e.target.value)}
                  placeholder={formBillingUnit === 'km' ? 'Ex: VW Delivery 11.180' : 'Ex: Caterpillar 416F2'}
                  className="w-full h-11 px-3.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl text-sm font-medium text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#0F172A]">
                    {formBillingUnit === 'km' ? 'Preço por KM (R$/km)' : 'Preço por Hora (R$/h)'}
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={formRate}
                    onChange={(e) => setFormRate(e.target.value)}
                    placeholder={formBillingUnit === 'km' ? '8.50' : '160.00'}
                    className="w-full h-11 px-3.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl text-sm font-medium text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#0F172A]">
                    {formBillingUnit === 'km' ? 'KM Atual' : 'Horímetro Atual'}
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={formHours}
                    onChange={(e) => setFormHours(e.target.value)}
                    placeholder={formBillingUnit === 'km' ? '45000' : '1250'}
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
                <label
                  htmlFor="chk-active"
                  className="text-xs font-bold text-[#0F172A] cursor-pointer"
                >
                  Máquina ativa para operação
                </label>
              </div>

              <div className="pt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsMachineModalOpen(false)}
                  className="flex-1 h-12 bg-white border border-[#E2E8F0] text-[#64748B] hover:text-[#0F172A] font-bold text-xs rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingMachine}
                  className="flex-1 h-12 bg-[#0F172A] hover:bg-[#1E293B] text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
                >
                  {isSavingMachine ? (
                    <Loader2 className="w-4 h-4 animate-spin text-[#FBBF24]" />
                  ) : (
                    'Salvar Máquina'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. MODAL DE CADASTRO DE CLIENTE */}
      {isClientModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Novo Cliente"
          className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in"
        >
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-extrabold text-[#0F172A]">
                {editingClient ? 'Editar Cliente' : 'Novo Cliente'}
              </h2>
              <button
                type="button"
                onClick={() => setIsClientModalOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-[#64748B] hover:bg-[#F1F5F9] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMessage && (
              <div
                role="alert"
                className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-bold"
              >
                {errorMessage}
              </div>
            )}

            <form onSubmit={handleSaveClient} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-xs font-bold text-[#0F172A]">
                  Nome do Cliente *
                </label>
                <input
                  type="text"
                  required
                  value={clientNameInput}
                  onChange={(e) => setClientNameInput(e.target.value)}
                  placeholder="Ex: Fazenda Boa Vista"
                  className="w-full h-11 px-3.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl text-sm font-medium text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-[#0F172A]">
                  Telefone / WhatsApp
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="tel"
                    inputMode="numeric"
                    value={clientPhoneInput}
                    onChange={(e) =>
                      setClientPhoneInput(applyPhoneMask(e.target.value))
                    }
                    placeholder="(00) 00000-0000"
                    className="w-full h-11 pl-10 pr-3.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl text-sm font-medium text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsClientModalOpen(false)}
                  className="flex-1 h-11 bg-white border border-[#E2E8F0] text-[#64748B] hover:text-[#0F172A] font-bold text-xs rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingClient}
                  className="flex-1 h-11 bg-[#0F172A] hover:bg-[#1E293B] text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
                >
                  {isSavingClient ? (
                    <Loader2 className="w-4 h-4 animate-spin text-[#FBBF24]" />
                  ) : (
                    'Salvar Cliente'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. MODAL DE CONFIRMAÇÃO DE EXCLUSÃO DE CLIENTE */}
      {clientToDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirmar exclusão de cliente"
          className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in"
        >
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center text-red-600 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-extrabold text-[#0F172A]">
                  Excluir cliente?
                </h2>
                <p className="text-xs text-[#64748B] mt-1 leading-relaxed">
                  Deseja remover <strong className="text-[#0F172A]">{clientToDelete.name}</strong> da sua lista de clientes?
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setClientToDelete(null)}
                disabled={isDeletingClient}
                className="flex-1 h-11 bg-white border border-[#E2E8F0] text-[#475569] hover:text-[#0F172A] font-bold text-xs rounded-xl cursor-pointer"
              >
                Voltar
              </button>
              <button
                id="btn-confirm-delete-client"
                type="button"
                onClick={handleConfirmDeleteClient}
                disabled={isDeletingClient}
                className="flex-1 h-11 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
              >
                {isDeletingClient ? (
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                ) : (
                  'Sim, excluir'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. BARRA DE NAVEGAÇÃO INFERIOR */}
      <AdminBottomNav
        activeTab="mais"
        onNavigateToDashboard={onNavigateToDashboard || onBack}
        onNavigateToServices={onNavigateToServices || onBack}
        onNavigateToFinancial={onNavigateToFinancial || onBack}
        onNavigateToAgenda={onNavigateToAgenda}
        onNavigateToMachines={() => {}}
      />
    </div>
  );
};

export default MachineManagement;
