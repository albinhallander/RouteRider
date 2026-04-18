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
