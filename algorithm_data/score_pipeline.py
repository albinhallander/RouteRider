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

    seed = int(hashlib.md5(company.get("name", "unknown").encode()).hexdigest()[:8], 16)
    omsattning = rev_lo + (seed % (rev_hi - rev_lo + 1))
    anstallda = emp_lo + ((seed >> 8) % (emp_hi - emp_lo + 1))

    return {**company, "sni": sni, "omsattning_msek": omsattning, "anstallda": anstallda}


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
    except (requests.RequestException, ValueError, OSError):
        return 0.0, True


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
