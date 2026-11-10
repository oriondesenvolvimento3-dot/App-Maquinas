import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  buildWhatsAppServiceMessage,
  buildWhatsAppServiceSummary,
} from '../src/utils/whatsappShare';
import { generateSingleServiceReceiptPdf } from '../src/utils/pdfGenerator';
import {
  fetchAdminWorkLogs,
  updateAdminWorkLog,
  calculateWorkLogBilling,
} from '../src/services/adminService';
import {
  finishWorkLog,
  submitWorkLog,
  validateFinishServiceInput,
  validateWorkLogInput,
} from '../src/services/workLogService';
import { db } from '../src/lib/dexieDb';
import {
  getDatePresetRange,
  calculateFinancialSummary,
} from '../src/pages/admin/AdminHistory';
import { formatDateISO } from '../src/utils/formatters';

describe('Relatórios Financeiros e Compartilhamento', () => {
  beforeEach(async () => {
    await db.offline_work_logs.clear();

    // Insere dados dinâmicos diretamente no banco em memória para o teste
    await db.offline_work_logs.bulkAdd([
      {
        machine_id: 'mach-cat-01',
        machine_name: 'Retroescavadeira 01',
        operator_id: 'op-01',
        operator_name: 'Operador Teste',
        client_name: 'Construtora Alfa',
        service_date: '2026-10-23',
        start_hours: 100,
        end_hours: 108,
        total_hours: 8,
        hourly_rate: 160,
        total_amount: 1280,
        observations: null,
        status: 'aprovado',
        sync_status: 'synced',
        created_at: new Date().toISOString(),
      },
      {
        machine_id: 'mach-jcb-02',
        machine_name: 'Retroescavadeira 02',
        operator_id: 'op-01',
        operator_name: 'Operador Teste',
        client_name: 'Fazenda Boa Vista',
        service_date: '2026-10-22',
        start_hours: 200,
        end_hours: 206,
        total_hours: 6,
        hourly_rate: 160,
        total_amount: 960,
        observations: null,
        status: 'aprovado',
        sync_status: 'synced',
        created_at: new Date().toISOString(),
      },
      {
        machine_id: 'mach-cat-01',
        machine_name: 'Retroescavadeira 01',
        operator_id: 'op-02',
        operator_name: 'Operador 2',
        client_name: 'Mineração Silva',
        service_date: '2026-10-21',
        start_hours: 300,
        end_hours: 310,
        total_hours: 10,
        hourly_rate: 160,
        total_amount: 1600,
        observations: null,
        status: 'pendente',
        sync_status: 'pending',
        created_at: new Date().toISOString(),
      },
      {
        machine_id: 'mach-cat-01',
        machine_name: 'Retroescavadeira 01',
        operator_id: 'op-01',
        operator_name: 'Operador Teste',
        client_name: 'Construtora Alfa',
        service_date: '2026-09-28', // Fora do período de outubro
        start_hours: 50,
        end_hours: 55,
        total_hours: 5,
        hourly_rate: 160,
        total_amount: 800,
        observations: null,
        status: 'aprovado',
        sync_status: 'synced',
        created_at: new Date().toISOString(),
      },
    ]);
  });

  afterEach(async () => {
    await db.offline_work_logs.clear();
  });

  describe('Filtragem por Período de Datas e Cliente', () => {
    it('deve filtrar serviços dentro do intervalo de datas especificado a partir do banco', async () => {
      const logs = await fetchAdminWorkLogs('todos');
      const startDate = '2026-10-01';
      const endDate = '2026-10-31';

      const filtered = logs.filter(
        (log) => log.service_date >= startDate && log.service_date <= endDate
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
      const startDate = '2026-10-01';
      const endDate = '2026-10-31';
      const targetClient = 'Construtora Alfa';

      const filtered = logs.filter(
        (log) =>
          log.service_date >= startDate &&
          log.service_date <= endDate &&
          log.client_name === targetClient
      );

      expect(filtered.length).toBe(1);
      expect(filtered[0].client_name).toBe('Construtora Alfa');
      expect(filtered[0].service_date).toBe('2026-10-23');
    });
  });

  describe('Consolidação Financeira para Fechamento', () => {
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
  });

  describe('Geração de Mensagem para WhatsApp (buildWhatsAppServiceSummary)', () => {
    it('deve estruturar mensagem com cabeçalho, dados consolidados e menção ao PDF anexo', () => {
      const message = buildWhatsAppServiceMessage(
        'Construtora Alfa',
        '01/10/2026 a 31/10/2026',
        18,
        2880
      );

      expect(message).toContain('RETROSCAVE');
      expect(message).toContain('Construtora Alfa');
      expect(message).toContain('01/10/2026 a 31/10/2026');
      expect(message).toContain('18h');
      expect(message).toContain('2.880,00');
      expect(message).toContain('Relatório Detalhado em PDF');
    });

    it('deve gerar link com formato internacional wa.me quando telefone é informado', () => {
      const url = buildWhatsAppServiceSummary(
        'Fazenda Boa Vista',
        'Outubro/2026',
        10,
        1600,
        '(11) 98765-4321'
      );

      expect(url).toContain('https://wa.me/5511987654321?text=');
      expect(url).toContain(encodeURIComponent('Fazenda Boa Vista'));
    });

    it('deve gerar link genérico da API do WhatsApp quando nenhum telefone é fornecido', () => {
      const url = buildWhatsAppServiceSummary(
        'Geral',
        'Outubro/2026',
        8,
        1280
      );

      expect(url).toContain('https://api.whatsapp.com/send?text=');
      expect(url).toContain(encodeURIComponent('RETROSCAVE'));
    });
  });

  describe('Geração de Notinha / Comprovante Individual em PDF (generateSingleServiceReceiptPdf)', () => {
    it('deve gerar comprovante A5 com valores (showPricing: true) sem erros para serviço aprovado', () => {
      expect(() => {
        generateSingleServiceReceiptPdf(
          {
            client_name: 'Fazenda Santa Maria',
            client_phone: '(35) 99123-4567',
            machine_name: 'Retroescavadeira Case 580N',
            operator_name: 'João Silva',
            service_date: '2026-10-26',
            start_hours: 1000,
            end_hours: 1008,
            total_hours: 8,
            hourly_rate: 160,
            total_amount: 1280,
            observations: 'Abertura de açude',
          },
          160,
          1280,
          true
        );
      }).not.toThrow();
    });

    it('deve gerar comprovante A5 sem valores (showPricing: false, apenas horas) sem erros', () => {
      expect(() => {
        generateSingleServiceReceiptPdf(
          {
            client_name: 'Fazenda Santa Maria',
            client_phone: '(35) 99123-4567',
            machine_name: 'Retroescavadeira Case 580N',
            operator_name: 'João Silva',
            service_date: '2026-10-26',
            start_hours: 1000,
            end_hours: 1008,
            total_hours: 8,
            hourly_rate: 160,
            total_amount: 1280,
            observations: 'Abertura de açude',
          },
          160,
          1280,
          false
        );
      }).not.toThrow();
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

  describe('Blindagem Financeira e Regressão de Horímetro', () => {
    it('1. deve suportar serviços longos e consolidados (ex: 85.5h) sem teto máximo, calculando o faturamento exato (85.5 * tarifa)', async () => {
      await db.offline_work_logs.clear();
      const rate = 180;
      const expectedTotal = Number((85.5 * rate).toFixed(2)); // 15390.00

      await db.offline_work_logs.add({
        machine_id: 'mach-310l-02',
        machine_name: '310L 02',
        operator_id: 'op-mauro',
        operator_name: 'Mauro',
        client_name: 'Obra Consolidada Loteamento',
        service_date: '2026-11-05',
        start_hours: 1200.0,
        end_hours: 1285.5,
        total_hours: 85.5,
        hourly_rate: rate,
        total_amount: expectedTotal,
        observations: 'Serviços consolidados da quinzena',
        status: 'aprovado',
        payment_status: 'a_receber',
        sync_status: 'synced',
        created_at: new Date().toISOString(),
      });

      const logs = await fetchAdminWorkLogs('todos');
      expect(logs.length).toBe(1);
      expect(logs[0].total_hours).toBe(85.5);
      expect(logs[0].total_amount).toBe(15390);

      const summary = calculateFinancialSummary(logs);
      expect(summary.totalHours).toBe(85.5);
      expect(summary.totalBilled).toBe(15390);
      expect(summary.totalReceivable).toBe(15390);
      expect(summary.totalPaid).toBe(0);
    });

    it('2. deve bloquear horímetro final menor ou igual ao inicial (end_hours <= start_hours) e forçar total_amount = 0 se delta <= 0', async () => {
      // Validação no formulário de conclusão
      const finishValidationLess = validateFinishServiceInput({
        client_name: 'Cliente Teste',
        start_hours: 500,
        end_hours: 495,
        service_date: '2026-11-05',
      });
      expect(finishValidationLess.isValid).toBe(false);

      // Validação no formulário geral
      const workLogValidationLess = validateWorkLogInput({
        machine_id: 'mach-01',
        client_name: 'Cliente Teste',
        start_hours: 500,
        end_hours: 490,
        service_date: '2026-11-05',
      });
      expect(workLogValidationLess.isValid).toBe(false);

      // Bloqueio em finishWorkLog
      const finishRes = await finishWorkLog(
        {
          machine_id: 'mach-01',
          machine_name: '310L',
          operator_id: 'op-01',
          operator_name: 'Paulo',
          client_name: 'Cliente Teste',
          service_date: '2026-11-05',
          start_hours: 500,
          end_hours: 495,
        },
        false
      );
      expect(finishRes.success).toBe(false);

      // Bloqueio em submitWorkLog
      const submitRes = await submitWorkLog(
        {
          machine_id: 'mach-01',
          machine_name: '310L',
          operator_id: 'op-01',
          operator_name: 'Paulo',
          client_name: 'Cliente Teste',
          service_date: '2026-11-05',
          start_hours: 500,
          end_hours: 495,
          observations: null,
        },
        false
      );
      expect(submitRes.success).toBe(false);

      // Bloqueio em updateAdminWorkLog
      const updateRes = await updateAdminWorkLog(1, {
        client_name: 'Cliente Teste',
        service_date: '2026-11-05',
        machine_id: 'mach-01',
        start_hours: 500,
        end_hours: 495,
        hourly_rate: 160,
      });
      expect(updateRes.success).toBe(false);

      // Trava de segurança matemática na fórmula unificada
      const billing = calculateWorkLogBilling({
        start_hours: 500,
        end_hours: 495,
        total_hours: 0,
        hourly_rate: 200,
      });
      expect(billing.totalHours).toBe(0);
      expect(billing.totalAmount).toBe(0);
    });

    it('3. deve garantir que a soma dos cards do cabeçalho é matematicamente idêntica à soma dos cards listados no período', async () => {
      await db.offline_work_logs.clear();
      await db.offline_work_logs.bulkAdd([
        {
          machine_id: 'mach-1',
          machine_name: '310L 01',
          operator_id: 'op-1',
          operator_name: 'Paulo',
          client_name: 'Cliente Pago 1',
          service_date: '2026-11-01',
          start_hours: 100,
          end_hours: 112.5,
          total_hours: 12.5,
          hourly_rate: 160,
          total_amount: 2000,
          observations: null,
          status: 'aprovado',
          payment_status: 'pago',
          sync_status: 'synced',
          created_at: new Date().toISOString(),
        },
        {
          machine_id: 'mach-2',
          machine_name: '310L 02',
          operator_id: 'op-2',
          operator_name: 'Mauro',
          client_name: 'Cliente Pendente Consolidado',
          service_date: '2026-11-03',
          start_hours: 500,
          end_hours: 585.5,
          total_hours: 85.5,
          hourly_rate: 200,
          total_amount: 17100,
          observations: null,
          status: 'aprovado',
          payment_status: 'a_receber',
          sync_status: 'synced',
          created_at: new Date().toISOString(),
        },
        {
          machine_id: 'mach-1',
          machine_name: '310L 01',
          operator_id: 'op-1',
          operator_name: 'Paulo',
          client_name: 'Cliente Fora do Período',
          service_date: '2026-09-10',
          start_hours: 50,
          end_hours: 60,
          total_hours: 10,
          hourly_rate: 160,
          total_amount: 1600,
          observations: null,
          status: 'aprovado',
          payment_status: 'a_receber',
          sync_status: 'synced',
          created_at: new Date().toISOString(),
        },
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

    it('4. deve garantir que serviços rejeitados nunca entram nos totais do financeiro', async () => {
      await db.offline_work_logs.clear();
      await db.offline_work_logs.bulkAdd([
        {
          machine_id: 'mach-1',
          machine_name: '310L 01',
          operator_id: 'op-1',
          operator_name: 'Paulo',
          client_name: 'Serviço Válido',
          service_date: '2026-11-05',
          start_hours: 100,
          end_hours: 110,
          total_hours: 10,
          hourly_rate: 160,
          total_amount: 1600,
          observations: null,
          status: 'aprovado',
          payment_status: 'a_receber',
          sync_status: 'synced',
          created_at: new Date().toISOString(),
        },
        {
          machine_id: 'mach-1',
          machine_name: '310L 01',
          operator_id: 'op-1',
          operator_name: 'Paulo',
          client_name: 'Serviço Rejeitado PT',
          service_date: '2026-11-05',
          start_hours: 200,
          end_hours: 250,
          total_hours: 50,
          hourly_rate: 200,
          total_amount: 10000,
          observations: 'Rejeitado',
          status: 'rejeitado',
          payment_status: 'a_receber',
          sync_status: 'synced',
          created_at: new Date().toISOString(),
        },
        {
          machine_id: 'mach-1',
          machine_name: '310L 01',
          operator_id: 'op-1',
          operator_name: 'Paulo',
          client_name: 'Serviço Rejeitado EN',
          service_date: '2026-11-05',
          start_hours: 300,
          end_hours: 340,
          total_hours: 40,
          hourly_rate: 200,
          total_amount: 8000,
          observations: 'Rejected',
          status: 'rejected' as any,
          payment_status: 'pago',
          sync_status: 'synced',
          created_at: new Date().toISOString(),
        },
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
  });
});
