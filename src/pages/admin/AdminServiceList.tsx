import React, { useState, useEffect } from 'react';
import {
  fetchAdminWorkLogs,
  type ExtendedWorkLog,
  type WorkLogFilter,
} from '../../services/adminService';
import {
  Truck,
  Check,
  Filter,
  Home,
  CheckSquare,
  BadgeDollarSign,
  MoreHorizontal,
  ArrowLeft,
} from 'lucide-react';

interface AdminServiceListProps {
  onBackToDashboard: () => void;
  onSelectService: (serviceId: string | number) => void;
  onNavigateToMachines: () => void;
  onNavigateToFinancial?: () => void;
}

export const AdminServiceList: React.FC<AdminServiceListProps> = ({
  onBackToDashboard,
  onSelectService,
  onNavigateToMachines,
  onNavigateToFinancial,
}) => {
  const [activeFilter, setActiveFilter] = useState<WorkLogFilter>('todos');
  const [services, setServices] = useState<ExtendedWorkLog[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    setIsLoading(true);
    fetchAdminWorkLogs(activeFilter)
      .then(setServices)
      .finally(() => setIsLoading(false));
  }, [activeFilter]);

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

  const formatDate = (dateStr: string) => {
    try {
      const [year, month, day] = dateStr.split('T')[0].split('-');
      if (year && month && day) {
        return `${day}/${month}/${year}`;
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="relative flex flex-col justify-between w-full max-w-md mx-auto min-h-screen bg-[#F8FAFC] shadow-2xl pb-20">
      
      {/* 1. CABEÇALHO SUPERIOR */}
      <header className="px-6 pt-4 pb-3 bg-white border-b border-[#E2E8F0] sticky top-0 z-20">
        <div className="flex items-center justify-between text-xs text-[#0F172A] mb-1 font-medium">
          <span>9:41</span>
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

        <div className="flex items-center justify-between mt-1">
          <h1 className="text-2xl font-extrabold text-[#0F172A] tracking-tight">
            Serviços
          </h1>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="p-1.5 text-[#0F172A] hover:bg-[#F1F5F9] rounded-lg transition-colors cursor-pointer"
              title="Marcar conferidos"
            >
              <Check className="w-5 h-5 stroke-[2.2]" />
            </button>
            <button
              type="button"
              className="p-1.5 text-[#0F172A] hover:bg-[#F1F5F9] rounded-lg transition-colors cursor-pointer"
              title="Filtro avançado"
            >
              <Filter className="w-5 h-5 stroke-[2]" />
            </button>
          </div>
        </div>

        {/* Pílulas de Filtros Horizontais */}
        <div className="flex items-center gap-2 mt-4 overflow-x-auto pb-1 scrollbar-none">
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
        {isLoading ? (
          <div className="py-12 text-center text-xs font-semibold text-[#64748B]">
            Carregando serviços...
          </div>
        ) : services.length === 0 ? (
          <div className="py-12 text-center bg-white border border-[#E2E8F0] rounded-2xl p-6">
            <p className="text-sm font-bold text-[#0F172A]">Nenhum registro encontrado.</p>
            <p className="text-xs text-[#64748B] mt-1">
              Não há registros com o status selecionado.
            </p>
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
                  <p className="text-sm font-bold text-[#0F172A] truncate">
                    {service.machine_name}
                  </p>
                  <p className="text-xs text-[#64748B] truncate">
                    {service.client_name} • {service.total_hours}h
                  </p>
                  <p className="text-sm font-bold text-[#0F172A] mt-0.5">
                    R$ {service.total_amount?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>

              <div className="flex flex-col items-end gap-1.5 flex-shrink-0 ml-2">
                {getStatusBadge(service.status)}
                <span className="text-[11px] font-medium text-[#94A3B8]">
                  {formatDate(service.service_date)}
                </span>
              </div>
            </div>
          ))
        )}
      </main>

      {/* 3. BARRA INFERIOR (BOTTOM NAVIGATION) */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t border-[#E2E8F0] px-6 py-2.5 flex items-center justify-between z-30 shadow-lg">
        <button
          type="button"
          onClick={onBackToDashboard}
          className="flex flex-col items-center gap-1 text-[#64748B] hover:text-[#0F172A] transition-colors cursor-pointer"
        >
          <Home className="w-5 h-5 stroke-[1.8]" />
          <span className="text-[10px] font-medium">Início</span>
        </button>

        <button
          type="button"
          className="flex flex-col items-center gap-1 text-[#0F172A] cursor-pointer"
        >
          <CheckSquare className="w-5 h-5 stroke-[2.2]" />
          <span className="text-[10px] font-bold">Serviços</span>
        </button>

        <button
          type="button"
          onClick={onNavigateToFinancial || onBackToDashboard}
          className="flex flex-col items-center gap-1 text-[#64748B] hover:text-[#0F172A] transition-colors cursor-pointer"
        >
          <BadgeDollarSign className="w-5 h-5 stroke-[1.8]" />
          <span className="text-[10px] font-medium">Financeiro</span>
        </button>

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

export default AdminServiceList;
