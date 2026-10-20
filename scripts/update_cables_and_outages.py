#!/usr/bin/env python3
"""
SubNet 3D - pipeline de données quotidien (GitHub Actions, 100 % gratuit).

1. TeleGeography Submarine Cable Map (API publique v3)
   - géométrie réelle des câbles (cable-geo.json) -> topologie segmentée
     (landing points + unités de branchement) utilisée par le simulateur ;
   - fiches câbles (owners, suppliers, longueur, RFS, landing points) ;
   - landing points (landing-point-geo.json) ;
   - réseau mondial simplifié pour la couche de contexte.
2. RIPEstat (country-routing-stats) : préfixes BGP / ASN annoncés par pays,
   détection des chutes brutales de préfixes sur 30 jours.
3. IODA (Georgia Tech) : événements de panne Internet par pays (BGP, ping, Google).

Sorties :
  public/data/subnet_data.json       (données stratégiques + graphe + télémétrie)
  public/data/background_cables.json (≈700 câbles simplifiés, couche de contexte)
  public/data/countries.geojson      (Natural Earth 1:110m, téléchargé une fois)

Chaque source est optionnelle : si une API échoue, la section correspondante du
JSON existant est conservée, le pipeline ne casse jamais le site.

Usage :
  python scripts/update_cables_and_outages.py              # tout
  python scripts/update_cables_and_outages.py --skip-telemetry
  python scripts/update_cables_and_outages.py --skip-cables
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import statistics
import sys
import time
import unicodedata
from pathlib import Path

try:  # magasin de certificats du système (chaînes TLS incomplètes côté certifi, ex. IODA)
    import truststore

    truststore.inject_into_ssl()  # doit précéder l'import de requests / urllib3
except ImportError:
    pass

import requests  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
import catalog  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "public" / "data"
OUT_FILE = DATA_DIR / "subnet_data.json"
BG_FILE = DATA_DIR / "background_cables.json"
COUNTRIES_FILE = DATA_DIR / "countries.geojson"

TG_API = "https://www.submarinecablemap.com/api/v3"
RIPESTAT_API = "https://stat.ripe.net/data/country-routing-stats/data.json"
IODA_API = "https://api.ioda.inetintel.cc.gatech.edu/v2/outages/events"
COUNTRIES_URL = (
    "https://raw.githubusercontent.com/vasturiano/react-globe.gl/master/"
    "example/datasets/ne_110m_admin_0_countries.geojson"
)

EARTH_RADIUS_KM = 6371.0
SNAP_KM = 25.0            # tolérance de raccordement branche -> tronc (unités de branchement)
MERGE_KM = 1.0            # fusion des sommets dupliqués
BRIDGE_KM = 80.0          # pontage des discontinuités du tracé TeleGeography
LP_ATTACH_KM = 30.0       # un landing point est fusionné au sommet le plus proche sous ce seuil
ZONE_SAMPLE_KM = 15.0     # pas d'échantillonnage pour le test d'intersection avec les chokepoints

SESSION = requests.Session()
SESSION.headers.update({"User-Agent": "SubNet3D-data-pipeline/1.0 (+https://github.com)"})


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def log(msg: str) -> None:
    print(f"[subnet] {msg}", flush=True)


def http_json(url: str, params: dict | None = None, timeout: int = 60, retries: int = 3):
    last_err: Exception | None = None
    for attempt in range(retries):
        try:
            resp = SESSION.get(url, params=params, timeout=timeout)
            resp.raise_for_status()
            return resp.json()
        except (requests.RequestException, ValueError) as err:
            last_err = err
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"GET {url} failed: {last_err}")


# ---------------------------------------------------------------------------
# Géométrie
# ---------------------------------------------------------------------------
def norm_lng(lng: float) -> float:
    lng = ((lng + 180.0) % 360.0) - 180.0
    return 180.0 if lng == -180.0 else lng


def haversine(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Distance en km entre deux points [lng, lat]."""
    lng1, lat1 = math.radians(a[0]), math.radians(a[1])
    lng2, lat2 = math.radians(b[0]), math.radians(b[1])
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(min(1.0, math.sqrt(h)))


def project_on_segment(p, a, b):
    """Projection de p sur [a, b] dans un plan équirectangulaire local. Retourne (dist_km, t, point)."""
    lat0 = math.radians(p[1])
    kx = math.cos(lat0) * 111.32
    ky = 110.57

    def dlng(x, ref):
        d = x - ref
        return (d + 180.0) % 360.0 - 180.0

    ax, ay = dlng(a[0], p[0]) * kx, (a[1] - p[1]) * ky
    bx, by = dlng(b[0], p[0]) * kx, (b[1] - p[1]) * ky
    vx, vy = bx - ax, by - ay
    seg2 = vx * vx + vy * vy
    t = 0.0 if seg2 == 0 else max(0.0, min(1.0, -(ax * vx + ay * vy) / seg2))
    cx, cy = ax + t * vx, ay + t * vy
    dist = math.hypot(cx, cy)
    point = [a[0] + t * dlng(b[0], a[0]), a[1] + t * (b[1] - a[1])]
    return dist, t, point


def path_length(coords) -> float:
    return sum(haversine(coords[i], coords[i + 1]) for i in range(len(coords) - 1))


def densify(coords, step_km: float = ZONE_SAMPLE_KM):
    out = [coords[0]]
    for i in range(len(coords) - 1):
        a, b = coords[i], coords[i + 1]
        d = haversine(a, b)
        n = max(1, int(d // step_km))
        dl = ((b[0] - a[0]) + 180.0) % 360.0 - 180.0
        for k in range(1, n + 1):
            t = k / n
            out.append([a[0] + dl * t, a[1] + (b[1] - a[1]) * t])
    return out


def chokepoints_crossed(coords, terrestrial: bool = False) -> list[str]:
    hits = []
    samples = densify(coords)
    for cp in catalog.CHOKEPOINTS:
        if terrestrial and not cp.get("cutsTerrestrial"):
            continue
        for lat, lng, radius in cp["zones"]:
            if any(haversine(s, (lng, lat)) <= radius for s in samples):
                hits.append(cp["id"])
                break
    return hits


def fold(name: str) -> str:
    return unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower().strip()


COUNTRY_INDEX = {fold(k): k for k in catalog.COUNTRIES}


def country_profile(name: str):
    key = fold(name)
    if key in COUNTRY_INDEX:
        return catalog.COUNTRIES[COUNTRY_INDEX[key]]
    if "ivoire" in key:
        return catalog.COUNTRIES["Cote d'Ivoire"]
    return None


# ---------------------------------------------------------------------------
# Topologie d'un câble : lignes TeleGeography -> graphe réduit (LP + unités de branchement)
# ---------------------------------------------------------------------------
class UnionFind:
    def __init__(self):
        self.parent: dict = {}

    def find(self, x):
        self.parent.setdefault(x, x)
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]
            x = self.parent[x]
        return x

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.parent[rb] = ra


def vkey(p) -> tuple[float, float]:
    return (round(norm_lng(p[0]), 4), round(p[1], 4))


def build_cable_topology(cable_id: str, lines: list[list[list[float]]], landing_points: list[dict]):
    lines = [[list(map(float, pt[:2])) for pt in line] for line in lines if len(line) >= 2]
    uf = UnionFind()

    # 1. Raccordement des extrémités de branches sur les autres lignes (unités de branchement)
    insertions: dict[int, list] = {}
    snaps = []
    for i, line in enumerate(lines):
        for end in (line[0], line[-1]):
            best = None
            for j, other in enumerate(lines):
                if j == i:
                    continue
                for k in range(len(other) - 1):
                    d, t, pt = project_on_segment(end, other[k], other[k + 1])
                    if d <= SNAP_KM and (best is None or d < best[0]):
                        best = (d, j, k, t, pt)
            if best is None:
                continue
            _, j, k, t, pt = best
            other = lines[j]
            if haversine(pt, other[k]) <= MERGE_KM * 2 or t <= 0.0:
                snaps.append((end, other[k]))
            elif haversine(pt, other[k + 1]) <= MERGE_KM * 2 or t >= 1.0:
                snaps.append((end, other[k + 1]))
            else:
                insertions.setdefault(j, []).append((k, t, pt))
                snaps.append((end, pt))
    for j, items in insertions.items():
        for k, t, pt in sorted(items, key=lambda x: (x[0], x[1]), reverse=True):
            lines[j].insert(k + 1, pt)
    for a, b in snaps:
        uf.union(vkey(a), vkey(b))

    # 2. Fusion des sommets quasi identiques entre lignes différentes (y compris ±180°)
    ends = [(i, p) for i, line in enumerate(lines) for p in (line[0], line[-1])]
    for x in range(len(ends)):
        for y in range(x + 1, len(ends)):
            if ends[x][0] != ends[y][0] and haversine(ends[x][1], ends[y][1]) <= MERGE_KM:
                uf.union(vkey(ends[x][1]), vkey(ends[y][1]))

    # 3. Graphe de sommets
    coords_of: dict = {}
    adj: dict = {}
    raw_edges = []
    for line in lines:
        for a, b in zip(line, line[1:]):
            ka, kb = uf.find(vkey(a)), uf.find(vkey(b))
            coords_of.setdefault(ka, a)
            coords_of.setdefault(kb, b)
            if ka == kb:
                continue
            eid = len(raw_edges)
            raw_edges.append((ka, kb, a, b))
            adj.setdefault(ka, []).append(eid)
            adj.setdefault(kb, []).append(eid)

    # 3b. Pontage des petites discontinuités du tracé (< BRIDGE_KM) entre composantes
    while True:
        comp = UnionFind()
        for ka, kb, _, _ in raw_edges:
            comp.union(ka, kb)
        groups: dict = {}
        for v in coords_of:
            groups.setdefault(comp.find(v), []).append(v)
        if len(groups) <= 1:
            break
        keys = list(groups)
        best = None
        for gi in range(len(keys)):
            for gj in range(gi + 1, len(keys)):
                for va in groups[keys[gi]]:
                    for vb in groups[keys[gj]]:
                        d = haversine(coords_of[va], coords_of[vb])
                        if best is None or d < best[0]:
                            best = (d, va, vb)
        if best is None or best[0] > BRIDGE_KM:
            break
        _, va, vb = best
        eid = len(raw_edges)
        raw_edges.append((va, vb, coords_of[va], coords_of[vb]))
        adj.setdefault(va, []).append(eid)
        adj.setdefault(vb, []).append(eid)

    # 4. Rattachement des landing points
    lp_node: dict = {}      # sommet -> id LP
    stubs = []              # (lp_id, sommet, coords LP)
    for lp in landing_points:
        p = (lp["lng"], lp["lat"])
        if not coords_of:
            break
        nearest = min(coords_of, key=lambda k: haversine(coords_of[k], p))
        d = haversine(coords_of[nearest], p)
        if d <= LP_ATTACH_KM and nearest not in lp_node:
            lp_node[nearest] = lp["id"]
        else:
            stubs.append((lp["id"], nearest, [lp["lng"], lp["lat"]], d))

    # 5. Réduction : chaînes entre nœuds clés (LP ou degré != 2)
    def is_key(v):
        return v in lp_node or len(adj.get(v, [])) != 2 or any(s[1] == v for s in stubs)

    node_name: dict = {}
    bu_counter = [0]

    def name_of(v):
        if v in lp_node:
            return "lp:" + lp_node[v]
        if v not in node_name:
            node_name[v] = f"bu:{cable_id}:{bu_counter[0]}"
            bu_counter[0] += 1
        return node_name[v]

    visited = set()
    reduced = []
    for start in list(adj):
        if not is_key(start):
            continue
        for eid in adj[start]:
            if eid in visited:
                continue
            path_keys = [start]
            coords = [coords_of[start]]
            cur, e = start, eid
            while True:
                visited.add(e)
                ka, kb, a, b = raw_edges[e]
                nxt = kb if ka == cur else ka
                coords.append(coords_of[nxt] if nxt in coords_of else (b if nxt == kb else a))
                path_keys.append(nxt)
                cur = nxt
                if is_key(cur):
                    break
                nxt_edges = [x for x in adj[cur] if x not in visited]
                if not nxt_edges:
                    break
                e = nxt_edges[0]
            reduced.append({"from": name_of(start), "to": name_of(cur), "coords": coords})

    for lp_id, v, lp_coords, d in stubs:
        reduced.append({"from": "lp:" + lp_id, "to": name_of(v), "coords": [lp_coords, coords_of[v]]})

    bu_nodes = {name: coords_of[v] for v, name in node_name.items()}

    # Diagnostic de connexité
    uf2 = UnionFind()
    for e in reduced:
        uf2.union(e["from"], e["to"])
    comps = {uf2.find(e["from"]) for e in reduced}
    if len(comps) > 1:
        log(f"  ! {cable_id}: {len(comps)} composantes connexes (géométrie fragmentée)")
    return reduced, bu_nodes


# ---------------------------------------------------------------------------
# TeleGeography
# ---------------------------------------------------------------------------
def fetch_telegeography():
    log("TeleGeography : téléchargement de cable-geo, landing points et fiches câbles…")
    cable_geo = http_json(f"{TG_API}/cable/cable-geo.json")
    lp_geo = http_json(f"{TG_API}/landing-point/landing-point-geo.json")
    lp_coords = {
        f["properties"]["id"]: (f["geometry"]["coordinates"][0], f["geometry"]["coordinates"][1])
        for f in lp_geo["features"]
    }
    geo_by_id = {f["properties"]["id"]: f for f in cable_geo["features"]}
    details = {}
    for cid in catalog.STRATEGIC_CABLES:
        details[cid] = http_json(f"{TG_API}/cable/{cid}.json")
        time.sleep(0.2)
    return cable_geo, geo_by_id, lp_coords, details


def parse_length(text) -> float | None:
    if not text:
        return None
    digits = "".join(ch for ch in str(text) if ch.isdigit() or ch == ".")
    try:
        return float(digits) if digits else None
    except ValueError:
        return None


def owner_share(owners: list[str], bloc: str) -> float:
    if not owners:
        return 0.0
    kws = catalog.OWNER_BLOCS[bloc]
    hits = sum(1 for o in owners if any(k in o.lower() for k in kws))
    return round(hits / len(owners), 3)


def supplier_origin(suppliers: list[str]) -> list[str]:
    origins = []
    for s in suppliers:
        for key, origin in catalog.SUPPLIER_ORIGIN.items():
            if key in s.lower() and origin not in origins:
                origins.append(origin)
    return origins


def risk_score(chokepoint_ids: list[str], avg_depth: float, incidents: list[dict]) -> int:
    cp_risk = {cp["id"]: cp["risk"] for cp in catalog.CHOKEPOINTS}
    exposure = sorted((cp_risk[c] for c in chokepoint_ids), reverse=True)
    score = 10.0
    for rank, r in enumerate(exposure):
        score += r * (0.55 if rank == 0 else 0.15)
    if avg_depth < 200:
        score += 20      # mer peu profonde : ancres et chalutage
    elif avg_depth < 1000:
        score += 8
    score += 4 * len(incidents)
    return int(max(0, min(100, round(score))))


def landmass_for(iso2: str) -> str:
    for prof in catalog.COUNTRIES.values():
        if prof[0] == iso2:
            return prof[2]
    return iso2


def build_strategic_dataset(geo_by_id, lp_coords, details):
    cables, edges = [], []
    nodes: dict = {}
    landing_points: dict = {}
    now = dt.datetime.now(dt.timezone.utc)

    for cid, meta in catalog.STRATEGIC_CABLES.items():
        det = details[cid]
        geo = geo_by_id.get(cid)
        if geo is None:
            log(f"  ! {cid}: absent de cable-geo.json, ignoré")
            continue
        lps = []
        for lp in det.get("landing_points", []):
            if lp["id"] not in lp_coords:
                continue
            prof = country_profile(lp.get("country") or "")
            if prof is None:
                log(f"  ! pays inconnu dans le catalogue : {lp.get('country')}")
                continue
            lng, lat = lp_coords[lp["id"]]
            lps.append({"id": lp["id"], "lng": lng, "lat": lat})
            entry = landing_points.setdefault(lp["id"], {
                "id": lp["id"], "name": lp["name"].split(",")[0].strip(), "fullName": lp["name"],
                "country": prof[0], "lat": round(lat, 4), "lng": round(lng, 4), "cableIds": [],
            })
            entry["cableIds"].append(cid)

        lines = geo["geometry"]["coordinates"]
        if geo["geometry"]["type"] == "LineString":
            lines = [lines]
        reduced, bu_nodes = build_cable_topology(cid, lines, lps)
        for name, c in bu_nodes.items():
            nodes[name] = {"id": name, "kind": "bu", "lat": round(c[1], 3), "lng": round(c[0], 3)}

        cable_cps: list[str] = []
        for idx, e in enumerate(reduced):
            coords = [[round(norm_lng(p[0]), 3), round(p[1], 3)] for p in e["coords"]]
            cps = chokepoints_crossed(e["coords"])
            for c in cps:
                if c not in cable_cps:
                    cable_cps.append(c)
            edges.append({
                "id": f"{cid}#{idx}", "kind": "cable", "cableId": cid, "from": e["from"], "to": e["to"],
                "lengthKm": round(path_length(e["coords"]), 1), "capacityTbps": meta["capacityTbps"],
                "chokepoints": cps, "coords": coords,
            })

        owners = [o.strip() for o in (det.get("owners") or "").split(",") if o.strip()]
        suppliers = [s.strip() for s in (det.get("suppliers") or "").split(",") if s.strip()]
        countries = sorted({landing_points[lp["id"]]["country"] for lp in lps})
        incidents = meta["incidents"]
        recent = [i for i in incidents
                  if (now - dt.datetime.fromisoformat(i["date"]).replace(tzinfo=dt.timezone.utc)).days <= 30]
        status = "planned" if det.get("is_planned") else ("degraded" if recent else "operational")
        cables.append({
            "id": cid,
            "name": det.get("name") or geo["properties"]["name"],
            "tgColor": geo["properties"].get("color", "#00e5ff"),
            "lengthKm": parse_length(det.get("length")) or round(sum(e["lengthKm"] for e in edges if e["cableId"] == cid)),
            "rfs": det.get("rfs") or "",
            "rfsYear": det.get("rfs_year"),
            "isPlanned": bool(det.get("is_planned")),
            "capacityTbps": meta["capacityTbps"],
            "fiberPairs": meta["fiberPairs"],
            "owners": owners,
            "suppliers": suppliers,
            "ownerGroup": meta["ownerGroup"],
            "landingPointIds": [lp["id"] for lp in lps],
            "countries": countries,
            "avgDepthM": meta["avgDepthM"],
            "chokepoints": cable_cps,
            "riskScore": risk_score(cable_cps, meta["avgDepthM"], incidents),
            "sovereignty": {
                "gafamShare": owner_share(owners, "gafam"),
                "chinaShare": owner_share(owners, "china"),
                "europeShare": owner_share(owners, "europe"),
                "supplierOrigin": supplier_origin(suppliers),
                "note": meta["sovereignty"],
            },
            "incidents": incidents,
            "status": status,
            "url": det.get("url"),
        })
        log(f"  ✓ {cid}: {len(reduced)} segments, {len(lps)} landing points, chokepoints={cable_cps}")

    for lp in landing_points.values():
        nodes["lp:" + lp["id"]] = {"id": "lp:" + lp["id"], "kind": "lp", "lat": lp["lat"], "lng": lp["lng"],
                                    "country": lp["country"]}
    for mid, (name, lat, lng, iso2, landmass, weight) in catalog.METROS.items():
        nodes["m:" + mid] = {"id": "m:" + mid, "kind": "metro", "lat": lat, "lng": lng, "country": iso2}

    edges.extend(build_terrestrial_edges(nodes))

    # Hubs : degré (nombre de câbles stratégiques) + liste curée
    for lp in landing_points.values():
        lp["cableIds"] = sorted(set(lp["cableIds"]))
        lp["isCriticalHub"] = lp["id"] in catalog.CRITICAL_HUBS or len(lp["cableIds"]) >= 3
    return cables, list(landing_points.values()), list(nodes.values()), edges


def build_terrestrial_edges(nodes: dict) -> list[dict]:
    """Backhaul terrestre : relie les nœuds d'une même masse terrestre (k plus proches voisins)."""
    land = []
    for n in nodes.values():
        if n["kind"] == "bu":
            continue
        landmass = catalog.METROS[n["id"][2:]][4] if n["kind"] == "metro" else landmass_for(n["country"])
        land.append((n, landmass))

    seen = set()
    out = []
    eu_na = {"eurasia-eu", "north-america"}

    def region_of(node, landmass):
        if landmass == "eurasia":
            prof = next((p for p in catalog.COUNTRIES.values() if p[0] == node.get("country")), None)
            if node.get("country") in ("NL", "SE") or (prof and prof[1] == "EU"):
                return "eurasia-eu"
        return landmass

    for n, lm in land:
        p = (n["lng"], n["lat"])
        same = [(haversine(p, (m["lng"], m["lat"])), m) for m, lm2 in land if lm2 == lm and m["id"] != n["id"]]
        same.sort(key=lambda x: x[0])
        limit = 2500.0 if n["kind"] == "metro" else 1500.0
        picked = [(d, m) for d, m in same if d <= (3000.0 if n["kind"] == m["kind"] == "metro" else limit)]
        picked = picked[: (8 if n["kind"] == "metro" else 4)]
        if not picked and same and same[0][0] <= limit:
            picked = same[:1]
        for d, m in picked:
            key = tuple(sorted((n["id"], m["id"])))
            if key in seen:
                continue
            seen.add(key)
            r1, r2 = region_of(n, lm), region_of(m, lm)
            developed = r1 in eu_na and r2 in eu_na
            # capacités de backhaul : abondantes en Europe / Amérique du Nord et en métropole,
            # rares ailleurs (les routes terrestres Moyen-Orient / Afrique sont des secours étroits)
            if d <= 60:
                cap, factor = 1000.0, 1.2
            elif developed:
                cap, factor = 1000.0, 1.3
            elif lm == "africa":
                cap, factor = 2.0, 1.8
            else:
                cap, factor = 4.0, 1.8
            coords = [[n["lng"], n["lat"]], [m["lng"], m["lat"]]]
            out.append({
                "id": f"terr:{key[0]}|{key[1]}", "kind": "terrestrial", "cableId": None,
                "from": n["id"], "to": m["id"], "lengthKm": round(d * factor, 1), "capacityTbps": cap,
                "chokepoints": chokepoints_crossed(coords, terrestrial=True),
            })
    log(f"  ✓ {len(out)} liens terrestres de backhaul générés")
    return out


def build_background(cable_geo, strategic_ids) -> list[dict]:
    """Réseau mondial simplifié (≈700 câbles) pour la couche de contexte."""
    out = []
    for f in cable_geo["features"]:
        pid = f["properties"]["id"]
        if pid in strategic_ids:
            continue
        geom = f["geometry"]
        lines = geom["coordinates"] if geom["type"] == "MultiLineString" else [geom["coordinates"]]
        simplified = []
        for line in lines:
            pts = [[round(p[0], 2), round(p[1], 2)] for p in line]
            dedup = [pts[0]] + [p for i, p in enumerate(pts[1:], 1) if p != pts[i - 1]]
            if len(dedup) >= 2:
                simplified.append(dedup)
        if simplified:
            out.append({"id": pid, "name": f["properties"]["name"], "color": f["properties"].get("color"),
                        "lines": simplified})
    return out


# ---------------------------------------------------------------------------
# Profils pays + télémétrie
# ---------------------------------------------------------------------------
def build_country_profiles(cables, landing_points):
    by_iso = {}
    for name, (iso2, continent, landmass, gdp, digital) in catalog.COUNTRIES.items():
        by_iso[iso2] = {
            "iso2": iso2, "name": name if iso2 != "CI" else "Côte d'Ivoire",
            "continent": continent, "continentLabel": catalog.CONTINENT_LABELS[continent],
            "landmass": landmass, "gdpUsdBn": gdp, "digitalShare": digital,
            "landingPointIds": [], "cableIds": [], "internationalCapacityTbps": 0.0,
            "routing": None, "outage": None,
        }
    for lp in landing_points:
        if lp["country"] in by_iso:
            by_iso[lp["country"]]["landingPointIds"].append(lp["id"])
    for c in cables:
        for iso in c["countries"]:
            if iso in by_iso and c["id"] not in by_iso[iso]["cableIds"]:
                by_iso[iso]["cableIds"].append(c["id"])
                by_iso[iso]["internationalCapacityTbps"] += c["capacityTbps"]
    return [p for p in by_iso.values() if p["cableIds"]]


def fetch_ripestat(countries) -> dict:
    log("RIPEstat : statistiques de routage BGP par pays (30 jours)…")
    start = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=30)).strftime("%Y-%m-%dT00:00")
    out = {}
    for c in countries:
        try:
            data = http_json(RIPESTAT_API, {"resource": c["iso2"], "starttime": start}, timeout=40, retries=2)
            stats = data.get("data", {}).get("stats", [])
            history = [{
                "date": s["timeline"][0]["starttime"][:10],
                "v4": s.get("v4_prefixes_ris", 0),
                "v6": s.get("v6_prefixes_ris", 0),
                "asns": s.get("asns_ris", 0),
            } for s in stats if s.get("timeline")]
            if len(history) < 3:
                continue
            last = history[-1]
            baseline = statistics.median(h["v4"] for h in history[:-1]) or 1
            delta = (last["v4"] - baseline) / baseline * 100
            # les micro-réseaux (< 50 préfixes) produisent des variations non significatives
            if baseline < 50:
                status = "normal"
            else:
                status = "anomaly" if delta <= -8 else ("watch" if delta <= -3 else "normal")
            out[c["iso2"]] = {
                "v4Prefixes": last["v4"], "v6Prefixes": last["v6"], "asns": last["asns"],
                "deltaPct": round(delta, 2), "status": status, "history": history,
            }
        except RuntimeError as err:
            log(f"  ! RIPEstat {c['iso2']}: {err}")
        time.sleep(0.4)
    log(f"  ✓ {len(out)} pays enrichis par RIPEstat")
    return out


def fetch_ioda() -> list[dict]:
    log("IODA : événements de panne Internet (72 h)…")
    until = int(time.time())
    since = until - 72 * 3600
    data = http_json(IODA_API, {"from": since, "until": until, "entityType": "country"}, timeout=90)
    per_country: dict = {}
    for ev in data.get("data", []):
        loc = ev.get("location", "")
        if not loc.startswith("country/"):
            continue
        iso2 = loc.split("/", 1)[1]
        end = ev["start"] + (ev.get("duration") or 0)
        if end < until - 48 * 3600:
            continue
        agg = per_country.setdefault(iso2, {
            "iso2": iso2, "countryName": ev.get("location_name", iso2), "score": 0.0,
            "datasources": [], "start": ev["start"], "events": 0,
        })
        agg["score"] = max(agg["score"], float(ev.get("score") or 0))
        agg["events"] += 1
        agg["start"] = min(agg["start"], ev["start"])
        if ev.get("datasource") and ev["datasource"] not in agg["datasources"]:
            agg["datasources"].append(ev["datasource"])
    alerts = sorted(per_country.values(), key=lambda a: -a["score"])
    log(f"  ✓ {len(alerts)} pays avec événements IODA récents")
    return alerts


def build_alerts(ioda: list[dict], routing: dict, countries) -> list[dict]:
    names = {c["iso2"]: c["name"] for c in countries}
    alerts = []
    for a in ioda:
        log_score = math.log10(max(a["score"], 1))
        if log_score < 3.5:
            continue
        severity = "critical" if log_score >= 5 else "high" if log_score >= 4.3 else "medium"
        sources = ", ".join(a["datasources"])
        alerts.append({
            "id": f"ioda-{a['iso2']}", "iso2": a["iso2"], "countryName": names.get(a["iso2"], a["countryName"]),
            "source": "IODA", "severity": severity,
            "title": f"Chute de connectivité détectée ({sources})",
            "start": dt.datetime.fromtimestamp(a["start"], dt.timezone.utc).isoformat(),
            "score": round(a["score"]),
        })
    for iso2, r in routing.items():
        if r["status"] == "anomaly":
            alerts.append({
                "id": f"ripe-{iso2}", "iso2": iso2, "countryName": names.get(iso2, iso2), "source": "RIPEstat",
                "severity": "high" if r["deltaPct"] <= -15 else "medium",
                "title": f"Préfixes IPv4 annoncés en baisse de {abs(r['deltaPct']):.1f} % (BGP)",
                "start": r["history"][-1]["date"] + "T00:00:00+00:00", "score": round(abs(r["deltaPct"]) * 1000),
            })
    alerts.sort(key=lambda x: -x["score"])
    return alerts[:40]


# ---------------------------------------------------------------------------
# Assemblage
# ---------------------------------------------------------------------------
def ensure_countries_geojson():
    if COUNTRIES_FILE.exists():
        return
    log("Natural Earth : téléchargement des frontières (1:110m)…")
    geo = http_json(COUNTRIES_URL)
    feats = []
    for f in geo["features"]:
        p = f["properties"]
        iso2 = p.get("ISO_A2_EH") or p.get("ISO_A2")
        if not iso2 or iso2 == "-99":
            iso2 = {"FRA": "FR", "NOR": "NO", "KOS": "XK"}.get(p.get("ADM0_A3"), "-99")

        def rnd(c):
            return [rnd(x) for x in c] if isinstance(c[0], list) else [round(c[0], 2), round(c[1], 2)]

        feats.append({"type": "Feature", "properties": {"iso2": iso2, "name": p.get("ADMIN") or p.get("NAME")},
                      "geometry": {"type": f["geometry"]["type"], "coordinates": rnd(f["geometry"]["coordinates"])}})
    COUNTRIES_FILE.write_text(json.dumps({"type": "FeatureCollection", "features": feats}, separators=(",", ":")),
                              encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--skip-cables", action="store_true", help="ne pas interroger TeleGeography")
    parser.add_argument("--skip-telemetry", action="store_true", help="ne pas interroger RIPEstat / IODA")
    args = parser.parse_args()

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    previous = json.loads(OUT_FILE.read_text(encoding="utf-8")) if OUT_FILE.exists() else {}
    sources = previous.get("meta", {}).get("sources", {})
    now_iso = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()

    try:
        ensure_countries_geojson()
    except RuntimeError as err:
        log(f"! frontières non téléchargées : {err}")

    cables = previous.get("cables", [])
    landing_points = previous.get("landingPoints", [])
    nodes = previous.get("nodes", [])
    edges = previous.get("edges", [])
    if not args.skip_cables:
        try:
            cable_geo, geo_by_id, lp_coords, details = fetch_telegeography()
            cables, landing_points, nodes, edges = build_strategic_dataset(geo_by_id, lp_coords, details)
            background = build_background(cable_geo, set(catalog.STRATEGIC_CABLES))
            BG_FILE.write_text(json.dumps(background, separators=(",", ":")), encoding="utf-8")
            sources["telegeography"] = {"status": "ok", "updatedAt": now_iso,
                                        "detail": f"{len(cables)} câbles stratégiques, {len(background)} câbles de contexte"}
        except RuntimeError as err:
            log(f"! TeleGeography indisponible, conservation des données existantes : {err}")
            sources["telegeography"] = {**sources.get("telegeography", {}), "status": "stale", "error": str(err)}
    if not cables:
        sys.exit("Aucune donnée câble disponible (ni API, ni fichier existant).")

    countries = build_country_profiles(cables, landing_points)
    prev_countries = {c["iso2"]: c for c in previous.get("countries", [])}
    routing = {iso: c["routing"] for iso, c in prev_countries.items() if c.get("routing")}
    alerts = previous.get("alerts", [])
    ioda: list = []
    if not args.skip_telemetry:
        try:
            routing = fetch_ripestat(countries)
            sources["ripestat"] = {"status": "ok", "updatedAt": now_iso, "detail": f"{len(routing)} pays"}
        except Exception as err:  # noqa: BLE001 - la télémétrie ne doit jamais casser le build
            log(f"! RIPEstat : {err}")
            sources["ripestat"] = {**sources.get("ripestat", {}), "status": "stale", "error": str(err)}
        try:
            ioda = fetch_ioda()
            sources["ioda"] = {"status": "ok", "updatedAt": now_iso, "detail": f"{len(ioda)} pays avec événements"}
        except Exception as err:  # noqa: BLE001
            log(f"! IODA : {err}")
            sources["ioda"] = {**sources.get("ioda", {}), "status": "stale", "error": str(err)}
        alerts = build_alerts(ioda, routing, countries)

    ioda_by_iso = {a["iso2"]: a for a in ioda}
    for c in countries:
        c["routing"] = routing.get(c["iso2"])
        if c["iso2"] in ioda_by_iso:
            a = ioda_by_iso[c["iso2"]]
            c["outage"] = {"score": round(a["score"]), "datasources": a["datasources"],
                           "start": dt.datetime.fromtimestamp(a["start"], dt.timezone.utc).isoformat()}
        elif prev_countries.get(c["iso2"], {}).get("outage") and args.skip_telemetry:
            c["outage"] = prev_countries[c["iso2"]]["outage"]

    metros = [{"id": mid, "name": m[0], "lat": m[1], "lng": m[2], "country": m[3], "weight": m[5]}
              for mid, m in catalog.METROS.items()]
    chokepoints = []
    for cp in catalog.CHOKEPOINTS:
        through = sorted({e["cableId"] for e in edges if e["kind"] == "cable" and cp["id"] in e["chokepoints"]})
        chokepoints.append({
            "id": cp["id"], "name": cp["name"], "risk": cp["risk"], "lat": cp["lat"], "lng": cp["lng"],
            "zones": [{"lat": z[0], "lng": z[1], "radiusKm": z[2]} for z in cp["zones"]],
            "threat": cp["threat"], "description": cp["description"], "cableIds": through,
            "capacityAtRiskTbps": round(sum(c["capacityTbps"] for c in cables if c["id"] in through), 1),
        })

    output = {
        "meta": {
            "name": "SubNet 3D - Cyber & Geopolitical Submarine Cable Radar",
            "version": 1,
            "generatedAt": now_iso,
            "sources": sources,
            "counts": {"cables": len(cables), "landingPoints": len(landing_points), "edges": len(edges),
                       "countries": len(countries), "alerts": len(alerts)},
            "disclaimer": "Capacités, impacts et latences sont des estimations de modélisation à vocation pédagogique.",
        },
        "cables": cables,
        "landingPoints": landing_points,
        "nodes": nodes,
        "edges": edges,
        "chokepoints": chokepoints,
        "countries": countries,
        "metros": metros,
        "latencyPairs": [list(p) for p in catalog.LATENCY_PAIRS],
        "scenarios": catalog.SCENARIOS,
        "alerts": alerts,
    }
    OUT_FILE.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    size_kb = OUT_FILE.stat().st_size / 1024
    log(f"✓ {OUT_FILE.relative_to(ROOT)} écrit ({size_kb:.0f} Ko, {len(cables)} câbles, {len(alerts)} alertes)")


if __name__ == "__main__":
    main()
