import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Welcome } from './pages/Welcome';
import { OperatorHome } from './pages/operator/OperatorHome';
import { NewServiceForm } from './pages/operator/NewServiceForm';
import { FinishServiceForm } from './pages/operator/FinishServiceForm';
import { ServiceSuccess } from './pages/operator/ServiceSuccess';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { AdminServiceList } from './pages/admin/AdminServiceList';
import { AdminServiceDetail } from './pages/admin/AdminServiceDetail';
import { AdminHistory } from './pages/admin/AdminHistory';
import { AdminAgenda } from './pages/admin/AdminAgenda';
import { MachineManagement } from './pages/admin/MachineManagement';
import {
  initAutoSync,
  SYNC_COMPLETE_EVENT,
  SYNC_ERROR_EVENT,
  type SyncCompleteEventDetail,
  type SyncErrorEventDetail,
} from './services/syncService';
import type { WorkLogFormData } from './services/workLogService';
import type { OfflineWorkLog } from './types/database';
import { CheckCircle2, AlertTriangle } from 'lucide-react';

export type AppRoute =
  | 'home'
  | 'new-service'
  | 'finish-service'
  | 'service-success'
  | 'admin-dashboard'
  | 'admin-services'
  | 'admin-service-detail'
  | 'admin-history'
  | 'admin-agenda'
  | 'admin-machines';

/**
 * Casca de navegação unificada da aplicação
 */
const AppNavigator: React.FC = () => {
  const { user, profile, loading } = useAuth();
  const [currentRoute, setCurrentRoute] = useState<AppRoute>(() => {
    if (typeof window !== 'undefined' && window.location?.pathname === '/admin/agenda') {
      return 'admin-agenda';
    }
    return 'home';
  });
  const [activeServiceToFinish, setActiveServiceToFinish] = useState<OfflineWorkLog | null>(null);
  const [lastRegisteredService, setLastRegisteredService] = useState<WorkLogFormData | null>(null);
  const [selectedServiceId, setSelectedServiceId] = useState<string | number | null>(null);
  const [homeKey, setHomeKey] = useState<number>(0);

  // 1. Carregamento inicial da sessão
  if (loading) {
    return (
      <div className="w-full min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center gap-4">
        <div className="relative flex items-center justify-center">
          <div className="w-14 h-14 rounded-full border-4 border-[#FBBF24]/30 border-t-[#FBBF24] animate-spin"></div>
          <div className="absolute w-6 h-6 rounded-full bg-[#0F172A]"></div>
        </div>
        <p className="text-sm font-semibold text-[#0F172A] tracking-wider uppercase">
          Carregando RETROSCAVE...
        </p>
      </div>
    );
  }

  // 2. Não autenticado -> Apresenta a tela Welcome/Splash
  if (!user && !profile) {
    return <Welcome />;
  }

  // 3. Roteamento Condicional de Produção
  switch (currentRoute) {
    // --- FLUXO DO OPERADOR ---
    case 'new-service':
      return (
        <NewServiceForm
          onBack={() => setCurrentRoute('home')}
          onSuccess={() => {
            setHomeKey((k) => k + 1);
            setCurrentRoute('home');
          }}
        />
      );

    case 'finish-service':
      if (!activeServiceToFinish) {
        return (
          <OperatorHome
            key={homeKey}
            onNavigateToNewService={() => setCurrentRoute('new-service')}
            onNavigateToFinishService={(activeLog) => {
              setActiveServiceToFinish(activeLog);
              setCurrentRoute('finish-service');
            }}
            onNavigateToAdmin={() => setCurrentRoute('admin-dashboard')}
          />
        );
      }
      return (
        <FinishServiceForm
          activeLog={activeServiceToFinish}
          onBack={() => {
            setActiveServiceToFinish(null);
            setHomeKey((k) => k + 1);
            setCurrentRoute('home');
          }}
          onSuccess={(formData) => {
            setActiveServiceToFinish(null);
            setLastRegisteredService(formData);
            setHomeKey((k) => k + 1);
            setCurrentRoute('service-success');
          }}
        />
      );

    case 'service-success':
      if (!lastRegisteredService) {
        return (
          <OperatorHome
            key={homeKey}
            onNavigateToNewService={() => setCurrentRoute('new-service')}
            onNavigateToFinishService={(activeLog) => {
              setActiveServiceToFinish(activeLog);
              setCurrentRoute('finish-service');
            }}
            onNavigateToAdmin={() => setCurrentRoute('admin-dashboard')}
          />
        );
      }
      return (
        <ServiceSuccess
          serviceData={lastRegisteredService}
          onBackToHome={() => {
            setActiveServiceToFinish(null);
            setLastRegisteredService(null);
            setHomeKey((k) => k + 1);
            setCurrentRoute('home');
          }}
        />
      );

    // --- FLUXO DO ADMINISTRADOR ---
    case 'admin-dashboard':
      return (
        <AdminDashboard
          onNavigateToServices={() => setCurrentRoute('admin-services')}
          onNavigateToServiceDetail={(id) => {
            setSelectedServiceId(id);
            setCurrentRoute('admin-service-detail');
          }}
          onNavigateToMachines={() => setCurrentRoute('admin-machines')}
          onSwitchToOperator={() => setCurrentRoute('home')}
          onNavigateToFinancial={() => setCurrentRoute('admin-history')}
          onNavigateToAgenda={() => setCurrentRoute('admin-agenda')}
        />
      );

    case 'admin-services':
      return (
        <AdminServiceList
          onBackToDashboard={() => setCurrentRoute('admin-dashboard')}
          onSelectService={(id) => {
            setSelectedServiceId(id);
            setCurrentRoute('admin-service-detail');
          }}
          onNavigateToMachines={() => setCurrentRoute('admin-machines')}
          onNavigateToFinancial={() => setCurrentRoute('admin-history')}
          onNavigateToAgenda={() => setCurrentRoute('admin-agenda')}
        />
      );

    case 'admin-service-detail':
      if (!selectedServiceId) {
        return (
          <AdminServiceList
            onBackToDashboard={() => setCurrentRoute('admin-dashboard')}
            onSelectService={(id) => {
              setSelectedServiceId(id);
              setCurrentRoute('admin-service-detail');
            }}
            onNavigateToMachines={() => setCurrentRoute('admin-machines')}
            onNavigateToFinancial={() => setCurrentRoute('admin-history')}
            onNavigateToAgenda={() => setCurrentRoute('admin-agenda')}
          />
        );
      }
      return (
        <AdminServiceDetail
          serviceId={selectedServiceId}
          onBack={() => setCurrentRoute('admin-services')}
          onActionComplete={() => setCurrentRoute('admin-services')}
        />
      );

    case 'admin-history':
      return (
        <AdminHistory
          onNavigateToDashboard={() => setCurrentRoute('admin-dashboard')}
          onNavigateToServices={() => setCurrentRoute('admin-services')}
          onNavigateToMachines={() => setCurrentRoute('admin-machines')}
          onNavigateToAgenda={() => setCurrentRoute('admin-agenda')}
          onSelectServiceDetail={(id) => {
            setSelectedServiceId(id);
            setCurrentRoute('admin-service-detail');
          }}
        />
      );

    case 'admin-agenda':
      return (
        <AdminAgenda
          onNavigateToDashboard={() => setCurrentRoute('admin-dashboard')}
          onNavigateToServices={() => setCurrentRoute('admin-services')}
          onNavigateToFinancial={() => setCurrentRoute('admin-history')}
          onNavigateToMachines={() => setCurrentRoute('admin-machines')}
          onSelectServiceDetail={(id) => {
            setSelectedServiceId(id);
            setCurrentRoute('admin-service-detail');
          }}
        />
      );

    case 'admin-machines':
      return (
        <MachineManagement
          onBack={() => setCurrentRoute('admin-dashboard')}
          onNavigateToDashboard={() => setCurrentRoute('admin-dashboard')}
          onNavigateToServices={() => setCurrentRoute('admin-services')}
          onNavigateToFinancial={() => setCurrentRoute('admin-history')}
          onNavigateToAgenda={() => setCurrentRoute('admin-agenda')}
        />
      );

    // Padrão: Tela inicial do Operador
    case 'home':
    default:
      return (
        <OperatorHome
          key={homeKey}
          onNavigateToNewService={() => setCurrentRoute('new-service')}
          onNavigateToFinishService={(activeLog) => {
            setActiveServiceToFinish(activeLog);
            setCurrentRoute('finish-service');
          }}
          onNavigateToAdmin={() => setCurrentRoute('admin-dashboard')}
        />
      );
  }
};

export function App() {
  const [syncToast, setSyncToast] = useState<string | null>(null);
  const [syncErrorToast, setSyncErrorToast] = useState<string | null>(null);

  useEffect(() => {
    const cleanupAutoSync = initAutoSync();

    const handleSyncComplete = (event: Event) => {
      const customEvent = event as CustomEvent<SyncCompleteEventDetail>;
      const message =
        customEvent.detail?.message ||
        `${customEvent.detail?.syncedCount ?? 1} serviço(s) sincronizado(s) com a nuvem!`;
      setSyncToast(message);
    };

    const handleSyncError = (event: Event) => {
      const customEvent = event as CustomEvent<SyncErrorEventDetail>;
      if (customEvent.detail?.message) {
        setSyncErrorToast(customEvent.detail.message);
      }
    };

    window.addEventListener(SYNC_COMPLETE_EVENT, handleSyncComplete);
    window.addEventListener(SYNC_ERROR_EVENT, handleSyncError);
    return () => {
      cleanupAutoSync();
      window.removeEventListener(SYNC_COMPLETE_EVENT, handleSyncComplete);
      window.removeEventListener(SYNC_ERROR_EVENT, handleSyncError);
    };
  }, []);

  useEffect(() => {
    if (!syncToast) return;
    const timer = setTimeout(() => {
      setSyncToast(null);
    }, 4000);
    return () => clearTimeout(timer);
  }, [syncToast]);

  useEffect(() => {
    if (!syncErrorToast) return;
    const timer = setTimeout(() => {
      setSyncErrorToast(null);
    }, 5000);
    return () => clearTimeout(timer);
  }, [syncErrorToast]);

  return (
    <AuthProvider>
      {syncToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-sm w-[calc(100%-2rem)] bg-[#0F172A] text-white px-4 py-3 rounded-2xl shadow-xl border border-slate-700 flex items-center gap-2.5 text-xs font-bold animate-fade-in"
        >
          <CheckCircle2 className="w-4 h-4 text-[#FBBF24] shrink-0" />
          <span>{syncToast}</span>
        </div>
      )}
      {syncErrorToast && (
        <div
          role="alert"
          aria-live="assertive"
          className="fixed top-16 left-1/2 -translate-x-1/2 z-50 max-w-sm w-[calc(100%-2rem)] bg-red-600 text-white px-4 py-3 rounded-2xl shadow-xl border border-red-400 flex items-center gap-2.5 text-xs font-bold animate-fade-in"
        >
          <AlertTriangle className="w-4 h-4 text-white shrink-0" />
          <span>Erro na nuvem: {syncErrorToast}</span>
        </div>
      )}
      <AppNavigator />
    </AuthProvider>
  );
}

export default App;
