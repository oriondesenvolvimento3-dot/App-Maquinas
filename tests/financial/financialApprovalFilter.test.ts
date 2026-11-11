import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  fetchAdminWorkLogs,
  fetchFinancialWorkLogs,
} from '../../src/services/adminService';
import { db } from '../../src/lib/dexieDb';
import {
  calculateFinancialSummary,
  getDatePresetRange,
} from '../../src/pages/admin/AdminHistory';
import { formatDateISO } from '../../src/utils/formatters';
import { buildMockWorkLog, clearTestDatabase } from '../fixtures/workLogFixtures';

describe('Financeiro - Filtro Estrito de Aprovação (Exclusão de Pendentes e Rejeitados)', () => {
  beforeEach(async () => {
    await clearTestDatabase();
  });

  afterEach(async () => {
    await clearTestDatabase();
  });

  it('deve garantir que serviços rejeitados nunca entram nos totais do financeiro', async () => {
    await db.offline_work_logs.bulkAdd([
      buildMockWorkLog({
        client_name: 'Serviço Válido',
        service_date: '2026-11-05',
        start_hours: 100,
        end_hours: 110,
        hourly_rate: 160,
        status: 'aprovado',
        payment_status: 'a_receber',
      }),
      buildMockWorkLog({
        client_name: 'Serviço Rejeitado PT',
        service_date: '2026-11-05',
        start_hours: 200,
        end_hours: 250,
        hourly_rate: 200,
        status: 'rejeitado',
        payment_status: 'a_receber',
      }),
      buildMockWorkLog({
        client_name: 'Serviço Rejeitado EN',
        service_date: '2026-11-05',
        start_hours: 300,
        end_hours: 340,
        hourly_rate: 200,
        status: 'rejected' as any,
        payment_status: 'pago',
      }),
    ]);

    const logs = await fetchAdminWorkLogs('todos');
    const summary = calculateFinancialSummary(logs);

    expect(summary.filteredServices.length).toBe(1);
    expect(summary.filteredServices[0].client_name).toBe('Serviço Válido');
    expect(summary.totalHours).toBe(10);
    expect(summary.totalBilled).toBe(1600);
    expect(summary.totalReceivable).toBe(1600);
    expect(summary.totalPaid).toBe(0);
  });

  it('deve ignorar completamente serviços com status pendente (pending) no Financeiro (não aparecem na lista e não somam nos cards)', async () => {
    await db.offline_work_logs.bulkAdd([
      buildMockWorkLog({
        client_name: 'Cliente Aprovado Oficial',
        service_date: '2026-11-08',
        start_hours: 100,
        end_hours: 108,
        hourly_rate: 160,
        status: 'aprovado',
        payment_status: 'a_receber',
      }),
      buildMockWorkLog({
        client_name: 'Cliente Pendente PT',
        service_date: '2026-11-08',
        start_hours: 200,
        end_hours: 210,
        hourly_rate: 160,
        status: 'pendente',
        payment_status: 'a_receber',
      }),
      buildMockWorkLog({
        client_name: 'Cliente Pendente EN',
        service_date: '2026-11-08',
        start_hours: 300,
        end_hours: 315,
        hourly_rate: 200,
        status: 'pending' as any,
        payment_status: 'a_receber',
      }),
    ]);

    // 1. Consulta de origem exclusiva do Financeiro (fetchFinancialWorkLogs)
    const financialLogs = await fetchFinancialWorkLogs();
    expect(financialLogs.length).toBe(1);
    expect(financialLogs[0].client_name).toBe('Cliente Aprovado Oficial');
    expect(financialLogs[0].status).toBe('aprovado');

    // 2. Consolidação (calculateFinancialSummary) mesmo se receber lista bruta com itens pendentes
    const allLogs = await fetchAdminWorkLogs('todos');
    expect(allLogs.length).toBe(3);

    const summary = calculateFinancialSummary(allLogs);
    expect(summary.filteredServices.length).toBe(1);
    expect(summary.filteredServices[0].client_name).toBe('Cliente Aprovado Oficial');
    expect(summary.totalHours).toBe(8);
    expect(summary.totalBilled).toBe(1280);
    expect(summary.totalReceivable).toBe(1280);
    expect(summary.totalPaid).toBe(0);
  });

  it('deve aceitar serviços aprovados via approval_status e não bloquear serviços gravados com data UTC do dia seguinte (após 21:00)', async () => {
    const tomorrowISO = formatDateISO(new Date(Date.now() + 24 * 60 * 60 * 1000));

    await db.offline_work_logs.bulkAdd([
      {
        ...buildMockWorkLog({
          client_name: 'Gustavo Granja (Aprovado via approval_status)',
          service_date: tomorrowISO, // Simula serviço criado após 21:00 com data UTC adiantada
          start_hours: 100,
          end_hours: 101.2,
          hourly_rate: 200,
          status: 'pendente' as any,
          payment_status: 'a_receber',
        }),
        approval_status: 'approved',
      } as any,
    ]);

    const financialLogs = await fetchFinancialWorkLogs();
    expect(financialLogs.length).toBe(1);
    expect(financialLogs[0].status).toBe('aprovado');

    const u30 = getDatePresetRange('ultimos_30');
    const summaryU30 = calculateFinancialSummary(financialLogs, {
      startDate: u30.startDate,
      endDate: u30.endDate,
    });

    expect(summaryU30.filteredServices.length).toBe(1);
    expect(summaryU30.totalHours).toBe(1.2);
    expect(summaryU30.totalBilled).toBe(240);
  });
});

