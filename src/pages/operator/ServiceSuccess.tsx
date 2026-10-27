import React from 'react';
import type { WorkLogFormData } from '../../services/workLogService';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import {
  Check,
  Truck,
  User,
  Users,
  Clock,
  WifiOff,
} from 'lucide-react';

interface ServiceSuccessProps {
  serviceData: WorkLogFormData;
  onBackToHome: () => void;
}

export const ServiceSuccess: React.FC<ServiceSuccessProps> = ({ serviceData, onBackToHome }) => {
  const { isOnline } = useNetworkStatus();

  const totalHours = Math.max(
    0,
    Number((serviceData.end_hours - serviceData.start_hours).toFixed(1))
  );

  return (
    <div className="relative flex flex-col justify-between w-full max-w-md mx-auto min-h-screen bg-[#F8FAFC] shadow-2xl">
      
      {/* 1. ESPAÇAMENTO STATUS BAR */}
      <div className="w-full h-8 pt-3 px-6 flex justify-between items-center text-xs text-[#0F172A]">
        <span className="font-semibold">9:41</span>
        {!isOnline && (
          <div className="flex items-center gap-1 text-[10px] bg-[#FEF3C7] text-[#B45309] font-bold px-2 py-0.5 rounded-full">
            <WifiOff className="w-3 h-3" />
            <span>Salvo Offline</span>
          </div>
        )}
      </div>

      {/* 2. CONTEÚDO CENTRAL: CÍRCULO AMARELO + TÍTULO + CARD RESUMO */}
      <main className="flex-1 px-6 pt-4 pb-6 flex flex-col items-center justify-center -mt-6">
        
        {/* Círculo Amarelo com Checkmark Preto */}
        <div className="w-24 h-24 rounded-full bg-[#FBBF24] flex items-center justify-center shadow-md mb-6 animate-scale-up">
          <Check className="w-12 h-12 text-[#0F172A] stroke-[3]" />
        </div>

        {/* Título e Subtítulo */}
        <h1 className="text-2xl font-extrabold text-[#0F172A] tracking-tight mb-2 text-center">
          Serviço registrado!
        </h1>
        <p className="text-sm font-medium text-[#64748B] text-center max-w-xs mb-8 leading-relaxed">
          {isOnline
            ? 'O serviço foi salvo com sucesso e já está disponível no painel administrativo.'
            : 'O serviço foi salvo com segurança no aparelho e será enviado à nuvem assim que houver conexão.'}
        </p>

        {/* Card Resumo do Serviço */}
        <div className="w-full bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-sm space-y-4">
          
          {/* Item 1: Máquina */}
          <div className="flex items-start gap-3">
            <div className="p-2 bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] text-[#0F172A] mt-0.5">
              <Truck className="w-4 h-4 text-[#0F172A]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-[#64748B]">Máquina</p>
              <p className="text-sm font-bold text-[#0F172A] truncate">
                {serviceData.machine_name}
              </p>
            </div>
          </div>

          {/* Item 2: Funcionário */}
          <div className="flex items-start gap-3">
            <div className="p-2 bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] text-[#0F172A] mt-0.5">
              <User className="w-4 h-4 text-[#0F172A]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-[#64748B]">Funcionário</p>
              <p className="text-sm font-bold text-[#0F172A] truncate">
                {serviceData.operator_name}
              </p>
            </div>
          </div>

          {/* Item 3: Cliente */}
          <div className="flex items-start gap-3">
            <div className="p-2 bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] text-[#0F172A] mt-0.5">
              <Users className="w-4 h-4 text-[#0F172A]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-[#64748B]">Cliente</p>
              <p className="text-sm font-bold text-[#0F172A] truncate">
                {serviceData.client_name}
              </p>
            </div>
          </div>

          {/* Item 4: Horas trabalhadas com horômetros */}
          <div className="flex items-start gap-3">
            <div className="p-2 bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] text-[#0F172A] mt-0.5">
              <Clock className="w-4 h-4 text-[#0F172A]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-[#64748B]">Horas trabalhadas</p>
              <p className="text-sm font-bold text-[#0F172A]">
                {totalHours}h{' '}
                <span className="text-xs font-normal text-[#64748B]">
                  ({serviceData.end_hours} - {serviceData.start_hours})
                </span>
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* 3. RODAPÉ: BOTÃO VOLTAR PARA A TELA INICIAL */}
      <footer className="p-6 bg-white border-t border-[#E2E8F0] sticky bottom-0 z-20">
        <button
          id="btn-back-to-home"
          type="button"
          onClick={onBackToHome}
          className="w-full h-14 bg-[#0F172A] hover:bg-[#1E293B] active:scale-[0.98] text-white font-bold text-base rounded-2xl shadow-sm transition-all duration-200 flex items-center justify-center cursor-pointer"
        >
          Voltar para a tela inicial
        </button>
      </footer>
    </div>
  );
};

export default ServiceSuccess;
