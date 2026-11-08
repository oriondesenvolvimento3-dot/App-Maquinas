import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  fetchScheduledServices,
  createScheduledService,
  updateScheduledService,
  updateScheduledServiceStatus,
  deleteScheduledService,
  fetchOperators,
  fetchScheduleMachines,
  fetchKnownClients,
  type ScheduledServiceInput,
  type KnownClientSuggestion,
} from '../../services/agendaService';
import type {
  ScheduledService,
  ScheduledServicePeriod,
  ScheduledServiceStatus,
  Machine,
  Profile,
} from '../../types/database';
import { SYNC_COMPLETE_EVENT, toast } from '../../services/syncService';
import {
  formatDateBr,
  applyPhoneMask,
  formatCurrencyBRL,
} from '../../utils/formatters';
import { AdminBottomNav } from '../../components/AdminBottomNav';
import {
  Calendar,
  Plus,
  Search,
  Truck,
  User,
  MapPin,
  Clock,
  MessageCircle,
  RotateCcw,
  Edit2,
  CheckCircle2,
  XCircle,
  Trash2,
  X,
  Wrench,
  FileText,
  Phone,
  Loader2,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  List,
  DollarSign,
} from 'lucide-react';

export interface AdminAgendaProps {
  onNavigateToDashboard: () => void;
  onNavigateToServices: () => void;
  onNavigateToFinancial: () => void;
  onNavigateToMachines: () => void;
  onSelectServiceDetail?: (serviceId: string | number) => void;
}

type AgendaTab = 'proximos' | 'hoje' | 'historico';
type AgendaViewMode = 'calendar' | 'list';

const SERVICE_TYPE_OPTIONS = [
  'Terraplanagem',
  'Abertura de Valas',
  'Nivelamento de Terreno',
  'Limpeza de Terreno',
  'Drenagem',
  'Destoca',
  'Escavação de Açude / Tanque',
  'Carregamento de Caminhão',
  'Reboque / Guincho',
  'Outro',
];

const WEEKDAY_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

const MONTH_NAMES_PT = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

const WEEKDAY_FULL_PT = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
];

function toDateStr(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('T')[0].split('-').map(Number);
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d, 12, 0, 0);
}

function addDaysToDateStr(dateStr: string, days: number): string {
  const dt = parseLocalDate(dateStr);
  dt.setDate(dt.getDate() + days);
  return toDateStr(dt);
}

function getTodayStr(): string {
  return toDateStr(new Date());
}

function getTomorrowStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return toDateStr(d);
}

/**
 * Retorna os 7 dias da semana (Seg a Dom) que contêm a data `selectedDateStr`.
 */
function getWeekDays(selectedDateStr: string): Array<{
  dateStr: string;
  dayNumber: string;
  shortLabel: string;
  isToday: boolean;
}> {
  const ref = parseLocalDate(selectedDateStr);
  const jsDay = ref.getDay(); // 0 = Dom, 1 = Seg, ..., 6 = Sáb
  const diffToMonday = jsDay === 0 ? -6 : 1 - jsDay;

  const monday = new Date(ref);
  monday.setDate(ref.getDate() + diffToMonday);

  const today = getTodayStr();
  return Array.from({ length: 7 }, (_, idx) => {
    const cur = new Date(monday);
    cur.setDate(monday.getDate() + idx);
    const ds = toDateStr(cur);
    return {
      dateStr: ds,
      dayNumber: String(cur.getDate()).padStart(2, '0'),
      shortLabel: WEEKDAY_SHORT[idx],
      isToday: ds === today,
    };
  });
}

function formatMonthYearLabel(dateStr: string): string {
  const dt = parseLocalDate(dateStr);
  return `${MONTH_NAMES_PT[dt.getMonth()]} ${dt.getFullYear()}`;
}

function formatFullDayHeading(dateStr: string): string {
  const dt = parseLocalDate(dateStr);
  const weekday = WEEKDAY_FULL_PT[dt.getDay()];
  const day = String(dt.getDate()).padStart(2, '0');
  const month = MONTH_NAMES_PT[dt.getMonth()];
  return `${weekday}, ${day} de ${month}`;
}

function formatPeriodLabel(period: ScheduledServicePeriod): string {
  switch (period) {
    case 'manha':
      return 'Manhã';
    case 'tarde':
      return 'Tarde';
    case 'integral':
    default:
      return 'Integral';
  }
}

function formatPeriodTimeRange(period: ScheduledServicePeriod): string {
  switch (period) {
    case 'manha':
      return '07:00 – 12:00';
    case 'tarde':
      return '13:00 – 17:00';
    case 'integral':
    default:
      return '07:00 – 17:00';
  }
}

export const AdminAgenda: React.FC<AdminAgendaProps> = ({
  onNavigateToDashboard,
  onNavigateToServices,
  onNavigateToFinancial,
  onNavigateToMachines,
  onSelectServiceDetail: _onSelectServiceDetail,
}) => {
  const [schedules, setSchedules] = useState<ScheduledService[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [operators, setOperators] = useState<Profile[]>([]);
  const [knownClients, setKnownClients] = useState<KnownClientSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Alternador de Visão: 'calendar' (Dia / Semana com timeline) ou 'list' (Lista Geral)
  const [viewMode, setViewMode] = useState<AgendaViewMode>('calendar');

  // Data selecionada na Faixa Semanal Interativa (Weekly Strip)
  const [selectedDate, setSelectedDate] = useState<string>(() => getTodayStr());

  // Abas e filtros para o modo "Lista Geral"
  const [activeTab, setActiveTab] = useState<AgendaTab>('proximos');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterDate, setFilterDate] = useState<string>('');

  // Drawer Inferior (BottomSheet) de detalhes do agendamento selecionado
  const [detailSchedule, setDetailSchedule] = useState<ScheduledService | null>(null);

  // Toast de feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modal Novo / Editar Agendamento
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingSchedule, setEditingSchedule] = useState<ScheduledService | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Estados dos campos do formulário
  const [formClientName, setFormClientName] = useState<string>('');
  const [formClientPhone, setFormClientPhone] = useState<string>('');
  const [formServiceType, setFormServiceType] = useState<string>('');
  const [formDate, setFormDate] = useState<string>(() => getTodayStr());
  const [formPeriod, setFormPeriod] = useState<ScheduledServicePeriod>('integral');
  const [formMachineId, setFormMachineId] = useState<string>('');
  const [formOperatorId, setFormOperatorId] = useState<string>('');
  const [formOperatorCustomName, setFormOperatorCustomName] = useState<string>('');
  const [formLocation, setFormLocation] = useState<string>('');
  const [formEstimatedHours, setFormEstimatedHours] = useState<string>('');
  const [formAgreedRate, setFormAgreedRate] = useState<string>('');
  const [formObservations, setFormObservations] = useState<string>('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3800);
  };

  const loadAgendaData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [schedData, machData, opData, clientsData] = await Promise.all([
        fetchScheduledServices(),
        fetchScheduleMachines(),
        fetchOperators(),
        fetchKnownClients(),
      ]);
      setSchedules(schedData);
      setMachines(machData);
      setOperators(opData);
      setKnownClients(clientsData);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAgendaData();

    window.addEventListener(SYNC_COMPLETE_EVENT, loadAgendaData);
    return () => {
      window.removeEventListener(SYNC_COMPLETE_EVENT, loadAgendaData);
    };
  }, [loadAgendaData]);

  // Sincroniza o detailSchedule caso a lista seja recarregada
  useEffect(() => {
    if (!detailSchedule) return;
    const updated = schedules.find(
      (s) =>
        (s.server_id && s.server_id === detailSchedule.server_id) ||
        String(s.id) === String(detailSchedule.id)
    );
    if (updated) {
      setDetailSchedule(updated);
    }
  }, [schedules, detailSchedule]);

  const todayStr = useMemo(() => getTodayStr(), []);
  const tomorrowStr = useMemo(() => getTomorrowStr(), []);

  // Dias da semana ativa para a Weekly Strip
  const weekDays = useMemo(() => getWeekDays(selectedDate), [selectedDate]);

  // Mapa de agendamentos por data (YYYY-MM-DD) para os pontos indicadores na faixa semanal
  const schedulesByDateMap = useMemo(() => {
    const map = new Map<string, ScheduledService[]>();
    for (const s of schedules) {
      if (!s.scheduled_date) continue;
      const list = map.get(s.scheduled_date) || [];
      list.push(s);
      map.set(s.scheduled_date, list);
    }
    return map;
  }, [schedules]);

  // Agendamentos do dia selecionado na visão de Calendário
  const selectedDaySchedules = useMemo(() => {
    const list = schedulesByDateMap.get(selectedDate) || [];
    const periodOrder: Record<string, number> = {
      integral: 0,
      manha: 1,
      tarde: 2,
    };
    return [...list].sort((a, b) => {
      const pa = periodOrder[a.scheduled_period || a.period || 'integral'] ?? 1;
      const pb = periodOrder[b.scheduled_period || b.period || 'integral'] ?? 1;
      return pa - pb;
    });
  }, [schedulesByDateMap, selectedDate]);

  // Filtragem para o modo "Lista Geral"
  const filteredListSchedules = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return schedules.filter((item) => {
      const itemDate = item.scheduled_date;
      const isFinishedOrCancelled =
        item.status === 'concluido' || item.status === 'cancelado';

      if (filterDate) {
        if (itemDate !== filterDate) return false;
      } else {
        if (activeTab === 'hoje') {
          if (itemDate !== todayStr) return false;
        } else if (activeTab === 'proximos') {
          if (isFinishedOrCancelled) return false;
          if (itemDate < todayStr && item.status !== 'em_andamento') return false;
        } else if (activeTab === 'historico') {
          const isPast = itemDate < todayStr;
          if (!isFinishedOrCancelled && !isPast) return false;
        }
      }

      if (query) {
        const matchClient = item.client_name?.toLowerCase().includes(query);
        const matchMachine = item.machine_name?.toLowerCase().includes(query);
        const matchType = item.service_type?.toLowerCase().includes(query);
        const matchLocation = item.location?.toLowerCase().includes(query);
        if (!matchClient && !matchMachine && !matchType && !matchLocation) {
          return false;
        }
      }

      return true;
    });
  }, [schedules, activeTab, searchQuery, filterDate, todayStr]);

  // Navegação de Semana (< Anterior | Hoje | Próxima >)
  const handlePrevWeek = () => {
    setSelectedDate((prev) => addDaysToDateStr(prev, -7));
  };

  const handleNextWeek = () => {
    setSelectedDate((prev) => addDaysToDateStr(prev, 7));
  };

  const handleGoToToday = () => {
    setSelectedDate(getTodayStr());
  };

  // Abertura do modal de Novo Agendamento (aceita data e período pré-selecionados)
  const handleOpenNewModal = (
    presetDate?: string,
    presetPeriod: ScheduledServicePeriod = 'integral'
  ) => {
    setDetailSchedule(null);
    setEditingSchedule(null);
    setFormClientName('');
    setFormClientPhone('');
    setFormServiceType('');
    setFormDate(presetDate || selectedDate || getTodayStr());
    setFormPeriod(presetPeriod);
    setFormMachineId(machines[0]?.id || '');
    setFormOperatorId(operators[0]?.id || '');
    setFormOperatorCustomName('');
    setFormLocation('');
    setFormEstimatedHours('');
    setFormAgreedRate(
      machines[0]?.hourly_rate ? String(machines[0].hourly_rate) : ''
    );
    setFormObservations('');
    setFormError(null);
    setIsModalOpen(true);
  };

  // Abertura do modal para Edição de Agendamento
  const handleOpenEditModal = (item: ScheduledService) => {
    setDetailSchedule(null);
    setEditingSchedule(item);
    setFormClientName(item.client_name || '');
    setFormClientPhone(item.client_phone ? applyPhoneMask(item.client_phone) : '');
    setFormServiceType(item.service_type || '');
    setFormDate(item.scheduled_date || getTodayStr());
    setFormPeriod(item.scheduled_period || item.period || 'integral');
    setFormMachineId(item.machine_id || '');
    setFormOperatorId(item.operator_id || '');
    setFormOperatorCustomName(item.operator_name || '');
    setFormLocation(item.location || '');
    setFormEstimatedHours(
      item.estimated_hours !== undefined && item.estimated_hours !== null
        ? String(item.estimated_hours)
        : ''
    );
    setFormAgreedRate(
      item.agreed_rate !== undefined && item.agreed_rate !== null
        ? String(item.agreed_rate)
        : ''
    );
    setFormObservations(item.notes || item.observations || '');
    setFormError(null);
    setIsModalOpen(true);
  };

  // Autocompletar telefone quando seleciona um cliente já conhecido
  const handleClientNameChange = (value: string) => {
    setFormClientName(value);
    const match = knownClients.find(
      (c) => c.name.toLowerCase() === value.trim().toLowerCase()
    );
    if (match?.phone && !formClientPhone) {
      setFormClientPhone(applyPhoneMask(match.phone));
    }
  };

  // Salvar Agendamento (Novo ou Edição)
  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!formClientName.trim()) {
      setFormError('Informe o nome do cliente.');
      return;
    }
    if (!formServiceType.trim()) {
      setFormError('Informe o tipo de serviço.');
      return;
    }
    if (!formDate) {
      setFormError('Selecione a data do agendamento.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    const selectedMachine = machines.find((m) => m.id === formMachineId);
    const selectedOperator = operators.find((op) => op.id === formOperatorId);

    const parsedEstimatedHours =
      formEstimatedHours.trim() !== ''
        ? parseFloat(formEstimatedHours.replace(',', '.'))
        : null;
    const parsedAgreedRate =
      formAgreedRate.trim() !== ''
        ? parseFloat(formAgreedRate.replace(',', '.'))
        : null;

    const payload: ScheduledServiceInput = {
      client_name: formClientName.trim(),
      client_phone: formClientPhone.trim() || null,
      service_type: formServiceType.trim() || 'Terraplanagem',
      scheduled_date: formDate,
      scheduled_period: formPeriod,
      period: formPeriod,
      machine_id: formMachineId || null,
      machine_name: selectedMachine?.name || null,
      operator_id: formOperatorId || null,
      operator_name:
        selectedOperator?.full_name || formOperatorCustomName.trim() || null,
      location: formLocation.trim() || null,
      estimated_hours:
        parsedEstimatedHours !== null && !isNaN(parsedEstimatedHours)
          ? parsedEstimatedHours
          : null,
      agreed_rate:
        parsedAgreedRate !== null && !isNaN(parsedAgreedRate)
          ? parsedAgreedRate
          : null,
      notes: formObservations.trim() || null,
      observations: formObservations.trim() || null,
    };

    if (editingSchedule && editingSchedule.id !== undefined) {
      const res = await updateScheduledService(editingSchedule.id, payload);
      setIsSubmitting(false);
      if (res.success) {
        setIsModalOpen(false);
        setSelectedDate(formDate);
        showToast('Agendamento atualizado no Supabase com sucesso!');
        await loadAgendaData();
      } else {
        setFormError(res.error || 'Erro ao atualizar agendamento no Supabase.');
      }
    } else {
      const res = await createScheduledService(payload);
      setIsSubmitting(false);
      if (res.success) {
        setIsModalOpen(false);
        setSelectedDate(formDate);
        showToast('Novo agendamento gravado no Supabase com sucesso!');
        await loadAgendaData();
      } else {
        setFormError(res.error || 'Erro ao criar agendamento no Supabase.');
      }
    }
  };

  // Ação Rápida: Abrir WhatsApp com o cliente
  const handleWhatsAppClient = (item: ScheduledService) => {
    const rawDigits = (item.client_phone || '').replace(/\D/g, '');
    const dateBr = formatDateBr(item.scheduled_date);
    const periodLabel = formatPeriodLabel(item.scheduled_period || item.period);
    const machineText = item.machine_name ? ` (${item.machine_name})` : '';
    const message =
      `Olá *${item.client_name}*! Confirmando nosso agendamento de *${item.service_type}*${machineText} ` +
      `para o dia *${dateBr}* no período *${periodLabel}*.`;

    const encoded = encodeURIComponent(message);
    if (rawDigits.length >= 10) {
      const fullPhone = rawDigits.startsWith('55') ? rawDigits : `55${rawDigits}`;
      window.open(`https://wa.me/${fullPhone}?text=${encoded}`, '_blank');
    } else {
      window.open(`https://wa.me/?text=${encoded}`, '_blank');
    }
  };

  // Ação Rápida: Alterar status (Concluído / Agendado / Cancelado) diretamente no Supabase
  const handleChangeStatus = async (
    item: ScheduledService,
    newStatus: ScheduledServiceStatus
  ) => {
    const targetId = item.server_id ?? item.id;
    if (targetId === undefined || targetId === null) return;

    // Feedback visual imediato no BottomSheet e no card da timeline/semana
    setDetailSchedule((prev) =>
      prev ? { ...prev, status: newStatus } : null
    );
    setSchedules((prev) =>
      prev.map((s) =>
        (s.server_id && s.server_id === item.server_id) ||
        String(s.id) === String(item.id)
          ? { ...s, status: newStatus }
          : s
      )
    );

    const res = await updateScheduledServiceStatus(targetId, newStatus);
    if (res.success) {
      if (newStatus === 'concluido') {
        toast.success('Agendamento concluído!');
        showToast('Agendamento concluído!');
      } else if (newStatus === 'agendado') {
        toast.success('Agendamento reaberto como Agendado!');
        showToast('Agendamento reaberto como Agendado!');
      } else if (newStatus === 'cancelado') {
        toast.success('Agendamento cancelado.');
        showToast('Agendamento cancelado.');
      }
      await loadAgendaData();
    } else {
      await loadAgendaData();
    }
  };

  // Ação Rápida: Excluir Agendamento permanentemente no Supabase
  const handleDeleteSchedule = async (item: ScheduledService) => {
    const targetId = item.server_id ?? item.id;
    if (targetId === undefined || targetId === null) return;
    const res = await deleteScheduledService(targetId);
    if (res.success) {
      setDetailSchedule(null);
      showToast('Agendamento removido.');
      await loadAgendaData();
    }
  };

  const renderStatusBadge = (status: ScheduledServiceStatus) => {
    switch (status) {
      case 'em_andamento':
        return (
          <span className="px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200/70 rounded-md text-[11px] font-semibold inline-flex items-center gap-1 shrink-0 whitespace-nowrap">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
            Em Andamento
          </span>
        );
      case 'concluido':
        return (
          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200/60 rounded-md text-[11px] font-semibold inline-flex items-center gap-1 shrink-0 whitespace-nowrap">
            <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
            Concluído
          </span>
        );
      case 'cancelado':
        return (
          <span className="px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-200/60 rounded-md text-[11px] font-semibold shrink-0 whitespace-nowrap">
            Cancelado
          </span>
        );
      case 'agendado':
      default:
        return (
          <span className="px-2 py-0.5 bg-slate-100 text-slate-700 border border-slate-200 rounded-md text-[11px] font-semibold shrink-0 whitespace-nowrap">
            Agendado
          </span>
        );
    }
  };

  /**
   * Define estilo visual sóbrio e corporativo: fundo neutro + borda sutil + indicador lateral discreto
   */
  const getTimelineBlockStyle = (item: ScheduledService) => {
    switch (item.status) {
      case 'em_andamento':
        return 'bg-white hover:bg-slate-50/80 border-slate-200/80 border-l-[3px] border-l-amber-500 shadow-sm';
      case 'concluido':
        return 'bg-white hover:bg-slate-50/80 border-slate-200/80 border-l-[3px] border-l-emerald-600 shadow-sm';
      case 'cancelado':
        return 'bg-white hover:bg-slate-50/80 border-slate-200/80 border-l-[3px] border-l-slate-300 opacity-60 shadow-sm';
      case 'agendado':
      default:
        return 'bg-white hover:bg-slate-50/80 border-slate-200/80 border-l-[3px] border-l-slate-400 shadow-sm';
    }
  };

  /**
   * Renderiza um Bloco de Serviço Minimalista e Compacto (estilo Google Calendar)
   */
  const renderTimelineServiceBlock = (item: ScheduledService) => {
    const period = item.scheduled_period || item.period || 'integral';
    const cardKey =
      item.id ?? item.server_id ?? `${item.client_name}-${item.scheduled_date}`;
    const operatorFirstName = item.operator_name
      ? item.operator_name.trim().split(/\s+/)[0]
      : 'A definir';
    const priceLabel =
      item.agreed_rate !== null && item.agreed_rate !== undefined
        ? formatCurrencyBRL(item.agreed_rate)
        : null;

    return (
      <div
        key={cardKey}
        role="button"
        tabIndex={0}
        onClick={() => setDetailSchedule(item)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setDetailSchedule(item);
          }
        }}
        className={`w-full min-w-0 overflow-hidden text-left border rounded-xl p-3 transition-all cursor-pointer active:scale-[0.99] space-y-1.5 ${getTimelineBlockStyle(
          item
        )}`}
      >
        {/* Topo do card: Horário à esquerda e Badge de Status à direita */}
        <div className="flex items-center justify-between gap-1.5 min-w-0">
          <span className="text-[11px] font-medium text-slate-500 truncate">
            {formatPeriodTimeRange(period)}
          </span>
          {renderStatusBadge(item.status)}
        </div>

        {/* Meio do card: Nome do Cliente em destaque e Tipo de Serviço */}
        <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 min-w-0">
          <span className="font-semibold text-sm text-slate-900 truncate max-w-full">
            {item.client_name}
          </span>
          <span className="text-xs text-slate-500 font-normal truncate max-w-full">
            • {item.service_type}
          </span>
        </div>

        {/* Rodapé do card: Tags compactas de Máquina / Operador à esquerda e Valor à direita */}
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 pt-0.5 min-w-0">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-slate-600 min-w-0">
            <span className="inline-flex items-center gap-1 min-w-0 max-w-[130px]">
              <Truck className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="truncate">{item.machine_name || 'A definir'}</span>
            </span>
            <span className="inline-flex items-center gap-1 min-w-0 max-w-[100px]">
              <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="truncate">{operatorFirstName}</span>
            </span>
          </div>

          {priceLabel && (
            <span className="text-xs font-semibold text-slate-800 shrink-0 ml-auto whitespace-nowrap">
              {priceLabel}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="relative flex flex-col justify-between w-full max-w-md mx-auto min-h-screen overflow-x-hidden overflow-y-auto bg-[#F8FAFC] shadow-2xl pb-24">
      {/* Toast de Feedback */}
      {toastMessage && (
        <div
          role="status"
          className="fixed top-[max(1rem,env(safe-area-inset-top))] left-1/2 -translate-x-1/2 z-50 max-w-sm w-[calc(100%-2rem)] px-4 py-3 bg-[#0F172A] text-white text-xs font-bold rounded-2xl shadow-xl border border-slate-700 flex items-center gap-2.5 animate-fade-in"
        >
          <CheckCircle2 className="w-4 h-4 text-[#FBBF24] shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 1. TOPO / CABEÇALHO DE NAVEGAÇÃO TEMPORAL (MOBILE-FIRST) */}
      <header className="px-3.5 sm:px-5 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] pb-3 bg-white border-b border-[#E2E8F0] sticky top-0 z-20 space-y-2.5">
        {/* Segmented Control 100% da largura no mobile ("Dia / Semana" vs "Lista Geral") */}
        <div className="grid grid-cols-2 w-full bg-[#F1F5F9] p-1 rounded-xl border border-[#E2E8F0]">
          <button
            id="btn-view-calendar"
            type="button"
            onClick={() => setViewMode('calendar')}
            className={`w-full py-1.5 px-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              viewMode === 'calendar'
                ? 'bg-white text-[#0F172A] shadow-2xs'
                : 'text-[#64748B] hover:text-[#0F172A]'
            }`}
          >
            <CalendarDays className="w-3.5 h-3.5 text-[#F59E0B] shrink-0" />
            <span className="truncate">Dia / Semana</span>
          </button>

          <button
            id="btn-view-list"
            type="button"
            onClick={() => setViewMode('list')}
            className={`w-full py-1.5 px-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              viewMode === 'list'
                ? 'bg-white text-[#0F172A] shadow-2xs'
                : 'text-[#64748B] hover:text-[#0F172A]'
            }`}
          >
            <List className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Lista Geral</span>
          </button>
        </div>

        {/* Linha do Mês e Botão "+ Novo Agendamento" */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 min-w-0">
            {viewMode === 'calendar' ? (
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <div className="flex items-center bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-0.5 shrink-0">
                  <button
                    id="btn-prev-week"
                    type="button"
                    onClick={handlePrevWeek}
                    aria-label="Semana anterior"
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-[#0F172A] hover:bg-white transition-colors cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4 stroke-[2.5]" />
                  </button>
                  <button
                    id="btn-next-week"
                    type="button"
                    onClick={handleNextWeek}
                    aria-label="Próxima semana"
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-[#0F172A] hover:bg-white transition-colors cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4 stroke-[2.5]" />
                  </button>
                </div>

                <div className="min-w-0 flex items-center gap-2 flex-wrap">
                  <h1 className="text-base font-extrabold text-[#0F172A] tracking-tight leading-tight truncate">
                    {formatMonthYearLabel(selectedDate)}
                  </h1>
                  {selectedDate !== todayStr && (
                    <button
                      id="btn-jump-today"
                      type="button"
                      onClick={handleGoToToday}
                      className="text-[10px] font-extrabold text-[#B45309] bg-[#FEF3C7] hover:bg-[#FDE68A] px-2 py-0.5 rounded-full transition-colors cursor-pointer shrink-0"
                    >
                      Hoje
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="min-w-0">
                <h1 className="text-base font-extrabold text-[#0F172A] tracking-tight truncate">
                  Agenda de Serviços
                </h1>
              </div>
            )}
          </div>

          <button
            id="btn-new-schedule"
            type="button"
            onClick={() => handleOpenNewModal(selectedDate)}
            className="w-full h-10 px-3.5 bg-[#FBBF24] hover:bg-[#F59E0B] active:scale-[0.99] text-[#0F172A] font-extrabold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5] shrink-0" />
            <span>+ Novo Agendamento</span>
          </button>
        </div>

        {/* FAIXA SEMANAL INTERATIVA (WEEKLY STRIP) - Visível no modo Calendário */}
        {viewMode === 'calendar' ? (
          <div
            role="tablist"
            aria-label="Dias da semana"
            className="grid grid-cols-7 gap-1 pt-0.5"
          >
            {weekDays.map((day) => {
              const isSelected = day.dateStr === selectedDate;
              const daySchedules = schedulesByDateMap.get(day.dateStr) || [];
              const activeSchedulesCount = daySchedules.filter(
                (s) => s.status !== 'cancelado'
              ).length;

              return (
                <button
                  key={day.dateStr}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => setSelectedDate(day.dateStr)}
                  className={`py-1.5 px-0.5 rounded-xl flex flex-col items-center justify-center transition-all cursor-pointer relative border min-w-0 ${
                    isSelected
                      ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                      : day.isToday
                      ? 'bg-white text-slate-900 border-slate-300 font-bold hover:bg-slate-50'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <span
                    className={`text-[9px] font-bold uppercase tracking-tight ${
                      isSelected
                        ? 'text-slate-300'
                        : day.isToday
                        ? 'text-slate-800'
                        : 'text-slate-500'
                    }`}
                  >
                    {day.shortLabel}
                  </span>

                  <span
                    className={`text-xs sm:text-sm font-extrabold mt-0.5 ${
                      isSelected ? 'text-white' : 'text-slate-900'
                    }`}
                  >
                    {day.dayNumber}
                  </span>

                  {/* Ponto Indicador de Agendamentos no Dia (Sóbrio e Minimalista) */}
                  <div className="h-2 flex items-center justify-center gap-0.5 mt-0.5">
                    {activeSchedulesCount > 0 ? (
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          isSelected ? 'bg-white' : 'bg-slate-600'
                        }`}
                      />
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-transparent" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          /* FILTROS DO MODO LISTA GERAL */
          <div className="space-y-2.5 pt-0.5">
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] pb-0.5">
              <button
                id="tab-agenda-proximos"
                type="button"
                onClick={() => setActiveTab('proximos')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === 'proximos'
                    ? 'bg-[#0F172A] text-white shadow-xs'
                    : 'bg-[#F8FAFC] text-[#64748B] border border-[#E2E8F0] hover:border-[#CBD5E1]'
                }`}
              >
                Próximos
              </button>

              <button
                id="tab-agenda-hoje"
                type="button"
                onClick={() => setActiveTab('hoje')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === 'hoje'
                    ? 'bg-[#0F172A] text-white shadow-xs'
                    : 'bg-[#F8FAFC] text-[#64748B] border border-[#E2E8F0] hover:border-[#CBD5E1]'
                }`}
              >
                Hoje
              </button>

              <button
                id="tab-agenda-historico"
                type="button"
                onClick={() => setActiveTab('historico')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === 'historico'
                    ? 'bg-[#0F172A] text-white shadow-xs'
                    : 'bg-[#F8FAFC] text-[#64748B] border border-[#E2E8F0] hover:border-[#CBD5E1]'
                }`}
              >
                Histórico / Concluídos
              </button>
            </div>

            <div className="grid grid-cols-12 gap-2">
              <div className="col-span-7 relative">
                <Search className="w-3.5 h-3.5 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="input-agenda-search"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar cliente ou máquina..."
                  className="w-full h-9 pl-8 pr-3 bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl text-xs font-medium text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                />
              </div>

              <div className="col-span-5 relative flex items-center">
                <input
                  id="input-agenda-date-filter"
                  type="date"
                  aria-label="Filtrar por data"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  className="w-full h-9 px-2.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl text-xs font-semibold text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                />
                {filterDate && (
                  <button
                    type="button"
                    onClick={() => setFilterDate('')}
                    title="Limpar filtro de data"
                    className="absolute right-1.5 w-5 h-5 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-[10px] hover:bg-slate-300 cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </header>

      {/* 2. CORPO PRINCIPAL: VISÃO EM GRADE DE HORÁRIOS OU LISTA GERAL */}
      <main className="flex-1 px-3.5 sm:px-5 py-3 space-y-3 w-full overflow-hidden">
        {isLoading ? (
          <div className="py-14 text-center text-xs font-semibold text-[#64748B] flex flex-col items-center gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-[#FBBF24]" />
            <span>Carregando agenda de serviços...</span>
          </div>
        ) : viewMode === 'calendar' ? (
          /* =========================================================
           * MODO 1: CALENDÁRIO DIÁRIO (LISTA DE AGENDAMENTOS DO DIA)
           * ========================================================= */
          <div className="space-y-3 w-full overflow-hidden">
            {/* Subtítulo da Data Selecionada */}
            <div className="flex flex-wrap items-center justify-between gap-1.5 px-0.5">
              <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                <h2 className="text-xs sm:text-sm font-extrabold text-[#0F172A] capitalize truncate">
                  {formatFullDayHeading(selectedDate)}
                </h2>
                {selectedDate === todayStr && (
                  <span className="px-2 py-0.5 bg-[#FEF3C7] text-[#B45309] border border-[#FDE68A] rounded-full text-[10px] font-extrabold uppercase shrink-0">
                    Hoje
                  </span>
                )}
                {selectedDate === tomorrowStr && (
                  <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-[10px] font-extrabold uppercase shrink-0">
                    Amanhã
                  </span>
                )}
              </div>

              <span className="text-[11px] font-semibold text-[#64748B] shrink-0 whitespace-nowrap ml-auto">
                {selectedDaySchedules.length === 0
                  ? 'Nenhum agendamento'
                  : `${selectedDaySchedules.length} ${
                      selectedDaySchedules.length === 1
                        ? 'agendamento'
                        : 'agendamentos'
                    }`}
              </span>
            </div>

            {/* Listagem limpa e direta dos cards de serviços agendados para a data */}
            {selectedDaySchedules.length > 0 ? (
              <div className="space-y-2.5 w-full min-w-0">
                {selectedDaySchedules.map((item) => renderTimelineServiceBlock(item))}
              </div>
            ) : (
              <div className="py-12 text-center bg-white border border-[#E2E8F0] rounded-2xl p-6 space-y-3 shadow-2xs">
                <div className="w-12 h-12 rounded-full bg-[#FEF3C7] text-[#B45309] flex items-center justify-center mx-auto">
                  <Calendar className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-bold text-[#0F172A]">
                    Nenhum serviço agendado para este dia.
                  </p>
                  <p className="text-xs text-[#64748B]">
                    Aproveite para programar um novo serviço nesta data.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleOpenNewModal(selectedDate)}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-[#FBBF24] hover:bg-[#F59E0B] text-[#0F172A] font-extrabold text-xs rounded-xl shadow-xs transition-all cursor-pointer active:scale-[0.99]"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>+ Agendar Serviço</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          /* =========================================================
           * MODO 2: LISTA GERAL CORRIDA (BUSCA RÁPIDA POR NOME/DATA)
           * ========================================================= */
          <div className="space-y-3">
            {filteredListSchedules.length === 0 ? (
              <div className="py-10 text-center bg-white border border-[#E2E8F0] rounded-2xl p-6 space-y-3">
                <div className="w-11 h-11 rounded-full bg-[#FEF3C7] text-[#B45309] flex items-center justify-center mx-auto">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-[#0F172A]">
                    Nenhum item cadastrado ainda
                  </p>
                  <p className="text-xs text-[#64748B] mt-1">
                    Nenhum agendamento encontrado. Programe o primeiro serviço na agenda.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleOpenNewModal(selectedDate)}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-[#FBBF24] hover:bg-[#F59E0B] text-[#0F172A] font-extrabold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>+ Cadastrar Agendamento</span>
                </button>
              </div>
            ) : (
              filteredListSchedules.map((item) => {
                const isToday = item.scheduled_date === todayStr;
                const isTomorrow = item.scheduled_date === tomorrowStr;
                const cardKey =
                  item.id ??
                  item.server_id ??
                  `${item.client_name}-${item.scheduled_date}`;

                return (
                  <div
                    key={cardKey}
                    onClick={() => setDetailSchedule(item)}
                    className={`rounded-2xl border p-4 shadow-xs transition-all cursor-pointer space-y-2.5 ${getTimelineBlockStyle(
                      item
                    )}`}
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="inline-flex items-center gap-1 text-xs font-extrabold text-[#0F172A]">
                          <Calendar className="w-3.5 h-3.5 text-[#F59E0B]" />
                          {formatDateBr(item.scheduled_date)}
                        </span>

                        {isToday && (
                          <span className="px-2 py-0.5 bg-[#FEF3C7] text-[#B45309] border border-[#FDE68A] rounded-full text-[10px] font-extrabold uppercase">
                            Hoje
                          </span>
                        )}
                        {isTomorrow && (
                          <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-[10px] font-extrabold uppercase">
                            Amanhã
                          </span>
                        )}

                        <span className="px-2 py-0.5 bg-white/80 text-[#475569] rounded-full text-[10px] font-bold">
                          {formatPeriodLabel(item.scheduled_period || item.period)}
                        </span>
                      </div>

                      {renderStatusBadge(item.status)}
                    </div>

                    <div>
                      <h3 className="text-base font-extrabold text-[#0F172A] leading-snug">
                        {item.client_name}
                      </h3>
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 mt-0.5">
                        <Wrench className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{item.service_type}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 font-medium">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-50 border border-slate-200/80 text-[11px] font-bold text-slate-800">
                        <Truck className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span>{item.machine_name || 'Máquina a definir'}</span>
                      </span>

                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-50 border border-slate-200/80 text-[11px] font-semibold text-slate-600">
                        <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{item.operator_name || 'Operador a definir'}</span>
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </main>

      {/* 3. DRAWER INFERIOR (BOTTOMSHEET) COM DETALHES DO AGENDAMENTO E AÇÕES RÁPIDAS */}
      {detailSchedule && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Detalhes do Agendamento"
          onClick={() => setDetailSchedule(null)}
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl max-h-[90vh] overflow-y-auto p-6 shadow-2xl space-y-4"
          >
            {/* Alça superior do BottomSheet */}
            <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto -mt-1 mb-1 sm:hidden" />

            {/* Cabeçalho do Drawer */}
            <div className="flex items-start justify-between gap-3 border-b border-[#F1F5F9] pb-3.5">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  {renderStatusBadge(detailSchedule.status)}
                  <span className="text-xs font-extrabold text-[#475569] inline-flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-[#F59E0B]" />
                    {formatDateBr(detailSchedule.scheduled_date)} •{' '}
                    {formatPeriodTimeRange(
                      detailSchedule.scheduled_period || detailSchedule.period
                    )}
                  </span>
                </div>
                <h2 className="text-lg font-extrabold text-[#0F172A] leading-snug pt-0.5">
                  {detailSchedule.service_type}
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setDetailSchedule(null)}
                aria-label="Fechar detalhes"
                className="w-8 h-8 rounded-full flex items-center justify-center text-[#64748B] hover:bg-[#F1F5F9] cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Card do Cliente + Botão Direto de WhatsApp */}
            <div className="p-4 bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
                  Cliente / Contratante
                </p>
                <p className="text-base font-extrabold text-[#0F172A] truncate">
                  {detailSchedule.client_name}
                </p>
                <p className="text-xs font-semibold text-[#475569] mt-0.5">
                  {detailSchedule.client_phone || 'Telefone não informado'}
                </p>
              </div>

              <button
                type="button"
                onClick={() => handleWhatsAppClient(detailSchedule)}
                className="h-10 px-3.5 bg-[#10B981] hover:bg-[#059669] active:scale-[0.98] text-white font-extrabold text-xs rounded-xl shadow-xs flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
              >
                <MessageCircle className="w-4 h-4" />
                <span>WhatsApp</span>
              </button>
            </div>

            {/* Detalhes Operacionais: Máquina, Operador, Local, Horas Estimadas e Valor */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#64748B] flex items-center gap-1">
                  <Truck className="w-3.5 h-3.5 text-[#F59E0B]" />
                  <span>Máquina</span>
                </p>
                <p className="text-xs font-extrabold text-[#0F172A] mt-1 truncate">
                  {detailSchedule.machine_name || 'A definir'}
                </p>
              </div>

              <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#64748B] flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-[#F59E0B]" />
                  <span>Operador</span>
                </p>
                <p className="text-xs font-extrabold text-[#0F172A] mt-1 truncate">
                  {detailSchedule.operator_name || 'A definir'}
                </p>
              </div>

              <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#64748B] flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-[#F59E0B]" />
                  <span>Horas Estimadas</span>
                </p>
                <p className="text-xs font-extrabold text-[#0F172A] mt-1">
                  {detailSchedule.estimated_hours !== null &&
                  detailSchedule.estimated_hours !== undefined
                    ? `${detailSchedule.estimated_hours}h`
                    : 'Não informada'}
                </p>
              </div>

              <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#64748B] flex items-center gap-1">
                  <DollarSign className="w-3.5 h-3.5 text-[#F59E0B]" />
                  <span>Valor Combinado</span>
                </p>
                <p className="text-xs font-extrabold text-[#0F172A] mt-1">
                  {detailSchedule.agreed_rate !== null &&
                  detailSchedule.agreed_rate !== undefined
                    ? `${formatCurrencyBRL(detailSchedule.agreed_rate)}/h`
                    : 'Padrão da máquina'}
                </p>
              </div>
            </div>

            {/* Endereço / Localização da Obra */}
            {detailSchedule.location && (
              <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl flex items-start gap-2.5">
                <MapPin className="w-4 h-4 text-[#F59E0B] shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
                    Endereço / Local da Obra
                  </p>
                  <p className="text-xs font-bold text-[#0F172A] mt-0.5">
                    {detailSchedule.location}
                  </p>
                </div>
              </div>
            )}

            {/* Observações do Acordo */}
            {(detailSchedule.notes || detailSchedule.observations) && (
              <div className="p-3 bg-amber-50/60 border border-amber-200/80 rounded-xl">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#B45309]">
                  Observações do Acordo
                </p>
                <p className="text-xs font-medium text-[#0F172A] mt-0.5">
                  {detailSchedule.notes || detailSchedule.observations}
                </p>
              </div>
            )}

            {/* Botões de Ação no Drawer: Marcar como Concluído / Reabrir | Editar Agendamento | Cancelar | Excluir */}
            <div className="space-y-2.5 pt-2 border-t border-[#F1F5F9]">
              {detailSchedule.status === 'concluido' ? (
                <button
                  id="btn-drawer-reopen-service"
                  type="button"
                  onClick={() => handleChangeStatus(detailSchedule, 'agendado')}
                  className="w-full h-12 bg-slate-100 hover:bg-slate-200 border border-slate-300 active:scale-[0.99] text-slate-800 font-extrabold text-xs rounded-xl shadow-2xs flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4 text-slate-600" />
                  <span>Reabrir / Marcar como Agendado</span>
                </button>
              ) : (
                <button
                  id="btn-drawer-complete-service"
                  type="button"
                  onClick={() => handleChangeStatus(detailSchedule, 'concluido')}
                  className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-extrabold text-xs rounded-xl shadow-sm flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Marcar como Concluído</span>
                </button>
              )}

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  id="btn-drawer-edit-schedule"
                  type="button"
                  onClick={() => handleOpenEditModal(detailSchedule)}
                  className="h-11 bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#CBD5E1] text-[#0F172A] font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <Edit2 className="w-3.5 h-3.5 text-[#64748B]" />
                  <span>Editar Agendamento</span>
                </button>

                <button
                  id="btn-drawer-cancel-schedule"
                  type="button"
                  disabled={detailSchedule.status === 'cancelado'}
                  onClick={() => handleChangeStatus(detailSchedule, 'cancelado')}
                  className="h-11 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>Cancelar</span>
                </button>
              </div>

              <button
                id="btn-drawer-delete-schedule"
                type="button"
                onClick={() => handleDeleteSchedule(detailSchedule)}
                className="w-full py-2 text-[11px] font-bold text-red-500 hover:text-red-700 flex items-center justify-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Excluir agendamento permanentemente</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. MODAL / FORMULÁRIO DE NOVO OU EDIÇÃO DE AGENDAMENTO */}
      {isModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-schedule-title"
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
        >
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl max-h-[92vh] overflow-y-auto p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#F1F5F9] pb-3">
              <div>
                <h2
                  id="modal-schedule-title"
                  className="text-base font-extrabold text-[#0F172A]"
                >
                  {editingSchedule ? 'Editar Agendamento' : 'Novo Agendamento'}
                </h2>
                <p className="text-[11px] text-[#64748B]">
                  Preencha os dados para reservar na agenda
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-[#64748B] hover:bg-[#F1F5F9] cursor-pointer"
                aria-label="Fechar modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div
                role="alert"
                className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-bold rounded-xl"
              >
                {formError}
              </div>
            )}

            <form onSubmit={handleSaveSchedule} className="space-y-3.5">
              {/* Cliente com autocompletar do histórico */}
              <div>
                <label
                  htmlFor="schedule-client-name"
                  className="block text-[11px] font-bold text-[#475569] uppercase tracking-wider mb-1"
                >
                  Cliente *
                </label>
                <input
                  id="schedule-client-name"
                  type="text"
                  list="known-clients-list"
                  required
                  value={formClientName}
                  onChange={(e) => handleClientNameChange(e.target.value)}
                  placeholder="Nome do cliente ou fazenda/obra"
                  className="w-full h-11 px-3.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl text-sm font-semibold text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                />
                <datalist id="known-clients-list">
                  {knownClients.map((c) => (
                    <option key={c.name} value={c.name} />
                  ))}
                </datalist>
              </div>

              {/* WhatsApp do Cliente com máscara */}
              <div>
                <label
                  htmlFor="schedule-client-phone"
                  className="block text-[11px] font-bold text-[#475569] uppercase tracking-wider mb-1"
                >
                  WhatsApp do Cliente
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="schedule-client-phone"
                    type="tel"
                    inputMode="numeric"
                    value={formClientPhone}
                    onChange={(e) => setFormClientPhone(applyPhoneMask(e.target.value))}
                    placeholder="(00) 00000-0000"
                    className="w-full h-11 pl-10 pr-3.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl text-sm font-semibold text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                  />
                </div>
              </div>

              {/* Tipo de Serviço */}
              <div>
                <label
                  htmlFor="schedule-service-type"
                  className="block text-[11px] font-bold text-[#475569] uppercase tracking-wider mb-1"
                >
                  Tipo de Serviço *
                </label>
                <input
                  id="schedule-service-type"
                  type="text"
                  list="service-types-list"
                  value={formServiceType}
                  onChange={(e) => setFormServiceType(e.target.value)}
                  placeholder="Ex: Terraplanagem, Guincho, Abertura de Valas..."
                  required
                  className="w-full h-11 px-3.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl text-sm font-semibold text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                />
                <datalist id="service-types-list">
                  {SERVICE_TYPE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt} />
                  ))}
                </datalist>
              </div>

              {/* Data do Agendamento */}
              <div>
                <label
                  htmlFor="schedule-date"
                  className="block text-[11px] font-bold text-[#475569] uppercase tracking-wider mb-1"
                >
                  Data do Agendamento *
                </label>
                <input
                  id="schedule-date"
                  type="date"
                  required
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="w-full h-11 px-3.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl text-sm font-semibold text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                />
              </div>

              {/* Máquina (largura total) */}
              <div>
                <label
                  htmlFor="schedule-machine"
                  className="block text-[11px] font-bold text-[#475569] uppercase tracking-wider mb-1"
                >
                  Máquina
                </label>
                <select
                  id="schedule-machine"
                  value={formMachineId}
                  onChange={(e) => setFormMachineId(e.target.value)}
                  className="w-full h-11 px-3 bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl text-xs font-semibold text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                >
                  <option value="">A definir</option>
                  {machines.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Local / Endereço da Obra */}
              <div>
                <label
                  htmlFor="schedule-location"
                  className="block text-[11px] font-bold text-[#475569] uppercase tracking-wider mb-1"
                >
                  Local / Endereço da Obra (opcional)
                </label>
                <div className="relative">
                  <MapPin className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="schedule-location"
                    type="text"
                    value={formLocation}
                    onChange={(e) => setFormLocation(e.target.value)}
                    placeholder="Ex: Estrada Vicinal Km 4, Sítio São José"
                    className="w-full h-11 pl-10 pr-3.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl text-xs font-semibold text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                  />
                </div>
              </div>

              {/* Valor/Taxa Combinada (largura total) */}
              <div>
                <label
                  htmlFor="schedule-agreed-rate"
                  className="block text-[11px] font-bold text-[#475569] uppercase tracking-wider mb-1"
                >
                  Valor Combinado R$ (opcional)
                </label>
                <div className="relative">
                  <FileText className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="schedule-agreed-rate"
                    type="text"
                    inputMode="decimal"
                    value={formAgreedRate}
                    onChange={(e) => setFormAgreedRate(e.target.value)}
                    placeholder="Ex: 180.00"
                    className="w-full h-11 pl-9 pr-3 bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl text-xs font-semibold text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                  />
                </div>
              </div>

              {/* Observações / Detalhes do Acordo */}
              <div>
                <label
                  htmlFor="schedule-observations"
                  className="block text-[11px] font-bold text-[#475569] uppercase tracking-wider mb-1"
                >
                  Observações / Detalhes do Acordo
                </label>
                <textarea
                  id="schedule-observations"
                  rows={2}
                  value={formObservations}
                  onChange={(e) => setFormObservations(e.target.value)}
                  placeholder="Detalhes extras sobre terreno, acesso ou combinado..."
                  className="w-full p-3 bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl text-xs font-medium text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#FBBF24] resize-none"
                />
              </div>

              {/* Botões do Modal */}
              <div className="pt-2 flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 h-12 bg-white border border-[#E2E8F0] text-[#64748B] hover:text-[#0F172A] font-bold text-xs rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  id="btn-submit-schedule"
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 h-12 bg-[#0F172A] hover:bg-[#1E293B] text-white font-bold text-xs rounded-xl shadow-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin text-[#FBBF24]" />
                  ) : (
                    <span>Salvar Agendamento</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. BARRA DE NAVEGAÇÃO INFERIOR (BOTTOM NAVIGATION) */}
      <AdminBottomNav
        activeTab="agenda"
        onNavigateToDashboard={onNavigateToDashboard}
        onNavigateToServices={onNavigateToServices}
        onNavigateToFinancial={onNavigateToFinancial}
        onNavigateToMachines={onNavigateToMachines}
      />
    </div>
  );
};

export default AdminAgenda;
