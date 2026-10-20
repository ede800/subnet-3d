import type { CountryFeature, LandingPoint } from '../types';

export interface LatLng {
  lat: number;
  lng: number;
}

function ringArea(ring: number[][]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return Math.abs(a / 2);
}

function ringCentroid(ring: number[][]): LatLng {
  let lat = 0;
  let lng = 0;
  for (const [x, y] of ring) {
    lng += x;
    lat += y;
  }
  return { lat: lat / ring.length, lng: lng / ring.length };
}

/** Centroïde approximatif de chaque pays (plus grand polygone), complété par les landing points. */
export function computeCountryCentroids(features: CountryFeature[], landingPoints: LandingPoint[]): Map<string, LatLng> {
  const out = new Map<string, LatLng>();
  for (const f of features) {
    const polys =
      f.geometry.type === 'Polygon' ? [f.geometry.coordinates as number[][][]] : (f.geometry.coordinates as number[][][][]);
    let best: number[][] | null = null;
    let bestArea = -1;
    for (const poly of polys) {
      const area = ringArea(poly[0]);
      if (area > bestArea) {
        bestArea = area;
        best = poly[0];
      }
    }
    if (best && f.properties.iso2 !== '-99') out.set(f.properties.iso2, ringCentroid(best));
  }
  for (const lp of landingPoints) {
    if (!out.has(lp.country)) out.set(lp.country, { lat: lp.lat, lng: lp.lng });
  }
  return out;
}

/** Barycentre sphérique d'un ensemble de points. */
export function centerOf(points: LatLng[]): LatLng {
  if (!points.length) return { lat: 20, lng: 20 };
  let x = 0;
  let y = 0;
  let z = 0;
  for (const p of points) {
    const la = (p.lat * Math.PI) / 180;
    const lo = (p.lng * Math.PI) / 180;
    x += Math.cos(la) * Math.cos(lo);
    y += Math.cos(la) * Math.sin(lo);
    z += Math.sin(la);
  }
  return {
    lat: (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI,
    lng: (Math.atan2(y, x) * 180) / Math.PI,
  };
}

/** Fond étoilé procédural (évite toute dépendance à une texture externe). */
export function createStarfield(width = 1920, height = 1080): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const grad = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width * 0.7);
  grad.addColorStop(0, '#040a1c');
  grad.addColorStop(1, '#000005');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
  let seed = 42;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 1400; i++) {
    const x = rand() * width;
    const y = rand() * height;
    const r = rand() ** 8 * 1.3 + 0.25;
    const a = 0.15 + rand() * 0.7;
    const tint = rand();
    ctx.fillStyle =
      tint > 0.85 ? `rgba(160,220,255,${a})` : tint < 0.08 ? `rgba(255,190,220,${a})` : `rgba(255,255,255,${a})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return canvas.toDataURL('image/png');
}
