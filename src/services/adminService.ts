import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { db } from '../lib/dexieDb';
import type { Machine, WorkLogStatus, PaymentStatus } from '../types/database';

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
  observations?: string | null;
  payment_status?: PaymentStatus;
}

/**
 * Converte string de horário (HH:mm ou ISO) para o formato curto HH:mm
 */
function resolveTimeHHMM(val?: string | null): string | undefined {
  if (!val) return undefined;
  if (/^\d{2}:\d{2}/.test(val.trim())) {
    return val.trim().slice(0, 5);
  }
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return undefined;
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return undefined;
  }
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
    const startH = Number(log.start_hours || 0);
    const endH = Number(log.end_hours || 0);
    const hours = rawHours > 0 ? rawHours : Math.max(0, Number((endH - startH).toFixed(1)));

    const rate = log.hourly_rate || 0;
    const amount = log.total_amount !== undefined && log.total_amount > 0 ? log.total_amount : hours * rate;

    totalHours += hours;

    if (log.status === 'aprovado') {
      billedAmount += amount;
    } else if (log.status === 'pendente') {
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
export async function fetchAdminWorkLogs(filterStatus: WorkLogFilter = 'todos'): Promise<ExtendedWorkLog[]> {
  const online = typeof navigator !== 'undefined' && navigator.onLine && isSupabaseConfigured();

  let resultLogs: ExtendedWorkLog[] = [];

  if (online) {
    try {
      let query = supabase
        .from('work_logs')
        .select('*')
        .order('service_date', { ascending: false });

      if (filterStatus !== 'todos') {
        query = query.eq('status', filterStatus);
      }

      const { data, error } = await query;

      if (error) {
        console.error('[Supabase fetchAdminWorkLogs Error]:', error);
      } else if (data && data.length > 0) {
        // Carrega máquinas e perfis locais ou do Dexie para resolver machine_name e hourly_rate
        let cachedMachines = await db.cached_machines.toArray();
        const machineIds = new Set(data.map((item: any) => item.machine_id));
        const missingMachine = Array.from(machineIds).some((id) => !cachedMachines.some((m) => m.id === id));
        if (missingMachine || cachedMachines.length === 0) {
          const { data: remoteMachines } = await supabase.from('machines').select('*');
          if (remoteMachines) {
            await db.cached_machines.bulkPut(remoteMachines as Machine[]);
            cachedMachines = remoteMachines as Machine[];
          }
        }
        const machineMap = new Map(cachedMachines.map((m) => [m.id, m]));

        let cachedProfiles = await db.cached_profiles.toArray();
        const profileIds = new Set(data.map((item: any) => item.operator_id));
        const missingProfile = Array.from(profileIds).some((id) => !cachedProfiles.some((p) => p.id === id));
        if (missingProfile || cachedProfiles.length === 0) {
          const { data: remoteProfiles } = await supabase.from('profiles').select('*');
          if (remoteProfiles) {
            await db.cached_profiles.bulkPut(remoteProfiles);
            cachedProfiles = remoteProfiles;
          }
        }
        const profileMap = new Map(cachedProfiles.map((p) => [p.id, p]));
        const allLocalLogs = await db.offline_work_logs.toArray();
        const localByServerId = new Map(
          allLocalLogs.filter((l) => l.server_id).map((l) => [l.server_id!, l])
        );

        resultLogs = data.map((item: any) => {
          const machine = machineMap.get(item.machine_id);
          const profile = profileMap.get(item.operator_id);
          const localMatch = localByServerId.get(item.id);

          const rate = Number(localMatch?.hourly_rate ?? machine?.hourly_rate ?? 0);
          const rawHours = Number(item.total_hours ?? 0);
          const startH = Number(item.start_hours ?? 0);
          const endH = Number(item.end_hours ?? 0);
          const totalHours = rawHours > 0 ? rawHours : Math.max(0, Number((endH - startH).toFixed(1)));
          const totalAmount =
            localMatch?.total_amount !== undefined && localMatch.total_amount > 0
              ? localMatch.total_amount
              : totalHours * rate;

          const startedAt = localMatch?.started_at || item.started_at || item.created_at;
          const finishedAt =
            localMatch?.finished_at ||
            item.finished_at ||
            (item.status !== 'em_andamento' ? item.updated_at || item.created_at : undefined);
          const startTime = localMatch?.start_time || resolveTimeHHMM(startedAt);
          const endTime = localMatch?.end_time || resolveTimeHHMM(finishedAt);

          return {
            id: item.id,
            server_id: item.id,
            machine_id: item.machine_id,
            machine_name: machine?.name || localMatch?.machine_name || 'Retroescavadeira',
            operator_id: item.operator_id,
            operator_name: profile?.full_name || localMatch?.operator_name || 'Operador',
            client_name: item.client_name,
            client_phone: item.client_phone || localMatch?.client_phone || null,
            service_date: item.service_date,
            start_hours: startH,
            end_hours: endH,
            total_hours: totalHours,
            observations: item.observations,
            status: item.status || 'pendente',
            payment_status: (item.payment_status || localMatch?.payment_status || 'a_receber') as PaymentStatus,
            started_at: startedAt,
            finished_at: finishedAt,
            start_time: startTime,
            end_time: endTime,
            hourly_rate: rate,
            total_amount: totalAmount,
            created_at: item.created_at,
          };
        });
      }
    } catch (err) {
      console.warn('[AdminService] Falha ao consultar Supabase, lendo do banco Dexie local:', err);
    }
  }

  // Leitura do banco local Dexie se não houver dados do Supabase
  if (resultLogs.length === 0) {
    const localLogs = await db.offline_work_logs.toArray();
    const cachedMachines = await db.cached_machines.toArray();
    const machineMap = new Map(cachedMachines.map((m) => [m.id, m]));

    resultLogs = localLogs.map((log) => {
      const status = log.status || 'pendente';
      const machine = machineMap.get(log.machine_id);
      const rate = log.hourly_rate || machine?.hourly_rate || 0;
      const startH = Number(log.start_hours ?? 0);
      const endH = Number(log.end_hours ?? 0);
      const rawHours = Number(log.total_hours ?? 0);
      const totalHours = rawHours > 0 ? rawHours : Math.max(0, Number((endH - startH).toFixed(1)));
      const totalAmount = log.total_amount !== undefined && log.total_amount > 0 ? log.total_amount : (totalHours * rate);
      const startedAt = log.started_at || log.created_at;
      const finishedAt = log.finished_at || (status !== 'em_andamento' ? log.created_at : undefined);

      return {
        id: log.id || log.server_id || `temp-${Math.random()}`,
        server_id: log.server_id,
        machine_id: log.machine_id,
        machine_name: machine?.name || log.machine_name,
        operator_id: log.operator_id,
        operator_name: log.operator_name,
        client_name: log.client_name,
        client_phone: log.client_phone || null,
        service_date: log.service_date,
        start_hours: startH,
        end_hours: endH,
        total_hours: totalHours,
        observations: log.observations,
        status,
        payment_status: (log.payment_status || 'a_receber') as PaymentStatus,
        started_at: startedAt,
        finished_at: finishedAt,
        start_time: log.start_time || resolveTimeHHMM(startedAt),
        end_time: log.end_time || resolveTimeHHMM(finishedAt),
        hourly_rate: rate,
        total_amount: totalAmount,
        created_at: log.created_at,
      };
    });

    if (filterStatus !== 'todos') {
      resultLogs = resultLogs.filter((l) => l.status === filterStatus);
    }
  }

  // Ordena por data decrescente
  resultLogs.sort((a, b) => new Date(b.service_date).getTime() - new Date(a.service_date).getTime());

  return resultLogs;
}

/**
 * 2.1. Atualiza os dados de um apontamento de serviço pelo Administrador antes ou depois de aprovar.
 * Salva tanto no cache local do Dexie quanto na tabela `work_logs` do Supabase.
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
      return { success: false, error: 'O horímetro final deve ser maior ou igual ao inicial.' };
    }

    const now = new Date().toISOString();
    const online = typeof navigator !== 'undefined' && navigator.onLine && isSupabaseConfigured();

    const totalHours = Math.max(
      0,
      Number((Number(updates.end_hours) - Number(updates.start_hours)).toFixed(1))
    );
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

    // 1. Localiza e atualiza no Dexie local
    let existing: any = null;
    if (typeof workLogId === 'number') {
      existing = await db.offline_work_logs.get(workLogId);
    } else {
      const numericId = parseInt(workLogId, 10);
      if (!isNaN(numericId) && String(numericId) === String(workLogId)) {
        existing = await db.offline_work_logs.get(numericId);
      }
      if (!existing) {
        try {
          existing = await db.offline_work_logs.where('server_id').equals(String(workLogId)).first();
        } catch {
          const allLocal = await db.offline_work_logs.toArray();
          existing = allLocal.find((l) => l.server_id === workLogId || String(l.id) === String(workLogId));
        }
      }
      if (!existing) {
        const allLocal = await db.offline_work_logs.toArray();
        existing = allLocal.find((l) => l.server_id === workLogId || String(l.id) === String(workLogId));
      }
    }

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
        ...(updates.payment_status ? { payment_status: updates.payment_status } : {}),
      });
    }

    // 2. Se online, atualiza na tabela `work_logs` do Supabase
    if (online) {
      const serverId = existing?.server_id || String(workLogId);
      const { error } = await supabase
        .from('work_logs')
        .update({
          client_name: updates.client_name.trim(),
          client_phone: cleanPhone,
          service_date: updates.service_date,
          machine_id: updates.machine_id,
          start_hours: Number(updates.start_hours),
          end_hours: Number(updates.end_hours),
          observations: cleanObs,
          ...(updates.payment_status ? { payment_status: updates.payment_status } : {}),
          updated_at: now,
        })
        .eq('id', serverId);

      if (error) {
        console.error('[Supabase updateAdminWorkLog Error]:', error);
        return { success: false, error: error.message };
      }
    }

    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Falha ao atualizar apontamento';
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
    const online = typeof navigator !== 'undefined' && navigator.onLine && isSupabaseConfigured();

    // 1. Localiza e atualiza no Dexie local
    let existing: any = null;
    if (typeof workLogId === 'number') {
      existing = await db.offline_work_logs.get(workLogId);
    } else {
      const numericId = parseInt(workLogId, 10);
      if (!isNaN(numericId) && String(numericId) === String(workLogId)) {
        existing = await db.offline_work_logs.get(numericId);
      }
      if (!existing) {
        try {
          existing = await db.offline_work_logs.where('server_id').equals(String(workLogId)).first();
        } catch {
          const allLocal = await db.offline_work_logs.toArray();
          existing = allLocal.find((l) => l.server_id === workLogId || String(l.id) === String(workLogId));
        }
      }
      if (!existing) {
        const allLocal = await db.offline_work_logs.toArray();
        existing = allLocal.find((l) => l.server_id === workLogId || String(l.id) === String(workLogId));
      }
    }

    if (existing?.id) {
      await db.offline_work_logs.update(existing.id, {
        payment_status: paymentStatus,
      });
    }

    // 2. Se online, atualiza `payment_status` na tabela `work_logs` do Supabase
    if (online) {
      const serverId = existing?.server_id || String(workLogId);
      const { error } = await supabase
        .from('work_logs')
        .update({
          payment_status: paymentStatus,
          updated_at: now,
        })
        .eq('id', serverId);

      if (error) {
        console.warn('[Supabase updateWorkLogPaymentStatus Warning]:', error.message);
      }
    }

    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Falha ao atualizar status de pagamento';
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
    const online = typeof navigator !== 'undefined' && navigator.onLine && isSupabaseConfigured();

    // 1. Atualiza no Dexie local
    let targetMachineId: string | null = null;
    let targetEndHours: number | null = null;
    let targetClientName: string = 'Cliente';
    let targetHours: number = 0;

    let existing: any = null;

    if (typeof workLogId === 'number') {
      existing = await db.offline_work_logs.get(workLogId);
    } else {
      const numericId = parseInt(workLogId, 10);
      if (!isNaN(numericId)) {
        existing = await db.offline_work_logs.get(numericId);
      }
      if (!existing) {
        try {
          existing = await db.offline_work_logs.where('server_id').equals(workLogId).first();
        } catch {
          // Fallback seguro caso o índice ainda esteja a migrar
          const allLocal = await db.offline_work_logs.toArray();
          existing = allLocal.find((l) => l.server_id === workLogId || String(l.id) === workLogId);
        }
      }
      if (!existing) {
        const allLocal = await db.offline_work_logs.toArray();
        existing = allLocal.find((l) => l.server_id === workLogId || String(l.id) === workLogId);
      }
    }

    if (existing) {
      targetMachineId = existing.machine_id;
      targetEndHours = existing.end_hours;
      if (existing.client_name) targetClientName = existing.client_name;

      // Certifica-se de que o cálculo das horas trabalhadas utilize (end_hours - start_hours) se total_hours vier vazio ou 0
      const rawHours = Number(existing.total_hours ?? 0);
      const diffHours = Math.max(0, Number((Number(existing.end_hours) - Number(existing.start_hours)).toFixed(1)));
      targetHours = rawHours > 0 ? rawHours : diffHours;

      const calculatedFinalAmount =
        totalAmount > 0 ? totalAmount : Number((targetHours * appliedHourlyRate).toFixed(2));

      if (existing.id) {
        await db.offline_work_logs.update(existing.id, {
          status: 'aprovado',
          hourly_rate: appliedHourlyRate,
          total_hours: targetHours,
          total_amount: calculatedFinalAmount,
        });
      }
    } else {
      targetHours = appliedHourlyRate > 0 ? Number((totalAmount / appliedHourlyRate).toFixed(1)) : 0;
    }

    // Atualiza horômetro da máquina localmente
    if (targetMachineId && targetEndHours) {
      await db.cached_machines.update(targetMachineId, { current_hours: targetEndHours });
    }

    // 2. Se online, envia aprovação e lançamento financeiro ao Supabase
    if (online) {
      const serverId = String(workLogId);

      // Atualiza work_logs
      await supabase
        .from('work_logs')
        .update({
          status: 'aprovado',
          updated_at: now,
        })
        .eq('id', serverId);

      const finalAmountToSend =
        totalAmount > 0 ? totalAmount : Number((targetHours * appliedHourlyRate).toFixed(2));

      // Cria lançamento no financeiro (estritamente colunas suportadas pela tabela)
      const { error: finError } = await supabase.from('financial_entries').insert({
        work_log_id: serverId,
        client_name: targetClientName,
        amount: finalAmountToSend,
        service_date: now.split('T')[0],
        type: 'receita',
        status: 'pendente',
      });

      if (finError) {
        console.error('[Supabase approveWorkLog financial_entries Error]:', finError);
      }

      // Atualiza horômetro no Supabase
      if (targetMachineId && targetEndHours) {
        await supabase
          .from('machines')
          .update({ current_hours: targetEndHours, updated_at: now })
          .eq('id', targetMachineId);
      }
    }

    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Falha ao aprovar apontamento';
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
    const online = typeof navigator !== 'undefined' && navigator.onLine && isSupabaseConfigured();

    // 1. Atualiza no Dexie local
    let existing: any = null;

    if (typeof workLogId === 'number') {
      existing = await db.offline_work_logs.get(workLogId);
      if (existing) {
        await db.offline_work_logs.update(workLogId, {
          status: 'rejeitado',
          observations: reason
            ? `${existing?.observations || ''} [Rejeitado: ${reason}]`.trim()
            : existing?.observations,
        });
      }
    } else {
      const numericId = parseInt(workLogId, 10);
      if (!isNaN(numericId)) {
        existing = await db.offline_work_logs.get(numericId);
      }
      if (!existing) {
        try {
          existing = await db.offline_work_logs.where('server_id').equals(workLogId).first();
        } catch {
          const allLocal = await db.offline_work_logs.toArray();
          existing = allLocal.find((l) => l.server_id === workLogId || String(l.id) === workLogId);
        }
      }
      if (!existing) {
        const allLocal = await db.offline_work_logs.toArray();
        existing = allLocal.find((l) => l.server_id === workLogId || String(l.id) === workLogId);
      }
      if (existing && existing.id) {
        await db.offline_work_logs.update(existing.id, {
          status: 'rejeitado',
          observations: reason
            ? `${existing?.observations || ''} [Rejeitado: ${reason}]`.trim()
            : existing?.observations,
        });
      }
    }

    // 2. Se online, atualiza no Supabase
    if (online) {
      await supabase
        .from('work_logs')
        .update({
          status: 'rejeitado',
          updated_at: now,
        })
        .eq('id', String(workLogId));
    }

    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Falha ao rejeitar apontamento';
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
    const online = typeof navigator !== 'undefined' && navigator.onLine && isSupabaseConfigured();

    // 1. Remove do Dexie local
    if (typeof workLogId === 'number') {
      await db.offline_work_logs.delete(workLogId);
    } else {
      const numericId = parseInt(workLogId, 10);
      if (!isNaN(numericId)) {
        await db.offline_work_logs.delete(numericId);
      }
      try {
        const matched = await db.offline_work_logs.where('server_id').equals(workLogId).toArray();
        for (const item of matched) {
          if (item.id) await db.offline_work_logs.delete(item.id);
        }
      } catch {
        const allLocal = await db.offline_work_logs.toArray();
        const matched = allLocal.filter((l) => l.server_id === workLogId || String(l.id) === workLogId);
        for (const item of matched) {
          if (item.id) await db.offline_work_logs.delete(item.id);
        }
      }
    }

    // 2. Se online, remove do Supabase
    if (online) {
      const serverId = String(workLogId);

      // Remove lançamentos financeiros vinculados (se houver) para evitar violação de integridade referencial
      try {
        await supabase
          .from('financial_entries')
          .delete()
          .eq('work_log_id', serverId);
      } catch (finErr) {
        console.warn('[Supabase deleteWorkLog financial_entries warning]:', finErr);
      }

      // Remove o apontamento da tabela work_logs
      const { error } = await supabase
        .from('work_logs')
        .delete()
        .eq('id', serverId);

      if (error) {
        console.error('[Supabase deleteWorkLog Error]:', error);
        throw error;
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
  const online = typeof navigator !== 'undefined' && navigator.onLine && isSupabaseConfigured();

  if (online) {
    try {
      const { data, error } = await supabase
        .from('machines')
        .select('*')
        .order('name');

      if (!error && data) {
        await db.cached_machines.clear();
        await db.cached_machines.bulkPut(data as Machine[]);
        return data as Machine[];
      }
    } catch {
      // Ignora erro e recorre ao Dexie
    }
  }

  const local = await db.cached_machines.toArray();
  return local;
}

/**
 * 5. CRUD de Máquinas: criação e edição
 */
export async function saveMachine(
  machineData: Partial<Machine>
): Promise<{ success: boolean; machine?: Machine; error?: string }> {
  try {
    const now = new Date().toISOString();
    const online = typeof navigator !== 'undefined' && navigator.onLine && isSupabaseConfigured();

    const payload = {
      name: String(machineData.name).trim(),
      model: String(machineData.model || '').trim(),
      hourly_rate: Number(machineData.hourly_rate) || 0,
      current_hours: Number(machineData.current_hours) || 0,
      active: machineData.active !== undefined ? Boolean(machineData.active) : true,
    };

    let savedMachine: Machine;

    if (online) {
      if (machineData.id) {
        // EDIÇÃO (UPDATE)
        const { data, error } = await supabase
          .from('machines')
          .update(payload)
          .eq('id', machineData.id)
          .select()
          .single();

        if (error) {
          console.error('[Supabase saveMachine Error]:', error);
          return { success: false, error: error.message };
        }

        savedMachine = (data as Machine) || {
          id: machineData.id,
          ...payload,
          updated_at: now,
          created_at: machineData.created_at || now,
        };
      } else {
        // NOVO CADASTRO (INSERT sem o campo 'id' para gerar UUID nativo no Supabase)
        const { data, error } = await supabase
          .from('machines')
          .insert(payload)
          .select()
          .single();

        if (error) {
          console.error('[Supabase saveMachine Error]:', error);
          return { success: false, error: error.message };
        }

        if (!data) {
          return { success: false, error: 'Nenhum dado retornado ao inserir máquina no Supabase.' };
        }

        savedMachine = data as Machine;
      }
    } else {
      // Modo Offline: gera id único local compatível
      const localId =
        machineData.id ||
        (typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `mach-${Date.now()}`);

      savedMachine = {
        id: localId,
        ...payload,
        updated_at: now,
        created_at: machineData.created_at || now,
      };
    }

    // Salva ou atualiza a máquina no cache local Dexie
    await db.cached_machines.put(savedMachine);

    return { success: true, machine: savedMachine };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Falha ao salvar máquina';
    console.error('[saveMachine Unexpected Error]:', msg);
    return { success: false, error: msg };
  }
}
