import { describe, it, expect } from 'vitest';
import {
  buildWhatsAppServiceMessage,
  buildWhatsAppServiceSummary,
} from '../../src/utils/whatsappShare';
import { generateSingleServiceReceiptPdf } from '../../src/utils/pdfGenerator';

describe('Financeiro - Exportação de Comprovante PDF e Compartilhamento WhatsApp', () => {
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
      const url = buildWhatsAppServiceSummary('Geral', 'Outubro/2026', 8, 1280);

      expect(url).toContain('https://api.whatsapp.com/send?text=');
      expect(url).toContain(encodeURIComponent('RETROSCAVE'));
    });
  });

  describe('Geração de Notinha / Comprovante Individual em PDF (generateSingleServiceReceiptPdf)', () => {
    const sampleReceiptData = {
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
    };

    it('deve gerar comprovante A5 com valores (showPricing: true) sem erros para serviço aprovado', () => {
      expect(() => {
        generateSingleServiceReceiptPdf(sampleReceiptData, 160, 1280, true);
      }).not.toThrow();
    });

    it('deve gerar comprovante A5 sem valores (showPricing: false, apenas horas) sem erros', () => {
      expect(() => {
        generateSingleServiceReceiptPdf(sampleReceiptData, 160, 1280, false);
      }).not.toThrow();
    });
  });
});

