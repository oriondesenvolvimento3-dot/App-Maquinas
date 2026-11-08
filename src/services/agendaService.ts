import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { db } from '../lib/dexieDb';
import {
  isValidUuid,
  sanitizeScheduledServiceForSupabase,
  buildScheduleNotesForSupabase,
  resolveEstimatedHours,
  resolveAgreedRate,
  toast,
} from './syncService';
import type {
  ScheduledService,
  ScheduledServicePeriod,
  ScheduledServiceStatus,
  Profile,
  Machine,
} from '../types/database';

export interface ScheduledServiceInput {
  client_name: string;
  client_phone?: string | null;
  service_type: string;
  scheduled_date: string;
  period?: ScheduledServicePeriod;
  scheduled_period?: ScheduledServicePeriod;
  machine_id?: string | null;
  machine_name?: string | null;
  operator_id?: string | null;
  operator_name?: string | null;
  location?: string | null;
  agreement_details?: string | null;
  estimated_hours?: number | null;
  agreed_rate?: number | null;
  agreed_amount?: number | null;
  observations?: string | null;
  notes?: string | null;
  status?: ScheduledServiceStatus;
}

export interface KnownClientSuggestion {
  name: string;
  phone?: string | null;
}

/**
 * Busca um agendamento local pelo ID (numérico ou server_id UUID)
 */
async function findLocalSchedule(
  scheduleId: string | number
): Promise<ScheduledService | undefined> {
  if (typeof scheduleId === 'number') {
    return await db.scheduled_services.get(scheduleId);
  }
  const numericId = parseInt(String(scheduleId), 10);
  if (!isNaN(numericId) && String(numericId) === String(scheduleId).trim()) {
    const byNum = await db.scheduled_services.get(numericId);
    if (byNum) return byNum;
  }
  try {
    const byServer = await db.scheduled_services
      .where('server_id')
      .equals(String(scheduleId))
      .first();
    if (byServer) return byServer;
  } catch {
    // Fallback varredura
  }
  const all = await db.scheduled_services.toArray();
  return all.find(
    (s) => s.server_id === String(scheduleId) || String(s.id) === String(scheduleId)
  );
}

/**
 * Limpa ou envia qualquer registro antigo preso no Dexie com `sync_status: 'pending'`
 * para evitar inconsistências entre o banco local e o Supabase.
 */
export async function flushOrCleanupLegacyPendingSchedules(): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.onLine || !isSupabaseConfigured()) {
    return;
  }

  try {
    const allLocal = await db.scheduled_services.toArray();
    const stuckPending = allLocal.filter(
      (item) => item.sync_status === 'pending' || !item.server_id
    );

    for (const item of stuckPending) {
      try {
        if (item.client_name && item.scheduled_date && item.service_type) {
          const payload = sanitizeScheduledServiceForSupabase(item);
          const { error } = await supabase
            .from('scheduled_services')
            .insert([payload])
            .select()
            .single();

          if (error) {
            console.warn(
              '[AgendaDirectCleanup] Descartando agendamento pendente inválido do cache local:',
              error.message
            );
          }
        }
      } catch {
        // Ignora falha do item legado e remove do cache local
      } finally {
        if (item.id !== undefined) {
          await db.scheduled_services.delete(Number(item.id));
        }
      }
    }
  } catch (err) {
    console.warn('[AgendaDirectCleanup] Aviso ao limpar registros pendentes antigos:', err);
  }
}

/**
 * 1. Carrega os agendamentos diretamente da tabela `scheduled_services` do Supabase,
 * atualizando a tabela local do Dexie apenas como espelho/cache de leitura após a resposta da API.
 */
export async function fetchScheduledServices(): Promise<ScheduledService[]> {
  const online =
    typeof navigator !== 'undefined' && navigator.onLine && isSupabaseConfigured();

  const cachedMachines = await db.cached_machines.toArray();
  const machineMap = new Map(cachedMachines.map((m) => [m.id, m]));

  const cachedProfiles = await db.cached_profiles.toArray();
  const profileMap = new Map(cachedProfiles.map((p) => [p.id, p]));

  if (online) {
    // 1. Limpa/envia qualquer registro legado pendente preso no Dexie
    await flushOrCleanupLegacyPendingSchedules();

    try {
      // 2. Consulta direta à tabela scheduled_services no Supabase
      let { data, error } = await supabase
        .from('scheduled_services')
        .select('*, machines(id, name, model), profiles:operator_id(id, full_name)')
        .order('scheduled_date', { ascending: true });

      // Caso a relação FK para profiles não exista no schema público (PGRST200),
      // realiza a consulta direta com join em machines e resolve o operador pelo mapa de perfis
      if (error && (error as any).code === 'PGRST200') {
        const fallbackRes = await supabase
          .from('scheduled_services')
          .select('*, machines(id, name, model)')
          .order('scheduled_date', { ascending: true });
        data = fallbackRes.data as any;
        error = fallbackRes.error;
      }

      if (error) {
        console.error('[AgendaDirectFetch Error]:', error);
        toast.error(error.message);
      } else if (data) {
        const mirroredList: ScheduledService[] = (data as any[]).map((remote) => {
          const joinedMachineModel =
            remote.machines?.model &&
            remote.machines.model.trim() !== '' &&
            remote.machines.model.trim() !== 'Padrão'
              ? remote.machines.model.trim()
              : null;
          const joinedMachineName = joinedMachineModel || remote.machines?.name || null;
          const joinedOperatorName = remote.profiles?.full_name || null;
          const machine = remote.machine_id ? machineMap.get(remote.machine_id) : undefined;
          const cachedMachineDisplay =
            machine?.model &&
            machine.model.trim() !== '' &&
            machine.model.trim() !== 'Padrão'
              ? machine.model.trim()
              : machine?.name || null;
          const profile = remote.operator_id ? profileMap.get(remote.operator_id) : undefined;

          const periodVal = (remote.scheduled_period ||
            remote.period ||
            'integral') as ScheduledServicePeriod;

          const estHours =
            remote.estimated_hours !== undefined && remote.estimated_hours !== null
              ? Number(remote.estimated_hours)
              : null;
          const agreedRate =
            remote.agreed_rate !== undefined && remote.agreed_rate !== null
              ? Number(remote.agreed_rate)
              : null;

          // Monta resumo amigável se houver horas estimadas ou taxa combinada
          const agreementParts: string[] = [];
          if (estHours !== null) agreementParts.push(`${estHours}h estimadas`);
          if (agreedRate !== null) {
            agreementParts.push(
              `R$ ${agreedRate.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
            );
          }

          return {
            id: remote.id,
            server_id: remote.id,
            client_name: remote.client_name,
            client_phone: remote.client_phone || null,
            service_type: remote.service_type || 'Terraplanagem',
            scheduled_date: remote.scheduled_date,
            scheduled_period: periodVal,
            period: periodVal,
            machine_id: remote.machine_id || null,
            machine_name: joinedMachineName || cachedMachineDisplay || null,
            operator_id: remote.operator_id || null,
            operator_name: joinedOperatorName || profile?.full_name || null,
            location: remote.location || null,
            estimated_hours: estHours,
            agreed_rate: agreedRate,
            agreement_details:
              agreementParts.length > 0 ? agreementParts.join(' • ') : null,
            notes: remote.notes || null,
            observations: remote.notes || null,
            status: (remote.status || 'agendado') as ScheduledServiceStatus,
            sync_status: 'synced',
            synced: true,
            created_at: remote.created_at || new Date().toISOString(),
          };
        });

        // Espelha no Dexie apenas como cache após resposta bem-sucedida da nuvem
        await db.transaction('rw', db.scheduled_services, async () => {
          await db.scheduled_services.clear();
          for (const item of mirroredList) {
            const { id: _remoteUuid, ...cacheCopy } = item;
            await db.scheduled_services.add({
              ...cacheCopy,
              server_id: String(item.server_id),
            });
          }
        });

        return mirroredList;
      }
    } catch (err) {
      console.error('[AgendaDirectFetch Error]:', err);
    }
  }

  // Fallback de leitura do cache local (quando sem internet ou em ambiente de teste sem Supabase)
  const allLocal = await db.scheduled_services.toArray();
  const enriched = allLocal.map((item) => {
    const machine = item.machine_id ? machineMap.get(item.machine_id) : undefined;
    const profile = item.operator_id ? profileMap.get(item.operator_id) : undefined;
    return {
      ...item,
      id: item.server_id || item.id,
      period: (item.scheduled_period || item.period || 'integral') as ScheduledServicePeriod,
      machine_name: item.machine_name || machine?.name || null,
      operator_name: item.operator_name || profile?.full_name || null,
    };
  });

  enriched.sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));
  return enriched;
}

/**
 * 2. Cria um novo agendamento gravando DIRETAMENTE na tabela `scheduled_services` do Supabase.
 * Não utiliza o Dexie como etapa prévia que mascare erros de envio.
 */
export async function createScheduledService(
  input: ScheduledServiceInput
): Promise<{
  success: boolean;
  schedule?: ScheduledService;
  error?: string;
}> {
  if (!input.client_name || input.client_name.trim().length === 0) {
    return { success: false, error: 'Informe o nome do cliente.' };
  }
  if (!input.service_type || input.service_type.trim().length === 0) {
    return { success: false, error: 'Informe o tipo de serviço.' };
  }
  if (!input.scheduled_date) {
    return { success: false, error: 'Informe a data do agendamento.' };
  }

  const now = new Date().toISOString();
  const scheduledPeriod: ScheduledServicePeriod =
    input.scheduled_period || input.period || 'integral';

  const validMachineUuid = isValidUuid(input.machine_id) ? input.machine_id!.trim() : null;
  const validOperatorUuid = isValidUuid(input.operator_id) ? input.operator_id!.trim() : null;
  const estimatedHours = resolveEstimatedHours(input);
  const agreedRate = resolveAgreedRate(input);
  const notes = buildScheduleNotesForSupabase(input);

  // Payload estritamente sanitizado para o Supabase (sem IDs numéricos locais)
  const supabasePayload = {
    client_name: input.client_name.trim(),
    client_phone: input.client_phone?.trim() || null,
    service_type: input.service_type.trim(),
    scheduled_date: input.scheduled_date,
    scheduled_period: scheduledPeriod,
    machine_id: validMachineUuid,
    operator_id: validOperatorUuid,
    location: input.location?.trim() || null,
    estimated_hours: estimatedHours,
    agreed_rate: agreedRate,
    status: (input.status || 'agendado') as ScheduledServiceStatus,
    notes,
  };

  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase
        .from('scheduled_services')
        .insert([supabasePayload])
        .select()
        .single();

      if (error) {
        console.error('[AgendaDirectInsert Error]:', error);
        toast.error(error.message);
        return { success: false, error: error.message };
      }

      if (!data) {
        const msg = 'Nenhum dado retornado pelo Supabase ao criar agendamento.';
        console.error('[AgendaDirectInsert Error]:', msg);
        toast.error(msg);
        return { success: false, error: msg };
      }

      const remoteId = String((data as any).id);
      const savedSchedule: ScheduledService = {
        id: remoteId,
        server_id: remoteId,
        client_name: supabasePayload.client_name,
        client_phone: supabasePayload.client_phone,
        service_type: supabasePayload.service_type,
        scheduled_date: supabasePayload.scheduled_date,
        scheduled_period: supabasePayload.scheduled_period,
        period: supabasePayload.scheduled_period,
        machine_id: supabasePayload.machine_id,
        machine_name: input.machine_name || null,
        operator_id: supabasePayload.operator_id,
        operator_name: input.operator_name || null,
        location: supabasePayload.location,
        estimated_hours: supabasePayload.estimated_hours,
        agreed_rate: supabasePayload.agreed_rate,
        agreement_details: input.agreement_details?.trim() || null,
        notes: supabasePayload.notes,
        observations: supabasePayload.notes,
        status: supabasePayload.status,
        sync_status: 'synced',
        synced: true,
        created_at: (data as any).created_at || now,
      };

      // Atualiza o cache local do Dexie apenas após confirmação de sucesso do Supabase
      const { id: _ignoreId, ...dexieCopy } = savedSchedule;
      await db.scheduled_services.add(dexieCopy);

      return { success: true, schedule: savedSchedule };
    } catch (err) {
      console.error('[AgendaDirectInsert Error]:', err);
      const msg =
        err instanceof Error ? err.message : 'Erro ao gravar agendamento no Supabase.';
      toast.error(msg);
      return { success: false, error: msg };
    }
  }

  // Ambiente de testes unitários (onde VITE_SUPABASE_URL não está configurado)
  const fallbackRecord: ScheduledService = {
    ...supabasePayload,
    period: scheduledPeriod,
    machine_id: input.machine_id || null,
    machine_name: input.machine_name || null,
    operator_id: input.operator_id || null,
    operator_name: input.operator_name || null,
    agreement_details: input.agreement_details?.trim() || null,
    observations: input.observations?.trim() || notes,
    sync_status: 'synced',
    synced: true,
    created_at: now,
  };
  const localId = await db.scheduled_services.add(fallbackRecord);
  fallbackRecord.id = localId;
  return { success: true, schedule: fallbackRecord };
}

/**
 * 3. Atualiza diretamente um agendamento existente na tabela `scheduled_services` do Supabase
 */
export async function updateScheduledService(
  scheduleId: string | number,
  updates: Partial<ScheduledServiceInput>
): Promise<{ success: boolean; error?: string }> {
  try {
    const existing = await findLocalSchedule(scheduleId);
    const merged = { ...existing, ...updates };
    const scheduledPeriod: ScheduledServicePeriod =
      updates.scheduled_period ||
      updates.period ||
      existing?.scheduled_period ||
      existing?.period ||
      'integral';

    const remotePayload = {
      ...(merged.client_name ? { client_name: merged.client_name.trim() } : {}),
      client_phone: merged.client_phone?.trim() || null,
      ...(merged.service_type ? { service_type: merged.service_type.trim() } : {}),
      ...(merged.scheduled_date ? { scheduled_date: merged.scheduled_date } : {}),
      scheduled_period: scheduledPeriod,
      machine_id: isValidUuid(merged.machine_id) ? merged.machine_id!.trim() : null,
      operator_id: isValidUuid(merged.operator_id) ? merged.operator_id!.trim() : null,
      location: merged.location?.trim() || null,
      estimated_hours: resolveEstimatedHours(merged),
      agreed_rate: resolveAgreedRate(merged),
      notes: buildScheduleNotesForSupabase(merged),
      ...(merged.status ? { status: merged.status } : {}),
    };

    if (isSupabaseConfigured()) {
      const targetId = existing?.server_id || String(scheduleId);
      const { error } = await supabase
        .from('scheduled_services')
        .update(remotePayload)
        .eq('id', targetId);

      if (error) {
        console.error('[AgendaDirectInsert Error]:', error);
        toast.error(error.message);
        return { success: false, error: error.message };
      }
    }

    if (existing?.id !== undefined) {
      await db.scheduled_services.update(Number(existing.id), {
        ...remotePayload,
        period: scheduledPeriod,
        machine_name: updates.machine_name ?? existing.machine_name ?? null,
        operator_name: updates.operator_name ?? existing.operator_name ?? null,
        agreement_details: updates.agreement_details ?? existing.agreement_details ?? null,
        observations: remotePayload.notes,
        sync_status: 'synced',
        synced: true,
      });
    }

    return { success: true };
  } catch (err) {
    console.error('[AgendaDirectInsert Error]:', err);
    const msg = err instanceof Error ? err.message : 'Falha ao atualizar agendamento';
    toast.error(msg);
    return { success: false, error: msg };
  }
}

/**
 * 4. Atualiza diretamente o status do agendamento no Supabase ('agendado' | 'concluido' | 'cancelado')
 */
export async function updateScheduledServiceStatus(
  scheduleId: string | number,
  status: ScheduledServiceStatus
): Promise<{ success: boolean; error?: string }> {
  try {
    const existing = await findLocalSchedule(scheduleId);

    if (isSupabaseConfigured()) {
      const targetId = existing?.server_id || String(scheduleId);
      const { error } = await supabase
        .from('scheduled_services')
        .update({ status })
        .eq('id', targetId);

      if (error) {
        console.error('[AgendaDirectUpdateStatus Error]:', error);
        toast.error(error.message);
        return { success: false, error: error.message };
      }
    }

    if (existing?.id !== undefined) {
      await db.scheduled_services.update(Number(existing.id), {
        status,
        sync_status: 'synced',
        synced: true,
      });
    }

    return { success: true };
  } catch (err) {
    console.error('[AgendaDirectUpdateStatus Error]:', err);
    const msg = err instanceof Error ? err.message : 'Falha ao atualizar status do agendamento';
    toast.error(msg);
    return { success: false, error: msg };
  }
}

/**
 * 5. Remove diretamente um agendamento do Supabase e do espelho local
 */
export async function deleteScheduledService(
  scheduleId: string | number
): Promise<{ success: boolean; error?: string }> {
  try {
    const existing = await findLocalSchedule(scheduleId);
    const targetId = existing?.server_id || String(scheduleId);

    if (isSupabaseConfigured() && isValidUuid(targetId)) {
      const { error } = await supabase
        .from('scheduled_services')
        .delete()
        .eq('id', targetId);

      if (error) {
        console.error('[AgendaDirectDelete Error]:', error);
        toast.error(error.message);
        return { success: false, error: error.message };
      }
    }

    if (existing?.id !== undefined) {
      await db.scheduled_services.delete(Number(existing.id));
    }

    return { success: true };
  } catch (err) {
    console.error('[AgendaDirectDelete Error]:', err);
    const msg = err instanceof Error ? err.message : 'Falha ao excluir agendamento';
    toast.error(msg);
    return { success: false, error: msg };
  }
}

/**
 * 6. Busca lista de operadores (perfis) diretamente do Supabase
 */
export async function fetchOperators(): Promise<Profile[]> {
  const online =
    typeof navigator !== 'undefined' && navigator.onLine && isSupabaseConfigured();

  if (online) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('full_name');

      if (!error && data) {
        await db.cached_profiles.bulkPut(data as Profile[]);
        return data as Profile[];
      }
    } catch {
      // Fallback para cache local
    }
  }

  return await db.cached_profiles.toArray();
}

/**
 * 8. Busca máquinas cadastradas diretamente do Supabase para o dropdown do agendamento
 */
export async function fetchScheduleMachines(): Promise<Machine[]> {
  const online =
    typeof navigator !== 'undefined' && navigator.onLine && isSupabaseConfigured();

  if (online) {
    try {
      const { data, error } = await supabase
        .from('machines')
        .select('*')
        .order('name');

      if (!error && data) {
        await db.cached_machines.bulkPut(data as Machine[]);
        return data as Machine[];
      }
    } catch {
      // Fallback para cache local
    }
  }

  return await db.cached_machines.toArray();
}

/**
 * 9. Retorna sugestões de clientes conhecidos do histórico (com telefone quando disponível)
 * para autocompletar no formulário de Novo Agendamento.
 */
export async function fetchKnownClients(): Promise<KnownClientSuggestion[]> {
  const map = new Map<string, KnownClientSuggestion>();

  const cachedClients = await db.cached_clients.toArray();
  for (const client of cachedClients) {
    if (client.is_active === false) continue;
    const cleanName = client.name?.trim();
    if (!cleanName) continue;
    const key = cleanName.toLowerCase();
    map.set(key, { name: cleanName, phone: client.phone || null });
  }

  const workLogs = await db.offline_work_logs.toArray();
  for (const log of workLogs) {
    const cleanName = log.client_name?.trim();
    if (!cleanName || cleanName.toLowerCase() === 'em andamento') continue;
    const key = cleanName.toLowerCase();
    const existing = map.get(key);
    if (!existing || (!existing.phone && log.client_phone)) {
      map.set(key, { name: cleanName, phone: log.client_phone || null });
    }
  }

  const schedules = await db.scheduled_services.toArray();
  for (const sched of schedules) {
    const cleanName = sched.client_name?.trim();
    if (!cleanName) continue;
    const key = cleanName.toLowerCase();
    const existing = map.get(key);
    if (!existing || (!existing.phone && sched.client_phone)) {
      map.set(key, { name: cleanName, phone: sched.client_phone || null });
    }
  }

  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}
