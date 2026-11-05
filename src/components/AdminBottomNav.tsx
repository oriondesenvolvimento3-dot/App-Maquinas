import React from 'react';
import {
  Home,
  CheckSquare,
  BadgeDollarSign,
  Calendar,
  MoreHorizontal,
} from 'lucide-react';

export type AdminNavTab = 'inicio' | 'servicos' | 'financeiro' | 'agenda' | 'mais';

export interface AdminBottomNavProps {
  activeTab: AdminNavTab;
  onNavigateToDashboard?: () => void;
  onNavigateToServices?: () => void;
  onNavigateToFinancial?: () => void;
  onNavigateToAgenda?: () => void;
  onNavigateToMachines?: () => void;
}

export const AdminBottomNav: React.FC<AdminBottomNavProps> = ({
  activeTab,
  onNavigateToDashboard,
  onNavigateToServices,
  onNavigateToFinancial,
  onNavigateToAgenda,
  onNavigateToMachines,
}) => {
  const getButtonClass = (tab: AdminNavTab) =>
    activeTab === tab
      ? 'flex flex-col items-center gap-1 text-[#0F172A] cursor-pointer'
      : 'flex flex-col items-center gap-1 text-[#64748B] hover:text-[#0F172A] transition-colors cursor-pointer';

  const getIconStroke = (tab: AdminNavTab) =>
    activeTab === tab ? 'w-5 h-5 stroke-[2.2]' : 'w-5 h-5 stroke-[1.8]';

  const getLabelClass = (tab: AdminNavTab) =>
    activeTab === tab ? 'text-[10px] font-bold' : 'text-[10px] font-medium';

  return (
    <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t border-[#E2E8F0] px-5 py-2.5 flex items-center justify-between z-40 shadow-lg">
      {/* Aba Início */}
      <button
        type="button"
        onClick={activeTab === 'inicio' ? undefined : onNavigateToDashboard}
        className={getButtonClass('inicio')}
      >
        <Home className={getIconStroke('inicio')} />
        <span className={getLabelClass('inicio')}>Início</span>
      </button>

      {/* Aba Serviços */}
      <button
        type="button"
        onClick={activeTab === 'servicos' ? undefined : onNavigateToServices}
        className={getButtonClass('servicos')}
      >
        <CheckSquare className={getIconStroke('servicos')} />
        <span className={getLabelClass('servicos')}>Serviços</span>
      </button>

      {/* Aba Financeiro */}
      <button
        type="button"
        onClick={activeTab === 'financeiro' ? undefined : onNavigateToFinancial}
        className={getButtonClass('financeiro')}
      >
        <BadgeDollarSign className={getIconStroke('financeiro')} />
        <span className={getLabelClass('financeiro')}>Financeiro</span>
      </button>

      {/* Aba Agenda */}
      <button
        type="button"
        onClick={activeTab === 'agenda' ? undefined : onNavigateToAgenda}
        className={getButtonClass('agenda')}
      >
        <Calendar className={getIconStroke('agenda')} />
        <span className={getLabelClass('agenda')}>Agenda</span>
      </button>

      {/* Aba Mais (Gestão de Máquinas) */}
      <button
        type="button"
        onClick={activeTab === 'mais' ? undefined : onNavigateToMachines}
        className={getButtonClass('mais')}
      >
        <MoreHorizontal className={getIconStroke('mais')} />
        <span className={getLabelClass('mais')}>Mais</span>
      </button>
    </nav>
  );
};

export default AdminBottomNav;

