import { useMemo, useState } from 'react';
import {
  Anchor,
  Crosshair,
  Database,
  Globe2,
  Layers,
  MapPin,
  Radar,
  Search,
  ShieldAlert,
  Siren,
  Waypoints,
} from 'lucide-react';
import type { ColorMode, LayerVisibility, Selection, SubnetData } from '../types';
import { COLOR_MODE_LABELS } from '../utils/colors';
import { fmtDateTime, flagEmoji } from '../utils/format';

interface ControlBarProps {
  data: SubnetData;
  colorMode: ColorMode;
  onColorModeChange: (mode: ColorMode) => void;
  layers: LayerVisibility;
  onLayersChange: (layers: LayerVisibility) => void;
  warMode: boolean;
  onToggleWarMode: () => void;
  onSelect: (selection: Selection) => void;
}

interface SearchItem {
  key: string;
  label: string;
  hint: string;
  selection: Exclude<Selection, null>;
}

const LAYER_DEFS: { key: keyof LayerVisibility; label: string; icon: typeof Layers }[] = [
  { key: 'background', label: 'Réseau mondial', icon: Waypoints },
  { key: 'landingPoints', label: 'Landing points', icon: MapPin },
  { key: 'chokepoints', label: 'Chokepoints', icon: Crosshair },
  { key: 'alerts', label: 'Alertes BGP', icon: ShieldAlert },
];

export default function ControlBar({
  data,
  colorMode,
  onColorModeChange,
  layers,
  onLayersChange,
  warMode,
  onToggleWarMode,
  onSelect,
}: ControlBarProps) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);

  const index = useMemo<SearchItem[]>(
    () => [
      ...data.cables.map((c) => ({
        key: `c:${c.id}`,
        label: c.name,
        hint: `Câble · ${c.ownerGroup}`,
        selection: { type: 'cable', id: c.id } as const,
      })),
      ...data.countries.map((c) => ({
        key: `p:${c.iso2}`,
        label: `${flagEmoji(c.iso2)} ${c.name}`,
        hint: `Pays · ${c.cableIds.length} câbles`,
        selection: { type: 'country', id: c.iso2 } as const,
      })),
      ...data.landingPoints.map((l) => ({
        key: `h:${l.id}`,
        label: l.fullName,
        hint: l.isCriticalHub ? 'Hub critique' : 'Landing point',
        selection: { type: 'hub', id: l.id } as const,
      })),
      ...data.chokepoints.map((c) => ({
        key: `k:${c.id}`,
        label: c.name,
        hint: `Chokepoint · risque ${c.risk}`,
        selection: { type: 'chokepoint', id: c.id } as const,
      })),
    ],
    [data],
  );

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return index.filter((i) => i.label.toLowerCase().includes(q)).slice(0, 8);
  }, [index, query]);

  const sources = Object.entries(data.meta.sources);

  return (
    <header className="pointer-events-auto relative z-30 shrink-0 px-3 pt-3">
      <div className="glass flex flex-wrap items-center gap-3 px-4 py-2.5">
        {/* Identité */}
        <div className="flex items-center gap-3 pr-2">
          <div className="relative grid h-9 w-9 place-items-center rounded-xl border border-cyan-400/40 bg-cyan-400/10">
            <Radar className="h-5 w-5 text-neon-cyan" />
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 animate-ping rounded-full bg-neon-red" />
          </div>
          <div className="leading-tight">
            <div className="hud-title text-lg">
              SubNet <span className="text-neon-cyan">3D</span>
            </div>
            <div className="hud-label hidden sm:block">Cyber &amp; Geopolitical Submarine Cable Radar</div>
          </div>
        </div>

        {/* Mode de coloration */}
        <div className="flex flex-wrap items-center gap-1 rounded-xl border border-cyan-400/15 bg-black/20 p-1">
          <Globe2 className="mx-1 h-3.5 w-3.5 text-cyan-300/60" />
          {(Object.keys(COLOR_MODE_LABELS) as ColorMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => onColorModeChange(mode)}
              className={`rounded-lg px-2.5 py-1 font-mono text-[11px] transition-colors ${
                colorMode === mode ? 'bg-cyan-400/20 text-cyan-50 shadow-neon' : 'text-cyan-200/60 hover:text-cyan-100'
              }`}
            >
              {COLOR_MODE_LABELS[mode]}
            </button>
          ))}
        </div>

        {/* Couches */}
        <div className="flex items-center gap-1">
          {LAYER_DEFS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              title={label}
              onClick={() => onLayersChange({ ...layers, [key]: !layers[key] })}
              className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 font-mono text-[11px] transition-colors ${
                layers[key]
                  ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-100'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden xl:inline">{label}</span>
            </button>
          ))}
        </div>

        {/* Recherche */}
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-cyan-300/50" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            placeholder="Câble, pays, hub, détroit…"
            className="w-full rounded-lg border border-cyan-400/20 bg-black/30 py-1.5 pl-8 pr-3 font-mono text-xs text-cyan-50 placeholder:text-slate-500 focus:border-cyan-400/60 focus:outline-none"
          />
          {focused && results.length > 0 && (
            <ul className="glass-strong absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden p-1">
              {results.map((r) => (
                <li key={r.key}>
                  <button
                    onMouseDown={() => {
                      onSelect(r.selection);
                      setQuery('');
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-left text-xs hover:bg-cyan-400/10"
                  >
                    <span className="truncate text-cyan-50">{r.label}</span>
                    <span className="shrink-0 font-mono text-[10px] text-cyan-300/60">{r.hint}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Fraîcheur des données */}
        <div className="hidden items-center gap-2 lg:flex" title={`Généré le ${fmtDateTime(data.meta.generatedAt)}`}>
          <Database className="h-3.5 w-3.5 text-cyan-300/60" />
          {sources.map(([name, s]) => (
            <span
              key={name}
              title={s.error ?? s.detail ?? ''}
              className={`chip ${
                s.status === 'ok'
                  ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
                  : 'border-amber-400/30 bg-amber-400/10 text-amber-200'
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${s.status === 'ok' ? 'bg-emerald-300' : 'bg-amber-300'}`} />
              {name}
            </span>
          ))}
        </div>

        {/* War Game */}
        <button
          onClick={onToggleWarMode}
          className={`btn ml-auto ${
            warMode
              ? 'border-red-400/70 bg-red-500/25 text-red-50 shadow-alert'
              : 'border-red-500/40 bg-red-500/10 text-red-200 hover:bg-red-500/20'
          }`}
        >
          {warMode ? <Siren className="h-4 w-4 animate-pulse" /> : <Anchor className="h-4 w-4" />}
          <span className="font-display text-sm uppercase tracking-wider">
            {warMode ? 'War Game actif' : 'Mode crise'}
          </span>
        </button>
      </div>
    </header>
  );
}
