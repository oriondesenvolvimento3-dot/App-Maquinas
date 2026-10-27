import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { db, saveOfflineWorkLog, getCachedActiveMachines, setCachedMachines } from '../lib/dexieDb';
import type { Machine } from '../types/database';

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
  return diff > 0 ? Number(diff.toFixed(1)) : 0;
}

/**
 * Valida os campos do apontamento de horas de maquinário pesado
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
 * Submete o apontamento de horas: tenta gravar online no Supabase;
 * se offline ou houver falha de rede, persiste localmente no Dexie com sync_status = 'pending'.
 */
export async function submitWorkLog(
  formData: WorkLogFormData,
  isOnline: boolean
): Promise<{ success: boolean; isOfflineSaved: boolean; localId?: number; serverId?: string; error?: string }> {
  const total_hours = calculateTotalHours(formData.start_hours, formData.end_hours);
  const now = new Date().toISOString();
  const phone = formData.client_phone?.trim() || null;

  // 1. Tenta envio online caso haja conectividade
  if (isOnline) {
    try {
      // ATENÇÃO: NÃO enviar 'total_hours' ao Supabase pois é uma coluna gerada (GENERATED ALWAYS)
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
        // Salva cópia local no Dexie marcada como sincronizada
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
          created_at: now,
          synced_at: now,
        });

        // Atualiza o horômetro da máquina no cache local
        await db.cached_machines.update(formData.machine_id, {
          current_hours: formData.end_hours,
        });

        return { success: true, isOfflineSaved: false, localId: localId as number, serverId: data.id };
      }
    } catch (err) {
      console.warn('[WorkLogService] Falha online, comutando para persistência offline:', err);
    }
  }

  // 2. Persistência offline local no Dexie (IndexedDB)
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
    });

    // Atualiza o horômetro da máquina no cache local
    await db.cached_machines.update(formData.machine_id, {
      current_hours: formData.end_hours,
    });

    return { success: true, isOfflineSaved: true, localId };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao salvar no banco local';
    return { success: false, isOfflineSaved: false, error: message };
  }
}
