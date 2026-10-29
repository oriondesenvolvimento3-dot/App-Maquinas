import React, { useState } from 'react';
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
import { MachineManagement } from './pages/admin/MachineManagement';
import type { WorkLogFormData } from './services/workLogService';
import type { OfflineWorkLog } from './types/database';

export type AppRoute =
  | 'home'
  | 'new-service'
  | 'finish-service'
  | 'service-success'
  | 'admin-dashboard'
  | 'admin-services'
  | 'admin-service-detail'
  | 'admin-history'
  | 'admin-machines';

/**
 * Casca de navegação unificada da aplicação
 */
const AppNavigator: React.FC = () => {
  const { user, profile, loading } = useAuth();
  const [currentRoute, setCurrentRoute] = useState<AppRoute>('home');
  const [activeServiceToFinish, setActiveServiceToFinish] = useState<OfflineWorkLog | null>(null);
  const [lastRegisteredService, setLastRegisteredService] = useState<WorkLogFormData | null>(null);
  const [selectedServiceId, setSelectedServiceId] = useState<string | number | null>(null);

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
            setCurrentRoute('home');
          }}
        />
      );

    case 'finish-service':
      if (!activeServiceToFinish) {
        return (
          <OperatorHome
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
          onBack={() => setCurrentRoute('home')}
          onSuccess={(formData) => {
            setActiveServiceToFinish(null);
            setLastRegisteredService(formData);
            setCurrentRoute('service-success');
          }}
        />
      );

    case 'service-success':
      if (!lastRegisteredService) {
        return (
          <OperatorHome
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
            setLastRegisteredService(null);
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
        />
      );

    // Padrão: Tela inicial do Operador
    case 'home':
    default:
      return (
        <OperatorHome
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
  return (
    <AuthProvider>
      <AppNavigator />
    </AuthProvider>
  );
}

export default App;
