import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchAdminWorkLogs,
  updateAdminWorkLog,
  updateWorkLogPaymentStatus,
  approveWorkLog,
  rejectWorkLog,
  fetchMachines,
  saveMachine,
  isValidUUID,
} from '../../src/services/adminService';
import * as supabaseLib from '../../src/lib/supabase';
import {
  createScheduledService,
  fetchScheduledServices,
  updateScheduledService,
  updateScheduledServiceStatus,
  deleteScheduledService,
} from '../../src/services/agendaService';
import { supabase } from '../../src/lib/supabase';
import { db } from '../../src/lib/dexieDb';
import { buildMockWorkLog, clearTestDatabase } from '../fixtures/workLogFixtures';

describe('Admin - Gestão de Serviços, Edição de Tarifa, Máquinas e Agenda', () => {
  beforeEach(async () => {
    await clearTestDatabase();
  });

  afterEach(async () => {
    await clearTestDatabase();
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

  describe('Fluxo de Aprovação, Rejeição e Edição de Serviços', () => {
    it('deve aprovar um serviço atualizando status para aprovado, taxa horária e valor total', async () => {
      const testId = await db.offline_work_logs.add(
        buildMockWorkLog({
          client_name: 'Obra Teste Aprovação',
          service_date: '2026-10-26',
          start_hours: 1000,
          end_hours: 1005,
          observations: 'Teste de aprovação',
          status: 'pendente',
        })
      );

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
      const testId = await db.offline_work_logs.add(
        buildMockWorkLog({
          client_name: 'Obra Teste Rejeição',
          service_date: '2026-10-26',
          start_hours: 1010,
          end_hours: 1012,
          observations: 'Teste de rejeição',
          status: 'pendente',
        })
      );

      const result = await rejectWorkLog(testId as number, 'Horímetro não confere com foto');
      expect(result.success).toBe(true);

      const updated = await db.offline_work_logs.get(testId as number);
      expect(updated?.status).toBe('rejeitado');
      expect(updated?.observations).toContain('Rejeitado: Horímetro não confere com foto');
    });

    it('deve permitir ao administrador editar todos os dados do apontamento antes de aprovar (updateAdminWorkLog)', async () => {
      const testId = await db.offline_work_logs.add(
        buildMockWorkLog({
          client_name: 'Cliente Antigo',
          service_date: '2026-10-26',
          start_hours: 1000,
          end_hours: 1004,
          observations: 'Obs inicial',
          status: 'pendente',
        })
      );

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
      const testId = await db.offline_work_logs.add(
        buildMockWorkLog({
          client_name: 'Cliente Pagamento',
          service_date: '2026-10-28',
          start_hours: 1000,
          end_hours: 1005,
          hourly_rate: 160,
          status: 'aprovado',
        })
      );

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

    it('deve validar UUIDs e nunca enviar ID numérico do Dexie (ex: 29) em queries .eq(id, ...) ao Supabase', async () => {
      expect(isValidUUID(29)).toBe(false);
      expect(isValidUUID('29')).toBe(false);
      expect(isValidUUID('123e4567-e89b-12d3-a456-426614174000')).toBe(true);

      await db.offline_work_logs.add({
        ...buildMockWorkLog({
          client_name: 'Obra Local ID 29',
          service_date: '2026-11-10',
          start_hours: 100,
          end_hours: 104,
          status: 'pendente',
          sync_status: 'pending',
          synced: false,
        }),
        id: 29,
        server_id: null,
      });

      const prevNavigator = globalThis.navigator;
      vi.stubGlobal('navigator', { ...(prevNavigator || {}), onLine: true });
      vi.spyOn(supabaseLib, 'isSupabaseConfigured').mockReturnValue(true);
      const fromSpy = vi.spyOn(supabase, 'from').mockImplementation(() => {
        throw new Error('Não deveria consultar o Supabase com ID numérico local "29"');
      });

      try {
        // 1. Editar, aprovar e rejeitar registro estritamente local #29 não pode chamar Supabase com id '29'
        const updRes = await updateAdminWorkLog(29, {
          client_name: 'Obra Local Editada',
          service_date: '2026-11-10',
          machine_id: 'mach-cat-01',
          start_hours: 100,
          end_hours: 104,
          hourly_rate: 180,
        });
        expect(updRes.success).toBe(true);
        expect(fromSpy).not.toHaveBeenCalled();

        const appRes = await approveWorkLog(29, 180, 720);
        expect(appRes.success).toBe(true);
        expect(fromSpy).not.toHaveBeenCalled();

        const approvedLocal = await db.offline_work_logs.get(29);
        expect(approvedLocal?.status).toBe('aprovado');
        expect(approvedLocal?.hourly_rate).toBe(180);
        expect(approvedLocal?.total_amount).toBe(720);
        expect(approvedLocal?.synced).toBe(false);
        expect(approvedLocal?.sync_status).toBe('pending');

        const rejRes = await rejectWorkLog(29, 'Teste local');
        expect(rejRes.success).toBe(true);
        expect(fromSpy).not.toHaveBeenCalled();
        expect((await db.offline_work_logs.get(29))?.status).toBe('rejeitado');

        // 2. Quando o registro possui UUID válido em supabase_id/server_id, usa o UUID oficial no Supabase
        const validUuid = '123e4567-e89b-12d3-a456-426614174000';
        await db.offline_work_logs.update(29, { supabase_id: validUuid } as any);

        const eqIds: string[] = [];
        fromSpy.mockImplementation((table: string) => {
          if (table === 'work_logs') {
            return {
              update: () => ({
                eq: async (_col: string, idVal: string) => {
                  eqIds.push(idVal);
                  return { error: null };
                },
              }),
            } as any;
          }
          if (table === 'financial_entries') {
            return {
              insert: async () => ({ error: null }),
            } as any;
          }
          return { update: () => ({ eq: async () => ({ error: null }) }) } as any;
        });

        const remoteApproveRes = await approveWorkLog(29, 200, 800);
        expect(remoteApproveRes.success).toBe(true);
        expect(eqIds).toEqual([validUuid]);
      } finally {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
      }
    });

    it('deve listar serviços pendentes remotos (pendente/pending) de qualquer data e operador em fetchAdminWorkLogs mesmo com Dexie vazio', async () => {
      const prevNavigator = globalThis.navigator;
      vi.stubGlobal('navigator', { ...(prevNavigator || {}), onLine: true });
      vi.spyOn(supabaseLib, 'isSupabaseConfigured').mockReturnValue(true);

      let orderedByCreatedDesc = false;
      vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === 'work_logs') {
          return {
            select: () => ({
              order: async (col: string, opts?: { ascending?: boolean }) => {
                orderedByCreatedDesc = col === 'created_at' && opts?.ascending === false;
                return {
                  data: [
                    {
                      id: '2001851f-1ec8-4703-869e-ca4cc354f87d',
                      machine_id: '123e4567-e89b-12d3-a456-426614174000',
                      operator_id: '223e4567-e89b-12d3-a456-426614174111',
                      client_name: 'Teste azul',
                      service_date: '2026-10-05', // data antiga
                      start_hours: 100,
                      end_hours: 104,
                      status: 'pendente',
                      created_at: '2026-10-05T15:00:00.000Z',
                    },
                    {
                      id: '3001851f-1ec8-4703-869e-ca4cc354f87e',
                      machine_id: '123e4567-e89b-12d3-a456-426614174000',
                      operator_id: '323e4567-e89b-12d3-a456-426614174222',
                      client_name: 'Obra Pendente EN',
                      service_date: '2026-11-10',
                      start_hours: 200,
                      end_hours: 205,
                      status: 'pending',
                      created_at: '2026-11-10T20:00:00.000Z',
                    },
                    {
                      id: '4001851f-1ec8-4703-869e-ca4cc354f87f',
                      machine_id: '123e4567-e89b-12d3-a456-426614174000',
                      operator_id: '223e4567-e89b-12d3-a456-426614174111',
                      client_name: 'Obra Aprovada',
                      service_date: '2026-11-10',
                      start_hours: 300,
                      end_hours: 310,
                      status: 'aprovado',
                      created_at: '2026-11-10T21:00:00.000Z',
                    },
                  ],
                  error: null,
                };
              },
            }),
          } as any;
        }
        // Simula falha/vazio nas tabelas auxiliares sem poder apagar os work_logs
        return {
          select: async () => ({ data: [], error: null }),
        } as any;
      });

      try {
        // Garante Dexie local completamente vazio
        expect(await db.offline_work_logs.count()).toBe(0);

        const pendentes = await fetchAdminWorkLogs('pendente');
        expect(orderedByCreatedDesc).toBe(true);
        expect(pendentes.length).toBe(2);
        expect(pendentes.map((p) => p.id)).toContain('2001851f-1ec8-4703-869e-ca4cc354f87d');
        expect(pendentes.map((p) => p.client_name)).toContain('Teste azul');
        expect(pendentes.map((p) => p.client_name)).toContain('Obra Pendente EN');
      } finally {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
      }
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

      const allSchedules = await fetchScheduledServices();
      expect(allSchedules.length).toBe(1);
      expect(allSchedules[0].client_name).toBe('Fazenda Boa Vista');

      const updated = await updateScheduledService(remoteScheduleUuid, {
        scheduled_period: 'integral',
        service_type: 'Terraplanagem',
      });
      expect(updated.success).toBe(true);

      const completeRes = await updateScheduledServiceStatus(remoteScheduleUuid, 'concluido');
      expect(completeRes.success).toBe(true);
      expect(await db.offline_work_logs.count()).toBe(0);

      const reopenRes = await updateScheduledServiceStatus(remoteScheduleUuid, 'agendado');
      expect(reopenRes.success).toBe(true);

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
      expect(await db.scheduled_services.count()).toBe(0);

      vi.restoreAllMocks();
    });
  });
});

