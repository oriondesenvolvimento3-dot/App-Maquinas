import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as dexieLib from '../src/lib/dexieDb';
import {
  syncPendingWorkLogs,
  syncOfflineServices,
  sanitizeWorkLogForSupabase,
  cacheRemoteMachinesAndProfiles,
} from '../src/services/syncService';
import { supabase } from '../src/lib/supabase';
import { db } from '../src/lib/dexieDb';

describe('SyncService - Sincronização Dexie <-> Supabase', () => {
  beforeEach(async () => {
    await db.offline_work_logs.clear();
  });

  afterEach(async () => {
    await db.offline_work_logs.clear();
    vi.restoreAllMocks();
  });

  it('deve retornar 0 quando não houver registros pendentes no Dexie', async () => {
    vi.spyOn(dexieLib, 'getPendingWorkLogs').mockResolvedValueOnce([]);

    const result = await syncPendingWorkLogs();
    expect(result).toBe(0);
  });

  it('sanitizeWorkLogForSupabase deve remover started_at e campos exclusivos do Dexie do payload', () => {
    const rawLocalLog = {
      id: 123,
      machine_id: 'mach-01',
      machine_name: 'Retroescavadeira 01',
      operator_id: 'op-01',
      operator_name: 'João',
      client_name: 'Fazenda Estrela',
      client_phone: '(11) 99999-9999',
      service_date: '2026-10-29',
      start_hours: 100,
      end_hours: 105,
      total_hours: 5,
      observations: 'Serviço concluído',
      status: 'pendente' as const,
      started_at: '2026-10-29T10:00:00.000Z',
      sync_status: 'pending' as const,
      synced: false,
      created_at: '2026-10-29T10:00:00.000Z',
    };

    const cleanPayload = sanitizeWorkLogForSupabase(rawLocalLog);

    // started_at NÃO deve existir no payload enviado ao Supabase
    expect('started_at' in cleanPayload).toBe(false);
    expect((cleanPayload as any).started_at).toBeUndefined();

    // total_hours NÃO deve ser enviado (coluna gerada no Postgres)
    expect('total_hours' in cleanPayload).toBe(false);

    // Campos de visualização desnormalizados do Dexie NÃO devem ser enviados
    expect('machine_name' in cleanPayload).toBe(false);
    expect('operator_name' in cleanPayload).toBe(false);
    expect('sync_status' in cleanPayload).toBe(false);
    expect('synced' in cleanPayload).toBe(false);
    expect('id' in cleanPayload).toBe(false);

    // Colunas existentes no Supabase devem estar preservadas
    expect(cleanPayload.machine_id).toBe('mach-01');
    expect(cleanPayload.operator_id).toBe('op-01');
    expect(cleanPayload.client_name).toBe('Fazenda Estrela');
    expect(cleanPayload.client_phone).toBe('(11) 99999-9999');
    expect(cleanPayload.service_date).toBe('2026-10-29');
    expect(cleanPayload.start_hours).toBe(100);
    expect(cleanPayload.end_hours).toBe(105);
    expect(cleanPayload.observations).toBe('Serviço concluído');
    expect(cleanPayload.status).toBe('pendente');
  });

  it('deve sincronizar com sucesso registro offline, removendo started_at e marcando synced: true no Dexie', async () => {
    // 1. Salva registro local pendente com started_at
    const localId = await dexieLib.saveOfflineWorkLog({
      machine_id: 'mach-01',
      machine_name: 'Retroescavadeira 01',
      operator_id: 'op-01',
      operator_name: 'João',
      client_name: 'Fazenda Sol',
      service_date: '2026-10-29',
      start_hours: 200,
      end_hours: 204,
      total_hours: 4,
      observations: null,
      status: 'pendente',
      started_at: '2026-10-29T08:00:00.000Z',
    });

    let sentPayload: any = null;
    vi.spyOn(supabase, 'from').mockReturnValue({
      insert: (payload: any) => {
        sentPayload = payload;
        return {
          select: () => ({
            single: () => Promise.resolve({ data: { id: 'uuid-server-123' }, error: null }),
          }),
        };
      },
    } as any);

    // 2. Executa a sincronização
    const syncedCount = await syncOfflineServices();
    expect(syncedCount).toBe(1);

    // 3. Garante que o payload enviado não possui started_at
    expect(sentPayload).toBeDefined();
    expect('started_at' in sentPayload).toBe(false);
    expect(sentPayload.client_name).toBe('Fazenda Sol');

    // 4. Garante que o registro local foi atualizado com synced: true e sync_status: synced
    const updated = await db.offline_work_logs.get(localId);
    expect(updated?.synced).toBe(true);
    expect(updated?.sync_status).toBe('synced');
    expect(updated?.server_id).toBe('uuid-server-123');

    // 5. Garante que não há mais registros pendentes no Dexie
    const pendingRemaining = await dexieLib.getPendingWorkLogs();
    expect(pendingRemaining.length).toBe(0);
  });

  it('deve lidar com falhas de rede no cache sem lançar exceção não tratada', async () => {
    vi.spyOn(supabase, 'from').mockImplementationOnce(() => {
      throw new Error('Sem conexão com o Supabase');
    });

    const result = await cacheRemoteMachinesAndProfiles();
    expect(result.machinesCount).toBe(0);
    expect(result.profilesCount).toBe(0);
    expect(result.error).toBeDefined();
  });
});
