import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Activity,
  AlertTriangle,
  Building2,
  Cable as CableIcon,
  ExternalLink,
  FileText,
  Flag,
  Landmark,
  MapPin,
  Radio,
  Scissors,
  ShieldHalf,
  Waves,
  X,
} from 'lucide-react';
import { Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type {
  Cable,
  Chokepoint,
  CountryProfile,
  CutState,
  LandingPoint,
  OwnerGroup,
  Selection,
  SimulationResult,
  SubnetData,
} from '../types';
import { OWNER_GROUP_COLORS, STATUS_COLORS, STATUS_LABELS, riskColor } from '../utils/colors';
import { fmtDate, fmtDelta, fmtInt, fmtMs, fmtTbps, fmtUsdPerHour, flagEmoji } from '../utils/format';
import type { SimulationEngine } from '../utils/simulationEngine';

type Tab = 'tech' | 'geo' | 'telemetry';

interface InspectorSidebarProps {
  data: SubnetData;
  engine: SimulationEngine;
  sim: SimulationResult;
  cut: CutState;
  selection: Exclude<Selection, null>;
  onClose: () => void;
  onSelect: (selection: Selection) => void;
  onCutCable: (cableId: string) => void;
  onBlackoutHub: (hubId: string) => void;
  onToggleChokepoint: (id: string) => void;
}

const TABS: { id: Tab; label: string; icon: typeof FileText }[] = [
  { id: 'tech', label: 'Fiche technique', icon: FileText },
  { id: 'geo', label: 'Souveraineté', icon: ShieldHalf },
  { id: 'telemetry', label: 'Télémétrie', icon: Activity },
];

const CHART_TOOLTIP = {
  contentStyle: { background: '#040d20', border: '1px solid rgba(0,229,255,.3)', borderRadius: 8, fontSize: 11 },
};

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/5 py-1.5 text-xs">
      <span className="shrink-0 text-slate-400">{label}</span>
      <span className="text-right font-mono text-slate-100">{children}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1.5">
      <div className="hud-label">{title}</div>
      {children}
    </section>
  );
}

function RiskBar({ score }: { score: number }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400">Risque géopolitique</span>
        <span className="font-display text-lg font-bold" style={{ color: riskColor(score) }}>
          {score}/100
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/5">
        <div className="h-full rounded-full" style={{ width: `${score}%`, background: riskColor(score), boxShadow: `0 0 10px ${riskColor(score)}` }} />
      </div>
    </div>
  );
}

function SharePie({ data }: { data: { name: string; value: number; color: string }[] }) {
  const filtered = data.filter((d) => d.value > 0);
  return (
    <div className="flex items-center gap-3">
      <div className="h-28 w-28 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={filtered} dataKey="value" nameKey="name" innerRadius={30} outerRadius={50} paddingAngle={2} stroke="none">
              {filtered.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
            <Tooltip {...CHART_TOOLTIP} formatter={(v: number) => `${fmtInt(v)} %`} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="space-y-1 text-[11px]">
        {filtered.map((d) => (
          <li key={d.name} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
            <span className="text-slate-300">{d.name}</span>
            <span className="font-mono text-slate-500">{fmtInt(d.value)} %</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ownerGroupBreakdown(cables: Cable[]) {
  const total = cables.reduce((s, c) => s + c.capacityTbps, 0) || 1;
  const byGroup = new Map<OwnerGroup, number>();
  for (const c of cables) byGroup.set(c.ownerGroup, (byGroup.get(c.ownerGroup) ?? 0) + c.capacityTbps);
  return [...byGroup.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, v]) => ({ name, value: (v / total) * 100, color: OWNER_GROUP_COLORS[name] }));
}

function CableLink({ cable, onSelect, extra }: { cable: Cable; onSelect: (s: Selection) => void; extra?: ReactNode }) {
  return (
    <button
      onClick={() => onSelect({ type: 'cable', id: cable.id })}
      className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1 text-left text-xs hover:bg-white/5"
    >
      <span className="flex items-center gap-2 truncate">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: OWNER_GROUP_COLORS[cable.ownerGroup] }} />
        <span className="truncate text-slate-200">{cable.name}</span>
      </span>
      <span className="shrink-0 font-mono text-[10px] text-slate-500">{extra ?? fmtTbps(cable.capacityTbps)}</span>
    </button>
  );
}

export default function InspectorSidebar(props: InspectorSidebarProps) {
  const { data, engine, sim, cut, selection, onClose, onSelect, onCutCable, onBlackoutHub, onToggleChokepoint } = props;
  const [tab, setTab] = useState<Tab>('tech');

  useEffect(() => setTab('tech'), [selection.type, selection.id]);

  const cableById = useMemo(() => new Map(data.cables.map((c) => [c.id, c])), [data]);
  const lpById = useMemo(() => new Map(data.landingPoints.map((l) => [l.id, l])), [data]);
  const countryByIso = useMemo(() => new Map(data.countries.map((c) => [c.iso2, c])), [data]);

  let title = '';
  let subtitle = '';
  let Icon = CableIcon;
  let body: ReactNode = null;

  // -------------------------------------------------------------------------
  // CÂBLE
  // -------------------------------------------------------------------------
  if (selection.type === 'cable') {
    const cable = cableById.get(selection.id);
    if (!cable) return null;
    const isCut = cut.cables.includes(cable.id);
    const affected = sim.affectedCableIds.includes(cable.id);
    const edges = data.edges.filter((e) => e.cableId === cable.id);
    const loads = edges.map((e) => sim.edgeLoads.get(e.id)).filter((x): x is NonNullable<typeof x> => !!x);
    const peakNow = Math.max(0, ...loads.map((l) => l.util));
    const peakBase = Math.max(0, ...loads.map((l) => l.baselineUtil));
    const status = affected ? 'cut' : cable.status;
    const s = cable.sovereignty;
    const relatedAlerts = data.alerts.filter((a) => cable.countries.includes(a.iso2));
    title = cable.name;
    subtitle = `${cable.ownerGroup} · RFS ${cable.rfs || '—'}`;
    Icon = CableIcon;

    body =
      tab === 'tech' ? (
        <>
          <Section title="Caractéristiques">
            <Row label="Longueur">{fmtInt(cable.lengthKm)} km</Row>
            <Row label="Mise en service (RFS)">{cable.rfs || '—'}{cable.isPlanned ? ' (prévu)' : ''}</Row>
            <Row label="Capacité nominale">{fmtTbps(cable.capacityTbps)}</Row>
            <Row label="Paires de fibres">{cable.fiberPairs}</Row>
            <Row label="Profondeur moyenne">{fmtInt(cable.avgDepthM)} m</Row>
            <Row label="Segments modélisés">{edges.length}</Row>
          </Section>
          <Section title="Propriétaires / consortium">
            <div className="flex flex-wrap gap-1">
              {cable.owners.map((o) => (
                <span key={o} className="chip border-cyan-400/20 bg-cyan-400/5 text-cyan-100">{o}</span>
              ))}
            </div>
          </Section>
          <Section title="Constructeur(s)">
            <div className="flex flex-wrap gap-1">
              {(cable.suppliers.length ? cable.suppliers : ['Non communiqué']).map((o) => (
                <span key={o} className="chip border-violet-400/25 bg-violet-400/5 text-violet-100">{o}</span>
              ))}
            </div>
          </Section>
          <Section title={`Pays connectés (${cable.countries.length})`}>
            <div className="flex flex-wrap gap-1">
              {cable.countries.map((iso) => (
                <button key={iso} onClick={() => onSelect({ type: 'country', id: iso })} className="chip border-white/10 bg-white/5 text-slate-200 hover:border-cyan-400/40">
                  {flagEmoji(iso)} {countryByIso.get(iso)?.name ?? iso}
                </button>
              ))}
            </div>
          </Section>
          <Section title={`Landing points (${cable.landingPointIds.length})`}>
            <ul className="scroll-thin max-h-40 overflow-y-auto">
              {cable.landingPointIds.map((id) => {
                const lp = lpById.get(id);
                if (!lp) return null;
                return (
                  <li key={id}>
                    <button onClick={() => onSelect({ type: 'hub', id })} className="flex w-full items-center gap-2 rounded px-1.5 py-0.5 text-left text-xs text-slate-300 hover:bg-white/5">
                      <MapPin className={`h-3 w-3 ${lp.isCriticalHub ? 'text-white' : 'text-cyan-400/60'}`} />
                      {lp.fullName}
                    </button>
                  </li>
                );
              })}
            </ul>
          </Section>
          {cable.url && (
            <a href={cable.url} target="_blank" rel="noreferrer" className="btn btn-ghost w-full">
              <ExternalLink className="h-3.5 w-3.5" /> Site de l'opérateur
            </a>
          )}
        </>
      ) : tab === 'geo' ? (
        <>
          <RiskBar score={cable.riskScore} />
          <Section title="Contrôle du capital (part des propriétaires)">
            <SharePie
              data={[
                { name: 'GAFAM', value: s.gafamShare * 100, color: '#3d8bff' },
                { name: 'Chine (État / liés)', value: s.chinaShare * 100, color: '#ff3b5c' },
                { name: 'Opérateurs européens', value: s.europeShare * 100, color: '#00ffa3' },
                { name: 'Autres', value: Math.max(0, 100 - (s.gafamShare + s.chinaShare + s.europeShare) * 100), color: '#64748b' },
              ]}
            />
          </Section>
          <Section title="Analyse">
            <p className="text-xs leading-relaxed text-slate-300">{s.note}</p>
          </Section>
          <Section title="Exposition maritime">
            <Row label="Origine des constructeurs">{s.supplierOrigin.length ? s.supplierOrigin.join(', ') : '—'}</Row>
            <Row label="Profondeur moyenne">{fmtInt(cable.avgDepthM)} m</Row>
            <Row label="Risque d'ancrage / chalutage">
              {cable.avgDepthM < 200 ? 'Très élevé' : cable.chokepoints.length >= 2 ? 'Élevé' : cable.chokepoints.length ? 'Modéré' : 'Faible'}
            </Row>
          </Section>
          <Section title="Chokepoints traversés">
            {cable.chokepoints.length ? (
              <div className="flex flex-wrap gap-1">
                {cable.chokepoints.map((id) => (
                  <button key={id} onClick={() => onSelect({ type: 'chokepoint', id })} className="chip border-amber-400/40 bg-amber-400/10 text-amber-100">
                    <Waves className="h-3 w-3" /> {data.chokepoints.find((c) => c.id === id)?.name}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500">Aucun détroit à haut risque sur le tracé.</p>
            )}
          </Section>
        </>
      ) : (
        <>
          <Section title="Santé réseau">
            <Row label="Statut">
              <span style={{ color: STATUS_COLORS[status] }}>● {STATUS_LABELS[status]}</span>
            </Row>
            <Row label="Latence bout en bout (RTT modélisé)">{fmtMs(engine.cableLatencyMs(cable.id))}</Row>
            <Row label="Charge max. (normal)">{fmtInt(peakBase * 100)} %</Row>
            {!sim.isBaseline && <Row label="Charge max. (simulation)">{affected ? 'Hors service' : `${fmtInt(peakNow * 100)} %`}</Row>}
          </Section>
          <Section title="Alertes BGP / IODA sur les pays desservis">
            {relatedAlerts.length ? (
              <ul className="space-y-1">
                {relatedAlerts.map((a) => (
                  <li key={a.id} className="rounded-lg border border-red-500/25 bg-red-500/5 px-2 py-1 text-[11px] text-red-100">
                    {flagEmoji(a.iso2)} <b>{a.countryName}</b> · {a.source} — {a.title}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-emerald-300/80">Aucune anomalie détectée dans les dernières 48 h.</p>
            )}
          </Section>
          <Section title="Historique des incidents connus">
            {cable.incidents.length ? (
              <ul className="space-y-1.5">
                {[...cable.incidents].reverse().map((i) => (
                  <li key={i.date + i.title} className="border-l-2 border-amber-400/50 pl-2 text-xs">
                    <div className="font-mono text-[10px] text-amber-300">{fmtDate(i.date)}</div>
                    <div className="text-slate-300">{i.title}</div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-500">Aucun incident majeur public recensé.</p>
            )}
          </Section>
          <button onClick={() => onCutCable(cable.id)} disabled={isCut} className="btn btn-danger w-full py-2">
            <Scissors className="h-4 w-4" /> {isCut ? 'Câble déjà coupé dans le simulateur' : 'Couper ce câble dans le simulateur'}
          </button>
        </>
      );
  }

  // -------------------------------------------------------------------------
  // HUB / LANDING POINT
  // -------------------------------------------------------------------------
  if (selection.type === 'hub') {
    const lp = lpById.get(selection.id) as LandingPoint | undefined;
    if (!lp) return null;
    const cables = lp.cableIds.map((id) => cableById.get(id)).filter((c): c is Cable => !!c);
    const country = countryByIso.get(lp.country);
    const blacked = cut.hubs.includes(lp.id);
    title = lp.name;
    subtitle = `${flagEmoji(lp.country)} ${country?.name ?? lp.country} · ${lp.isCriticalHub ? 'Hub critique' : 'Landing station'}`;
    Icon = Building2;
    const totalCap = cables.reduce((s, c) => s + c.capacityTbps, 0);

    body =
      tab === 'tech' ? (
        <>
          <Section title="Station d'atterrissement">
            <Row label="Localisation">{lp.fullName}</Row>
            <Row label="Coordonnées">{lp.lat.toFixed(2)}°, {lp.lng.toFixed(2)}°</Row>
            <Row label="Câbles stratégiques">{cables.length}</Row>
            <Row label="Capacité cumulée">{fmtTbps(totalCap)}</Row>
          </Section>
          <Section title="Câbles atterrissant ici">
            {cables.map((c) => (
              <CableLink key={c.id} cable={c} onSelect={onSelect} />
            ))}
          </Section>
        </>
      ) : tab === 'geo' ? (
        <>
          <Section title="Contrôle de la capacité atterrissant ici">
            <SharePie data={ownerGroupBreakdown(cables)} />
          </Section>
          <Section title="Exposition">
            <Row label="Chokepoints en amont">
              {[...new Set(cables.flatMap((c) => c.chokepoints))].map((id) => data.chokepoints.find((c) => c.id === id)?.name).join(', ') || '—'}
            </Row>
            <Row label="Risque moyen des câbles">
              {fmtInt(cables.reduce((s, c) => s + c.riskScore, 0) / Math.max(cables.length, 1))}/100
            </Row>
          </Section>
          <p className="text-xs leading-relaxed text-slate-400">
            {lp.isCriticalHub
              ? "Point de concentration : la défaillance de ce site (sabotage, panne électrique, catastrophe naturelle) affecte simultanément plusieurs systèmes intercontinentaux."
              : 'Station secondaire : son isolement a un impact essentiellement local.'}
          </p>
        </>
      ) : (
        <>
          <Section title="Routage du pays hôte (RIPEstat)">
            {country?.routing ? (
              <>
                <Row label="Préfixes IPv4 annoncés">{fmtInt(country.routing.v4Prefixes)}</Row>
                <Row label="Préfixes IPv6 annoncés">{fmtInt(country.routing.v6Prefixes)}</Row>
                <Row label="ASN visibles">{fmtInt(country.routing.asns)}</Row>
                <Row label="Variation 30 j">{country.routing.deltaPct.toFixed(2)} %</Row>
              </>
            ) : (
              <p className="text-xs text-slate-500">Pas de télémétrie disponible.</p>
            )}
          </Section>
          <button onClick={() => onBlackoutHub(lp.id)} disabled={blacked} className="btn btn-danger w-full py-2">
            <Scissors className="h-4 w-4" /> {blacked ? 'Hub déjà en blackout' : 'Blackout de ce hub dans le simulateur'}
          </button>
        </>
      );
  }

  // -------------------------------------------------------------------------
  // PAYS
  // -------------------------------------------------------------------------
  if (selection.type === 'country') {
    const country = countryByIso.get(selection.id) as CountryProfile | undefined;
    if (!country) return null;
    const cables = country.cableIds.map((id) => cableById.get(id)).filter((c): c is Cable => !!c);
    const impact = sim.isBaseline ? null : sim.countryImpactByIso.get(country.iso2);
    const alerts = data.alerts.filter((a) => a.iso2 === country.iso2);
    title = `${flagEmoji(country.iso2)} ${country.name}`;
    subtitle = `${country.continentLabel} · ${cables.length} câbles stratégiques`;
    Icon = Flag;
    const chokepointExposure = data.chokepoints
      .map((cp) => ({ cp, cap: cables.filter((c) => c.chokepoints.includes(cp.id)).reduce((s, c) => s + c.capacityTbps, 0) }))
      .filter((x) => x.cap > 0);

    body =
      tab === 'tech' ? (
        <>
          <Section title="Profil de connectivité">
            <Row label="Capacité sous-marine stratégique">{fmtTbps(country.internationalCapacityTbps)}</Row>
            <Row label="Landing points">{country.landingPointIds.length}</Row>
            <Row label="PIB">{fmtInt(country.gdpUsdBn)} Md$</Row>
            <Row label="Part de l'économie numérique">{fmtInt(country.digitalShare * 100)} %</Row>
          </Section>
          <Section title="Câbles">
            {cables.map((c) => (
              <CableLink key={c.id} cable={c} onSelect={onSelect} />
            ))}
          </Section>
        </>
      ) : tab === 'geo' ? (
        <>
          <Section title="Dépendance par groupe de contrôle (capacité)">
            <SharePie data={ownerGroupBreakdown(cables)} />
          </Section>
          <Section title="Exposition aux chokepoints">
            {chokepointExposure.length ? (
              chokepointExposure.map(({ cp, cap }) => (
                <Row key={cp.id} label={cp.name}>
                  {fmtInt((cap / Math.max(country.internationalCapacityTbps, 1)) * 100)} % de la capacité
                </Row>
              ))
            ) : (
              <p className="text-xs text-slate-500">Aucune dépendance directe aux détroits à haut risque.</p>
            )}
          </Section>
          <Section title="Diversité">
            <Row label="Câbles stratégiques">{cables.length}</Row>
            <Row label="Groupes de contrôle distincts">{new Set(cables.map((c) => c.ownerGroup)).size}</Row>
            <Row label="Niveau">
              {cables.length >= 6 ? 'Résilient' : cables.length >= 3 ? 'Modéré' : 'Fragile (point unique de défaillance)'}
            </Row>
          </Section>
        </>
      ) : (
        <>
          {impact && (
            <Section title="Impact de la simulation en cours">
              <Row label="Capacité perdue">
                <span className="text-red-300">{impact.lossPct.toFixed(1)} % ({fmtTbps(impact.lostTbps)})</span>
              </Row>
              <Row label="Latence vers les grands hubs">{fmtDelta(impact.latencyDeltaMs)}</Row>
              <Row label="Impact économique estimé">{fmtUsdPerHour(impact.economicUsdMPerHour)}</Row>
              {impact.isolated && <Row label="Statut"><span className="text-red-300">ISOLÉ</span></Row>}
            </Section>
          )}
          <Section title="Routage BGP (RIPEstat, 30 jours)">
            {country.routing ? (
              <>
                <div className="h-28 rounded-lg border border-cyan-400/10 bg-black/20 p-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={country.routing.history} margin={{ left: 0, right: 6, top: 6, bottom: 0 }}>
                      <XAxis dataKey="date" hide />
                      <YAxis domain={['auto', 'auto']} width={44} tick={{ fill: '#7dd3fc', fontSize: 9 }} />
                      <Tooltip {...CHART_TOOLTIP} />
                      <Line type="monotone" dataKey="v4" name="Préfixes IPv4" stroke="#00e5ff" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <Row label="Préfixes IPv4 / IPv6">
                  {fmtInt(country.routing.v4Prefixes)} / {fmtInt(country.routing.v6Prefixes)}
                </Row>
                <Row label="ASN visibles">{fmtInt(country.routing.asns)}</Row>
                <Row label="Variation vs médiane 30 j">
                  <span className={country.routing.status === 'normal' ? 'text-emerald-300' : 'text-red-300'}>
                    {country.routing.deltaPct > 0 ? '+' : ''}
                    {country.routing.deltaPct.toFixed(2)} %
                  </span>
                </Row>
              </>
            ) : (
              <p className="text-xs text-slate-500">Pas de télémétrie RIPEstat disponible.</p>
            )}
          </Section>
          <Section title="Pannes Internet (IODA, 48 h)">
            {country.outage ? (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-100">
                <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
                Événement détecté ({country.outage.datasources.join(', ')}) depuis le {fmtDate(country.outage.start)} — score {fmtInt(country.outage.score)}
              </div>
            ) : (
              <p className="text-xs text-emerald-300/80">Aucune panne signalée par IODA.</p>
            )}
            {alerts.map((a) => (
              <div key={a.id} className="font-mono text-[11px] text-red-200">
                <Radio className="mr-1 inline h-3 w-3" /> {a.source} · {a.title}
              </div>
            ))}
          </Section>
        </>
      );
  }

  // -------------------------------------------------------------------------
  // CHOKEPOINT
  // -------------------------------------------------------------------------
  if (selection.type === 'chokepoint') {
    const cp = data.chokepoints.find((c) => c.id === selection.id) as Chokepoint | undefined;
    if (!cp) return null;
    const blocked = cut.chokepoints.includes(cp.id);
    const cables = cp.cableIds.map((id) => cableById.get(id)).filter((c): c is Cable => !!c);
    title = cp.name;
    subtitle = `Zone d'étranglement · risque ${cp.risk}/100`;
    Icon = Waves;

    body =
      tab === 'tech' ? (
        <>
          <Section title="Description">
            <p className="text-xs leading-relaxed text-slate-300">{cp.description}</p>
          </Section>
          <Section title="Exposition">
            <Row label="Câbles stratégiques traversant">{cables.length}</Row>
            <Row label="Capacité exposée">{fmtTbps(cp.capacityAtRiskTbps)}</Row>
            <Row label="Zones surveillées">{cp.zones.length}</Row>
          </Section>
          <Section title="Câbles exposés">
            {cables.map((c) => (
              <CableLink key={c.id} cable={c} onSelect={onSelect} />
            ))}
          </Section>
        </>
      ) : tab === 'geo' ? (
        <>
          <RiskBar score={cp.risk} />
          <Section title="Menace">
            <p className="text-xs leading-relaxed text-slate-300">{cp.threat}</p>
          </Section>
          <Section title="Qui contrôle la capacité exposée ?">
            <SharePie data={ownerGroupBreakdown(cables)} />
          </Section>
        </>
      ) : (
        <>
          <Section title="Surveillance">
            <Row label="Statut simulateur">
              <span className={blocked ? 'text-red-300' : 'text-emerald-300'}>{blocked ? 'BLOQUÉ' : 'Ouvert'}</span>
            </Row>
            <Row label="Alertes pays riverains">
              {data.alerts.filter((a) => cables.some((c) => c.countries.includes(a.iso2))).length}
            </Row>
          </Section>
          <button onClick={() => onToggleChokepoint(cp.id)} className={`btn w-full py-2 ${blocked ? 'btn-ghost' : 'btn-danger'}`}>
            <Landmark className="h-4 w-4" /> {blocked ? 'Lever le blocus' : 'Bloquer ce détroit dans le simulateur'}
          </button>
        </>
      );
  }

  return (
    <aside className="glass-strong pointer-events-auto absolute bottom-3 right-3 top-3 z-20 flex w-[calc(100%-1.5rem)] flex-col overflow-hidden md:w-[400px]">
      <div className="flex items-start justify-between gap-3 border-b border-cyan-400/15 px-4 py-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-cyan-400/30 bg-cyan-400/10">
            <Icon className="h-4 w-4 text-neon-cyan" />
          </div>
          <div className="min-w-0">
            <div className="hud-title truncate text-base">{title}</div>
            <div className="truncate text-[11px] text-slate-400">{subtitle}</div>
          </div>
        </div>
        <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white" aria-label="Fermer">
          <X className="h-4 w-4" />
        </button>
      </div>
      <nav className="flex border-b border-cyan-400/10 px-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 px-2 py-2 font-mono text-[11px] transition-colors ${
              tab === t.id ? 'border-neon-cyan text-cyan-50' : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </nav>
      <div className="scroll-thin flex-1 space-y-4 overflow-y-auto p-4">{body}</div>
    </aside>
  );
}
