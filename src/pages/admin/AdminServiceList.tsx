import React, { useState, useEffect, useCallback } from 'react';
import {
  fetchAdminWorkLogs,
  updateWorkLogPaymentStatus,
  type ExtendedWorkLog,
  type WorkLogFilter,
} from '../../services/adminService';
import type { PaymentStatus } from '../../types/database';
import { SYNC_COMPLETE_EVENT } from '../../services/syncService';
import { formatDateBr, formatCurrencyBRL, formatTimeHHMM } from '../../utils/formatters';
import { AdminBottomNav } from '../../components/AdminBottomNav';
import {
  Truck,
  ArrowLeft,
  CheckCircle2,
} from 'lucide-react';

interface AdminServiceListProps {
  onBackToDashboard: () => void;
  onSelectService: (serviceId: string | number) => void;
  onNavigateToMachines: () => void;
  onNavigateToFinancial?: () => void;
  onNavigateToAgenda?: () => void;
}

export const AdminServiceList: React.FC<AdminServiceListProps> = ({
  onBackToDashboard,
  onSelectService,
  onNavigateToMachines,
  onNavigateToFinancial,
  onNavigateToAgenda,
}) => {
  const [activeFilter, setActiveFilter] = useState<WorkLogFilter>('todos');
  const [services, setServices] = useState<ExtendedWorkLog[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [paymentToastMessage, setPaymentToastMessage] = useState<string | null>(null);

  const handleTogglePaymentStatus = async (
    e: React.MouseEvent,
    service: ExtendedWorkLog
  ) => {
    e.stopPropagation();
    const current: PaymentStatus = service.payment_status || 'a_receber';
    const nextStatus: PaymentStatus = current === 'pago' ? 'a_receber' : 'pago';

    const res = await updateWorkLogPaymentStatus(service.id, nextStatus);
    if (!res.success) {
      setPaymentToastMessage(res.error || 'Erro ao atualizar status financeiro.');
      setTimeout(() => setPaymentToastMessage(null), 3500);
      return;
    }

    setServices((prev) =>
      prev.map((item) =>
        String(item.id) === String(service.id)
          ? { ...item, payment_status: nextStatus }
          : item
      )
    );
    setPaymentToastMessage(
      nextStatus === 'pago'
        ? 'Status financeiro atualizado para "Pago"!'
        : 'Status financeiro atualizado para "A receber"!'
    );
    setTimeout(() => setPaymentToastMessage(null), 3500);
  };

  const loadServices = useCallback(() => {
    setIsLoading(true);
    fetchAdminWorkLogs(activeFilter)
      .then(setServices)
      .finally(() => setIsLoading(false));
  }, [activeFilter]);

  useEffect(() => {
    loadServices();

    window.addEventListener(SYNC_COMPLETE_EVENT, loadServices);
    return () => {
      window.removeEventListener(SYNC_COMPLETE_EVENT, loadServices);
    };
  }, [loadServices]);

  const getStatusBadge = (status: 'pendente' | 'aprovado' | 'rejeitado' | 'em_andamento' | string) => {
    const s = String(status || '').toLowerCase().trim();
    if (s === 'aprovado' || s === 'approved') {
      return (
        <span className="px-2.5 py-1 bg-[#DCFCE7] text-[#166534] rounded-full text-xs font-semibold">
          Aprovado
        </span>
      );
    }
    if (s === 'pendente' || s === 'pending') {
      return (
        <span className="px-2.5 py-1 bg-[#FEF3C7] text-[#B45309] rounded-full text-xs font-semibold">
          Pendente
        </span>
      );
    }
    if (s === 'rejeitado' || s === 'rejected') {
      return (
        <span className="px-2.5 py-1 bg-[#FEE2E2] text-[#991B1B] rounded-full text-xs font-semibold">
          Rejeitado
        </span>
      );
    }
    if (s === 'em_andamento' || s === 'in_progress') {
      return (
        <span className="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-xs font-semibold inline-flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
          Em andamento
        </span>
      );
    }
    return (
      <span className="px-2.5 py-1 bg-[#FEF3C7] text-[#B45309] rounded-full text-xs font-semibold">
        Pendente
      </span>
    );
  };

  return (
    <div className="relative flex flex-col justify-between w-full max-w-md mx-auto min-h-screen overflow-y-auto bg-[#F8FAFC] shadow-2xl pb-24">
      
      {/* 1. CABEÇALHO SUPERIOR */}
      <header className="px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-3 bg-white border-b border-[#E2E8F0] sticky top-0 z-20">
        <div className="flex items-center justify-between text-xs text-[#0F172A] mb-1 font-medium">
          <span>{formatTimeHHMM()}</span>
          <button
            type="button"
            onClick={onBackToDashboard}
            className="flex items-center gap-1 text-[11px] font-bold text-[#64748B] hover:text-[#0F172A] transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Voltar ao Início</span>
          </button>
        </div>

        <p className="text-xs font-medium text-[#64748B]">Lista de serviços (admin)</p>

        <div className="mt-1">
          <h1 className="text-2xl font-extrabold text-[#0F172A] tracking-tight">
            Serviços
          </h1>
        </div>

        {/* Pílulas de Filtros Horizontais */}
        <div className="flex items-center gap-2 mt-4 overflow-x-auto scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] pb-1">
          <button
            type="button"
            onClick={() => setActiveFilter('todos')}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
              activeFilter === 'todos'
                ? 'bg-[#0F172A] text-white shadow-sm'
                : 'bg-white text-[#64748B] border border-[#E2E8F0] hover:border-[#CBD5E1]'
            }`}
          >
            Todos
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter('aprovado')}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
              activeFilter === 'aprovado'
                ? 'bg-[#0F172A] text-white shadow-sm'
                : 'bg-white text-[#64748B] border border-[#E2E8F0] hover:border-[#CBD5E1]'
            }`}
          >
            Aprovados
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter('pendente')}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
              activeFilter === 'pendente'
                ? 'bg-[#0F172A] text-white shadow-sm'
                : 'bg-white text-[#64748B] border border-[#E2E8F0] hover:border-[#CBD5E1]'
            }`}
          >
            Pendentes
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter('rejeitado')}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
              activeFilter === 'rejeitado'
                ? 'bg-[#0F172A] text-white shadow-sm'
                : 'bg-white text-[#64748B] border border-[#E2E8F0] hover:border-[#CBD5E1]'
            }`}
          >
            Rejeitados
          </button>
        </div>
      </header>

      {/* 2. LISTAGEM DE CARDS DE SERVIÇO */}
      <main className="flex-1 px-6 py-4 space-y-3">
        {paymentToastMessage && (
          <div
            role="status"
            className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-xl flex items-center gap-2 animate-fade-in"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>{paymentToastMessage}</span>
          </div>
        )}

        {isLoading ? (
          <div className="py-12 text-center text-xs font-semibold text-[#64748B]">
            Carregando serviços...
          </div>
        ) : services.length === 0 ? (
          <div className="py-12 text-center bg-white border border-[#E2E8F0] rounded-2xl p-6 space-y-3">
            <div>
              <p className="text-sm font-bold text-[#0F172A]">Nenhum item cadastrado ainda</p>
              <p className="text-xs text-[#64748B] mt-1">
                Não há serviços registrados com o status selecionado.
              </p>
            </div>
            {onNavigateToAgenda && (
              <button
                type="button"
                onClick={onNavigateToAgenda}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-[#FBBF24] hover:bg-[#F59E0B] text-[#0F172A] font-extrabold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
              >
                <span>+ Cadastrar na Agenda</span>
              </button>
            )}
          </div>
        ) : (
          services.map((service) => (
            <div
              key={service.id}
              onClick={() => onSelectService(service.id)}
              className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-xs hover:border-[#CBD5E1] transition-all cursor-pointer flex items-center justify-between"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-11 h-11 rounded-full bg-[#F8FAFC] border border-[#E2E8F0] flex items-center justify-center flex-shrink-0 text-[#0F172A]">
                  <Truck className="w-5 h-5 text-[#0F172A]" />
                </div>
                <div className="min-w-0">
                  <p className="text-base font-bold text-[#0F172A] truncate">
                    {service.client_name === 'Em andamento' || service.client_name === 'A definir'
                      ? 'Cliente a definir'
                      : service.client_name || 'Cliente a definir'}
                  </p>
                  <p className="text-xs text-[#64748B] font-medium truncate">
                    {service.machine_name} • {service.total_hours}h
                  </p>
                  <p className="text-sm font-bold text-[#0F172A] mt-0.5">
                    {formatCurrencyBRL(service.total_amount)}
                  </p>
                </div>
              </div>

              <div className="flex flex-col items-end gap-1.5 flex-shrink-0 ml-2">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={(e) => handleTogglePaymentStatus(e, service)}
                    title="Clique para alternar status de pagamento"
                    className={`px-2 py-0.5 rounded-full text-[11px] font-bold inline-flex items-center gap-1 transition-all cursor-pointer ${
                      (service.payment_status || 'a_receber') === 'pago'
                        ? 'bg-[#DCFCE7] text-[#166534] border border-[#86EFAC]'
                        : 'bg-[#FEF3C7] text-[#B45309] border border-[#FDE68A]'
                    }`}
                  >
                    {(service.payment_status || 'a_receber') === 'pago' ? (
                      <>
                        <CheckCircle2 className="w-3 h-3 text-[#166534]" />
                        <span>Pago</span>
                      </>
                    ) : (
                      <span>A receber</span>
                    )}
                  </button>
                  {getStatusBadge(service.status)}
                </div>
                <span className="text-[11px] font-medium text-[#94A3B8]">
                  {formatDateBr(service.service_date)}
                </span>
              </div>
            </div>
          ))
        )}
      </main>

      {/* 3. BARRA INFERIOR (BOTTOM NAVIGATION) */}
      <AdminBottomNav
        activeTab="servicos"
        onNavigateToDashboard={onBackToDashboard}
        onNavigateToFinancial={onNavigateToFinancial || onBackToDashboard}
        onNavigateToAgenda={onNavigateToAgenda}
        onNavigateToMachines={onNavigateToMachines}
      />
    </div>
  );
};

export default AdminServiceList;
