import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Wifi, Battery, Signal, Loader2, AlertCircle, ArrowRight } from 'lucide-react';

export const Welcome: React.FC = () => {
  const { signInWithGoogle, restoreSession } = useAuth();
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Detecção se o usuário já fez login anteriormente
  const hasLoggedBefore = localStorage.getItem('retroscave_has_logged_before') === 'true';

  const [currentTime, setCurrentTime] = useState(() => {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  });

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    };

    // Atualiza imediatamente e configura intervalo de 10 segundos
    const timer = setInterval(updateClock, 10000);
    return () => clearInterval(timer);
  }, []);

  const handleGoogleLogin = async () => {
    try {
      setIsLoggingIn(true);
      setErrorMessage(null);
      await signInWithGoogle();
    } catch (err: unknown) {
      console.error('Erro no login:', err);
      const message = err instanceof Error ? err.message : 'Falha ao conectar com o Google. Tente novamente.';
      setErrorMessage(message);
      setIsLoggingIn(false);
    }
  };

  const handleQuickEnter = async () => {
    try {
      setIsLoggingIn(true);
      setErrorMessage(null);

      // Se a sessão do Supabase já estiver ativa em cache/storage, navega imediatamente para o fluxo do usuário
      const { data: { session }, error } = await supabase.auth.getSession();
      if (!error && session?.user) {
        const restored = await restoreSession();
        if (restored) {
          return;
        }
      }

      // Se o token tiver expirado ou a sessão for nula, dispara o signInWithGoogle utilizando o redirectTo dinâmico configurado
      await signInWithGoogle();
    } catch (err: unknown) {
      console.error('Erro no login rápido:', err);
      const message = err instanceof Error ? err.message : 'Falha ao revalidar acesso. Tente novamente.';
      setErrorMessage(message);
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="fixed inset-0 h-full w-full overflow-hidden overscroll-none touch-none select-none flex flex-col justify-between items-center bg-[#F8FAFC] px-6 py-4">
      
      {/* 1. TOP STATUS BAR (Relógio em tempo real sincronizado) */}
      <header className="w-full max-w-md flex items-center justify-between px-1 pt-1 pb-1 text-[#0F172A] z-20">
        <span className="font-semibold text-xs tracking-tight text-[#0F172A]">{currentTime}</span>
        <div className="flex items-center gap-1.5">
          <Signal className="w-4 h-4 fill-current stroke-none text-[#0F172A]" />
          <Wifi className="w-4 h-4 stroke-[2.2] text-[#0F172A]" />
          <Battery className="w-5 h-5 fill-current stroke-[1.5] text-[#0F172A]" />
        </div>
      </header>

      {/* 2. TOPO/CENTRO: LOGO + SLOGANS */}
      <main className="flex-1 flex flex-col items-center justify-center w-full max-w-md z-20 my-auto -translate-y-5 sm:-translate-y-8">
        {/* Imagem da Logo com limite para caber 100% visível na janela */}
        <img
          src="/logo.png"
          alt="RETROSCAVE"
          className="max-w-[190px] sm:max-w-[230px] max-h-[26vh] w-auto object-contain drop-shadow-sm transition-transform duration-300 hover:scale-[1.02]"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = '/logo.jpg';
          }}
        />

        {/* Slogans tipográficos */}
        <p className="text-xs tracking-[0.25em] text-[#475569] font-medium uppercase text-center mt-3">
          CONTROLE. REGISTRE.
        </p>
        <p className="text-xs tracking-[0.2em] text-[#334155] font-semibold uppercase text-center mt-1">
          FAÇA SEU SERVIÇO RENDER.
        </p>
      </main>

      {/* 3. FUNDO: IMAGEM DA MÁQUINA ANCORADA NA BASE */}
      <img
        src="/welcome-footer.png"
        alt=""
        aria-hidden="true"
        className="absolute bottom-0 left-0 right-0 pointer-events-none object-cover object-bottom max-h-[32vh] w-full z-10 opacity-90"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).src = '/prototipo/welcome-footer.png';
        }}
      />

      {/* 4. SEÇÃO INFERIOR: BOTÃO DE ACESSO */}
      <div className="relative z-20 mb-4 sm:mb-6 w-full max-w-xs flex flex-col items-center touch-auto">
        {errorMessage && (
          <div className="w-full mb-2 flex items-center gap-2 p-2.5 text-xs text-red-700 bg-red-50/95 backdrop-blur-sm border border-red-200 rounded-xl shadow-sm animate-fade-in">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        {hasLoggedBefore ? (
          <>
            {/* Usuário Recorrente: Botão principal discreto, moderno e minimalista em grafite #0F172A */}
            <button
              onClick={handleQuickEnter}
              className="w-full max-w-xs h-12 rounded-xl bg-[#0F172A] text-white font-medium text-sm tracking-wide shadow-sm active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <span>Entrar</span>
              <ArrowRight className="w-4 h-4 opacity-75" />
            </button>

            {/* Alternar conta: botão de texto sutil */}
            <button
              onClick={signInWithGoogle}
              className="mt-2 text-xs text-[#64748B] hover:text-[#0F172A] underline transition-colors"
            >
              Entrar com outra conta
            </button>
          </>
        ) : (
          /* Primeiro Acesso: Botão padrão "Entrar com o Google" */
          <button
            id="btn-google-login"
            type="button"
            onClick={handleGoogleLogin}
            disabled={isLoggingIn}
            className="w-full h-12 sm:h-14 bg-white border border-[#E2E8F0] rounded-xl sm:rounded-2xl shadow-md hover:shadow-lg active:scale-95 transition-all duration-200 flex items-center justify-center gap-3 px-4 text-[#0F172A] font-semibold text-sm sm:text-base disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer touch-manipulation"
            aria-label="Entrar com o Google"
          >
            {isLoggingIn ? (
              <>
                <Loader2 className="w-5 h-5 text-[#F59E0B] animate-spin" />
                <span className="text-slate-600 font-medium text-sm">Conectando ao Google...</span>
              </>
            ) : (
              <>
                {/* Ícone clássico oficial do Google em SVG colorido */}
                <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span className="text-[#0F172A] font-semibold text-sm sm:text-base">Entrar com o Google</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
};

export default Welcome;
