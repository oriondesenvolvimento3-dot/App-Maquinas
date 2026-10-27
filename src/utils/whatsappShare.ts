/**
 * RETROSCAVE - Utilitário de Compartilhamento via WhatsApp
 * Monta mensagens padronizadas de prestação de serviços com link direto para o WhatsApp.
 */

/**
 * Gera o texto formatado para envio do fechamento de horas ao cliente
 */
export function buildWhatsAppServiceMessage(
  clientName: string,
  period: string,
  totalHours: number,
  totalAmount: number
): string {
  const formattedAmount = totalAmount.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return [
    `🚜 *RETROSCAVE - Fechamento de Serviços*`,
    ``,
    `Olá, *${clientName || 'Cliente'}*! Segue o resumo consolidado de serviços de maquinário pesado:`,
    ``,
    `📅 *Período de Apuração:* ${period}`,
    `⏱️ *Total de Horas Trabalhadas:* ${totalHours}h`,
    `💰 *Valor Total Geral:* R$ ${formattedAmount}`,
    ``,
    `📄 O *Relatório Detalhado em PDF* com a discriminação dos horímetros inicial e final por máquina e operador foi gerado e segue anexo.`,
    ``,
    `Qualquer dúvida, estamos à disposição!`,
    `_Equipe RETROSCAVE_`,
  ].join('\n');
}

/**
 * Constrói o link wa.me ou api.whatsapp.com com o texto codificado
 */
export function buildWhatsAppServiceSummary(
  clientName: string,
  period: string,
  totalHours: number,
  totalAmount: number,
  phone?: string
): string {
  const message = buildWhatsAppServiceMessage(clientName, period, totalHours, totalAmount);
  const encodedText = encodeURIComponent(message);

  if (phone) {
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length >= 10) {
      // Se não tiver código do país 55, adiciona
      const fullPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
      return `https://wa.me/${fullPhone}?text=${encodedText}`;
    }
  }

  return `https://api.whatsapp.com/send?text=${encodedText}`;
}

/**
 * Dispara a abertura do WhatsApp no navegador ou app móvel
 */
export function openWhatsAppShare(
  clientName: string,
  period: string,
  totalHours: number,
  totalAmount: number,
  phone?: string
): void {
  const url = buildWhatsAppServiceSummary(clientName, period, totalHours, totalAmount, phone);
  window.open(url, '_blank');
}
