# Scoring Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `algorithm_data/score_pipeline.py` — a single-file Python script that ranks backhaul candidates from `routerider_lager_enriched.json` on geo, freight, commercial, and sustainability, printing a top-10 table to the terminal.

**Architecture:** Single file with pure scoring functions tested in `algorithm_data/test_score_pipeline.py`. Imports `freight_intensity` and `sni_sustainability_score` from sibling files. OSRM demo server for geo scoring with 200 ms rate-limiting.

**Tech Stack:** Python 3, `requests`, `pytest`, OSRM demo server (`router.project-osrm.org`)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `algorithm_data/score_pipeline.py` | Create | Full pipeline: data loading, mock enrichment, all 4 scoring functions, main() |
| `algorithm_data/test_score_pipeline.py` | Create | Unit tests for pure functions (mocks OSRM) |

---

## Task 1: Skeleton, imports, mock enrichment

**Files:**
- Create: `algorithm_data/score_pipeline.py`
- Create: `algorithm_data/test_score_pipeline.py`

- [ ] **Step 1: Write failing tests for mock_enrich**

Create `algorithm_data/test_score_pipeline.py`:

```python
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

def test_mock_enrich_fabrik():
    from score_pipeline import mock_enrich
    c = {"name": "TestFabrik", "typ": "fabrik", "lat": 59.0, "lng": 16.0, "city": "X"}
    result = mock_enrich(c)
    assert result["sni"] == "24"
    assert 100 <= result["omsattning_msek"] <= 800
    assert 50 <= result["anstallda"] <= 400

def test_mock_enrich_lager():
    from score_pipeline import mock_enrich
    c = {"name": "TestLager", "typ": "lager", "lat": 59.0, "lng": 16.0, "city": "X"}
    result = mock_enrich(c)
    assert result["sni"] == "46"
    assert 50 <= result["omsattning_msek"] <= 400

def test_mock_enrich_deterministic():
    from score_pipeline import mock_enrich
    c = {"name": "SameName", "typ": "industri", "lat": 59.0, "lng": 16.0, "city": "X"}
    r1 = mock_enrich(c)
    r2 = mock_enrich(c)
    assert r1["omsattning_msek"] == r2["omsattning_msek"]
    assert r1["anstallda"] == r2["anstallda"]
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Applications/Lokalt/RouteRider
python -m pytest algorithm_data/test_score_pipeline.py -v
```

Expected: `ModuleNotFoundError: No module named 'score_pipeline'`

- [ ] **Step 3: Create score_pipeline.py with skeleton + mock_enrich**

Create `algorithm_data/score_pipeline.py`:

```python
"""
Backhaul Scoring Pipeline
Ranks candidates from routerider_lager_enriched.json for a given route.

Usage:
    python3 score_pipeline.py                              # Göteborg → Stockholm
    python3 score_pipeline.py 57.7089,11.9746 59.3293,18.0686
"""

import json
import math
import hashlib
import time
import sys
import os

import requests

sys.path.insert(0, os.path.dirname(__file__))
from sni_intensity import freight_intensity
from sni_sustainability import sni_sustainability_score

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

OSRM_BASE = "http://router.project-osrm.org/route/v1/driving"
OSRM_DELAY_S = 0.2  # respect demo server rate limits

DATA_PATH = os.path.join(
    os.path.dirname(__file__), "..", "data_collection", "routerider_lager_enriched.json"
)

TYP_SNI = {
    "fabrik": "24",
    "lager": "46",
    "logistikcenter": "52",
    "distributionscenter": "46",
    "industri": "25",
    "industrilokal": "25",
}

TYP_RANGES = {
    # (rev_lo, rev_hi, emp_lo, emp_hi)  — omsättning i MSEK
    "fabrik":             (100, 800,   50, 400),
    "lager":              ( 50, 400,   20, 200),
    "logistikcenter":     ( 80, 500,   30, 250),
    "distributionscenter":(200, 1000, 100, 500),
    "industri":           ( 30, 500,   15, 300),
    "industrilokal":      ( 30, 500,   15, 300),
}

# ---------------------------------------------------------------------------
# Mock enrichment
# ---------------------------------------------------------------------------

def mock_enrich(company: dict) -> dict:
    """
    Assign SNI code and mock financial data based on typ.
    Deterministic: same name always yields same numbers.
    """
    typ = company.get("typ", "industrilokal").lower()
    sni = TYP_SNI.get(typ, "25")
    rev_lo, rev_hi, emp_lo, emp_hi = TYP_RANGES.get(typ, (30, 500, 15, 300))

    seed = int(hashlib.md5(company["name"].encode()).hexdigest()[:8], 16)
    omsattning = rev_lo + (seed % (rev_hi - rev_lo + 1))
    anstallda = emp_lo + ((seed >> 8) % (emp_hi - emp_lo + 1))

    return {**company, "sni": sni, "omsattning_msek": omsattning, "anstallda": anstallda}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
python -m pytest algorithm_data/test_score_pipeline.py -v
```

Expected: 3 PASSED

- [ ] **Step 5: Commit**

```bash
git add algorithm_data/score_pipeline.py algorithm_data/test_score_pipeline.py
git commit -m "feat: add score_pipeline skeleton and mock enrichment"
```

---

## Task 2: Scoring functions — bell, freight, commercial, sustainability

**Files:**
- Modify: `algorithm_data/score_pipeline.py` (append functions)
- Modify: `algorithm_data/test_score_pipeline.py` (append tests)

- [ ] **Step 1: Write failing tests**

Append to `algorithm_data/test_score_pipeline.py`:

```python
def test_bell_inside_range():
    from score_pipeline import bell
    assert bell(200, 50, 500) == 1.0

def test_bell_below_range():
    from score_pipeline import bell
    score = bell(10, 50, 500)
    assert 0.0 < score < 1.0

def test_bell_above_range():
    from score_pipeline import bell
    score = bell(1000, 50, 500)
    assert 0.0 < score < 1.0

def test_freight_score_high_intensity():
    from score_pipeline import freight_score
    # SNI 24 = stål = 1.0 intensity, 300 MSEK = above sigmoid center
    c = {"sni": "24", "omsattning_msek": 300, "anstallda": 100}
    assert freight_score(c) > 0.7

def test_freight_score_low_intensity():
    from score_pipeline import freight_score
    # SNI 62 = IT = 0.0 intensity
    c = {"sni": "62", "omsattning_msek": 300, "anstallda": 100}
    assert freight_score(c) == 0.0

def test_commercial_score_sweet_spot():
    from score_pipeline import commercial_score
    c = {"omsattning_msek": 200, "anstallda": 100}
    assert commercial_score(c) == 1.0

def test_commercial_score_too_small():
    from score_pipeline import commercial_score
    c = {"omsattning_msek": 5, "anstallda": 5}
    assert commercial_score(c) < 0.5

def test_sustainability_score_range():
    from score_pipeline import sustainability_score
    c = {"sni": "24"}
    score = sustainability_score(c)
    assert 0.0 <= score <= 1.0
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
python -m pytest algorithm_data/test_score_pipeline.py -v
```

Expected: new tests fail with `ImportError` or `AttributeError`

- [ ] **Step 3: Implement the four functions**

Append to `algorithm_data/score_pipeline.py` (after `mock_enrich`):

```python
# ---------------------------------------------------------------------------
# Scoring helpers
# ---------------------------------------------------------------------------

def bell(x: float, lo: float, hi: float) -> float:
    """1.0 inside [lo, hi], Gaussian falloff outside."""
    if lo <= x <= hi:
        return 1.0
    elif x < lo:
        return math.exp(-((x - lo) / (lo * 0.5)) ** 2)
    else:
        return math.exp(-((x - hi) / (hi * 0.5)) ** 2)


def sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


# ---------------------------------------------------------------------------
# Component scores (each returns 0.0–1.0)
# ---------------------------------------------------------------------------

def freight_score(company: dict) -> float:
    intensity = freight_intensity(company["sni"])
    size_proxy = sigmoid((company["omsattning_msek"] - 150) / 100)
    return round(intensity * size_proxy, 3)


def commercial_score(company: dict) -> float:
    rev_score = bell(company["omsattning_msek"], 50, 500)
    emp_score = bell(company["anstallda"], 20, 500)
    return round(0.6 * rev_score + 0.4 * emp_score, 3)


def sustainability_score(company: dict) -> float:
    profile = sni_sustainability_score(company["sni"])
    return round(profile["combined_score"], 3)


def total_score(geo: float, freight: float, commercial: float, sus: float) -> float:
    return round(0.40 * geo + 0.25 * freight + 0.20 * commercial + 0.15 * sus, 3)
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
python -m pytest algorithm_data/test_score_pipeline.py -v
```

Expected: all 11 tests PASSED

- [ ] **Step 5: Commit**

```bash
git add algorithm_data/score_pipeline.py algorithm_data/test_score_pipeline.py
git commit -m "feat: add bell, freight, commercial, sustainability scoring functions"
```

---

## Task 3: OSRM geo scoring

**Files:**
- Modify: `algorithm_data/score_pipeline.py` (append)
- Modify: `algorithm_data/test_score_pipeline.py` (append)

- [ ] **Step 1: Write failing tests (OSRM mocked)**

Append to `algorithm_data/test_score_pipeline.py`:

```python
from unittest.mock import patch

def _mock_osrm_response(distance_m):
    return {"routes": [{"distance": distance_m}]}

def test_osrm_distance_km():
    from score_pipeline import osrm_distance_km
    with patch("score_pipeline.requests.get") as mock_get:
        mock_get.return_value.json.return_value = _mock_osrm_response(470_000)
        mock_get.return_value.raise_for_status = lambda: None
        km = osrm_distance_km([(57.7089, 11.9746), (59.3293, 18.0686)])
    assert abs(km - 470.0) < 0.1

def test_geo_score_no_detour():
    from score_pipeline import geo_score
    # Candidate exactly on the direct route: detour ~0 → score ~1.0
    with patch("score_pipeline.osrm_distance_km") as mock_dist:
        mock_dist.side_effect = [470.0, 470.0]  # direct, then detour
        score, err = geo_score(
            {"lat": 58.5, "lng": 15.0},
            origin=(57.7089, 11.9746),
            destination=(59.3293, 18.0686),
            direct_km=470.0,
            delay=0,
        )
    assert err is False
    assert score >= 0.99

def test_geo_score_large_detour():
    from score_pipeline import geo_score
    # 30% detour → score = 0.0
    with patch("score_pipeline.osrm_distance_km") as mock_dist:
        mock_dist.side_effect = [470.0 * 1.30]
        score, err = geo_score(
            {"lat": 58.5, "lng": 15.0},
            origin=(57.7089, 11.9746),
            destination=(59.3293, 18.0686),
            direct_km=470.0,
            delay=0,
        )
    assert err is False
    assert score == 0.0

def test_geo_score_osrm_failure():
    from score_pipeline import geo_score
    with patch("score_pipeline.osrm_distance_km", side_effect=Exception("timeout")):
        score, err = geo_score(
            {"lat": 58.5, "lng": 15.0},
            origin=(57.7089, 11.9746),
            destination=(59.3293, 18.0686),
            direct_km=470.0,
            delay=0,
        )
    assert score == 0.0
    assert err is True
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
python -m pytest algorithm_data/test_score_pipeline.py -v -k "osrm or geo_score"
```

Expected: fail with `ImportError`

- [ ] **Step 3: Implement OSRM functions**

Append to `algorithm_data/score_pipeline.py` (after `total_score`):

```python
# ---------------------------------------------------------------------------
# OSRM geo scoring
# ---------------------------------------------------------------------------

def osrm_distance_km(coords: list) -> float:
    """
    Call OSRM and return route distance in km.
    coords: list of (lat, lng) tuples — OSRM expects lng,lat order.
    """
    coord_str = ";".join(f"{lng},{lat}" for lat, lng in coords)
    url = f"{OSRM_BASE}/{coord_str}?overview=false"
    resp = requests.get(url, timeout=10)
    resp.raise_for_status()
    routes = resp.json().get("routes", [])
    if not routes:
        raise ValueError("OSRM returned no routes")
    return routes[0]["distance"] / 1000.0


def geo_score(
    company: dict,
    origin: tuple,
    destination: tuple,
    direct_km: float,
    delay: float = OSRM_DELAY_S,
) -> tuple:
    """
    Returns (score: float, osrm_error: bool).
    detour_ratio >= 0.30 → score 0.0.
    """
    time.sleep(delay)
    try:
        detour_km = osrm_distance_km(
            [origin, (company["lat"], company["lng"]), destination]
        )
        detour_ratio = (detour_km - direct_km) / direct_km
        score = max(0.0, 1.0 - detour_ratio / 0.30)
        return round(score, 3), False
    except Exception:
        return 0.0, True
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
python -m pytest algorithm_data/test_score_pipeline.py -v
```

Expected: all 15 tests PASSED

- [ ] **Step 5: Commit**

```bash
git add algorithm_data/score_pipeline.py algorithm_data/test_score_pipeline.py
git commit -m "feat: add OSRM geo scoring with mocked tests"
```

---

## Task 4: Data loading + main pipeline + top-10 output

**Files:**
- Modify: `algorithm_data/score_pipeline.py` (append `load_candidates` + `main`)

- [ ] **Step 1: Append load_candidates and main**

Append to `algorithm_data/score_pipeline.py`:

```python
# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------

def load_candidates() -> list:
    with open(DATA_PATH, encoding="utf-8") as f:
        data = json.load(f)
    return [
        d for d in data
        if d.get("name", "").strip() and d.get("lat") and d.get("lng")
    ]


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------

def main(
    origin: tuple = (57.7089, 11.9746),     # Göteborg
    destination: tuple = (59.3293, 18.0686), # Stockholm
):
    print("Loading candidates...")
    candidates = load_candidates()
    enriched = [mock_enrich(c) for c in candidates]
    print(f"  {len(enriched)} candidates loaded.")

    print("Fetching direct route from OSRM...")
    direct_km = osrm_distance_km([origin, destination])
    print(f"  Direct route: {direct_km:.0f} km")

    print(f"Scoring {len(enriched)} candidates (OSRM rate-limited, ~{len(enriched)*0.2:.0f}s)...")
    results = []
    for i, company in enumerate(enriched):
        g, osrm_err = geo_score(company, origin, destination, direct_km)
        fr = freight_score(company)
        com = commercial_score(company)
        sus = sustainability_score(company)
        score = total_score(g, fr, com, sus)
        results.append({
            "company": company,
            "geo": g,
            "freight": fr,
            "commercial": com,
            "sustainability": sus,
            "total": score,
            "osrm_err": osrm_err,
        })
        if (i + 1) % 20 == 0:
            print(f"  {i + 1}/{len(enriched)}...")

    results.sort(key=lambda r: r["total"], reverse=True)
    top10 = results[:10]

    # Output
    origin_name = "Göteborg"
    dest_name = "Stockholm"
    print()
    print(f"BACKHAUL RANKING: {origin_name} → {dest_name}  (direktrutt: {direct_km:.0f} km)")
    print("═" * 78)
    print(f" {'#':<3} {'Företag':<25} {'Stad':<14} {'Score':<7} {'Geo':<6} {'Frgt':<6} {'Com':<6} {'Sus'}")
    print("─" * 78)
    for rank, r in enumerate(top10, 1):
        c = r["company"]
        flag = " [!]" if r["osrm_err"] else ""
        print(
            f" {rank:<3} {c['name'][:24]:<25} {c.get('city','')[:13]:<14}"
            f" {r['total']:<7.2f} {r['geo']:<6.2f} {r['freight']:<6.2f}"
            f" {r['commercial']:<6.2f} {r['sustainability']:.2f}{flag}"
        )
    print("═" * 78)


if __name__ == "__main__":
    if len(sys.argv) == 3:
        olat, olng = map(float, sys.argv[1].split(","))
        dlat, dlng = map(float, sys.argv[2].split(","))
        main((olat, olng), (dlat, dlng))
    else:
        main()
```

- [ ] **Step 2: Run all tests**

```bash
python -m pytest algorithm_data/test_score_pipeline.py -v
```

Expected: all 15 tests PASSED (no regressions)

- [ ] **Step 3: Smoke-run the pipeline**

```bash
cd /Applications/Lokalt/RouteRider
python algorithm_data/score_pipeline.py
```

Expected: table prints after ~60–90 seconds (278 candidates × 0.2 s). Top entry should have `total` score > 0.60. If OSRM is unavailable you'll see `[!]` flags and geo scores of 0.0.

- [ ] **Step 4: Commit**

```bash
git add algorithm_data/score_pipeline.py
git commit -m "feat: complete scoring pipeline with top-10 terminal output"
```

---

## Self-review notes

- Spec requires `python3 score_pipeline.py 57.7089,11.9746 59.3293,18.0686` — covered in `main()` + `if __name__` block ✓
- Spec requires 200 ms OSRM rate-limiting — `OSRM_DELAY_S = 0.2` + `delay` param in `geo_score` ✓
- Spec requires OSRM errors flagged with `[!]` — done ✓
- Spec requires `bell` function as defined — matches exactly ✓
- All function signatures used in tests match implementations ✓
