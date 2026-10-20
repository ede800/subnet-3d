import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Globe, { type GlobeMethods } from 'react-globe.gl';
import * as THREE from 'three';
import type {
  BackgroundCable,
  Cable,
  Chokepoint,
  ColorMode,
  CountryFeature,
  CutState,
  LandingPoint,
  LatencyResult,
  LayerVisibility,
  LiveAlert,
  LngLat,
  Selection,
  SimulationResult,
  SubnetData,
} from '../types';
import { LOAD_COLORS, STATUS_COLORS, cableColor, lossColor, withAlpha } from '../utils/colors';
import { centerOf, createStarfield, type LatLng } from '../utils/geo';
import { fmtDelta, fmtTbps } from '../utils/format';

interface GlobeRadarProps {
  data: SubnetData;
  background: BackgroundCable[];
  countries: CountryFeature[];
  centroids: Map<string, LatLng>;
  colorMode: ColorMode;
  layers: LayerVisibility;
  sim: SimulationResult;
  cut: CutState;
  warMode: boolean;
  pendingCables: string[];
  selection: Selection;
  highlightedPair: LatencyResult | null;
  onSelect: (selection: Selection) => void;
  onToggleCableForCut: (cableId: string) => void;
}

interface PathDatum {
  key: string;
  coords: LngLat[];
  color: string | string[];
  stroke: number | null;
  dashLength: number;
  dashGap: number;
  animateTime: number;
  cableId: string | null;
  label: string;
}

interface RingDatum {
  lat: number;
  lng: number;
  maxRadius: number;
  speed: number;
  period: number;
  color: (t: number) => string;
}

interface MarkerDatum {
  key: string;
  lat: number;
  lng: number;
  kind: 'chokepoint' | 'alert';
  chokepoint?: Chokepoint;
  alert?: LiveAlert;
  active?: boolean;
}

interface ArcDatum {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  color: string[];
  label: string;
}

const tooltip = (title: string, lines: string[]) =>
  `<div style="font-family:'JetBrains Mono',monospace;background:rgba(4,13,32,.92);border:1px solid rgba(0,229,255,.35);border-radius:10px;padding:8px 10px;color:#dffaff;font-size:11px;box-shadow:0 0 18px rgba(0,229,255,.2)">
     <div style="font-family:Rajdhani,sans-serif;font-weight:700;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#fff">${title}</div>
     ${lines.map((l) => `<div style="opacity:.85">${l}</div>`).join('')}
   </div>`;

export default function GlobeRadar(props: GlobeRadarProps) {
  const {
    data,
    background,
    countries,
    centroids,
    colorMode,
    layers,
    sim,
    cut,
    warMode,
    pendingCables,
    selection,
    highlightedPair,
    onSelect,
    onToggleCableForCut,
  } = props;

  const globeRef = useRef<GlobeMethods>();
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const starfield = useMemo(() => createStarfield(), []);

  const cableById = useMemo(() => new Map<string, Cable>(data.cables.map((c) => [c.id, c])), [data]);
  const lpById = useMemo(() => new Map<string, LandingPoint>(data.landingPoints.map((l) => [l.id, l])), [data]);
  const alertIsos = useMemo(() => new Set(data.alerts.map((a) => a.iso2)), [data]);

  const globeMaterial = useMemo(
    () =>
      new THREE.MeshPhongMaterial({
        color: new THREE.Color('#031027'),
        emissive: new THREE.Color('#041a42'),
        emissiveIntensity: 0.55,
        shininess: 14,
        specular: new THREE.Color('#0a3a7a'),
      }),
    [],
  );

  // Taille responsive
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Caméra initiale + rotation automatique (stoppée dès la première interaction)
  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;
    globe.pointOfView({ lat: 22, lng: 35, altitude: 2.3 }, 0);
    const controls = globe.controls();
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.25;
    controls.enableDamping = true;
    const stop = () => {
      controls.autoRotate = false;
    };
    controls.addEventListener('start', stop);
    return () => controls.removeEventListener('start', stop);
  }, []);

  // Recentrage sur la sélection
  useEffect(() => {
    const globe = globeRef.current;
    if (!globe || !selection) return;
    let target: LatLng | null = null;
    if (selection.type === 'cable') {
      const cable = cableById.get(selection.id);
      if (cable) {
        target = centerOf(
          cable.landingPointIds.map((id) => lpById.get(id)).filter((x): x is LandingPoint => !!x),
        );
      }
    } else if (selection.type === 'hub') {
      const lp = lpById.get(selection.id);
      if (lp) target = { lat: lp.lat, lng: lp.lng };
    } else if (selection.type === 'country') {
      target = centroids.get(selection.id) ?? null;
    } else if (selection.type === 'chokepoint') {
      const cp = data.chokepoints.find((c) => c.id === selection.id);
      if (cp) target = { lat: cp.lat, lng: cp.lng };
    }
    if (target) {
      globe.controls().autoRotate = false;
      globe.pointOfView({ ...target, altitude: selection.type === 'cable' ? 2.1 : 1.6 }, 1200);
    }
  }, [selection, cableById, lpById, centroids, data.chokepoints]);

  // ---------------------------------------------------------------------------
  // Couche câbles (segments réels + réseau mondial de contexte)
  // ---------------------------------------------------------------------------
  const pathsData = useMemo<PathDatum[]>(() => {
    const out: PathDatum[] = [];
    if (layers.background) {
      for (const bg of background) {
        bg.lines.forEach((line, i) =>
          out.push({
            key: `bg:${bg.id}:${i}`,
            coords: line,
            color: 'rgba(90, 150, 220, 0.16)',
            stroke: null,
            dashLength: 1,
            dashGap: 0,
            animateTime: 0,
            cableId: null,
            label: tooltip(bg.name, ['Réseau mondial (contexte)']),
          }),
        );
      }
    }
    const simActive = !sim.isBaseline;
    const highlight = new Set(highlightedPair?.pathEdgeIds ?? []);
    const pending = new Set(pendingCables);
    const selectedCable = selection?.type === 'cable' ? selection.id : null;

    for (const edge of data.edges) {
      if (edge.kind !== 'cable' || !edge.coords || !edge.cableId) continue;
      const cable = cableById.get(edge.cableId);
      if (!cable) continue;
      const base = cableColor(cable, colorMode);
      const load = sim.edgeLoads.get(edge.id);
      const isCut = sim.cutEdgeIds.has(edge.id);
      const isSelected = selectedCable === cable.id;
      let color: string | string[] = [withAlpha(base, 0.95), withAlpha(base, 0.35)];
      let stroke = 0.5 + Math.min(cable.capacityTbps, 400) / 240;
      let dashLength = 0.06;
      let dashGap = 0.025;
      let animateTime = Math.round(9000 / (1 + Math.log10(cable.capacityTbps + 1)));
      const lines = [
        `${fmtTbps(cable.capacityTbps)} · ${cable.ownerGroup}`,
        `Risque géopolitique : ${cable.riskScore}/100`,
      ];

      if (isCut) {
        color = [STATUS_COLORS.cut, withAlpha(STATUS_COLORS.cut, 0.4)];
        dashLength = 0.015;
        dashGap = 0.02;
        animateTime = 0;
        stroke += 0.4;
        lines.unshift('⛔ SEGMENT COUPÉ');
      } else if (simActive && load && load.level !== 'normal') {
        const c = LOAD_COLORS[load.level];
        color = [c, withAlpha(c, 0.55)];
        animateTime = Math.max(500, animateTime / 3);
        stroke += 0.35;
        lines.unshift(`⚠ Reroutage : charge ${Math.round(load.util * 100)} % (base ${Math.round(load.baselineUtil * 100)} %)`);
      } else if (simActive) {
        color = [withAlpha(base, 0.45), withAlpha(base, 0.15)];
      }
      if (pending.has(cable.id)) {
        color = ['#ffffff', 'rgba(255,255,255,0.5)'];
        stroke += 0.4;
        lines.unshift('◎ Sélectionné pour sabotage');
      }
      if (highlight.has(edge.id)) {
        color = ['#00ffa3', 'rgba(0,255,163,0.6)'];
        stroke += 0.5;
        animateTime = 700;
      }
      if (isSelected) stroke += 0.6;

      out.push({
        key: edge.id,
        coords: edge.coords,
        color,
        stroke,
        dashLength,
        dashGap,
        animateTime,
        cableId: cable.id,
        label: tooltip(cable.name, lines),
      });
    }
    return out;
  }, [background, layers.background, data.edges, cableById, colorMode, sim, pendingCables, selection, highlightedPair]);

  // ---------------------------------------------------------------------------
  // Landing points
  // ---------------------------------------------------------------------------
  const pointsData = useMemo(() => {
    if (!layers.landingPoints) return [];
    const blacked = new Set(cut.hubs);
    return data.landingPoints.map((lp) => {
      const selected = selection?.type === 'hub' && selection.id === lp.id;
      const color = blacked.has(lp.id) ? '#ff1744' : selected ? '#ffffff' : lp.isCriticalHub ? '#e8fdff' : '#00b8d4';
      return {
        lp,
        color,
        radius: (lp.isCriticalHub ? 0.32 : 0.16) + (selected ? 0.2 : 0) + (blacked.has(lp.id) ? 0.25 : 0),
        altitude: lp.isCriticalHub ? 0.018 : 0.008,
        label: tooltip(lp.fullName, [
          `${lp.cableIds.length} câble(s) stratégique(s)`,
          lp.isCriticalHub ? 'HUB CRITIQUE' : 'Landing station',
          blacked.has(lp.id) ? '⛔ BLACKOUT SIMULÉ' : '',
        ]),
      };
    });
  }, [data.landingPoints, layers.landingPoints, selection, cut.hubs]);

  // ---------------------------------------------------------------------------
  // Anneaux radar : chokepoints + alertes BGP / IODA + hubs en blackout
  // ---------------------------------------------------------------------------
  const ringsData = useMemo<RingDatum[]>(() => {
    const out: RingDatum[] = [];
    const blocked = new Set(cut.chokepoints);
    if (layers.chokepoints) {
      for (const cp of data.chokepoints) {
        const active = blocked.has(cp.id);
        const maxKm = Math.max(...cp.zones.map((z) => z.radiusKm));
        const rgb = active ? '255,23,68' : cp.risk >= 85 ? '255,145,0' : '255,196,0';
        out.push({
          lat: cp.lat,
          lng: cp.lng,
          maxRadius: (maxKm / 111) * (active ? 3.2 : 2.4),
          speed: active ? 4 : 2,
          period: active ? 500 : 1300,
          color: (t: number) => `rgba(${rgb},${Math.max(0, 1 - t) * 0.9})`,
        });
      }
    }
    if (layers.alerts) {
      for (const alert of data.alerts) {
        const c = centroids.get(alert.iso2);
        if (!c) continue;
        out.push({
          lat: c.lat,
          lng: c.lng,
          maxRadius: alert.severity === 'critical' ? 6 : alert.severity === 'high' ? 4.5 : 3,
          speed: 3,
          period: 900,
          color: (t: number) => `rgba(255,40,80,${Math.max(0, 1 - t) * 0.85})`,
        });
      }
    }
    for (const hub of cut.hubs) {
      const lp = lpById.get(hub);
      if (!lp) continue;
      out.push({
        lat: lp.lat,
        lng: lp.lng,
        maxRadius: 5,
        speed: 5,
        period: 450,
        color: (t: number) => `rgba(255,23,68,${Math.max(0, 1 - t)})`,
      });
    }
    return out;
  }, [data.chokepoints, data.alerts, layers.chokepoints, layers.alerts, cut.chokepoints, cut.hubs, centroids, lpById]);

  // ---------------------------------------------------------------------------
  // Marqueurs HTML
  // ---------------------------------------------------------------------------
  const markers = useMemo<MarkerDatum[]>(() => {
    const out: MarkerDatum[] = [];
    const blocked = new Set(cut.chokepoints);
    if (layers.chokepoints) {
      for (const cp of data.chokepoints) {
        out.push({ key: `cp:${cp.id}`, lat: cp.lat, lng: cp.lng, kind: 'chokepoint', chokepoint: cp, active: blocked.has(cp.id) });
      }
    }
    if (layers.alerts) {
      for (const alert of data.alerts) {
        const c = centroids.get(alert.iso2);
        if (c) out.push({ key: `al:${alert.id}`, lat: c.lat, lng: c.lng, kind: 'alert', alert });
      }
    }
    return out;
  }, [data.chokepoints, data.alerts, layers.chokepoints, layers.alerts, cut.chokepoints, centroids]);

  const makeMarker = useCallback((d: object): HTMLElement => {
    const m = d as MarkerDatum;
    const el = document.createElement('div');
    el.className = 'globe-marker';
    if (m.kind === 'chokepoint' && m.chokepoint) {
      const cp = m.chokepoint;
      const tone = m.active ? '#ff1744' : cp.risk >= 85 ? '#ff9100' : '#ffc400';
      el.innerHTML = `
        <div style="display:flex;align-items:center;gap:6px;transform:translateY(-14px)">
          <div style="width:10px;height:10px;border:2px solid ${tone};transform:rotate(45deg);box-shadow:0 0 10px ${tone}"></div>
          <div style="font:600 10px 'JetBrains Mono',monospace;letter-spacing:.08em;text-transform:uppercase;color:${tone};background:rgba(2,8,22,.75);border:1px solid ${tone}55;border-radius:6px;padding:2px 6px;white-space:nowrap">
            ${m.active ? '⛔ ' : ''}${cp.name}
          </div>
        </div>`;
      el.title = `${cp.name} — risque ${cp.risk}/100`;
      el.onclick = () => onSelect({ type: 'chokepoint', id: cp.id });
    } else if (m.alert) {
      const a = m.alert;
      el.innerHTML = `
        <div style="display:flex;align-items:center;gap:4px">
          <div style="width:8px;height:8px;border-radius:9999px;background:#ff1744;box-shadow:0 0 12px #ff1744"></div>
          <div style="font:600 9px 'JetBrains Mono',monospace;color:#ffd6de;background:rgba(40,0,10,.7);border:1px solid rgba(255,23,68,.5);border-radius:5px;padding:1px 5px;white-space:nowrap">
            ${a.source} · ${a.iso2}
          </div>
        </div>`;
      el.title = `${a.countryName} : ${a.title}`;
      el.onclick = () => onSelect({ type: 'country', id: a.iso2 });
    }
    return el;
  }, [onSelect]);

  // ---------------------------------------------------------------------------
  // Arcs de reroutage (paires de latence dégradées)
  // ---------------------------------------------------------------------------
  const arcsData = useMemo<ArcDatum[]>(() => {
    if (sim.isBaseline) return [];
    const metros = new Map(data.metros.map((m) => [m.id, m]));
    return sim.latencies
      .filter((l) => l.deltaMs === null || l.deltaMs > 15)
      .map((l) => {
        const a = metros.get(l.from)!;
        const b = metros.get(l.to)!;
        const cutOff = l.currentMs === null;
        return {
          startLat: a.lat,
          startLng: a.lng,
          endLat: b.lat,
          endLng: b.lng,
          color: cutOff ? ['#ff1744', '#ff1744'] : ['#00e5ff', '#ff3d00'],
          label: tooltip(l.label, [cutOff ? 'Liaison interrompue' : `${fmtDelta(l.deltaMs)} de latence`]),
        };
      });
  }, [sim, data.metros]);

  // ---------------------------------------------------------------------------
  // Pays
  // ---------------------------------------------------------------------------
  const polygonCapColor = (d: object) => {
    const f = d as CountryFeature;
    const iso = f.properties.iso2;
    if (selection?.type === 'country' && selection.id === iso) return 'rgba(0, 229, 255, 0.35)';
    if (!sim.isBaseline) {
      const impact = sim.countryImpactByIso.get(iso);
      if (impact) return lossColor(impact.lossPct);
    }
    if (layers.alerts && alertIsos.has(iso)) return 'rgba(255, 23, 68, 0.22)';
    return 'rgba(10, 30, 60, 0.55)';
  };

  const polygonAltitude = (d: object) => {
    const iso = (d as CountryFeature).properties.iso2;
    const impact = sim.isBaseline ? null : sim.countryImpactByIso.get(iso);
    return impact && impact.lossPct > 0.5 ? 0.008 + Math.min(impact.lossPct, 100) * 0.00025 : 0.005;
  };

  const polygonLabel = (d: object) => {
    const f = d as CountryFeature;
    const profile = data.countries.find((c) => c.iso2 === f.properties.iso2);
    const impact = sim.isBaseline ? null : sim.countryImpactByIso.get(f.properties.iso2);
    const lines: string[] = [];
    if (profile) lines.push(`${profile.cableIds.length} câble(s) stratégique(s) · ${fmtTbps(profile.internationalCapacityTbps)}`);
    if (impact) {
      lines.push(`Capacité perdue : ${impact.lossPct.toFixed(1)} %`);
      lines.push(`Latence : ${fmtDelta(impact.latencyDeltaMs)}`);
    }
    return tooltip(f.properties.name, lines);
  };

  const handlePathClick = (d: object) => {
    const p = d as PathDatum;
    if (!p.cableId) return;
    if (warMode) onToggleCableForCut(p.cableId);
    onSelect({ type: 'cable', id: p.cableId });
  };

  const handlePolygonClick = (d: object) => {
    const iso = (d as CountryFeature).properties.iso2;
    if (data.countries.some((c) => c.iso2 === iso)) onSelect({ type: 'country', id: iso });
  };

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{ backgroundImage: `url(${starfield})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
    >
      <Globe
        ref={globeRef}
        width={size.width}
        height={size.height}
        backgroundColor="rgba(0,0,0,0)"
        globeMaterial={globeMaterial}
        showAtmosphere
        atmosphereColor="#1f8bff"
        atmosphereAltitude={0.2}
        showGraticules
        // Pays
        polygonsData={countries}
        polygonCapColor={polygonCapColor}
        polygonSideColor={() => 'rgba(0, 229, 255, 0.04)'}
        polygonStrokeColor={() => 'rgba(0, 229, 255, 0.22)'}
        polygonAltitude={polygonAltitude}
        polygonLabel={polygonLabel}
        polygonsTransitionDuration={400}
        onPolygonClick={handlePolygonClick}
        // Câbles
        pathsData={pathsData}
        pathPoints="coords"
        pathPointLat={(p: LngLat) => p[1]}
        pathPointLng={(p: LngLat) => p[0]}
        pathPointAlt={0.004}
        pathColor="color"
        pathStroke="stroke"
        pathDashLength="dashLength"
        pathDashGap="dashGap"
        pathDashAnimateTime="animateTime"
        pathTransitionDuration={0}
        pathLabel="label"
        onPathClick={handlePathClick}
        // Landing points
        pointsData={pointsData}
        pointLat={(d: object) => (d as { lp: LandingPoint }).lp.lat}
        pointLng={(d: object) => (d as { lp: LandingPoint }).lp.lng}
        pointColor="color"
        pointRadius="radius"
        pointAltitude="altitude"
        pointResolution={12}
        pointsTransitionDuration={0}
        pointLabel="label"
        onPointClick={(d: object) => onSelect({ type: 'hub', id: (d as { lp: LandingPoint }).lp.id })}
        // Anneaux radar
        ringsData={ringsData}
        ringColor="color"
        ringMaxRadius="maxRadius"
        ringPropagationSpeed="speed"
        ringRepeatPeriod="period"
        ringAltitude={0.006}
        // Marqueurs HTML
        htmlElementsData={markers}
        htmlLat="lat"
        htmlLng="lng"
        htmlAltitude={0.02}
        htmlElement={makeMarker}
        htmlTransitionDuration={0}
        // Arcs de reroutage
        arcsData={arcsData}
        arcColor="color"
        arcLabel="label"
        arcStroke={0.5}
        arcAltitudeAutoScale={0.35}
        arcDashLength={0.35}
        arcDashGap={0.15}
        arcDashAnimateTime={1800}
        arcsTransitionDuration={0}
      />
      <div className="scanline pointer-events-none absolute inset-0 overflow-hidden" />
    </div>
  );
}

