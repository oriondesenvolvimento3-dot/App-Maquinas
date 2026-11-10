import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  startWorkLog,
  finishWorkLog,
  cancelWorkLog,
  getActiveWorkLogForOperator,
  validateFinishServiceInput,
  getLatestHorimeterForMachine,
} from '../src/services/workLogService';
import { fetchAdminWorkLogs } from '../src/services/adminService';
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
      expect(active?.end_hours).toBe(0);
      expect(active?.started_at).toBeDefined();
      expect(active?.start_time).toMatch(/^\d{2}:\d{2}$/);

      // O Admin NUNCA deve ver serviços com status em_andamento no painel de aprovação ou histórico
      const adminTodos = await fetchAdminWorkLogs('todos');
      expect(adminTodos.some((l) => l.operator_id === 'op-joao-123')).toBe(false);

      const adminPendentes = await fetchAdminWorkLogs('pendente');
      expect(adminPendentes.some((l) => l.operator_id === 'op-joao-123')).toBe(false);
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
      expect(finishedLog?.start_hours).toBe(1500);
      expect(finishedLog?.end_hours).toBe(1506.5);
      expect(finishedLog?.total_hours).toBe(6.5);
      expect(finishedLog?.client_phone).toBe('(11) 98765-4321');
      expect(finishedLog?.finished_at).toBeDefined();
      expect(finishedLog?.end_time).toMatch(/^\d{2}:\d{2}$/);

      // Somente após a finalização o serviço deve aparecer na fila de aprovação do Administrador
      const adminPendentes = await fetchAdminWorkLogs('pendente');
      const foundInAdmin = adminPendentes.find((l) => l.operator_id === 'op-carlos-789');
      expect(foundInAdmin).toBeDefined();
      expect(foundInAdmin?.start_hours).toBe(1500);
      expect(foundInAdmin?.end_hours).toBe(1506.5);
      expect(foundInAdmin?.total_hours).toBe(6.5);

      // 5. Verifica que o horímetro da máquina foi atualizado no Dexie e no getLatestHorimeterForMachine
      const machine = await db.cached_machines.get('mach-cat-01');
      expect(machine?.current_hours).toBe(1506.5);

      const latestHorimeter = await getLatestHorimeterForMachine('mach-cat-01');
      expect(latestHorimeter).toBe(1506.5);

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

    it('deve preservar estritamente o horímetro inicial sem permitir que seja sobrescrito pelo horímetro final', async () => {
      // Check-in com horímetro 1200.0
      const startRes = await startWorkLog(
        {
          machine_id: 'mach-cat-01',
          machine_name: 'Retroescavadeira CAT 416E',
          operator_id: 'op-preserva-horimetro',
          operator_name: 'Marcos Operador',
          start_hours: 1200.0,
        },
        false
      );
      expect(startRes.success).toBe(true);

      const active = await getActiveWorkLogForOperator('op-preserva-horimetro', false);
      expect(active).toBeDefined();
      expect(active?.start_hours).toBe(1200.0);

      // Check-out com horímetro final 1208.5
      const finishRes = await finishWorkLog(
        {
          localId: active!.id,
          machine_id: active!.machine_id,
          machine_name: active!.machine_name,
          operator_id: active!.operator_id,
          operator_name: active!.operator_name,
          client_name: 'Fazenda Santa Maria',
          service_date: '2026-11-06',
          start_hours: 1200.0,
          end_hours: 1208.5,
          observations: 'Abertura de vala',
        },
        false
      );
      expect(finishRes.success).toBe(true);

      const saved = await db.offline_work_logs.get(active!.id!);
      expect(saved).toBeDefined();
      // O horímetro inicial NUNCA pode ter sido sobrescrito com 1208.5
      expect(saved?.start_hours).toBe(1200.0);
      expect(saved?.end_hours).toBe(1208.5);
      expect(saved?.total_hours).toBe(8.5);
    });

    it('deve cancelar um serviço em andamento descartando os dados de início e liberando novo check-in', async () => {
      const startRes = await startWorkLog(
        {
          machine_id: 'mach-cat-01',
          machine_name: 'Retroescavadeira CAT 416E',
          operator_id: 'op-cancel-01',
          operator_name: 'Pedro Operador',
          start_hours: 1510,
        },
        false
      );

      expect(startRes.success).toBe(true);
      const activeBefore = await getActiveWorkLogForOperator('op-cancel-01', false);
      expect(activeBefore).toBeDefined();

      const cancelRes = await cancelWorkLog(activeBefore!.id!, activeBefore!.server_id, false);
      expect(cancelRes.success).toBe(true);

      const activeAfter = await getActiveWorkLogForOperator('op-cancel-01', false);
      expect(activeAfter).toBeNull();

      // Operador pode iniciar novo serviço imediatamente após cancelar
      const restartRes = await startWorkLog(
        {
          machine_id: 'mach-cat-01',
          machine_name: 'Retroescavadeira CAT 416E',
          operator_id: 'op-cancel-01',
          operator_name: 'Pedro Operador',
          start_hours: 1510,
        },
        false
      );
      expect(restartRes.success).toBe(true);
    });

    it('deve garantir que serviços com status pendente ou aprovado não sejam considerados ativos', async () => {
      // Cria apontamento finalizado com status pendente
      await db.offline_work_logs.add({
        machine_id: 'mach-cat-01',
        machine_name: 'Retroescavadeira CAT 416E',
        operator_id: 'op-finished-01',
        operator_name: 'Lucas Operador',
        client_name: 'Fazenda Estrela',
        service_date: '2026-10-30',
        start_hours: 100,
        end_hours: 105,
        total_hours: 5,
        observations: null,
        created_at: new Date().toISOString(),
        status: 'pendente',
        sync_status: 'synced',
        synced: true,
      });

      const activePending = await getActiveWorkLogForOperator('op-finished-01', false);
      expect(activePending).toBeNull();

      // Atualiza para aprovado
      await db.offline_work_logs.where('operator_id').equals('op-finished-01').modify({ status: 'aprovado' });

      const activeApproved = await getActiveWorkLogForOperator('op-finished-01', false);
      expect(activeApproved).toBeNull();
    });

    it('deve preservar o nome real do cliente digitado e nunca sobrescrever com "Em andamento"', async () => {
      // 1. Inicia serviço informando cliente opcional
      const startRes = await startWorkLog(
        {
          machine_id: 'mach-cat-01',
          machine_name: 'Retroescavadeira CAT 416E',
          operator_id: 'op-client-test',
          operator_name: 'Marcos Operador',
          start_hours: 1200,
          client_name: 'Sítio Primavera',
        },
        false
      );
      expect(startRes.success).toBe(true);

      const active = await getActiveWorkLogForOperator('op-client-test', false);
      expect(active?.client_name).toBe('Sítio Primavera');
      expect(active?.client_name).not.toBe('Em andamento');

      // 2. Finaliza serviço confirmando o nome do cliente
      const finishRes = await finishWorkLog(
        {
          localId: active!.id,
          machine_id: active!.machine_id,
          machine_name: active!.machine_name,
          operator_id: active!.operator_id,
          operator_name: active!.operator_name,
          client_name: 'Sítio Primavera - Setor B',
          service_date: '2026-11-06',
          start_hours: 1200,
          end_hours: 1204,
        },
        false
      );
      expect(finishRes.success).toBe(true);

      const finished = await db.offline_work_logs.get(active!.id!);
      expect(finished?.client_name).toBe('Sítio Primavera - Setor B');
      expect(finished?.client_name).not.toBe('Em andamento');
    });
  });
});
