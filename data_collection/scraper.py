#!/usr/bin/env python3
"""
RouteRider — Steg 1: Datainsamling
Hämtar företagsdata från Allabolag.se via deras interna API + Playwright.

Kör: python scraper.py
Kräver: pip install -r requirements.txt && playwright install chromium
"""

import asyncio
import json
import logging
from pathlib import Path
from typing import Dict, List, Set

import aiohttp
import pandas as pd
from openpyxl.styles import Alignment, Font, PatternFill
from playwright.async_api import async_playwright, BrowserContext

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════════════════════════════
# KONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════════

# Allabolag intern plats-ID per stad (hämtas via /api/locations)
CITIES: List[Dict] = [
    {"name": "Enköping",    "id": 176},
    {"name": "Västerås",    "id": 235},
    {"name": "Eskilstuna",  "id": 166},
    {"name": "Strängnäs",   "id": 172},
    {"name": "Katrineholm", "id": 169},
    {"name": "Hallsberg",   "id": 289},
    {"name": "Örebro",      "id": 298},
    {"name": "Södertälje",  "id": 156},
    {"name": "Flen",        "id": 167},
    {"name": "Nyköping",    "id": 170},
    {"name": "Norrköping",  "id": 306},
    {"name": "Linköping",   "id": 303},
    {"name": "Jönköping",   "id": 59},
    {"name": "Skövde",      "id": 267},
    {"name": "Falköping",   "id": 244},
    {"name": "Ulricehamn",  "id": 280},
    {"name": "Borås",       "id": 241},
    {"name": "Alingsås",    "id": 238},
]

# Allabolags branschkategorier att söka (svenska namn = vad deras API förstår)
BRANSCH_QUERIES: List[str] = [
    "Grosshandel", "Partihandel", "Livsmedel", "Grossister",
    "Tillverkning", "Industri", "Lager", "Logistik",
    "Metallvaror", "Maskiner", "Byggmaterial",
    "Kemikalier", "Plast", "Papper", "Trä",
    "Fordon", "Reservdelar", "Detaljhandel",
    "Distributionscenter", "E-handel",
]

MIN_OMSATTNING_KR = 5_000_000
OUTPUT_FILE       = "routerider_foretag.xlsx"
CHECKPOINT_FILE   = "checkpoint.json"
BASE_URL          = "https://www.allabolag.se"
CONCURRENCY       = 8   # Antal parallella API-anrop

API_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json",
    "Referer": BASE_URL,
    "Accept-Language": "sv-SE,sv;q=0.9",
}

# ═══════════════════════════════════════════════════════════════════════════════
# API-SCANNING (snabb, parallell)
# ═══════════════════════════════════════════════════════════════════════════════

async def api_scan_industry_id(
    session: aiohttp.ClientSession,
    city: Dict,
    industry_id: int,
    sem: asyncio.Semaphore,
) -> List[Dict]:
    """Hämtar supplier-listings för en stad + ett industry-ID."""
    async with sem:
        url = f"{BASE_URL}/api/search?locationId={city['id']}&industryId={industry_id}&size=100"
        try:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=12)) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    companies = data.get("companies", [])
                    for c in companies:
                        c["_city"] = city["name"]
                    return companies
        except Exception:
            pass
        return []


async def scan_all_industry_ids(city: Dict, session: aiohttp.ClientSession) -> List[Dict]:
    """
    Scannar industry-ID:n 1–500 för en stad.
    Returnerar alla funna bolag (deduplicerade på org.nr).
    """
    sem = asyncio.Semaphore(CONCURRENCY)
    tasks = [api_scan_industry_id(session, city, ind_id, sem) for ind_id in range(1, 501)]
    results = await asyncio.gather(*tasks)
    seen: Set[str] = set()
    companies: List[Dict] = []
    for batch in results:
        for c in batch:
            key = str(c.get("orgnr", ""))
            if key and key not in seen:
                seen.add(key)
                companies.append(c)
    return companies


# ═══════════════════════════════════════════════════════════════════════════════
# PLAYWRIGHT-SÖKNING (fångar API-svar via rendered sidor)
# ═══════════════════════════════════════════════════════════════════════════════

async def playwright_search(
    context: BrowserContext,
    city: Dict,
    bransch: str,
    collected: Dict,
) -> int:
    """
    Öppnar Allabolag bransch-sökning i browser, fångar API-svaret och
    samlar in bolag. Returnerar antal nya bolag som hittades.
    """
    page = await context.new_page()
    found: List[Dict] = []

    async def on_response(response):
        if "/api/search" in response.url and response.status == 200:
            try:
                data = await response.json()
                companies = data.get("companies", [])
                for c in companies:
                    c["_city"] = city["name"]
                found.extend(companies)
            except Exception:
                pass

    page.on("response", on_response)

    try:
        url = f"{BASE_URL}/bransch-s%C3%B6k?q={bransch}&locationId={city['id']}"
        await page.goto(url, wait_until="networkidle", timeout=30_000)
        await page.wait_for_timeout(2_000)

        # Bläddra igenom sidor om det finns "nästa"-knapp
        for _ in range(5):
            next_btn = await page.query_selector("a[rel='next'], button:text('Nästa')")
            if not next_btn:
                break
            await next_btn.click()
            await page.wait_for_load_state("networkidle")
            await page.wait_for_timeout(1_500)

    except Exception as e:
        log.debug(f"Playwright fel ({city['name']}, {bransch}): {e}")
    finally:
        await page.close()

    new = 0
    for c in found:
        key = str(c.get("orgnr", ""))
        if key and key not in collected:
            collected[key] = normalize_company(c, c.get("_city", city["name"]))
            new += 1
    return new


# ═══════════════════════════════════════════════════════════════════════════════
# NORMALISERING
# ═══════════════════════════════════════════════════════════════════════════════

def normalize_company(raw: Dict, city_name: str = "") -> Dict:
    """Konverterar Allabolags API-format till vårt standard-format."""
    coords = (raw.get("location") or {}).get("coordinates", [])
    lat = coords[0].get("ycoordinate") if coords else None
    lng = coords[0].get("xcoordinate") if coords else None

    addr = raw.get("visitorAddress") or raw.get("postalAddress") or {}

    rev_raw = raw.get("revenue") or ""
    try:
        omsattning_kr = int(str(rev_raw).replace(" ", "")) if rev_raw else 0
    except ValueError:
        omsattning_kr = 0

    industries = raw.get("industries") or []
    bransch = industries[0].get("name", "") if industries else ""

    contact     = raw.get("contactPerson") or {}
    kp_name     = contact.get("name", "")
    kp_role     = contact.get("role", "")
    kontakt_str = f"{kp_name} ({kp_role})".strip(" ()") if kp_name else ""

    orgnr_raw = str(raw.get("orgnr") or raw.get("customerId") or "")
    orgnr_fmt = (orgnr_raw[:6] + "-" + orgnr_raw[6:]) if len(orgnr_raw) == 10 else orgnr_raw

    return {
        "namn":           raw.get("name") or raw.get("legalName") or "",
        "org_nr":         orgnr_fmt,
        "stad":           city_name or raw.get("_city", ""),
        "adress":         (addr.get("addressLine") or "").strip(),
        "postnr":         (addr.get("zipCode") or "").replace(" ", ""),
        "ort":            addr.get("postPlace") or "",
        "lat":            lat,
        "lng":            lng,
        "bransch":        bransch,
        "sni_kod":        "",
        "omsattning_kr":  omsattning_kr,
        "anstallda":      raw.get("employees") or "",
        "hemsida":        raw.get("homePage") or "",
        "telefon":        raw.get("phone") or "",
        "email":          raw.get("email") or "",
        "kontaktperson":  kontakt_str,
        "allabolag_url":  f"{BASE_URL}/{orgnr_fmt}",
    }


def passes_filter(company: Dict) -> bool:
    return company.get("omsattning_kr", 0) >= MIN_OMSATTNING_KR


# ═══════════════════════════════════════════════════════════════════════════════
# GODSPOTENTIAL & PRIORITET
# ═══════════════════════════════════════════════════════════════════════════════

BRANSCH_FAKTOR: Dict[str, float] = {
    "10": 3.0, "11": 2.5, "15": 2.2, "16": 1.8, "17": 1.8,
    "20": 2.2, "21": 2.5, "22": 2.0, "23": 2.0, "24": 2.5,
    "25": 2.0, "28": 2.2, "29": 2.0, "45": 1.5, "46": 2.8,
    "47": 1.8, "52": 3.5,
}

def godspotential(company: Dict) -> int:
    sni = (company.get("sni_kod") or "")[:2]
    faktor = BRANSCH_FAKTOR.get(sni, 1.2)
    return max(1, int(company.get("omsattning_kr", 0) / 1_000_000 * faktor))

def prioritet(score: int) -> str:
    if score >= 50: return "H"
    if score >= 15: return "M"
    return "L"


# ═══════════════════════════════════════════════════════════════════════════════
# EXCEL-EXPORT
# ═══════════════════════════════════════════════════════════════════════════════

COLUMNS = [
    ("Prioritet",          "prioritet"),
    ("Godspotential/mån",  "godspotential"),
    ("Företagsnamn",       "namn"),
    ("Org.nr",             "org_nr"),
    ("Stad (korridor)",    "stad"),
    ("Gatuadress",         "adress"),
    ("Postnr",             "postnr"),
    ("Ort",                "ort"),
    ("Lat",                "lat"),
    ("Lng",                "lng"),
    ("Bransch",            "bransch"),
    ("SNI-kod",            "sni_kod"),
    ("Omsättning (kr)",    "omsattning_kr"),
    ("Anställda",          "anstallda"),
    ("Telefon",            "telefon"),
    ("Email",              "email"),
    ("Hemsida",            "hemsida"),
    ("Kontaktperson",      "kontaktperson"),
    ("Outreach-status",    "outreach_status"),
    ("Anteckningar",       "anteckningar"),
    ("Allabolag-URL",      "allabolag_url"),
]

PRIO_COLORS = {"H": "C6EFCE", "M": "FFEB9C", "L": "FFC7CE"}
COL_WIDTHS  = {
    "Företagsnamn": 38, "Gatuadress": 32, "Bransch": 32,
    "Hemsida": 35, "Allabolag-URL": 42, "Omsättning (kr)": 20,
    "Kontaktperson": 28, "Anteckningar": 30, "Outreach-status": 18,
}

def export_excel(companies: Dict, path: str = OUTPUT_FILE) -> None:
    rows = []
    for c in companies.values():
        score = godspotential(c)
        c["godspotential"]   = score
        c["prioritet"]       = prioritet(score)
        c["outreach_status"] = "Ej kontaktad"
        c.setdefault("anteckningar", "")
        rows.append({label: c.get(key, "") for label, key in COLUMNS})

    df = pd.DataFrame(rows, columns=[col for col, _ in COLUMNS])
    df.sort_values(["Prioritet", "Godspotential/mån"], ascending=[True, False], inplace=True)

    with pd.ExcelWriter(path, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Företag")
        ws = writer.sheets["Företag"]

        for cell in ws[1]:
            cell.fill = PatternFill("solid", fgColor="1F3A6E")
            cell.font = Font(bold=True, color="FFFFFF", size=10)
            cell.alignment = Alignment(horizontal="center")
        ws.row_dimensions[1].height = 22

        prio_idx = next(i for i, (l, _) in enumerate(COLUMNS, 1) if l == "Prioritet")
        for row in ws.iter_rows(min_row=2, max_row=ws.max_row):
            prio = row[prio_idx - 1].value or ""
            fill = PatternFill("solid", fgColor=PRIO_COLORS.get(prio, "FFFFFF"))
            for cell in row:
                cell.fill = fill

        for i, (label, _) in enumerate(COLUMNS, 1):
            ws.column_dimensions[ws.cell(1, i).column_letter].width = COL_WIDTHS.get(label, 14)

        ws.freeze_panes = "A2"
        ws.auto_filter.ref = ws.dimensions

    log.info(f"✓ Excel sparad: {path}  ({len(rows)} bolag)")


# ═══════════════════════════════════════════════════════════════════════════════
# CHECKPOINT
# ═══════════════════════════════════════════════════════════════════════════════

def load_checkpoint() -> Dict:
    if Path(CHECKPOINT_FILE).exists():
        with open(CHECKPOINT_FILE) as f:
            data = json.load(f)
        log.info(f"Återupptar checkpoint — {len(data['companies'])} bolag insamlade")
        return data
    return {"companies": {}, "done_keys": []}

def save_checkpoint(companies: Dict, done: List[str]) -> None:
    with open(CHECKPOINT_FILE, "w") as f:
        json.dump({"companies": companies, "done_keys": done}, f, ensure_ascii=False, indent=2)


# ═══════════════════════════════════════════════════════════════════════════════
# HUVUDPROGRAM
# ═══════════════════════════════════════════════════════════════════════════════

async def run() -> None:
    cp       = load_checkpoint()
    companies: Dict = cp["companies"]
    done:     Set[str] = set(cp["done_keys"])

    # ── Fas A: Snabb parallell API-scanning ──────────────────────────────────
    log.info("Fas A: Parallel API-scan (industry-ID 1–500 per stad)")
    async with aiohttp.ClientSession(headers=API_HEADERS) as session:
        for city in CITIES:
            key = f"api|{city['name']}"
            if key in done:
                continue
            log.info(f"  Scannar {city['name']}...")
            raw_list = await scan_all_industry_ids(city, session)
            new = 0
            for raw in raw_list:
                orgnr = str(raw.get("orgnr", ""))
                if orgnr and orgnr not in companies:
                    c = normalize_company(raw, city["name"])
                    if passes_filter(c):
                        companies[orgnr] = c
                        new += 1
            log.info(f"  {city['name']}: +{new} bolag  (totalt: {len(companies)})")
            done.add(key)
            save_checkpoint(companies, list(done))

    # ── Fas B: Playwright-sökning med branschnamn ────────────────────────────
    log.info(f"\nFas B: Playwright-sökning — {len(CITIES)} städer × {len(BRANSCH_QUERIES)} branscher")
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(
            locale="sv-SE",
            user_agent=API_HEADERS["User-Agent"],
        )

        for city in CITIES:
            for bransch in BRANSCH_QUERIES:
                key = f"pw|{city['name']}|{bransch}"
                if key in done:
                    continue

                new = await playwright_search(context, city, bransch, companies)
                # Filtrera bort bolag under omsättningsgränsen
                to_remove = [k for k, v in companies.items() if not passes_filter(v)]
                for k in to_remove:
                    del companies[k]

                if new > 0:
                    log.info(f"  {city['name']} / {bransch}: +{new} bolag")

                done.add(key)
                save_checkpoint(companies, list(done))
                await asyncio.sleep(1.0)

        await browser.close()

    log.info(f"\nTotalt: {len(companies)} unika bolag")
    if companies:
        export_excel(companies)
        print(f"\n✓ Klar! Öppna {OUTPUT_FILE}")
        Path(CHECKPOINT_FILE).unlink(missing_ok=True)
    else:
        print("\n⚠ Inga bolag hittades — se log.")


def main() -> None:
    asyncio.run(run())

if __name__ == "__main__":
    main()
