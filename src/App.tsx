import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, TriangleAlert } from 'lucide-react';
import GlobeRadar from './components/GlobeRadar';
import ControlBar from './components/ControlBar';
import CrisisSimulatorPanel from './components/CrisisSimulatorPanel';
import InspectorSidebar from './components/InspectorSidebar';
import Legend from './components/Legend';
import AlertFeed from './components/AlertFeed';
import { SimulationEngine } from './utils/simulationEngine';
import { computeCountryCentroids } from './utils/geo';
import type {
  BackgroundCable,
  ColorMode,
  CountryFeature,
  CutState,
  LatencyResult,
  LayerVisibility,
  Scenario,
  Selection,
  SubnetData,
} from './types';

const EMPTY_CUT: CutState = { cables: [], chokepoints: [], hubs: [] };
const dataUrl = (file: string) => `${import.meta.env.BASE_URL}data/${file}`;

async function fetchJson<T>(file: string): Promise<T> {
  const res = await fetch(dataUrl(file));
  if (!res.ok) throw new Error(`${file} : HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

export default function App() {
  const [data, setData] = useState<SubnetData | null>(null);
  const [background, setBackground] = useState<BackgroundCable[]>([]);
  const [countries, setCountries] = useState<CountryFeature[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [colorMode, setColorMode] = useState<ColorMode>('consortium');
  const [layers, setLayers] = useState<LayerVisibility>({
    background: true,
    landingPoints: true,
    chokepoints: true,
    alerts: true,
  });
  const [warMode, setWarMode] = useState(false);
  const [cut, setCut] = useState<CutState>(EMPTY_CUT);
  const [pendingCables, setPendingCables] = useState<string[]>([]);
  const [activeScenario, setActiveScenario] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [highlightedPair, setHighlightedPair] = useState<LatencyResult | null>(null);

  // Chargement : le JSON principal est bloquant, les couches de contexte sont optionnelles
  useEffect(() => {
    fetchJson<SubnetData>('subnet_data.json').then(setData).catch((e: Error) => setError(e.message));
    fetchJson<BackgroundCable[]>('background_cables.json').then(setBackground).catch(() => setBackground([]));
    fetchJson<{ features: CountryFeature[] }>('countries.geojson')
      .then((g) => setCountries(g.features.filter((f) => f.properties.iso2 !== 'AQ')))
      .catch(() => setCountries([]));
  }, []);

  // Lien profond : #scenario=<id> ouvre directement le War Game sur un scénario
  useEffect(() => {
    if (!data) return;
    const params = new URLSearchParams(window.location.hash.slice(1));
    const scenario = data.scenarios.find((s) => s.id === params.get('scenario'));
    if (scenario) {
      setWarMode(true);
      setCut({ cables: [...scenario.cables], chokepoints: [...scenario.chokepoints], hubs: [...scenario.hubs] });
      setActiveScenario(scenario.id);
    }
    // #focus=<cable|hub|country|chokepoint>:<id> ouvre l'inspecteur sur un élément
    const [type, id] = (params.get('focus') ?? '').split(':');
    if (id && ['cable', 'hub', 'country', 'chokepoint'].includes(type)) {
      setSelection({ type, id } as Exclude<Selection, null>);
    }
  }, [data]);

  useEffect(() => {
    if (!data) return;
    const next = activeScenario ? `#scenario=${activeScenario}` : '';
    if (window.location.hash !== next) {
      history.replaceState(null, '', `${window.location.pathname}${window.location.search}${next}`);
    }
  }, [activeScenario, data]);

  const engine = useMemo(() => (data ? new SimulationEngine(data) : null), [data]);
  const sim = useMemo(() => (engine ? engine.simulate(cut) : null), [engine, cut]);
  const centroids = useMemo(
    () => computeCountryCentroids(countries, data?.landingPoints ?? []),
    [countries, data],
  );

  // La route surlignée doit suivre le résultat courant de la simulation
  useEffect(() => {
    if (!highlightedPair || !sim) return;
    const fresh = sim.latencies.find((l) => l.from === highlightedPair.from && l.to === highlightedPair.to) ?? null;
    if (fresh !== highlightedPair) setHighlightedPair(fresh);
  }, [sim, highlightedPair]);

  const updateCut = useCallback((next: CutState) => {
    setCut(next);
    setActiveScenario(null);
  }, []);

  const handleScenario = useCallback((s: Scenario) => {
    setCut({ cables: [...s.cables], chokepoints: [...s.chokepoints], hubs: [...s.hubs] });
    setActiveScenario(s.id);
    setPendingCables([]);
    setHighlightedPair(null);
  }, []);

  const handleToggleChokepoint = useCallback(
    (id: string) => {
      setWarMode(true);
      updateCut({ ...cut, chokepoints: toggle(cut.chokepoints, id) });
    },
    [cut, updateCut],
  );

  const handleCutCable = useCallback(
    (id: string) => {
      setWarMode(true);
      if (!cut.cables.includes(id)) updateCut({ ...cut, cables: [...cut.cables, id] });
      setPendingCables((p) => p.filter((x) => x !== id));
    },
    [cut, updateCut],
  );

  const handleBlackoutHub = useCallback(
    (id: string) => {
      setWarMode(true);
      if (!cut.hubs.includes(id)) updateCut({ ...cut, hubs: [...cut.hubs, id] });
    },
    [cut, updateCut],
  );

  const handleCutPending = useCallback(() => {
    updateCut({ ...cut, cables: [...new Set([...cut.cables, ...pendingCables])] });
    setPendingCables([]);
  }, [cut, pendingCables, updateCut]);

  const handleRemoveCut = useCallback(
    (kind: keyof CutState, id: string) => updateCut({ ...cut, [kind]: cut[kind].filter((x) => x !== id) }),
    [cut, updateCut],
  );

  const handleReset = useCallback(() => {
    updateCut(EMPTY_CUT);
    setPendingCables([]);
    setHighlightedPair(null);
  }, [updateCut]);

  const handleTogglePending = useCallback(
    (id: string) => {
      if (cut.cables.includes(id)) return;
      setPendingCables((p) => toggle(p, id));
    },
    [cut.cables],
  );

  const handleToggleWarMode = useCallback(() => {
    if (warMode) {
      setCut(EMPTY_CUT);
      setPendingCables([]);
      setActiveScenario(null);
      setHighlightedPair(null);
    }
    setWarMode(!warMode);
  }, [warMode]);

  if (error) {
    return (
      <div className="grid h-full place-items-center p-6">
        <div className="glass max-w-md p-6 text-center">
          <TriangleAlert className="mx-auto mb-3 h-8 w-8 text-neon-red" />
          <div className="hud-title mb-2">Données indisponibles</div>
          <p className="text-sm text-slate-400">{error}</p>
          <p className="mt-3 font-mono text-xs text-slate-500">
            Régénérez-les avec : python scripts/update_cables_and_outages.py
          </p>
        </div>
      </div>
    );
  }

  if (!data || !engine || !sim) {
    return (
      <div className="grid h-full place-items-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-neon-cyan" />
          <div className="hud-label">Initialisation du radar…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-void">
      <GlobeRadar
        data={data}
        background={background}
        countries={countries}
        centroids={centroids}
        colorMode={colorMode}
        layers={layers}
        sim={sim}
        cut={cut}
        warMode={warMode}
        pendingCables={pendingCables}
        selection={selection}
        highlightedPair={highlightedPair}
        onSelect={setSelection}
        onToggleCableForCut={handleTogglePending}
      />

      <div className="pointer-events-none absolute inset-0 flex flex-col">
        <ControlBar
          data={data}
          colorMode={colorMode}
          onColorModeChange={setColorMode}
          layers={layers}
          onLayersChange={setLayers}
          warMode={warMode}
          onToggleWarMode={handleToggleWarMode}
          onSelect={setSelection}
        />

        <div className="relative flex-1">
          {warMode ? (
            <CrisisSimulatorPanel
              data={data}
              sim={sim}
              cut={cut}
              pendingCables={pendingCables}
              activeScenario={activeScenario}
              highlightedPair={highlightedPair}
              onApplyScenario={handleScenario}
              onToggleChokepoint={handleToggleChokepoint}
              onTogglePending={handleTogglePending}
              onCutPending={handleCutPending}
              onRemoveCut={handleRemoveCut}
              onReset={handleReset}
              onHighlightPair={setHighlightedPair}
              onSelect={setSelection}
              onClose={handleToggleWarMode}
            />
          ) : (
            layers.alerts && <AlertFeed data={data} onSelect={setSelection} />
          )}

          {selection && (
            <InspectorSidebar
              data={data}
              engine={engine}
              sim={sim}
              cut={cut}
              selection={selection}
              onClose={() => setSelection(null)}
              onSelect={setSelection}
              onCutCable={handleCutCable}
              onBlackoutHub={handleBlackoutHub}
              onToggleChokepoint={handleToggleChokepoint}
            />
          )}

          <Legend colorMode={colorMode} simActive={!sim.isBaseline} />
        </div>
      </div>
    </div>
  );
}
