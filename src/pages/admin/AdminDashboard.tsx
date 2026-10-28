import React, { useState, useEffect } from 'react';
import {
  fetchAdminMetrics,
  fetchAdminWorkLogs,
  type AdminMetrics,
  type ExtendedWorkLog,
} from '../../services/adminService';
import {
  Calendar,
  Clock,
  DollarSign,
  RotateCcw,
  Truck,
  Menu,
  HardHat,
  Home,
  CheckSquare,
  BadgeDollarSign,
  MoreHorizontal,
  ChevronRight,
} from 'lucide-react';

interface AdminDashboardProps {
  onNavigateToServices: () => void;
  onNavigateToServiceDetail: (serviceId: string | number) => void;
  onNavigateToMachines: () => void;
  onSwitchToOperator: () => void;
  onNavigateToFinancial?: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  onNavigateToServices,
  onNavigateToServiceDetail,
  onNavigateToMachines,
  onSwitchToOperator,
  onNavigateToFinancial,
}) => {

  const [metrics, setMetrics] = useState<AdminMetrics>({
    totalServices: 0,
    totalHours: 0,
    billedAmount: 0,
    pendingAmount: 0,
  });

  const [recentServices, setRecentServices] = useState<ExtendedWorkLog[]>([]);

  useEffect(() => {
    fetchAdminMetrics().then(setMetrics);
    fetchAdminWorkLogs('todos').then((logs) => {
      setRecentServices(logs.slice(0, 4));
    });
  }, []);

  const getStatusBadge = (status: 'pendente' | 'aprovado' | 'rejeitado') => {
    switch (status) {
      case 'aprovado':
        return (
          <span className="px-2.5 py-1 bg-[#DCFCE7] text-[#166534] rounded-full text-xs font-semibold">
            Aprovado
          </span>
        );
      case 'pendente':
        return (
          <span className="px-2.5 py-1 bg-[#FEF3C7] text-[#B45309] rounded-full text-xs font-semibold">
            Pendente
          </span>
        );
      case 'rejeitado':
        return (
          <span className="px-2.5 py-1 bg-[#FEE2E2] text-[#991B1B] rounded-full text-xs font-semibold">
            Rejeitado
          </span>
        );
    }
  };

  return (
    <div className="relative flex flex-col justify-between w-full max-w-md mx-auto min-h-screen overflow-y-auto bg-[#F8FAFC] shadow-2xl pb-24">
      
      {/* 1. TOPO: STATUS BAR & CABEÇALHO */}
      <header className="px-6 pt-4 pb-3 bg-white border-b border-[#E2E8F0] sticky top-0 z-20">
        <div className="flex items-center justify-between text-xs text-[#0F172A] mb-2 font-medium">
          <span>9:41</span>
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
                R$ {metrics.billedAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>

          {/* Card 4: Pendentes */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-sm flex flex-col justify-between h-28">
            <div className="flex items-center text-[#0F172A]">
              <div className="p-1.5 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0]">
                <RotateCcw className="w-4 h-4 text-[#0F172A]" />
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-[#64748B]">Pendentes</p>
              <p className="text-base font-bold text-[#0F172A] truncate">
                R$ {metrics.pendingAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>

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
            {recentServices.length === 0 ? (
              <div className="py-8 text-center bg-white border border-[#E2E8F0] rounded-2xl p-6">
                <p className="text-sm font-bold text-[#0F172A]">Nenhum serviço registrado ainda.</p>
                <p className="text-xs text-[#64748B] mt-1">
                  Os novos serviços registrados aparecerão aqui.
                </p>
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
                        {service.client_name}
                      </p>
                      <p className="text-xs text-[#64748B] font-medium truncate">
                        {service.machine_name} • {service.total_hours}h
                      </p>
                      <p className="text-sm font-bold text-[#0F172A] mt-0.5">
                        R$ {service.total_amount?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
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

      {/* 3. BARRA INFERIOR (BOTTOM NAVIGATION) IDÊNTICA AO PROTÓTIPO */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t border-[#E2E8F0] px-6 py-2.5 flex items-center justify-between z-40 shadow-lg">
        {/* Aba Início */}
        <button
          type="button"
          className="flex flex-col items-center gap-1 text-[#0F172A] cursor-pointer"
        >
          <Home className="w-5 h-5 stroke-[2.2]" />
          <span className="text-[10px] font-bold">Início</span>
        </button>

        {/* Aba Serviços */}
        <button
          type="button"
          onClick={onNavigateToServices}
          className="flex flex-col items-center gap-1 text-[#64748B] hover:text-[#0F172A] transition-colors cursor-pointer"
        >
          <CheckSquare className="w-5 h-5 stroke-[1.8]" />
          <span className="text-[10px] font-medium">Serviços</span>
        </button>

        {/* Aba Financeiro */}
        <button
          type="button"
          onClick={onNavigateToFinancial || onNavigateToServices}
          className="flex flex-col items-center gap-1 text-[#64748B] hover:text-[#0F172A] transition-colors cursor-pointer"
        >
          <BadgeDollarSign className="w-5 h-5 stroke-[1.8]" />
          <span className="text-[10px] font-medium">Financeiro</span>
        </button>

        {/* Aba Mais (Gestão de Máquinas) */}
        <button
          type="button"
          onClick={onNavigateToMachines}
          className="flex flex-col items-center gap-1 text-[#64748B] hover:text-[#0F172A] transition-colors cursor-pointer"
        >
          <MoreHorizontal className="w-5 h-5 stroke-[1.8]" />
          <span className="text-[10px] font-medium">Mais</span>
        </button>
      </nav>
    </div>
  );
};

export default AdminDashboard;
