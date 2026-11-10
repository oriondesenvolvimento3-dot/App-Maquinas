import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  fetchAdminWorkLogs,
  updateWorkLogPaymentStatus,
  calculateWorkLogBilling,
  type ExtendedWorkLog,
} from '../../services/adminService';
import type { PaymentStatus } from '../../types/database';
import { SYNC_COMPLETE_EVENT } from '../../services/syncService';
import {
  generateServiceReportPdf,
  type ReportItem,
} from '../../utils/pdfGenerator';
import { openWhatsAppShare } from '../../utils/whatsappShare';
import { formatDateBr, formatCurrencyBRL, formatDateISO } from '../../utils/formatters';
import { AdminBottomNav } from '../../components/AdminBottomNav';
import {
  Truck,
  FileDown,
  MessageCircle,
  BadgeDollarSign,
  Clock,
  DollarSign,
  CheckCircle2,
  Users,
  X,
} from 'lucide-react';

interface AdminHistoryProps {
  onNavigateToDashboard: () => void;
  onNavigateToServices: () => void;
  onNavigateToMachines: () => void;
  onSelectServiceDetail: (serviceId: string | number) => void;
  onNavigateToAgenda?: () => void;
}

export type DatePreset = 'ultimos_30' | 'este_mes' | 'mes_anterior' | 'tudo';

const STORAGE_KEY_START = 'retroscave_history_start_date';
const STORAGE_KEY_END = 'retroscave_history_end_date';
const STORAGE_KEY_CLIENT = 'retroscave_history_client';
const STORAGE_KEY_PAYMENT = 'retroscave_history_payment';

export const getDatePresetRange = (preset: DatePreset): { startDate: string; endDate: string } => {
  const now = new Date();
  switch (preset) {
    case 'ultimos_30': {
      const past30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return {
        startDate: formatDateISO(past30),
        endDate: formatDateISO(now),
      };
    }
    case 'este_mes': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return {
        startDate: formatDateISO(start),
        endDate: formatDateISO(end),
      };
    }
    case 'mes_anterior': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return {
        startDate: formatDateISO(start),
        endDate: formatDateISO(end),
      };
    }
    case 'tudo': {
      return {
        startDate: '',
        endDate: '',
      };
    }
  }
};

export interface FinancialSummaryResult {
  filteredServices: ExtendedWorkLog[];
  totalHours: number;
  totalBilled: number;
  totalPaid: number;
  totalReceivable: number;
}

/**
 * Filtra os serviços financeiros válidos (excluindo rejeitados e em andamento),
 * recalcula cada registro pela fórmula unificada imutável e consolida os totais
 * dos cards superiores estritamente por .reduce() sobre a lista filtrada.
 */
export function calculateFinancialSummary(
  services: ExtendedWorkLog[],
  filters: {
    startDate?: string;
    endDate?: string;
    selectedClient?: string;
    selectedPaymentStatus?: 'todos' | PaymentStatus;
  } = {}
): FinancialSummaryResult {
  const {
    startDate = '',
    endDate = '',
    selectedClient = 'todos',
    selectedPaymentStatus = 'todos',
  } = filters;

  const filteredServices = services
    .filter((service) => {
      if (
        service.status === 'rejeitado' ||
        (service.status as any) === 'rejected' ||
        service.status === 'em_andamento' ||
        (service.status as any) === 'in_progress'
      ) {
        return false;
      }

      if (startDate && service.service_date < startDate) return false;
      if (endDate && service.service_date > endDate) return false;

      if (selectedClient !== 'todos') {
        if (service.client_name.toLowerCase() !== selectedClient.toLowerCase()) {
          return false;
        }
      }

      if (selectedPaymentStatus !== 'todos') {
        const rawStatus = service.payment_status || 'a_receber';
        const normalizedPayment: PaymentStatus =
          rawStatus === 'pago' || (rawStatus as any) === 'paid'
            ? 'pago'
            : 'a_receber';
        if (normalizedPayment !== selectedPaymentStatus) {
          return false;
        }
      }

      return true;
    })
    .map((service) => {
      const { totalHours, totalAmount } = calculateWorkLogBilling(service);
      return {
        ...service,
        total_hours: totalHours,
        total_amount: totalAmount,
      };
    });

  const totalHours = Number(
    filteredServices
      .reduce((acc, s) => acc + (Number(s.total_hours) || 0), 0)
      .toFixed(1)
  );

  const totalBilled = Number(
    filteredServices
      .reduce((acc, s) => acc + (Number(s.total_amount) || 0), 0)
      .toFixed(2)
  );

  const totalPaid = Number(
    filteredServices
      .filter(
        (s) =>
          s.payment_status === 'pago' || (s.payment_status as any) === 'paid'
      )
      .reduce((acc, s) => acc + (Number(s.total_amount) || 0), 0)
      .toFixed(2)
  );

  const totalReceivable = Number(
    filteredServices
      .filter(
        (s) =>
          s.payment_status !== 'pago' && (s.payment_status as any) !== 'paid'
      )
      .reduce((acc, s) => acc + (Number(s.total_amount) || 0), 0)
      .toFixed(2)
  );

  return {
    filteredServices,
    totalHours,
    totalBilled,
    totalPaid,
    totalReceivable,
  };
}

export const AdminHistory: React.FC<AdminHistoryProps> = ({
  onNavigateToDashboard,
  onNavigateToServices,
  onNavigateToMachines,
  onSelectServiceDetail,
  onNavigateToAgenda,
}) => {
  const [allServices, setAllServices] = useState<ExtendedWorkLog[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Filtros de Período inteligentes (recuperados de sessionStorage ou Últimos 30 Dias por padrão)
  const [startDate, setStartDate] = useState<string>(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY_START);
      if (saved !== null) return saved;
    } catch {
      // ignore
    }
    return getDatePresetRange('ultimos_30').startDate;
  });

  const [endDate, setEndDate] = useState<string>(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY_END);
      if (saved !== null) return saved;
    } catch {
      // ignore
    }
    return getDatePresetRange('ultimos_30').endDate;
  });

  const [selectedClient, setSelectedClient] = useState<string>(() => {
    try {
      return sessionStorage.getItem(STORAGE_KEY_CLIENT) || 'todos';
    } catch {
      return 'todos';
    }
  });

  const [selectedPaymentStatus, setSelectedPaymentStatus] = useState<'todos' | PaymentStatus>(() => {
    try {
      return (sessionStorage.getItem(STORAGE_KEY_PAYMENT) as 'todos' | PaymentStatus) || 'todos';
    } catch {
      return 'todos';
    }
  });

  const [pdfSuccessMessage, setPdfSuccessMessage] = useState<string | null>(null);
  const [paymentToastMessage, setPaymentToastMessage] = useState<string | null>(null);
  const [isPdfMenuOpen, setIsPdfMenuOpen] = useState<boolean>(false);

  // Persistência contínua na sessão para preservar filtros ao navegar entre telas
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY_START, startDate);
      sessionStorage.setItem(STORAGE_KEY_END, endDate);
      sessionStorage.setItem(STORAGE_KEY_CLIENT, selectedClient);
      sessionStorage.setItem(STORAGE_KEY_PAYMENT, selectedPaymentStatus);
    } catch {
      // ignore
    }
  }, [startDate, endDate, selectedClient, selectedPaymentStatus]);

  // Ação ao clicar em um atalho rápido
  const handleSelectPreset = (preset: DatePreset) => {
    const range = getDatePresetRange(preset);
    setStartDate(range.startDate);
    setEndDate(range.endDate);
  };

  // Identificação do atalho atualmente ativo com base nas datas selecionadas
  const activePreset = useMemo<DatePreset | null>(() => {
    if (!startDate && !endDate) return 'tudo';

    const u30 = getDatePresetRange('ultimos_30');
    if (startDate === u30.startDate && endDate === u30.endDate) return 'ultimos_30';

    const em = getDatePresetRange('este_mes');
    if (startDate === em.startDate && endDate === em.endDate) return 'este_mes';

    const ma = getDatePresetRange('mes_anterior');
    if (startDate === ma.startDate && endDate === ma.endDate) return 'mes_anterior';

    return null;
  }, [startDate, endDate]);

  const loadHistory = useCallback(() => {
    setIsLoading(true);
    fetchAdminWorkLogs('todos')
      .then((logs) => {
        const validLogs = logs
          .filter(
            (s) =>
              s.status !== 'rejeitado' &&
              (s.status as any) !== 'rejected' &&
              s.status !== 'em_andamento' &&
              (s.status as any) !== 'in_progress'
          )
          .map((s) => {
            const safeHours = Number(s.total_hours) || 0;
            const safeRate = Number(s.hourly_rate) || 0;
            const safeAmount = Number((safeHours * safeRate).toFixed(2));
            return {
              ...s,
              total_hours: safeHours,
              hourly_rate: safeRate,
              total_amount: safeAmount,
            };
          });
        setAllServices(validLogs);
      })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    loadHistory();

    window.addEventListener(SYNC_COMPLETE_EVENT, loadHistory);
    return () => {
      window.removeEventListener(SYNC_COMPLETE_EVENT, loadHistory);
    };
  }, [loadHistory]);

  // Lista de clientes únicos para o seletor
  const uniqueClients = useMemo(() => {
    const set = new Set<string>();
    allServices.forEach((s) => {
      if (s.client_name) set.add(s.client_name.trim());
    });
    return Array.from(set).sort();
  }, [allServices]);

  // Filtragem dos serviços e consolidação de métricas dos cards superiores via calculateFinancialSummary
  const financialSummary = useMemo(
    () =>
      calculateFinancialSummary(allServices, {
        startDate,
        endDate,
        selectedClient,
        selectedPaymentStatus,
      }),
    [allServices, startDate, endDate, selectedClient, selectedPaymentStatus]
  );

  const filteredServices = financialSummary.filteredServices;
  const totalFilteredHours = financialSummary.totalHours;
  const totalFilteredAmount = financialSummary.totalBilled;
  const totalPaidAmount = financialSummary.totalPaid;
  const totalReceivableAmount = financialSummary.totalReceivable;

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

    setAllServices((prev) =>
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

  // Disparo da geração de PDF
  const handleGeneratePdf = (showPricing: boolean = true) => {
    if (filteredServices.length === 0) return;
    setIsPdfMenuOpen(false);

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

    const effectiveStartDate = startDate || (filteredServices.length > 0
      ? filteredServices.reduce((min, s) => (s.service_date < min ? s.service_date : min), filteredServices[0].service_date)
      : formatDateISO());
    const effectiveEndDate = endDate || (filteredServices.length > 0
      ? filteredServices.reduce((max, s) => (s.service_date > max ? s.service_date : max), filteredServices[0].service_date)
      : formatDateISO());

    generateServiceReportPdf(
      {
        clientName: clientTitle,
        startDate: effectiveStartDate,
        endDate: effectiveEndDate,
        items,
        totalHours: totalFilteredHours,
        totalAmount: totalFilteredAmount,
      },
      showPricing
    );

    setPdfSuccessMessage('Relatório PDF gerado e baixado com sucesso!');
    setTimeout(() => setPdfSuccessMessage(null), 4000);
  };

  // Disparo do compartilhamento WhatsApp
  const handleShareWhatsApp = () => {
    const clientTitle = selectedClient === 'todos' ? 'Cliente' : selectedClient;
    const periodStr = startDate && endDate
      ? `${formatDateBr(startDate)} a ${formatDateBr(endDate)}`
      : startDate
      ? `A partir de ${formatDateBr(startDate)}`
      : endDate
      ? `Até ${formatDateBr(endDate)}`
      : 'Histórico Geral Completo';
    openWhatsAppShare(clientTitle, periodStr, totalFilteredHours, totalFilteredAmount);
  };

  return (
    <div className="relative flex flex-col justify-between w-full max-w-md mx-auto min-h-screen overflow-y-auto bg-[#F8FAFC] shadow-2xl pb-[calc(env(safe-area-inset-bottom,0px)+10rem)]">
      
      {/* 1. CABEÇALHO */}
      <header className="px-6 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] pb-3 bg-white border-b border-[#E2E8F0] sticky top-0 z-20">
        <h1 className="text-2xl font-extrabold text-[#0F172A] tracking-tight">
          Financeiro
        </h1>
        <p className="text-xs text-[#64748B] mt-0.5">
          Histórico e relatórios de prestação de serviços
        </p>

        {/* 2. BARRA DE FILTROS: PERÍODO E CLIENTE */}
        <div className="mt-3.5 space-y-2.5">
          {/* Barra de Atalhos Rápidos de Período (Pills / Botões) */}
          <div>
            <span className="block text-[10px] font-bold text-[#64748B] uppercase tracking-wider mb-1.5">
              Atalhos de Período:
            </span>
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] pb-0.5 -mx-1 px-1">
              <button
                type="button"
                id="preset-btn-ultimos-30"
                onClick={() => handleSelectPreset('ultimos_30')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 border ${
                  activePreset === 'ultimos_30'
                    ? 'bg-[#0F172A] text-[#FBBF24] border-[#0F172A] shadow-xs'
                    : 'bg-[#F8FAFC] text-[#475569] border-[#E2E8F0] hover:bg-[#F1F5F9] hover:text-[#0F172A]'
                }`}
              >
                Últimos 30 Dias
              </button>
              <button
                type="button"
                id="preset-btn-este-mes"
                onClick={() => handleSelectPreset('este_mes')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 border ${
                  activePreset === 'este_mes'
                    ? 'bg-[#0F172A] text-[#FBBF24] border-[#0F172A] shadow-xs'
                    : 'bg-[#F8FAFC] text-[#475569] border-[#E2E8F0] hover:bg-[#F1F5F9] hover:text-[#0F172A]'
                }`}
              >
                Este Mês
              </button>
              <button
                type="button"
                id="preset-btn-mes-anterior"
                onClick={() => handleSelectPreset('mes_anterior')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 border ${
                  activePreset === 'mes_anterior'
                    ? 'bg-[#0F172A] text-[#FBBF24] border-[#0F172A] shadow-xs'
                    : 'bg-[#F8FAFC] text-[#475569] border-[#E2E8F0] hover:bg-[#F1F5F9] hover:text-[#0F172A]'
                }`}
              >
                Mês Anterior
              </button>
              <button
                type="button"
                id="preset-btn-tudo"
                onClick={() => handleSelectPreset('tudo')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 border ${
                  activePreset === 'tudo'
                    ? 'bg-[#0F172A] text-[#FBBF24] border-[#0F172A] shadow-xs'
                    : 'bg-[#F8FAFC] text-[#475569] border-[#E2E8F0] hover:bg-[#F1F5F9] hover:text-[#0F172A]'
                }`}
              >
                Tudo
              </button>
            </div>
          </div>

          {/* Datas Início e Fim */}
          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0">
              <label htmlFor="input-start-date" className="text-[10px] font-bold text-[#64748B] block mb-1 uppercase tracking-wider">
                De:
              </label>
              <input
                id="input-start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full h-9.5 px-2.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl text-xs font-semibold text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
              />
            </div>
            <div className="min-w-0">
              <label htmlFor="input-end-date" className="text-[10px] font-bold text-[#64748B] block mb-1 uppercase tracking-wider">
                Até:
              </label>
              <input
                id="input-end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full h-9.5 px-2.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl text-xs font-semibold text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
              />
            </div>
          </div>

          {/* Seletor de Cliente e Status de Pagamento (Lado a Lado) */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="relative min-w-0">
              <div className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-[#64748B]">
                <Users className="w-3.5 h-3.5" />
              </div>
              <select
                id="select-client"
                aria-label="Filtrar por Cliente"
                value={selectedClient}
                onChange={(e) => setSelectedClient(e.target.value)}
                className="w-full h-9 pl-7 pr-6 bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl text-[11px] sm:text-xs font-bold text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#FBBF24] appearance-none cursor-pointer truncate"
              >
                <option value="todos">Todos os Clientes</option>
                {uniqueClients.map((client) => (
                  <option key={client} value={client}>
                    {client}
                  </option>
                ))}
              </select>
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-[#64748B] text-[9px]">
                ▼
              </div>
            </div>

            <div className="relative min-w-0">
              <div className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-[#64748B]">
                <BadgeDollarSign className="w-3.5 h-3.5" />
              </div>
              <select
                id="select-payment-status"
                aria-label="Status de Pagamento"
                value={selectedPaymentStatus}
                onChange={(e) => setSelectedPaymentStatus(e.target.value as 'todos' | PaymentStatus)}
                className="w-full h-9 pl-7 pr-6 bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl text-[11px] sm:text-xs font-bold text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#FBBF24] appearance-none cursor-pointer truncate"
              >
                <option value="todos">Todos os Pagamentos</option>
                <option value="a_receber">A receber</option>
                <option value="pago">Pago</option>
              </select>
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-[#64748B] text-[9px]">
                ▼
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* 3. CORPO: CARDS DE RESUMO DO PERÍODO & LISTAGEM */}
      <main className="flex-1 px-6 py-4 space-y-4 pb-36">
        
        {(pdfSuccessMessage || paymentToastMessage) && (
          <div
            role="status"
            className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-xl flex items-center gap-2 animate-fade-in"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>{paymentToastMessage || pdfSuccessMessage}</span>
          </div>
        )}

        {/* Cards de Resumo Dinâmicos */}
        <div className="grid grid-cols-2 gap-3">
          {/* Card Horas Apuradas */}
          <div className="bg-slate-100/90 border border-slate-200 rounded-2xl p-3.5 shadow-xs flex flex-col justify-between h-20">
            <div className="flex items-center gap-1.5 text-[#334155]">
              <Clock className="w-4 h-4" />
              <span className="text-xs font-bold">Total Horas</span>
            </div>
            <p id="summary-total-hours" className="text-xl font-extrabold text-[#0F172A]">
              {totalFilteredHours}h
            </p>
          </div>

          {/* Card Total Faturado */}
          <div className="bg-slate-100/90 border border-slate-200 rounded-2xl p-3.5 shadow-xs flex flex-col justify-between h-20">
            <div className="flex items-center gap-1.5 text-[#334155]">
              <DollarSign className="w-4 h-4" />
              <span className="text-xs font-bold">Total Faturado</span>
            </div>
            <p id="summary-total-billed" className="text-sm font-extrabold text-[#0F172A] truncate">
              {formatCurrencyBRL(totalFilteredAmount)}
            </p>
          </div>

          {/* Card Total Recebido / Pago */}
          <div className="bg-[#DCFCE7]/70 border border-[#86EFAC] rounded-2xl p-3.5 shadow-xs flex flex-col justify-between h-20">
            <div className="flex items-center gap-1.5 text-[#166534]">
              <CheckCircle2 className="w-4 h-4" />
              <span className="text-xs font-bold">Total Pago</span>
            </div>
            <p id="summary-total-paid" className="text-sm font-extrabold text-[#166534] truncate">
              {formatCurrencyBRL(totalPaidAmount)}
            </p>
          </div>

          {/* Card Total a Receber */}
          <div className="bg-[#FEF3C7]/70 border border-[#FDE68A] rounded-2xl p-3.5 shadow-xs flex flex-col justify-between h-20">
            <div className="flex items-center gap-1.5 text-[#B45309]">
              <DollarSign className="w-4 h-4" />
              <span className="text-xs font-bold">Total a Receber</span>
            </div>
            <p id="summary-total-receivable" className="text-sm font-extrabold text-[#B45309] truncate">
              {formatCurrencyBRL(totalReceivableAmount)}
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
            <div className="py-8 text-center bg-white border border-[#E2E8F0] rounded-2xl p-6 space-y-3">
              <div>
                <p className="text-sm font-bold text-[#0F172A]">Nenhum item cadastrado ainda</p>
                <p className="text-xs text-[#64748B] mt-1">
                  Nenhum registro encontrado. Ajuste os filtros ou cadastre novos serviços.
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
                      {service.client_name === 'Em andamento' || service.client_name === 'A definir'
                        ? 'Cliente a definir'
                        : service.client_name || 'Cliente a definir'}
                    </p>
                    <p className="text-xs text-[#64748B] font-medium truncate">
                      {service.machine_name} • {service.total_hours}h • {formatDateBr(service.service_date)}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1 flex-shrink-0 ml-2">
                  <span className="text-sm font-extrabold text-[#0F172A]">
                    {formatCurrencyBRL(service.total_amount)}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => handleTogglePaymentStatus(e, service)}
                      title="Clique para alternar status de pagamento"
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 transition-all cursor-pointer ${
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
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </main>

      {/* 4. BARRA DE AÇÕES RÁPIDAS (GERAR PDF E WHATSAPP) */}
      <div className="fixed bottom-[calc(max(0.75rem,env(safe-area-inset-bottom,0px))+3.25rem)] left-0 right-0 max-w-md mx-auto px-6 py-2.5 bg-white/95 backdrop-blur-xs border-t border-[#E2E8F0] z-30 flex items-center gap-2.5">
        {/* Botão Gerar PDF */}
        <button
          id="btn-generate-pdf"
          type="button"
          aria-expanded={isPdfMenuOpen}
          aria-haspopup="dialog"
          onClick={() => setIsPdfMenuOpen((prev) => !prev)}
          disabled={filteredServices.length === 0}
          className="flex-1 h-10 bg-[#0F172A] hover:bg-[#1E293B] active:scale-[0.98] text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <FileDown className="w-3.5 h-3.5 text-[#FBBF24]" />
          <span>Gerar PDF</span>
        </button>

        {/* Botão Enviar WhatsApp */}
        <button
          id="btn-share-whatsapp"
          type="button"
          onClick={handleShareWhatsApp}
          disabled={filteredServices.length === 0}
          className="flex-1 h-10 bg-[#16A34A] hover:bg-[#15803D] active:scale-[0.98] text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <MessageCircle className="w-3.5 h-3.5 fill-white" />
          <span>WhatsApp</span>
        </button>
      </div>

      {/* 5. MODAL BOTTOM SHEET: SELEÇÃO DE FORMATO DO RELATÓRIO PDF */}
      {isPdfMenuOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Opções de exportação do relatório PDF"
          className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in backdrop-blur-xs"
          onClick={() => setIsPdfMenuOpen(false)}
        >
          <div
            role="document"
            className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-2xl p-5 shadow-2xl space-y-4 border border-[#E2E8F0] pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] sm:pb-5 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cabeçalho do Bottom Sheet */}
            <div className="flex items-center justify-between pb-2 border-b border-[#F1F5F9]">
              <div>
                <h3 className="text-sm font-extrabold text-[#0F172A]">
                  Formato do Relatório PDF
                </h3>
                <p className="text-[11px] text-[#64748B]">
                  Selecione como os valores devem ser apresentados
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsPdfMenuOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-[#64748B] hover:bg-[#F1F5F9] cursor-pointer"
                aria-label="Fechar"
              >
                <X className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>

            {/* Opções de Exportação */}
            <div className="space-y-2.5">
              <button
                id="btn-report-pdf-with-pricing"
                type="button"
                role="menuitem"
                onClick={() => {
                  setIsPdfMenuOpen(false);
                  handleGeneratePdf(true);
                }}
                className="w-full p-3 rounded-xl hover:bg-amber-50/70 active:bg-amber-100/60 border border-slate-200 hover:border-amber-300 flex items-center gap-3 text-left transition-all cursor-pointer shadow-2xs"
              >
                <div className="w-10 h-10 rounded-xl bg-[#FEF3C7] text-[#B45309] flex items-center justify-center shrink-0">
                  <DollarSign className="w-5 h-5 stroke-[2.5]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-extrabold text-[#0F172A]">
                    Com Valores (Completo)
                  </p>
                  <p className="text-[11px] text-[#64748B] truncate">
                    Inclui tarifas e total ({formatCurrencyBRL(totalFilteredAmount)})
                  </p>
                </div>
              </button>

              <button
                id="btn-report-pdf-without-pricing"
                type="button"
                role="menuitem"
                onClick={() => {
                  setIsPdfMenuOpen(false);
                  handleGeneratePdf(false);
                }}
                className="w-full p-3 rounded-xl hover:bg-slate-100 active:bg-slate-200/70 border border-slate-200 hover:border-slate-300 flex items-center gap-3 text-left transition-all cursor-pointer shadow-2xs"
              >
                <div className="w-10 h-10 rounded-xl bg-slate-100 text-[#0F172A] flex items-center justify-center shrink-0">
                  <Clock className="w-5 h-5 stroke-[2.5]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-extrabold text-[#0F172A]">
                    Sem Valores (Apenas Horas)
                  </p>
                  <p className="text-[11px] text-[#64748B] truncate">
                    Exibe apenas horímetros e total de horas ({totalFilteredHours}h)
                  </p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. BARRA INFERIOR (BOTTOM NAVIGATION) */}
      <AdminBottomNav
        activeTab="financeiro"
        onNavigateToDashboard={onNavigateToDashboard}
        onNavigateToServices={onNavigateToServices}
        onNavigateToAgenda={onNavigateToAgenda}
        onNavigateToMachines={onNavigateToMachines}
      />
    </div>
  );
};

export default AdminHistory;
