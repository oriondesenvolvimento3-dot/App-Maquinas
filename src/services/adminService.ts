import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { db } from '../lib/dexieDb';
import type { Machine } from '../types/database';

export interface AdminMetrics {
  totalServices: number;
  totalHours: number;
  billedAmount: number;
  pendingAmount: number;
}

export type WorkLogFilter = 'todos' | 'aprovado' | 'pendente' | 'rejeitado';

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
  status: 'pendente' | 'aprovado' | 'rejeitado';
  hourly_rate?: number;
  total_amount?: number;
  created_at: string;
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

        resultLogs = data.map((item: any) => {
          const machine = machineMap.get(item.machine_id);
          const profile = profileMap.get(item.operator_id);

          const rate = Number(machine?.hourly_rate ?? 0);
          const rawHours = Number(item.total_hours ?? 0);
          const startH = Number(item.start_hours ?? 0);
          const endH = Number(item.end_hours ?? 0);
          const totalHours = rawHours > 0 ? rawHours : Math.max(0, Number((endH - startH).toFixed(1)));
          const totalAmount = totalHours * rate;

          return {
            id: item.id,
            server_id: item.id,
            machine_id: item.machine_id,
            machine_name: machine?.name || 'Retroescavadeira',
            operator_id: item.operator_id,
            operator_name: profile?.full_name || 'Operador',
            client_name: item.client_name,
            client_phone: item.client_phone || null,
            service_date: item.service_date,
            start_hours: startH,
            end_hours: endH,
            total_hours: totalHours,
            observations: item.observations,
            status: item.status || 'pendente',
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

    resultLogs = localLogs.map((log) => {
      const status = log.status || 'pendente';
      const rate = log.hourly_rate || 0;
      const startH = Number(log.start_hours ?? 0);
      const endH = Number(log.end_hours ?? 0);
      const rawHours = Number(log.total_hours ?? 0);
      const totalHours = rawHours > 0 ? rawHours : Math.max(0, Number((endH - startH).toFixed(1)));
      const totalAmount = log.total_amount !== undefined && log.total_amount > 0 ? log.total_amount : (totalHours * rate);

      return {
        id: log.id || log.server_id || `temp-${Math.random()}`,
        server_id: log.server_id,
        machine_id: log.machine_id,
        machine_name: log.machine_name,
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
