# SubNet 3D · Cyber & Geopolitical Submarine Cable Radar

Globe 3D interactif des **25 câbles sous-marins les plus stratégiques**, de leurs landing points, des **6 chokepoints géopolitiques** et des anomalies BGP en temps quasi réel. Il inclut un **simulateur de crise (War Game)** : sabotage de câbles, blocus de détroits, blackout de hubs, avec recalcul instantané du reroutage, des latences, des pays impactés et du coût économique estimé.

100 % statique et gratuit : un pipeline Python tourne chaque nuit dans GitHub Actions, régénère `public/data/*.json`, puis le site est redéployé sur GitHub Pages ou Vercel.

## Démarrage

```bash
npm install
npm run dev          # http://localhost:5173
```

Les données sont déjà présentes dans `public/data/` : aucun téléchargement n'est nécessaire au premier lancement.

Régénérer les données localement (Python 3.11+) :

```bash
python -m venv .venv && .venv/Scripts/activate   # Windows (source .venv/bin/activate sous Linux/macOS)
pip install -r scripts/requirements.txt
python scripts/update_cables_and_outages.py      # --skip-telemetry / --skip-cables disponibles
```

## Déploiement

**GitHub Pages** : *Settings → Pages → Source : GitHub Actions*. Le workflow `deploy_pages.yml` publie à chaque push sur `main` et après chaque mise à jour quotidienne des données.

**Vercel** : importer le dépôt, aucun réglage requis (`vercel.json` fourni). Chaque commit du bot de données déclenche un redéploiement.

Liens partageables : `#scenario=red-sea-crisis`, `#scenario=taiwan-blockade`, `#scenario=baltic-north-atlantic`, `#scenario=marseille-blackout`, combinables avec `&focus=cable:2africa` (ou `hub:marseille-france`, `country:EG`, `chokepoint:red-sea`).

## Arborescence

```
.github/workflows/
  update_subnet_data.yml     cron 03:00 UTC → TeleGeography + RIPEstat + IODA → commit des JSON
  deploy_pages.yml           build Vite → GitHub Pages
scripts/
  update_cables_and_outages.py   pipeline (géométrie → topologie segmentée, télémétrie)
  catalog.py                     données curées : capacités, chokepoints, pays, métropoles, scénarios
  requirements.txt
public/data/
  subnet_data.json           câbles, landing points, graphe (nœuds/arêtes), pays, alertes
  background_cables.json     ~700 câbles simplifiés (couche de contexte)
  countries.geojson          frontières Natural Earth 1:110m
src/
  types.ts                   schéma des données et de la simulation
  utils/simulationEngine.ts  graphe, Dijkstra, affectation de trafic, impacts
  utils/{colors,format,geo}.ts
  components/
    GlobeRadar.tsx           react-globe.gl : câbles, points, anneaux radar, pays, arcs
    ControlBar.tsx           modes de coloration, couches, recherche, état des sources
    CrisisSimulatorPanel.tsx War Game : scénarios, détroits, sabotage manuel, résultats
    InspectorSidebar.tsx     fiche technique / souveraineté / télémétrie
    Legend.tsx, AlertFeed.tsx
  App.tsx, main.tsx, index.css
```

## Modèle de simulation

- **Topologie réelle** : les tracés TeleGeography sont découpés en segments entre landing points et unités de branchement. Un détroit bloqué coupe uniquement les segments qui le traversent : 2Africa continue par exemple de fonctionner autour de l'Afrique pendant une crise en Mer Rouge.
- **Backhaul terrestre** : il relie les nœuds d'une même masse continentale. Il est abondant en Europe et en Amérique du Nord, étroit au Moyen-Orient et en Afrique.
- **Latence** : RTT = 2 × longueur × 4,9 µs/km, avec un surcoût de congestion.
- **Reroutage** : la demande gravitaire entre 39 métropoles est affectée par incréments sur les plus courts chemins avec une fonction de congestion BPR. Les câbles qui absorbent le report s'allument en jaune, orange ou rouge.
- **Pays** : on mesure la part de la capacité internationale (câbles stratégiques et liens terrestres transfrontaliers) qui ne joint plus ses destinations.
- **Économie** : PIB horaire × part numérique × (perte de capacité + pénalité de latence).

Ces chiffres sont des ordres de grandeur pédagogiques, pas des prévisions.

## Sources et licences

- [TeleGeography Submarine Cable Map](https://www.submarinecablemap.com) : CC BY-NC-SA 3.0, usage non commercial et attribution obligatoire.
- [RIPEstat Data API](https://stat.ripe.net/docs/data_api) : préfixes et ASN annoncés par pays.
- [IODA](https://ioda.inetintel.cc.gatech.edu) (Georgia Tech) : détection de pannes Internet.
- [Natural Earth](https://www.naturalearthdata.com) : frontières, domaine public.
- Capacités, profondeurs, groupes de contrôle et incidents : catalogue curé (`scripts/catalog.py`) d'après des sources publiques.
