import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { db } from '../lib/dexieDb';
import { toast, isValidUuid } from './syncService';
import { formatTimeHHMM, calculateTotalHours, applyPhoneMask } from '../utils/formatters';
import type {
  Machine,
  Client,
  WorkLogStatus,
  PaymentStatus,
  BillingUnit,
  OfflineWorkLog,
} from '../types/database';

const MACHINE_BILLING_UNITS_KEY = 'retroscave_machine_billing_units_v1';
const WORKLOG_RATES_KEY = 'retroscave_worklog_rates_v1';

export function getStoredMachineBillingUnits(): Record<string, BillingUnit> {
  if (typeof window === 'undefined' || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem(MACHINE_BILLING_UNITS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

export function setStoredMachineBillingUnit(machineId: string, unit: BillingUnit): void {
  if (!machineId || typeof window === 'undefined' || !window.localStorage) return;
  try {
    const map = getStoredMachineBillingUnits();
    map[machineId] = unit;
    window.localStorage.setItem(MACHINE_BILLING_UNITS_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage errors
  }
}

export function getStoredWorkLogRates(): Record<
  string,
  { hourly_rate: number; total_amount: number }
> {
  if (typeof window === 'undefined' || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem(WORKLOG_RATES_KEY);
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

export function setStoredWorkLogRate(
  workLogId: string | number,
  hourlyRate: number,
  totalAmount: number
): void {
  if (!workLogId || typeof window === 'undefined' || !window.localStorage) return;
  try {
    const map = getStoredWorkLogRates();
    map[String(workLogId)] = {
      hourly_rate: Number(hourlyRate) || 0,
      total_amount: Number(totalAmount) || 0,
    };
    window.localStorage.setItem(WORKLOG_RATES_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage errors
  }
}

export interface AdminMetrics {
  totalServices: number;
  totalHours: number;
  billedAmount: number;
  pendingAmount: number;
}

export type WorkLogFilter = 'todos' | 'aprovado' | 'pendente' | 'rejeitado' | 'em_andamento';

export interface ExtendedWorkLog {
  id: string | number;
  server_id?: string | null;
  machine_id: string;
  machine_name: string;
  operator_id: string;
  operator_name: string;
  client_name: string;
  client_phone?: string | null;
  service_date: string;
  start_hours: number;
  end_hours: number;
  total_hours: number;
  observations: string | null;
  status: WorkLogStatus;
  payment_status?: PaymentStatus;
  started_at?: string;
  finished_at?: string;
  start_time?: string;
  end_time?: string;
  hourly_rate?: number;
  total_amount?: number;
  billing_unit?: BillingUnit;
  km_initial?: number;
  km_final?: number;
  total_km?: number;
  created_at: string;
}

export interface AdminWorkLogUpdatePayload {
  client_name: string;
  client_phone?: string | null;
  service_date: string;
  machine_id: string;
  machine_name?: string;
  start_hours: number;
  end_hours: number;
  hourly_rate: number;
  total_amount?: number;
  billing_unit?: BillingUnit;
  km_initial?: number;
  km_final?: number;
  total_km?: number;
  observations?: string | null;
  payment_status?: PaymentStatus;
}

function resolveOptionalTimeHHMM(val?: string | null): string | undefined {
  if (!val) return undefined;
  const formatted = formatTimeHHMM(val);
  return formatted === '--:--' ? undefined : formatted;
}

/**
 * Localiza um apontamento no Dexie local pelo ID numérico ou pelo `server_id` UUID.
 */
async function findLocalWorkLog(
  workLogId: string | number
): Promise<OfflineWorkLog | undefined> {
  if (typeof workLogId === 'number') {
    return await db.offline_work_logs.get(workLogId);
  }

  const numericId = parseInt(String(workLogId), 10);
  if (!isNaN(numericId) && String(numericId) === String(workLogId).trim()) {
    const byNum = await db.offline_work_logs.get(numericId);
    if (byNum) return byNum;
  }

  try {
    const byServer = await db.offline_work_logs
      .where('server_id')
      .equals(String(workLogId))
      .first();
    if (byServer) return byServer;
  } catch {
    // Fallback varredura completa caso índice esteja em migração
  }

  const allLocal = await db.offline_work_logs.toArray();
  return allLocal.find(
    (l) => l.server_id === String(workLogId) || String(l.id) === String(workLogId)
  );
}

/**
 * Normaliza qualquer status para o padrão canônico da aplicação
 * Suporta indistintamente 'pendente' / 'pending', 'aprovado' / 'approved', etc.
 */
export function normalizeWorkLogStatus(status?: string | null): WorkLogStatus {
  if (!status) return 'pendente';
  const s = String(status).toLowerCase().trim();
  if (s === 'pending' || s === 'pendente') return 'pendente';
  if (s === 'approved' || s === 'aprovado') return 'aprovado';
  if (s === 'rejected' || s === 'rejeitado') return 'rejeitado';
  if (s === 'in_progress' || s === 'em_andamento') return 'em_andamento';
  return 'pendente';
}

/**
 * 1. Calcula as métricas consolidadas do painel administrativo
 * Totalmente baseado em dados reais do Supabase (ou Dexie se offline).
 * Se não houver registros, todos os indicadores retornam 0.
 */
export async function fetchAdminMetrics(): Promise<AdminMetrics> {
  const logs = await fetchAdminWorkLogs('todos');

  let totalHours = 0;
  let billedAmount = 0;
  let pendingAmount = 0;

  for (const log of logs) {
    const rawHours = Number(log.total_hours || 0);
    const hours =
      rawHours > 0 ? rawHours : calculateTotalHours(log.start_hours, log.end_hours);

    const rate = log.hourly_rate || 0;
    const amount =
      log.total_amount !== undefined && log.total_amount > 0
        ? log.total_amount
        : hours * rate;

    totalHours += hours;

    const norm = normalizeWorkLogStatus(log.status);
    if (norm === 'aprovado') {
      billedAmount += amount;
    } else if (norm === 'pendente') {
      pendingAmount += amount;
    }
  }

  return {
    totalServices: logs.length,
    totalHours: Number(totalHours.toFixed(1)),
    billedAmount,
    pendingAmount,
  };
}

/**
 * 2. Busca apontamentos de serviço com suporte a filtros de status exclusivamente do Supabase/Dexie
 */
export async function fetchAdminWorkLogs(
  filterStatus: WorkLogFilter = 'todos'
): Promise<ExtendedWorkLog[]> {
  const online =
    typeof navigator !== 'undefined' && navigator.onLine && isSupabaseConfigured();

  let resultLogs: ExtendedWorkLog[] = [];
  let fetchedFromSupabase = false;

  if (online) {
    try {
      let query = supabase
        .from('work_logs')
        .select('*')
        .order('service_date', { ascending: false });

      if (filterStatus === 'todos') {
        // No painel do administrador, NUNCA lista serviços em andamento (check-in sem check-out)
        // Aceita tanto português quanto inglês para resiliência máxima
        query = query.in('status', [
          'pendente',
          'pending',
          'aprovado',
          'approved',
          'rejeitado',
          'rejected',
        ] as any);
      } else if (filterStatus === 'pendente') {
        query = query.in('status', ['pendente', 'pending'] as any);
      } else if (filterStatus === 'aprovado') {
        query = query.in('status', ['aprovado', 'approved'] as any);
      } else if (filterStatus === 'rejeitado') {
        query = query.in('status', ['rejeitado', 'rejected'] as any);
      } else {
        query = query.eq('status', filterStatus);
      }

      const { data, error } = await query;

      if (error) {
        console.error('[Supabase fetchAdminWorkLogs Error]:', error);
      } else if (data !== null) {
        fetchedFromSupabase = true;
        if (data.length > 0) {
          // Carrega máquinas e perfis locais ou do Dexie para resolver machine_name e hourly_rate
          let cachedMachines = await db.cached_machines.toArray();
          const machineIds = new Set(data.map((item: any) => item.machine_id).filter(Boolean));
          const missingMachine = Array.from(machineIds).some(
            (id) => !cachedMachines.some((m) => m.id === id)
          );
          if (missingMachine || cachedMachines.length === 0) {
            const { data: remoteMachines } = await supabase.from('machines').select('*');
            if (remoteMachines && remoteMachines.length > 0) {
              await db.cached_machines.bulkPut(remoteMachines as Machine[]);
              cachedMachines = await db.cached_machines.toArray();
            }
          }
          const machineMap = new Map(cachedMachines.map((m) => [m.id, m]));
          const storedUnits = getStoredMachineBillingUnits();
          const storedRates = getStoredWorkLogRates();

          let cachedProfiles = await db.cached_profiles.toArray();
          const profileIds = new Set(data.map((item: any) => item.operator_id).filter(Boolean));
          const missingProfile = Array.from(profileIds).some(
            (id) => !cachedProfiles.some((p) => p.id === id)
          );
          if (missingProfile || cachedProfiles.length === 0) {
            const { data: remoteProfiles } = await supabase.from('profiles').select('*');
            if (remoteProfiles && remoteProfiles.length > 0) {
              await db.cached_profiles.bulkPut(remoteProfiles);
              cachedProfiles = await db.cached_profiles.toArray();
            }
          }
          const profileMap = new Map(cachedProfiles.map((p) => [p.id, p]));
          const allLocalLogs = await db.offline_work_logs.toArray();
          const localByServerId = new Map(
            allLocalLogs.filter((l) => l.server_id).map((l) => [l.server_id!, l])
          );

          resultLogs = data.map((item: any) => {
            const machine =
              machineMap.get(item.machine_id) ||
              Array.from(machineMap.values()).find((m) => m.name === item.machine_name);
            const profile = profileMap.get(item.operator_id);
            const localMatch = localByServerId.get(item.id);
            const storedRate = storedRates[String(item.id)];

            const remoteRate =
              item.hourly_rate !== undefined && item.hourly_rate !== null && Number(item.hourly_rate) > 0
                ? Number(item.hourly_rate)
                : item.price_per_hour !== undefined && item.price_per_hour !== null && Number(item.price_per_hour) > 0
                ? Number(item.price_per_hour)
                : item.unit_price !== undefined && item.unit_price !== null && Number(item.unit_price) > 0
                ? Number(item.unit_price)
                : undefined;

            const localRate =
              storedRate?.hourly_rate !== undefined && storedRate.hourly_rate > 0
                ? storedRate.hourly_rate
                : localMatch?.hourly_rate !== undefined && Number(localMatch.hourly_rate) > 0
                ? Number(localMatch.hourly_rate)
                : undefined;

            const rate = Number(
              (storedRate?.hourly_rate !== undefined && storedRate.hourly_rate > 0
                ? storedRate.hourly_rate
                : undefined) ??
                remoteRate ??
                localRate ??
                machine?.hourly_rate ??
                0
            );
            const rawHours = Number(item.total_hours ?? 0);
            const startH = Number(
              item.start_hours ??
              item.initial_horimeter ??
              item.horimeter_initial ??
              item.km_initial ??
              localMatch?.start_hours ??
              localMatch?.km_initial ??
              0
            );
            const endH = Number(
              item.end_hours ??
              item.final_horimeter ??
              item.horimeter_final ??
              item.km_final ??
              localMatch?.end_hours ??
              localMatch?.km_final ??
              0
            );
            const totalHours =
              rawHours > 0 ? rawHours : calculateTotalHours(startH, endH);
            const totalAmount =
              rate > 0 && totalHours > 0
                ? Number((totalHours * rate).toFixed(2))
                : item.total_amount !== undefined && Number(item.total_amount) > 0
                ? Number(item.total_amount)
                : storedRate?.total_amount !== undefined && storedRate.total_amount > 0
                ? Number(storedRate.total_amount)
                : localMatch?.total_amount !== undefined && localMatch.total_amount > 0
                ? Number(localMatch.total_amount)
                : Number((totalHours * rate).toFixed(2));

            const startedAt = localMatch?.started_at || item.started_at || item.created_at;
            const finishedAt =
              localMatch?.finished_at ||
              item.finished_at ||
              (item.status !== 'em_andamento'
                ? item.updated_at || item.created_at
                : undefined);
            const startTime =
              localMatch?.start_time || resolveOptionalTimeHHMM(startedAt);
            const endTime =
              localMatch?.end_time || resolveOptionalTimeHHMM(finishedAt);
            const resolvedUnit: BillingUnit =
              item.billing_unit === 'km' ||
              localMatch?.billing_unit === 'km' ||
              machine?.billing_unit === 'km' ||
              storedUnits[item.machine_id] === 'km'
                ? 'km'
                : 'hour';

            return {
              id: item.id,
              server_id: item.id,
              machine_id: item.machine_id,
              machine_name:
                machine?.name || localMatch?.machine_name || 'Retroescavadeira',
              operator_id: item.operator_id,
              operator_name:
                profile?.full_name || localMatch?.operator_name || 'Operador',
              client_name:
                item.client_name && item.client_name !== 'Em andamento' && item.client_name !== 'A definir'
                  ? item.client_name
                  : localMatch?.client_name && localMatch.client_name !== 'Em andamento' && localMatch.client_name !== 'A definir'
                  ? localMatch.client_name
                  : (item.client_name && item.client_name !== 'Em andamento' ? item.client_name : 'Cliente a definir'),
              client_phone: item.client_phone || localMatch?.client_phone || null,
              service_date: item.service_date,
              start_hours: startH,
              end_hours: endH,
              total_hours: totalHours,
              observations: item.observations,
              status: normalizeWorkLogStatus(item.status),
              payment_status: (item.payment_status ||
                localMatch?.payment_status ||
                'a_receber') as PaymentStatus,
              started_at: startedAt,
              finished_at: finishedAt,
              start_time: startTime,
              end_time: endTime,
              hourly_rate: rate,
              total_amount: totalAmount,
              billing_unit: resolvedUnit,
              km_initial: item.km_initial ?? (resolvedUnit === 'km' ? startH : undefined),
              km_final: item.km_final ?? (resolvedUnit === 'km' ? endH : undefined),
              total_km: item.total_km ?? (resolvedUnit === 'km' ? totalHours : undefined),
              created_at: item.created_at,
            };
          });

          if (filterStatus === 'todos') {
            resultLogs = resultLogs.filter(
              (l) => normalizeWorkLogStatus(l.status) !== 'em_andamento'
            );
          }
        }
      }
    } catch (err) {
      console.warn(
        '[AdminService] Falha ao consultar Supabase, lendo do banco Dexie local:',
        err
      );
    }
  }

  // Leitura do banco local Dexie se offline/falha de rede, ou mesclagem de itens pendentes se online
  if (!fetchedFromSupabase || resultLogs.length === 0) {
    const allLocalLogs = await db.offline_work_logs.toArray();
    let localLogs = fetchedFromSupabase
      ? allLocalLogs.filter((l) => l.sync_status === 'pending' || l.synced === false)
      : allLocalLogs;

    // Isolamento estrito do painel admin: nunca exibe serviços em andamento
    if (filterStatus !== 'em_andamento') {
      localLogs = localLogs.filter(
        (l) => l.status !== 'em_andamento' && (l.status as any) !== 'in_progress'
      );
    }
    const cachedMachines = await db.cached_machines.toArray();
    const machineMap = new Map(cachedMachines.map((m) => [m.id, m]));
    const storedUnits = getStoredMachineBillingUnits();
    const storedRates = getStoredWorkLogRates();

    resultLogs = localLogs.map((log) => {
      const status = log.status || 'pendente';
      const machine = machineMap.get(log.machine_id);
      const logKey = String(log.server_id || log.id || '');
      const storedRate = logKey ? storedRates[logKey] : undefined;
      const rate = Number(
        (log.hourly_rate !== undefined && Number(log.hourly_rate) > 0
          ? Number(log.hourly_rate)
          : undefined) ??
          (storedRate?.hourly_rate !== undefined && storedRate.hourly_rate > 0
            ? storedRate.hourly_rate
            : undefined) ??
          machine?.hourly_rate ??
          0
      );
      const startH = Number(
        log.start_hours ??
        (log as any).initial_horimeter ??
        (log as any).horimeter_initial ??
        log.km_initial ??
        0
      );
      const endH = Number(
        log.end_hours ??
        (log as any).final_horimeter ??
        (log as any).horimeter_final ??
        log.km_final ??
        0
      );
      const rawHours = Number(log.total_hours ?? 0);
      const totalHours =
        rawHours > 0 ? rawHours : calculateTotalHours(startH, endH);
      const totalAmount =
        rate > 0 && totalHours > 0
          ? Number((totalHours * rate).toFixed(2))
          : log.total_amount !== undefined && log.total_amount > 0
          ? log.total_amount
          : Number((totalHours * rate).toFixed(2));
      const startedAt = log.started_at || log.created_at;
      const finishedAt =
        log.finished_at || (status !== 'em_andamento' ? log.created_at : undefined);
      const resolvedUnit: BillingUnit =
        log.billing_unit === 'km' ||
        machine?.billing_unit === 'km' ||
        storedUnits[log.machine_id] === 'km'
          ? 'km'
          : 'hour';

      return {
        id: log.id || log.server_id || `temp-${Math.random()}`,
        server_id: log.server_id,
        machine_id: log.machine_id,
        machine_name: machine?.name || log.machine_name,
        operator_id: log.operator_id,
        operator_name: log.operator_name,
        client_name:
          log.client_name && log.client_name !== 'Em andamento' && log.client_name !== 'A definir'
            ? log.client_name
            : 'Cliente a definir',
        client_phone: log.client_phone || null,
        service_date: log.service_date,
        start_hours: startH,
        end_hours: endH,
        total_hours: totalHours,
        observations: log.observations,
        status: normalizeWorkLogStatus(log.status),
        payment_status: (log.payment_status || 'a_receber') as PaymentStatus,
        started_at: startedAt,
        finished_at: finishedAt,
        start_time: log.start_time || resolveOptionalTimeHHMM(startedAt),
        end_time: log.end_time || resolveOptionalTimeHHMM(finishedAt),
        hourly_rate: rate,
        total_amount: totalAmount,
        billing_unit: resolvedUnit,
        km_initial: log.km_initial ?? (resolvedUnit === 'km' ? startH : undefined),
        km_final: log.km_final ?? (resolvedUnit === 'km' ? endH : undefined),
        total_km: log.total_km ?? (resolvedUnit === 'km' ? totalHours : undefined),
        created_at: log.created_at,
      };
    });

    if (filterStatus !== 'todos') {
      resultLogs = resultLogs.filter((l) => {
        const norm = normalizeWorkLogStatus(l.status);
        if (filterStatus === 'pendente') return norm === 'pendente';
        if (filterStatus === 'aprovado') return norm === 'aprovado';
        if (filterStatus === 'rejeitado') return norm === 'rejeitado';
        return l.status === filterStatus;
      });
    } else {
      resultLogs = resultLogs.filter(
        (l) => normalizeWorkLogStatus(l.status) !== 'em_andamento'
      );
    }
  }

  // Ordena por prioridade: pendentes primeiro, depois data de serviço/criação decrescente
  resultLogs.sort((a, b) => {
    const aPending = normalizeWorkLogStatus(a.status) === 'pendente';
    const bPending = normalizeWorkLogStatus(b.status) === 'pendente';
    if (aPending && !bPending) return -1;
    if (!aPending && bPending) return 1;

    const dateA = new Date(a.created_at || a.service_date).getTime();
    const dateB = new Date(b.created_at || b.service_date).getTime();
    return dateB - dateA;
  });

  return resultLogs;
}

/**
 * 2.1. Atualiza os dados de um apontamento de serviço pelo Administrador antes ou depois de aprovar.
 * Salva na tabela `work_logs` do Supabase e no cache local do Dexie.
 */
export async function updateAdminWorkLog(
  workLogId: string | number,
  updates: AdminWorkLogUpdatePayload
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!updates.client_name || updates.client_name.trim().length === 0) {
      return { success: false, error: 'Informe o nome do cliente.' };
    }
    if (isNaN(updates.start_hours) || updates.start_hours < 0) {
      return { success: false, error: 'Horímetro inicial inválido.' };
    }
    if (isNaN(updates.end_hours) || updates.end_hours < updates.start_hours) {
      return {
        success: false,
        error: 'O horímetro final deve ser maior ou igual ao inicial.',
      };
    }

    const now = new Date().toISOString();
    const online =
      typeof navigator !== 'undefined' && navigator.onLine && isSupabaseConfigured();

    const totalHours = calculateTotalHours(updates.start_hours, updates.end_hours);
    const rate = Number(updates.hourly_rate) || 0;
    const totalAmount = Number((totalHours * rate).toFixed(2));
    const cleanPhone = updates.client_phone?.trim() || null;
    const cleanObs = updates.observations?.trim() || null;

    // Resolve o nome da máquina caso tenha sido alterada no dropdown
    let resolvedMachineName = updates.machine_name;
    if (!resolvedMachineName && updates.machine_id) {
      const cachedMachine = await db.cached_machines.get(updates.machine_id);
      if (cachedMachine) {
        resolvedMachineName = cachedMachine.name;
      }
    }

    const existing = await findLocalWorkLog(workLogId);
    const targetServerId = existing?.server_id || String(workLogId);

    setStoredWorkLogRate(workLogId, rate, totalAmount);
    if (targetServerId) {
      setStoredWorkLogRate(targetServerId, rate, totalAmount);
    }

    // 1. Se online, atualiza na tabela `work_logs` do Supabase e exige confirmação
    if (online) {
      const basePayload = {
        client_name: updates.client_name.trim(),
        client_phone: cleanPhone,
        service_date: updates.service_date,
        machine_id: updates.machine_id,
        start_hours: Number(updates.start_hours),
        end_hours: Number(updates.end_hours),
        observations: cleanObs,
        ...(updates.payment_status ? { payment_status: updates.payment_status } : {}),
        updated_at: now,
      };

      const fullPayload = {
        ...basePayload,
        hourly_rate: rate,
        total_amount: totalAmount,
      };

      let { error } = await supabase
        .from('work_logs')
        .update(fullPayload)
        .eq('id', targetServerId);

      // Fallback resiliente caso o schema remoto não possua alguma coluna financeira opcional
      if (
        error &&
        (error.message?.includes('hourly_rate') ||
          error.message?.includes('total_amount') ||
          error.message?.includes('column'))
      ) {
        const retryRes = await supabase
          .from('work_logs')
          .update(basePayload)
          .eq('id', targetServerId);
        error = retryRes.error;
      }

      if (error) {
        console.error('[Supabase updateAdminWorkLog Error]:', error);
        toast.error(error.message);
        throw new Error(error.message);
      }

      // Mantém lançamento financeiro sincronizado caso o serviço já possua entrada em financial_entries
      try {
        await supabase
          .from('financial_entries')
          .update({
            client_name: updates.client_name.trim(),
            amount: totalAmount,
            service_date: updates.service_date,
          })
          .eq('work_log_id', targetServerId);
      } catch {
        // Ignora silenciosamente se não houver lançamento vinculado
      }
    }

    // 2. Atualiza no cache local do Dexie
    if (existing?.id) {
      await db.offline_work_logs.update(existing.id, {
        client_name: updates.client_name.trim(),
        client_phone: cleanPhone,
        service_date: updates.service_date,
        machine_id: updates.machine_id,
        machine_name: resolvedMachineName || existing.machine_name,
        start_hours: Number(updates.start_hours),
        end_hours: Number(updates.end_hours),
        total_hours: totalHours,
        hourly_rate: rate,
        total_amount: totalAmount,
        observations: cleanObs,
        ...(updates.billing_unit ? { billing_unit: updates.billing_unit } : {}),
        ...(updates.payment_status ? { payment_status: updates.payment_status } : {}),
      });
    }

    return { success: true };
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : 'Falha ao atualizar apontamento';
    console.error('[AdminService] Erro em updateAdminWorkLog:', msg);
    return { success: false, error: msg };
  }
}

/**
 * 2.2. Atualiza o status de pagamento ('pago' | 'a_receber') de um serviço
 * tanto na tabela `work_logs` do Supabase quanto no cache local do Dexie.
 */
export async function updateWorkLogPaymentStatus(
  workLogId: string | number,
  paymentStatus: PaymentStatus
): Promise<{ success: boolean; error?: string }> {
  try {
    const now = new Date().toISOString();
    const online =
      typeof navigator !== 'undefined' && navigator.onLine && isSupabaseConfigured();

    const existing = await findLocalWorkLog(workLogId);
    const targetServerId = existing?.server_id || String(workLogId);

    // 1. Se online, atualiza `payment_status` na tabela `work_logs` do Supabase
    if (online) {
      const { error } = await supabase
        .from('work_logs')
        .update({
          payment_status: paymentStatus,
          updated_at: now,
        })
        .eq('id', targetServerId);

      if (error) {
        console.error('[Supabase updateWorkLogPaymentStatus Error]:', error);
        toast.error(error.message);
        throw new Error(error.message);
      }
    }

    // 2. Atualiza no Dexie local
    if (existing?.id) {
      await db.offline_work_logs.update(existing.id, {
        payment_status: paymentStatus,
      });
    }

    return { success: true };
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : 'Falha ao atualizar status de pagamento';
    console.error('[AdminService] Erro em updateWorkLogPaymentStatus:', msg);
    return { success: false, error: msg };
  }
}

/**
 * 3. Aprova um apontamento de serviço com a taxa horária aplicada
 */
export async function approveWorkLog(
  workLogId: string | number,
  appliedHourlyRate: number,
  totalAmount: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const now = new Date().toISOString();
    const online =
      typeof navigator !== 'undefined' && navigator.onLine && isSupabaseConfigured();

    const existing = await findLocalWorkLog(workLogId);
    const targetServerId = existing?.server_id || String(workLogId);

    let targetMachineId: string | null = existing?.machine_id || null;
    let targetEndHours: number | null =
      existing?.end_hours !== undefined ? Number(existing.end_hours) : null;
    let targetClientName: string = existing?.client_name || 'Cliente';
    let targetHours: number = 0;

    if (existing) {
      const rawHours = Number(existing.total_hours ?? 0);
      const diffHours = calculateTotalHours(existing.start_hours, existing.end_hours);
      targetHours = rawHours > 0 ? rawHours : diffHours;
    } else {
      targetHours =
        appliedHourlyRate > 0 ? Number((totalAmount / appliedHourlyRate).toFixed(1)) : 0;
    }

    const hourly_rate = Number(appliedHourlyRate) || 0;
    const total_amount =
      totalAmount > 0 ? totalAmount : Number((targetHours * hourly_rate).toFixed(2));
    const payment_status: PaymentStatus =
      (existing?.payment_status as PaymentStatus) || 'a_receber';

    setStoredWorkLogRate(workLogId, hourly_rate, total_amount);
    if (targetServerId) {
      setStoredWorkLogRate(targetServerId, hourly_rate, total_amount);
    }

    // 1. Se online, envia aprovação completa e lançamento financeiro ao Supabase usando o UUID oficial
    if (online) {
      const { error: workLogError } = await supabase
        .from('work_logs')
        .update({
          status: 'aprovado',
          hourly_rate,
          total_amount,
          payment_status,
          updated_at: now,
        })
        .eq('id', targetServerId);

      if (workLogError) {
        console.error('[Supabase approveWorkLog work_logs Error]:', workLogError);
        toast.error(workLogError.message);
        throw new Error(workLogError.message);
      }

      // Cria lançamento no financeiro com o UUID oficial (targetServerId)
      const { error: finError } = await supabase.from('financial_entries').insert({
        work_log_id: targetServerId,
        client_name: targetClientName,
        amount: total_amount,
        service_date: now.split('T')[0],
        type: 'receita',
        status: payment_status === 'pago' ? 'pago' : 'pendente',
      });

      if (finError) {
        console.error('[Supabase approveWorkLog financial_entries Error]:', finError);
        toast.error(finError.message);
        throw new Error(finError.message);
      }

      // Atualiza horômetro no Supabase
      if (targetMachineId && targetEndHours) {
        const { error: machineError } = await supabase
          .from('machines')
          .update({ current_hours: targetEndHours, updated_at: now })
          .eq('id', targetMachineId);

        if (machineError) {
          console.error('[Supabase approveWorkLog machines Error]:', machineError);
          toast.error(machineError.message);
          throw new Error(machineError.message);
        }
      }
    }

    // 2. Atualiza no Dexie local
    if (existing?.id) {
      await db.offline_work_logs.update(existing.id, {
        status: 'aprovado',
        hourly_rate,
        total_hours: targetHours,
        total_amount,
        payment_status,
      });
    }

    // Atualiza horômetro da máquina localmente
    if (targetMachineId && targetEndHours) {
      await db.cached_machines.update(targetMachineId, { current_hours: targetEndHours });
    }

    return { success: true };
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : 'Falha ao aprovar apontamento';
    console.error('[AdminService] Erro ao aprovar:', msg);
    return { success: false, error: msg };
  }
}

/**
 * 4. Rejeita um apontamento de serviço
 */
export async function rejectWorkLog(
  workLogId: string | number,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const now = new Date().toISOString();
    const online =
      typeof navigator !== 'undefined' && navigator.onLine && isSupabaseConfigured();

    const existing = await findLocalWorkLog(workLogId);
    const targetServerId = existing?.server_id || String(workLogId);
    const updatedObservations = reason
      ? `${existing?.observations || ''} [Rejeitado: ${reason}]`.trim()
      : existing?.observations;

    // 1. Se online, atualiza no Supabase usando o UUID oficial
    if (online) {
      const { error } = await supabase
        .from('work_logs')
        .update({
          status: 'rejeitado',
          ...(reason ? { observations: updatedObservations } : {}),
          updated_at: now,
        })
        .eq('id', targetServerId);

      if (error) {
        console.error('[Supabase rejectWorkLog Error]:', error);
        toast.error(error.message);
        throw new Error(error.message);
      }
    }

    // 2. Atualiza no Dexie local
    if (existing?.id) {
      await db.offline_work_logs.update(existing.id, {
        status: 'rejeitado',
        observations: updatedObservations,
      });
    }

    return { success: true };
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : 'Falha ao rejeitar apontamento';
    console.error('[AdminService] Erro ao rejeitar:', msg);
    return { success: false, error: msg };
  }
}

/**
 * 4.1. Exclui permanentemente um apontamento de serviço (tanto no Supabase quanto no Dexie local),
 * limpando também quaisquer lançamentos financeiros vinculados para manter a integridade dos dados e métricas.
 */
export async function deleteWorkLog(
  workLogId: string | number
): Promise<{ success: boolean; error?: string }> {
  try {
    const online =
      typeof navigator !== 'undefined' && navigator.onLine && isSupabaseConfigured();

    // Localiza o registro antes de remover do Dexie para preservar o server_id oficial
    const existing = await findLocalWorkLog(workLogId);
    const targetServerId = existing?.server_id || String(workLogId);

    // 1. Se online, remove do Supabase usando o UUID oficial
    if (online) {
      const { error: finError } = await supabase
        .from('financial_entries')
        .delete()
        .eq('work_log_id', targetServerId);

      if (finError) {
        console.error('[Supabase deleteWorkLog financial_entries Error]:', finError);
        toast.error(finError.message);
        throw new Error(finError.message);
      }

      const { error } = await supabase
        .from('work_logs')
        .delete()
        .eq('id', targetServerId);

      if (error) {
        console.error('[Supabase deleteWorkLog Error]:', error);
        toast.error(error.message);
        throw new Error(error.message);
      }
    }

    // 2. Remove do Dexie local
    if (existing?.id) {
      await db.offline_work_logs.delete(existing.id);
    } else if (typeof workLogId === 'number') {
      await db.offline_work_logs.delete(workLogId);
    } else {
      const numericId = parseInt(String(workLogId), 10);
      if (!isNaN(numericId)) {
        await db.offline_work_logs.delete(numericId);
      }
      try {
        const matched = await db.offline_work_logs
          .where('server_id')
          .equals(targetServerId)
          .toArray();
        for (const item of matched) {
          if (item.id) await db.offline_work_logs.delete(item.id);
        }
      } catch {
        const allLocal = await db.offline_work_logs.toArray();
        const matched = allLocal.filter(
          (l) => l.server_id === targetServerId || String(l.id) === String(workLogId)
        );
        for (const item of matched) {
          if (item.id) await db.offline_work_logs.delete(item.id);
        }
      }
    }

    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Falha ao excluir serviço';
    console.error('[AdminService] Erro ao excluir:', msg);
    return { success: false, error: msg };
  }
}

/**
 * 5. CRUD de Máquinas: listagem completa
 */
export async function fetchMachines(): Promise<Machine[]> {
  const online =
    typeof navigator !== 'undefined' && navigator.onLine && isSupabaseConfigured();
  const storedUnits = getStoredMachineBillingUnits();
  const prevCached = await db.cached_machines.toArray();
  const prevUnitMap = new Map(
    prevCached
      .filter((m) => m.billing_unit)
      .map((m) => [m.id, m.billing_unit as BillingUnit])
  );

  if (online) {
    try {
      const { data, error } = await supabase
        .from('machines')
        .select('*')
        .order('name');

      if (!error && data) {
        const enriched: Machine[] = (data as any[]).map((m) => {
          const unit: BillingUnit =
            m.billing_unit === 'km' ||
            storedUnits[m.id] === 'km' ||
            prevUnitMap.get(m.id) === 'km'
              ? 'km'
              : 'hour';
          setStoredMachineBillingUnit(m.id, unit);
          return {
            ...(m as Machine),
            billing_unit: unit,
          };
        });
        await db.cached_machines.clear();
        await db.cached_machines.bulkPut(enriched);
        return enriched;
      }
    } catch (err) {
      console.warn('[AdminService] Falha ao buscar máquinas no Supabase, usando cache local:', err);
    }
  }

  return prevCached.map((m) => ({
    ...m,
    billing_unit: m.billing_unit === 'km' || storedUnits[m.id] === 'km' ? 'km' : 'hour',
  }));
}

/**
 * 5. CRUD de Máquinas: criação e edição
 */
export async function saveMachine(
  machineData: Partial<Machine>
): Promise<{ success: boolean; machine?: Machine; error?: string }> {
  try {
    const now = new Date().toISOString();
    const online =
      typeof navigator !== 'undefined' && navigator.onLine && isSupabaseConfigured();

    const billingUnit: BillingUnit = machineData.billing_unit === 'km' ? 'km' : 'hour';

    const basePayload = {
      name: String(machineData.name).trim(),
      model: String(machineData.model || '').trim(),
      hourly_rate: Number(machineData.hourly_rate) || 0,
      current_hours: Number(machineData.current_hours) || 0,
      active: machineData.active !== undefined ? Boolean(machineData.active) : true,
    };

    const payloadWithUnit = {
      ...basePayload,
      billing_unit: billingUnit,
    };

    let savedMachine: Machine;

    if (online) {
      if (machineData.id) {
        // EDIÇÃO (UPDATE)
        let { data, error } = await supabase
          .from('machines')
          .update(payloadWithUnit)
          .eq('id', machineData.id)
          .select()
          .single();

        // Fallback caso a coluna billing_unit ainda não tenha sido aplicada no banco remoto
        if (error && String(error.message || '').toLowerCase().includes('billing_unit')) {
          const retry = await supabase
            .from('machines')
            .update(basePayload)
            .eq('id', machineData.id)
            .select()
            .single();
          data = retry.data;
          error = retry.error;
        }

        if (error) {
          console.error('[Supabase saveMachine Error]:', error);
          toast.error(error.message);
          return { success: false, error: error.message };
        }

        savedMachine = {
          ...((data as Machine) || {
            id: machineData.id,
            ...basePayload,
            updated_at: now,
            created_at: machineData.created_at || now,
          }),
          billing_unit: billingUnit,
        };
      } else {
        // NOVO CADASTRO (INSERT sem o campo 'id' para gerar UUID nativo no Supabase)
        let { data, error } = await supabase
          .from('machines')
          .insert(payloadWithUnit)
          .select()
          .single();

        if (error && String(error.message || '').toLowerCase().includes('billing_unit')) {
          const retry = await supabase
            .from('machines')
            .insert(basePayload)
            .select()
            .single();
          data = retry.data;
          error = retry.error;
        }

        if (error) {
          console.error('[Supabase saveMachine Error]:', error);
          toast.error(error.message);
          return { success: false, error: error.message };
        }

        if (!data) {
          return {
            success: false,
            error: 'Nenhum dado retornado ao inserir máquina no Supabase.',
          };
        }

        savedMachine = {
          ...(data as Machine),
          billing_unit: billingUnit,
        };
      }
    } else {
      // Modo Offline: gera UUID compatível
      const localId =
        machineData.id ||
        (typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : '00000000-0000-4000-8000-' + String(Date.now()).padStart(12, '0'));

      savedMachine = {
        id: localId,
        ...payloadWithUnit,
        updated_at: now,
        created_at: machineData.created_at || now,
      };
    }

    setStoredMachineBillingUnit(savedMachine.id, billingUnit);
    // Salva ou atualiza a máquina no cache local Dexie
    await db.cached_machines.put(savedMachine);

    return { success: true, machine: savedMachine };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Falha ao salvar máquina';
    console.error('[saveMachine Unexpected Error]:', msg);
    return { success: false, error: msg };
  }
}

const REMOVED_CLIENTS_STORAGE_KEY = 'retroscave_removed_clients_v1';

function getRemovedClientKeys(): Set<string> {
  if (typeof window === 'undefined' || !window.localStorage) {
    return new Set();
  }
  try {
    const raw = window.localStorage.getItem(REMOVED_CLIENTS_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.map((s) => String(s).toLowerCase())) : new Set();
  } catch {
    return new Set();
  }
}

function saveRemovedClientKeys(keys: Set<string>): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(
      REMOVED_CLIENTS_STORAGE_KEY,
      JSON.stringify(Array.from(keys))
    );
  } catch {
    // Ignore storage quota errors
  }
}

/**
 * 6. Meus Clientes: Consulta a tabela `clients` no Supabase e consolida com clientes únicos
 * do histórico de `work_logs` e `scheduled_services` (sem duplicatas).
 */
export async function fetchAdminClients(): Promise<Client[]> {
  const online =
    typeof navigator !== 'undefined' && navigator.onLine && isSupabaseConfigured();

  const removedKeys = getRemovedClientKeys();
  const consolidatedMap = new Map<string, Client>();

  const upsertIntoMap = (
    rawName?: string | null,
    rawPhone?: string | null,
    options?: {
      id?: string;
      is_active?: boolean;
      created_at?: string;
      source?: 'clients' | 'history';
    }
  ) => {
    const cleanName = (rawName || '').trim();
    if (!cleanName || cleanName.toLowerCase() === 'em andamento') return;

    const key = cleanName.toLowerCase();
    if (options?.is_active === false) {
      removedKeys.add(key);
      consolidatedMap.delete(key);
      return;
    }
    if (removedKeys.has(key) && options?.source !== 'clients') {
      return;
    }

    const formattedPhone =
      rawPhone && rawPhone.trim().length > 0 ? applyPhoneMask(rawPhone.trim()) : null;

    const existing = consolidatedMap.get(key);
    if (!existing) {
      consolidatedMap.set(key, {
        id: options?.id || `hist-${key.replace(/\s+/g, '-')}`,
        name: cleanName,
        phone: formattedPhone,
        is_active: true,
        created_at: options?.created_at || new Date().toISOString(),
        source: options?.source || 'history',
      });
    } else {
      consolidatedMap.set(key, {
        ...existing,
        id: options?.source === 'clients' && options.id ? options.id : existing.id,
        name: options?.source === 'clients' ? cleanName : existing.name,
        phone: formattedPhone || existing.phone || null,
        source: options?.source === 'clients' ? 'clients' : existing.source,
      });
    }
  };

  // 0. Pré-carrega clientes locais do Dexie para registrar ativos e desativados (is_active === false)
  const localClients = await db.cached_clients.toArray();
  for (const lc of localClients) {
    upsertIntoMap(lc.name, lc.phone, {
      id: lc.id,
      is_active: lc.is_active !== false,
      created_at: lc.created_at,
      source: 'clients',
    });
  }

  let fetchedRemoteLogs = false;
  let fetchedRemoteSchedules = false;

  if (online) {
    // 1. Consulta tabela dedicada `clients` no Supabase
    try {
      const { data: remoteClients, error: clientsErr } = await supabase
        .from('clients')
        .select('*')
        .order('name');

      if (!clientsErr && remoteClients) {
        await db.cached_clients.bulkPut(remoteClients as Client[]);
        for (const rc of remoteClients as any[]) {
          upsertIntoMap(rc.name, rc.phone, {
            id: rc.id,
            is_active: rc.is_active !== false,
            created_at: rc.created_at,
            source: 'clients',
          });
        }
      }
    } catch {
      // Tabela `clients` opcional ou sem rede no momento
    }

    // 2. Consulta histórico remoto de `work_logs` e `scheduled_services`
    try {
      const [wlRes, schedRes] = await Promise.all([
        supabase.from('work_logs').select('client_name, client_phone, created_at'),
        supabase
          .from('scheduled_services')
          .select('client_name, client_phone, created_at'),
      ]);

      if (!wlRes.error && wlRes.data !== null) {
        fetchedRemoteLogs = true;
        for (const row of wlRes.data as any[]) {
          upsertIntoMap(row.client_name, row.client_phone, {
            created_at: row.created_at,
            source: 'history',
          });
        }
      }

      if (!schedRes.error && schedRes.data !== null) {
        fetchedRemoteSchedules = true;
        for (const row of schedRes.data as any[]) {
          upsertIntoMap(row.client_name, row.client_phone, {
            created_at: row.created_at,
            source: 'history',
          });
        }
      }
    } catch {
      // Ignora erro de rede e complementa com cache local
    }
  }

  // 3. Complementa com histórico local do Dexie (se offline, todos; se online, apenas pendentes de sincronização)
  const allLocalLogs = await db.offline_work_logs.toArray();
  const localLogs = fetchedRemoteLogs
    ? allLocalLogs.filter((l) => l.sync_status === 'pending' || l.synced === false)
    : allLocalLogs;
  for (const log of localLogs) {
    upsertIntoMap(log.client_name, log.client_phone, {
      created_at: log.created_at,
      source: 'history',
    });
  }

  const allLocalSchedules = await db.scheduled_services.toArray();
  const localSchedules = fetchedRemoteSchedules
    ? allLocalSchedules.filter((s) => s.sync_status === 'pending' || s.synced === false)
    : allLocalSchedules;
  for (const sched of localSchedules) {
    upsertIntoMap(sched.client_name, sched.client_phone, {
      created_at: sched.created_at,
      source: 'history',
    });
  }

  return Array.from(consolidatedMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name, 'pt-BR')
  );
}

/**
 * 6.1. Cadastra ou atualiza um cliente na tabela `clients` do Supabase e no cache local
 */
export async function saveAdminClient(clientData: {
  id?: string;
  name: string;
  phone?: string | null;
}): Promise<{ success: boolean; client?: Client; error?: string }> {
  try {
    const cleanName = (clientData.name || '').trim();
    if (!cleanName) {
      return { success: false, error: 'Informe o nome do cliente.' };
    }

    const cleanPhone =
      clientData.phone && clientData.phone.trim().length > 0
        ? applyPhoneMask(clientData.phone.trim())
        : null;
    const now = new Date().toISOString();
    const online =
      typeof navigator !== 'undefined' && navigator.onLine && isSupabaseConfigured();

    // Remove da lista de ocultos caso estivesse desativado anteriormente
    const removedKeys = getRemovedClientKeys();
    removedKeys.delete(cleanName.toLowerCase());
    saveRemovedClientKeys(removedKeys);

    let savedClient: Client | null = null;

    if (online) {
      if (clientData.id && isValidUuid(clientData.id)) {
        const { data, error } = await supabase
          .from('clients')
          .update({ name: cleanName, phone: cleanPhone, is_active: true })
          .eq('id', clientData.id)
          .select()
          .single();

        if (!error && data) {
          savedClient = {
            ...(data as Client),
            source: 'clients',
          };
        }
      } else {
        const { data, error } = await supabase
          .from('clients')
          .insert({ name: cleanName, phone: cleanPhone, is_active: true })
          .select()
          .single();

        if (!error && data) {
          savedClient = {
            ...(data as Client),
            source: 'clients',
          };
        }
      }
    }

    if (!savedClient) {
      const localId =
        clientData.id && isValidUuid(clientData.id)
          ? clientData.id
          : typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : '00000000-0000-4000-8000-' + String(Date.now()).padStart(12, '0');

      savedClient = {
        id: localId,
        name: cleanName,
        phone: cleanPhone,
        is_active: true,
        created_at: now,
        source: 'clients',
      };
    }

    await db.cached_clients.put(savedClient);
    return { success: true, client: savedClient };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Falha ao salvar cliente';
    return { success: false, error: msg };
  }
}

/**
 * 6.2. Remove / desativa um cliente no Supabase e na listagem consolidada
 */
export async function deleteAdminClient(client: {
  id: string;
  name: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const cleanName = (client.name || '').trim();
    const key = cleanName.toLowerCase();

    const online =
      typeof navigator !== 'undefined' && navigator.onLine && isSupabaseConfigured();

    if (online) {
      try {
        if (isValidUuid(client.id)) {
          await supabase.from('clients').delete().eq('id', client.id);
        } else if (cleanName) {
          await supabase.from('clients').delete().ilike('name', cleanName);
        }
      } catch {
        // Caso a tabela `clients` ainda não exista ou o cliente venha apenas do histórico
      }
    }

    // Marca como inativo (is_active: false) no cache local do Dexie para que registros históricos com o mesmo nome também fiquem ocultos
    const allLocal = await db.cached_clients.toArray();
    let matchedLocal = false;
    for (const item of allLocal) {
      if (item.id === client.id || item.name.trim().toLowerCase() === key) {
        await db.cached_clients.put({
          ...item,
          is_active: false,
        });
        matchedLocal = true;
      }
    }

    if (!matchedLocal && cleanName) {
      await db.cached_clients.put({
        id: client.id || `deactivated-${key.replace(/\s+/g, '-')}`,
        name: cleanName,
        phone: null,
        is_active: false,
        created_at: new Date().toISOString(),
        source: 'clients',
      });
    }

    // Registra na lista de clientes removidos para não reaparecer a partir de registros antigos
    if (key) {
      const removedKeys = getRemovedClientKeys();
      removedKeys.add(key);
      saveRemovedClientKeys(removedKeys);
    }

    toast.success('Cliente removido!');
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Falha ao remover cliente';
    toast.error(msg);
    return { success: false, error: msg };
  }
}
