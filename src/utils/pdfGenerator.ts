import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface ReportItem {
  date: string;
  machine: string;
  operator: string;
  startHours: number;
  endHours: number;
  totalHours: number;
  hourlyRate: number;
  subtotal: number;
}

export interface ReportData {
  clientName: string;
  startDate: string;
  endDate: string;
  issueDate?: string;
  items: ReportItem[];
  totalHours: number;
  totalAmount: number;
}

/**
 * Formata data no formato brasileiro DD/MM/AAAA
 */
function formatDateBr(dateStr: string): string {
  try {
    const [year, month, day] = dateStr.split('T')[0].split('-');
    if (year && month && day) {
      return `${day}/${month}/${year}`;
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}

/**
 * Formata valor monetário em reais (BRL)
 */
function formatCurrency(val: number): string {
  return `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Gera documento PDF profissional A4 para prestação de contas e faturamento de maquinário
 */
export function generateServiceReportPdf(reportData: ReportData): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const issueDateFormatted = formatDateBr(reportData.issueDate || new Date().toISOString());
  const periodFormatted = `${formatDateBr(reportData.startDate)} a ${formatDateBr(reportData.endDate)}`;

  // 1. FAIXA SUPERIOR DE DESTAQUE AMARELA (Assinatura RETROSCAVE)
  doc.setFillColor(251, 191, 36); // #FBBF24
  doc.rect(0, 0, pageWidth, 5, 'F');

  // 2. CABEÇALHO DA EMPRESA
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(15, 23, 42); // #0F172A
  doc.text('RETROSCAVE', 14, 18);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139); // #64748B
  doc.text('CONTROLE DE MAQUINÁRIO PESADO & TERRAPLANAGEM', 14, 23);

  // Título do Documento
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('RELATÓRIO DE PRESTAÇÃO DE SERVIÇOS', 14, 32);

  // Linha divisória
  doc.setDrawColor(226, 232, 240); // #E2E8F0
  doc.setLineWidth(0.5);
  doc.line(14, 35, pageWidth - 14, 35);

  // 3. BLOCO DE INFORMAÇÕES GERAIS (CARD RESUMO)
  doc.setFillColor(248, 250, 252); // #F8FAFC
  doc.roundedRect(14, 38, pageWidth - 28, 22, 2, 2, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, 38, pageWidth - 28, 22, 2, 2, 'S');

  // Coluna 1: Cliente
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('CLIENTE / OBRA:', 18, 44);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(reportData.clientName || 'Todos os Clientes', 18, 50);

  // Coluna 2: Período
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('PERÍODO DE APURAÇÃO:', 95, 44);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text(periodFormatted, 95, 50);

  // Coluna 3: Emissão
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('DATA DE EMISSÃO:', 155, 44);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text(issueDateFormatted, 155, 50);

  // 4. TABELA DISCRIMINADA DE SERVIÇOS
  const tableRows = reportData.items.map((item) => [
    formatDateBr(item.date),
    item.machine,
    item.operator,
    `${item.startHours}h`,
    `${item.endHours}h`,
    `${item.totalHours}h`,
    formatCurrency(item.hourlyRate),
    formatCurrency(item.subtotal),
  ]);

  autoTable(doc, {
    startY: 65,
    margin: { left: 14, right: 14 },
    head: [[
      'Data',
      'Máquina',
      'Operador',
      'Horím. Inicial',
      'Horím. Final',
      'Horas',
      'Tarifa/h',
      'Subtotal',
    ]],
    body: tableRows,
    foot: [[
      '',
      '',
      '',
      '',
      'TOTAL GERAL:',
      `${reportData.totalHours}h`,
      '',
      formatCurrency(reportData.totalAmount),
    ]],
    theme: 'grid',
    headStyles: {
      fillColor: [15, 23, 42], // #0F172A
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
      halign: 'left',
      cellPadding: 2.5,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [30, 41, 59],
      cellPadding: 2.2,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      fontSize: 9,
      cellPadding: 3,
    },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 35 },
      2: { cellWidth: 30 },
      3: { cellWidth: 20, halign: 'right' },
      4: { cellWidth: 20, halign: 'right' },
      5: { cellWidth: 15, halign: 'right', fontStyle: 'bold' },
      6: { cellWidth: 20, halign: 'right' },
      7: { cellWidth: 22, halign: 'right', fontStyle: 'bold' },
    },
  });

  // 5. RODAPÉ COM TERMOS E ASSINATURA
  // Pega a posição Y final da tabela
  const finalY = (doc as any).lastAutoTable?.finalY || 180;
  let signatureY = finalY + 22;

  // Se a tabela ficou muito perto do fim da folha, adiciona nova página
  if (signatureY > 245) {
    doc.addPage();
    signatureY = 30;
  }

  // Declaração de Aceite
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    'Declaro que os serviços e horímetros discriminados neste relatório foram executados e conferidos a contento.',
    14,
    signatureY - 5
  );

  // Linhas de Assinatura
  doc.setDrawColor(148, 163, 184); // #94A3B8
  doc.setLineWidth(0.4);

  // Assinatura 1: RETROSCAVE
  doc.line(18, signatureY + 15, 85, signatureY + 15);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text('RETROSCAVE MAQUINÁRIO', 51.5, signatureY + 19, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.text('Responsável Operacional', 51.5, signatureY + 23, { align: 'center' });

  // Assinatura 2: CLIENTE
  doc.line(125, signatureY + 15, 192, signatureY + 15);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text(reportData.clientName || 'CLIENTE RESPONSÁVEL', 158.5, signatureY + 19, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.text('Assinatura do Responsável / Aceite', 158.5, signatureY + 23, { align: 'center' });

  // 6. DOWNLOAD AUTOMÁTICO DO ARQUIVO
  const safeClient = (reportData.clientName || 'Geral').replace(/[^a-zA-Z0-9]/g, '_');
  const safeDate = (reportData.endDate || new Date().toISOString().split('T')[0]).replace(/[^a-zA-Z0-9]/g, '-');
  const fileName = `Relatorio_RetroScave_${safeClient}_${safeDate}.pdf`;

  doc.save(fileName);
}

/**
 * Gera comprovante individual (notinha / recibo de prestação de serviço) em formato A5
 * Com cabeçalho timbrado RETROSCAVE, dados da máquina, operador, horas, valor total e campo de assinatura.
 */
export function generateSingleServiceReceiptPdf(
  service: {
    id?: string | number;
    client_name?: string;
    clientName?: string;
    client_phone?: string | null;
    clientPhone?: string | null;
    machine_name?: string;
    machineName?: string;
    operator_name?: string;
    operatorName?: string;
    service_date?: string;
    serviceDate?: string;
    start_hours?: number;
    startHours?: number;
    end_hours?: number;
    endHours?: number;
    total_hours?: number;
    totalHours?: number;
    observations?: string | null;
    hourly_rate?: number;
    total_amount?: number;
  },
  appliedHourlyRate?: number,
  appliedTotalAmount?: number
): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a5', // Tamanho padrão notinha/recibo (148 x 210 mm)
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 148 mm
  const client = (service.client_name || service.clientName || 'Cliente').trim();
  const phone = service.client_phone || service.clientPhone || null;
  const machine = (service.machine_name || service.machineName || 'Retroescavadeira').trim();
  const operator = (service.operator_name || service.operatorName || 'Operador').trim();
  const dateStr = service.service_date || service.serviceDate || new Date().toISOString().split('T')[0];
  const start = Number(service.start_hours ?? service.startHours ?? 0);
  const end = Number(service.end_hours ?? service.endHours ?? 0);
  const hours = Number(service.total_hours ?? service.totalHours ?? (end - start));
  const rate = appliedHourlyRate !== undefined ? appliedHourlyRate : (service.hourly_rate ?? 0);
  const total = appliedTotalAmount !== undefined ? appliedTotalAmount : (service.total_amount ?? hours * rate);
  const obs = service.observations?.trim() || null;

  // 1. FAIXA SUPERIOR AMARELA (Marca RETROSCAVE)
  doc.setFillColor(251, 191, 36); // #FBBF24
  doc.rect(0, 0, pageWidth, 4, 'F');

  // 2. CABEÇALHO TIMBRADO
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42); // #0F172A
  doc.text('RETROSCAVE', 10, 14);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139); // #64748B
  doc.text('CONTROLE DE MAQUINÁRIO PESADO & TERRAPLANAGEM', 10, 18);

  // Título do Comprovante
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('COMPROVANTE DE PRESTAÇÃO DE SERVIÇO', 10, 27);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(`Emissão: ${formatDateBr(new Date().toISOString())}`, pageWidth - 10, 27, { align: 'right' });

  // Linha divisória
  doc.setDrawColor(226, 232, 240); // #E2E8F0
  doc.setLineWidth(0.4);
  doc.line(10, 30, pageWidth - 10, 30);

  // 3. CARD: DADOS DO CLIENTE
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(10, 34, pageWidth - 20, 17, 2, 2, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(10, 34, pageWidth - 20, 17, 2, 2, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text('CLIENTE / CONTRATANTE:', 14, 40);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(client, 14, 46);

  if (phone) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(16, 185, 129); // Esmeralda
    doc.text(`WhatsApp: ${phone}`, 14, 49.5);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text('DATA DO SERVIÇO:', pageWidth - 14, 40, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text(formatDateBr(dateStr), pageWidth - 14, 46, { align: 'right' });

  // 4. TABELA DISCRIMINADA DO SERVIÇO
  autoTable(doc, {
    startY: 54,
    margin: { left: 10, right: 10 },
    theme: 'plain',
    head: [[
      'Equipamento',
      'Operador',
      'Horím. Inicial',
      'Horím. Final',
      'Horas',
      'Tarifa/h',
      'Total',
    ]],
    body: [[
      machine,
      operator,
      `${start}h`,
      `${end}h`,
      `${hours}h`,
      formatCurrency(rate),
      formatCurrency(total),
    ]],
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.5,
      cellPadding: 2.5,
    },
    bodyStyles: {
      fillColor: [255, 255, 255],
      textColor: [15, 23, 42],
      fontSize: 7.5,
      cellPadding: 3,
    },
    columnStyles: {
      0: { cellWidth: 32 },
      1: { cellWidth: 26 },
      2: { cellWidth: 15, halign: 'right' },
      3: { cellWidth: 15, halign: 'right' },
      4: { cellWidth: 12, halign: 'right', fontStyle: 'bold' },
      5: { cellWidth: 14, halign: 'right' },
      6: { cellWidth: 14, halign: 'right', fontStyle: 'bold' },
    },
  });

  const tableEndY = (doc as any).lastAutoTable?.finalY || 85;

  // 5. DESTAQUE DO VALOR TOTAL A ACERTAR
  const totalBoxY = tableEndY + 5;
  doc.setFillColor(254, 243, 199); // #FEF3C7
  doc.roundedRect(10, totalBoxY, pageWidth - 20, 15, 2, 2, 'F');
  doc.setDrawColor(245, 158, 11); // #F59E0B
  doc.roundedRect(10, totalBoxY, pageWidth - 20, 15, 2, 2, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(180, 83, 9); // #B45309
  doc.text('TOTAL DE HORAS:', 15, totalBoxY + 6);
  doc.text('VALOR TOTAL A ACERTAR:', 15, totalBoxY + 11.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`${hours} horas`, 45, totalBoxY + 6);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(formatCurrency(total), pageWidth - 15, totalBoxY + 10, { align: 'right' });

  // 6. OBSERVAÇÕES
  let currentY = totalBoxY + 20;
  if (obs) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text('OBSERVAÇÕES:', 10, currentY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    const splitObs = doc.splitTextToSize(obs, pageWidth - 20);
    doc.text(splitObs, 10, currentY + 4);
    currentY += 5 + splitObs.length * 3.5;
  }

  // 7. CAMPO DE ASSINATURA
  const signatureY = Math.max(currentY + 10, 160);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    'Atesto que o maquinário acima discriminado trabalhou no local e horímetro apurados.',
    10,
    signatureY - 4
  );

  doc.setDrawColor(148, 163, 184); // #94A3B8
  doc.setLineWidth(0.4);
  doc.line(15, signatureY + 12, pageWidth - 15, signatureY + 12);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text(client || 'Assinatura do Cliente / Responsável', pageWidth / 2, signatureY + 16, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Data do Aceite: _____ / _____ / _________', pageWidth / 2, signatureY + 20, { align: 'center' });

  // 8. RODAPÉ
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(148, 163, 184);
  doc.text('Documento gerado eletronicamente pelo sistema RETROSCAVE', pageWidth / 2, 203, { align: 'center' });

  // 9. DOWNLOAD
  const safeClient = client.replace(/[^a-zA-Z0-9]/g, '_');
  const safeDate = dateStr.replace(/[^a-zA-Z0-9]/g, '-');
  doc.save(`Comprovante_Servico_${safeClient}_${safeDate}.pdf`);
}
