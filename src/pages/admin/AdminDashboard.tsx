import React, { useState, useEffect, useCallback } from 'react';
import {
  fetchAdminMetrics,
  fetchAdminWorkLogs,
  type AdminMetrics,
  type ExtendedWorkLog,
} from '../../services/adminService';
import { SYNC_COMPLETE_EVENT } from '../../services/syncService';
import { formatCurrencyBRL, formatTimeHHMM } from '../../utils/formatters';
import { AdminBottomNav } from '../../components/AdminBottomNav';
import {
  Calendar,
  Clock,
  DollarSign,
  RotateCcw,
  Truck,
  Menu,
  HardHat,
  ChevronRight,
} from 'lucide-react';

interface AdminDashboardProps {
  onNavigateToServices: () => void;
  onNavigateToServiceDetail: (serviceId: string | number) => void;
  onNavigateToMachines: () => void;
  onSwitchToOperator: () => void;
  onNavigateToFinancial?: () => void;
  onNavigateToAgenda?: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  onNavigateToServices,
  onNavigateToServiceDetail,
  onNavigateToMachines,
  onSwitchToOperator,
  onNavigateToFinancial,
  onNavigateToAgenda,
}) => {

  const [metrics, setMetrics] = useState<AdminMetrics>({
    totalServices: 0,
    totalHours: 0,
    billedAmount: 0,
    pendingAmount: 0,
  });

  const [allServices, setAllServices] = useState<ExtendedWorkLog[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const loadDashboardData = useCallback(() => {
    setIsLoading(true);
    Promise.all([
      fetchAdminMetrics().then(setMetrics),
      fetchAdminWorkLogs('todos').then((logs) => {
        setAllServices(logs);
      }),
    ]).finally(() => {
      setIsLoading(false);
    });
  }, []);

  useEffect(() => {
    loadDashboardData();

    window.addEventListener(SYNC_COMPLETE_EVENT, loadDashboardData);
    return () => {
      window.removeEventListener(SYNC_COMPLETE_EVENT, loadDashboardData);
    };
  }, [loadDashboardData]);

  // Identifica serviços aguardando aprovação
  const pendingServices = allServices.filter(
    (s) => s.status === 'pendente' || (s.status as any) === 'pending'
  );

  // Ordena lista de serviços recentes priorizando pendentes no topo
  const recentServices = [...allServices]
    .sort((a, b) => {
      const aPending = a.status === 'pendente' || (a.status as any) === 'pending';
      const bPending = b.status === 'pendente' || (b.status as any) === 'pending';
      if (aPending && !bPending) return -1;
      if (!aPending && bPending) return 1;

      const dateA = new Date(a.created_at || a.service_date).getTime();
      const dateB = new Date(b.created_at || b.service_date).getTime();
      return dateB - dateA;
    })
    .slice(0, 6);

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
      
      {/* 1. TOPO: STATUS BAR & CABEÇALHO */}
      <header className="px-6 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] pb-3 bg-white border-b border-[#E2E8F0] sticky top-0 z-20">
        <div className="flex items-center justify-between text-xs text-[#0F172A] mb-2 font-medium">
          <span>{formatTimeHHMM()}</span>
          <div className="flex items-center gap-1.5 font-semibold text-[11px] text-[#64748B]">
            <span>Admin</span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <button
            type="button"
            className="p-2 -ml-2 text-[#0F172A] hover:bg-[#F1F5F9] rounded-xl transition-all cursor-pointer"
            aria-label="Menu"
          >
            <Menu className="w-5 h-5 stroke-[2.2]" />
          </button>

          <h1 className="text-base font-bold text-[#0F172A] tracking-tight">
            Painel Administrativo
          </h1>

          {/* Atalho para alternar para a Visão de Operador */}
          <button
            id="btn-switch-operator"
            type="button"
            onClick={onSwitchToOperator}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#CBD5E1] rounded-xl text-xs font-semibold text-[#0F172A] transition-all cursor-pointer"
            title="Alternar para o modo Operador"
          >
            <HardHat className="w-3.5 h-3.5 text-[#F59E0B]" />
            <span className="hidden sm:inline">Operador</span>
          </button>
        </div>
      </header>

      {/* 2. CORPO DO DASHBOARD */}
      <main className="flex-1 px-6 py-5 space-y-6">
        
        {/* Grid 2x2 com métricas do protótipo */}
        <div className="grid grid-cols-2 gap-3.5">
          
          {/* Card 1: Total de serviços */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-sm flex flex-col justify-between h-28">
            <div className="flex items-center text-[#0F172A]">
              <div className="p-1.5 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0]">
                <Calendar className="w-4 h-4 text-[#0F172A]" />
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-[#64748B]">Total de serviços</p>
              <p className="text-2xl font-bold text-[#0F172A]">{metrics.totalServices}</p>
            </div>
          </div>

          {/* Card 2: Horas trabalhadas */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-sm flex flex-col justify-between h-28">
            <div className="flex items-center text-[#0F172A]">
              <div className="p-1.5 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0]">
                <Clock className="w-4 h-4 text-[#0F172A]" />
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-[#64748B]">Horas trabalhadas</p>
              <p className="text-2xl font-bold text-[#0F172A]">{metrics.totalHours}h</p>
            </div>
          </div>

          {/* Card 3: Valor faturado */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-sm flex flex-col justify-between h-28">
            <div className="flex items-center text-[#0F172A]">
              <div className="p-1.5 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0]">
                <DollarSign className="w-4 h-4 text-[#0F172A]" />
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-[#64748B]">Valor faturado</p>
              <p className="text-base font-bold text-[#0F172A] truncate">
                {formatCurrencyBRL(metrics.billedAmount)}
              </p>
            </div>
          </div>

          {/* Card 4: Pendentes */}
          <div
            onClick={onNavigateToServices}
            className="bg-white border border-[#E2E8F0] hover:border-[#F59E0B] rounded-2xl p-4 shadow-sm flex flex-col justify-between h-28 cursor-pointer transition-all group"
            title="Clique para ver serviços pendentes"
          >
            <div className="flex items-center justify-between text-[#0F172A]">
              <div className="p-1.5 bg-[#F8FAFC] group-hover:bg-[#FEF3C7] rounded-lg border border-[#E2E8F0] group-hover:border-[#FDE68A] transition-colors">
                <RotateCcw className="w-4 h-4 text-[#0F172A] group-hover:text-[#B45309]" />
              </div>
              {pendingServices.length > 0 && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-extrabold bg-[#FEF3C7] text-[#B45309]">
                  {pendingServices.length} pend.
                </span>
              )}
            </div>
            <div>
              <p className="text-xs font-medium text-[#64748B]">Pendentes</p>
              <p className="text-base font-bold text-[#0F172A] truncate">
                {formatCurrencyBRL(metrics.pendingAmount)}
              </p>
            </div>
          </div>
        </div>

        {/* Bloco de Destaque: Aguardando Aprovação */}
        {!isLoading && pendingServices.length > 0 && (
          <div className="bg-[#FEF3C7]/40 border-2 border-[#FDE68A] rounded-2xl p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B] animate-pulse"></span>
                <h2 className="text-sm font-extrabold text-[#92400E] tracking-tight">
                  Aguardando Aprovação ({pendingServices.length})
                </h2>
              </div>
              <button
                type="button"
                onClick={onNavigateToServices}
                className="text-xs font-bold text-[#B45309] hover:text-[#78350F] flex items-center gap-0.5 transition-colors cursor-pointer"
              >
                <span>Ver fila</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-2">
              {pendingServices.slice(0, 3).map((service) => (
                <div
                  key={`pending-${service.id}`}
                  onClick={() => onNavigateToServiceDetail(service.id)}
                  className="bg-white border border-[#FDE68A] hover:border-[#F59E0B] rounded-xl p-3 shadow-xs transition-all cursor-pointer flex items-center justify-between"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-[#FEF3C7] border border-[#FDE68A] flex items-center justify-center flex-shrink-0 text-[#B45309]">
                      <Truck className="w-4 h-4 text-[#B45309]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[#0F172A] truncate">
                        {service.client_name === 'Em andamento' || service.client_name === 'A definir'
                          ? 'Cliente a definir'
                          : service.client_name || 'Cliente a definir'}
                      </p>
                      <p className="text-[11px] text-[#64748B] font-medium truncate">
                        {service.machine_name} • {service.total_hours}h
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1 flex-shrink-0 ml-2">
                    <span className="px-2 py-0.5 bg-[#FEF3C7] text-[#B45309] border border-[#FDE68A] rounded-full text-[10px] font-extrabold">
                      Requer Aprovação
                    </span>
                    <span className="text-xs font-bold text-[#0F172A]">
                      {formatCurrencyBRL(service.total_amount)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Seção: Serviços Recentes */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-[#0F172A]">Serviços recentes</h2>
            <button
              id="btn-see-all-services"
              type="button"
              onClick={onNavigateToServices}
              className="text-xs font-semibold text-[#64748B] hover:text-[#0F172A] flex items-center gap-0.5 transition-colors cursor-pointer"
            >
              <span>Ver todos</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-2.5">
            {isLoading ? (
              <div className="py-8 text-center text-xs font-semibold text-[#64748B]">
                Carregando serviços recentes...
              </div>
            ) : recentServices.length === 0 ? (
              <div className="py-8 text-center bg-white border border-[#E2E8F0] rounded-2xl p-6 space-y-3">
                <div>
                  <p className="text-sm font-bold text-[#0F172A]">
                    Nenhum item cadastrado ainda
                  </p>
                  <p className="text-xs text-[#64748B] mt-1">
                    Nenhum serviço registrado ainda. Os novos serviços aparecerão aqui.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onNavigateToAgenda || onSwitchToOperator}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-[#FBBF24] hover:bg-[#F59E0B] text-[#0F172A] font-extrabold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
                >
                  <span>+ Cadastrar Serviço</span>
                </button>
              </div>
            ) : (
              recentServices.map((service) => (
                <div
                  key={service.id}
                  onClick={() => onNavigateToServiceDetail(service.id)}
                  className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-xs hover:border-[#CBD5E1] transition-all cursor-pointer flex items-center justify-between"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-[#F8FAFC] border border-[#E2E8F0] flex items-center justify-center flex-shrink-0 text-[#0F172A]">
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
                      {(service.operator_name || (service as any).operator) && (
                        <span className="text-xs font-medium text-slate-500 block leading-tight mt-0.5">
                          Op: {service.operator_name || (service as any).operator}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1 flex-shrink-0 ml-2">
                    {getStatusBadge(service.status)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>

      {/* 3. BARRA INFERIOR (BOTTOM NAVIGATION) */}
      <AdminBottomNav
        activeTab="inicio"
        onNavigateToServices={onNavigateToServices}
        onNavigateToFinancial={onNavigateToFinancial || onNavigateToServices}
        onNavigateToAgenda={onNavigateToAgenda}
        onNavigateToMachines={onNavigateToMachines}
      />
    </div>
  );
};

export default AdminDashboard;
