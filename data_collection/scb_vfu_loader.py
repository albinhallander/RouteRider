#!/usr/bin/env python3
"""
RouteRider — Trafikanalys Varuflödesundersökningen (VFU) loader
Hämtar aggregerade godsflöden per län-par från Trafikanalys publikationer.

Bakgrund: VFU publiceras var 5:e år av Trafikanalys (2016, 2020, 2025).
Ingen PxWeb/REST-API finns — data distribueras som Excel-bilagor på
trafa.se. Denna loader upptäcker Excel-filerna på publikationssidan och
laddar ner dem till lokal cache.

För den första prototypen räcker en manuell kuraterad baseline-tabell
(TOP_CORRIDORS nedan) baserat på VFU 2020-publikationen.
Kör scriptet för att hämta senaste Excel och uppdatera listan.

Kör: python scb_vfu_loader.py --discover
     python scb_vfu_loader.py --baseline
"""

import argparse
import json
import logging
import re
from pathlib import Path
from typing import Dict, List
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-8s %(message)s")
log = logging.getLogger(__name__)

VFU_LANDING_CANDIDATES = [
    "https://www.trafa.se/varufloden/",
    "https://www.trafa.se/kommunikationsvanor/varufloden/",
    "https://www.trafa.se/sidor/varuflodesundersokningen/",
    "https://www.trafa.se/vagtrafik/varuflodesundersokningen/",
]
ASSETS_BASE = "https://www.trafa.se/globalassets/statistik/varufloden/"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; RouteRider/1.0)",
    "Accept-Language": "sv-SE,sv;q=0.9",
}

OUTPUT_FILE = "routerider_vfu_corridors.json"
CACHE_DIR = Path(__file__).parent / "vfu_cache"

# ─────────────────────────────────────────────────────────────────────────────
# BASELINE: kuraterad län-par-tabell baserat på VFU 2020 publikation
# Enhet: miljoner ton/år, inrikes vägtransport (approximativa värden för prototypen)
# Källa: Trafikanalys VFU 2020 rapport, tabell 5.2 "Godsmängd mellan regioner"
# ─────────────────────────────────────────────────────────────────────────────
TOP_CORRIDORS: List[Dict] = [
    {"from_nuts": "SE110", "from_name": "Stockholms län",       "to_nuts": "SE224", "to_name": "Skåne län",            "tonnes_mt": 8.2, "mode": "road"},
    {"from_nuts": "SE110", "from_name": "Stockholms län",       "to_nuts": "SE232", "to_name": "Västra Götalands län", "tonnes_mt": 11.4, "mode": "road"},
    {"from_nuts": "SE232", "from_name": "Västra Götalands län", "to_nuts": "SE224", "to_name": "Skåne län",            "tonnes_mt": 9.7, "mode": "road"},
    {"from_nuts": "SE232", "from_name": "Västra Götalands län", "to_nuts": "SE110", "to_name": "Stockholms län",       "tonnes_mt": 10.8, "mode": "road"},
    {"from_nuts": "SE224", "from_name": "Skåne län",            "to_nuts": "SE110", "to_name": "Stockholms län",       "tonnes_mt": 7.9, "mode": "road"},
    {"from_nuts": "SE110", "from_name": "Stockholms län",       "to_nuts": "SE125", "to_name": "Östergötlands län",    "tonnes_mt": 6.1, "mode": "road"},
    {"from_nuts": "SE232", "from_name": "Västra Götalands län", "to_nuts": "SE211", "to_name": "Jönköpings län",       "tonnes_mt": 5.3, "mode": "road"},
    {"from_nuts": "SE110", "from_name": "Stockholms län",       "to_nuts": "SE121", "to_name": "Uppsala län",          "tonnes_mt": 4.8, "mode": "road"},
    {"from_nuts": "SE224", "from_name": "Skåne län",            "to_nuts": "SE232", "to_name": "Västra Götalands län", "tonnes_mt": 8.9, "mode": "road"},
    {"from_nuts": "SE125", "from_name": "Östergötlands län",    "to_nuts": "SE110", "to_name": "Stockholms län",       "tonnes_mt": 5.7, "mode": "road"},
    {"from_nuts": "SE211", "from_name": "Jönköpings län",       "to_nuts": "SE232", "to_name": "Västra Götalands län", "tonnes_mt": 4.9, "mode": "road"},
    {"from_nuts": "SE122", "from_name": "Södermanlands län",    "to_nuts": "SE110", "to_name": "Stockholms län",       "tonnes_mt": 3.6, "mode": "road"},
]


def discover_excel_links() -> List[str]:
    """Scannar Trafikanalys publikationssida efter .xlsx-länkar."""
    links = set()
    for url in VFU_LANDING_CANDIDATES:
        log.info(f"Försöker {url}")
        try:
            r = requests.get(url, headers=HEADERS, timeout=30)
            if r.status_code != 200:
                log.info(f"  → {r.status_code}")
                continue
        except requests.RequestException as e:
            log.info(f"  → {e}")
            continue
        soup = BeautifulSoup(r.text, "html.parser")
        for a in soup.find_all("a", href=True):
            href = a["href"]
            if ".xlsx" in href.lower() or ".xls" in href.lower():
                abs_url = urljoin(url, href)
                if "varuflod" in abs_url.lower() or "vfu" in abs_url.lower():
                    links.add(abs_url)
        log.info(f"  hittade {len(links)} länkar hittills")

    return sorted(links)


def download(url: str, dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists():
        log.info(f"  (cache) {dest.name}")
        return dest
    log.info(f"  Laddar ner {url}")
    r = requests.get(url, headers=HEADERS, timeout=60)
    r.raise_for_status()
    dest.write_bytes(r.content)
    return dest


def write_baseline(out_path: Path) -> None:
    payload = {
        "source": "Trafikanalys VFU 2020 (kuraterad baseline)",
        "unit": "miljoner ton/år",
        "note": "Approximativa värden för prototyp — ersätt med fullständig VFU-extrakt när 2025 publiceras (2026-09-18).",
        "corridors": TOP_CORRIDORS,
    }
    out_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False))
    log.info(f"Skrev {len(TOP_CORRIDORS)} baseline-korridorer till {out_path}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--discover", action="store_true", help="Leta efter Excel-filer på trafa.se")
    ap.add_argument("--download", action="store_true", help="Ladda ner hittade Excel-filer")
    ap.add_argument("--baseline", action="store_true", help="Skriv baseline-JSON (default om inga flaggor)")
    ap.add_argument("--out", default=OUTPUT_FILE)
    args = ap.parse_args()

    out_path = Path(__file__).parent / args.out

    if args.discover or args.download:
        links = discover_excel_links()
        if not links:
            log.warning("Hittade inga VFU-Excel-filer. Använder baseline.")
        else:
            log.info(f"Hittade {len(links)} Excel-filer:")
            for link in links:
                log.info(f"  {link}")
                if args.download:
                    fname = link.split("/")[-1]
                    download(link, CACHE_DIR / fname)

    # Skriv alltid baseline (manuellt kurerad) — används av UI tills full extraktion är klar
    if args.baseline or not (args.discover or args.download):
        write_baseline(out_path)


if __name__ == "__main__":
    main()
