import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  fetchAdminClients,
  saveAdminClient,
  deleteAdminClient,
} from '../../src/services/adminService';
import { db } from '../../src/lib/dexieDb';
import { buildMockWorkLog, clearTestDatabase } from '../fixtures/workLogFixtures';

describe('Admin - Gestão e Exclusão Consolidada de Clientes', () => {
  beforeEach(async () => {
    await clearTestDatabase();
  });

  afterEach(async () => {
    await clearTestDatabase();
  });

  it('deve consolidar clientes únicos de clients, work_logs e scheduled_services e permitir exclusão', async () => {
    const saved = await saveAdminClient({
      name: 'Fazenda Santa Luzia',
      phone: '35991234567',
    });
    expect(saved.success).toBe(true);
    expect(saved.client?.phone).toBe('(35) 99123-4567');

    await db.offline_work_logs.bulkAdd([
      buildMockWorkLog({
        client_name: 'Fazenda Santa Luzia',
        service_date: '2026-11-01',
        start_hours: 100,
        end_hours: 105,
      }),
      buildMockWorkLog({
        client_name: 'Construtora Horizonte',
        client_phone: '(35) 98888-7777',
        service_date: '2026-11-02',
        start_hours: 105,
        end_hours: 110,
      }),
    ]);

    const list = await fetchAdminClients();
    expect(list.length).toBe(2);
    expect(list.map((c) => c.name)).toEqual([
      'Construtora Horizonte',
      'Fazenda Santa Luzia',
    ]);

    const delRes = await deleteAdminClient({
      id: list[0].id,
      name: list[0].name,
    });
    expect(delRes.success).toBe(true);

    const afterDelete = await fetchAdminClients();
    expect(afterDelete.length).toBe(1);
    expect(afterDelete[0].name).toBe('Fazenda Santa Luzia');
  });
});

