/**
 * Moteur de simulation de crise de SubNet 3D.
 *
 * Modèle :
 *  - Graphe non orienté : landing points, unités de branchement (BU) et métropoles,
 *    reliés par les segments réels des 25 câbles stratégiques + backhaul terrestre.
 *  - Latence d'une arête (RTT) = 2 × longueur × 4,9 µs/km (vitesse de la lumière
 *    dans la fibre) + surcoût de transit sur les liens terrestres.
 *  - Trafic : matrice gravitaire entre métropoles, affectée par incréments successifs
 *    sur les plus courts chemins avec une fonction de congestion de type BPR. Après
 *    une coupure, le trafic se reporte sur les routes survivantes : les câbles qui
 *    absorbent ce report s'allument (orange → rouge) et la latence effective grimpe.
 *  - Perte de capacité par pays : pour chaque câble, part des pays étrangers encore
 *    joignables depuis les landing points du pays via les segments intacts.
 *  - Impact économique : PIB horaire × part numérique × (perte de capacité + pénalité
 *    de latence). C'est un ordre de grandeur pédagogique, pas une prévision.
 */
import type {
  CountryImpact,
  CutState,
  EdgeLoad,
  EdgeLoadLevel,
  LatencyResult,
  NetworkEdge,
  SimulationResult,
  SubnetData,
} from '../types';

const FIBER_RTT_MS_PER_KM = 2 * 0.0049;
const TERRESTRIAL_HOP_MS = 1.2;
const INCREMENTS = 4;
const BPR_ALPHA = 0.6;
const BPR_BETA = 4;
const BASELINE_TARGET_UTIL = 0.45;
const REFERENCE_METROS = ['frankfurt', 'ashburn', 'singapore', 'london', 'tokyo', 'mumbai'];
/** Plafond de capacité comptée par lien terrestre transfrontalier dans la capacité internationale d'un pays. */
const TERRESTRIAL_COUNT_CAP_TBPS = 200;

interface GraphEdge {
  idx: number;
  id: string;
  a: number;
  b: number;
  latencyMs: number;
  capacity: number;
  source: NetworkEdge;
}

/** File de priorité binaire minimale (Dijkstra). */
class MinHeap {
  private keys: number[] = [];
  private vals: number[] = [];

  get size() {
    return this.keys.length;
  }

  push(key: number, val: number) {
    const keys = this.keys;
    const vals = this.vals;
    let i = keys.length;
    keys.push(key);
    vals.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) break;
      keys[i] = keys[p];
      vals[i] = vals[p];
      i = p;
    }
    keys[i] = key;
    vals[i] = val;
  }

  pop(): [number, number] {
    const keys = this.keys;
    const vals = this.vals;
    const topKey = keys[0];
    const topVal = vals[0];
    const lastKey = keys.pop()!;
    const lastVal = vals.pop()!;
    const n = keys.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && keys[r] < keys[l] ? r : l;
        if (keys[c] >= lastKey) break;
        keys[i] = keys[c];
        vals[i] = vals[c];
        i = c;
      }
      keys[i] = lastKey;
      vals[i] = lastVal;
    }
    return [topKey, topVal];
  }
}

interface ShortestPaths {
  dist: Float64Array;
  prevEdge: Int32Array;
}

function utilLevel(baseline: number, util: number): EdgeLoadLevel {
  if (util >= 1 && util - baseline > 0.05) return 'saturated';
  if (util >= 0.8 && util - baseline > 0.05) return 'stressed';
  if (util >= 0.5 && util - baseline > 0.2) return 'absorbing';
  return 'normal';
}

export class SimulationEngine {
  readonly data: SubnetData;
  private nodeIndex = new Map<string, number>();
  private edges: GraphEdge[] = [];
  private adjacency: number[][] = [];
  private demandNodes: number[] = [];
  private demandWeights: number[] = [];
  private demandScale = 1;
  private cableEdges = new Map<string, GraphEdge[]>();
  private borderEdges = new Map<string, GraphEdge[]>();
  private metroIndex = new Map<string, number>();
  private countryGateways = new Map<string, number>();
  private baselineResult: SimulationResult | null = null;

  constructor(data: SubnetData) {
    this.data = data;
    data.nodes.forEach((n, i) => {
      this.nodeIndex.set(n.id, i);
      this.adjacency.push([]);
    });
    for (const e of data.edges) {
      const a = this.nodeIndex.get(e.from);
      const b = this.nodeIndex.get(e.to);
      if (a === undefined || b === undefined || a === b) continue;
      const latencyMs =
        e.lengthKm * FIBER_RTT_MS_PER_KM + (e.kind === 'terrestrial' ? TERRESTRIAL_HOP_MS : 0.05);
      const ge: GraphEdge = {
        idx: this.edges.length,
        id: e.id,
        a,
        b,
        latencyMs,
        capacity: Math.max(e.capacityTbps, 0.1),
        source: e,
      };
      this.edges.push(ge);
      this.adjacency[a].push(ge.idx);
      this.adjacency[b].push(ge.idx);
      if (e.cableId) {
        const list = this.cableEdges.get(e.cableId) ?? [];
        list.push(ge);
        this.cableEdges.set(e.cableId, list);
      }
    }
    for (const e of this.edges) {
      if (e.source.kind !== 'terrestrial') continue;
      const ca = data.nodes[e.a].country;
      const cb = data.nodes[e.b].country;
      if (!ca || !cb || ca === cb) continue;
      for (const c of [ca, cb]) {
        const list = this.borderEdges.get(c) ?? [];
        list.push(e);
        this.borderEdges.set(c, list);
      }
    }
    for (const m of data.metros) {
      const idx = this.nodeIndex.get(`m:${m.id}`);
      if (idx === undefined) continue;
      this.metroIndex.set(m.id, idx);
      this.demandNodes.push(idx);
      this.demandWeights.push(m.weight);
    }
    for (const c of data.countries) {
      const metro = data.metros.find((m) => m.country === c.iso2);
      const gw = metro
        ? this.nodeIndex.get(`m:${metro.id}`)
        : c.landingPointIds.map((id) => this.nodeIndex.get(`lp:${id}`)).find((x) => x !== undefined);
      if (gw !== undefined) this.countryGateways.set(c.iso2, gw);
    }
    this.calibrateDemand();
  }

  // -------------------------------------------------------------------------
  // Primitives de graphe
  // -------------------------------------------------------------------------

  private dijkstra(source: number, cost: Float64Array, removed: Uint8Array): ShortestPaths {
    const n = this.adjacency.length;
    const dist = new Float64Array(n).fill(Infinity);
    const prevEdge = new Int32Array(n).fill(-1);
    const heap = new MinHeap();
    dist[source] = 0;
    heap.push(0, source);
    while (heap.size > 0) {
      const [d, u] = heap.pop();
      if (d > dist[u]) continue;
      for (const ei of this.adjacency[u]) {
        if (removed[ei]) continue;
        const e = this.edges[ei];
        const v = e.a === u ? e.b : e.a;
        const nd = d + cost[ei];
        if (nd < dist[v]) {
          dist[v] = nd;
          prevEdge[v] = ei;
          heap.push(nd, v);
        }
      }
    }
    return { dist, prevEdge };
  }

  private pathEdges(sp: ShortestPaths, target: number): number[] {
    const path: number[] = [];
    let cur = target;
    while (sp.prevEdge[cur] !== -1) {
      const ei = sp.prevEdge[cur];
      path.push(ei);
      const e = this.edges[ei];
      cur = e.a === cur ? e.b : e.a;
    }
    return path;
  }

  private freeFlowCost(): Float64Array {
    return Float64Array.from(this.edges, (e) => e.latencyMs);
  }

  /** Affectation incrémentale du trafic gravitaire avec congestion BPR. */
  private assignTraffic(removed: Uint8Array, scale: number, increments: number) {
    const m = this.edges.length;
    const load = new Float64Array(m);
    const cost = this.freeFlowCost();
    const pairLatency = new Map<string, { sum: number; weight: number; lastPath: number[] }>();
    const trackedPairs = new Set(this.data.latencyPairs.map(([a, b]) => `${a}|${b}`));
    const metroIds = this.data.metros.filter((m) => this.metroIndex.has(m.id)).map((m) => m.id);
    let unserved = 0;
    let total = 0;

    for (let round = 0; round < increments; round++) {
      for (let i = 0; i < this.demandNodes.length; i++) {
        const sp = this.dijkstra(this.demandNodes[i], cost, removed);
        for (let j = i + 1; j < this.demandNodes.length; j++) {
          const demand = (this.demandWeights[i] * this.demandWeights[j] * scale) / increments;
          total += demand;
          const target = this.demandNodes[j];
          if (!Number.isFinite(sp.dist[target])) {
            unserved += demand;
            continue;
          }
          const path = this.pathEdges(sp, target);
          for (const ei of path) load[ei] += demand;
          const key = `${metroIds[i]}|${metroIds[j]}`;
          const rkey = `${metroIds[j]}|${metroIds[i]}`;
          const tracked = trackedPairs.has(key) ? key : trackedPairs.has(rkey) ? rkey : null;
          if (tracked) {
            let ff = 0;
            for (const ei of path) ff += this.edges[ei].latencyMs * (1 + Math.min(0.6, BPR_ALPHA * 0.1 * (load[ei] / this.edges[ei].capacity) ** BPR_BETA));
            const acc = pairLatency.get(tracked) ?? { sum: 0, weight: 0, lastPath: [] };
            acc.sum += ff;
            acc.weight += 1;
            acc.lastPath = path;
            pairLatency.set(tracked, acc);
          }
        }
      }
      for (let k = 0; k < m; k++) {
        const e = this.edges[k];
        cost[k] = e.latencyMs * (1 + BPR_ALPHA * (load[k] / e.capacity) ** BPR_BETA);
      }
    }
    return { load, pairLatency, unservedPct: total > 0 ? (unserved / total) * 100 : 0 };
  }

  /** Calibre la demande pour que la capacité sous-marine sollicitée tourne en moyenne à ~45 %. */
  private calibrateDemand() {
    const removed = new Uint8Array(this.edges.length);
    const { load } = this.assignTraffic(removed, 1, 1);
    let loadSum = 0;
    let capSum = 0;
    this.edges.forEach((e, i) => {
      if (e.source.kind === 'cable' && load[i] > 0) {
        loadSum += load[i] * e.source.lengthKm;
        capSum += e.capacity * e.source.lengthKm;
      }
    });
    this.demandScale = loadSum > 0 ? (BASELINE_TARGET_UTIL * capSum) / loadSum : 1;
  }

  // -------------------------------------------------------------------------
  // Coupures
  // -------------------------------------------------------------------------

  resolveCutEdges(cut: CutState): Set<string> {
    const cables = new Set(cut.cables);
    const chokepoints = new Set(cut.chokepoints);
    const hubs = new Set(cut.hubs.map((h) => `lp:${h}`));
    const out = new Set<string>();
    for (const e of this.data.edges) {
      if (
        (e.cableId && cables.has(e.cableId)) ||
        e.chokepoints.some((c) => chokepoints.has(c)) ||
        hubs.has(e.from) ||
        hubs.has(e.to)
      ) {
        out.add(e.id);
      }
    }
    return out;
  }

  /** Pays joignables depuis `country` par un câble donné, en n'utilisant que ses segments intacts. */
  private reachableCountries(cableId: string, country: string, removed: Uint8Array): Set<string> {
    const edges = this.cableEdges.get(cableId) ?? [];
    const adj = new Map<number, number[]>();
    for (const e of edges) {
      if (removed[e.idx]) continue;
      if (!adj.has(e.a)) adj.set(e.a, []);
      if (!adj.has(e.b)) adj.set(e.b, []);
      adj.get(e.a)!.push(e.b);
      adj.get(e.b)!.push(e.a);
    }
    const nodes = this.data.nodes;
    const starts = new Set<number>();
    for (const e of edges) {
      for (const n of [e.a, e.b]) if (nodes[n].kind === 'lp' && nodes[n].country === country) starts.add(n);
    }
    const seen = new Set<number>(starts);
    const queue = [...starts].filter((n) => adj.has(n));
    const reached = new Set<string>();
    while (queue.length) {
      const u = queue.pop()!;
      const c = nodes[u].country;
      if (nodes[u].kind === 'lp' && c && c !== country) reached.add(c);
      for (const v of adj.get(u) ?? []) {
        if (!seen.has(v)) {
          seen.add(v);
          queue.push(v);
        }
      }
    }
    return reached;
  }

  private referenceLatencies(removed: Uint8Array): Map<string, number[]> {
    const cost = this.freeFlowCost();
    const out = new Map<string, number[]>();
    const refs = REFERENCE_METROS.map((id) => this.metroIndex.get(id)).filter((x): x is number => x !== undefined);
    const trees = refs.map((r) => this.dijkstra(r, cost, removed));
    for (const [iso, gw] of this.countryGateways) {
      out.set(iso, trees.map((t) => t.dist[gw]));
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // Simulation
  // -------------------------------------------------------------------------

  get baseline(): SimulationResult {
    if (!this.baselineResult) {
      this.baselineResult = this.compute({ cables: [], chokepoints: [], hubs: [] }, null);
    }
    return this.baselineResult;
  }

  simulate(cut: CutState): SimulationResult {
    const empty = !cut.cables.length && !cut.chokepoints.length && !cut.hubs.length;
    return empty ? this.baseline : this.compute(cut, this.baseline);
  }

  private compute(cut: CutState, base: SimulationResult | null): SimulationResult {
    const cutEdgeIds = this.resolveCutEdges(cut);
    const removed = new Uint8Array(this.edges.length);
    this.edges.forEach((e, i) => {
      if (cutEdgeIds.has(e.id)) removed[i] = 1;
    });
    const noCut = new Uint8Array(this.edges.length);

    // 1. Trafic & reroutage
    const { load, pairLatency, unservedPct } = this.assignTraffic(removed, this.demandScale, INCREMENTS);
    const edgeLoads = new Map<string, EdgeLoad>();
    const reroutedCables = new Map<string, number>();
    this.edges.forEach((e, i) => {
      const util = removed[i] ? 0 : load[i] / e.capacity;
      const baselineUtil = base ? base.edgeLoads.get(e.id)?.util ?? 0 : util;
      const level = base && !removed[i] ? utilLevel(baselineUtil, util) : 'normal';
      edgeLoads.set(e.id, { baselineUtil, util, level });
      if (level !== 'normal' && e.source.cableId) {
        reroutedCables.set(e.source.cableId, Math.max(reroutedCables.get(e.source.cableId) ?? 0, util));
      }
    });

    // 2. Latences entre grandes régions
    const metroName = new Map(this.data.metros.map((m) => [m.id, m.name]));
    const latencies: LatencyResult[] = this.data.latencyPairs.map(([a, b]) => {
      const acc = pairLatency.get(`${a}|${b}`);
      const currentMs = acc && acc.weight > 0 ? acc.sum / acc.weight : null;
      const baselineMs = base ? base.latencies.find((l) => l.from === a && l.to === b)?.currentMs ?? null : currentMs;
      return {
        from: a,
        to: b,
        label: `${metroName.get(a) ?? a} ↔ ${metroName.get(b) ?? b}`,
        baselineMs,
        currentMs,
        deltaMs: currentMs !== null && baselineMs !== null ? currentMs - baselineMs : null,
        pathEdgeIds: acc ? acc.lastPath.map((ei) => this.edges[ei].id) : [],
      };
    });

    // 3. Câbles touchés
    const affected: string[] = [];
    const fullyCut: string[] = [];
    let capacityAffectedTbps = 0;
    for (const cable of this.data.cables) {
      const edges = this.cableEdges.get(cable.id) ?? [];
      const nCut = edges.filter((e) => removed[e.idx]).length;
      if (nCut > 0) {
        affected.push(cable.id);
        capacityAffectedTbps += cable.capacityTbps;
        if (nCut === edges.length) fullyCut.push(cable.id);
      }
    }

    // 4. Impact par pays
    const refBase = this.referenceLatencies(noCut);
    const refNow = base ? this.referenceLatencies(removed) : refBase;
    const countryImpacts: CountryImpact[] = [];
    for (const country of this.data.countries) {
      let total = 0;
      let lost = 0;
      for (const cableId of country.cableIds) {
        const cable = this.data.cables.find((c) => c.id === cableId);
        if (!cable || cable.isPlanned) continue;
        const before = this.reachableCountries(cableId, country.iso2, noCut);
        if (before.size === 0) continue;
        total += cable.capacityTbps;
        if (!affected.includes(cableId)) continue;
        const after = this.reachableCountries(cableId, country.iso2, removed);
        lost += cable.capacityTbps * (1 - after.size / before.size);
      }
      // Liaisons terrestres transfrontalières (backhaul vers les pays voisins)
      for (const e of this.borderEdges.get(country.iso2) ?? []) {
        const counted = Math.min(e.capacity, TERRESTRIAL_COUNT_CAP_TBPS);
        total += counted;
        if (removed[e.idx]) lost += counted;
      }
      const b = refBase.get(country.iso2) ?? [];
      const n = refNow.get(country.iso2) ?? [];
      let deltaSum = 0;
      let deltaCount = 0;
      let reachableNow = 0;
      b.forEach((v, i) => {
        if (Number.isFinite(n[i])) reachableNow += 1;
        if (Number.isFinite(v) && Number.isFinite(n[i])) {
          deltaSum += n[i] - v;
          deltaCount += 1;
        }
      });
      const latencyDeltaMs = deltaCount ? deltaSum / deltaCount : 0;
      const isolated = b.length > 0 && reachableNow === 0;
      const lossPct = isolated ? 100 : total > 0 ? (lost / total) * 100 : 0;
      const gdpPerHourM = (country.gdpUsdBn * 1000) / 8760;
      const latencyPenalty = Math.min(1, Math.max(0, latencyDeltaMs) / 300);
      const economicUsdMPerHour = gdpPerHourM * country.digitalShare * ((lossPct / 100) * 0.6 + latencyPenalty * 0.2);
      countryImpacts.push({
        iso2: country.iso2,
        name: country.name,
        totalTbps: total,
        lostTbps: isolated ? total : lost,
        lossPct,
        latencyDeltaMs,
        isolated,
        economicUsdMPerHour,
      });
    }
    countryImpacts.sort((x, y) => y.lossPct - x.lossPct || y.latencyDeltaMs - x.latencyDeltaMs);

    // 5. Agrégats
    const economicImpactUsdMPerHour = countryImpacts.reduce((s, c) => s + c.economicUsdMPerHour, 0);
    const gdpTotal = this.data.countries.reduce((s, c) => s + c.gdpUsdBn, 0);
    const weightedLoss =
      countryImpacts.reduce((s, c) => {
        const gdp = this.data.countries.find((x) => x.iso2 === c.iso2)?.gdpUsdBn ?? 0;
        return s + (c.lossPct / 100) * gdp;
      }, 0) / Math.max(gdpTotal, 1);
    const latencyStress =
      latencies.reduce((s, l) => s + (l.baselineMs && l.deltaMs ? Math.max(0, l.deltaMs) / l.baselineMs : 0), 0) /
      Math.max(latencies.length, 1);
    const saturated = [...edgeLoads.values()].filter((l) => l.level === 'saturated').length;
    const resilienceScore = Math.round(
      Math.max(0, Math.min(100, 100 - weightedLoss * 220 - latencyStress * 45 - saturated * 0.6 - unservedPct * 1.5)),
    );

    return {
      isBaseline: base === null,
      cutEdgeIds,
      affectedCableIds: affected,
      fullyCutCableIds: fullyCut,
      capacityAffectedTbps,
      edgeLoads,
      reroutedCableIds: [...reroutedCables.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id),
      latencies,
      countryImpacts,
      countryImpactByIso: new Map(countryImpacts.map((c) => [c.iso2, c])),
      economicImpactUsdMPerHour,
      unservedDemandPct: unservedPct,
      resilienceScore,
    };
  }

  /** RTT modélisé de bout en bout d'un câble (somme de ses segments les plus longs entre extrémités). */
  cableLatencyMs(cableId: string): number {
    const edges = this.cableEdges.get(cableId) ?? [];
    if (!edges.length) return 0;
    const cost = this.freeFlowCost();
    const removed = new Uint8Array(this.edges.length).fill(1);
    for (const e of edges) removed[e.idx] = 0;
    const lps = [...new Set(edges.flatMap((e) => [e.a, e.b]))].filter((n) => this.data.nodes[n].kind === 'lp');
    if (lps.length < 2) return 0;
    let best = 0;
    const first = this.dijkstra(lps[0], cost, removed);
    let far = lps[0];
    for (const n of lps) if (Number.isFinite(first.dist[n]) && first.dist[n] > (first.dist[far] || 0)) far = n;
    const second = this.dijkstra(far, cost, removed);
    for (const n of lps) if (Number.isFinite(second.dist[n])) best = Math.max(best, second.dist[n]);
    return best;
  }
}
