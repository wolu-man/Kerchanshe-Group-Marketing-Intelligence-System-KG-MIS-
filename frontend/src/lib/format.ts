export function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  return new Intl.NumberFormat('en-ET', { maximumFractionDigits: 0 }).format(Number(n));
}

export function fmtDate(s: string | null | undefined): string {
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function fmtDateTime(s: string | null | undefined): string {
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString('en-GB', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function fmtPct(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  return `${Number(n).toFixed(digits)}%`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase();
}

export function jsonOrNull(s: string | null | undefined): unknown {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/** Display labels for the five opportunity types (backend OPPORTUNITY_TYPES). */
export const OPPORTUNITY_TYPE_LABELS: Record<string, string> = {
  TENDER: 'Tender',
  RFQ: 'RFQ',
  BUYER_LEAD: 'Buyer Lead',
  TRADE_INTELLIGENCE: 'Trade Intel',
  MARKET_SIGNAL: 'Market Signal',
};

export function opportunityTypeLabel(type: string | null | undefined): string {
  if (!type) return 'Tender';
  return OPPORTUNITY_TYPE_LABELS[type] ?? type;
}
