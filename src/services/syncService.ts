import { supabase, isSupabaseConfigured } from '../lib/supabase';
import {
  getPendingWorkLogs,
  markWorkLogAsSynced,
  setCachedMachines,
  setCachedProfiles,
} from '../lib/dexieDb';
import type { Machine, Profile, OfflineWorkLog, Database } from '../types/database';

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

export interface SyncCompleteEventDetail {
  syncedCount: number;
  message: string;
}

type WorkLogInsert = Database['public']['Tables']['work_logs']['Insert'];
type WorkLogUpdate = Database['public']['Tables']['work_logs']['Update'];

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
    client_name: log.client_name ? String(log.client_name).trim() : '',
    service_date: log.service_date!,
    start_hours: Number(log.start_hours ?? log.initial_hour ?? 0),
    end_hours: Number(log.end_hours ?? log.final_hour ?? log.start_hours ?? 0),
    observations: log.observations?.trim() || log.notes?.trim() || null,
    status: log.status || 'pendente',
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

    if (!pendingLogs || pendingLogs.length === 0) {
      return 0;
    }

    let successCount = 0;

    for (const log of pendingLogs) {
      try {
        if (!log.id) continue;

        if (log.server_id) {
          // Registro já possui ID no servidor (ex: iniciado online e finalizado offline) -> UPDATE
          const updatePayload: WorkLogUpdate = {
            client_name: log.client_name ? String(log.client_name).trim() : '',
            client_phone: log.client_phone ? String(log.client_phone).trim() : null,
            service_date: log.service_date,
            start_hours: Number(log.start_hours ?? (log as any).initial_hour ?? 0),
            end_hours: Number(log.end_hours ?? (log as any).final_hour ?? 0),
            observations: log.observations?.trim() || (log as any).notes?.trim() || null,
            status: log.status || 'pendente',
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

  const pending = await getPendingWorkLogs();
  if (pending.length > 0) {
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
