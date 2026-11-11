/**
 * Utilitários centralizados de formatação e cálculo do sistema RETROSCAVE.
 */

/**
 * Formata data ISO (YYYY-MM-DD ou ISO completo) para o padrão brasileiro DD/MM/AAAA.
 */
export function formatDateBr(dateStr?: string | null): string {
  if (!dateStr) return '';
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
 * Retorna a data atual estritamente no fuso de Brasília (YYYY-MM-DD)
 */
export function getBrazilTodayDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * Retorna o timestamp ISO/formatado respeitando o offset local de Brasília
 */
export function getBrazilCurrentDateTime(now: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  return formatter.format(now);
}

/**
 * Converte qualquer Date ou timestamp para a string YYYY-MM-DD no fuso de Brasília
 */
export function toBrazilDateString(dateInput: string | Date | number): string {
  if (!dateInput) return '';
  if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
  }
  const date =
    typeof dateInput === 'string' && !dateInput.includes('T')
      ? new Date(`${dateInput}T12:00:00`)
      : new Date(dateInput);
  if (isNaN(date.getTime())) {
    return typeof dateInput === 'string' ? dateInput.slice(0, 10) : '';
  }
  return new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Converte um objeto Date para formato YYYY-MM-DD usando o fuso horário de Brasília (sem desvio UTC).
 */
export function formatDateISO(date?: Date): string {
  if (!date) {
    return getBrazilTodayDate();
  }
  return toBrazilDateString(date);
}

/**
 * Formata um horário (HH:mm, timestamp ISO ou objeto Date) para o padrão curto "HH:mm".
 * Quando chamado sem argumentos (`formatTimeHHMM()`), retorna a hora atual.
 */
export function formatTimeHHMM(
  val?: string | Date | null,
  fallbackIso?: string | null
): string {
  if (arguments.length === 0) {
    const now = new Date();
    return now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  const candidate = val || fallbackIso;
  if (!candidate) return '--:--';

  if (candidate instanceof Date) {
    if (isNaN(candidate.getTime())) return '--:--';
    return candidate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  const trimmed = String(candidate).trim();
  if (/^\d{2}:\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 5);
  }

  try {
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      return parsed.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }
  } catch {
    // fallback abaixo
  }

  if (fallbackIso && candidate !== fallbackIso) {
    return formatTimeHHMM(fallbackIso);
  }

  return '--:--';
}

/**
 * Formata valores numéricos em moeda Real Brasileiro (R$ 0,00).
 */
export function formatCurrencyBRL(
  value?: number | null,
  includeSymbol: boolean = true
): string {
  const numeric = typeof value === 'number' && !isNaN(value) ? value : 0;
  const formatted = numeric.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return includeSymbol ? `R$ ${formatted}` : formatted;
}

/**
 * Aplica máscara de telefone/WhatsApp brasileiro: (00) 00000-0000 ou (00) 0000-0000.
 */
export function applyPhoneMask(value?: string | null): string {
  if (!value) return '';
  const digits = String(value).replace(/\D/g, '').slice(0, 11);
  if (digits.length === 0) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}

/**
 * Calcula o total de horas trabalhadas com precisão de 1 casa decimal.
 */
export function calculateTotalHours(
  startHours?: number | string | null,
  endHours?: number | string | null
): number {
  const start = Number(startHours);
  const end = Number(endHours);
  if (isNaN(start) || isNaN(end)) return 0;
  const diff = end - start;
  return diff >= 0 ? Number(diff.toFixed(1)) : 0;
}

