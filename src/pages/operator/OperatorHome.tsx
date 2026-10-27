import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { db } from '../../lib/dexieDb';
import { syncPendingWorkLogs } from '../../services/syncService';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { getActiveMachines } from '../../services/workLogService';
import {
  Plus,
  Wifi,
  WifiOff,
  Clock,
  Users,
  DollarSign,
  RefreshCw,
  Shield,
  Layers,
} from 'lucide-react';

interface OperatorHomeProps {
  onNavigateToNewService: () => void;
  onNavigateToAdmin?: () => void;
}

export const OperatorHome: React.FC<OperatorHomeProps> = ({
  onNavigateToNewService,
  onNavigateToAdmin,
}) => {
  const { profile, isAdmin } = useAuth();
  const { isOnline } = useNetworkStatus();

  // Métricas do Dashboard 2x2 (iniciadas em zero, exclusivamente calculadas dos dados reais)
  const [machinesCount, setMachinesCount] = useState<number>(0);
  const [clientsCount, setClientsCount] = useState<number>(0);
  const [servicesTodayCount, setServicesTodayCount] = useState<number>(0);
  const [totalHoursToday, setTotalHoursToday] = useState<number>(0);
  const [totalAmountToday, setTotalAmountToday] = useState<number>(0);
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(0);

  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  /**
   * Carrega estatísticas do dia a partir dos dados reais (Dexie / Supabase)
   */
  const loadDashboardMetrics = useCallback(async () => {
    try {
      // 1. Conta máquinas ativas reais
      const machines = await getActiveMachines(isOnline);
      setMachinesCount(machines.length);

      // 2. Apontamentos: Consulta Supabase se online e Dexie local
      const todayStr = new Date().toISOString().split('T')[0];
      const localLogs = await db.offline_work_logs.toArray();
      let logsForMetrics: Array<{
        service_date: string;
        client_name: string;
        total_hours: number;
        hourly_rate?: number;
        total_amount?: number;
      }> = [];

      if (isOnline && isSupabaseConfigured()) {
        try {
          const { data, error } = await supabase
            .from('work_logs')
            .select('*');

          if (error) {
            console.error('[Supabase OperatorHome work_logs Error]:', error);
          } else if (data) {
            let cachedMachines = await db.cached_machines.toArray();
            if (cachedMachines.length === 0 && machines.length > 0) {
              cachedMachines = machines;
            }
            const machineMap = new Map(cachedMachines.map((m) => [m.id, m]));

            logsForMetrics = data.map((item: any) => {
              const machineRate = Number(machineMap.get(item.machine_id)?.hourly_rate || 0);
              const hours = Number(item.total_hours || 0);
              return {
                service_date: item.service_date,
                client_name: item.client_name,
                total_hours: hours,
                hourly_rate: machineRate,
                total_amount: hours * machineRate,
              };
            });
          }
        } catch (err) {
          console.error('[Supabase OperatorHome work_logs catch]:', err);
        }
      }

      // Se offline ou não obteve registros remotos, recorre aos logs locais do Dexie
      if (logsForMetrics.length === 0) {
        logsForMetrics = localLogs;
      } else {
        // Inclui registros locais pendentes de envio
        const pendingLocal = localLogs.filter((l) => l.sync_status === 'pending');
        for (const pend of pendingLocal) {
          logsForMetrics.push(pend);
        }
      }

      const todayLogs = logsForMetrics.filter((log) => log.service_date === todayStr);
      setServicesTodayCount(todayLogs.length);

      // Clientes únicos atendidos
      const uniqueClients = new Set(
        logsForMetrics
          .map((log) => log.client_name?.trim())
          .filter((name): name is string => Boolean(name && name.length > 0))
      );
      setClientsCount(uniqueClients.size);

      // Soma de horas reais
      const hours = todayLogs.reduce((acc, curr) => acc + (curr.total_hours || 0), 0);
      setTotalHoursToday(Number(hours.toFixed(1)));

      // Estimativa financeira baseada nos lançamentos reais do dia
      const amount = todayLogs.reduce((acc, curr) => {
        const rate = curr.hourly_rate || 0;
        return acc + (curr.total_amount !== undefined ? curr.total_amount : (curr.total_hours || 0) * rate);
      }, 0);
      setTotalAmountToday(amount);

      // Apontamentos pendentes de sincronização (exclusivamente registros reais criados no aparelho)
      const pending = localLogs.filter((log) => log.sync_status === 'pending');
      setPendingSyncCount(pending.length);
    } catch (err) {
      console.warn('[OperatorHome] Erro ao carregar métricas:', err);
    }
  }, [isOnline]);

  useEffect(() => {
    loadDashboardMetrics();
  }, [loadDashboardMetrics]);

  /**
   * Aciona a sincronização manual dos apontamentos pendentes
   */
  const handleManualSync = async () => {
    if (!isOnline || isSyncing) return;
    setIsSyncing(true);
    setSyncFeedback(null);
    try {
      const synced = await syncPendingWorkLogs();
      await loadDashboardMetrics();
      setSyncFeedback(
        synced > 0
          ? `${synced} apontamento(s) sincronizado(s) com sucesso!`
          : 'Tudo pronto! Banco sincronizado com a nuvem.'
      );
    } catch {
      setSyncFeedback('Erro ao conectar ao Supabase.');
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncFeedback(null), 4000);
    }
  };

  return (
    <div className="relative flex flex-col justify-between w-full max-w-md mx-auto min-h-screen bg-[#F8FAFC] shadow-2xl overflow-x-hidden">
      
      {/* 1. CABEÇALHO SUPERIOR */}
      <header className="w-full flex items-center justify-between px-6 pt-5 pb-3 bg-[#F8FAFC]">
        {/* Logo / Marca */}
        <div className="flex items-center gap-2">
          <span className="text-base font-extrabold tracking-wider text-[#0F172A] uppercase">
            RETROSCAVE
          </span>
        </div>

        {/* Status de Conectividade e Acesso Admin */}
        <div className="flex items-center gap-2">
          {/* Badge Conexão */}
          {isOnline ? (
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 bg-[#DCFCE7] text-[#166534] rounded-full text-[11px] font-bold"
              title="Conectado à nuvem"
            >
              <span className="w-2 h-2 rounded-full bg-[#16A34A] animate-pulse"></span>
              <Wifi className="w-3.5 h-3.5" />
              <span>Online</span>
            </div>
          ) : (
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 bg-[#FEF3C7] text-[#B45309] rounded-full text-[11px] font-bold"
              title="Armazenando localmente no aparelho"
            >
              <span className="w-2 h-2 rounded-full bg-[#F59E0B]"></span>
              <WifiOff className="w-3.5 h-3.5" />
              <span>Modo Rural</span>
            </div>
          )}

          {/* Botão de Alternância de Visão do Administrador */}
          {isAdmin && onNavigateToAdmin && (
            <button
              id="btn-switch-admin"
              type="button"
              onClick={onNavigateToAdmin}
              className="flex items-center justify-center w-8 h-8 rounded-full bg-white border border-[#E2E8F0] text-[#0F172A] hover:bg-[#F1F5F9] transition-all shadow-sm cursor-pointer"
              title="Painel Administrativo"
            >
              <Shield className="w-4 h-4 text-[#0F172A]" />
            </button>
          )}
        </div>
      </header>

      {/* 2. CONTEÚDO PRINCIPAL */}
      <main className="flex-1 px-6 pt-3 pb-8 space-y-6 z-10">
        
        {/* Bloco de Saudação */}
        <div className="space-y-1">
          <h1 className="text-3xl font-extrabold text-[#0F172A] tracking-tight">
            Olá{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}!
          </h1>
          <p className="text-sm font-medium text-[#64748B] leading-relaxed">
            Registre os serviços das máquinas de forma rápida e simples.
          </p>
        </div>

        {/* Botão de Ação Primária Amarelo: + Novo Serviço */}
        <button
          id="btn-new-service"
          type="button"
          onClick={onNavigateToNewService}
          className="w-full h-14 bg-[#FBBF24] hover:bg-[#F59E0B] active:scale-[0.98] text-[#0F172A] font-bold text-base rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
        >
          <div className="w-6 h-6 rounded-full bg-[#0F172A] text-[#FBBF24] flex items-center justify-center">
            <Plus className="w-4 h-4 stroke-[3]" />
          </div>
          <span>Novo Serviço</span>
        </button>

        {/* Card Alerta de Sincronização Pendente (se houver logs no aparelho aguardando conexão) */}
        {pendingSyncCount > 0 && (
          <div className="bg-[#FEF3C7] border border-[#FDE68A] rounded-2xl p-4 text-[#B45309] shadow-sm animate-fade-in flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-[#B45309]" />
                <span className="text-xs font-bold">
                  {pendingSyncCount} serviço(s) salvos no aparelho
                </span>
              </div>
              <span className="text-[10px] font-semibold bg-[#FDE68A] px-2 py-0.5 rounded-full">
                Offline
              </span>
            </div>
            <p className="text-[11px] text-[#92400E]">
              Os dados estão salvos com segurança neste dispositivo e serão enviados à nuvem assim que houver conexão.
            </p>
            {isOnline && (
              <button
                type="button"
                onClick={handleManualSync}
                disabled={isSyncing}
                className="mt-1 self-start inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#B45309] hover:bg-[#92400E] text-white text-xs font-bold rounded-xl transition-all cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                {isSyncing ? 'Sincronizando...' : 'Sincronizar agora'}
              </button>
            )}
          </div>
        )}

        {syncFeedback && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl font-semibold animate-fade-in">
            {syncFeedback}
          </div>
        )}

        {/* Grid 2x2 com os cartões brancos do protótipo */}
        <div className="grid grid-cols-2 gap-4">
          
          {/* Card 1: Máquinas */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-sm flex flex-col justify-between h-28 hover:border-[#CBD5E1] transition-all">
            <div className="flex items-center gap-2 text-[#0F172A]">
              <div className="p-1.5 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0]">
                <Layers className="w-4 h-4 text-[#0F172A]" />
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-[#64748B]">Máquinas</p>
              <p className="text-2xl font-bold text-[#0F172A]">{machinesCount}</p>
            </div>
          </div>

          {/* Card 2: Clientes */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-sm flex flex-col justify-between h-28 hover:border-[#CBD5E1] transition-all">
            <div className="flex items-center gap-2 text-[#0F172A]">
              <div className="p-1.5 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0]">
                <Users className="w-4 h-4 text-[#0F172A]" />
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-[#64748B]">Clientes</p>
              <p className="text-2xl font-bold text-[#0F172A]">
                {clientsCount}
              </p>
            </div>
          </div>

          {/* Card 3: Serviços hoje */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-sm flex flex-col justify-between h-28 hover:border-[#CBD5E1] transition-all">
            <div className="flex items-center gap-2 text-[#0F172A]">
              <div className="p-1.5 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0]">
                <Clock className="w-4 h-4 text-[#0F172A]" />
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-[#64748B]">Serviços hoje</p>
              <p className="text-2xl font-bold text-[#0F172A]">{servicesTodayCount}</p>
            </div>
          </div>

          {/* Card 4: Total do dia (Horas para operador, R$ para admin) */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-sm flex flex-col justify-between h-28 hover:border-[#CBD5E1] transition-all">
            <div className="flex items-center gap-2 text-[#0F172A]">
              <div className="p-1.5 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0]">
                {isAdmin ? (
                  <DollarSign className="w-4 h-4 text-[#0F172A]" />
                ) : (
                  <Clock className="w-4 h-4 text-[#0F172A]" />
                )}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-[#64748B]">Total do dia</p>
              <p className="text-lg font-bold text-[#0F172A] truncate">
                {isAdmin
                  ? totalAmountToday > 0
                    ? `R$ ${totalAmountToday.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                    : 'R$ 0,00'
                  : `${totalHoursToday}h`}
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* 3. RODAPÉ ESTILIZADO COM ONDA E SLOGAN DO PROTÓTIPO */}
      <footer className="relative w-full px-6 pb-6 pt-4 text-center z-10 flex flex-col items-center">
        {/* Curva decorativa suave idêntica ao protótipo */}
        <div className="w-full max-w-[280px] h-6 mb-3 opacity-80">
          <svg viewBox="0 0 280 24" fill="none" className="w-full h-full">
            <path
              d="M0 16C40 8 70 20 110 12C150 4 190 20 220 14C245 9 265 18 280 22"
              stroke="#CBD5E1"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M170 16C190 20 220 14 245 9C258 6 270 12 280 22"
              stroke="#FBBF24"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        </div>

        <p className="text-xs font-medium text-[#64748B] max-w-xs leading-relaxed">
          Trabalho bem feito, também se mede em horas.
        </p>
      </footer>
    </div>
  );
};

export default OperatorHome;
