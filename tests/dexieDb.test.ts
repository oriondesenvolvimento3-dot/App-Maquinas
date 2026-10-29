import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '../src/lib/dexieDb';
import type { OfflineWorkLog } from '../src/types/database';

describe('DexieDB - Camada de Banco de Dados Offline', () => {
  beforeEach(async () => {
    await db.offline_work_logs.clear();
    await db.cached_machines.clear();
    await db.cached_profiles.clear();
  });

  afterEach(async () => {
    await db.offline_work_logs.clear();
    await db.cached_machines.clear();
    await db.cached_profiles.clear();
  });

  it('deve inicializar o banco retroscave_db na versão 3', () => {
    expect(db.name).toBe('retroscave_db');
    expect(db.verno).toBe(3);
  });

  it('deve permitir consulta por server_id indexado no offline_work_logs', async () => {
    await db.offline_work_logs.add({
      server_id: 'uuid-test-index',
      machine_id: 'mach-1',
      machine_name: 'Retro',
      operator_id: 'op-1',
      operator_name: 'Operador',
      client_name: 'Cliente',
      service_date: '2026-10-26',
      start_hours: 10,
      end_hours: 12,
      total_hours: 2,
      observations: null,
      sync_status: 'synced',
      created_at: new Date().toISOString(),
    });

    const found = await db.offline_work_logs.where('server_id').equals('uuid-test-index').first();
    expect(found).toBeDefined();
    expect(found?.server_id).toBe('uuid-test-index');
  });

  it('deve conter as tabelas offline_work_logs, cached_machines e cached_profiles', () => {
    const tableNames = db.tables.map((table) => table.name);
    expect(tableNames).toContain('offline_work_logs');
    expect(tableNames).toContain('cached_machines');
    expect(tableNames).toContain('cached_profiles');
  });

  it('deve validar a estrutura de um registro OfflineWorkLog', () => {
    const mockLog: OfflineWorkLog = {
      machine_id: 'mach-01',
      machine_name: 'Retroescavadeira 01',
      operator_id: 'op-01',
      operator_name: 'João Silva',
      client_name: 'Construtora Alfa',
      service_date: '2026-10-26',
      start_hours: 1250,
      end_hours: 1258,
      total_hours: 8,
      observations: 'Limpeza de terreno e abertura de valas',
      sync_status: 'pending',
      created_at: new Date().toISOString(),
    };

    expect(mockLog.sync_status).toBe('pending');
    expect(mockLog.total_hours).toBe(mockLog.end_hours - mockLog.start_hours);
    expect(mockLog.machine_name).toBeTruthy();
  });

  it('deve limpar todas as tabelas locais com clearAllLocalData', async () => {
    const { clearAllLocalData } = await import('../src/lib/dexieDb');

    // Popula dados temporários
    await db.cached_machines.put({
      id: 'm-test',
      name: 'Retro 01',
      model: 'Cat',
      hourly_rate: 150,
      current_hours: 100,
      active: true,
    });

    await db.offline_work_logs.add({
      machine_id: 'm-test',
      machine_name: 'Retro 01',
      operator_id: 'op-1',
      operator_name: 'Op',
      client_name: 'Cliente',
      service_date: '2026-10-26',
      start_hours: 100,
      end_hours: 105,
      total_hours: 5,
      observations: null,
      sync_status: 'pending',
      created_at: new Date().toISOString(),
    });

    expect(await db.cached_machines.count()).toBe(1);
    expect(await db.offline_work_logs.count()).toBe(1);

    // Executa a limpeza
    await clearAllLocalData();

    expect(await db.cached_machines.count()).toBe(0);
    expect(await db.offline_work_logs.count()).toBe(0);
  });
});
