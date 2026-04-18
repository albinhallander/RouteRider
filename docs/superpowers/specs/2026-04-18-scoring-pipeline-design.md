# Scoring Pipeline — Design Spec
_2026-04-18 · RouteRider Hackathon_

## Syfte

Ranka backhaul-kandidater längs en rutt (Göteborg → Stockholm) på fyra dimensioner: geografisk passform, fraktvolym-potential, kommersiell mognad och sustainability-signal. Output: top-10 tabell i terminalen.

---

## Fil

`algorithm_data/score_pipeline.py` — en självständig fil, körs med `python3 score_pipeline.py`.

Dependencies: `requests` (OSRM), `sys`, `json`, `math`, `hashlib`. Importerar `sni_intensity.freight_intensity` och `sni_sustainability.sni_sustainability_score` från samma katalog.

---

## Indata

Läser `data_collection/routerider_lager_enriched.json`. Filtrerar på poster med `name` (icke-tom) och giltiga koordinater → ~278 kandidater.

**Mock-berikningstabell** (seedas deterministiskt med `hashlib.md5(name.encode())` så att värden är reproducerbara):

| typ-värde | SNI | Omsättning (MSEK) | Anställda |
|---|---|---|---|
| fabrik | 24 | 100–800 | 50–400 |
| lager | 46 | 50–400 | 20–200 |
| logistikcenter | 52 | 80–500 | 30–250 |
| distributionscenter | 46 | 200–1000 | 100–500 |
| industri / industrilokal | 25 | 30–500 | 15–300 |

---

## Scoring

```
score = 0.40 × geo + 0.25 × freight + 0.20 × commercial + 0.15 × sustainability
```

Alla komponenter returnerar ett värde 0.0–1.0.

### geo (vikt 0.40)

Anropar OSRM demo-server för tre rutter:
1. Direktrutt: origin → destination
2. Detour: origin → kandidat → destination

```
detour_ratio = (detour_km - direct_km) / direct_km
geo_score = max(0.0, 1.0 - detour_ratio / 0.30)
```

30% omväg → score 0. 0% omväg → score 1. Linjär interpolation däremellan.

OSRM-endpoint: `http://router.project-osrm.org/route/v1/driving/{coords}?overview=false`

Rate-limiting: 200 ms sleep mellan anrop för att respektera demo-servern.

### freight (vikt 0.25)

```
intensity = freight_intensity(sni)          # 0.0–1.0 från sni_intensity.py
size_proxy = sigmoid((omsattning_msek - 150) / 100)   # logistisk kurva, center=150 MSEK
freight_score = intensity × size_proxy
```

### commercial (vikt 0.20)

Sweet-spot scoring: bäst vid 50–500 MSEK och 20–500 anställda.

```
rev_score  = bell(omsattning_msek, lo=50, hi=500)
emp_score  = bell(anstallda, lo=20, hi=500)
commercial_score = 0.6 × rev_score + 0.4 × emp_score
```

`bell(x, lo, hi)`:
- 1.0 om x ∈ [lo, hi]
- `exp(-((x - lo) / (lo * 0.5))^2)` om x < lo
- `exp(-((x - hi) / (hi * 0.5))^2)` om x > hi

### sustainability (vikt 0.15)

```
sustainability_score = sni_sustainability_score(sni)["combined_score"]  # från sni_sustainability.py
```

---

## Output

Terminal-tabell, top-10 sorterade på total score:

```
BACKHAUL RANKING: Göteborg → Stockholm  (direktrutt: 470 km)
══════════════════════════════════════════════════════════════════════════
 #  Företag                   Stad          Score  Geo   Frgt  Com   Sus
────────────────────────────────────────────────────────────────────────
 1  ABB Motors                Västerås      0.82   0.91  0.95  0.74  0.80
 2  COOP Fryslager Enköping   Enköping      0.79   0.88  0.90  0.68  0.72
...
══════════════════════════════════════════════════════════════════════════
```

---

## Felhantering

- OSRM-anrop som misslyckas (timeout, HTTP-fel): kandidaten får `geo_score = 0.0` och flaggas med `[OSRM-fel]` i output.
- Kandidater utan koordinater: filtreras bort i pre-processing.
- Okänd SNI-prefix: `freight_intensity` returnerar 0.3 (default), `sni_sustainability_score` returnerar DEFAULT_PROFILE.

---

## Köra pipelinen

```bash
cd algorithm_data
python3 score_pipeline.py
# Defaultrutt: Göteborg → Stockholm

python3 score_pipeline.py 57.7089,11.9746 59.3293,18.0686
# Valfria koordinater: origin_lat,origin_lng dest_lat,dest_lng
```
