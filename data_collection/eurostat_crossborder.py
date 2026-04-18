#!/usr/bin/env python3
"""
RouteRider — Eurostat Comext cross-border road freight
Hämtar intra-EU vägtransport-flöden per land-par.

Dataset: road_go_ia_rc
  "International road freight transport of reporting country,
   by country of loading and unloading (t, tkm) - annual data"
  Täcker 1999-2024, uppdaterat 2026-02-17.

Dimensioner:
  - geo     = rapporterande land (vart datan kommer från)
  - c_load  = lastland
  - c_unload= avlastningsland
  - unit    = THS_T (tusen ton) eller MIO_TKM
  - tra_cov = transport coverage (INTER_CC = international, utan inrikes)
  - time    = år

Kör: python eurostat_crossborder.py
     python eurostat_crossborder.py --year 2023 --unit THS_T
"""

import argparse
import json
import logging
from pathlib import Path
from typing import Dict, List

import requests

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-8s %(message)s")
log = logging.getLogger(__name__)

BASE_URL = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/road_go_ia_rc"

# Einride-relevanta länder: Norden + DACH
REPORTERS = ["SE", "DK", "FI", "DE", "AT"]  # NO rapporterar inte till Eurostat
# Partners vi bryr oss om
PARTNERS = {"SE", "NO", "DK", "FI", "DE", "AT", "NL", "BE", "PL", "FR", "IT", "CH", "CZ", "LT", "LV", "EE"}

OUTPUT_FILE = "routerider_crossborder.json"


def fetch_reporter(reporter: str, year: int, unit: str = "THS_T") -> dict:
    params = {
        "format": "JSON",
        "lang": "EN",
        "geo": reporter,
        "time": year,
        "unit": unit,
    }
    r = requests.get(BASE_URL, params=params, timeout=60)
    r.raise_for_status()
    return r.json()


def parse_jsonstat(data: dict) -> List[Dict]:
    """Plattar ut JSON-stat 2.0 till rader."""
    dims = data.get("dimension", {})
    values = data.get("value", {})
    size = data.get("size", [])
    dim_ids = data.get("id", [])

    if not values:
        return []

    if isinstance(values, list):
        value_items = [(i, v) for i, v in enumerate(values) if v is not None]
    else:
        value_items = [(int(k), v) for k, v in values.items() if v is not None]

    # Pre-bygg reverse-lookup per dimension: position → kod
    pos_to_code: Dict[str, Dict[int, str]] = {}
    for dim_id in dim_ids:
        idx = dims.get(dim_id, {}).get("category", {}).get("index", {})
        if isinstance(idx, dict):
            pos_to_code[dim_id] = {v: k for k, v in idx.items()}
        else:
            pos_to_code[dim_id] = {i: code for i, code in enumerate(idx)}

    def unravel(flat_idx: int) -> Dict[str, str]:
        coords = {}
        remaining = flat_idx
        for i in range(len(size) - 1, -1, -1):
            s = size[i]
            if s == 0:
                continue
            coord = remaining % s
            remaining //= s
            dim_id = dim_ids[i]
            coords[dim_id] = pos_to_code[dim_id].get(coord, "?")
        return coords

    rows = []
    for idx, val in value_items:
        coords = unravel(idx)
        rows.append({
            "reporter": coords.get("geo", ""),
            "c_load": coords.get("c_load", ""),
            "c_unload": coords.get("c_unload", ""),
            "unit": coords.get("unit", ""),
            "year": coords.get("time", ""),
            "value": val,
        })
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--year", type=int, default=2023)
    ap.add_argument("--unit", default="THS_T", choices=["THS_T", "MIO_TKM"])
    ap.add_argument("--out", default=OUTPUT_FILE)
    args = ap.parse_args()

    all_rows: List[Dict] = []
    for reporter in REPORTERS:
        log.info(f"Hämtar reporter={reporter} year={args.year} unit={args.unit}...")
        try:
            data = fetch_reporter(reporter, args.year, args.unit)
        except requests.HTTPError as e:
            log.warning(f"  Hoppar över {reporter}: {e}")
            continue

        rows = parse_jsonstat(data)
        # Filtrera bort aggregat (EU27_2007 m.fl.) och irrelevanta partners
        keep = [
            r for r in rows
            if len(r["c_load"]) == 2 and len(r["c_unload"]) == 2
            and (r["c_load"] in PARTNERS or r["c_unload"] in PARTNERS)
            and r["c_load"] != r["c_unload"]
        ]
        log.info(f"  {len(rows)} rader från API, {len(keep)} efter filter")
        all_rows.extend(keep)

    # Sortera på värde (största flöden först)
    all_rows.sort(key=lambda r: (r["value"] or 0), reverse=True)

    out_path = Path(__file__).parent / args.out
    out_path.write_text(json.dumps({
        "source": "Eurostat road_go_ia_rc (International road freight by c_load × c_unload)",
        "year": args.year,
        "unit": args.unit,
        "count": len(all_rows),
        "rows": all_rows,
    }, indent=2, ensure_ascii=False))
    log.info(f"Sparat {len(all_rows)} rader till {out_path}")

    # Top-10 sammanfattning
    if all_rows:
        log.info("Topp 10 flöden:")
        for r in all_rows[:10]:
            log.info(f"  {r['c_load']}→{r['c_unload']} (reporter {r['reporter']}): {r['value']} {r['unit']}")


if __name__ == "__main__":
    main()
