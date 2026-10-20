import { useState } from 'react';
import {
  Activity,
  Anchor,
  Bomb,
  Building2,
  DollarSign,
  Gauge,
  Globe2,
  Route,
  RotateCcw,
  Scissors,
  ShieldOff,
  Ship,
  Waves,
  X,
  Zap,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { CutState, LatencyResult, Scenario, Selection, SimulationResult, SubnetData } from '../types';
import { LOAD_COLORS, lossColor, riskColor } from '../utils/colors';
import { fmtDelta, fmtInt, fmtMs, fmtTbps, fmtUsdPerHour, flagEmoji } from '../utils/format';

interface CrisisSimulatorPanelProps {
  data: SubnetData;
  sim: SimulationResult;
  cut: CutState;
  pendingCables: string[];
  activeScenario: string | null;
  highlightedPair: LatencyResult | null;
  onApplyScenario: (scenario: Scenario) => void;
  onToggleChokepoint: (id: string) => void;
  onTogglePending: (cableId: string) => void;
  onCutPending: () => void;
  onRemoveCut: (kind: keyof CutState, id: string) => void;
  onReset: () => void;
  onHighlightPair: (pair: LatencyResult | null) => void;
  onSelect: (selection: Selection) => void;
  onClose: () => void;
}

const SCENARIO_ICONS: Record<string, typeof Ship> = {
  'red-sea-crisis': Ship,
  'taiwan-blockade': ShieldOff,
  'baltic-north-atlantic': Anchor,
  'marseille-blackout': Building2,
};

function Kpi({ icon: Icon, label, value, tone }: { icon: typeof Gauge; label: string; value: string; tone: string }) {
  return (
    <div className="rounded-xl border border-cyan-400/15 bg-black/25 p-2.5">
      <div className="hud-label flex items-center gap-1.5">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="mt-1 font-display text-xl font-bold" style={{ color: tone }}>
        {value}
      </div>
    </div>
  );
}

function ResilienceGauge({ score }: { score: number }) {
  const radius = 34;
  const circumference = Math.PI * radius;
  const color = riskColor(100 - score);
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 84 48" className="h-16 w-28">
        <path d="M8 44 A34 34 0 0 1 76 44" fill="none" stroke="rgba(0,229,255,0.12)" strokeWidth="7" strokeLinecap="round" />
        <path
          d="M8 44 A34 34 0 0 1 76 44"
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${(score / 100) * circumference} ${circumference}`}
          style={{ filter: `drop-shadow(0 0 6px ${color})`, transition: 'stroke-dasharray .6s ease' }}
        />
        <text x="42" y="42" textAnchor="middle" fontFamily="Rajdhani" fontWeight="700" fontSize="18" fill="#fff">
          {score}
        </text>
      </svg>
      <div className="hud-label -mt-1">Score de résilience</div>
    </div>
  );
}

export default function CrisisSimulatorPanel(props: CrisisSimulatorPanelProps) {
  const {
    data,
    sim,
    cut,
    pendingCables,
    activeScenario,
    highlightedPair,
    onApplyScenario,
    onToggleChokepoint,
    onTogglePending,
    onCutPending,
    onRemoveCut,
    onReset,
    onHighlightPair,
    onSelect,
    onClose,
  } = props;
  const [addCable, setAddCable] = useState('');

  const cableName = (id: string) => data.cables.find((c) => c.id === id)?.name ?? id;
  const hubName = (id: string) => data.landingPoints.find((l) => l.id === id)?.fullName ?? id;
  const cpName = (id: string) => data.chokepoints.find((c) => c.id === id)?.name ?? id;
  const hasCuts = cut.cables.length + cut.chokepoints.length + cut.hubs.length > 0;
  const impacted = sim.countryImpacts.filter((c) => c.lossPct >= 1 || c.latencyDeltaMs >= 10);

  const chartData = sim.latencies.map((l) => ({
    name: l.label.replace(' ↔ ', '↔'),
    'Avant': Math.round(l.baselineMs ?? 0),
    'Après': l.currentMs === null ? 0 : Math.round(l.currentMs),
  }));

  return (
    <aside className="glass-strong pointer-events-auto absolute bottom-3 left-3 top-3 z-20 flex w-[calc(100%-1.5rem)] flex-col overflow-hidden md:w-[380px]">
      <div className="flex items-center justify-between border-b border-red-500/25 bg-gradient-to-r from-red-500/15 to-transparent px-4 py-3">
        <div>
          <div className="hud-title flex items-center gap-2 text-base text-red-50">
            <Bomb className="h-4 w-4 text-neon-red" /> War Game
          </div>
          <div className="hud-label text-red-200/70">Simulateur de sabotage &amp; crise géopolitique</div>
        </div>
        <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white" aria-label="Fermer">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="scroll-thin flex-1 space-y-4 overflow-y-auto p-4">
        {/* Scénarios */}
        <section>
          <div className="hud-label mb-2">Scénarios géopolitiques · 1 clic</div>
          <div className="grid grid-cols-1 gap-2">
            {data.scenarios.map((s, i) => {
              const Icon = SCENARIO_ICONS[s.id] ?? Zap;
              const active = activeScenario === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => onApplyScenario(s)}
                  className={`group rounded-xl border p-2.5 text-left transition-colors ${
                    active ? 'border-red-400/70 bg-red-500/20' : 'border-cyan-400/15 bg-black/20 hover:border-red-400/40 hover:bg-red-500/10'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="grid h-6 w-6 place-items-center rounded-md bg-red-500/15 font-mono text-[11px] text-red-200">{i + 1}</span>
                    <Icon className="h-4 w-4 text-red-300" />
                    <span className="font-display text-sm font-semibold uppercase tracking-wide text-slate-100">{s.name}</span>
                  </div>
                  <p className="mt-1 text-[11px] leading-snug text-slate-400">{s.description}</p>
                </button>
              );
            })}
          </div>
        </section>

        {/* Détroits */}
        <section>
          <div className="hud-label mb-2">Blocage de détroits</div>
          <div className="flex flex-wrap gap-1.5">
            {data.chokepoints.map((cp) => {
              const on = cut.chokepoints.includes(cp.id);
              return (
                <button
                  key={cp.id}
                  onClick={() => onToggleChokepoint(cp.id)}
                  className={`chip transition-colors ${
                    on ? 'border-red-400/70 bg-red-500/25 text-red-50' : 'border-amber-400/25 bg-amber-400/5 text-amber-100 hover:bg-amber-400/15'
                  }`}
                >
                  <Waves className="h-3 w-3" />
                  {cp.name}
                </button>
              );
            })}
          </div>
        </section>

        {/* Sabotage manuel */}
        <section className="rounded-xl border border-cyan-400/15 bg-black/20 p-3">
          <div className="hud-label mb-1.5">Sabotage manuel</div>
          <p className="mb-2 text-[11px] text-slate-400">
            Cliquez un ou plusieurs câbles sur le globe (ou ajoutez-les ci-dessous), puis lancez la rupture.
          </p>
          <div className="mb-2 flex gap-2">
            <select
              value={addCable}
              onChange={(e) => {
                if (e.target.value) onTogglePending(e.target.value);
                setAddCable('');
              }}
              className="w-full rounded-lg border border-cyan-400/20 bg-[#040d20] px-2 py-1.5 font-mono text-xs text-cyan-50 focus:outline-none"
            >
              <option value="">+ Ajouter un câble…</option>
              {data.cables
                .filter((c) => !cut.cables.includes(c.id) && !pendingCables.includes(c.id))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </div>
          {pendingCables.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {pendingCables.map((id) => (
                <button key={id} onClick={() => onTogglePending(id)} className="chip border-white/40 bg-white/10 text-white">
                  {cableName(id)} <X className="h-3 w-3" />
                </button>
              ))}
            </div>
          )}
          <button onClick={onCutPending} disabled={!pendingCables.length} className="btn btn-danger w-full">
            <Scissors className="h-4 w-4" /> Simuler une rupture (Sabotage / Ancre)
          </button>
        </section>

        {/* Coupures actives */}
        {hasCuts && (
          <section>
            <div className="mb-2 flex items-center justify-between">
              <div className="hud-label">Coupures actives</div>
              <button onClick={onReset} className="btn btn-ghost py-1">
                <RotateCcw className="h-3 w-3" /> Réinitialiser
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {cut.chokepoints.map((id) => (
                <button key={`k${id}`} onClick={() => onRemoveCut('chokepoints', id)} className="chip border-red-400/50 bg-red-500/15 text-red-100">
                  <Waves className="h-3 w-3" /> {cpName(id)} <X className="h-3 w-3" />
                </button>
              ))}
              {cut.cables.map((id) => (
                <button key={`c${id}`} onClick={() => onRemoveCut('cables', id)} className="chip border-red-400/50 bg-red-500/15 text-red-100">
                  <Scissors className="h-3 w-3" /> {cableName(id)} <X className="h-3 w-3" />
                </button>
              ))}
              {cut.hubs.map((id) => (
                <button key={`h${id}`} onClick={() => onRemoveCut('hubs', id)} className="chip border-red-400/50 bg-red-500/15 text-red-100">
                  <Building2 className="h-3 w-3" /> {hubName(id)} <X className="h-3 w-3" />
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Résultats */}
        {!sim.isBaseline && (
          <>
            <section className="rounded-xl border border-red-500/25 bg-red-500/5 p-3">
              <div className="flex items-center gap-3">
                <ResilienceGauge score={sim.resilienceScore} />
                <div className="grid flex-1 grid-cols-1 gap-2">
                  <Kpi icon={DollarSign} label="Impact économique" value={fmtUsdPerHour(sim.economicImpactUsdMPerHour)} tone="#ff9100" />
                </div>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <Kpi icon={Zap} label="Câbles touchés" value={`${sim.affectedCableIds.length}`} tone="#ff1744" />
                <Kpi icon={Activity} label="Capacité" value={fmtTbps(sim.capacityAffectedTbps)} tone="#ff3d00" />
                <Kpi icon={Globe2} label="Pays" value={`${impacted.length}`} tone="#ffc400" />
              </div>
              {sim.unservedDemandPct > 0.05 && (
                <p className="mt-2 font-mono text-[11px] text-red-200">
                  ⚠ {sim.unservedDemandPct.toFixed(1)} % du trafic inter-métropoles ne trouve plus aucune route.
                </p>
              )}
            </section>

            <section>
              <div className="hud-label mb-2 flex items-center gap-1.5">
                <Route className="h-3 w-3" /> Latence entre grandes régions (RTT)
              </div>
              <div className="h-56 rounded-xl border border-cyan-400/10 bg-black/20 p-1">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} layout="vertical" margin={{ left: 4, right: 8, top: 4, bottom: 0 }} barGap={1}>
                    <CartesianGrid stroke="rgba(0,229,255,0.07)" horizontal={false} />
                    <XAxis type="number" tick={{ fill: '#7dd3fc', fontSize: 9 }} unit=" ms" />
                    <YAxis type="category" dataKey="name" width={118} tick={{ fill: '#cbd5e1', fontSize: 9 }} />
                    <Tooltip
                      contentStyle={{ background: '#040d20', border: '1px solid rgba(0,229,255,.3)', borderRadius: 8, fontSize: 11 }}
                      cursor={{ fill: 'rgba(0,229,255,0.05)' }}
                    />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Bar dataKey="Avant" fill="#00e5ff" radius={[0, 3, 3, 0]} barSize={6} />
                    <Bar dataKey="Après" fill="#ff3d00" radius={[0, 3, 3, 0]} barSize={6} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <table className="mt-2 w-full font-mono text-[11px]">
                <tbody>
                  {sim.latencies.map((l) => {
                    const hot = l.deltaMs === null || l.deltaMs > 15;
                    const selected = highlightedPair?.from === l.from && highlightedPair?.to === l.to;
                    return (
                      <tr
                        key={`${l.from}-${l.to}`}
                        onClick={() => onHighlightPair(selected ? null : l)}
                        className={`cursor-pointer border-b border-white/5 ${selected ? 'bg-emerald-400/10' : 'hover:bg-white/5'}`}
                        title="Afficher la route empruntée sur le globe"
                      >
                        <td className="py-1 text-slate-300">{l.label}</td>
                        <td className="py-1 text-right text-slate-500">{fmtMs(l.baselineMs)}</td>
                        <td className="py-1 text-right text-slate-200">{fmtMs(l.currentMs)}</td>
                        <td className={`py-1 text-right ${hot ? 'text-red-300' : 'text-emerald-300'}`}>{fmtDelta(l.deltaMs)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>

            <section>
              <div className="hud-label mb-2">Pays impactés (capacité internationale perdue)</div>
              <ul className="space-y-1">
                {impacted.slice(0, 14).map((c) => (
                  <li key={c.iso2}>
                    <button onClick={() => onSelect({ type: 'country', id: c.iso2 })} className="w-full rounded-lg px-1.5 py-1 text-left hover:bg-white/5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="truncate text-slate-200">
                          {flagEmoji(c.iso2)} {c.name}
                          {c.isolated && <span className="ml-1.5 font-mono text-[10px] text-red-300">ISOLÉ</span>}
                        </span>
                        <span className="shrink-0 font-mono text-[11px] text-slate-400">
                          {c.lossPct.toFixed(0)} % · {fmtDelta(c.latencyDeltaMs)}
                        </span>
                      </div>
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/5">
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, c.lossPct)}%`, background: lossColor(Math.max(c.lossPct, 5)) }} />
                      </div>
                    </button>
                  </li>
                ))}
                {impacted.length === 0 && <li className="text-xs text-slate-500">Aucun pays significativement impacté.</li>}
              </ul>
            </section>

            <section>
              <div className="hud-label mb-2">Câbles de reroutage sous tension</div>
              <ul className="space-y-1">
                {sim.reroutedCableIds.slice(0, 10).map((id) => {
                  const loads = data.edges
                    .filter((e) => e.cableId === id)
                    .map((e) => sim.edgeLoads.get(e.id))
                    .filter((x): x is NonNullable<typeof x> => !!x && x.level !== 'normal');
                  const peak = loads.reduce((m, l) => (l.util > m.util ? l : m), loads[0]);
                  if (!peak) return null;
                  const color = LOAD_COLORS[peak.level as keyof typeof LOAD_COLORS];
                  return (
                    <li key={id}>
                      <button onClick={() => onSelect({ type: 'cable', id })} className="flex w-full items-center justify-between rounded-lg px-1.5 py-1 text-left text-xs hover:bg-white/5">
                        <span className="text-slate-200">{cableName(id)}</span>
                        <span className="font-mono text-[11px]" style={{ color }}>
                          {fmtInt(peak.baselineUtil * 100)} % → {fmtInt(peak.util * 100)} %
                        </span>
                      </button>
                    </li>
                  );
                })}
                {sim.reroutedCableIds.length === 0 && <li className="text-xs text-slate-500">Le trafic est absorbé sans surcharge notable.</li>}
              </ul>
            </section>

            <p className="font-mono text-[10px] leading-relaxed text-slate-500">{data.meta.disclaimer}</p>
          </>
        )}
      </div>
    </aside>
  );
}
