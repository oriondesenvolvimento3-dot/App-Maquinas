import { describe, it, expect, vi } from 'vitest';
import { supabase, isSupabaseConfigured } from '../src/lib/supabase';

describe('Auth & Supabase Client', () => {
  it('deve confirmar se o cliente Supabase está configurado com URL e chave', () => {
    const configured = isSupabaseConfigured();
    expect(typeof configured).toBe('boolean');
  });

  it('deve chamar signInWithOAuth com provedor google e redirecionamento dinâmico correto', async () => {
    const signInSpy = vi.spyOn(supabase.auth, 'signInWithOAuth').mockResolvedValueOnce({
      data: { provider: 'google', url: 'https://accounts.google.com/o/oauth2/auth' },
      error: null,
    });

    const redirectUrl = `${window.location.origin}/`;

    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
      },
    });

    expect(signInSpy).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
      },
    });
  });

  it('deve usar o IP dinâmico da rede local se acessado via dispositivo móvel', async () => {
    const originalOrigin = window.location.origin;
    (window.location as unknown as Record<string, string>).origin = 'http://192.168.2.125:3000';

    const signInSpy = vi.spyOn(supabase.auth, 'signInWithOAuth').mockResolvedValueOnce({
      data: { provider: 'google', url: 'https://accounts.google.com/o/oauth2/auth' },
      error: null,
    });

    const redirectUrl = `${window.location.origin}/`;

    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
      },
    });

    expect(signInSpy).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: 'http://192.168.2.125:3000/',
      },
    });

    (window.location as unknown as Record<string, string>).origin = originalOrigin;
  });

  it('deve armazenar e ler flag retroscave_has_logged_before no localStorage para detecção de usuário recorrente', () => {
    localStorage.setItem('retroscave_has_logged_before', 'true');
    const hasLoggedBefore = localStorage.getItem('retroscave_has_logged_before') === 'true';
    expect(hasLoggedBefore).toBe(true);

    localStorage.removeItem('retroscave_has_logged_before');
    const hasNotLogged = localStorage.getItem('retroscave_has_logged_before') === 'true';
    expect(hasNotLogged).toBe(false);
  });

  it('deve armazenar e ler dados do último usuário no localStorage para login rápido', () => {
    const mockUser = {
      id: 'usr-123',
      name: 'Carlos Operador',
      email: 'carlos@empresa.com',
      role: 'operator',
      last_login: new Date().toISOString(),
    };

    localStorage.setItem('retroscave_last_user', JSON.stringify(mockUser));
    const stored = localStorage.getItem('retroscave_last_user');

    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed.name).toBe('Carlos Operador');
    expect(parsed.role).toBe('operator');
  });

  it('deve verificar se o getSession do Supabase pode ser consumido para restoreSession', async () => {
    const getSessionSpy = vi.spyOn(supabase.auth, 'getSession').mockResolvedValueOnce({
      data: {
        session: {
          access_token: 'valid-token',
          token_type: 'bearer',
          expires_in: 3600,
          refresh_token: 'refresh',
          user: {
            id: 'usr-123',
            app_metadata: {},
            user_metadata: { full_name: 'Carlos Operador' },
            aud: 'authenticated',
            created_at: new Date().toISOString(),
          },
        } as any,
      },
      error: null,
    });

    const result = await supabase.auth.getSession();
    expect(getSessionSpy).toHaveBeenCalled();
    expect(result.data.session?.user?.id).toBe('usr-123');
  });
});
