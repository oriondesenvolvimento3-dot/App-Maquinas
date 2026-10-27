import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Profile } from '../types/database';
import { cacheRemoteMachinesAndProfiles, syncPendingWorkLogs } from '../services/syncService';

const PROFILE_CACHE_KEY = 'retroscave_cached_profile';
export const LAST_USER_KEY = 'retroscave_last_user';
export const HAS_LOGGED_BEFORE_KEY = 'retroscave_has_logged_before';

export interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  isAdmin: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  restoreSession: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(() => {
    // Carrega o perfil do cache offline instantaneamente para evitar tela branca em áreas rurais
    try {
      const cached = localStorage.getItem(PROFILE_CACHE_KEY);
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState<boolean>(true);

  const isAdmin = useMemo(() => profile?.role === 'admin', [profile?.role]);

  /**
   * Busca e sincroniza o perfil do usuário no Supabase
   */
  const fetchAndCacheProfile = useCallback(async (currentUser: User): Promise<Profile | null> => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .maybeSingle();

      if (error) {
        console.warn('[AuthContext] Não foi possível obter perfil do Supabase:', error.message);
      }

      if (data) {
        const fetchedProfile = data as Profile;
        setProfile(fetchedProfile);
        localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(fetchedProfile));
        localStorage.setItem('retroscave_has_logged_before', 'true');
        try {
          localStorage.setItem(LAST_USER_KEY, JSON.stringify({
            id: currentUser.id,
            email: currentUser.email || fetchedProfile.email,
            name: fetchedProfile.full_name || currentUser.user_metadata?.full_name || 'Usuário',
            role: fetchedProfile.role,
            last_login: new Date().toISOString(),
          }));
        } catch {
          // ignore
        }
        return fetchedProfile;
      }

      // Se o usuário fez login pela primeira vez com o Google e a tabela profiles ainda não tem o registro,
      // criamos um perfil padrão baseado nos metadados do Google
      const metadata = currentUser.user_metadata || {};
      const newProfile: Profile = {
        id: currentUser.id,
        email: currentUser.email || '',
        full_name: metadata.full_name || metadata.name || currentUser.email?.split('@')[0] || 'Operador',
        avatar_url: metadata.avatar_url || metadata.picture || null,
        role: 'operator',
        created_at: new Date().toISOString(),
      };

      // Tenta persistir no Supabase se houver conexão
      await supabase.from('profiles').upsert(newProfile);

      setProfile(newProfile);
      localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(newProfile));
      localStorage.setItem('retroscave_has_logged_before', 'true');
      try {
        localStorage.setItem(LAST_USER_KEY, JSON.stringify({
          id: currentUser.id,
          email: currentUser.email || newProfile.email,
          name: newProfile.full_name,
          role: newProfile.role,
          last_login: new Date().toISOString(),
        }));
      } catch {
        // ignore
      }
      return newProfile;
    } catch (err) {
      console.warn('[AuthContext] Usando fallback local para o perfil devido à falha de rede:', err);
      // Mantém o perfil em cache se disponível
      const cached = localStorage.getItem(PROFILE_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        setProfile(parsed);
        return parsed;
      }
      return null;
    }
  }, []);

  /**
   * Executa a rotina de pós-autenticação: sincronização e cache de dados de suporte
   */
  const triggerPostLoginSync = useCallback(() => {
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      // Dispara em background sem bloquear o carregamento da UI
      Promise.all([
        cacheRemoteMachinesAndProfiles(),
        syncPendingWorkLogs(),
      ]).catch((err) => {
        console.warn('[AuthContext] Falha na sincronização pós-login:', err);
      });
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    // 1. Obtém sessão ativa inicial
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;

      if (session?.user) {
        localStorage.setItem('retroscave_has_logged_before', 'true');
        setUser(session.user);
        fetchAndCacheProfile(session.user).then(() => {
          if (mounted) {
            setLoading(false);
            triggerPostLoginSync();
          }
        });
      } else {
        // Se estiver offline mas já existia perfil em cache, não bloqueamos o acesso imediato
        setLoading(false);
      }
    }).catch(() => {
      if (mounted) setLoading(false);
    });

    // 2. Escuta mudanças de estado de autenticação (LOGIN, LOGOUT, TOKEN REFRESH)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session: Session | null) => {
        if (!mounted) return;

        if (event === 'SIGNED_OUT') {
          setUser(null);
          setProfile(null);
          localStorage.removeItem(PROFILE_CACHE_KEY);
          setLoading(false);
          return;
        }

        if (session?.user) {
          localStorage.setItem('retroscave_has_logged_before', 'true');
          setUser(session.user);
          await fetchAndCacheProfile(session.user);
          triggerPostLoginSync();
        }

        setLoading(false);
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchAndCacheProfile, triggerPostLoginSync]);

  /**
   * Inicia fluxo de autenticação com o Google OAuth
   */
  const signInWithGoogle = async (): Promise<void> => {
    try {
      const redirectUrl = `${window.location.origin}/`;

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
        },
      });

      if (error) {
        console.error('[AuthContext] Erro ao iniciar login com Google:', error.message);
        throw error;
      }
    } catch (err) {
      console.error('[AuthContext] Falha no OAuth:', err);
      throw err;
    }
  };

  /**
   * Encerra a sessão no Supabase e limpa os caches locais de identidade
   */
  const signOut = async (): Promise<void> => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('[AuthContext] Aviso ao deslogar do Supabase:', err);
    } finally {
      localStorage.removeItem(PROFILE_CACHE_KEY);
      setUser(null);
      setProfile(null);
    }
  };

  /**
   * Força uma atualização do perfil a partir do Supabase
   */
  const refreshProfile = async (): Promise<void> => {
    if (user) {
      await fetchAndCacheProfile(user);
    }
  };

  /**
   * Tenta restaurar a sessão ativa do Supabase ou perfil persistido em storage local
   */
  const restoreSession = useCallback(async (): Promise<boolean> => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (!error && session?.user) {
        localStorage.setItem('retroscave_has_logged_before', 'true');
        setUser(session.user);
        await fetchAndCacheProfile(session.user);
        triggerPostLoginSync();
        return true;
      }

      // Se offline ou token precisar de cache local
      const cachedProfileStr = localStorage.getItem(PROFILE_CACHE_KEY);
      const cachedLastUserStr = localStorage.getItem(LAST_USER_KEY);
      if (cachedProfileStr || cachedLastUserStr) {
        if (cachedProfileStr) {
          const parsed = JSON.parse(cachedProfileStr);
          setProfile(parsed);
          return true;
        }
        if (cachedLastUserStr) {
          const parsed = JSON.parse(cachedLastUserStr);
          const fallbackProfile: Profile = {
            id: parsed.id || 'offline-user',
            email: parsed.email || '',
            full_name: parsed.name || 'Operador',
            avatar_url: parsed.avatar_url || null,
            role: parsed.role || 'operator',
            created_at: parsed.last_login || new Date().toISOString(),
          };
          setProfile(fallbackProfile);
          return true;
        }
      }

      return false;
    } catch (err) {
      console.warn('[AuthContext] Falha ao restaurar sessão:', err);
      return false;
    }
  }, [fetchAndCacheProfile, triggerPostLoginSync]);

  const value = useMemo(
    () => ({
      user,
      profile,
      loading,
      isAdmin,
      signInWithGoogle,
      signOut,
      refreshProfile,
      restoreSession,
    }),
    [user, profile, loading, isAdmin, restoreSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser utilizado dentro de um <AuthProvider>');
  }
  return context;
}
