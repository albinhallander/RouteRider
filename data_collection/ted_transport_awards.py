#!/usr/bin/env python3
"""
RouteRider — TED (Tenders Electronic Daily) transport-upphandlingar
Hämtar offentliga notiser för vägtransport (CPV 60100000 m.fl.)
i Norden + DACH.

Output: lista på åkerier / transportföretag som deltar i offentliga
transportupphandlingar → outreach-kandidater med bevisad kapacitet.

Kör: python ted_transport_awards.py
     python ted_transport_awards.py --since 20240101 --countries SWE,NOR,DNK
     python ted_transport_awards.py --only-awards    # filtrera till kontraktstilldelningar
"""

import argparse
import json
import logging
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional

import requests

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-8s %(message)s")
log = logging.getLogger(__name__)

TED_ENDPOINT = "https://api.ted.europa.eu/v3/notices/search"

# ISO3 country codes — Norden + DACH
DEFAULT_COUNTRIES = ["SWE", "NOR", "DNK", "FIN", "DEU", "AUT"]

# CPV-koder för vägtransport av gods
# 60100000 = Road transport services
# 60180000 = Hire of goods-transport vehicles with driver
# 60181000 = Hire of trucks with driver
CPV_CODES = ["60100000", "60180000", "60181000"]

# Notice types där vinnare/tilldelning finns (eForms SDK)
# can-* = Contract Award Notice varianter
AWARD_NOTICE_TYPES = {"can-standard", "can-social", "can-modif", "can-desg", "can-tran"}

# Giltiga fält verifierade mot TED API v3
REQUEST_FIELDS = [
    "publication-number",
    "notice-type",
    "notice-title",
    "buyer-name",
    "winner-name",
    "total-value",
    "total-value-cur",
    "classification-cpv",
    "place-of-performance",
    "organisation-country-buyer",
    "publication-date",
    "links",
]

OUTPUT_FILE = "routerider_ted_awards.json"


def build_query(since: str, countries: List[str], cpv_codes: List[str], only_awards: bool) -> str:
    cpv_expr = " OR ".join(f"classification-cpv={c}" for c in cpv_codes)
    country_expr = " OR ".join(f"organisation-country-buyer={c}" for c in countries)
    q = (
        f"({cpv_expr}) "
        f"AND ({country_expr}) "
        f"AND publication-date>={since}"
    )
    if only_awards:
        award_expr = " OR ".join(f"notice-type={t}" for t in sorted(AWARD_NOTICE_TYPES))
        q += f" AND ({award_expr})"
    return q


def fetch_page(query: str, next_token: Optional[str] = None, limit: int = 250) -> dict:
    body = {
        "query": query,
        "fields": REQUEST_FIELDS,
        "limit": limit,
        "scope": "ALL",
        "paginationMode": "ITERATION",
        "iterationNextToken": next_token,
        "checkQuerySyntax": False,
    }
    r = requests.post(TED_ENDPOINT, json=body, timeout=60)
    if r.status_code != 200:
        log.error(f"TED API {r.status_code}: {r.text[:400]}")
        r.raise_for_status()
    return r.json()


def pick_lang(value, prefer=("eng", "swe", "nor", "dan", "fin", "deu")):
    """TED returnerar multilingual fält som dict {lang: [strings]} eller list av dicts."""
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        # list av strings eller list av dicts
        if not value:
            return None
        if isinstance(value[0], str):
            return value[0]
        if isinstance(value[0], dict):
            return pick_lang(value[0], prefer)
        return str(value[0])
    if isinstance(value, dict):
        for lang in prefer:
            if lang in value:
                v = value[lang]
                if isinstance(v, list) and v:
                    return v[0]
                if isinstance(v, str):
                    return v
        # fallback: första värdet
        for v in value.values():
            if isinstance(v, list) and v:
                return v[0]
            if isinstance(v, str):
                return v
    return None


def extract_place(pop):
    """place-of-performance kommer som list av NUTS + ISO3. Returnera unika NUTS3."""
    if not pop:
        return []
    if isinstance(pop, str):
        pop = [pop]
    nuts = []
    seen = set()
    for item in pop:
        if not isinstance(item, str):
            continue
        # Skippa ISO3 (3 bokstäver) — vi tar bara NUTS (2+1-5 tecken, startar med land)
        if len(item) == 3 and item.isalpha():
            continue
        if item not in seen:
            seen.add(item)
            nuts.append(item)
    return nuts


def flatten_notice(notice: dict) -> Dict:
    links = notice.get("links")
    html_link = None
    if isinstance(links, dict) and isinstance(links.get("html"), dict):
        html_map = links["html"]
        for lang in ("ENG", "SWE", "DEU", "DAN", "FIN", "NOR"):
            if lang in html_map:
                html_link = html_map[lang]
                break
        if not html_link and html_map:
            html_link = next(iter(html_map.values()))

    return {
        "publication_number": notice.get("publication-number"),
        "notice_type": notice.get("notice-type"),
        "publication_date": notice.get("publication-date"),
        "title": pick_lang(notice.get("notice-title")),
        "buyer_name": pick_lang(notice.get("buyer-name")),
        "buyer_country": (notice.get("organisation-country-buyer") or [None])[0] if isinstance(notice.get("organisation-country-buyer"), list) else notice.get("organisation-country-buyer"),
        "winner_name": pick_lang(notice.get("winner-name")),
        "total_value": notice.get("total-value"),
        "total_value_cur": notice.get("total-value-cur"),
        "cpv": notice.get("classification-cpv"),
        "place_nuts": extract_place(notice.get("place-of-performance")),
        "link": html_link,
    }


def main():
    ap = argparse.ArgumentParser()
    default_since = (datetime.now() - timedelta(days=730)).strftime("%Y%m%d")
    ap.add_argument("--since", default=default_since, help="YYYYMMDD, default = 24 mån bakåt")
    ap.add_argument("--countries", default=",".join(DEFAULT_COUNTRIES))
    ap.add_argument("--max-pages", type=int, default=40)
    ap.add_argument("--limit", type=int, default=250)
    ap.add_argument("--only-awards", action="store_true",
                    help="Bara kontraktstilldelningar (can-*); default=alla notiser")
    ap.add_argument("--out", default=OUTPUT_FILE)
    args = ap.parse_args()

    countries = [c.strip().upper() for c in args.countries.split(",")]
    query = build_query(args.since, countries, CPV_CODES, args.only_awards)
    log.info(f"TED-query: {query}")

    all_notices: List[Dict] = []
    next_token: Optional[str] = None
    total: Optional[int] = None

    for page in range(1, args.max_pages + 1):
        log.info(f"Hämtar sida {page}...")
        try:
            data = fetch_page(query, next_token=next_token, limit=args.limit)
        except requests.HTTPError as e:
            log.error(f"Avbryter efter {len(all_notices)} notices: {e}")
            break

        notices = data.get("notices", [])
        for n in notices:
            all_notices.append(flatten_notice(n))

        total = data.get("totalNoticeCount", total)
        next_token = data.get("iterationNextToken")
        log.info(f"  +{len(notices)} (totalt {len(all_notices)}/{total})")

        if not next_token or not notices:
            break
        time.sleep(0.3)

    # Sammanställ unika vinnare
    winners = {}
    for n in all_notices:
        w = n.get("winner_name")
        if w:
            winners[w] = winners.get(w, 0) + 1

    out_path = Path(__file__).parent / args.out
    out_path.write_text(json.dumps({
        "source": "TED api.ted.europa.eu/v3",
        "query": query,
        "fetched_at": datetime.now().isoformat(),
        "count": len(all_notices),
        "total_matching": total,
        "top_winners": sorted(winners.items(), key=lambda x: -x[1])[:50],
        "notices": all_notices,
    }, indent=2, ensure_ascii=False))
    log.info(f"Sparat {len(all_notices)} notiser till {out_path}")
    log.info(f"Unika vinnare: {len(winners)}")
    if winners:
        log.info("Topp 10 vinnare (flest kontrakt):")
        for name, count in sorted(winners.items(), key=lambda x: -x[1])[:10]:
            log.info(f"  {count}× {name}")


if __name__ == "__main__":
    main()
