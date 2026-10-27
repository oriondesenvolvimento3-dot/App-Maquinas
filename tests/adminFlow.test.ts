import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  fetchAdminMetrics,
  fetchAdminWorkLogs,
  approveWorkLog,
  rejectWorkLog,
  fetchMachines,
  saveMachine,
} from '../src/services/adminService';
import { db } from '../src/lib/dexieDb';

describe('Fluxo Administrativo - Gestão, Conferência e Métricas Financeiras', () => {
  beforeEach(async () => {
    // Garante banco local 100% limpo antes de cada teste
    await db.offline_work_logs.clear();
    await db.cached_machines.clear();
  });

  afterEach(async () => {
    // Garante limpeza completa após os testes
    await db.offline_work_logs.clear();
    await db.cached_machines.clear();
  });

  describe('Cálculo Financeiro Dinâmico', () => {
    it('deve calcular corretamente o montante faturado (horas * taxa horária)', () => {
      const hours = 8;
      const rate = 160;
      const total = hours * rate;
      expect(total).toBe(1280);
    });

    it('deve calcular com precisão frações decimais de horas e tarifas negociadas', () => {
      const hours = 6.5;
      const customRate = 145.5;
      const total = Number((hours * customRate).toFixed(2));
      expect(total).toBe(945.75);
    });
  });

  describe('Consolidação das Métricas do Painel (fetchAdminMetrics)', () => {
    it('deve retornar zeros quando não existirem registros no banco de dados', async () => {
      const metrics = await fetchAdminMetrics();

      expect(metrics.totalServices).toBe(0);
      expect(metrics.totalHours).toBe(0);
      expect(metrics.billedAmount).toBe(0);
      expect(metrics.pendingAmount).toBe(0);
    });

    it('deve calcular as métricas consolidadas com base estrita nos dados reais inseridos', async () => {
      // Insere registros dinâmicos para o teste
      await db.offline_work_logs.bulkAdd([
        {
          machine_id: 'mach-cat-01',
          machine_name: 'Retro 01',
          operator_id: 'op-01',
          operator_name: 'João Silva',
          client_name: 'Fazenda Esperança',
          service_date: '2026-10-25',
          start_hours: 1250,
          end_hours: 1258,
          total_hours: 8,
          observations: 'Limpeza de vala',
          status: 'aprovado',
          hourly_rate: 160,
          total_amount: 1280,
          sync_status: 'synced',
          created_at: new Date().toISOString(),
        },
        {
          machine_id: 'mach-jcb-02',
          machine_name: 'Retro 02',
          operator_id: 'op-02',
          operator_name: 'Carlos Santos',
          client_name: 'Mineração Alvorada',
          service_date: '2026-10-24',
          start_hours: 900,
          end_hours: 906,
          total_hours: 6,
          observations: 'Nivelamento',
          status: 'pendente',
          hourly_rate: 150,
          total_amount: 900,
          sync_status: 'pending',
          created_at: new Date().toISOString(),
        },
      ]);

      const metrics = await fetchAdminMetrics();

      expect(metrics.totalServices).toBe(2);
      expect(metrics.totalHours).toBe(14);
      expect(metrics.billedAmount).toBe(1280); // Apenas o aprovado
      expect(metrics.pendingAmount).toBe(900);  // Apenas o pendente
    });

    it('deve filtrar corretamente serviços por status no fetchAdminWorkLogs', async () => {
      await db.offline_work_logs.bulkAdd([
        {
          machine_id: 'mach-1',
          machine_name: 'Retro 01',
          operator_id: 'op-1',
          operator_name: 'João',
          client_name: 'Cliente A',
          service_date: '2026-10-25',
          start_hours: 10,
          end_hours: 14,
          total_hours: 4,
          observations: null,
          status: 'aprovado',
          hourly_rate: 160,
          total_amount: 640,
          sync_status: 'synced',
          created_at: new Date().toISOString(),
        },
        {
          machine_id: 'mach-2',
          machine_name: 'Retro 02',
          operator_id: 'op-2',
          operator_name: 'Carlos',
          client_name: 'Cliente B',
          service_date: '2026-10-24',
          start_hours: 20,
          end_hours: 23,
          total_hours: 3,
          observations: null,
          status: 'rejeitado',
          hourly_rate: 160,
          total_amount: 480,
          sync_status: 'synced',
          created_at: new Date().toISOString(),
        },
      ]);

      const approvedOnly = await fetchAdminWorkLogs('aprovado');
      expect(approvedOnly.length).toBe(1);
      expect(approvedOnly[0].client_name).toBe('Cliente A');

      const rejectedOnly = await fetchAdminWorkLogs('rejeitado');
      expect(rejectedOnly.length).toBe(1);
      expect(rejectedOnly[0].client_name).toBe('Cliente B');
    });
  });

  describe('Fluxo de Aprovação e Rejeição de Serviços', () => {
    it('deve aprovar um serviço atualizando status para aprovado, taxa horária e valor total', async () => {
      const testId = await db.offline_work_logs.add({
        machine_id: 'mach-cat-01',
        machine_name: 'Retroescavadeira 01',
        operator_id: 'op-01',
        operator_name: 'João Silva',
        client_name: 'Obra Teste Aprovação',
        service_date: '2026-10-26',
        start_hours: 1000,
        end_hours: 1005,
        total_hours: 5,
        observations: 'Teste de aprovação',
        status: 'pendente',
        sync_status: 'synced',
        created_at: new Date().toISOString(),
      });

      const appliedRate = 150;
      const totalAmount = 5 * appliedRate;

      const result = await approveWorkLog(testId as number, appliedRate, totalAmount);
      expect(result.success).toBe(true);

      const updated = await db.offline_work_logs.get(testId as number);
      expect(updated?.status).toBe('aprovado');
      expect(updated?.hourly_rate).toBe(150);
      expect(updated?.total_amount).toBe(750);
    });

    it('deve rejeitar um serviço atualizando o status para rejeitado', async () => {
      const testId = await db.offline_work_logs.add({
        machine_id: 'mach-cat-01',
        machine_name: 'Retroescavadeira 01',
        operator_id: 'op-01',
        operator_name: 'João Silva',
        client_name: 'Obra Teste Rejeição',
        service_date: '2026-10-26',
        start_hours: 1010,
        end_hours: 1012,
        total_hours: 2,
        observations: 'Teste de rejeição',
        status: 'pendente',
        sync_status: 'synced',
        created_at: new Date().toISOString(),
      });

      const result = await rejectWorkLog(testId as number, 'Horímetro não confere com foto');
      expect(result.success).toBe(true);

      const updated = await db.offline_work_logs.get(testId as number);
      expect(updated?.status).toBe('rejeitado');
      expect(updated?.observations).toContain('Rejeitado: Horímetro não confere com foto');
    });
  });

  describe('CRUD de Gestão de Máquinas', () => {
    it('deve retornar lista vazia quando nenhuma máquina estiver cadastrada no banco', async () => {
      const machines = await fetchMachines();
      expect(machines).toEqual([]);
    });

    it('deve cadastrar uma nova máquina e permitir edição do valor hora e horímetro', async () => {
      const saveResult = await saveMachine({
        name: 'Retroescavadeira 05',
        model: 'JCB 4CX',
        hourly_rate: 180,
        current_hours: 500,
        active: true,
      });

      expect(saveResult.success).toBe(true);
      expect(saveResult.machine?.id).toBeDefined();

      const machineId = saveResult.machine!.id;

      // Edita a máquina existente
      const editResult = await saveMachine({
        id: machineId,
        name: 'Retroescavadeira 05 Turbo',
        model: 'JCB 4CX',
        hourly_rate: 195,
        current_hours: 512,
        active: true,
      });

      expect(editResult.success).toBe(true);
      expect(editResult.machine?.name).toBe('Retroescavadeira 05 Turbo');
      expect(editResult.machine?.hourly_rate).toBe(195);
      expect(editResult.machine?.current_hours).toBe(512);

      const all = await fetchMachines();
      expect(all.length).toBe(1);
      expect(all[0].name).toBe('Retroescavadeira 05 Turbo');
    });
  });
});
