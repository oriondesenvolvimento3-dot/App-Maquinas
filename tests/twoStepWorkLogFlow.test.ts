import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  startWorkLog,
  finishWorkLog,
  getActiveWorkLogForOperator,
  validateFinishServiceInput,
} from '../src/services/workLogService';
import { db } from '../src/lib/dexieDb';

describe('Fluxo Operacional de Duas Etapas (Check-in e Check-out)', () => {
  beforeEach(async () => {
    await db.cached_machines.clear();
    await db.offline_work_logs.clear();

    await db.cached_machines.add({
      id: 'mach-cat-01',
      name: 'Retroescavadeira CAT 416E',
      model: 'Caterpillar',
      hourly_rate: 180,
      current_hours: 1500,
      active: true,
    });
  });

  afterEach(async () => {
    await db.cached_machines.clear();
    await db.offline_work_logs.clear();
  });

  describe('Etapa 1: Iniciar Serviço (Check-in)', () => {
    it('deve iniciar um serviço salvando no Dexie com status em_andamento e horário de início', async () => {
      const result = await startWorkLog(
        {
          machine_id: 'mach-cat-01',
          machine_name: 'Retroescavadeira CAT 416E',
          operator_id: 'op-joao-123',
          operator_name: 'João Operador',
          start_hours: 1500.5,
        },
        false // modo offline
      );

      expect(result.success).toBe(true);
      expect(result.localId).toBeDefined();

      const active = await getActiveWorkLogForOperator('op-joao-123', false);
      expect(active).toBeDefined();
      expect(active?.status).toBe('em_andamento');
      expect(active?.machine_id).toBe('mach-cat-01');
      expect(active?.start_hours).toBe(1500.5);
      expect(active?.started_at).toBeDefined();
    });

    it('deve impedir que o mesmo operador inicie mais de 1 serviço em andamento simultaneamente', async () => {
      // Primeiro serviço
      const firstResult = await startWorkLog(
        {
          machine_id: 'mach-cat-01',
          machine_name: 'Retroescavadeira CAT 416E',
          operator_id: 'op-joao-123',
          operator_name: 'João Operador',
          start_hours: 1500,
        },
        false
      );
      expect(firstResult.success).toBe(true);

      // Tentativa de iniciar um segundo serviço com o mesmo operador
      const secondResult = await startWorkLog(
        {
          machine_id: 'mach-cat-01',
          machine_name: 'Retroescavadeira CAT 416E',
          operator_id: 'op-joao-123',
          operator_name: 'João Operador',
          start_hours: 1505,
        },
        false
      );

      expect(secondResult.success).toBe(false);
      expect(secondResult.error).toContain('já possui um serviço em andamento');
    });

    it('deve permitir que outro operador diferente inicie seu próprio serviço', async () => {
      await startWorkLog(
        {
          machine_id: 'mach-cat-01',
          machine_name: 'Retroescavadeira CAT 416E',
          operator_id: 'op-joao-123',
          operator_name: 'João Operador',
          start_hours: 1500,
        },
        false
      );

      const op2Result = await startWorkLog(
        {
          machine_id: 'mach-cat-01',
          machine_name: 'Retroescavadeira CAT 416E',
          operator_id: 'op-maria-456',
          operator_name: 'Maria Operadora',
          start_hours: 1500,
        },
        false
      );

      expect(op2Result.success).toBe(true);
    });
  });

  describe('Validação da Conclusão (validateFinishServiceInput)', () => {
    it('deve aceitar horímetro final igual ao inicial (zero horas trabalhadas)', () => {
      const result = validateFinishServiceInput({
        client_name: 'Fazenda Boa Esperança',
        start_hours: 1500,
        end_hours: 1500,
        service_date: '2026-10-29',
      });

      expect(result.isValid).toBe(true);
      expect(result.errors.end_hours).toBeUndefined();
    });

    it('deve rejeitar horímetro final estritamente menor que o horímetro inicial', () => {
      const result = validateFinishServiceInput({
        client_name: 'Fazenda Boa Esperança',
        start_hours: 1500,
        end_hours: 1490,
        service_date: '2026-10-29',
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.end_hours).toContain('maior ou igual ao horímetro inicial');
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

  describe('Etapa 2: Finalizar Serviço (Check-out)', () => {
    it('deve finalizar o serviço ativo atualizando o status de em_andamento para pendente', async () => {
      // 1. Inicia serviço
      const startRes = await startWorkLog(
        {
          machine_id: 'mach-cat-01',
          machine_name: 'Retroescavadeira CAT 416E',
          operator_id: 'op-carlos-789',
          operator_name: 'Carlos Operador',
          start_hours: 1500,
        },
        false
      );

      expect(startRes.success).toBe(true);
      const activeBefore = await getActiveWorkLogForOperator('op-carlos-789', false);
      expect(activeBefore).toBeDefined();

      // 2. Finaliza serviço
      const finishRes = await finishWorkLog(
        {
          localId: activeBefore!.id,
          machine_id: activeBefore!.machine_id,
          machine_name: activeBefore!.machine_name,
          operator_id: activeBefore!.operator_id,
          operator_name: activeBefore!.operator_name,
          client_name: 'Construtora Horizonte',
          client_phone: '(11) 98765-4321',
          service_date: '2026-10-29',
          start_hours: 1500,
          end_hours: 1506.5,
          observations: 'Nivelamento de terreno realizado com sucesso.',
        },
        false
      );

      expect(finishRes.success).toBe(true);

      // 3. Verifica que não há mais serviço em andamento
      const activeAfter = await getActiveWorkLogForOperator('op-carlos-789', false);
      expect(activeAfter).toBeNull();

      // 4. Verifica o registro final salvo
      const allLogs = await db.offline_work_logs.toArray();
      const finishedLog = allLogs.find((l) => l.operator_id === 'op-carlos-789');
      expect(finishedLog).toBeDefined();
      expect(finishedLog?.status).toBe('pendente');
      expect(finishedLog?.client_name).toBe('Construtora Horizonte');
      expect(finishedLog?.total_hours).toBe(6.5);
      expect(finishedLog?.client_phone).toBe('(11) 98765-4321');

      // 5. Verifica que o horímetro da máquina foi atualizado
      const machine = await db.cached_machines.get('mach-cat-01');
      expect(machine?.current_hours).toBe(1506.5);

      // 6. Confirma que o operador agora pode iniciar um novo serviço
      const nextService = await startWorkLog(
        {
          machine_id: 'mach-cat-01',
          machine_name: 'Retroescavadeira CAT 416E',
          operator_id: 'op-carlos-789',
          operator_name: 'Carlos Operador',
          start_hours: 1506.5,
        },
        false
      );
      expect(nextService.success).toBe(true);
    });
  });
});
