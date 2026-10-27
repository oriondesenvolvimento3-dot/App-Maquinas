import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  buildWhatsAppServiceMessage,
  buildWhatsAppServiceSummary,
} from '../src/utils/whatsappShare';
import { generateSingleServiceReceiptPdf } from '../src/utils/pdfGenerator';
import { fetchAdminWorkLogs } from '../src/services/adminService';
import { db } from '../src/lib/dexieDb';

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
    it('deve gerar comprovante A5 sem erros para serviço aprovado', () => {
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
          1280
        );
      }).not.toThrow();
    });
  });
});
