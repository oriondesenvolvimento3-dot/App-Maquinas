import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  validateFinishServiceInput,
  validateWorkLogInput,
  finishWorkLog,
  submitWorkLog,
} from '../../src/services/workLogService';
import {
  fetchAdminWorkLogs,
  updateAdminWorkLog,
  calculateWorkLogBilling,
} from '../../src/services/adminService';
import { calculateFinancialSummary } from '../../src/pages/admin/AdminHistory';
import { db } from '../../src/lib/dexieDb';
import { buildMockWorkLog, clearTestDatabase } from '../fixtures/workLogFixtures';

describe('Validação de Horímetro e Serviços Longos Consolidados', () => {
  beforeEach(async () => {
    await clearTestDatabase();
  });

  afterEach(async () => {
    await clearTestDatabase();
  });

  describe('Validação da Conclusão (validateFinishServiceInput)', () => {
    it('deve rejeitar horímetro final igual ao inicial exigindo que o final seja superior', () => {
      const result = validateFinishServiceInput({
        client_name: 'Fazenda Boa Esperança',
        start_hours: 1500,
        end_hours: 1500,
        service_date: '2026-10-29',
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.end_hours).toContain('superior ao horímetro inicial');
    });

    it('deve rejeitar horímetro final estritamente menor que o horímetro inicial', () => {
      const result = validateFinishServiceInput({
        client_name: 'Fazenda Boa Esperança',
        start_hours: 1500,
        end_hours: 1490,
        service_date: '2026-10-29',
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.end_hours).toContain('superior ao horímetro inicial');
    });

    it('deve exigir nome do cliente na conclusão', () => {
      const result = validateFinishServiceInput({
        client_name: '',
        start_hours: 1500,
        end_hours: 1505,
        service_date: '2026-10-29',
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.client_name).toBeDefined();
    });
  });

  describe('Blindagem de Horímetro e Serviços Longos (80h+)', () => {
    it('deve suportar serviços longos e consolidados (ex: 85.5h) sem teto máximo, calculando o faturamento exato (85.5 * tarifa)', async () => {
      const rate = 180;
      const expectedTotal = Number((85.5 * rate).toFixed(2)); // 15390.00

      await db.offline_work_logs.add(
        buildMockWorkLog({
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
        })
      );

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

    it('deve bloquear horímetro final menor ou igual ao inicial (end_hours <= start_hours) e forçar total_amount = 0 se delta <= 0', async () => {
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
  });
});
