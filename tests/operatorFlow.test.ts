import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  calculateTotalHours,
  validateWorkLogInput,
  getActiveMachines,
  submitWorkLog,
  type WorkLogFormData,
} from '../src/services/workLogService';
import { db } from '../src/lib/dexieDb';

describe('Fluxo do Operador - Cálculo de Horímetro e Validação', () => {
  beforeEach(async () => {
    await db.cached_machines.clear();
    await db.offline_work_logs.clear();
  });

  afterEach(async () => {
    await db.cached_machines.clear();
    await db.offline_work_logs.clear();
  });

  describe('Cálculo de Horas Trabalhadas (calculateTotalHours)', () => {
    it('deve calcular corretamente a diferença inteira entre horímetro final e inicial', () => {
      const start = 1250;
      const end = 1258;
      const total = calculateTotalHours(start, end);
      expect(total).toBe(8);
    });

    it('deve calcular corretamente horímetro com frações decimais de horas', () => {
      const start = 1250.2;
      const end = 1258.7;
      const total = calculateTotalHours(start, end);
      expect(total).toBe(8.5);
    });

    it('deve retornar 0 quando o horímetro final for igual ao inicial', () => {
      const start = 1250;
      const end = 1250;
      const total = calculateTotalHours(start, end);
      expect(total).toBe(0);
    });

    it('deve retornar 0 quando o horímetro final for menor que o inicial', () => {
      const start = 1258;
      const end = 1250;
      const total = calculateTotalHours(start, end);
      expect(total).toBe(0);
    });

    it('deve tratar entradas NaN de forma segura retornando 0', () => {
      expect(calculateTotalHours(NaN, 1250)).toBe(0);
      expect(calculateTotalHours(1250, NaN)).toBe(0);
    });
  });

  describe('Validação do Formulário (validateWorkLogInput)', () => {
    const validFormData: WorkLogFormData = {
      machine_id: 'mach-cat-01',
      machine_name: 'Retroescavadeira 01',
      operator_id: 'op-01',
      operator_name: 'João Silva',
      client_name: 'Construtora Alfa',
      service_date: '2026-10-26',
      start_hours: 1250,
      end_hours: 1258,
      observations: 'Limpeza de terreno',
    };

    it('deve validar com sucesso um formulário com dados corretos', () => {
      const result = validateWorkLogInput(validFormData);
      expect(result.isValid).toBe(true);
      expect(Object.keys(result.errors).length).toBe(0);
    });

    it('deve rejeitar e acusar erro quando o horímetro final for menor que o inicial', () => {
      const invalidData = {
        ...validFormData,
        start_hours: 1258,
        end_hours: 1250,
      };

      const result = validateWorkLogInput(invalidData);
      expect(result.isValid).toBe(false);
      expect(result.errors.end_hours).toContain('estritamente maior que o horímetro inicial');
    });

    it('deve rejeitar e acusar erro quando o horímetro final for igual ao inicial', () => {
      const invalidData = {
        ...validFormData,
        start_hours: 1250,
        end_hours: 1250,
      };

      const result = validateWorkLogInput(invalidData);
      expect(result.isValid).toBe(false);
      expect(result.errors.end_hours).toBeDefined();
    });

    it('deve exigir seleção de máquina e nome do cliente', () => {
      const invalidData = {
        ...validFormData,
        machine_id: '',
        client_name: '   ',
      };

      const result = validateWorkLogInput(invalidData);
      expect(result.isValid).toBe(false);
      expect(result.errors.machine_id).toBeDefined();
      expect(result.errors.client_name).toBeDefined();
    });
  });

  describe('Consulta Dinâmica de Máquinas e Persistência Real (getActiveMachines & submitWorkLog)', () => {
    it('deve retornar array vazio quando o banco local não possuir máquinas cadastradas (sem mocks)', async () => {
      const machines = await getActiveMachines(false);
      expect(machines).toEqual([]);
    });

    it('deve retornar apenas as máquinas ativas inseridas dinamicamente no banco', async () => {
      await db.cached_machines.bulkPut([
        {
          id: 'dyn-mach-01',
          name: 'Retroescavadeira Case 580N',
          model: 'Case 580N',
          hourly_rate: 155,
          current_hours: 1320,
          active: true,
        },
        {
          id: 'dyn-mach-02',
          name: 'Retroescavadeira Desativada',
          model: 'Antiga',
          hourly_rate: 100,
          current_hours: 5000,
          active: false,
        },
      ]);

      const activeMachines = await getActiveMachines(false);
      expect(activeMachines.length).toBe(1);
      expect(activeMachines[0].id).toBe('dyn-mach-01');
      expect(activeMachines[0].name).toBe('Retroescavadeira Case 580N');
    });

    it('deve persistir serviço localmente no Dexie em modo offline e atualizar horômetro da máquina', async () => {
      await db.cached_machines.put({
        id: 'mach-test-offline',
        name: 'Retro Teste',
        model: 'JCB',
        hourly_rate: 160,
        current_hours: 100,
        active: true,
      });

      const submission = await submitWorkLog(
        {
          machine_id: 'mach-test-offline',
          machine_name: 'Retro Teste',
          operator_id: 'op-01',
          operator_name: 'Carlos',
          client_name: 'Fazenda Santa Rita',
          service_date: '2026-10-26',
          start_hours: 100,
          end_hours: 108,
          observations: 'Abertura de canaleta',
        },
        false // Modo offline
      );

      expect(submission.success).toBe(true);
      expect(submission.isOfflineSaved).toBe(true);
      expect(submission.localId).toBeDefined();

      const saved = await db.offline_work_logs.get(submission.localId!);
      expect(saved).toBeDefined();
      expect(saved?.total_hours).toBe(8);
      expect(saved?.sync_status).toBe('pending');

      const updatedMachine = await db.cached_machines.get('mach-test-offline');
      expect(updatedMachine?.current_hours).toBe(108);
    });

    it('deve persistir client_phone no banco local quando fornecido no formulário', async () => {
      const submission = await submitWorkLog(
        {
          machine_id: 'mach-test-phone',
          machine_name: 'Retro Teste WhatsApp',
          operator_id: 'op-01',
          operator_name: 'Carlos',
          client_name: 'Fazenda Boa Esperança',
          client_phone: '(35) 99876-5432',
          service_date: '2026-10-26',
          start_hours: 50,
          end_hours: 55,
          observations: null,
        },
        false
      );

      expect(submission.success).toBe(true);
      const saved = await db.offline_work_logs.get(submission.localId!);
      expect(saved?.client_phone).toBe('(35) 99876-5432');
      expect(saved?.client_name).toBe('Fazenda Boa Esperança');
    });
  });
});
