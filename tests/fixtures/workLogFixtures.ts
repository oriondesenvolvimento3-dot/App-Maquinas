import { db } from '../../src/lib/dexieDb';
import type { OfflineWorkLog, Machine } from '../../src/types/database';

/**
 * Cria um objeto de apontamento (OfflineWorkLog) enxuto com valores padrão coerentes,
 * permitindo sobrescrever apenas os campos relevantes para cada cenário de teste.
 */
export function buildMockWorkLog(
  overrides: Partial<OfflineWorkLog> = {}
): OfflineWorkLog {
  const start_hours = overrides.start_hours ?? 100;
  const end_hours = overrides.end_hours ?? 108;
  const delta = end_hours > start_hours ? Number((end_hours - start_hours).toFixed(1)) : 0;
  const total_hours = overrides.total_hours ?? delta;
  const hourly_rate = overrides.hourly_rate ?? 160;
  const total_amount =
    overrides.total_amount ?? Number((total_hours * hourly_rate).toFixed(2));

  return {
    machine_id: 'mach-cat-01',
    machine_name: 'Retroescavadeira 01',
    operator_id: 'op-01',
    operator_name: 'Operador Teste',
    client_name: 'Construtora Alfa',
    client_phone: null,
    service_date: '2026-10-23',
    start_hours,
    end_hours,
    total_hours,
    hourly_rate,
    total_amount,
    observations: null,
    status: 'aprovado',
    payment_status: 'a_receber',
    sync_status: 'synced',
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Cria um objeto de máquina (Machine) enxuto com valores padrão.
 */
export function buildMockMachine(overrides: Partial<Machine> = {}): Machine {
  return {
    id: 'mach-cat-01',
    name: 'Retroescavadeira CAT 416E',
    model: 'Caterpillar',
    hourly_rate: 180,
    current_hours: 1500,
    active: true,
    ...overrides,
  };
}

/**
 * Limpa todas as tabelas locais do Dexie entre os testes.
 */
export async function clearTestDatabase(): Promise<void> {
  await db.offline_work_logs.clear();
  await db.cached_machines.clear();
  await db.scheduled_services.clear();
  await db.cached_clients.clear();
}

