import { useState, useEffect, useCallback, useRef } from 'react';

export interface NetworkStatus {
  /** Indica se o navegador possui conectividade reportada */
  isOnline: boolean;
  /** Inverso de isOnline para conveniência visual na UI */
  isOffline: boolean;
  /** Indica se o app esteve offline e agora retornou a conexão (gatilho de sincronização) */
  wasOffline: boolean;
  /** Timestamp da última alteração de status */
  lastChangedAt: Date | null;
  /** Força uma verificação de ping real na rede contra falso-positivo de Wi-Fi sem internet */
  checkRealConnection: () => Promise<boolean>;
  /** Limpa o sinalizador de que esteve offline após a conclusão da sincronização */
  resetWasOffline: () => void;
}

/**
 * Hook para monitoramento em tempo real do status de conectividade do dispositivo.
 * Essencial para operações em áreas rurais com oscilação frequente de sinal.
 */
export function useNetworkStatus(): NetworkStatus {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof window !== 'undefined' && typeof navigator !== 'undefined'
      ? navigator.onLine
      : true;
  });

  const [wasOffline, setWasOffline] = useState<boolean>(false);
  const [lastChangedAt, setLastChangedAt] = useState<Date | null>(null);
  
  // Referência para controlar o estado anterior sem re-render excessivo
  const prevOnlineRef = useRef<boolean>(isOnline);

  const resetWasOffline = useCallback(() => {
    setWasOffline(false);
  }, []);

  /**
   * Testa conectividade real fazendo uma requisição rápida HEAD para evitar falso-positivo
   * (ex: conectado a um roteador rural sem link de internet)
   */
  const checkRealConnection = useCallback(async (): Promise<boolean> => {
    if (typeof window === 'undefined' || !navigator.onLine) {
      setIsOnline(false);
      return false;
    }

    try {
      // Faz um teste rápido com timeout curto
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      // Usando favicon do domínio ou ping no Supabase/Cloudflare
      const response = await fetch('/favicon.ico', {
        method: 'HEAD',
        cache: 'no-store',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const online = response.ok || response.type === 'opaque';
      setIsOnline(online);
      return online;
    } catch {
      // Falha de rede ou timeout
      setIsOnline(false);
      return false;
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => {
      setIsOnline(true);
      setLastChangedAt(new Date());

      // Se anteriormente estava offline, aciona a flag para que o sistema execute o sync
      if (!prevOnlineRef.current) {
        setWasOffline(true);
      }
      prevOnlineRef.current = true;
    };

    const handleOffline = () => {
      setIsOnline(false);
      setLastChangedAt(new Date());
      setWasOffline(true);
      prevOnlineRef.current = false;
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Verificação de APIs de informações de conexão se suportado (Network Information API)
    const nav = navigator as unknown as {
      connection?: {
        addEventListener?: (type: string, listener: () => void) => void;
        removeEventListener?: (type: string, listener: () => void) => void;
      };
    };

    const handleConnectionChange = () => {
      if (typeof navigator !== 'undefined') {
        const current = navigator.onLine;
        if (current !== prevOnlineRef.current) {
          if (current) {
            handleOnline();
          } else {
            handleOffline();
          }
        }
      }
    };

    nav.connection?.addEventListener?.('change', handleConnectionChange);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      nav.connection?.removeEventListener?.('change', handleConnectionChange);
    };
  }, []);

  return {
    isOnline,
    isOffline: !isOnline,
    wasOffline,
    lastChangedAt,
    checkRealConnection,
    resetWasOffline,
  };
}
