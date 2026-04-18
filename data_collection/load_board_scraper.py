#!/usr/bin/env python3
"""
RouteRider — Load-board snapshot (engångskörning).

Dumpar publikt synliga frakt-/lastannonser från returlast.se.

Verifierat 2026-04-18:
  • returlast.se — /laster/view/<id> redirectar till login, MEN homepage
    och region-sidor embeddar hela annonsen (från/till, datum, avsändare,
    kategori, beskrivning) direkt i <span class="tabell_ram_header">.
    Vi parsar alltså listvyn, inte detaljsidan.
  • cargopedia.net — feed är JS-renderad; publik HTML innehåller ingen
    annonsdata. Kräver Playwright + login för att nå något meningsfullt.
    Skippas i denna snapshot.
  • 123cargo.eu — kräver login för listningar. Skippas.

Output: data_collection/load_board_snapshots/<timestamp>/
        ├─ returlast.jsonl
        └─ summary.json

Kör: python load_board_scraper.py
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Set
from urllib.parse import urljoin

import httpx
from bs4 import BeautifulSoup, Tag

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s %(message)s",
    datefmt="%H:%M:%S",
)
# Tysta httpx-loggar (en rad per request)
logging.getLogger("httpx").setLevel(logging.WARNING)
log = logging.getLogger(__name__)

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 "
    "(+RouteRider research; contact bengt@stockelden.se)"
)
HEADERS = {
    "User-Agent": UA,
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "sv-SE,sv;q=0.9,en;q=0.8",
}

RL_BASE = "https://www.returlast.se"
RL_DELAY = 0.3

OUTPUT_ROOT = Path(__file__).parent / "load_board_snapshots"


@dataclass
class LoadAd:
    source: str
    source_id: str
    url: str
    from_location: str = ""
    to_location: str = ""
    posted_at: str = ""
    category: str = ""
    sender_type: str = ""
    description: str = ""


# ═══════════════════════════════════════════════════════════════════════════════
# RETURLAST.SE — parsning av embedded listningar
# ═══════════════════════════════════════════════════════════════════════════════

RL_VIEW_RE = re.compile(r"/laster/view/(\d+)")


def rl_parse_item(header: Tag) -> Optional[LoadAd]:
    """
    Parsar ett <span class="tabell_ram_header"> element.

    Struktur (observerad 2026-04-18):
        <img ...>
        <a href="/laster/view/ID">
            <strong>FRÅN</strong> till <strong>TILL</strong>
        </a>
        <span style="float:right...">DATUM (TID)<br>AVSÄNDARE<br>KATEGORI</span>
        <br>BESKRIVNING
    """
    a = header.find("a", href=RL_VIEW_RE)
    if not a:
        return None
    m = RL_VIEW_RE.search(a["href"])
    if not m:
        return None
    ad_id = m.group(1)

    strongs = a.find_all("strong")
    from_loc = strongs[0].get_text(strip=True) if len(strongs) >= 1 else ""
    to_loc = strongs[1].get_text(strip=True) if len(strongs) >= 2 else ""

    meta_span = header.find("span", style=re.compile(r"float:\s*right", re.I))
    posted = sender = category = ""
    if meta_span:
        # Dela på <br>
        for br in meta_span.find_all("br"):
            br.replace_with("\n")
        parts = [p.strip() for p in meta_span.get_text("\n").splitlines() if p.strip()]
        if len(parts) >= 1:
            posted = parts[0]
        if len(parts) >= 2:
            sender = parts[1]
        if len(parts) >= 3:
            category = parts[2]

    # Beskrivning = allt text efter meta_span, innanför header
    desc = ""
    if meta_span:
        # Hämta rå HTML och ta det som kommer efter meta_span
        tail = []
        found = False
        for node in header.descendants:
            if node is meta_span:
                found = True
                continue
            if found and isinstance(node, str):
                tail.append(str(node))
        desc = " ".join(t.strip() for t in tail if t.strip())
        # rensa flera mellanrum
        desc = re.sub(r"\s+", " ", desc).strip()

    if not from_loc or not to_loc:
        return None

    return LoadAd(
        source="returlast",
        source_id=ad_id,
        url=f"{RL_BASE}/laster/view/{ad_id}",
        from_location=from_loc,
        to_location=to_loc,
        posted_at=posted,
        category=category,
        sender_type=sender,
        description=desc,
    )


def rl_extract_ads(html: str) -> List[LoadAd]:
    soup = BeautifulSoup(html, "lxml")
    headers = soup.find_all("span", class_="tabell_ram_header")
    ads = []
    for h in headers:
        ad = rl_parse_item(h)
        if ad:
            ads.append(ad)
    return ads


async def rl_find_region_urls(client: httpx.AsyncClient) -> List[str]:
    """Hitta alla region-/kategorilänkar från homepage."""
    r = await client.get(RL_BASE + "/")
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "lxml")
    urls: Set[str] = set()
    for a in soup.find_all("a", href=True):
        href = a["href"]
        # region-sidor, inte view/*
        if "/laster/" in href and "/view/" not in href and "/registrera" not in href:
            urls.add(urljoin(RL_BASE, href))
    return sorted(urls)


async def scrape_returlast() -> List[LoadAd]:
    async with httpx.AsyncClient(
        headers=HEADERS, timeout=15, follow_redirects=False
    ) as client:
        ads: Dict[str, LoadAd] = {}

        # 1. Homepage
        r = await client.get(RL_BASE + "/")
        r.raise_for_status()
        for ad in rl_extract_ads(r.text):
            ads[ad.source_id] = ad
        log.info(f"returlast homepage: +{len(ads)} annonser")

        # 2. Region-sidor (och kategori-sidor)
        region_urls = await rl_find_region_urls(client)
        log.info(f"returlast: hittade {len(region_urls)} region-/kategorilänkar")

        for url in region_urls:
            try:
                r = await client.get(url)
                if r.status_code != 200:
                    continue
                before = len(ads)
                for ad in rl_extract_ads(r.text):
                    ads.setdefault(ad.source_id, ad)
                new = len(ads) - before
                if new:
                    log.info(f"  {url}: +{new} (totalt {len(ads)})")
                await asyncio.sleep(RL_DELAY)
            except Exception as e:
                log.debug(f"{url}: {e}")
                continue

        out = list(ads.values())
        log.info(f"returlast: {len(out)} unika annonser totalt")
        return out


# ═══════════════════════════════════════════════════════════════════════════════
# OUTPUT
# ═══════════════════════════════════════════════════════════════════════════════


def write_jsonl(ads: Iterable[LoadAd], path: Path) -> int:
    n = 0
    with open(path, "w", encoding="utf-8") as f:
        for ad in ads:
            f.write(json.dumps(asdict(ad), ensure_ascii=False) + "\n")
            n += 1
    return n


async def main() -> None:
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out_dir = OUTPUT_ROOT / ts
    out_dir.mkdir(parents=True, exist_ok=True)
    log.info(f"Output: {out_dir}")

    rl_ads = await scrape_returlast()
    rl_count = write_jsonl(rl_ads, out_dir / "returlast.jsonl")

    summary = {
        "snapshot_at": ts,
        "sources": {
            "returlast": {"count": rl_count, "file": "returlast.jsonl"},
            "cargopedia": {"count": 0, "skipped": "JS-renderad feed, kräver login+Playwright"},
            "123cargo": {"count": 0, "skipped": "Listningar bakom login"},
        },
        "total": rl_count,
    }
    with open(out_dir / "summary.json", "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    log.info(f"✓ Klar. {summary['total']} annonser i {out_dir}")


if __name__ == "__main__":
    asyncio.run(main())
