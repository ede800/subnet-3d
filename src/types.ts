// ---------------------------------------------------------------------------
// Schéma de public/data/subnet_data.json (généré par scripts/update_cables_and_outages.py)
// ---------------------------------------------------------------------------

/** Coordonnée au format GeoJSON : [longitude, latitude] */
export type LngLat = [number, number];

export type OwnerGroup =
  | 'Google'
  | 'Meta'
  | 'Microsoft'
  | 'Amazon'
  | 'Chine (État)'
  | 'Europe (Opérateurs)'
  | 'Consortium international'
  | 'Indépendant';

export type CableStatus = 'operational' | 'degraded' | 'planned';

export interface CableIncident {
  date: string;
  title: string;
}

export interface CableSovereignty {
  gafamShare: number;
  chinaShare: number;
  europeShare: number;
  supplierOrigin: string[];
  note: string;
}

export interface Cable {
  id: string;
  name: string;
  tgColor: string;
  lengthKm: number;
  rfs: string;
  rfsYear: number | null;
  isPlanned: boolean;
  capacityTbps: number;
  fiberPairs: number;
  owners: string[];
  suppliers: string[];
  ownerGroup: OwnerGroup;
  landingPointIds: string[];
  countries: string[];
  avgDepthM: number;
  chokepoints: string[];
  riskScore: number;
  sovereignty: CableSovereignty;
  incidents: CableIncident[];
  status: CableStatus;
  url: string | null;
}

export interface LandingPoint {
  id: string;
  name: string;
  fullName: string;
  country: string;
  lat: number;
  lng: number;
  cableIds: string[];
  isCriticalHub: boolean;
}

export type NodeKind = 'lp' | 'bu' | 'metro';

export interface NetworkNode {
  id: string;
  kind: NodeKind;
  lat: number;
  lng: number;
  country?: string;
}

export interface NetworkEdge {
  id: string;
  kind: 'cable' | 'terrestrial';
  cableId: string | null;
  from: string;
  to: string;
  lengthKm: number;
  capacityTbps: number;
  chokepoints: string[];
  /** Présent uniquement pour les segments de câbles sous-marins */
  coords?: LngLat[];
}

export interface ChokepointZone {
  lat: number;
  lng: number;
  radiusKm: number;
}

export interface Chokepoint {
  id: string;
  name: string;
  risk: number;
  lat: number;
  lng: number;
  zones: ChokepointZone[];
  threat: string;
  description: string;
  cableIds: string[];
  capacityAtRiskTbps: number;
}

export interface RoutingPoint {
  date: string;
  v4: number;
  v6: number;
  asns: number;
}

export interface CountryRouting {
  v4Prefixes: number;
  v6Prefixes: number;
  asns: number;
  deltaPct: number;
  status: 'normal' | 'watch' | 'anomaly';
  history: RoutingPoint[];
}

export interface CountryOutage {
  score: number;
  datasources: string[];
  start: string;
}

export interface CountryProfile {
  iso2: string;
  name: string;
  continent: string;
  continentLabel: string;
  landmass: string;
  gdpUsdBn: number;
  digitalShare: number;
  landingPointIds: string[];
  cableIds: string[];
  internationalCapacityTbps: number;
  routing: CountryRouting | null;
  outage: CountryOutage | null;
}

export interface Metro {
  id: string;
  name: string;
  lat: number;
  lng: number;
  country: string;
  weight: number;
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  chokepoints: string[];
  cables: string[];
  hubs: string[];
}

export interface LiveAlert {
  id: string;
  iso2: string;
  countryName: string;
  source: 'IODA' | 'RIPEstat';
  severity: 'critical' | 'high' | 'medium';
  title: string;
  start: string;
  score: number;
}

export interface SourceStatus {
  status: 'ok' | 'stale';
  updatedAt?: string;
  detail?: string;
  error?: string;
}

export interface SubnetData {
  meta: {
    name: string;
    version: number;
    generatedAt: string;
    sources: Record<string, SourceStatus>;
    counts: Record<string, number>;
    disclaimer: string;
  };
  cables: Cable[];
  landingPoints: LandingPoint[];
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  chokepoints: Chokepoint[];
  countries: CountryProfile[];
  metros: Metro[];
  latencyPairs: [string, string][];
  scenarios: Scenario[];
  alerts: LiveAlert[];
}

/** public/data/background_cables.json : réseau mondial simplifié (couche de contexte) */
export interface BackgroundCable {
  id: string;
  name: string;
  color: string | null;
  lines: LngLat[][];
}

export interface CountryFeature {
  type: 'Feature';
  properties: { iso2: string; name: string };
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: number[][][] | number[][][][] };
}

// ---------------------------------------------------------------------------
// État de l'interface & simulation
// ---------------------------------------------------------------------------

export type ColorMode = 'consortium' | 'capacity' | 'status' | 'risk';

export interface LayerVisibility {
  background: boolean;
  landingPoints: boolean;
  chokepoints: boolean;
  alerts: boolean;
}

export interface CutState {
  cables: string[];
  chokepoints: string[];
  hubs: string[];
}

export type Selection =
  | { type: 'cable'; id: string }
  | { type: 'hub'; id: string }
  | { type: 'country'; id: string }
  | { type: 'chokepoint'; id: string }
  | null;

export interface LatencyResult {
  from: string;
  to: string;
  label: string;
  baselineMs: number | null;
  currentMs: number | null;
  deltaMs: number | null;
  /** Arêtes empruntées par le chemin principal après simulation */
  pathEdgeIds: string[];
}

export interface CountryImpact {
  iso2: string;
  name: string;
  totalTbps: number;
  lostTbps: number;
  lossPct: number;
  latencyDeltaMs: number;
  isolated: boolean;
  economicUsdMPerHour: number;
}

export type EdgeLoadLevel = 'normal' | 'absorbing' | 'stressed' | 'saturated';

export interface EdgeLoad {
  baselineUtil: number;
  util: number;
  level: EdgeLoadLevel;
}

export interface SimulationResult {
  isBaseline: boolean;
  cutEdgeIds: Set<string>;
  /** Câbles dont au moins un segment est coupé */
  affectedCableIds: string[];
  /** Câbles intégralement hors service */
  fullyCutCableIds: string[];
  capacityAffectedTbps: number;
  edgeLoads: Map<string, EdgeLoad>;
  reroutedCableIds: string[];
  latencies: LatencyResult[];
  countryImpacts: CountryImpact[];
  countryImpactByIso: Map<string, CountryImpact>;
  economicImpactUsdMPerHour: number;
  unservedDemandPct: number;
  resilienceScore: number;
}
