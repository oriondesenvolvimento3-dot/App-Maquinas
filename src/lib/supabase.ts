import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

/**
 * Leitura das variáveis de ambiente configuradas no Vite (.env)
 */
const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

/**
 * Validação amigável para ambiente de desenvolvimento.
 * Evita que o app quebre silenciosamente caso as chaves ainda não tenham sido inseridas.
 */
if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[RETROSCAVE Supabase Warning]: As variáveis VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY não foram definidas. Configure seu arquivo .env na raiz do projeto.'
  );
}

/**
 * Cliente Supabase com tipagem forte baseada no esquema Database
 */
export const supabase = createClient<Database>(
  supabaseUrl || 'https://placeholder-domain.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'retroscave-auth-token',
    },
    global: {
      headers: {
        'x-application-name': 'retroscave-pwa',
      },
    },
  }
);

/**
 * Helper para verificar se as credenciais do Supabase foram devidamente preenchidas
 */
export const isSupabaseConfigured = (): boolean => {
  return Boolean(
    supabaseUrl &&
    supabaseAnonKey &&
    !supabaseUrl.includes('placeholder-domain')
  );
};
