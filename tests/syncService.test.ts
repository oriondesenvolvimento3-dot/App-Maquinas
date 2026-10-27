import { describe, it, expect, vi } from 'vitest';
import * as dexieLib from '../src/lib/dexieDb';
import { syncPendingWorkLogs, cacheRemoteMachinesAndProfiles } from '../src/services/syncService';
import { supabase } from '../src/lib/supabase';

describe('SyncService - Sincronização Dexie <-> Supabase', () => {
  it('deve retornar 0 quando não houver registros pendentes no Dexie', async () => {
    vi.spyOn(dexieLib, 'getPendingWorkLogs').mockResolvedValueOnce([]);

    const result = await syncPendingWorkLogs();
    expect(result).toBe(0);
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
