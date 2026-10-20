"""
Catalogue curé de SubNet 3D.

TeleGeography fournit la géométrie, les landing points, les propriétaires et les
dates RFS. Ce module apporte tout ce que l'Open Data ne publie pas : capacités
nominales, paires de fibres, profondeur moyenne, groupe de contrôle, historique
d'incidents, profils pays (PIB, dépendance numérique), métropoles de trafic,
chokepoints géopolitiques et scénarios du War Game.

Les capacités sont des ordres de grandeur publics (communiqués des consortiums,
presse spécialisée) : ce sont des valeurs de modélisation, pas des engagements.
"""

# ---------------------------------------------------------------------------
# 25 câbles stratégiques (id TeleGeography -> métadonnées curées)
# ---------------------------------------------------------------------------
STRATEGIC_CABLES = {
    "2africa": {
        "capacityTbps": 180, "fiberPairs": 16, "ownerGroup": "Meta", "avgDepthM": 3400,
        "sovereignty": "Plus long câble du monde, piloté par Meta avec China Mobile, Orange, Vodafone et Telecom Egypt. Présence d'un opérateur d'État chinois dans un système qui ceinture l'Afrique et traverse la Mer Rouge.",
        "incidents": [],
    },
    "marea": {
        "capacityTbps": 200, "fiberPairs": 8, "ownerGroup": "Microsoft", "avgDepthM": 4600,
        "sovereignty": "Lien transatlantique sud (Bilbao) contrôlé par Microsoft et Meta, opéré par Telxius (Telefónica). Évite les atterrages britanniques et irlandais saturés.",
        "incidents": [],
    },
    "dunant": {
        "capacityTbps": 250, "fiberPairs": 12, "ownerGroup": "Google", "avgDepthM": 4500,
        "sovereignty": "Câble privé 100 % Google atterrissant en Vendée : capacité souveraine du cloud américain sur le sol français.",
        "incidents": [],
    },
    "amitie": {
        "capacityTbps": 400, "fiberPairs": 16, "ownerGroup": "Meta", "avgDepthM": 4300,
        "sovereignty": "Consortium Meta / Microsoft / Orange / Vodafone / EXA. Atterrissage au Porge (Gironde) et à Bude, nœud stratégique britannique.",
        "incidents": [],
    },
    "grace-hopper": {
        "capacityTbps": 352, "fiberPairs": 16, "ownerGroup": "Google", "avgDepthM": 4400,
        "sovereignty": "Câble privé Google reliant New York à Bude et Bilbao. Premier système à commutation optique de paires de fibres (résilience accrue).",
        "incidents": [],
    },
    "havfrueaec-2": {
        "capacityTbps": 108, "fiberPairs": 6, "ownerGroup": "Google", "avgDepthM": 3100,
        "sovereignty": "Route nordique (Irlande, Danemark, Norvège) cofinancée par Google, Meta, Bulk et EXA. Atterrages proches des zones d'activité navale russe en mer du Nord.",
        "incidents": [],
    },
    "curie": {
        "capacityTbps": 72, "fiberPairs": 4, "ownerGroup": "Google", "avgDepthM": 3900,
        "sovereignty": "Premier câble intercontinental privé de Google (Los Angeles - Valparaíso). Dépendance totale du Chili à un hyperscaler sur cet axe.",
        "incidents": [],
    },
    "peace-cable": {
        "capacityTbps": 96, "fiberPairs": 6, "ownerGroup": "Chine (État)", "avgDepthM": 3000,
        "sovereignty": "Pièce maîtresse de la Route de la Soie numérique (Hengtong Group, HMN Tech). Relie le Pakistan à Marseille via Djibouti et l'Égypte : exposition maximale Mer Rouge / Suez.",
        "incidents": [],
    },
    "seamewe-6": {
        "capacityTbps": 126, "fiberPairs": 10, "ownerGroup": "Consortium international", "avgDepthM": 2900,
        "sovereignty": "Consortium Singtel / Orange / Telecom Egypt / Microsoft / Bharti. Les opérateurs chinois s'en sont retirés en 2023 après l'attribution du contrat à SubCom (rivalité sino-américaine).",
        "incidents": [],
    },
    "seamewe-5": {
        "capacityTbps": 24, "fiberPairs": 3, "ownerGroup": "Consortium international", "avgDepthM": 2800,
        "sovereignty": "Consortium mêlant les trois opérateurs d'État chinois, Orange, Telecom Italia et Singtel. Axe historique Europe-Asie via Suez.",
        "incidents": [
            {"date": "2024-02-24", "title": "Endommagé en Mer Rouge (ancre du cargo Rubymar, frappé par les Houthis)"},
        ],
    },
    "asia-africa-europe-1-aae-1": {
        "capacityTbps": 40, "fiberPairs": 5, "ownerGroup": "Chine (État)", "avgDepthM": 2700,
        "sovereignty": "Piloté par China Unicom avec des opérateurs du Golfe et d'Asie du Sud-Est. Traverse Ormuz, Bab el-Mandeb et Suez : triple exposition.",
        "incidents": [
            {"date": "2022-06-07", "title": "Panne sur la traversée terrestre égyptienne (impact Afrique de l'Est / Moyen-Orient)"},
            {"date": "2024-02-24", "title": "Rupture en Mer Rouge (ancre du Rubymar)"},
        ],
    },
    "imewe": {
        "capacityTbps": 12.8, "fiberPairs": 3, "ownerGroup": "Consortium international", "avgDepthM": 2600,
        "sovereignty": "Consortium Orange / Sparkle / Tata / Saudi Telecom / PTCL. Lien vital pour le Liban et le Pakistan.",
        "incidents": [
            {"date": "2025-09-06", "title": "Coupure en Mer Rouge au large de Djeddah (impact Azure, Pakistan, Inde)"},
        ],
    },
    "equiano": {
        "capacityTbps": 144, "fiberPairs": 12, "ownerGroup": "Google", "avgDepthM": 4100,
        "sovereignty": "Câble privé Google le long de l'Afrique de l'Ouest jusqu'au Cap. Route de contournement naturelle en cas de crise en Mer Rouge.",
        "incidents": [],
    },
    "ellalink": {
        "capacityTbps": 100, "fiberPairs": 4, "ownerGroup": "Europe (Opérateurs)", "avgDepthM": 4800,
        "sovereignty": "Seul lien direct Europe - Amérique latine (Sines - Fortaleza), soutenu par l'UE (programme BELLA). Contourne les États-Unis : enjeu de souveraineté des données.",
        "incidents": [],
    },
    "west-africa-cable-system-wacs": {
        "capacityTbps": 14.5, "fiberPairs": 4, "ownerGroup": "Consortium international", "avgDepthM": 3600,
        "sovereignty": "Consortium d'opérateurs africains (MTN, Vodacom, Telkom SA, Angola Cables). Exposé aux avalanches sous-marines des canyons du Congo et de Côte d'Ivoire.",
        "incidents": [
            {"date": "2023-08-06", "title": "Rupture par courant de turbidité dans le canyon du Congo"},
            {"date": "2024-03-14", "title": "Rupture au large de la Côte d'Ivoire (glissement du Trou sans Fond)"},
        ],
    },
    "south-atlantic-cable-system-sacs": {
        "capacityTbps": 40, "fiberPairs": 4, "ownerGroup": "Indépendant", "avgDepthM": 5000,
        "sovereignty": "Premier câble transatlantique Sud (Angola - Brésil), propriété d'Angola Cables. Évite toute transit par l'hémisphère Nord.",
        "incidents": [],
    },
    "faster": {
        "capacityTbps": 60, "fiberPairs": 6, "ownerGroup": "Google", "avgDepthM": 5200,
        "sovereignty": "Google aux côtés de China Mobile, China Telecom, KDDI et Singtel. Branche taïwanaise directement exposée à un blocus.",
        "incidents": [],
    },
    "pacific-light-cable-network-plcn": {
        "capacityTbps": 144, "fiberPairs": 6, "ownerGroup": "Google", "avgDepthM": 5000,
        "sovereignty": "Branche Hong Kong jamais activée sur décision de Washington (Team Telecom, 2020). Symbole du découplage sino-américain.",
        "incidents": [],
    },
    "jupiter": {
        "capacityTbps": 60, "fiberPairs": 4, "ownerGroup": "Amazon", "avgDepthM": 5100,
        "sovereignty": "Amazon, Meta, NTT, SoftBank, PLDT et PCCW. Relie le Japon et les Philippines à la Californie en évitant le détroit de Taïwan.",
        "incidents": [],
    },
    "asia-pacific-gateway-apg": {
        "capacityTbps": 54.8, "fiberPairs": 4, "ownerGroup": "Consortium international", "avgDepthM": 2500,
        "sovereignty": "Opérateurs d'État chinois, Chunghwa, KT, NTT et Meta. Pannes récurrentes en mer de Chine et dans le détroit de Luçon.",
        "incidents": [
            {"date": "2023-01-01", "title": "Série de défauts en mer de Chine méridionale (réparations 2023)"},
        ],
    },
    "asia-america-gateway-aag-cable-system": {
        "capacityTbps": 10, "fiberPairs": 2, "ownerGroup": "Consortium international", "avgDepthM": 3500,
        "sovereignty": "Câble vieillissant (2009) mais critique pour le Viêt Nam. Plus de 20 incidents recensés depuis sa mise en service.",
        "incidents": [
            {"date": "2023-01-15", "title": "Rupture au large du Viêt Nam (5 câbles vietnamiens simultanément dégradés)"},
        ],
    },
    "southern-cross-cable-network-sccn": {
        "capacityTbps": 72, "fiberPairs": 3, "ownerGroup": "Consortium international", "avgDepthM": 4700,
        "sovereignty": "Spark, Telstra (via Singtel-Optus) et Verizon. Épine dorsale historique Australie / Nouvelle-Zélande - États-Unis via Hawaï et Fidji.",
        "incidents": [],
    },
    "hawaiki": {
        "capacityTbps": 67, "fiberPairs": 3, "ownerGroup": "Indépendant", "avgDepthM": 4900,
        "sovereignty": "Câble indépendant (BW Digital) offrant une alternative à Southern Cross pour l'Océanie.",
        "incidents": [],
    },
    "c-lion1": {
        "capacityTbps": 144, "fiberPairs": 8, "ownerGroup": "Europe (Opérateurs)", "avgDepthM": 60,
        "sovereignty": "Câble d'État finlandais (Cinia) Helsinki - Rostock. Mer peu profonde (<100 m) : extrêmement vulnérable aux ancres traînantes.",
        "incidents": [
            {"date": "2024-11-18", "title": "Rupture près de l'île d'Öland (vraquier Yi Peng 3 soupçonné), réparé le 28/11"},
            {"date": "2024-12-25", "title": "Endommagé lors de l'incident Eagle S (golfe de Finlande)"},
        ],
    },
    "falcon": {
        "capacityTbps": 2.56, "fiberPairs": 2, "ownerGroup": "Indépendant", "avgDepthM": 1800,
        "sovereignty": "Système FLAG (GCX / Reliance) desservant le Golfe, l'Iran et l'Irak. Traverse Ormuz : exposition maximale aux tensions Iran / Occident.",
        "incidents": [
            {"date": "2008-02-01", "title": "Rupture dans le golfe Persique (série de coupures FLAG / SEA-ME-WE 4)"},
            {"date": "2025-09-06", "title": "Coupure en Mer Rouge au large de Djeddah"},
        ],
    },
}

# Mots-clés pour l'analyse de souveraineté (sur le champ owners / suppliers TeleGeography)
OWNER_BLOCS = {
    "gafam": ["google", "meta", "facebook", "microsoft", "amazon"],
    "china": ["china mobile", "china telecom", "china unicom", "hengtong", "peace cable", "hmn", "pccw", "hyalroute"],
    "europe": ["orange", "telecom italia", "sparkle", "vodafone", "telxius", "telefonica", "exa infrastructure",
               "cinia", "altice", "ellalink", "bt", "deutsche telekom", "proximus", "otenet", "oteglobe", "bulk"],
}
SUPPLIER_ORIGIN = {
    "subcom": "États-Unis", "te subcom": "États-Unis", "alcatel": "France", "asn": "France",
    "nec": "Japon", "hmn": "Chine", "huawei": "Chine", "fujitsu": "Japon",
}

# ---------------------------------------------------------------------------
# Profils pays : nom TeleGeography -> (ISO2, continent, masse terrestre, PIB Md$, part numérique)
# La "masse terrestre" détermine quels nœuds peuvent être reliés par backhaul terrestre.
# ---------------------------------------------------------------------------
COUNTRIES = {
    "American Samoa": ("AS", "OC", "AS", 0.9, 0.05),
    "Angola": ("AO", "AF", "africa", 85, 0.05),
    "Australia": ("AU", "OC", "australia", 1800, 0.12),
    "Bahrain": ("BH", "ME", "eurasia", 47, 0.10),
    "Bangladesh": ("BD", "AS", "eurasia", 450, 0.06),
    "Brazil": ("BR", "SA", "south-america", 2170, 0.09),
    "Brunei": ("BN", "AS", "borneo", 15, 0.07),
    "Cambodia": ("KH", "AS", "eurasia", 46, 0.05),
    "Cameroon": ("CM", "AF", "africa", 50, 0.04),
    "Cape Verde": ("CV", "AF", "CV", 2.6, 0.05),
    "Chile": ("CL", "SA", "south-america", 330, 0.09),
    "China": ("CN", "AS", "eurasia", 18700, 0.10),
    "Comoros": ("KM", "AF", "KM", 1.4, 0.03),
    "Congo, Dem. Rep.": ("CD", "AF", "africa", 70, 0.03),
    "Congo, Rep.": ("CG", "AF", "africa", 15, 0.03),
    "Cyprus": ("CY", "EU", "CY", 34, 0.10),
    "Cote d'Ivoire": ("CI", "AF", "africa", 87, 0.05),
    "Denmark": ("DK", "EU", "eurasia", 410, 0.13),
    "Djibouti": ("DJ", "AF", "africa", 4, 0.08),
    "Egypt": ("EG", "AF", "africa", 390, 0.06),
    "Fiji": ("FJ", "OC", "FJ", 5.5, 0.06),
    "Finland": ("FI", "EU", "eurasia", 300, 0.13),
    "France": ("FR", "EU", "eurasia", 3100, 0.12),
    "French Guiana": ("GF", "SA", "south-america", 5, 0.06),
    "Gabon": ("GA", "AF", "africa", 21, 0.04),
    "Germany": ("DE", "EU", "eurasia", 4700, 0.12),
    "Ghana": ("GH", "AF", "africa", 76, 0.05),
    "Greece": ("GR", "EU", "eurasia", 250, 0.09),
    "Guam": ("GU", "OC", "GU", 6.9, 0.08),
    "India": ("IN", "AS", "eurasia", 3900, 0.09),
    "Indonesia": ("ID", "AS", "indonesia", 1400, 0.07),
    "Iran": ("IR", "ME", "eurasia", 400, 0.05),
    "Iraq": ("IQ", "ME", "eurasia", 260, 0.04),
    "Ireland": ("IE", "EU", "eurasia", 550, 0.15),
    "Italy": ("IT", "EU", "eurasia", 2300, 0.10),
    "Japan": ("JP", "AS", "japan", 4100, 0.11),
    "Kenya": ("KE", "AF", "africa", 110, 0.07),
    "Kuwait": ("KW", "ME", "eurasia", 160, 0.08),
    "Lebanon": ("LB", "ME", "eurasia", 20, 0.06),
    "Madagascar": ("MG", "AF", "MG", 16, 0.03),
    "Malaysia": ("MY", "AS", "eurasia", 420, 0.09),
    "Maldives": ("MV", "AS", "MV", 7, 0.06),
    "Malta": ("MT", "EU", "MT", 22, 0.12),
    "Mauritania": ("MR", "AF", "africa", 10, 0.03),
    "Morocco": ("MA", "AF", "africa", 150, 0.06),
    "Mozambique": ("MZ", "AF", "africa", 22, 0.03),
    "Myanmar": ("MM", "AS", "eurasia", 65, 0.03),
    "Namibia": ("NA", "AF", "africa", 13, 0.04),
    "New Zealand": ("NZ", "OC", "new-zealand", 250, 0.11),
    "Nigeria": ("NG", "AF", "africa", 250, 0.05),
    "Norway": ("NO", "EU", "eurasia", 480, 0.12),
    "Oman": ("OM", "ME", "eurasia", 105, 0.07),
    "Pakistan": ("PK", "AS", "eurasia", 375, 0.05),
    "Panama": ("PA", "NA", "north-america", 85, 0.08),
    "Philippines": ("PH", "AS", "philippines", 460, 0.08),
    "Portugal": ("PT", "EU", "eurasia", 300, 0.10),
    "Qatar": ("QA", "ME", "eurasia", 220, 0.09),
    "Saint Helena, Ascension and Tristan da Cunha": ("SH", "AF", "SH", 0.3, 0.03),
    "Saudi Arabia": ("SA", "ME", "eurasia", 1100, 0.08),
    "Senegal": ("SN", "AF", "africa", 31, 0.05),
    "Seychelles": ("SC", "AF", "SC", 2, 0.06),
    "Singapore": ("SG", "AS", "eurasia", 530, 0.16),
    "Somalia": ("SO", "AF", "africa", 11, 0.03),
    "South Africa": ("ZA", "AF", "africa", 400, 0.08),
    "South Korea": ("KR", "AS", "korea", 1700, 0.12),
    "Spain": ("ES", "EU", "eurasia", 1700, 0.10),
    "Sri Lanka": ("LK", "AS", "LK", 85, 0.06),
    "Sudan": ("SD", "AF", "africa", 30, 0.02),
    "Suriname": ("SR", "SA", "south-america", 4, 0.04),
    "Taiwan": ("TW", "AS", "taiwan", 780, 0.13),
    "Tanzania": ("TZ", "AF", "africa", 80, 0.04),
    "Thailand": ("TH", "AS", "eurasia", 520, 0.08),
    "Togo": ("TG", "AF", "africa", 9.5, 0.04),
    "Tonga": ("TO", "OC", "TO", 0.5, 0.04),
    "Tunisia": ("TN", "AF", "africa", 50, 0.06),
    "Turkey": ("TR", "EU", "eurasia", 1300, 0.08),
    "United Arab Emirates": ("AE", "ME", "eurasia", 540, 0.12),
    "United Kingdom": ("GB", "EU", "eurasia", 3600, 0.14),
    "United States": ("US", "NA", "north-america", 29000, 0.12),
    "Vietnam": ("VN", "AS", "eurasia", 470, 0.08),
    "Yemen": ("YE", "ME", "eurasia", 20, 0.02),
}

CONTINENT_LABELS = {
    "EU": "Europe", "AS": "Asie", "AF": "Afrique", "ME": "Moyen-Orient",
    "NA": "Amérique du Nord", "SA": "Amérique du Sud", "OC": "Océanie",
}

# ---------------------------------------------------------------------------
# Métropoles de trafic (nœuds de demande + extrémités des mesures de latence)
# id -> (nom, lat, lng, ISO2, masse terrestre, poids de trafic relatif)
# ---------------------------------------------------------------------------
METROS = {
    "frankfurt": ("Francfort", 50.11, 8.68, "DE", "eurasia", 10),
    "london": ("Londres", 51.51, -0.13, "GB", "eurasia", 10),
    "paris": ("Paris", 48.86, 2.35, "FR", "eurasia", 8),
    "amsterdam": ("Amsterdam", 52.37, 4.90, "NL", "eurasia", 8),
    "madrid": ("Madrid", 40.42, -3.70, "ES", "eurasia", 4),
    "milan": ("Milan", 45.46, 9.19, "IT", "eurasia", 4),
    "stockholm": ("Stockholm", 59.33, 18.07, "SE", "eurasia", 3),
    "helsinki": ("Helsinki", 60.17, 24.94, "FI", "eurasia", 2),
    "lisbon": ("Lisbonne", 38.72, -9.14, "PT", "eurasia", 3),
    "istanbul": ("Istanbul", 41.01, 28.98, "TR", "eurasia", 3),
    "new-york": ("New York", 40.71, -74.01, "US", "north-america", 10),
    "ashburn": ("Ashburn", 39.04, -77.49, "US", "north-america", 10),
    "chicago": ("Chicago", 41.88, -87.63, "US", "north-america", 5),
    "dallas": ("Dallas", 32.78, -96.80, "US", "north-america", 4),
    "denver": ("Denver", 39.74, -104.99, "US", "north-america", 2),
    "los-angeles": ("Los Angeles", 34.05, -118.24, "US", "north-america", 8),
    "seattle": ("Seattle", 47.61, -122.33, "US", "north-america", 4),
    "miami": ("Miami", 25.76, -80.19, "US", "north-america", 4),
    "sao-paulo": ("São Paulo", -23.55, -46.63, "BR", "south-america", 6),
    "santiago": ("Santiago", -33.45, -70.67, "CL", "south-america", 2),
    "lagos": ("Lagos", 6.52, 3.38, "NG", "africa", 3),
    "johannesburg": ("Johannesburg", -26.20, 28.05, "ZA", "africa", 3),
    "nairobi": ("Nairobi", -1.29, 36.82, "KE", "africa", 2),
    "cairo": ("Le Caire", 30.04, 31.24, "EG", "africa", 3),
    "dubai": ("Dubaï", 25.20, 55.27, "AE", "eurasia", 4),
    "riyadh": ("Riyad", 24.71, 46.68, "SA", "eurasia", 3),
    "karachi": ("Karachi", 24.86, 67.01, "PK", "eurasia", 2),
    "mumbai": ("Mumbai", 19.08, 72.88, "IN", "eurasia", 6),
    "chennai": ("Chennai", 13.08, 80.27, "IN", "eurasia", 4),
    "singapore": ("Singapour", 1.35, 103.82, "SG", "eurasia", 9),
    "hong-kong": ("Hong Kong", 22.32, 114.17, "CN", "eurasia", 7),
    "shanghai": ("Shanghai", 31.23, 121.47, "CN", "eurasia", 6),
    "taipei": ("Taipei", 25.03, 121.57, "TW", "taiwan", 4),
    "tokyo": ("Tokyo", 35.68, 139.69, "JP", "japan", 9),
    "seoul": ("Séoul", 37.57, 126.98, "KR", "korea", 5),
    "manila": ("Manille", 14.60, 120.98, "PH", "philippines", 3),
    "jakarta": ("Jakarta", -6.21, 106.85, "ID", "indonesia", 4),
    "sydney": ("Sydney", -33.87, 151.21, "AU", "australia", 5),
    "auckland": ("Auckland", -36.85, 174.76, "NZ", "new-zealand", 2),
}

# Paires de latence affichées dans le War Game (RTT en ms)
LATENCY_PAIRS = [
    ("frankfurt", "singapore"),
    ("london", "new-york"),
    ("paris", "mumbai"),
    ("frankfurt", "dubai"),
    ("london", "johannesburg"),
    ("london", "lagos"),
    ("lisbon", "sao-paulo"),
    ("helsinki", "frankfurt"),
    ("tokyo", "los-angeles"),
    ("taipei", "los-angeles"),
    ("sydney", "los-angeles"),
    ("hong-kong", "singapore"),
]

# ---------------------------------------------------------------------------
# Chokepoints géopolitiques : zones circulaires (lat, lng, rayon km).
# cutsTerrestrial : le blocage coupe aussi les liaisons terrestres traversant la zone.
# ---------------------------------------------------------------------------
CHOKEPOINTS = [
    {
        "id": "red-sea", "name": "Mer Rouge / Bab el-Mandeb", "risk": 95, "lat": 14.5, "lng": 41.8,
        "zones": [(12.65, 43.45, 110), (16.0, 41.2, 170), (20.5, 38.6, 210), (25.0, 35.6, 170)], "cutsTerrestrial": True,
        "threat": "Attaques Houthis contre la navigation, ancres traînantes de navires touchés, zone de guerre.",
        "description": "Environ 17 % du trafic Internet mondial et la quasi-totalité des liaisons Europe-Asie transitent par ce corridor de 30 km de large.",
    },
    {
        "id": "suez", "name": "Canal de Suez / Traversée égyptienne", "risk": 70, "lat": 30.4, "lng": 32.3,
        "zones": [(31.1, 32.2, 120), (29.9, 32.5, 120)], "cutsTerrestrial": True,
        "threat": "Point de passage terrestre unique sous monopole de Telecom Egypt, risques politiques et de travaux.",
        "description": "Les câbles Europe-Asie traversent l'Égypte par voie terrestre entre la Méditerranée et la Mer Rouge.",
    },
    {
        "id": "taiwan-strait", "name": "Détroit de Taïwan / Luçon", "risk": 90, "lat": 22.8, "lng": 120.8,
        "zones": [(24.3, 119.8, 200), (21.0, 120.9, 220), (24.9, 122.2, 130)],
        "threat": "Pression militaire de l'APL, câbles des îles Matsu coupés en 2023, Trans-Pacific Express endommagé en 2025.",
        "description": "Le détroit de Luçon (canal de Bashi) concentre les câbles transpacifiques reliant l'Asie du Nord-Est à l'Asie du Sud-Est.",
    },
    {
        "id": "baltic", "name": "Mer Baltique", "risk": 85, "lat": 57.5, "lng": 19.5,
        "zones": [(59.7, 24.5, 140), (57.6, 19.8, 230), (55.0, 14.5, 160)],
        "threat": "Ancres traînantes (Yi Peng 3, Eagle S, Newnew Polar Bear), flotte fantôme russe, eaux peu profondes.",
        "description": "Mer semi-fermée de moins de 60 m de profondeur moyenne où plusieurs câbles et gazoducs ont été sabotés depuis 2023.",
    },
    {
        "id": "hormuz", "name": "Détroit d'Ormuz", "risk": 80, "lat": 26.4, "lng": 56.4,
        "zones": [(26.5, 56.4, 100)],
        "threat": "Tensions Iran / États-Unis, saisies de navires, menace de blocus.",
        "description": "Accès unique au golfe Persique : Émirats, Qatar, Bahreïn, Koweït, Irak et Iran en dépendent.",
    },
    {
        "id": "malacca", "name": "Détroit de Malacca", "risk": 60, "lat": 3.2, "lng": 100.8,
        "zones": [(4.6, 99.3, 190), (2.4, 101.6, 150)],
        "threat": "Trafic maritime le plus dense au monde, piraterie, risques d'ancrage élevés.",
        "description": "Passage obligé des câbles reliant l'océan Indien à Singapour et à la mer de Chine méridionale.",
    },
]

# Hubs critiques mis en évidence en plus des hubs à fort degré
CRITICAL_HUBS = [
    "marseille-france", "tuas-singapore", "changi-south-singapore", "singapore-singapore",
    "djibouti-city-djibouti", "haramous-djibouti", "fortaleza-brazil", "bude-united-kingdom",
    "suez-egypt", "zafarana-egypt", "port-said-egypt", "alexandria-egypt", "mumbai-india",
    "toucheng-taiwan", "virginia-beach-va-united-states", "sesimbra-portugal", "jeddah-saudi-arabia",
    "fujairah-united-arab-emirates", "karachi-pakistan", "rostock-germany", "helsinki-finland",
]

# ---------------------------------------------------------------------------
# Scénarios War Game (1 clic)
# ---------------------------------------------------------------------------
SCENARIOS = [
    {
        "id": "red-sea-crisis",
        "name": "Crise en Mer Rouge / Bab el-Mandeb",
        "description": "Coupure simultanée de tous les câbles transitant par la Mer Rouge : l'Europe perd sa route directe vers l'Asie, le trafic bascule par le Cap de Bonne-Espérance ou par les États-Unis.",
        "chokepoints": ["red-sea"], "cables": [], "hubs": [],
    },
    {
        "id": "taiwan-blockade",
        "name": "Blocus du détroit de Taïwan",
        "description": "Rupture des câbles du détroit de Taïwan et du canal de Bashi : isolement de Taïwan et dégradation des liaisons transpacifiques asiatiques.",
        "chokepoints": ["taiwan-strait"], "cables": [], "hubs": [],
    },
    {
        "id": "baltic-north-atlantic",
        "name": "Sabotage Baltique & Atlantique Nord",
        "description": "Ancres traînantes en Baltique et sabotage coordonné des câbles nord-atlantiques Amitié, Grace Hopper et Havfrue : MAREA et Dunant absorbent seuls le trafic Europe - USA.",
        "chokepoints": ["baltic"], "cables": ["amitie", "grace-hopper", "havfrueaec-2"], "hubs": [],
    },
    {
        "id": "marseille-blackout",
        "name": "Blackout du hub de Marseille",
        "description": "Panne totale des stations d'atterrissement et des datacenters de Marseille, 2e hub de transit Europe - Afrique - Asie.",
        "chokepoints": [], "cables": [], "hubs": ["marseille-france"],
    },
]
