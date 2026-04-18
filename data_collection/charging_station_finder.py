#!/usr/bin/env python3
"""
RouteRider — Laddstationsfinnaren
Hittar laddstationer för tunga lastbilar längs Stockholm–Göteborg-korridoren.

Datakällor:
  1. Overpass API (OpenStreetMap) — en enda bbox-query för hela korridoren
  2. Open Charge Map API          — gratis, ingen nyckel
  3. NOBIL API                    — gratis, nordisk databas

Kör: python3 charging_station_finder.py
     python3 charging_station_finder.py --ocm-key <din_nyckel>

Output:
  routerider_laddstationer.json
  routerider_laddstationer.xlsx
"""

import argparse
import json
import logging
import math
import time
from typing import Dict, List, Optional

import requests

log = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-8s %(message)s")

# Bounding box för hela korridoren Stockholm–Göteborg (+ marginal)
CORRIDOR_BBOX = {
    "lat_min": 55.8,
    "lat_max": 59.8,
    "lng_min": 11.3,
    "lng_max": 18.5,
}

HEADERS = {
    "User-Agent": "RouteRider/1.0 (laddstationsfinnare; github.com/albinhallander/RouteRider)",
}

OUTPUT_JSON  = "routerider_laddstationer.json"
OUTPUT_EXCEL = "routerider_laddstationer.xlsx"

# ═══════════════════════════════════════════════════════════════════════════════
# KÄLLA 1: OVERPASS API — en enda query för hela korridoren
# ═══════════════════════════════════════════════════════════════════════════════

OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]

def overpass_query_corridor() -> List[Dict]:
    bb = CORRIDOR_BBOX
    bbox = f"{bb['lat_min']},{bb['lng_min']},{bb['lat_max']},{bb['lng_max']}"

    query = f"""
[out:json][timeout:90];
(
  node["amenity"="charging_station"]({bbox});
  way["amenity"="charging_station"]({bbox});
);
out center tags;
"""

    for attempt in range(3):
        if attempt:
            wait = 30 * attempt
            log.info(f"  Väntar {wait}s innan försök {attempt+1}...")
            time.sleep(wait)
        for url in OVERPASS_URLS:
            try:
                log.info(f"  Försöker {url}...")
                resp = requests.post(url, data={"data": query}, timeout=120, headers=HEADERS)
                resp.raise_for_status()
                data = resp.json()
                log.info(f"  Overpass svarade OK från {url}")
                results = []
                for el in data.get("elements", []):
                    tags = el.get("tags", {})
                    if el["type"] == "node":
                        elat, elng = el.get("lat"), el.get("lon")
                    else:
                        center = el.get("center", {})
                        elat, elng = center.get("lat"), center.get("lon")
                    if not elat:
                        continue
                    results.append({
                        "source":          "openstreetmap",
                        "city":            tags.get("addr:city") or tags.get("addr:place") or "",
                        "name":            tags.get("name") or tags.get("operator") or tags.get("brand") or "Laddstation",
                        "lat":             round(elat, 6),
                        "lng":             round(elng, 6),
                        "address":         (tags.get("addr:street", "") + " " + tags.get("addr:housenumber", "")).strip(),
                        "postcode":        tags.get("addr:postcode", ""),
                        "operator":        tags.get("operator") or tags.get("brand") or "",
                        "hgv_compatible":  _osm_hgv_compatible(tags),
                        "charging_points": _safe_int(tags.get("capacity")),
                        "max_power_kw":    _osm_parse_kw(tags.get("maxpower")),
                        "connectors":      _osm_connectors(tags),
                        "open_hours":      tags.get("opening_hours", ""),
                        "status":          "LIVE",
                        "osm_id":          el.get("id"),
                    })
                log.info(f"Overpass → {len(results)} stationer i korridoren")
                return results
            except Exception as e:
                log.warning(f"  {url} misslyckades: {e}")
    log.error("Overpass misslyckades efter alla försök")
    return []


def _osm_hgv_compatible(tags: Dict) -> bool:
    if tags.get("hgv") == "yes" or tags.get("truck") == "yes":
        return True
    kw = _osm_parse_kw(tags.get("maxpower") or tags.get("socket:type2_combo:output"))
    if kw and kw >= 150:
        return True
    if "mcs" in str(tags).lower():
        return True
    operator = (tags.get("operator") or tags.get("brand") or "").lower()
    if any(op in operator for op in ["einride", "kempower", "scania", "volvo trucks"]):
        return True
    return False


def _osm_parse_kw(val) -> Optional[float]:
    try:
        cleaned = str(val).lower().replace("kw", "").replace("w", "").strip()
        v = float(cleaned)
        return v / 1000 if v >= 10_000 else v
    except (TypeError, ValueError):
        return None


def _osm_connectors(tags: Dict) -> List[str]:
    connectors = []
    for tag, name in [
        ("socket:type2_combo", "CCS2"), ("socket:chademo", "CHAdeMO"),
        ("socket:type2", "Type2"), ("socket:mcs", "MCS"), ("socket:ccs", "CCS"),
    ]:
        if tags.get(tag) or tags.get(f"{tag}:output"):
            connectors.append(name)
    return connectors


def _safe_int(val) -> Optional[int]:
    try:
        return int(str(val).strip())
    except (TypeError, ValueError):
        return None


def _safe_float(val) -> Optional[float]:
    try:
        return float(str(val).replace(",", ".").strip())
    except (TypeError, ValueError):
        return None


# ═══════════════════════════════════════════════════════════════════════════════
# KÄLLA 2: OPEN CHARGE MAP — paginerad, hela korridorens bbox
# ═══════════════════════════════════════════════════════════════════════════════

OCM_BASE = "https://api.openchargemap.io/v3/poi"

def ocm_query_corridor(api_key: Optional[str] = None) -> List[Dict]:
    bb = CORRIDOR_BBOX
    all_results: List[Dict] = []
    page = 1
    page_size = 500

    while True:
        params = {
            "boundingbox":  f"({bb['lat_min']},{bb['lng_min']}),({bb['lat_max']},{bb['lng_max']})",
            "maxresults":   page_size,
            "compact":      True,
            "verbose":      False,
            "countrycode":  "SE",
            "levelid":      3,   # DC snabbladdare
            "offset":       (page - 1) * page_size,
        }
        if api_key:
            params["key"] = api_key

        try:
            resp = requests.get(OCM_BASE, params=params, headers=HEADERS, timeout=30)
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            log.error(f"OCM fel (sida {page}): {e}")
            break

        if not data:
            break

        for poi in data:
            addr_info = poi.get("AddressInfo", {})
            lat = addr_info.get("Latitude")
            lng = addr_info.get("Longitude")
            if not lat:
                continue

            connections = poi.get("Connections") or []
            max_kw = max((c.get("PowerKW") or 0 for c in connections), default=None) or None
            conn_types = list({
                c.get("ConnectionType", {}).get("Title", "") for c in connections
                if c.get("ConnectionType") and c.get("ConnectionType", {}).get("Title")
            })

            hgv = bool(max_kw and max_kw >= 150) or any("mcs" in t.lower() for t in conn_types)
            status_type = poi.get("StatusType") or {}

            all_results.append({
                "source":          "open_charge_map",
                "city":            addr_info.get("Town") or addr_info.get("StateOrProvince") or "",
                "name":            addr_info.get("Title") or "Laddstation",
                "lat":             round(lat, 6),
                "lng":             round(lng, 6),
                "address":         addr_info.get("AddressLine1") or "",
                "postcode":        addr_info.get("Postcode") or "",
                "operator":        (poi.get("OperatorInfo") or {}).get("Title") or "",
                "hgv_compatible":  hgv,
                "charging_points": poi.get("NumberOfPoints"),
                "max_power_kw":    max_kw,
                "connectors":      conn_types,
                "open_hours":      "",
                "status":          "LIVE" if status_type.get("IsOperational", True) else "OFFLINE",
                "ocm_id":          poi.get("ID"),
            })

        log.info(f"  OCM sida {page}: +{len(data)} stationer (totalt {len(all_results)})")

        if len(data) < page_size:
            break
        page += 1
        time.sleep(0.5)

    log.info(f"Open Charge Map → {len(all_results)} stationer i korridoren")
    return all_results


# ═══════════════════════════════════════════════════════════════════════════════
# KÄLLA 3: NOBIL API — Sverige-dump, filtrera till korridoren
# ═══════════════════════════════════════════════════════════════════════════════

NOBIL_BASE = "https://nobil.no/api/server/datadump.php"

def nobil_query_sweden() -> List[Dict]:
    params = {
        "apikey":      "demo",
        "countrycode": "SWE",
        "format":      "json",
        "type":        "json",
    }
    try:
        log.info("NOBIL: Laddar ned Sverige-dump...")
        resp = requests.get(NOBIL_BASE, params=params, headers=HEADERS, timeout=60)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        log.error(f"NOBIL fel: {e}")
        return []

    stations_raw = data.get("chargerstations", []) if isinstance(data, dict) else data
    results = []

    bb = CORRIDOR_BBOX
    for raw in stations_raw:
        attrs = raw.get("attr", {})
        pos   = attrs.get("Position", {})
        lat   = _safe_float(pos.get("lat"))
        lng   = _safe_float(pos.get("lon") or pos.get("lng"))
        if not lat or not lng:
            continue
        if not (bb["lat_min"] <= lat <= bb["lat_max"] and bb["lng_min"] <= lng <= bb["lng_max"]):
            continue

        conn_info  = attrs.get("Connectors", {})
        connectors = []
        max_kw     = None
        for conn in (conn_info.values() if isinstance(conn_info, dict) else []):
            ctype = conn.get("connectortype", {}).get("trans", "")
            if ctype:
                connectors.append(ctype)
            kw = _safe_float(conn.get("chargingcapacity"))
            if kw and (max_kw is None or kw > max_kw):
                max_kw = kw

        results.append({
            "source":          "nobil",
            "city":            attrs.get("Municipality", {}).get("trans", ""),
            "name":            attrs.get("name") or attrs.get("Street", {}).get("trans", "") or "Laddstation",
            "lat":             round(lat, 6),
            "lng":             round(lng, 6),
            "address":         attrs.get("Street", {}).get("trans", ""),
            "postcode":        attrs.get("Zipcode", {}).get("trans", ""),
            "operator":        attrs.get("Owned_by", {}).get("trans", ""),
            "hgv_compatible":  bool(max_kw and max_kw >= 150),
            "charging_points": _safe_int(attrs.get("Number_charging_points")),
            "max_power_kw":    max_kw,
            "connectors":      connectors,
            "open_hours":      attrs.get("Open_Hours", {}).get("trans", ""),
            "status":          "LIVE",
            "nobil_id":        raw.get("id"),
        })

    log.info(f"NOBIL → {len(results)} stationer i korridoren (av {len(stations_raw)} totalt)")
    return results


# ═══════════════════════════════════════════════════════════════════════════════
# DEDUPLICERING
# ═══════════════════════════════════════════════════════════════════════════════

SOURCE_PRIO = {"open_charge_map": 0, "nobil": 1, "openstreetmap": 2}

def deduplicate(stations: List[Dict], distance_m: float = 100) -> List[Dict]:
    def dist(a: Dict, b: Dict) -> float:
        if not (a.get("lat") and b.get("lat")):
            return float("inf")
        dlat = (a["lat"] - b["lat"]) * 111_000
        dlng = (a["lng"] - b["lng"]) * 111_000 * math.cos(math.radians(a["lat"]))
        return math.sqrt(dlat**2 + dlng**2)

    kept: List[Dict] = []
    for s in sorted(stations, key=lambda x: SOURCE_PRIO.get(x.get("source", ""), 9)):
        merged = False
        for existing in kept:
            if dist(s, existing) < distance_m:
                for key in ("operator", "charging_points", "max_power_kw", "open_hours", "address", "city"):
                    if not existing.get(key) and s.get(key):
                        existing[key] = s[key]
                if not existing.get("hgv_compatible") and s.get("hgv_compatible"):
                    existing["hgv_compatible"] = True
                existing_conns = set(existing.get("connectors") or [])
                new_conns      = set(s.get("connectors") or [])
                existing["connectors"] = sorted(existing_conns | new_conns)
                merged = True
                break
        if not merged:
            kept.append(s)
    return kept


# ═══════════════════════════════════════════════════════════════════════════════
# EXPORT
# ═══════════════════════════════════════════════════════════════════════════════

def export_json(stations: List[Dict], path: str = OUTPUT_JSON) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(stations, f, ensure_ascii=False, indent=2)
    log.info(f"Sparade {len(stations)} stationer → {path}")


def export_excel(stations: List[Dict], path: str = OUTPUT_EXCEL) -> None:
    try:
        import pandas as pd
        from openpyxl.styles import Alignment, Font, PatternFill
    except ImportError:
        log.warning("pandas/openpyxl saknas — hoppar över Excel-export")
        return

    COLUMNS = [
        ("Namn",            "name"),
        ("Stad",            "city"),
        ("Adress",          "address"),
        ("Postnr",          "postcode"),
        ("Lat",             "lat"),
        ("Lng",             "lng"),
        ("Operatör",        "operator"),
        ("HGV-kompatibel",  "hgv_compatible"),
        ("Laddpunkter",     "charging_points"),
        ("Max effekt (kW)", "max_power_kw"),
        ("Kontaktorer",     "connectors"),
        ("Öppettider",      "open_hours"),
        ("Status",          "status"),
        ("Källa",           "source"),
    ]

    rows = []
    for s in stations:
        row = {label: s.get(key, "") for label, key in COLUMNS}
        row["Kontaktorer"]    = ", ".join(s.get("connectors") or [])
        row["HGV-kompatibel"] = "Ja" if s.get("hgv_compatible") else "Nej"
        rows.append(row)

    df = pd.DataFrame(rows, columns=[c for c, _ in COLUMNS])
    df.sort_values(["HGV-kompatibel", "Max effekt (kW)"], ascending=[True, False], inplace=True)

    with pd.ExcelWriter(path, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Laddstationer")
        ws = writer.sheets["Laddstationer"]

        for cell in ws[1]:
            cell.fill      = PatternFill("solid", fgColor="1A5276")
            cell.font      = Font(bold=True, color="FFFFFF", size=10)
            cell.alignment = Alignment(horizontal="center")

        hgv_col = next(i for i, (l, _) in enumerate(COLUMNS, 1) if l == "HGV-kompatibel")
        green   = PatternFill("solid", fgColor="C6EFCE")
        for row in ws.iter_rows(min_row=2, max_row=ws.max_row):
            if row[hgv_col - 1].value == "Ja":
                for cell in row:
                    cell.fill = green

        for i, (label, _) in enumerate(COLUMNS, 1):
            ws.column_dimensions[ws.cell(1, i).column_letter].width = {
                "Namn": 35, "Adress": 30, "Operatör": 25, "Kontaktorer": 25
            }.get(label, 14)

        ws.freeze_panes = "A2"
        ws.auto_filter.ref = ws.dimensions

    log.info(f"Excel sparad: {path}")


# ═══════════════════════════════════════════════════════════════════════════════
# HUVUDPROGRAM
# ═══════════════════════════════════════════════════════════════════════════════

def main(ocm_api_key: Optional[str] = None) -> None:
    all_stations: List[Dict] = []

    log.info("=== Källa 1: OpenStreetMap (Overpass) ===")
    all_stations.extend(overpass_query_corridor())

    log.info("\n=== Källa 2: Open Charge Map ===")
    all_stations.extend(ocm_query_corridor(api_key=ocm_api_key))

    log.info("\n=== Källa 3: NOBIL ===")
    all_stations.extend(nobil_query_sweden())

    log.info(f"\nRådata: {len(all_stations)} poster")
    all_stations = deduplicate(all_stations, distance_m=100)
    log.info(f"Efter deduplicering: {len(all_stations)} unika stationer")

    hgv = sum(1 for s in all_stations if s.get("hgv_compatible"))
    log.info(f"  HGV-kompatibla: {hgv}  |  Generella EV: {len(all_stations) - hgv}")

    export_json(all_stations)
    export_excel(all_stations)
    log.info(f"\n✓ Klar! {OUTPUT_JSON} och {OUTPUT_EXCEL} sparade i data_collection/")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--ocm-key", metavar="API_KEY", help="Open Charge Map API-nyckel (valfritt)")
    args = parser.parse_args()
    main(ocm_api_key=args.ocm_key)
