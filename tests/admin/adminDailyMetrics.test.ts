import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  fetchAdminMetrics,
  fetchAdminWorkLogs,
  calculateDashboardDailyMetrics,
  getTodayLocalDateISO,
} from '../../src/services/adminService';
import { db } from '../../src/lib/dexieDb';
import { buildMockWorkLog, clearTestDatabase } from '../fixtures/workLogFixtures';

describe('Admin - Métricas Consolidadas e Painel Operacional do Dia Atual', () => {
  beforeEach(async () => {
    await clearTestDatabase();
  });

  afterEach(async () => {
    await clearTestDatabase();
  });

  it('deve retornar zeros quando não existirem registros no banco de dados', async () => {
    const metrics = await fetchAdminMetrics();

    expect(metrics.totalServices).toBe(0);
    expect(metrics.totalHours).toBe(0);
    expect(metrics.billedAmount).toBe(0);
    expect(metrics.pendingAmount).toBe(0);
  });

  it('deve calcular as métricas consolidadas com base estrita nos dados reais inseridos', async () => {
    await db.offline_work_logs.bulkAdd([
      buildMockWorkLog({
        client_name: 'Fazenda Esperança',
        service_date: '2026-10-25',
        start_hours: 1250,
        end_hours: 1258,
        hourly_rate: 160,
        status: 'aprovado',
      }),
      buildMockWorkLog({
        machine_id: 'mach-jcb-02',
        machine_name: 'Retro 02',
        operator_id: 'op-02',
        operator_name: 'Carlos Santos',
        client_name: 'Mineração Alvorada',
        service_date: '2026-10-24',
        start_hours: 900,
        end_hours: 906,
        hourly_rate: 150,
        status: 'pendente',
        sync_status: 'pending',
      }),
    ]);

    const metrics = await fetchAdminMetrics();

    expect(metrics.totalServices).toBe(2);
    expect(metrics.totalHours).toBe(14);
    expect(metrics.billedAmount).toBe(1280);
    expect(metrics.pendingAmount).toBe(900);
  });

  it('deve filtrar corretamente serviços por status no fetchAdminWorkLogs', async () => {
    await db.offline_work_logs.bulkAdd([
      buildMockWorkLog({
        client_name: 'Cliente A',
        service_date: '2026-10-25',
        start_hours: 10,
        end_hours: 14,
        hourly_rate: 160,
        status: 'aprovado',
      }),
      buildMockWorkLog({
        machine_id: 'mach-2',
        machine_name: 'Retro 02',
        client_name: 'Cliente B',
        service_date: '2026-10-24',
        start_hours: 20,
        end_hours: 23,
        hourly_rate: 160,
        status: 'rejeitado',
      }),
    ]);

    const approvedOnly = await fetchAdminWorkLogs('aprovado');
    expect(approvedOnly.length).toBe(1);
    expect(approvedOnly[0].client_name).toBe('Cliente A');

    const rejectedOnly = await fetchAdminWorkLogs('rejeitado');
    expect(rejectedOnly.length).toBe(1);
    expect(rejectedOnly[0].client_name).toBe('Cliente B');
  });

  it('deve aceitar e normalizar serviços gravados com status pending (inglês) na listagem e métricas de pendentes', async () => {
    await db.offline_work_logs.add(
      buildMockWorkLog({
        client_name: 'Castro',
        service_date: '2026-11-06',
        start_hours: 100,
        end_hours: 104,
        hourly_rate: 180,
        status: 'pending' as any,
      })
    );

    const pendentes = await fetchAdminWorkLogs('pendente');
    const castro = pendentes.find((s) => s.client_name === 'Castro');
    expect(castro).toBeDefined();
    expect(castro?.status).toBe('pendente');
    expect(castro?.total_amount).toBe(720);

    const metrics = await fetchAdminMetrics();
    expect(metrics.pendingAmount).toBeGreaterThanOrEqual(720);
  });

  it('deve filtrar métricas e serviços estritamente para o dia atual na tela de Início (calculateDashboardDailyMetrics)', async () => {
    const todayISO = getTodayLocalDateISO();
    await db.offline_work_logs.bulkAdd([
      buildMockWorkLog({
        machine_name: '310L 01',
        operator_name: 'Paulo',
        client_name: 'Serviço de Hoje Aprovado',
        service_date: todayISO,
        start_hours: 100,
        end_hours: 105,
        hourly_rate: 160,
        status: 'aprovado',
      }),
      buildMockWorkLog({
        machine_name: '310L 01',
        operator_name: 'Paulo',
        client_name: 'Serviço de Ontem',
        service_date: '2026-01-15',
        start_hours: 80,
        end_hours: 90,
        hourly_rate: 160,
        status: 'aprovado',
        created_at: '2026-01-15T14:00:00.000Z',
      }),
    ]);

    const allLogs = await fetchAdminWorkLogs('todos');
    const { metrics: dailyMetrics, dailyServices } = calculateDashboardDailyMetrics(
      allLogs,
      todayISO
    );

    expect(dailyServices.length).toBe(1);
    expect(dailyServices[0].client_name).toBe('Serviço de Hoje Aprovado');
    expect(dailyMetrics.totalServices).toBe(1);
    expect(dailyMetrics.totalHours).toBe(5);
    expect(dailyMetrics.billedAmount).toBe(800);
    expect(dailyMetrics.pendingAmount).toBe(0);
  });
});

