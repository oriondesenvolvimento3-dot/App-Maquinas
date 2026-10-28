import React, { useState, useEffect, useMemo } from 'react';
import {
  fetchAdminWorkLogs,
  type ExtendedWorkLog,
} from '../../services/adminService';
import {
  generateServiceReportPdf,
  type ReportItem,
} from '../../utils/pdfGenerator';
import { openWhatsAppShare } from '../../utils/whatsappShare';
import {
  Calendar,
  Truck,
  FileDown,
  MessageCircle,
  Home,
  CheckSquare,
  BadgeDollarSign,
  MoreHorizontal,
  Clock,
  DollarSign,
  CheckCircle2,
  Users,
} from 'lucide-react';

interface AdminHistoryProps {
  onNavigateToDashboard: () => void;
  onNavigateToServices: () => void;
  onNavigateToMachines: () => void;
  onSelectServiceDetail: (serviceId: string | number) => void;
}

export const AdminHistory: React.FC<AdminHistoryProps> = ({
  onNavigateToDashboard,
  onNavigateToServices,
  onNavigateToMachines,
  onSelectServiceDetail,
}) => {
  const [allServices, setAllServices] = useState<ExtendedWorkLog[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Filtros de Período dinâmicos para o mês corrente
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState<string>(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0];
  });
  const [selectedClient, setSelectedClient] = useState<string>('todos');

  const [pdfSuccessMessage, setPdfSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    fetchAdminWorkLogs('todos')
      .then(setAllServices)
      .finally(() => setIsLoading(false));
  }, []);

  // Lista de clientes únicos para o seletor
  const uniqueClients = useMemo(() => {
    const set = new Set<string>();
    allServices.forEach((s) => {
      if (s.client_name) set.add(s.client_name.trim());
    });
    return Array.from(set).sort();
  }, [allServices]);

  // Filtragem dos serviços por período e cliente
  const filteredServices = useMemo(() => {
    return allServices.filter((service) => {
      // Filtro de data
      if (startDate && service.service_date < startDate) return false;
      if (endDate && service.service_date > endDate) return false;

      // Filtro de cliente
      if (selectedClient !== 'todos') {
        if (service.client_name.toLowerCase() !== selectedClient.toLowerCase()) {
          return false;
        }
      }

      return true;
    });
  }, [allServices, startDate, endDate, selectedClient]);

  // Consolidação de métricas filtradas
  const totalFilteredHours = useMemo(() => {
    const sum = filteredServices.reduce((acc, curr) => acc + (curr.total_hours || 0), 0);
    return Number(sum.toFixed(1));
  }, [filteredServices]);

  const totalFilteredAmount = useMemo(() => {
    return filteredServices.reduce((acc, curr) => {
      const rate = curr.hourly_rate || 0;
      return acc + (curr.total_amount !== undefined ? curr.total_amount : curr.total_hours * rate);
    }, 0);
  }, [filteredServices]);

  // Disparo da geração de PDF
  const handleGeneratePdf = () => {
    if (filteredServices.length === 0) return;

    const items: ReportItem[] = filteredServices.map((s) => {
      const rate = s.hourly_rate || 0;
      return {
        date: s.service_date,
        machine: s.machine_name,
        operator: s.operator_name,
        startHours: s.start_hours,
        endHours: s.end_hours,
        totalHours: s.total_hours,
        hourlyRate: rate,
        subtotal: s.total_amount !== undefined ? s.total_amount : s.total_hours * rate,
      };
    });

    const clientTitle = selectedClient === 'todos' ? 'Todos os Clientes' : selectedClient;

    generateServiceReportPdf({
      clientName: clientTitle,
      startDate,
      endDate,
      items,
      totalHours: totalFilteredHours,
      totalAmount: totalFilteredAmount,
    });

    setPdfSuccessMessage('Relatório PDF gerado e baixado com sucesso!');
    setTimeout(() => setPdfSuccessMessage(null), 4000);
  };

  // Disparo do compartilhamento WhatsApp
  const handleShareWhatsApp = () => {
    const clientTitle = selectedClient === 'todos' ? 'Cliente' : selectedClient;
    const periodStr = `${startDate.split('-').reverse().join('/')} a ${endDate.split('-').reverse().join('/')}`;
    openWhatsAppShare(clientTitle, periodStr, totalFilteredHours, totalFilteredAmount);
  };

  const formatDate = (dateStr: string) => {
    try {
      const [year, month, day] = dateStr.split('T')[0].split('-');
      if (year && month && day) return `${day}/${month}/${year}`;
      return dateStr;
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="relative flex flex-col justify-between w-full max-w-md mx-auto min-h-screen overflow-y-auto bg-[#F8FAFC] shadow-2xl pb-24">
      
      {/* 1. CABEÇALHO */}
      <header className="px-6 pt-4 pb-3 bg-white border-b border-[#E2E8F0] sticky top-0 z-20">
        <div className="flex items-center justify-between text-xs text-[#0F172A] mb-1 font-medium">
          <span>9:41</span>
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#64748B]">
            <Calendar className="w-3.5 h-3.5 text-[#F59E0B]" />
            <span>Fechamento Mensal</span>
          </div>
        </div>

        <h1 className="text-2xl font-extrabold text-[#0F172A] tracking-tight">
          Financeiro
        </h1>
        <p className="text-xs text-[#64748B] mt-0.5">
          Histórico e relatórios de prestação de serviços
        </p>

        {/* 2. BARRA DE FILTROS: PERÍODO E CLIENTE */}
        <div className="mt-3.5 space-y-2.5">
          {/* Datas Início e Fim */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-[10px] font-bold text-[#64748B] block mb-1 uppercase tracking-wider">
                De:
              </label>
              <input
                id="input-start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full h-9 px-2.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl text-xs font-semibold text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-[#64748B] block mb-1 uppercase tracking-wider">
                Até:
              </label>
              <input
                id="input-end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full h-9 px-2.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl text-xs font-semibold text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
              />
            </div>
          </div>

          {/* Seletor de Cliente */}
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-[#64748B]">
              <Users className="w-3.5 h-3.5" />
            </div>
            <select
              id="select-client"
              value={selectedClient}
              onChange={(e) => setSelectedClient(e.target.value)}
              className="w-full h-9 pl-8 pr-7 bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl text-xs font-bold text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#FBBF24] appearance-none cursor-pointer"
            >
              <option value="todos">Todos os Clientes</option>
              {uniqueClients.map((client) => (
                <option key={client} value={client}>
                  {client}
                </option>
              ))}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[#64748B] text-[10px]">
              ▼
            </div>
          </div>
        </div>
      </header>

      {/* 3. CORPO: CARDS DE RESUMO DO PERÍODO & LISTAGEM */}
      <main className="flex-1 px-6 py-4 space-y-4">
        
        {pdfSuccessMessage && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-xl flex items-center gap-2 animate-fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>{pdfSuccessMessage}</span>
          </div>
        )}

        {/* Cards de Resumo idênticos ao protótipo financeiro.jpg */}
        <div className="grid grid-cols-2 gap-3.5">
          {/* Card Horas Apuradas */}
          <div className="bg-[#DCFCE7]/70 border border-[#86EFAC] rounded-2xl p-4 shadow-xs flex flex-col justify-between h-24">
            <div className="flex items-center gap-1.5 text-[#166534]">
              <Clock className="w-4 h-4" />
              <span className="text-xs font-bold">Total Horas</span>
            </div>
            <p className="text-2xl font-extrabold text-[#166534]">
              {totalFilteredHours}h
            </p>
          </div>

          {/* Card Valor a Faturar */}
          <div className="bg-[#FEF3C7]/70 border border-[#FDE68A] rounded-2xl p-4 shadow-xs flex flex-col justify-between h-24">
            <div className="flex items-center gap-1.5 text-[#B45309]">
              <DollarSign className="w-4 h-4" />
              <span className="text-xs font-bold">A Cobrar</span>
            </div>
            <p className="text-base font-extrabold text-[#B45309] truncate">
              R$ {totalFilteredAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        {/* Lista de Serviços Filtrados */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-xs text-[#64748B] font-semibold">
            <span>Lançamentos no período ({filteredServices.length})</span>
          </div>

          {isLoading ? (
            <div className="py-8 text-center text-xs text-[#64748B]">Carregando histórico...</div>
          ) : filteredServices.length === 0 ? (
            <div className="py-8 text-center bg-white border border-[#E2E8F0] rounded-2xl p-6">
              <p className="text-sm font-bold text-[#0F172A]">Nenhum registro encontrado.</p>
              <p className="text-xs text-[#64748B] mt-1">Ajuste o intervalo de datas ou cliente.</p>
            </div>
          ) : (
            filteredServices.map((service) => (
              <div
                key={service.id}
                onClick={() => onSelectServiceDetail(service.id)}
                className="bg-white border border-[#E2E8F0] rounded-2xl p-3.5 shadow-xs hover:border-[#CBD5E1] transition-all cursor-pointer flex items-center justify-between"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-[#F8FAFC] border border-[#E2E8F0] flex items-center justify-center flex-shrink-0 text-[#0F172A]">
                    <Truck className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-base font-bold text-[#0F172A] truncate">
                      {service.client_name}
                    </p>
                    <p className="text-xs text-[#64748B] font-medium truncate">
                      {service.machine_name} • {service.total_hours}h • {formatDate(service.service_date)}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1 flex-shrink-0 ml-2">
                  <span className="text-sm font-extrabold text-[#0F172A]">
                    R$ {service.total_amount?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      service.status === 'aprovado'
                        ? 'bg-[#DCFCE7] text-[#166534]'
                        : service.status === 'pendente'
                        ? 'bg-[#FEF3C7] text-[#B45309]'
                        : 'bg-[#FEE2E2] text-[#991B1B]'
                    }`}
                  >
                    {service.status === 'aprovado' ? 'Faturável' : service.status}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </main>

      {/* 4. BARRA DE AÇÕES RÁPIDAS (GERAR PDF E WHATSAPP) */}
      <div className="fixed bottom-14 left-0 right-0 max-w-md mx-auto px-6 py-2.5 bg-white/95 backdrop-blur-xs border-t border-[#E2E8F0] z-20 flex items-center gap-2.5">
        {/* Botão Gerar PDF */}
        <button
          id="btn-generate-pdf"
          type="button"
          onClick={handleGeneratePdf}
          disabled={filteredServices.length === 0}
          className="flex-1 h-12 bg-[#0F172A] hover:bg-[#1E293B] active:scale-[0.98] text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <FileDown className="w-4 h-4 text-[#FBBF24]" />
          <span>Gerar PDF</span>
        </button>

        {/* Botão Enviar WhatsApp */}
        <button
          id="btn-share-whatsapp"
          type="button"
          onClick={handleShareWhatsApp}
          disabled={filteredServices.length === 0}
          className="flex-1 h-12 bg-[#16A34A] hover:bg-[#15803D] active:scale-[0.98] text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <MessageCircle className="w-4 h-4 fill-white" />
          <span>WhatsApp</span>
        </button>
      </div>

      {/* 5. BARRA INFERIOR (BOTTOM NAVIGATION) */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t border-[#E2E8F0] px-6 py-2.5 flex items-center justify-between z-40 shadow-lg">
        <button
          type="button"
          onClick={onNavigateToDashboard}
          className="flex flex-col items-center gap-1 text-[#64748B] hover:text-[#0F172A] transition-colors cursor-pointer"
        >
          <Home className="w-5 h-5 stroke-[1.8]" />
          <span className="text-[10px] font-medium">Início</span>
        </button>

        <button
          type="button"
          onClick={onNavigateToServices}
          className="flex flex-col items-center gap-1 text-[#64748B] hover:text-[#0F172A] transition-colors cursor-pointer"
        >
          <CheckSquare className="w-5 h-5 stroke-[1.8]" />
          <span className="text-[10px] font-medium">Serviços</span>
        </button>

        <button
          type="button"
          className="flex flex-col items-center gap-1 text-[#0F172A] cursor-pointer"
        >
          <BadgeDollarSign className="w-5 h-5 stroke-[2.2]" />
          <span className="text-[10px] font-bold">Financeiro</span>
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

export default AdminHistory;
