import type { Cable, CableStatus, ColorMode, OwnerGroup } from '../types';

export const OWNER_GROUP_COLORS: Record<OwnerGroup, string> = {
  Google: '#3d8bff',
  Meta: '#b45cff',
  Microsoft: '#00e5ff',
  Amazon: '#ff9f1c',
  'Chine (État)': '#ff3b5c',
  'Europe (Opérateurs)': '#00ffa3',
  'Consortium international': '#ff7ad9',
  Indépendant: '#9fb3c8',
};

export const STATUS_COLORS: Record<CableStatus | 'cut', string> = {
  operational: '#00ffa3',
  degraded: '#ffc400',
  planned: '#6b7c93',
  cut: '#ff1744',
};

export const STATUS_LABELS: Record<CableStatus | 'cut', string> = {
  operational: 'Opérationnel',
  degraded: 'Dégradé',
  planned: 'En construction',
  cut: 'Coupé (simulation)',
};

export const LOAD_COLORS = {
  absorbing: '#ffc400',
  stressed: '#ff9100',
  saturated: '#ff3d00',
} as const;

/** Interpolation linéaire entre deux couleurs hexadécimales. */
export function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const k = Math.max(0, Math.min(1, t));
  const r = Math.round(((pa >> 16) & 255) + (((pb >> 16) & 255) - ((pa >> 16) & 255)) * k);
  const g = Math.round(((pa >> 8) & 255) + (((pb >> 8) & 255) - ((pa >> 8) & 255)) * k);
  const bl = Math.round((pa & 255) + ((pb & 255) - (pa & 255)) * k);
  return `#${((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)}`;
}

export function withAlpha(hex: string, alpha: number): string {
  const p = parseInt(hex.slice(1), 16);
  return `rgba(${(p >> 16) & 255},${(p >> 8) & 255},${p & 255},${alpha})`;
}

/** Capacité : cyan (faible) -> magenta (très forte), échelle logarithmique 2 -> 400 Tbps. */
export function capacityColor(tbps: number): string {
  const t = (Math.log10(Math.max(tbps, 2)) - Math.log10(2)) / (Math.log10(400) - Math.log10(2));
  return t < 0.5 ? mix('#00e5ff', '#7c4dff', t * 2) : mix('#7c4dff', '#ff2bd6', (t - 0.5) * 2);
}

/** Risque géopolitique 0-100 : vert -> jaune -> rouge. */
export function riskColor(score: number): string {
  const t = score / 100;
  return t < 0.5 ? mix('#00ffa3', '#ffc400', t * 2) : mix('#ffc400', '#ff1744', (t - 0.5) * 2);
}

/** Perte de capacité d'un pays (0-100 %) pour la coloration des polygones. */
export function lossColor(pct: number): string {
  if (pct <= 0.5) return 'rgba(10, 30, 60, 0.55)';
  const t = Math.min(1, pct / 70);
  return withAlpha(t < 0.5 ? mix('#ffc400', '#ff9100', t * 2) : mix('#ff9100', '#ff1744', (t - 0.5) * 2), 0.22 + t * 0.38);
}

export function cableColor(cable: Cable, mode: ColorMode): string {
  switch (mode) {
    case 'consortium':
      return OWNER_GROUP_COLORS[cable.ownerGroup];
    case 'capacity':
      return capacityColor(cable.capacityTbps);
    case 'status':
      return STATUS_COLORS[cable.status];
    case 'risk':
      return riskColor(cable.riskScore);
  }
}

export const COLOR_MODE_LABELS: Record<ColorMode, string> = {
  consortium: 'Consortium / GAFAM',
  capacity: 'Capacité (Tbps)',
  status: 'Statut',
  risk: 'Risque géopolitique',
};
