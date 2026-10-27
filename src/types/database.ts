/**
 * RETROSCAVE - Definições de Tipos do Banco de Dados
 * Sistema de Controle de Horas de Maquinário Pesado (Offline-First)
 */

export type UserRole = 'operator' | 'admin';

export type WorkLogStatus = 'pendente' | 'aprovado' | 'rejeitado';

export type FinancialStatus = 'pago' | 'pendente' | 'cancelado';

export type FinancialType = 'receita' | 'despesa';

export type SyncStatus = 'pending' | 'synced';

/**
 * Perfil de usuário / Operador / Administrador
 */
export interface Profile {
  id: string; // Referência ao auth.users do Supabase (UUID)
  email: string;
  full_name: string;
  avatar_url: string | null;
  role: UserRole;
  created_at?: string;
  updated_at?: string;
}

/**
 * Máquina / Equipamento pesado (ex: Retroescavadeiras)
 */
export interface Machine {
  id: string; // UUID
  name: string; // Ex: "Retroescavadeira 01"
  model: string; // Ex: "Caterpillar 416E", "JCB 3CX"
  hourly_rate: number; // Valor cobrado por hora trabalhada (R$)
  current_hours: number; // Horômetro atual acumulado
  active: boolean; // Flag de ativação no sistema
  created_at?: string;
  updated_at?: string;
}

/**
 * Apontamento / Registro de serviço de máquina
 */
export interface WorkLog {
  id: string; // UUID
  machine_id: string; // FK -> Machine
  operator_id: string; // FK -> Profile
  client_name: string; // Nome do cliente / obra
  client_phone?: string | null; // Telefone / WhatsApp do cliente (opcional)
  service_date: string; // Formato YYYY-MM-DD
  start_hours: number; // Horômetro inicial do serviço
  end_hours: number; // Horômetro final do serviço
  total_hours: number; // Horas totais calculadas (end_hours - start_hours)
  observations: string | null; // Observações opcionais do operador
  status: WorkLogStatus; // 'pendente' | 'aprovado' | 'rejeitado'
  created_at: string; // Timestamp ISO
  updated_at?: string;

  // Campos financeiros calculados
  hourly_rate?: number;
  total_amount?: number;

  // Relacionamentos expandidos (JOINs no Supabase)
  machine?: Machine;
  operator?: Profile;
}

/**
 * Lançamento Financeiro (faturamento de serviços e fluxo de caixa)
 */
export interface FinancialEntry {
  id: string; // UUID
  work_log_id?: string | null; // FK opcional -> WorkLog
  client_name: string; // Nome do cliente
  description?: string | null; // Descrição complementar do lançamento
  service_date: string; // Data da prestação do serviço (YYYY-MM-DD)
  due_date?: string | null; // Data de vencimento
  payment_date?: string | null; // Data efetiva do pagamento se liquidado
  total_hours?: number; // Total de horas faturadas
  amount: number; // Valor monetário (R$)
  type: FinancialType; // 'receita' | 'despesa'
  status: FinancialStatus; // 'pago' | 'pendente' | 'cancelado'
  billing_status?: 'a_faturar' | 'faturado' | 'cancelado';
  applied_hourly_rate?: number;
  category?: string; // Ex: 'locacao', 'manutencao', 'combustivel'
  created_at: string; // Timestamp ISO
  updated_at?: string;
}

/**
 * Registro de Serviço Offline para Dexie.js (IndexedDB)
 */
export interface OfflineWorkLog {
  id?: number; // Chave primária auto-incrementada localmente
  server_id?: string | null; // UUID retornado pelo Supabase após sincronização
  machine_id: string;
  machine_name: string; // Desnormalizado para visualização offline rápida
  operator_id: string;
  operator_name: string; // Desnormalizado para visualização offline rápida
  client_name: string;
  client_phone?: string | null; // Telefone / WhatsApp do cliente (opcional)
  service_date: string;
  start_hours: number;
  end_hours: number;
  total_hours: number;
  observations: string | null;
  sync_status: SyncStatus; // 'pending' | 'synced'
  status?: WorkLogStatus; // 'pendente' | 'aprovado' | 'rejeitado'
  hourly_rate?: number;
  total_amount?: number;
  created_at: string;
  synced_at?: string | null;
}

/**
 * Esquema de banco de dados compatível com o cliente do Supabase
 */
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: { [K in keyof Profile]: Profile[K] };
        Insert: {
          id: string;
          email: string;
          full_name: string;
          avatar_url?: string | null;
          role?: UserRole;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string;
          avatar_url?: string | null;
          role?: UserRole;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      machines: {
        Row: { [K in keyof Machine]: Machine[K] };
        Insert: {
          id?: string;
          name: string;
          model: string;
          hourly_rate: number;
          current_hours?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          model?: string;
          hourly_rate?: number;
          current_hours?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      work_logs: {
        Row: { [K in keyof WorkLog]: WorkLog[K] };
        Insert: {
          id?: string;
          machine_id: string;
          operator_id: string;
          client_name: string;
          client_phone?: string | null;
          service_date: string;
          start_hours: number;
          end_hours: number;
          total_hours?: number; // Coluna gerada (GENERATED ALWAYS) no Postgres
          observations?: string | null;
          status?: WorkLogStatus;
          hourly_rate?: number;
          total_amount?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          machine_id?: string;
          operator_id?: string;
          client_name?: string;
          client_phone?: string | null;
          service_date?: string;
          start_hours?: number;
          end_hours?: number;
          total_hours?: number;
          observations?: string | null;
          status?: WorkLogStatus;
          hourly_rate?: number;
          total_amount?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      financial_entries: {
        Row: { [K in keyof FinancialEntry]: FinancialEntry[K] };
        Insert: {
          id?: string;
          work_log_id?: string | null;
          client_name: string;
          description?: string | null;
          service_date: string;
          due_date?: string | null;
          payment_date?: string | null;
          total_hours?: number;
          amount: number;
          type: FinancialType;
          status?: FinancialStatus;
          billing_status?: 'a_faturar' | 'faturado' | 'cancelado';
          applied_hourly_rate?: number;
          category?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          work_log_id?: string | null;
          client_name?: string;
          description?: string | null;
          service_date?: string;
          due_date?: string | null;
          payment_date?: string | null;
          total_hours?: number;
          amount?: number;
          type?: FinancialType;
          status?: FinancialStatus;
          billing_status?: 'a_faturar' | 'faturado' | 'cancelado';
          applied_hourly_rate?: number;
          category?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      user_role: UserRole;
      work_log_status: WorkLogStatus;
      financial_status: FinancialStatus;
      financial_type: FinancialType;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
