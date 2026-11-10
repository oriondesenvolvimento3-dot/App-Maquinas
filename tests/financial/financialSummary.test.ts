import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { fetchAdminWorkLogs } from '../../src/services/adminService';
import { db } from '../../src/lib/dexieDb';
import {
  getDatePresetRange,
  calculateFinancialSummary,
} from '../../src/pages/admin/AdminHistory';
import { formatDateISO } from '../../src/utils/formatters';
import { buildMockWorkLog, clearTestDatabase } from '../fixtures/workLogFixtures';

describe('Financeiro - Consolidação, Filtros e Resumo de Cards', () => {
  beforeEach(async () => {
    await clearTestDatabase();

    await db.offline_work_logs.bulkAdd([
      buildMockWorkLog({
        client_name: 'Construtora Alfa',
        service_date: '2026-10-23',
        start_hours: 100,
        end_hours: 108,
        hourly_rate: 160,
        status: 'aprovado',
      }),
      buildMockWorkLog({
        machine_id: 'mach-jcb-02',
        machine_name: 'Retroescavadeira 02',
        client_name: 'Fazenda Boa Vista',
        service_date: '2026-10-22',
        start_hours: 200,
        end_hours: 206,
        hourly_rate: 160,
        status: 'aprovado',
      }),
      buildMockWorkLog({
        operator_id: 'op-02',
        operator_name: 'Operador 2',
        client_name: 'Mineração Silva',
        service_date: '2026-10-21',
        start_hours: 300,
        end_hours: 310,
        hourly_rate: 160,
        status: 'pendente',
        sync_status: 'pending',
      }),
      buildMockWorkLog({
        client_name: 'Construtora Alfa',
        service_date: '2026-09-28',
        start_hours: 50,
        end_hours: 55,
        hourly_rate: 160,
        status: 'aprovado',
      }),
    ]);
  });

  afterEach(async () => {
    await clearTestDatabase();
  });

  describe('Filtragem por Período de Datas e Cliente', () => {
    it('deve filtrar serviços dentro do intervalo de datas especificado a partir do banco', async () => {
      const logs = await fetchAdminWorkLogs('todos');
      const filtered = logs.filter(
        (log) => log.service_date >= '2026-10-01' && log.service_date <= '2026-10-31'
      );

      expect(filtered.length).toBe(3);
      expect(filtered.map((l) => l.client_name)).toContain('Construtora Alfa');
      expect(filtered.map((l) => l.client_name)).toContain('Fazenda Boa Vista');
      expect(filtered.map((l) => l.client_name)).toContain('Mineração Silva');
    });

    it('deve filtrar serviços especificamente por cliente consultando o banco', async () => {
      const logs = await fetchAdminWorkLogs('todos');
      const targetClient = 'Construtora Alfa';

      const filtered = logs.filter(
        (log) => log.client_name.toLowerCase() === targetClient.toLowerCase()
      );

      expect(filtered.length).toBe(2);
      filtered.forEach((l) => expect(l.client_name).toBe(targetClient));
    });

    it('deve combinar filtros de período e cliente simultaneamente', async () => {
      const logs = await fetchAdminWorkLogs('todos');
      const filtered = logs.filter(
        (log) =>
          log.service_date >= '2026-10-01' &&
          log.service_date <= '2026-10-31' &&
          log.client_name === 'Construtora Alfa'
      );

      expect(filtered.length).toBe(1);
      expect(filtered[0].client_name).toBe('Construtora Alfa');
      expect(filtered[0].service_date).toBe('2026-10-23');
    });

    it('deve filtrar serviços especificamente por operador e recalcular os cards financeiros', async () => {
      await clearTestDatabase();
      await db.offline_work_logs.bulkAdd([
        buildMockWorkLog({
          operator_id: 'op-paulo',
          operator_name: 'Paulo',
          client_name: 'Fazenda Santa Luzia',
          service_date: '2026-11-01',
          start_hours: 100,
          end_hours: 110,
          hourly_rate: 160,
          status: 'aprovado',
          payment_status: 'pago',
        }),
        buildMockWorkLog({
          operator_id: 'op-mauro',
          operator_name: 'Mauro',
          client_name: 'Construtora Horizonte',
          service_date: '2026-11-02',
          start_hours: 200,
          end_hours: 205,
          hourly_rate: 200,
          status: 'aprovado',
          payment_status: 'a_receber',
        }),
      ]);

      const logs = await fetchAdminWorkLogs('todos');

      // Filtro específico por operador 'Paulo'
      const summaryPaulo = calculateFinancialSummary(logs, {
        selectedOperator: 'Paulo',
      });
      expect(summaryPaulo.filteredServices.length).toBe(1);
      expect(summaryPaulo.filteredServices[0].operator_name).toBe('Paulo');
      expect(summaryPaulo.totalHours).toBe(10);
      expect(summaryPaulo.totalBilled).toBe(1600);
      expect(summaryPaulo.totalPaid).toBe(1600);
      expect(summaryPaulo.totalReceivable).toBe(0);

      // Filtro específico por operador 'Mauro'
      const summaryMauro = calculateFinancialSummary(logs, {
        selectedOperator: 'Mauro',
      });
      expect(summaryMauro.filteredServices.length).toBe(1);
      expect(summaryMauro.filteredServices[0].operator_name).toBe('Mauro');
      expect(summaryMauro.totalHours).toBe(5);
      expect(summaryMauro.totalBilled).toBe(1000);
      expect(summaryMauro.totalPaid).toBe(0);
      expect(summaryMauro.totalReceivable).toBe(1000);

      // Filtro 'all' (Todos os Operadores)
      const summaryAll = calculateFinancialSummary(logs, {
        selectedOperator: 'all',
      });
      expect(summaryAll.filteredServices.length).toBe(2);
      expect(summaryAll.totalHours).toBe(15);
      expect(summaryAll.totalBilled).toBe(2600);
      expect(summaryAll.totalPaid).toBe(1600);
      expect(summaryAll.totalReceivable).toBe(1000);
    });
  });

  describe('Consolidação Financeira e Redução Estrita dos Cards', () => {
    it('deve somar corretamente as horas trabalhadas e o montante faturado dos registros do banco', async () => {
      const logs = await fetchAdminWorkLogs('todos');
      const octoberLogs = logs.filter(
        (l) => l.service_date >= '2026-10-01' && l.service_date <= '2026-10-31'
      );

      const totalHours = octoberLogs.reduce((acc, curr) => acc + curr.total_hours, 0);
      const totalAmount = octoberLogs.reduce((acc, curr) => acc + (curr.total_amount || 0), 0);

      expect(totalHours).toBe(24);
      expect(totalAmount).toBe(3840);
    });

    it('deve garantir que a soma dos cards do cabeçalho é matematicamente idêntica à soma dos cards listados no período', async () => {
      await clearTestDatabase();
      await db.offline_work_logs.bulkAdd([
        buildMockWorkLog({
          machine_name: '310L 01',
          operator_name: 'Paulo',
          client_name: 'Cliente Pago 1',
          service_date: '2026-11-01',
          start_hours: 100,
          end_hours: 112.5,
          hourly_rate: 160,
          status: 'aprovado',
          payment_status: 'pago',
        }),
        buildMockWorkLog({
          machine_name: '310L 02',
          operator_name: 'Mauro',
          client_name: 'Cliente Pendente Consolidado',
          service_date: '2026-11-03',
          start_hours: 500,
          end_hours: 585.5,
          hourly_rate: 200,
          status: 'aprovado',
          payment_status: 'a_receber',
        }),
        buildMockWorkLog({
          machine_name: '310L 01',
          operator_name: 'Paulo',
          client_name: 'Cliente Fora do Período',
          service_date: '2026-09-10',
          start_hours: 50,
          end_hours: 60,
          hourly_rate: 160,
          status: 'aprovado',
          payment_status: 'a_receber',
        }),
      ]);

      const logs = await fetchAdminWorkLogs('todos');
      const summary = calculateFinancialSummary(logs, {
        startDate: '2026-11-01',
        endDate: '2026-11-30',
      });

      expect(summary.filteredServices.length).toBe(2);

      const listSumBilled = summary.filteredServices.reduce(
        (acc, s) => acc + (Number(s.total_amount) || 0),
        0
      );
      const listSumPaid = summary.filteredServices
        .filter((s) => s.payment_status === 'pago' || (s.payment_status as any) === 'paid')
        .reduce((acc, s) => acc + (Number(s.total_amount) || 0), 0);
      const listSumReceivable = summary.filteredServices
        .filter((s) => s.payment_status !== 'pago' && (s.payment_status as any) !== 'paid')
        .reduce((acc, s) => acc + (Number(s.total_amount) || 0), 0);

      expect(summary.totalBilled).toBe(listSumBilled);
      expect(summary.totalPaid).toBe(listSumPaid);
      expect(summary.totalReceivable).toBe(listSumReceivable);
      expect(summary.totalBilled).toBe(19100);
      expect(summary.totalPaid).toBe(2000);
      expect(summary.totalReceivable).toBe(17100);
    });
  });

  describe('Atalhos de Período Financeiro (Date Presets) e formatDateISO', () => {
    it('formatDateISO deve formatar data local sem defasagem de fuso horário UTC', () => {
      const fixedDate = new Date(2026, 10, 5); // 05/11/2026
      expect(formatDateISO(fixedDate)).toBe('2026-11-05');
    });

    it('getDatePresetRange deve retornar datas corretas para cada atalho rápido', () => {
      const ultimos30 = getDatePresetRange('ultimos_30');
      expect(ultimos30.startDate).toBeTruthy();
      expect(ultimos30.endDate).toBeTruthy();
      expect(ultimos30.startDate <= ultimos30.endDate).toBe(true);

      const esteMes = getDatePresetRange('este_mes');
      const now = new Date();
      expect(esteMes.startDate).toBe(formatDateISO(new Date(now.getFullYear(), now.getMonth(), 1)));
      expect(esteMes.endDate).toBe(formatDateISO(new Date(now.getFullYear(), now.getMonth() + 1, 0)));

      const mesAnterior = getDatePresetRange('mes_anterior');
      expect(mesAnterior.startDate).toBe(formatDateISO(new Date(now.getFullYear(), now.getMonth() - 1, 1)));
      expect(mesAnterior.endDate).toBe(formatDateISO(new Date(now.getFullYear(), now.getMonth(), 0)));

      const tudo = getDatePresetRange('tudo');
      expect(tudo.startDate).toBe('');
      expect(tudo.endDate).toBe('');
    });
  });
});

