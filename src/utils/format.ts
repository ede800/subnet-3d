export const fmtInt = (n: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n);

export const fmt1 = (n: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(n);

export function fmtTbps(n: number): string {
  return n >= 1000 ? `${fmt1(n / 1000)} Pbps` : `${fmt1(n)} Tbps`;
}

export function fmtUsdPerHour(millions: number): string {
  if (millions >= 1000) return `${fmt1(millions / 1000)} Md$ / h`;
  if (millions >= 1) return `${fmt1(millions)} M$ / h`;
  return `${fmtInt(millions * 1000)} k$ / h`;
}

export function fmtMs(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return '∞';
  return `${fmtInt(ms)} ms`;
}

export function fmtDelta(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return 'coupé';
  const sign = ms >= 0 ? '+' : '−';
  return `${sign}${fmtInt(Math.abs(ms))} ms`;
}

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : `${d.toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC`;
}

export function flagEmoji(iso2: string): string {
  if (!/^[A-Z]{2}$/.test(iso2)) return '🏳️';
  return String.fromCodePoint(...[...iso2].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}
