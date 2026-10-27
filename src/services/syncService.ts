import { supabase } from '../lib/supabase';
import {
  getPendingWorkLogs,
  markWorkLogAsSynced,
  setCachedMachines,
  setCachedProfiles,
} from '../lib/dexieDb';
import type { Machine, Profile } from '../types/database';

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

/**
 * Sincroniza todos os registros de serviços salvos localmente no Dexie (IndexedDB)
 * que estejam com status 'pending' para a tabela remota `work_logs` do Supabase.
 *
 * @returns Quantidade de registros sincronizados com sucesso
 */
export async function syncPendingWorkLogs(): Promise<number> {
  const pendingLogs = await getPendingWorkLogs();

  if (!pendingLogs || pendingLogs.length === 0) {
    return 0;
  }

  let successCount = 0;

  for (const log of pendingLogs) {
    try {
      if (!log.id) continue;

      // Monta o payload do registro para o Supabase (sem total_hours gerado no banco)
      const payload = {
        machine_id: log.machine_id,
        operator_id: log.operator_id,
        client_name: log.client_name,
        client_phone: log.client_phone || null,
        service_date: log.service_date,
        start_hours: log.start_hours,
        end_hours: log.end_hours,
        observations: log.observations,
        status: 'pendente' as const,
        created_at: log.created_at,
      };

      const { data, error } = await supabase
        .from('work_logs')
        .insert(payload)
        .select('id')
        .single();

      if (error) {
        console.error(`[SyncService] Erro ao sincronizar log local #${log.id}:`, error.message);
        continue;
      }

      if (data?.id) {
        // Marca o registro como sincronizado no Dexie com o UUID do servidor
        await markWorkLogAsSynced(log.id, data.id);
        successCount++;
      }
    } catch (err) {
      console.error(`[SyncService] Falha inesperada ao processar log #${log.id}:`, err);
    }
  }

  if (successCount > 0) {
    console.info(`[SyncService] Sincronização concluída: ${successCount} registro(s) sincronizados com sucesso.`);
  }

  return successCount;
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
