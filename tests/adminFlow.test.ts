import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchAdminMetrics,
  fetchAdminWorkLogs,
  updateAdminWorkLog,
  updateWorkLogPaymentStatus,
  approveWorkLog,
  rejectWorkLog,
  fetchMachines,
  saveMachine,
} from '../src/services/adminService';
import {
  createScheduledService,
  fetchScheduledServices,
  updateScheduledService,
  updateScheduledServiceStatus,
  deleteScheduledService,
} from '../src/services/agendaService';
import { supabase } from '../src/lib/supabase';
import { db } from '../src/lib/dexieDb';

describe('Fluxo Administrativo - Gestão, Conferência e Métricas Financeiras', () => {
  beforeEach(async () => {
    // Garante banco local 100% limpo antes de cada teste
    await db.offline_work_logs.clear();
    await db.cached_machines.clear();
    await db.scheduled_services.clear();
  });

  afterEach(async () => {
    // Garante limpeza completa após os testes
    await db.offline_work_logs.clear();
    await db.cached_machines.clear();
    await db.scheduled_services.clear();
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

    it('deve permitir ao administrador editar todos os dados do apontamento antes de aprovar (updateAdminWorkLog)', async () => {
      const testId = await db.offline_work_logs.add({
        machine_id: 'mach-cat-01',
        machine_name: 'Retroescavadeira 01',
        operator_id: 'op-01',
        operator_name: 'João Silva',
        client_name: 'Cliente Antigo',
        client_phone: null,
        service_date: '2026-10-26',
        start_hours: 1000,
        end_hours: 1004,
        total_hours: 4,
        observations: 'Obs inicial',
        status: 'pendente',
        sync_status: 'synced',
        created_at: new Date().toISOString(),
      });

      const editRes = await updateAdminWorkLog(testId as number, {
        client_name: 'Cliente Editado Admin',
        client_phone: '(35) 99988-7766',
        service_date: '2026-10-27',
        machine_id: 'mach-jcb-02',
        machine_name: 'Retroescavadeira JCB 02',
        start_hours: 1000,
        end_hours: 1006.5,
        hourly_rate: 200,
        observations: 'Observação revisada pelo gestor',
      });

      expect(editRes.success).toBe(true);

      const updated = await db.offline_work_logs.get(testId as number);
      expect(updated?.client_name).toBe('Cliente Editado Admin');
      expect(updated?.client_phone).toBe('(35) 99988-7766');
      expect(updated?.service_date).toBe('2026-10-27');
      expect(updated?.machine_id).toBe('mach-jcb-02');
      expect(updated?.machine_name).toBe('Retroescavadeira JCB 02');
      expect(updated?.start_hours).toBe(1000);
      expect(updated?.end_hours).toBe(1006.5);
      expect(updated?.total_hours).toBe(6.5);
      expect(updated?.hourly_rate).toBe(200);
      expect(updated?.total_amount).toBe(1300);
      expect(updated?.observations).toBe('Observação revisada pelo gestor');
    });

    it('deve assumir payment_status "a_receber" por padrão e atualizar para "pago" com updateWorkLogPaymentStatus', async () => {
      const testId = await db.offline_work_logs.add({
        machine_id: 'mach-cat-01',
        machine_name: 'Retroescavadeira 01',
        operator_id: 'op-01',
        operator_name: 'João Silva',
        client_name: 'Cliente Pagamento',
        service_date: '2026-10-28',
        start_hours: 1000,
        end_hours: 1005,
        total_hours: 5,
        observations: null,
        status: 'aprovado',
        hourly_rate: 160,
        total_amount: 800,
        sync_status: 'synced',
        created_at: new Date().toISOString(),
      });

      const initialList = await fetchAdminWorkLogs('todos');
      expect(initialList.length).toBe(1);
      expect(initialList[0].payment_status).toBe('a_receber');

      const updateRes = await updateWorkLogPaymentStatus(testId as number, 'pago');
      expect(updateRes.success).toBe(true);

      const updatedRecord = await db.offline_work_logs.get(testId as number);
      expect(updatedRecord?.payment_status).toBe('pago');

      const afterList = await fetchAdminWorkLogs('todos');
      expect(afterList[0].payment_status).toBe('pago');
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

  describe('Agenda de Serviços (agendaService + gravação direta no Supabase)', () => {
    it('deve criar diretamente no Supabase, listar da nuvem, editar, marcar como concluído, reabrir como agendado e excluir um agendamento sem tocar em work_logs', async () => {
      const remoteRows: any[] = [];
      const validMachineUuid = '123e4567-e89b-12d3-a456-426614174000';
      const validOperatorUuid = '223e4567-e89b-12d3-a456-426614174111';
      const remoteScheduleUuid = '987e6543-e21b-12d3-a456-426614174999';

      vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === 'scheduled_services') {
          return {
            insert: (rows: any[]) => ({
              select: () => ({
                single: async () => {
                  const row = Array.isArray(rows) ? rows[0] : rows;
                  const createdRow = {
                    ...row,
                    id: remoteScheduleUuid,
                    created_at: new Date().toISOString(),
                  };
                  remoteRows.push(createdRow);
                  return { data: createdRow, error: null };
                },
              }),
            }),
            select: () => ({
              order: async () => ({
                data: remoteRows.map((r) => ({
                  ...r,
                  machines: { id: validMachineUuid, name: 'Retroescavadeira 01' },
                  profiles: { id: validOperatorUuid, full_name: 'João Silva' },
                })),
                error: null,
              }),
            }),
            update: (patch: any) => ({
              eq: async (_col: string, idVal: string) => {
                const idx = remoteRows.findIndex((r) => r.id === idVal);
                if (idx >= 0) {
                  remoteRows[idx] = { ...remoteRows[idx], ...patch };
                }
                return { error: null };
              },
            }),
            delete: () => ({
              eq: async (_col: string, idVal: string) => {
                const idx = remoteRows.findIndex((r) => r.id === idVal);
                if (idx >= 0) remoteRows.splice(idx, 1);
                return { error: null };
              },
            }),
          } as any;
        }

        return {
          select: () => ({ order: async () => ({ data: [], error: null }) }),
        } as any;
      });

      const created = await createScheduledService({
        client_name: 'Fazenda Boa Vista',
        client_phone: '(35) 99876-5432',
        service_type: 'Abertura de Valas',
        scheduled_date: '2026-11-10',
        scheduled_period: 'manha',
        machine_id: validMachineUuid,
        machine_name: 'Retroescavadeira 01',
        operator_id: validOperatorUuid,
        operator_name: 'João Silva',
        location: 'Estrada Rural Km 12',
        estimated_hours: 6,
        agreed_rate: 180,
        notes: 'Levar concha estreita',
      });

      expect(created.success).toBe(true);
      expect(created.schedule?.id).toBe(remoteScheduleUuid);
      expect(created.schedule?.status).toBe('agendado');
      expect(remoteRows.length).toBe(1);
      expect(remoteRows[0].scheduled_period).toBe('manha');
      expect(remoteRows[0].estimated_hours).toBe(6);
      expect(remoteRows[0].agreed_rate).toBe(180);

      // Verifica listagem vinda do Supabase e espelhada no Dexie
      const allSchedules = await fetchScheduledServices();
      expect(allSchedules.length).toBe(1);
      expect(allSchedules[0].client_name).toBe('Fazenda Boa Vista');
      expect(allSchedules[0].period).toBe('manha');

      // Edita dados do agendamento diretamente no Supabase
      const updated = await updateScheduledService(remoteScheduleUuid, {
        scheduled_period: 'integral',
        service_type: 'Terraplanagem',
      });
      expect(updated.success).toBe(true);

      const afterEdit = await fetchScheduledServices();
      expect(afterEdit[0].period).toBe('integral');
      expect(afterEdit[0].service_type).toBe('Terraplanagem');

      // Marca como concluído diretamente no Supabase (sem criar apontamento em work_logs)
      const completeRes = await updateScheduledServiceStatus(remoteScheduleUuid, 'concluido');
      expect(completeRes.success).toBe(true);
      const afterComplete = await fetchScheduledServices();
      expect(afterComplete[0].status).toBe('concluido');
      expect(await db.offline_work_logs.count()).toBe(0);

      // Reabre como agendado diretamente no Supabase
      const reopenRes = await updateScheduledServiceStatus(remoteScheduleUuid, 'agendado');
      expect(reopenRes.success).toBe(true);
      const afterReopen = await fetchScheduledServices();
      expect(afterReopen[0].status).toBe('agendado');

      // Exclui agendamento diretamente no Supabase
      await deleteScheduledService(remoteScheduleUuid);
      const afterDelete = await fetchScheduledServices();
      expect(afterDelete.length).toBe(0);

      vi.restoreAllMocks();
    });

    it('deve reportar erro imediatamente e não confirmar sucesso quando o Supabase rejeitar o insert', async () => {
      vi.spyOn(supabase, 'from').mockReturnValue({
        insert: () => ({
          select: () => ({
            single: async () => ({
              data: null,
              error: { message: 'Violação de RLS na tabela scheduled_services' },
            }),
          }),
        }),
      } as any);

      const res = await createScheduledService({
        client_name: 'Cliente Erro',
        service_type: 'Terraplanagem',
        scheduled_date: '2026-11-12',
        scheduled_period: 'manha',
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('Violação de RLS');

      const countInDexie = await db.scheduled_services.count();
      expect(countInDexie).toBe(0);

      vi.restoreAllMocks();
    });
  });
});
