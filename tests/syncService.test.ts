import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as dexieLib from '../src/lib/dexieDb';
import {
  syncPendingServices,
  syncPendingWorkLogs,
  syncOfflineServices,
  sanitizeWorkLogForSupabase,
  sanitizeScheduledServiceForSupabase,
  cacheRemoteMachinesAndProfiles,
  initAutoSync,
  SYNC_COMPLETE_EVENT,
} from '../src/services/syncService';
import { supabase } from '../src/lib/supabase';
import { db } from '../src/lib/dexieDb';
import type { OfflineWorkLog } from '../src/types/database';

describe('SyncService - Sincronização Dexie <-> Supabase', () => {
  beforeEach(async () => {
    await db.offline_work_logs.clear();
    await db.scheduled_services.clear();
  });

  afterEach(async () => {
    await db.offline_work_logs.clear();
    await db.scheduled_services.clear();
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

  it('deve preservar status em_andamento e não duplicar start_hours em end_hours', () => {
    const inProgressLog: Partial<OfflineWorkLog> = {
      machine_id: 'mach-01',
      operator_id: 'op-01',
      client_name: 'Obra Rodovia',
      service_date: '2026-11-06',
      start_hours: 1500,
      end_hours: 0,
      status: 'em_andamento',
    };

    const sanitized = sanitizeWorkLogForSupabase(inProgressLog);
    expect(sanitized.status).toBe('em_andamento');
    expect(sanitized.start_hours).toBe(1500);
    expect(sanitized.end_hours).toBe(0);
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
    const syncedCount = await syncPendingServices();
    expect(syncedCount).toBe(1);
    expect(syncOfflineServices).toBe(syncPendingServices);

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

  it('deve disparar evento de conclusão com mensagem de Toast e reagir ao evento online automaticamente', async () => {
    await dexieLib.saveOfflineWorkLog({
      machine_id: 'mach-01',
      machine_name: 'Retroescavadeira 01',
      operator_id: 'op-01',
      operator_name: 'João',
      client_name: 'Fazenda Boa Vista',
      service_date: '2026-10-30',
      start_hours: 300,
      end_hours: 305,
      total_hours: 5,
      observations: null,
      status: 'pendente',
    });

    vi.spyOn(supabase, 'from').mockReturnValue({
      insert: () => ({
        select: () => ({
          single: () => Promise.resolve({ data: { id: 'uuid-auto-sync-1' }, error: null }),
        }),
      }),
    } as any);

    let receivedDetail: any = null;
    const handleEvent = (e: Event) => {
      receivedDetail = (e as CustomEvent).detail;
    };
    window.addEventListener(SYNC_COMPLETE_EVENT, handleEvent);

    const cleanup = initAutoSync();
    window.dispatchEvent(new Event('online'));

    // Aguarda processamento assíncrono do listener
    await new Promise((r) => setTimeout(r, 150));

    expect(receivedDetail).toBeDefined();
    expect(receivedDetail.syncedCount).toBe(1);
    expect(receivedDetail.message).toBe('1 serviço(s) sincronizado(s) com a nuvem!');

    const pendingRemaining = await dexieLib.getPendingWorkLogs();
    expect(pendingRemaining.length).toBe(0);

    cleanup();
    window.removeEventListener(SYNC_COMPLETE_EVENT, handleEvent);
  });

  it('sanitizeScheduledServiceForSupabase deve remover id local e campos internos, validando UUIDs de machine_id e operator_id', () => {
    const validUuid = '123e4567-e89b-12d3-a456-426614174000';
    const rawSchedule = {
      id: 42,
      client_name: 'Sítio Bela Vista',
      client_phone: '(35) 99999-1111',
      service_type: 'Abertura de Valas',
      scheduled_date: '2026-11-12',
      period: 'manha' as const,
      machine_id: validUuid,
      machine_name: 'Retroescavadeira 01',
      operator_id: 'invalid-local-id',
      operator_name: 'Operador Teste',
      location: 'Estrada Km 5',
      agreement_details: 'Estimativa 8h • R$ 180/h',
      observations: 'Terreno úmido',
      status: 'agendado' as const,
      sync_status: 'pending' as const,
      synced: false,
      created_at: '2026-11-05T10:00:00.000Z',
    };

    const payload = sanitizeScheduledServiceForSupabase(rawSchedule);

    // Campos exclusivos do Dexie NÃO devem existir no payload do Supabase
    expect('id' in payload).toBe(false);
    expect('sync_status' in payload).toBe(false);
    expect('synced' in payload).toBe(false);
    expect('machine_name' in payload).toBe(false);
    expect('operator_name' in payload).toBe(false);
    expect('period' in payload).toBe(false);
    expect('agreement_details' in payload).toBe(false);
    expect('observations' in payload).toBe(false);

    // UUID válido é mantido; ID inválido vira null
    expect(payload.machine_id).toBe(validUuid);
    expect(payload.operator_id).toBeNull();
    expect(payload.scheduled_period).toBe('manha');
    expect(payload.estimated_hours).toBe(8);
    expect(payload.notes).toContain('Terreno úmido');
  });

  it('syncPendingServices deve sincronizar agendamentos pendentes de db.scheduled_services para o Supabase', async () => {
    const localId = await db.scheduled_services.add({
      client_name: 'Fazenda Aurora',
      client_phone: '(35) 98888-7777',
      service_type: 'Terraplanagem',
      scheduled_date: '2026-11-15',
      period: 'integral',
      machine_id: null,
      operator_id: null,
      location: 'Km 10',
      status: 'agendado',
      sync_status: 'pending',
      synced: false,
      created_at: new Date().toISOString(),
    });

    let targetTable = '';
    let sentSchedulePayload: any = null;
    vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
      targetTable = table;
      return {
        insert: (payload: any) => {
          sentSchedulePayload = payload;
          return {
            select: () => ({
              single: () =>
                Promise.resolve({ data: { id: 'uuid-schedule-999' }, error: null }),
            }),
          };
        },
      } as any;
    });

    const syncedCount = await syncPendingServices();
    expect(syncedCount).toBe(1);
    expect(targetTable).toBe('scheduled_services');
    expect('id' in sentSchedulePayload).toBe(false);
    expect(sentSchedulePayload.client_name).toBe('Fazenda Aurora');

    const updatedLocal = await db.scheduled_services.get(localId);
    expect(updatedLocal?.sync_status).toBe('synced');
    expect(updatedLocal?.synced).toBe(true);
    expect(updatedLocal?.server_id).toBe('uuid-schedule-999');
  });

  it('syncPendingServices deve atribuir UUID válido a registros legados com ID numérico e enviar insert com id UUID', async () => {
    await db.offline_work_logs.add({
      id: 29,
      machine_id: '123e4567-e89b-12d3-a456-426614174000',
      machine_name: '310L 02',
      operator_id: '223e4567-e89b-12d3-a456-426614174111',
      operator_name: 'Mauro',
      client_name: 'Obra Legada #29',
      service_date: '2026-11-10',
      start_hours: 500,
      end_hours: 506,
      total_hours: 6,
      observations: null,
      status: 'pendente',
      sync_status: 'pending',
      synced: false,
      created_at: new Date().toISOString(),
    });

    let sentInsertPayload: any = null;
    vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
      if (table === 'work_logs') {
        return {
          insert: (payload: any) => {
            sentInsertPayload = payload;
            return {
              select: () => ({
                single: () => Promise.resolve({ data: { id: payload.id }, error: null }),
              }),
            };
          },
        } as any;
      }
      return {
        update: () => ({ eq: async () => ({ error: null }) }),
      } as any;
    });

    const syncedCount = await syncPendingServices();
    expect(syncedCount).toBe(1);
    expect(sentInsertPayload).toBeDefined();
    expect(typeof sentInsertPayload.id).toBe('string');
    expect(sentInsertPayload.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );

    const updatedLocal = await db.offline_work_logs.get(29);
    expect(updatedLocal?.sync_status).toBe('synced');
    expect(updatedLocal?.synced).toBe(true);
    expect(updatedLocal?.server_id).toBe(sentInsertPayload.id);
  });
});
