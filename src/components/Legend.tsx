import type { ColorMode, OwnerGroup } from '../types';
import { COLOR_MODE_LABELS, LOAD_COLORS, OWNER_GROUP_COLORS, STATUS_COLORS, STATUS_LABELS, capacityColor, riskColor } from '../utils/colors';

interface LegendProps {
  colorMode: ColorMode;
  simActive: boolean;
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      <span className="h-1.5 w-4 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
      {label}
    </span>
  );
}

function Gradient({ from, mid, to, left, right }: { from: string; mid: string; to: string; left: string; right: string }) {
  return (
    <span className="flex items-center gap-2">
      <span>{left}</span>
      <span className="h-1.5 w-28 rounded-full" style={{ background: `linear-gradient(90deg, ${from}, ${mid}, ${to})` }} />
      <span>{right}</span>
    </span>
  );
}

export default function Legend({ colorMode, simActive }: LegendProps) {
  return (
    <div className="glass pointer-events-auto absolute bottom-3 left-1/2 z-10 hidden max-w-[min(860px,calc(100%-2rem))] -translate-x-1/2 flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2 font-mono text-[10px] text-slate-300 md:flex">
      <span className="hud-label">{COLOR_MODE_LABELS[colorMode]}</span>
      {colorMode === 'consortium' &&
        (Object.keys(OWNER_GROUP_COLORS) as OwnerGroup[]).map((g) => <Swatch key={g} color={OWNER_GROUP_COLORS[g]} label={g} />)}
      {colorMode === 'capacity' && (
        <Gradient from={capacityColor(2)} mid={capacityColor(28)} to={capacityColor(400)} left="2 Tbps" right="400 Tbps" />
      )}
      {colorMode === 'status' &&
        (['operational', 'degraded', 'planned'] as const).map((s) => <Swatch key={s} color={STATUS_COLORS[s]} label={STATUS_LABELS[s]} />)}
      {colorMode === 'risk' && <Gradient from={riskColor(0)} mid={riskColor(50)} to={riskColor(100)} left="Faible" right="Critique" />}
      {simActive && (
        <>
          <span className="h-3 w-px bg-white/15" />
          <Swatch color={STATUS_COLORS.cut} label="Coupé" />
          <Swatch color={LOAD_COLORS.absorbing} label="Absorbe le report" />
          <Swatch color={LOAD_COLORS.stressed} label="Sous tension" />
          <Swatch color={LOAD_COLORS.saturated} label="Saturé" />
        </>
      )}
      <span className="w-full text-[9px] text-slate-500">
        Câbles © TeleGeography Submarine Cable Map (CC BY-NC-SA 3.0) · RIPEstat · IODA (Georgia Tech) · Natural Earth ·
        capacités et impacts : estimations de modélisation
      </span>
    </div>
  );
}
