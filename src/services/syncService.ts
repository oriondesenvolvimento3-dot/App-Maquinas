import { supabase, isSupabaseConfigured } from '../lib/supabase';
import {
  getPendingWorkLogs,
  markWorkLogAsSynced,
  getPendingScheduledServices,
  markScheduledServiceAsSynced,
  setCachedMachines,
  setCachedProfiles,
} from '../lib/dexieDb';
import type {
  Machine,
  Profile,
  OfflineWorkLog,
  ScheduledService,
  Database,
} from '../types/database';

export interface SyncResult {
  syncedCount: number;
  totalPending: number;
  errors: string[];
}

export interface CacheResult {
  machinesCount: number;
  profilesCount: number;
  error?: string;
}

export const SYNC_COMPLETE_EVENT = 'retroscave:sync-complete';
export const SYNC_ERROR_EVENT = 'retroscave:sync-error';

export interface SyncCompleteEventDetail {
  syncedCount: number;
  message: string;
}

export interface SyncErrorEventDetail {
  message: string;
}

type WorkLogInsert = Database['public']['Tables']['work_logs']['Insert'];
type WorkLogUpdate = Database['public']['Tables']['work_logs']['Update'];
type ScheduledServiceInsert = Database['public']['Tables']['scheduled_services']['Insert'];
type ScheduledServiceUpdate = Database['public']['Tables']['scheduled_services']['Update'];

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Verifica se uma string é um UUID válido do Supabase
 */
export function isValidUuid(val?: string | null): boolean {
  if (!val || typeof val !== 'string') return false;
  return UUID_REGEX.test(val.trim());
}

/**
 * Utilitário de toast compatível para exibição imediata de erros e sucessos de sincronização
 */
export const toast = {
  error(message: string): void {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(
        new CustomEvent<SyncErrorEventDetail>(SYNC_ERROR_EVENT, {
          detail: { message },
        })
      );
    }
  },
  success(message: string): void {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(
        new CustomEvent<SyncCompleteEventDetail>(SYNC_COMPLETE_EVENT, {
          detail: { syncedCount: 1, message },
        })
      );
    }
  },
};

let isSyncInProgress = false;
let autoSyncInitialized = false;

/**
 * Dispara evento global para atualizar telas abertas e exibir Toast discreto
 */
export function notifySyncComplete(syncedCount: number): void {
  if (
    typeof window === 'undefined' ||
    typeof window.dispatchEvent !== 'function' ||
    syncedCount <= 0
  ) {
    return;
  }

  const message = `${syncedCount} serviço(s) sincronizado(s) com a nuvem!`;
  window.dispatchEvent(
    new CustomEvent<SyncCompleteEventDetail>(SYNC_COMPLETE_EVENT, {
      detail: { syncedCount, message },
    })
  );
}

/**
 * Remove campos locais e exclusivos do Dexie/cliente antes de enviar ao Supabase.
 * Envia estritamente as colunas suportadas pela tabela remota `work_logs`.
 */
export function sanitizeWorkLogForSupabase(log: Partial<OfflineWorkLog> & Record<string, any>): WorkLogInsert {
  const payload: WorkLogInsert = {
    machine_id: log.machine_id!,
    operator_id: log.operator_id!,
    client_name: log.client_name ? String(log.client_name).trim() : 'Cliente a definir',
    service_date: log.service_date!,
    start_hours: Number(
      log.start_hours ??
      log.initial_hour ??
      (log as any).initial_horimeter ??
      (log as any).horimeter_initial ??
      (log as any).km_initial ??
      0
    ),
    end_hours: Number(
      log.end_hours ??
      log.final_hour ??
      (log as any).final_horimeter ??
      (log as any).horimeter_final ??
      (log as any).km_final ??
      0
    ),
    observations: log.observations?.trim() || log.notes?.trim() || null,
    status:
      log.status === 'em_andamento' || (log.status as any) === 'in_progress'
        ? 'em_andamento'
        : log.status || 'pendente',
    client_phone: log.client_phone ? String(log.client_phone).trim() : null,
  };

  if (log.created_at) {
    payload.created_at = log.created_at;
  }

  // ATENÇÃO:
  // - NÃO enviar 'started_at' (não existe na tabela remota do Supabase)
  // - NÃO enviar 'total_hours' (é coluna gerada no Postgres - GENERATED ALWAYS)
  // - NÃO enviar campos de UI: 'machine_name', 'operator_name', 'sync_status', 'synced', 'id', 'localId'
  return payload;
}

/**
 * Consolida observações no campo `notes` suportado pela tabela `scheduled_services` do Supabase
 */
export function buildScheduleNotesForSupabase(
  sched: Partial<ScheduledService> & Record<string, any>
): string | null {
  if (sched.notes && String(sched.notes).trim().length > 0) {
    return String(sched.notes).trim();
  }
  const parts: string[] = [];
  if (sched.agreement_details && String(sched.agreement_details).trim()) {
    parts.push(String(sched.agreement_details).trim());
  }
  if (sched.observations && String(sched.observations).trim()) {
    parts.push(String(sched.observations).trim());
  }
  return parts.length > 0 ? parts.join(' | ') : null;
}

/**
 * Extrai estimativa numérica de horas caso tenha sido informada
 */
export function resolveEstimatedHours(
  sched: Partial<ScheduledService> & Record<string, any>
): number | null {
  if (
    sched.estimated_hours !== undefined &&
    sched.estimated_hours !== null &&
    String(sched.estimated_hours).trim() !== '' &&
    !isNaN(Number(sched.estimated_hours))
  ) {
    return Number(sched.estimated_hours);
  }
  if (sched.agreement_details) {
    const match = String(sched.agreement_details).match(/(\d+(?:[.,]\d+)?)\s*h/i);
    if (match) {
      const parsed = parseFloat(match[1].replace(',', '.'));
      if (!isNaN(parsed)) return parsed;
    }
  }
  return null;
}

/**
 * Extrai valor numérico combinado (`agreed_rate`) caso tenha sido informado
 */
export function resolveAgreedRate(
  sched: Partial<ScheduledService> & Record<string, any>
): number | null {
  if (
    sched.agreed_rate !== undefined &&
    sched.agreed_rate !== null &&
    String(sched.agreed_rate).trim() !== '' &&
    !isNaN(Number(sched.agreed_rate))
  ) {
    return Number(sched.agreed_rate);
  }
  if (
    sched.agreed_amount !== undefined &&
    sched.agreed_amount !== null &&
    String(sched.agreed_amount).trim() !== '' &&
    !isNaN(Number(sched.agreed_amount))
  ) {
    return Number(sched.agreed_amount);
  }
  return null;
}

/**
 * Remove campos internos locais do Dexie (como `id` numérico, `sync_status`, `synced`, `machine_name`, `operator_name`)
 * e valida as chaves estrangeiras (`machine_id` e `operator_id` como UUIDs válidos ou `null`)
 * antes de enviar para a tabela `scheduled_services` do Supabase.
 */
export function sanitizeScheduledServiceForSupabase(
  sched: Partial<ScheduledService> & Record<string, any>
): ScheduledServiceInsert {
  const scheduledPeriod = (sched.scheduled_period || sched.period || 'integral') as
    | 'manha'
    | 'tarde'
    | 'integral';

  const payload: ScheduledServiceInsert = {
    client_name: sched.client_name ? String(sched.client_name).trim() : '',
    client_phone: sched.client_phone ? String(sched.client_phone).trim() : null,
    service_type: sched.service_type ? String(sched.service_type).trim() : 'Terraplanagem',
    scheduled_date: sched.scheduled_date!,
    scheduled_period: scheduledPeriod,
    machine_id: isValidUuid(sched.machine_id) ? String(sched.machine_id).trim() : null,
    operator_id: isValidUuid(sched.operator_id) ? String(sched.operator_id).trim() : null,
    location: sched.location ? String(sched.location).trim() : null,
    estimated_hours: resolveEstimatedHours(sched),
    agreed_rate: resolveAgreedRate(sched),
    status: sched.status || 'agendado',
    notes: buildScheduleNotesForSupabase(sched),
  };

  return payload;
}

/**
 * Sincroniza todos os registros de serviços salvos localmente no Dexie (IndexedDB)
 * que estejam com `synced: false` (ou `sync_status: 'pending'`) para a tabela remota `work_logs` do Supabase.
 *
 * @returns Quantidade de registros sincronizados com sucesso
 */
export async function syncPendingServices(): Promise<number> {
  if (isSyncInProgress) {
    return 0;
  }

  isSyncInProgress = true;

  try {
    const pendingLogs = await getPendingWorkLogs();
    const pendingSchedules = await getPendingScheduledServices();

    if (
      (!pendingLogs || pendingLogs.length === 0) &&
      (!pendingSchedules || pendingSchedules.length === 0)
    ) {
      return 0;
    }

    let successCount = 0;

    // 1. Sincroniza apontamentos de horas (work_logs)
    for (const log of pendingLogs) {
      try {
        if (!log.id) continue;

        if (log.server_id) {
          // Registro já possui ID no servidor (ex: iniciado online e finalizado offline) -> UPDATE
          const updatePayload: WorkLogUpdate = {
            client_name: log.client_name ? String(log.client_name).trim() : 'Cliente a definir',
            client_phone: log.client_phone ? String(log.client_phone).trim() : null,
            service_date: log.service_date,
            start_hours: Number(
              log.start_hours ??
              (log as any).initial_hour ??
              (log as any).initial_horimeter ??
              (log as any).horimeter_initial ??
              (log as any).km_initial ??
              0
            ),
            end_hours: Number(
              log.end_hours ??
              (log as any).final_hour ??
              (log as any).final_horimeter ??
              (log as any).horimeter_final ??
              (log as any).km_final ??
              0
            ),
            observations: log.observations?.trim() || (log as any).notes?.trim() || null,
            status:
              log.status === 'em_andamento' || (log.status as any) === 'in_progress'
                ? 'em_andamento'
                : log.status || 'pendente',
            updated_at: new Date().toISOString(),
          };

          const { error } = await supabase
            .from('work_logs')
            .update(updatePayload)
            .eq('id', log.server_id);

          if (error) {
            console.error(`[SyncService] Erro ao atualizar log local #${log.id} no Supabase:`, error.message);
            continue;
          }

          await markWorkLogAsSynced(log.id, log.server_id);
          successCount++;
        } else {
          // Novo registro criado offline -> INSERT limpo sem started_at
          const insertPayload = sanitizeWorkLogForSupabase(log);

          const { data, error } = await supabase
            .from('work_logs')
            .insert(insertPayload)
            .select('id')
            .single();

          if (error) {
            console.error(`[SyncService] Erro ao sincronizar log local #${log.id}:`, error.message);
            continue;
          }

          if (data?.id) {
            // Marca o registro como sincronizado no Dexie com o UUID do servidor e synced: true
            await markWorkLogAsSynced(log.id, data.id);
            successCount++;
          }
        }
      } catch (err) {
        console.error(`[SyncService] Falha inesperada ao processar log #${log.id}:`, err);
      }
    }

    // 2. Sincroniza agendamentos da Agenda (scheduled_services)
    for (const sched of pendingSchedules) {
      try {
        if (sched.id === undefined || sched.id === null) continue;
        const localNumericId = Number(sched.id);

        if (sched.server_id && isValidUuid(sched.server_id)) {
          const updatePayload: ScheduledServiceUpdate = sanitizeScheduledServiceForSupabase(sched);

          const { error } = await supabase
            .from('scheduled_services')
            .update(updatePayload)
            .eq('id', sched.server_id);

          if (error) {
            console.error('[AgendaSync Error]', error);
            continue;
          }

          if (!isNaN(localNumericId)) {
            await markScheduledServiceAsSynced(localNumericId, sched.server_id);
          }
          successCount++;
        } else {
          const insertPayload = sanitizeScheduledServiceForSupabase(sched);

          const { data, error } = await supabase
            .from('scheduled_services')
            .insert(insertPayload)
            .select('id')
            .single();

          if (error) {
            console.error('[AgendaSync Error]', error);
            continue;
          }

          if (data?.id) {
            const remoteId = String(data.id);
            if (!isNaN(localNumericId)) {
              await markScheduledServiceAsSynced(localNumericId, remoteId);
            }
            successCount++;
          }
        }
      } catch (err) {
        console.error(`[AgendaSync Error] Falha inesperada ao sincronizar agendamento #${sched.id}:`, err);
      }
    }

    if (successCount > 0) {
      console.info(`[SyncService] Sincronização concluída: ${successCount} registro(s) sincronizados com sucesso.`);
      notifySyncComplete(successCount);
    }

    return successCount;
  } finally {
    isSyncInProgress = false;
  }
}

/**
 * Aliases para compatibilidade com chamadas existentes
 */
export const syncPendingWorkLogs = syncPendingServices;
export const syncOfflineServices = syncPendingServices;

/**
 * Verifica rapidamente a fila local do Dexie e, se houver internet e itens pendentes (`synced: false`),
 * dispara a sincronização automaticamente em segundo plano.
 */
export async function checkAndSyncPendingQueue(): Promise<number> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return 0;
  }
  if (!isSupabaseConfigured()) {
    return 0;
  }

  const [pendingLogs, pendingSchedules] = await Promise.all([
    getPendingWorkLogs(),
    getPendingScheduledServices(),
  ]);
  if (pendingLogs.length > 0 || pendingSchedules.length > 0) {
    return await syncPendingServices();
  }
  return 0;
}

/**
 * Inicializa os listeners globais de reconexão automática ('online') e foco ('focus'),
 * além de realizar uma checagem imediata ao abrir o aplicativo.
 */
export function initAutoSync(): () => void {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
    return () => {};
  }

  const handleOnline = async () => {
    console.log('[AutoSync] Conexão restabelecida. Sincronizando serviços pendentes...');
    await syncPendingServices();
  };

  const handleFocus = async () => {
    if (typeof navigator === 'undefined' || navigator.onLine) {
      await checkAndSyncPendingQueue();
    }
  };

  if (!autoSyncInitialized) {
    autoSyncInitialized = true;
    window.addEventListener('online', handleOnline);
    window.addEventListener('focus', handleFocus);

    // Checagem imediata ao abrir o app
    if (typeof navigator === 'undefined' || navigator.onLine) {
      void checkAndSyncPendingQueue();
    }
  }

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('focus', handleFocus);
    autoSyncInitialized = false;
  };
}

/**
 * Baixa as máquinas ativas e perfis de operadores do Supabase e salva no Dexie.
 * Isso garante que, se o operador entrar em uma área rural sem internet, a lista
 * de máquinas e operadores continuará disponível para abertura de novo serviço.
 */
export async function cacheRemoteMachinesAndProfiles(): Promise<CacheResult> {
  try {
    // 1. Busca máquinas ativas
    const { data: machines, error: machinesError } = await supabase
      .from('machines')
      .select('*')
      .eq('active', true)
      .order('name');

    if (machinesError) {
      console.warn('[SyncService] Aviso ao buscar máquinas do Supabase:', machinesError.message);
    } else if (machines) {
      await setCachedMachines(machines as Machine[]);
    }

    // 2. Busca perfis operacionais
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('*')
      .order('full_name');

    if (profilesError) {
      console.warn('[SyncService] Aviso ao buscar perfis do Supabase:', profilesError.message);
    } else if (profiles) {
      await setCachedProfiles(profiles as Profile[]);
    }

    return {
      machinesCount: machines?.length ?? 0,
      profilesCount: profiles?.length ?? 0,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido ao atualizar cache local';
    console.error('[SyncService] Falha no cache de máquinas e perfis:', message);
    return {
      machinesCount: 0,
      profilesCount: 0,
      error: message,
    };
  }
}

/**
 * Executa o ciclo completo de sincronização e atualização de cache em background
 */
export async function performFullSync(): Promise<{ syncedLogs: number; cache: CacheResult }> {
  const syncedLogs = await syncPendingWorkLogs();
  const cache = await cacheRemoteMachinesAndProfiles();
  return { syncedLogs, cache };
}
