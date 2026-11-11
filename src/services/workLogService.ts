import { supabase, isSupabaseConfigured } from '../lib/supabase';
import {
  db,
  saveOfflineWorkLog,
  getActiveWorkLogInDexie,
  getCachedActiveMachines,
  setCachedMachines,
} from '../lib/dexieDb';
import {
  formatTimeHHMM,
  calculateTotalHours,
  getBrazilTodayDate,
  toBrazilDateString,
} from '../utils/formatters';
import type { Machine, OfflineWorkLog, BillingUnit } from '../types/database';
import { getStoredMachineBillingUnits } from './adminService';
import {
  SYNC_COMPLETE_EVENT,
  isValidUUID,
  generateWorkLogUUID,
  isNetworkError,
  toast,
} from './syncService';

export { formatTimeHHMM, calculateTotalHours };

export interface StartServiceFormData {
  machine_id: string;
  machine_name: string;
  operator_id: string;
  operator_name: string;
  start_hours: number;
  billing_unit?: BillingUnit;
  km_initial?: number;
  client_name?: string;
  client_phone?: string | null;
}

export interface FinishServiceFormData {
  localId?: string | number;
  serverId?: string | null;
  machine_id: string;
  machine_name: string;
  operator_id: string;
  operator_name: string;
  client_name: string;
  client_phone?: string | null;
  service_date: string;
  start_hours: number;
  end_hours: number;
  billing_unit?: BillingUnit;
  km_initial?: number;
  km_final?: number;
  total_km?: number;
  observations?: string | null;
  started_at?: string;
  start_time?: string;
  finished_at?: string;
  end_time?: string;
}

export interface WorkLogFormData {
  machine_id: string;
  machine_name: string;
  operator_id: string;
  operator_name: string;
  client_name: string;
  client_phone?: string;
  service_date: string;
  start_hours: number;
  end_hours: number;
  billing_unit?: BillingUnit;
  km_initial?: number;
  km_final?: number;
  total_km?: number;
  observations: string | null;
}

export interface ValidationResult {
  isValid: boolean;
  errors: {
    machine_id?: string;
    client_name?: string;
    start_hours?: string;
    end_hours?: string;
    service_date?: string;
  };
}

/**
 * Consulta exclusivamente as máquinas ativas no banco de dados.
 * Se houver conexão com o Supabase, sincroniza com o cache local.
 * Caso contrário, lê do cache local (Dexie).
 * Se o banco estiver vazio, retorna um array vazio (sem dados mockados).
 */
export async function getActiveMachines(isOnline?: boolean): Promise<Machine[]> {
  const online = isOnline ?? (typeof navigator !== 'undefined' && navigator.onLine && isSupabaseConfigured());
  const storedUnits = getStoredMachineBillingUnits();

  if (online) {
    try {
      const { data, error } = await supabase
        .from('machines')
        .select('*')
        .eq('active', true)
        .order('name');

      if (!error && data) {
        // Preserva o horímetro mais recente entre o cache local e o banco remoto
        const currentCached = await db.cached_machines.toArray();
        const cachedMap = new Map(currentCached.map((m) => [m.id, m]));

        const enriched = (data as Machine[]).map((m) => {
          const cached = cachedMap.get(m.id);
          const cachedHours = Number(
            cached?.current_hours ??
            (cached as any)?.current_horimeter ??
            (cached as any)?.horimeter ??
            0
          );
          const remoteHours = Number(
            m.current_hours ??
            (m as any)?.current_horimeter ??
            (m as any)?.horimeter ??
            0
          );
          const finalHours = Math.max(remoteHours, cachedHours);

          return {
            ...m,
            current_hours: finalHours,
            billing_unit:
              m.billing_unit === 'km' || storedUnits[m.id] === 'km'
                ? ('km' as const)
                : ('hour' as const),
          };
        });
        await setCachedMachines(enriched);
        return enriched;
      }
    } catch (err) {
      console.warn('[WorkLogService] Falha ao consultar Supabase, lendo do Dexie:', err);
    }
  }

  const cached = await getCachedActiveMachines();
  return cached.map((m) => ({
    ...m,
    billing_unit:
      m.billing_unit === 'km' || storedUnits[m.id] === 'km'
        ? ('km' as const)
        : ('hour' as const),
  }));
}

/**
 * Recupera o horímetro mais atualizado para uma máquina:
 * Prioriza o maior valor entre:
 * 1. O horímetro da máquina (current_hours / current_horimeter)
 * 2. O end_hours do último apontamento finalizado no Dexie local
 * 3. O end_hours do último apontamento finalizado no Supabase (se online)
 */
export async function getLatestHorimeterForMachine(
  machineId: string,
  baseMachineHours?: number
): Promise<number> {
  if (!machineId) return 0;

  let maxHours = Number(baseMachineHours || 0);

  // 1. Consulta máquina em cache local (Dexie)
  try {
    const cached = await db.cached_machines.get(machineId);
    if (cached) {
      const ch = Number(
        cached.current_hours ??
        (cached as any).current_horimeter ??
        (cached as any).horimeter ??
        0
      );
      if (ch > maxHours) maxHours = ch;
    }
  } catch {}

  // 2. Consulta o último serviço finalizado no Dexie local para esta máquina
  try {
    const localLogs = await db.offline_work_logs
      .where('machine_id')
      .equals(machineId)
      .toArray();

    for (const log of localLogs) {
      if (log.status !== 'em_andamento' && (log.status as any) !== 'in_progress') {
        const end = Number(
          log.end_hours ??
          log.km_final ??
          (log as any).final_horimeter ??
          0
        );
        if (end > maxHours) {
          maxHours = end;
        }
      }
    }
  } catch {}

  // 3. Se online, consulta o último serviço finalizado no Supabase para esta máquina
  const online = typeof navigator !== 'undefined' && navigator.onLine && isSupabaseConfigured();
  if (online) {
    try {
      const { data } = await supabase
        .from('work_logs')
        .select('end_hours')
        .eq('machine_id', machineId)
        .not('status', 'in', '("em_andamento","in_progress")')
        .order('service_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data && data.end_hours !== null && data.end_hours !== undefined) {
        const remoteEnd = Number(data.end_hours);
        if (remoteEnd > maxHours) {
          maxHours = remoteEnd;
        }
      }
    } catch {}
  }

  return maxHours;
}

/**
 * Alias para compatibilidade reversa
 */
export const ensureCachedMachines = getActiveMachines;

/**
 * Valida os campos da conclusão de serviço
 */
export function validateFinishServiceInput(data: Partial<FinishServiceFormData>): {
  isValid: boolean;
  errors: {
    end_hours?: string;
    client_name?: string;
    service_date?: string;
  };
} {
  const errors: {
    end_hours?: string;
    client_name?: string;
    service_date?: string;
  } = {};

  if (!data.client_name || data.client_name.trim().length === 0) {
    errors.client_name = 'Informe o nome do cliente ou da obra.';
  }

  if (data.end_hours === undefined || isNaN(data.end_hours) || data.end_hours <= 0) {
    errors.end_hours = 'Horímetro final inválido.';
  } else if (data.start_hours !== undefined && data.end_hours <= data.start_hours) {
    errors.end_hours = 'O horímetro final deve ser superior ao horímetro inicial.';
  }

  if (!data.service_date) {
    errors.service_date = 'Informe a data do serviço.';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Valida os campos legados do apontamento de horas
 */
export function validateWorkLogInput(data: Partial<WorkLogFormData>): ValidationResult {
  const errors: ValidationResult['errors'] = {};

  if (!data.machine_id) {
    errors.machine_id = 'Selecione a máquina utilizada.';
  }

  if (!data.client_name || data.client_name.trim().length === 0) {
    errors.client_name = 'Informe o nome do cliente ou da obra.';
  }

  if (data.start_hours === undefined || isNaN(data.start_hours) || data.start_hours < 0) {
    errors.start_hours = 'Horímetro inicial inválido.';
  }

  if (data.end_hours === undefined || isNaN(data.end_hours) || data.end_hours <= 0) {
    errors.end_hours = 'Horímetro final inválido.';
  } else if (data.start_hours !== undefined && data.end_hours <= data.start_hours) {
    errors.end_hours = 'O horímetro final deve ser estritamente maior que o horímetro inicial.';
  }

  if (!data.service_date) {
    errors.service_date = 'Informe a data do serviço.';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Consulta o serviço atualmente em andamento de um operador (no Dexie ou no Supabase).
 * Filtra estritamente por status em andamento ('em_andamento' ou 'in_progress').
 * Registros com status 'pendente', 'aprovado', 'rejeitado', 'completed' NUNCA são considerados ativos.
 */
export async function getActiveWorkLogForOperator(
  operatorId: string,
  isOnline?: boolean
): Promise<OfflineWorkLog | null> {
  if (!operatorId) return null;

  // 1. Primeiro verifica no Dexie (IndexedDB local)
  const localActive = await getActiveWorkLogInDexie(operatorId);
  if (localActive) {
    if (localActive.status === 'em_andamento' || (localActive.status as any) === 'in_progress') {
      return localActive;
    }
  }

  // 2. Se online e configurado com o Supabase, verifica se há serviço ativo na nuvem
  const online = isOnline ?? (typeof navigator !== 'undefined' && navigator.onLine && isSupabaseConfigured());
  if (online) {
    try {
      const { data, error } = await supabase
        .from('work_logs')
        .select('*, machine:machines(name)')
        .eq('operator_id', operatorId)
        .in('status', ['em_andamento', 'in_progress'] as any)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        // Validação estrita: se não for em andamento, descarta
        if (data.status !== 'em_andamento' && (data.status as any) !== 'in_progress') {
          return null;
        }

        // Verifica se esse server_id já existe no Dexie local
        const existingLocal = await db.offline_work_logs
          .where('server_id')
          .equals(data.id)
          .first();

        if (existingLocal) {
          // Se já foi finalizado localmente (pendente, aprovado, etc.), NÃO é ativo!
          if (existingLocal.status !== 'em_andamento' && (existingLocal.status as any) !== 'in_progress') {
            return null;
          }
          return existingLocal;
        }

        // Salva no Dexie local para garantir resiliência offline
        const machineName = (data.machine as any)?.name || 'Retroescavadeira';
        const now = new Date().toISOString();
        const startedIso = data.started_at || data.created_at || now;
        const newLocalLog: OfflineWorkLog = {
          server_id: data.id,
          machine_id: data.machine_id,
          machine_name: machineName,
          operator_id: data.operator_id,
          operator_name: 'Operador',
          client_name: (data.client_name && data.client_name !== 'Em andamento') ? data.client_name : 'A definir',
          client_phone: data.client_phone || null,
          service_date: data.service_date,
          start_hours: Number(data.start_hours),
          end_hours: Number(data.end_hours ?? 0),
          total_hours: 0,
          observations: data.observations || null,
          status: 'em_andamento',
          started_at: startedIso,
          start_time: formatTimeHHMM(startedIso),
          sync_status: 'synced',
          synced: true,
          created_at: data.created_at || now,
          synced_at: now,
        };

        const id = await db.offline_work_logs.add(newLocalLog);
        newLocalLog.id = id;
        return newLocalLog;
      }
    } catch (err) {
      console.warn('[WorkLogService] Falha ao verificar serviço ativo no Supabase:', err);
    }
  }

  return null;
}

/**
 * ETAPA 1: Inicia um serviço (Check-in).
 * Salva primeiro com status 'em_andamento' no Dexie e envia automaticamente ao Supabase (se online).
 */
export async function startWorkLog(
  formData: StartServiceFormData,
  isOnline?: boolean
): Promise<{ success: boolean; localId?: string | number; serverId?: string; error?: string }> {
  if (!formData.machine_id) {
    return { success: false, error: 'Selecione uma máquina.' };
  }
  if (formData.start_hours === undefined || isNaN(formData.start_hours) || formData.start_hours < 0) {
    return { success: false, error: 'Horímetro inicial inválido.' };
  }

  const online = isOnline ?? (typeof navigator !== 'undefined' && navigator.onLine);

  // Valida que o operador não tem serviço ativo em andamento
  const activeExisting = await getActiveWorkLogForOperator(formData.operator_id, online);
  if (activeExisting) {
    return {
      success: false,
      error: 'Você já possui um serviço em andamento. Finalize-o antes de iniciar um novo.',
    };
  }

  const recordUuid = generateWorkLogUUID();
  const nowDate = new Date();
  const now = nowDate.toISOString();
  const startTimeStr = formatTimeHHMM(nowDate);
  const todayStr = getBrazilTodayDate(nowDate);

  const targetClient = formData.client_name?.trim() || 'A definir';
  const targetPhone = formData.client_phone?.trim() || null;

  // Se start_hours === 0 em máquina que já possui histórico de horímetro (> 50h), preenche automaticamente com o último horímetro conhecido
  let resolvedStartHours = Number(formData.start_hours);
  if (resolvedStartHours === 0 && formData.machine_id) {
    try {
      const latestHorimeter = await getLatestHorimeterForMachine(formData.machine_id);
      if (latestHorimeter > 50) {
        resolvedStartHours = latestHorimeter;
      }
    } catch {}
  }

  const persistLocalStart = async (
    confirmedServerId: string | null,
    isSynced: boolean
  ): Promise<string | number> => {
    const finalId = confirmedServerId || recordUuid;
    return await saveOfflineWorkLog({
      id: finalId,
      server_id: confirmedServerId,
      supabase_id: confirmedServerId,
      machine_id: formData.machine_id,
      machine_name: formData.machine_name,
      operator_id: formData.operator_id,
      operator_name: formData.operator_name,
      client_name: targetClient,
      client_phone: targetPhone,
      service_date: todayStr,
      start_hours: resolvedStartHours,
      end_hours: 0,
      total_hours: 0,
      billing_unit: formData.billing_unit || 'hour',
      km_initial:
        formData.km_initial ??
        (formData.billing_unit === 'km' ? resolvedStartHours : undefined),
      km_final: undefined,
      total_km: 0,
      observations: null,
      status: 'em_andamento',
      started_at: now,
      start_time: startTimeStr,
      sync_status: isSynced ? 'synced' : 'pending',
      synced: isSynced,
      ...(isSynced ? { synced_at: now } : {}),
    });
  };

  // 1. PRIORIDADE ABSOLUTA: Se online e configurado, grava primeiro no Supabase usando UUID gerado na origem
  if (online && isSupabaseConfigured()) {
    try {
      const payload = {
        id: recordUuid,
        machine_id: formData.machine_id,
        operator_id: formData.operator_id,
        client_name: targetClient,
        client_phone: targetPhone,
        service_date: todayStr,
        start_hours: resolvedStartHours,
        end_hours: 0,
        observations: null,
        status: 'em_andamento' as const,
        created_at: now,
      };

      const { data, error } = await supabase
        .from('work_logs')
        .insert(payload)
        .select('id')
        .single();

      if (error) {
        if (!isNetworkError(error)) {
          console.error('[Supabase startWorkLog API Error]:', error);
          toast.error(error.message);
          return { success: false, error: error.message };
        }
        // Erro de conectividade -> fallback offline abaixo
        console.warn('[WorkLogService] Falha de rede ao iniciar serviço, salvando em modo offline:', error.message);
      } else {
        const confirmedId = data?.id || recordUuid;
        const localId = await persistLocalStart(confirmedId, true);
        return { success: true, localId, serverId: confirmedId };
      }
    } catch (err) {
      if (!isNetworkError(err)) {
        const message = err instanceof Error ? err.message : 'Erro ao iniciar serviço no servidor.';
        console.error('[Supabase startWorkLog Exception]:', err);
        toast.error(message);
        return { success: false, error: message };
      }
      console.warn('[WorkLogService] Falha de rede ao iniciar serviço, mantendo no Dexie (synced: false):', err);
    }
  }

  // 2. Fallback estritamente offline (sem conexão ou queda real de rede)
  try {
    const localId = await persistLocalStart(null, false);
    return { success: true, localId };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao salvar no banco local';
    return { success: false, error: message };
  }
}

/**
 * ETAPA 2: Finaliza um serviço (Check-out).
 * Salva primeiro o registro finalizado no Dexie e, se houver conexão com a internet,
 * envia imediatamente para `work_logs` no Supabase marcando `synced: true`.
 */
export async function finishWorkLog(
  formData: FinishServiceFormData,
  isOnline?: boolean
): Promise<{ success: boolean; localId?: string | number; serverId?: string; error?: string }> {
  if (!formData.client_name || formData.client_name.trim().length === 0) {
    return { success: false, error: 'Informe o nome do cliente ou da obra.' };
  }
  if (formData.end_hours === undefined || isNaN(formData.end_hours)) {
    return { success: false, error: 'Informe o horímetro final.' };
  }
  if (formData.end_hours <= formData.start_hours) {
    return { success: false, error: 'O horímetro final deve ser superior ao horímetro inicial.' };
  }

  const total_hours = calculateTotalHours(formData.start_hours, formData.end_hours);
  const phone = formData.client_phone?.trim() || null;
  const nowDate = new Date();
  const now = formData.finished_at || nowDate.toISOString();
  const resolvedServiceDate = formData.service_date
    ? toBrazilDateString(formData.service_date)
    : getBrazilTodayDate(nowDate);
  const endTimeStr = formData.end_time || formatTimeHHMM(now);
  const startedIso = formData.started_at || now;
  const startTimeStr = formData.start_time || formatTimeHHMM(startedIso);
  const online = isOnline ?? (typeof navigator !== 'undefined' && navigator.onLine);

  // Limpeza preventiva de cache no localStorage
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.removeItem('active_service_id');
      window.localStorage.removeItem('running_service');
      window.localStorage.removeItem('active_work_log');
      window.localStorage.removeItem('retroscave_active_service');
    } catch {}
  }

  // 1. Resolução do registro local existente e do UUID padrão de origem
  let existingLocal: OfflineWorkLog | undefined;
  if (formData.localId !== undefined) {
    existingLocal = await db.offline_work_logs.get(formData.localId);
  }
  if (!existingLocal && formData.serverId) {
    existingLocal = await db.offline_work_logs.where('server_id').equals(formData.serverId).first();
  }
  if (!existingLocal && formData.operator_id) {
    existingLocal = await getActiveWorkLogInDexie(formData.operator_id);
  }

  const targetLocalId: string | number | undefined = existingLocal?.id ?? formData.localId;
  const originUuid: string = isValidUUID(formData.serverId)
    ? String(formData.serverId).trim()
    : isValidUUID(existingLocal?.server_id)
    ? String(existingLocal!.server_id).trim()
    : typeof targetLocalId === 'string' && isValidUUID(targetLocalId)
    ? targetLocalId.trim()
    : generateWorkLogUUID();

  const persistLocalFinish = async (
    confirmedServerId: string | null,
    isSynced: boolean
  ): Promise<string | number> => {
    const isKm = formData.billing_unit === 'km';
    const kmInitial = formData.km_initial ?? (isKm ? formData.start_hours : undefined);
    const kmFinal = formData.km_final ?? (isKm ? formData.end_hours : undefined);
    const totalKm = formData.total_km ?? (isKm ? total_hours : undefined);

    const commonFields = {
      client_name: formData.client_name.trim(),
      client_phone: phone,
      service_date: resolvedServiceDate,
      start_hours: formData.start_hours,
      end_hours: formData.end_hours,
      total_hours,
      ...(formData.billing_unit ? { billing_unit: formData.billing_unit } : {}),
      km_initial: kmInitial,
      km_final: kmFinal,
      total_km: totalKm,
      observations: formData.observations?.trim() || null,
      status: 'pendente' as const,
      started_at: startedIso,
      start_time: startTimeStr,
      finished_at: now,
      end_time: endTimeStr,
      ...(confirmedServerId ? { server_id: confirmedServerId, supabase_id: confirmedServerId } : {}),
      sync_status: isSynced ? ('synced' as const) : ('pending' as const),
      synced: isSynced,
      ...(isSynced ? { synced_at: now } : {}),
    };

    let savedId: string | number;
    if (targetLocalId !== undefined && existingLocal) {
      await db.offline_work_logs.update(targetLocalId, commonFields);
      savedId = targetLocalId;
    } else {
      savedId = await saveOfflineWorkLog({
        id: confirmedServerId || originUuid,
        machine_id: formData.machine_id,
        machine_name: formData.machine_name,
        operator_id: formData.operator_id,
        operator_name: formData.operator_name,
        ...commonFields,
        billing_unit: formData.billing_unit || 'hour',
      });
    }

    // Limpeza profunda no Dexie: remove ou atualiza quaisquer outros registros 'em_andamento' do operador
    const remainingActive = await db.offline_work_logs
      .filter(
        (l) =>
          l.operator_id === formData.operator_id &&
          (l.status === 'em_andamento' || (l.status as any) === 'in_progress')
      )
      .toArray();

    for (const stale of remainingActive) {
      if (stale.id !== undefined && stale.id !== savedId) {
        if (
          stale.client_name === 'Em andamento' ||
          stale.client_name === 'A definir' ||
          !stale.total_hours
        ) {
          await db.offline_work_logs.delete(stale.id);
        } else {
          await db.offline_work_logs.update(stale.id, {
            status: 'pendente',
            client_name: formData.client_name.trim(),
          });
        }
      }
    }

    await db.cached_machines.update(formData.machine_id, {
      current_hours: formData.end_hours,
      current_horimeter: formData.end_hours,
      horimeter: formData.end_hours,
    } as any);

    return savedId;
  };

  // 2. PRIORIDADE ABSOLUTA: Se online e configurado, grava primeiro no Supabase
  let resolvedServerId: string | null = null;
  let syncedToServer = false;

  if (online && isSupabaseConfigured()) {
    try {
      // Verifica se este serviço já existia no Supabase (iniciado online)
      let existingRemoteUuid: string | null = isValidUUID(formData.serverId)
        ? String(formData.serverId).trim()
        : isValidUUID(existingLocal?.server_id)
        ? String(existingLocal!.server_id).trim()
        : existingLocal?.synced && isValidUUID(existingLocal.id)
        ? String(existingLocal.id).trim()
        : null;

      if (!existingRemoteUuid) {
        const { data: serverActive } = await supabase
          .from('work_logs')
          .select('id')
          .eq('operator_id', formData.operator_id)
          .in('status', ['em_andamento', 'in_progress'] as any)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (serverActive?.id && isValidUUID(serverActive.id)) {
          existingRemoteUuid = serverActive.id;
        }
      }

      if (existingRemoteUuid) {
        const { error } = await supabase
          .from('work_logs')
          .update({
            client_name: formData.client_name.trim(),
            client_phone: phone,
            service_date: resolvedServiceDate,
            start_hours: formData.start_hours,
            end_hours: formData.end_hours,
            observations: formData.observations?.trim() || null,
            status: 'pendente',
            updated_at: now,
          })
          .eq('id', existingRemoteUuid);

        if (error) {
          if (!isNetworkError(error)) {
            console.error('[Supabase finishWorkLog Update Error]:', error);
            toast.error(error.message);
            return { success: false, error: error.message };
          }
          throw error;
        }
        resolvedServerId = existingRemoteUuid;
        syncedToServer = true;
      } else {
        const payload: Record<string, any> = {
          id: originUuid,
          machine_id: formData.machine_id,
          operator_id: formData.operator_id,
          client_name: formData.client_name.trim(),
          client_phone: phone,
          service_date: resolvedServiceDate,
          start_hours: formData.start_hours,
          end_hours: formData.end_hours,
          observations: formData.observations?.trim() || null,
          status: 'pendente',
          created_at: formData.started_at || now,
        };

        const { data, error } = await supabase
          .from('work_logs')
          .insert(payload)
          .select('id')
          .single();

        if (error) {
          if (!isNetworkError(error)) {
            console.error('[Supabase finishWorkLog Insert Error]:', error);
            toast.error(error.message);
            return { success: false, error: error.message };
          }
          throw error;
        }
        resolvedServerId = data?.id || originUuid;
        syncedToServer = true;
      }

      // Atualiza horímetro da máquina na tabela 'machines' do Supabase (apenas se UUID válido)
      if (isValidUUID(formData.machine_id)) {
        try {
          await supabase
            .from('machines')
            .update({
              current_hours: formData.end_hours,
              updated_at: now,
            })
            .eq('id', formData.machine_id);
        } catch (machErr) {
          console.warn('[WorkLogService] Falha ao atualizar horímetro da máquina no Supabase:', machErr);
        }
      }

      // Limpeza de segurança no Supabase
      try {
        await supabase
          .from('work_logs')
          .update({
            status: 'pendente',
            client_name: formData.client_name.trim(),
            updated_at: now,
          })
          .eq('operator_id', formData.operator_id)
          .in('status', ['em_andamento', 'in_progress'] as any);
      } catch {}
    } catch (err) {
      if (!isNetworkError(err)) {
        const message = err instanceof Error ? err.message : 'Erro ao finalizar serviço no servidor.';
        console.error('[Supabase finishWorkLog Exception]:', err);
        toast.error(message);
        return { success: false, error: message };
      }
      console.warn('[WorkLogService] Falha de rede ao finalizar serviço, mantendo no Dexie (synced: false):', err);
    }
  }

  let savedLocalId: string | number;
  try {
    savedLocalId = await persistLocalFinish(resolvedServerId, syncedToServer);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao salvar no banco local';
    return { success: false, error: message };
  }

  // Notifica componentes e ouvintes para revalidação imediata do estado
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      window.dispatchEvent(
        new CustomEvent(SYNC_COMPLETE_EVENT, {
          detail: { syncedCount: 1, message: 'Serviço finalizado com sucesso.' },
        })
      );
    } catch {}
  }

  return { success: true, localId: savedLocalId, serverId: resolvedServerId || undefined };
}

/**
 * Submete apontamento direto (compatibilidade)
 */
export async function submitWorkLog(
  formData: WorkLogFormData,
  isOnline?: boolean
): Promise<{
  success: boolean;
  isOfflineSaved: boolean;
  localId?: string | number;
  serverId?: string;
  error?: string;
}> {
  if (
    formData.start_hours === undefined ||
    formData.end_hours === undefined ||
    isNaN(formData.start_hours) ||
    isNaN(formData.end_hours) ||
    formData.end_hours <= formData.start_hours
  ) {
    return {
      success: false,
      isOfflineSaved: false,
      error: 'O horímetro final deve ser superior ao horímetro inicial.',
    };
  }
  const recordUuid = generateWorkLogUUID();
  const total_hours = calculateTotalHours(formData.start_hours, formData.end_hours);
  const now = new Date().toISOString();
  const resolvedServiceDate = formData.service_date
    ? toBrazilDateString(formData.service_date)
    : getBrazilTodayDate();
  const phone = formData.client_phone?.trim() || null;
  const online = isOnline ?? (typeof navigator !== 'undefined' && navigator.onLine);

  const persistLocalSubmit = async (
    confirmedServerId: string | null,
    isSynced: boolean
  ): Promise<string | number> => {
    const finalId = confirmedServerId || recordUuid;
    const localId = await saveOfflineWorkLog({
      id: finalId,
      server_id: confirmedServerId,
      supabase_id: confirmedServerId,
      machine_id: formData.machine_id,
      machine_name: formData.machine_name,
      operator_id: formData.operator_id,
      operator_name: formData.operator_name,
      client_name: formData.client_name.trim(),
      client_phone: phone,
      service_date: resolvedServiceDate,
      start_hours: formData.start_hours,
      end_hours: formData.end_hours,
      total_hours,
      observations: formData.observations?.trim() || null,
      status: 'pendente',
      sync_status: isSynced ? 'synced' : 'pending',
      synced: isSynced,
      ...(isSynced ? { synced_at: now } : {}),
    });

    await db.cached_machines.update(formData.machine_id, {
      current_hours: formData.end_hours,
      current_horimeter: formData.end_hours,
      horimeter: formData.end_hours,
    } as any);

    return localId;
  };

  // 1. PRIORIDADE ABSOLUTA: Se online e configurado, envia primeiro ao Supabase usando UUID gerado na origem
  if (online && isSupabaseConfigured()) {
    try {
      const payload = {
        id: recordUuid,
        machine_id: formData.machine_id,
        operator_id: formData.operator_id,
        client_name: formData.client_name.trim(),
        client_phone: phone,
        service_date: resolvedServiceDate,
        start_hours: formData.start_hours,
        end_hours: formData.end_hours,
        observations: formData.observations?.trim() || null,
        status: 'pendente' as const,
        created_at: now,
      };

      const { data, error } = await supabase
        .from('work_logs')
        .insert(payload)
        .select('id')
        .single();

      if (error) {
        if (!isNetworkError(error)) {
          console.error('[Supabase saveWorkLog API Error]:', error);
          toast.error(error.message);
          return { success: false, isOfflineSaved: false, error: error.message };
        }
        console.warn('[WorkLogService] Falha de rede ao enviar serviço, salvando offline:', error.message);
      } else {
        const confirmedId = data?.id || recordUuid;
        if (isValidUUID(formData.machine_id)) {
          try {
            await supabase
              .from('machines')
              .update({
                current_hours: formData.end_hours,
                updated_at: now,
              })
              .eq('id', formData.machine_id);
          } catch {}
        }

        const localId = await persistLocalSubmit(confirmedId, true);
        return { success: true, isOfflineSaved: false, localId, serverId: confirmedId };
      }
    } catch (err) {
      if (!isNetworkError(err)) {
        const message = err instanceof Error ? err.message : 'Erro ao enviar apontamento ao servidor.';
        console.error('[Supabase saveWorkLog Exception]:', err);
        toast.error(message);
        return { success: false, isOfflineSaved: false, error: message };
      }
      console.warn('[WorkLogService] Falha de rede, mantendo registro com synced: false no Dexie:', err);
    }
  }

  // 2. Fallback estritamente offline
  try {
    const localId = await persistLocalSubmit(null, false);
    return { success: true, isOfflineSaved: true, localId };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao salvar no banco local';
    return { success: false, isOfflineSaved: false, error: message };
  }
}

/**
 * Cancela e descarta um serviço que está em andamento, removendo-o do Dexie local
 * e da tabela `work_logs` do Supabase (caso já tenha sido sincronizado).
 */
export async function cancelWorkLog(
  workLogId: string | number,
  serverId?: string | null,
  isOnline?: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const online = isOnline ?? (typeof navigator !== 'undefined' && navigator.onLine);
    let resolvedServerId: string | null | undefined = serverId;

    // 1. Remove do banco local Dexie
    if (typeof workLogId === 'number') {
      const existing = await db.offline_work_logs.get(workLogId);
      if (existing?.server_id && !resolvedServerId) {
        resolvedServerId = existing.server_id;
      }
      await db.offline_work_logs.delete(workLogId);
    } else if (typeof workLogId === 'string' && workLogId.trim() !== '') {
      const numericId = parseInt(workLogId, 10);
      if (!isNaN(numericId) && String(numericId) === workLogId.trim()) {
        const existing = await db.offline_work_logs.get(numericId);
        if (existing?.server_id && !resolvedServerId) {
          resolvedServerId = existing.server_id;
        }
        await db.offline_work_logs.delete(numericId);
      } else {
        if (!resolvedServerId) {
          resolvedServerId = workLogId;
        }
        const allLocal = await db.offline_work_logs.toArray();
        for (const item of allLocal) {
          if (item.server_id === workLogId || String(item.id) === workLogId) {
            if (item.id !== undefined) {
              await db.offline_work_logs.delete(item.id);
            }
          }
        }
      }
    }

    // Caso tenha sido passado serverId adicionalmente, garante que nenhum registro órfão reste no Dexie
    if (resolvedServerId) {
      const remaining = await db.offline_work_logs.toArray();
      for (const item of remaining) {
        if (item.server_id === resolvedServerId && item.id !== undefined) {
          await db.offline_work_logs.delete(item.id);
        }
      }
    }

    // 2. Se já havia sido enviado ao Supabase com UUID válido e houver conexão, remove da tabela `work_logs`
    if (resolvedServerId && isValidUUID(resolvedServerId) && online && isSupabaseConfigured()) {
      const { error } = await supabase
        .from('work_logs')
        .delete()
        .eq('id', resolvedServerId);

      if (error) {
        console.warn('[WorkLogService] Aviso ao remover serviço cancelado do Supabase:', error.message);
      }
    }

    // Limpeza preventiva de cache no localStorage
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.removeItem('active_service_id');
        window.localStorage.removeItem('running_service');
        window.localStorage.removeItem('active_work_log');
        window.localStorage.removeItem('retroscave_active_service');
      } catch {}
    }

    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      try {
        window.dispatchEvent(
          new CustomEvent(SYNC_COMPLETE_EVENT, {
            detail: { syncedCount: 1, message: 'Serviço cancelado.' },
          })
        );
      } catch {}
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao cancelar serviço em andamento';
    console.error('[WorkLogService] Erro ao cancelar serviço:', message);
    return { success: false, error: message };
  }
}
