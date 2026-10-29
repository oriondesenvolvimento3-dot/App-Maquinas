import { supabase, isSupabaseConfigured } from '../lib/supabase';
import {
  db,
  saveOfflineWorkLog,
  getActiveWorkLogInDexie,
  getCachedActiveMachines,
  setCachedMachines,
} from '../lib/dexieDb';
import type { Machine, OfflineWorkLog } from '../types/database';

export interface StartServiceFormData {
  machine_id: string;
  machine_name: string;
  operator_id: string;
  operator_name: string;
  start_hours: number;
}

export interface FinishServiceFormData {
  localId?: number;
  serverId?: string | null;
  machine_id: string;
  machine_name: string;
  operator_id: string;
  operator_name: string;
  client_name: string;
  client_phone?: string | null;
  service_date: string;
  start_hours: number;
  end_hours: number;
  observations?: string | null;
  started_at?: string;
}

export interface WorkLogFormData {
  machine_id: string;
  machine_name: string;
  operator_id: string;
  operator_name: string;
  client_name: string;
  client_phone?: string;
  service_date: string;
  start_hours: number;
  end_hours: number;
  observations: string | null;
}

export interface ValidationResult {
  isValid: boolean;
  errors: {
    machine_id?: string;
    client_name?: string;
    start_hours?: string;
    end_hours?: string;
    service_date?: string;
  };
}

/**
 * Consulta exclusivamente as máquinas ativas no banco de dados.
 * Se houver conexão com o Supabase, sincroniza com o cache local.
 * Caso contrário, lê do cache local (Dexie).
 * Se o banco estiver vazio, retorna um array vazio (sem dados mockados).
 */
export async function getActiveMachines(isOnline?: boolean): Promise<Machine[]> {
  const online = isOnline ?? (typeof navigator !== 'undefined' && navigator.onLine && isSupabaseConfigured());

  if (online) {
    try {
      const { data, error } = await supabase
        .from('machines')
        .select('*')
        .eq('active', true)
        .order('name');

      if (!error && data) {
        await setCachedMachines(data as Machine[]);
        return data as Machine[];
      }
    } catch (err) {
      console.warn('[WorkLogService] Falha ao consultar Supabase, lendo do Dexie:', err);
    }
  }

  return await getCachedActiveMachines();
}

/**
 * Alias para compatibilidade reversa
 */
export const ensureCachedMachines = getActiveMachines;

/**
 * Calcula a quantidade de horas trabalhadas com precisão de 1 casa decimal
 */
export function calculateTotalHours(startHours: number, endHours: number): number {
  if (isNaN(startHours) || isNaN(endHours)) return 0;
  const diff = endHours - startHours;
  return diff >= 0 ? Number(diff.toFixed(1)) : 0;
}

/**
 * Valida os campos da conclusão de serviço
 */
export function validateFinishServiceInput(data: Partial<FinishServiceFormData>): {
  isValid: boolean;
  errors: {
    end_hours?: string;
    client_name?: string;
    service_date?: string;
  };
} {
  const errors: {
    end_hours?: string;
    client_name?: string;
    service_date?: string;
  } = {};

  if (!data.client_name || data.client_name.trim().length === 0) {
    errors.client_name = 'Informe o nome do cliente ou da obra.';
  }

  if (data.end_hours === undefined || isNaN(data.end_hours)) {
    errors.end_hours = 'Horímetro final inválido.';
  } else if (data.start_hours !== undefined && data.end_hours < data.start_hours) {
    errors.end_hours = 'O horímetro final deve ser maior ou igual ao horímetro inicial.';
  }

  if (!data.service_date) {
    errors.service_date = 'Informe a data do serviço.';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Valida os campos legados do apontamento de horas
 */
export function validateWorkLogInput(data: Partial<WorkLogFormData>): ValidationResult {
  const errors: ValidationResult['errors'] = {};

  if (!data.machine_id) {
    errors.machine_id = 'Selecione a máquina utilizada.';
  }

  if (!data.client_name || data.client_name.trim().length === 0) {
    errors.client_name = 'Informe o nome do cliente ou da obra.';
  }

  if (data.start_hours === undefined || isNaN(data.start_hours) || data.start_hours < 0) {
    errors.start_hours = 'Horímetro inicial inválido.';
  }

  if (data.end_hours === undefined || isNaN(data.end_hours) || data.end_hours <= 0) {
    errors.end_hours = 'Horímetro final inválido.';
  } else if (data.start_hours !== undefined && data.end_hours <= data.start_hours) {
    errors.end_hours = 'O horímetro final deve ser estritamente maior que o horímetro inicial.';
  }

  if (!data.service_date) {
    errors.service_date = 'Informe a data do serviço.';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Consulta o serviço atualmente em andamento de um operador (no Dexie ou no Supabase).
 */
export async function getActiveWorkLogForOperator(
  operatorId: string,
  isOnline?: boolean
): Promise<OfflineWorkLog | null> {
  if (!operatorId) return null;

  // 1. Primeiro verifica no Dexie (IndexedDB local)
  const localActive = await getActiveWorkLogInDexie(operatorId);
  if (localActive) {
    return localActive;
  }

  // 2. Se online e configurado com o Supabase, verifica se há serviço ativo na nuvem
  const online = isOnline ?? (typeof navigator !== 'undefined' && navigator.onLine && isSupabaseConfigured());
  if (online) {
    try {
      const { data, error } = await supabase
        .from('work_logs')
        .select('*, machine:machines(name)')
        .eq('operator_id', operatorId)
        .eq('status', 'em_andamento')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        // Salva no Dexie local para garantir resiliência offline
        const machineName = (data.machine as any)?.name || 'Retroescavadeira';
        const now = new Date().toISOString();
        const newLocalLog: OfflineWorkLog = {
          server_id: data.id,
          machine_id: data.machine_id,
          machine_name: machineName,
          operator_id: data.operator_id,
          operator_name: 'Operador',
          client_name: data.client_name || 'Em andamento',
          client_phone: data.client_phone || null,
          service_date: data.service_date,
          start_hours: Number(data.start_hours),
          end_hours: Number(data.end_hours ?? data.start_hours),
          total_hours: 0,
          observations: data.observations || null,
          status: 'em_andamento',
          started_at: data.started_at || data.created_at,
          sync_status: 'synced',
          created_at: data.created_at || now,
          synced_at: now,
        };

        const id = await db.offline_work_logs.add(newLocalLog);
        newLocalLog.id = id;
        return newLocalLog;
      }
    } catch (err) {
      console.warn('[WorkLogService] Falha ao verificar serviço ativo no Supabase:', err);
    }
  }

  return null;
}

/**
 * ETAPA 1: Inicia um serviço (Check-in).
 * Salva com status 'em_andamento' no Dexie e no Supabase (se online).
 */
export async function startWorkLog(
  formData: StartServiceFormData,
  isOnline: boolean
): Promise<{ success: boolean; localId?: number; serverId?: string; error?: string }> {
  if (!formData.machine_id) {
    return { success: false, error: 'Selecione uma máquina.' };
  }
  if (formData.start_hours === undefined || isNaN(formData.start_hours) || formData.start_hours < 0) {
    return { success: false, error: 'Horímetro inicial inválido.' };
  }

  // Valida que o operador não tem serviço ativo em andamento
  const activeExisting = await getActiveWorkLogForOperator(formData.operator_id, isOnline);
  if (activeExisting) {
    return {
      success: false,
      error: 'Você já possui um serviço em andamento. Finalize-o antes de iniciar um novo.',
    };
  }

  const now = new Date().toISOString();
  const todayStr = now.split('T')[0];

  // 1. Tenta envio online caso haja conectividade
  if (isOnline && isSupabaseConfigured()) {
    try {
      // ATENÇÃO: Enviar estritamente as colunas suportadas pelo Supabase (SEM started_at nem total_hours)
      const payload = {
        machine_id: formData.machine_id,
        operator_id: formData.operator_id,
        client_name: 'Em andamento',
        service_date: todayStr,
        start_hours: formData.start_hours,
        end_hours: formData.start_hours,
        observations: null,
        status: 'em_andamento' as const,
        created_at: now,
      };

      const { data, error } = await supabase
        .from('work_logs')
        .insert(payload)
        .select('id')
        .single();

      if (!error && data?.id) {
        const localId = await db.offline_work_logs.add({
          server_id: data.id,
          machine_id: formData.machine_id,
          machine_name: formData.machine_name,
          operator_id: formData.operator_id,
          operator_name: formData.operator_name,
          client_name: 'Em andamento',
          service_date: todayStr,
          start_hours: formData.start_hours,
          end_hours: formData.start_hours,
          total_hours: 0,
          observations: null,
          status: 'em_andamento',
          started_at: now,
          sync_status: 'synced',
          synced: true,
          created_at: now,
          synced_at: now,
        });

        return { success: true, localId: localId as number, serverId: data.id };
      }
    } catch (err) {
      console.warn('[WorkLogService] Falha online ao iniciar serviço, salvando localmente:', err);
    }
  }

  // 2. Persistência offline local no Dexie
  try {
    const localId = await saveOfflineWorkLog({
      machine_id: formData.machine_id,
      machine_name: formData.machine_name,
      operator_id: formData.operator_id,
      operator_name: formData.operator_name,
      client_name: 'Em andamento',
      service_date: todayStr,
      start_hours: formData.start_hours,
      end_hours: formData.start_hours,
      total_hours: 0,
      observations: null,
      status: 'em_andamento',
      started_at: now,
    });

    return { success: true, localId };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao salvar no banco local';
    return { success: false, error: message };
  }
}

/**
 * ETAPA 2: Finaliza um serviço (Check-out).
 * Atualiza o registro no Dexie e no Supabase mudando o status de 'em_andamento' para 'pendente'.
 */
export async function finishWorkLog(
  formData: FinishServiceFormData,
  isOnline: boolean
): Promise<{ success: boolean; serverId?: string; error?: string }> {
  if (!formData.client_name || formData.client_name.trim().length === 0) {
    return { success: false, error: 'Informe o nome do cliente ou da obra.' };
  }
  if (formData.end_hours === undefined || isNaN(formData.end_hours)) {
    return { success: false, error: 'Informe o horímetro final.' };
  }
  if (formData.end_hours < formData.start_hours) {
    return { success: false, error: 'O horímetro final deve ser maior ou igual ao horímetro inicial.' };
  }

  const total_hours = calculateTotalHours(formData.start_hours, formData.end_hours);
  const phone = formData.client_phone?.trim() || null;
  const now = new Date().toISOString();

  // 1. Tenta envio online caso haja conectividade
  if (isOnline && isSupabaseConfigured()) {
    try {
      if (formData.serverId) {
        // Já existe no servidor -> Atualiza
        const { error } = await supabase
          .from('work_logs')
          .update({
            client_name: formData.client_name.trim(),
            client_phone: phone,
            service_date: formData.service_date,
            start_hours: formData.start_hours,
            end_hours: formData.end_hours,
            observations: formData.observations?.trim() || null,
            status: 'pendente',
            updated_at: now,
          })
          .eq('id', formData.serverId);

        if (!error) {
          if (formData.localId) {
            await db.offline_work_logs.update(formData.localId, {
              client_name: formData.client_name.trim(),
              client_phone: phone,
              service_date: formData.service_date,
              end_hours: formData.end_hours,
              total_hours,
              observations: formData.observations?.trim() || null,
              status: 'pendente',
              sync_status: 'synced',
              synced: true,
              synced_at: now,
            });
          }

          await db.cached_machines.update(formData.machine_id, {
            current_hours: formData.end_hours,
          });

          return { success: true, serverId: formData.serverId };
        }
      } else {
        // Não existia no servidor (foi iniciado offline) -> Insere novo registro completo (SEM started_at)
        const payload: Record<string, any> = {
          machine_id: formData.machine_id,
          operator_id: formData.operator_id,
          client_name: formData.client_name.trim(),
          client_phone: phone,
          service_date: formData.service_date,
          start_hours: formData.start_hours,
          end_hours: formData.end_hours,
          observations: formData.observations?.trim() || null,
          status: 'pendente',
          created_at: formData.started_at || now,
        };

        const { data, error } = await supabase
          .from('work_logs')
          .insert(payload)
          .select('id')
          .single();

        if (!error && data?.id) {
          if (formData.localId) {
            await db.offline_work_logs.update(formData.localId, {
              server_id: data.id,
              client_name: formData.client_name.trim(),
              client_phone: phone,
              service_date: formData.service_date,
              end_hours: formData.end_hours,
              total_hours,
              observations: formData.observations?.trim() || null,
              status: 'pendente',
              sync_status: 'synced',
              synced: true,
              synced_at: now,
            });
          }

          await db.cached_machines.update(formData.machine_id, {
            current_hours: formData.end_hours,
          });

          return { success: true, serverId: data.id };
        }
      }
    } catch (err) {
      console.warn('[WorkLogService] Falha online ao finalizar serviço, salvando como pending offline:', err);
    }
  }

  // 2. Persistência offline local no Dexie
  try {
    if (formData.localId) {
      await db.offline_work_logs.update(formData.localId, {
        client_name: formData.client_name.trim(),
        client_phone: phone,
        service_date: formData.service_date,
        end_hours: formData.end_hours,
        total_hours,
        observations: formData.observations?.trim() || null,
        status: 'pendente',
        sync_status: 'pending',
        synced: false,
      });
    } else {
      await saveOfflineWorkLog({
        machine_id: formData.machine_id,
        machine_name: formData.machine_name,
        operator_id: formData.operator_id,
        operator_name: formData.operator_name,
        client_name: formData.client_name.trim(),
        client_phone: phone,
        service_date: formData.service_date,
        start_hours: formData.start_hours,
        end_hours: formData.end_hours,
        total_hours,
        observations: formData.observations?.trim() || null,
        status: 'pendente',
        started_at: formData.started_at || now,
      });
    }

    await db.cached_machines.update(formData.machine_id, {
      current_hours: formData.end_hours,
    });

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao salvar no banco local';
    return { success: false, error: message };
  }
}

/**
 * Submete apontamento direto (compatibilidade)
 */
export async function submitWorkLog(
  formData: WorkLogFormData,
  isOnline: boolean
): Promise<{ success: boolean; isOfflineSaved: boolean; localId?: number; serverId?: string; error?: string }> {
  const total_hours = calculateTotalHours(formData.start_hours, formData.end_hours);
  const now = new Date().toISOString();
  const phone = formData.client_phone?.trim() || null;

  // 1. Tenta envio online caso haja conectividade
  if (isOnline && isSupabaseConfigured()) {
    try {
      const payload = {
        machine_id: formData.machine_id,
        operator_id: formData.operator_id,
        client_name: formData.client_name.trim(),
        client_phone: phone,
        service_date: formData.service_date,
        start_hours: formData.start_hours,
        end_hours: formData.end_hours,
        observations: formData.observations?.trim() || null,
        status: 'pendente' as const,
        created_at: now,
      };

      const { data, error } = await supabase
        .from('work_logs')
        .insert(payload)
        .select('id')
        .single();

      if (error) {
        console.error('[Supabase saveWorkLog Error]:', error);
      } else if (data?.id) {
        const localId = await db.offline_work_logs.add({
          server_id: data.id,
          machine_id: formData.machine_id,
          machine_name: formData.machine_name,
          operator_id: formData.operator_id,
          operator_name: formData.operator_name,
          client_name: formData.client_name.trim(),
          client_phone: phone,
          service_date: formData.service_date,
          start_hours: formData.start_hours,
          end_hours: formData.end_hours,
          total_hours,
          observations: formData.observations?.trim() || null,
          sync_status: 'synced',
          synced: true,
          status: 'pendente',
          created_at: now,
          synced_at: now,
        });

        await db.cached_machines.update(formData.machine_id, {
          current_hours: formData.end_hours,
        });

        return { success: true, isOfflineSaved: false, localId: localId as number, serverId: data.id };
      }
    } catch (err) {
      console.warn('[WorkLogService] Falha online, comutando para persistência offline:', err);
    }
  }

  // 2. Persistência offline local no Dexie
  try {
    const localId = await saveOfflineWorkLog({
      machine_id: formData.machine_id,
      machine_name: formData.machine_name,
      operator_id: formData.operator_id,
      operator_name: formData.operator_name,
      client_name: formData.client_name.trim(),
      client_phone: phone,
      service_date: formData.service_date,
      start_hours: formData.start_hours,
      end_hours: formData.end_hours,
      total_hours,
      observations: formData.observations?.trim() || null,
      status: 'pendente',
    });

    await db.cached_machines.update(formData.machine_id, {
      current_hours: formData.end_hours,
    });

    return { success: true, isOfflineSaved: true, localId };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao salvar no banco local';
    return { success: false, isOfflineSaved: false, error: message };
  }
}
