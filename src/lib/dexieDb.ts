import Dexie, { type Table } from 'dexie';
import type { OfflineWorkLog, Machine, Profile } from '../types/database';

/**
 * Banco de dados local IndexedDB com Dexie.js para arquitetura Offline-First
 * Permite que operadores de retroescavadeiras registrem horas mesmo sem sinal de internet em áreas rurais.
 */
export class RetroscaveDexieDB extends Dexie {
  // Tabela local de apontamentos de horas realizados no dispositivo
  offline_work_logs!: Table<OfflineWorkLog, number>;

  // Tabelas de cache local para seleção de máquinas e operadores em modo offline
  cached_machines!: Table<Machine, string>;
  cached_profiles!: Table<Profile, string>;

  constructor() {
    super('retroscave_db');

    /**
     * Definição de esquema da versão 1:
     * - '++id': chave primária numérica auto-incrementada
     * - Campos indexados: machine_id, operator_id, service_date, sync_status, created_at
     */
    this.version(1).stores({
      offline_work_logs: '++id, machine_id, operator_id, service_date, sync_status, created_at',
      cached_machines: 'id, name, active',
      cached_profiles: 'id, role',
    });

    /**
     * Definição de esquema da versão 2:
     * - Indexa 'server_id' para permitir consultas rápidas .where('server_id')
     */
    this.version(2).stores({
      offline_work_logs: '++id, server_id, machine_id, operator_id, service_date, sync_status, created_at',
      cached_machines: 'id, name, active',
      cached_profiles: 'id, role',
    });

    /**
     * Definição de esquema da versão 3:
     * - Indexa 'status' para permitir consultas rápidas de serviços em andamento
     */
    this.version(3).stores({
      offline_work_logs: '++id, server_id, machine_id, operator_id, service_date, sync_status, status, created_at',
      cached_machines: 'id, name, active',
      cached_profiles: 'id, role',
    });
  }
}

/**
 * Instância singleton do banco de dados local
 */
export const db = new RetroscaveDexieDB();

// ==========================================
// MÉTODOS AUXILIARES DE ACESSO AOS DADOS (CRUD)
// ==========================================

/**
 * Salva um novo apontamento de serviço localmente
 */
export async function saveOfflineWorkLog(
  entry: Omit<OfflineWorkLog, 'id' | 'created_at' | 'sync_status'>
): Promise<number> {
  const newLog: OfflineWorkLog = {
    ...entry,
    sync_status: 'pending',
    synced: false,
    status: entry.status || 'pendente',
    created_at: new Date().toISOString(),
  };

  const id = await db.offline_work_logs.add(newLog);
  return id as number;
}

/**
 * Recupera todos os apontamentos que ainda aguardam sincronização com o Supabase
 */
export async function getPendingWorkLogs(): Promise<OfflineWorkLog[]> {
  const all = await db.offline_work_logs.toArray();
  return all.filter((log) => log.sync_status === 'pending' || log.synced === false);
}

/**
 * Atualiza o status de sincronização de um apontamento local após envio bem-sucedido ao Supabase
 */
export async function markWorkLogAsSynced(
  localId: number,
  serverId: string
): Promise<number> {
  return await db.offline_work_logs.update(localId, {
    sync_status: 'synced',
    synced: true,
    server_id: serverId,
    synced_at: new Date().toISOString(),
  });
}

/**
 * Retorna todos os apontamentos locais ordenados do mais recente para o mais antigo
 */
export async function getAllOfflineWorkLogs(): Promise<OfflineWorkLog[]> {
  return await db.offline_work_logs
    .orderBy('id')
    .reverse()
    .toArray();
}

/**
 * Retorna o serviço atualmente em andamento de um operador no Dexie
 */
export async function getActiveWorkLogInDexie(
  operatorId: string
): Promise<OfflineWorkLog | undefined> {
  const allInProgress = await db.offline_work_logs
    .where('status')
    .equals('em_andamento')
    .toArray();

  return allInProgress.find((log) => log.operator_id === operatorId);
}

/**
 * Atualiza um apontamento local pelo ID
 */
export async function updateOfflineWorkLog(
  id: number,
  changes: Partial<OfflineWorkLog>
): Promise<number> {
  return await db.offline_work_logs.update(id, changes);
}

/**
 * Exclui um apontamento local pelo ID
 */
export async function deleteOfflineWorkLog(id: number): Promise<void> {
  await db.offline_work_logs.delete(id);
}

/**
 * Atualiza o cache local de máquinas para uso offline pelos operadores
 */
export async function setCachedMachines(machines: Machine[]): Promise<void> {
  await db.transaction('rw', db.cached_machines, async () => {
    await db.cached_machines.clear();
    await db.cached_machines.bulkPut(machines);
  });
}

/**
 * Obtém as máquinas ativas disponíveis em cache local
 */
export async function getCachedActiveMachines(): Promise<Machine[]> {
  const all = await db.cached_machines.toArray();
  return all.filter((m) => m.active);
}

/**
 * Atualiza o cache local de perfis/operadores para uso offline
 */
export async function setCachedProfiles(profiles: Profile[]): Promise<void> {
  await db.transaction('rw', db.cached_profiles, async () => {
    await db.cached_profiles.clear();
    await db.cached_profiles.bulkPut(profiles);
  });
}

/**
 * Limpa todos os dados locais do Dexie (IndexedDB)
 */
export async function clearAllLocalData(): Promise<void> {
  await db.transaction('rw', [db.offline_work_logs, db.cached_machines, db.cached_profiles], async () => {
    await db.offline_work_logs.clear();
    await db.cached_machines.clear();
    await db.cached_profiles.clear();
  });
}

/**
 * Reseta o banco IndexedDB local na inicialização para expurgar quaisquer dados mockados
 * inseridos por versões anteriores. Executa uma única vez por cliente/navegador.
 */
export async function purgeLegacyMockData(): Promise<void> {
  const PURGE_KEY = 'retroscave_db_purged_mock_records_v5';
  if (typeof window !== 'undefined' && !localStorage.getItem(PURGE_KEY)) {
    try {
      await clearAllLocalData();
      localStorage.setItem(PURGE_KEY, 'true');
      console.info('[RetroscaveDB] Base local IndexedDB limpa e zerada com sucesso.');
    } catch (err) {
      console.warn('[RetroscaveDB] Falha ao resetar banco local:', err);
    }
  }
}
