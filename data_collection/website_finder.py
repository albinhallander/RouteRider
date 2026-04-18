#!/usr/bin/env python3
"""
RouteRider — Website discovery.

For each entry in src/data/companies.json (and carriers.json) missing a
`hemsida` / `website`, try to find one:

  1. DuckDuckGo HTML search:  "<name>" <city> site:.se
  2. LLM (OpenAI) guess as fallback.

Each candidate URL is verified by fetching the page and checking that the
title or body contains a meaningful token from the company name. Confirmed
websites are written back to the JSON file in-place.

Usage:
    export OPENAI_API_KEY=sk-...
    python website_finder.py                 # process all
    python website_finder.py --limit 20
    python website_finder.py --only companies
    python website_finder.py --dry-run
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
import sys
import time
import urllib.parse
from pathlib import Path

import httpx
from bs4 import BeautifulSoup

try:
    from openai import OpenAI
except ImportError:
    OpenAI = None

log = logging.getLogger("web")
logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-7s %(message)s")

ROOT = Path(__file__).resolve().parent.parent
COMPANIES_PATH = ROOT / "src" / "data" / "companies.json"
CARRIERS_PATH = ROOT / "src" / "data" / "carriers.json"

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
)

# Domains we never accept as a company website
BLOCKLIST = {
    "allabolag.se", "ratsit.se", "hitta.se", "eniro.se", "bolagsfakta.se",
    "linkedin.com", "facebook.com", "instagram.com", "twitter.com", "x.com",
    "youtube.com", "wikipedia.org", "google.com", "duckduckgo.com",
    "merinfo.se", "proff.se", "birojo.se", "largestcompanies.com",
    "apple.com", "crunchbase.com", "bloomberg.com",
}

STOPWORDS = {
    "ab", "aktiebolag", "hb", "kb", "holding", "sverige", "sweden", "scandinavia",
    "group", "gruppen", "the", "och", "and", "i", "&",
}

OPENAI_MODEL = os.environ.get("OPENAI_SUSTAIN_MODEL", "gpt-4o-mini")


def load_json(path: Path) -> list[dict]:
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def save_json(path: Path, data) -> None:
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def name_tokens(name: str) -> list[str]:
    toks = re.findall(r"[a-zåäöéüA-ZÅÄÖÉÜ0-9]+", name.lower())
    return [t for t in toks if t not in STOPWORDS and len(t) > 2]


def domain_of(url: str) -> str:
    try:
        host = urllib.parse.urlparse(url).netloc.lower()
        return host[4:] if host.startswith("www.") else host
    except Exception:
        return ""


def is_blocked(url: str) -> bool:
    d = domain_of(url)
    if not d:
        return True
    return any(d == b or d.endswith("." + b) for b in BLOCKLIST)


def duckduckgo_search(client: httpx.Client, query: str) -> list[str]:
    try:
        r = client.post(
            "https://html.duckduckgo.com/html/",
            data={"q": query},
            timeout=15.0,
            follow_redirects=True,
        )
        if r.status_code >= 400:
            return []
    except Exception as e:
        log.debug("DDG %s: %s", query, e)
        return []

    soup = BeautifulSoup(r.text, "lxml")
    urls: list[str] = []
    for a in soup.select("a.result__a, a.result__url"):
        href = a.get("href", "")
        if not href:
            continue
        # DDG wraps in a redirect — unwrap
        if href.startswith("//duckduckgo.com/l/") or "/l/?uddg=" in href:
            qs = urllib.parse.urlparse("https:" + href if href.startswith("//") else href).query
            params = urllib.parse.parse_qs(qs)
            if "uddg" in params:
                href = urllib.parse.unquote(params["uddg"][0])
        if href.startswith("http") and not is_blocked(href):
            urls.append(href)
        if len(urls) >= 8:
            break
    return urls


def llm_guess(client_ai, name: str, city: str) -> str:
    if client_ai is None:
        return ""
    prompt = (
        f"What is the official company website URL for:\n"
        f"  Company: {name}\n"
        f"  City: {city or 'Sweden'}\n\n"
        "Return strict JSON: {\"url\": \"https://...\"} — use empty string if unknown. "
        "Only respond with the single most likely official site (not LinkedIn, allabolag, "
        "or directories). Prefer .se domains for Swedish companies."
    )
    try:
        resp = client_ai.chat.completions.create(
            model=OPENAI_MODEL,
            max_tokens=120,
            response_format={"type": "json_object"},
            messages=[{"role": "user", "content": prompt}],
        )
        text = (resp.choices[0].message.content or "").strip()
        data = json.loads(text)
        url = (data.get("url") or "").strip()
        return url if url.startswith("http") and not is_blocked(url) else ""
    except Exception as e:
        log.debug("LLM guess %s: %s", name, e)
        return ""


def verify(client: httpx.Client, url: str, tokens: list[str]) -> bool:
    if not tokens:
        return False
    try:
        r = client.get(url, timeout=12.0, follow_redirects=True)
    except Exception:
        return False
    if r.status_code >= 400:
        return False
    ctype = r.headers.get("content-type", "")
    if "text/html" not in ctype:
        return False
    soup = BeautifulSoup(r.text, "lxml")
    title = (soup.title.string if soup.title and soup.title.string else "").lower()
    body = soup.get_text(" ", strip=True).lower()[:4000]
    haystack = f"{title} {body}"
    return any(t in haystack for t in tokens)


def find_website(entry: dict, client: httpx.Client, client_ai) -> str:
    name = (entry.get("name") or "").strip()
    if not name:
        return ""
    city = (entry.get("city") or entry.get("ort") or "").strip()
    tokens = name_tokens(name)

    # 1. DuckDuckGo
    queries = [f'"{name}" {city} site:.se'.strip(), f'"{name}" {city}'.strip()]
    for q in queries:
        urls = duckduckgo_search(client, q)
        for u in urls:
            if verify(client, u, tokens):
                return u.rstrip("/")
        time.sleep(0.7)

    # 2. LLM fallback
    guess = llm_guess(client_ai, name, city)
    if guess and verify(client, guess, tokens):
        return guess.rstrip("/")

    return ""


def process_file(path: Path, limit: int | None, dry_run: bool,
                 client: httpx.Client, client_ai) -> None:
    data = load_json(path)
    key = "hemsida" if path.name == "companies.json" else "website"
    processed = 0
    found = 0

    for entry in data:
        if limit is not None and processed >= limit:
            break
        if (entry.get(key) or "").strip():
            continue
        name = (entry.get("name") or "").strip()
        if not name:
            continue

        processed += 1
        log.info("[%s] %s", path.name, name)
        url = find_website(entry, client, client_ai)
        if url:
            entry[key] = url
            found += 1
            log.info("  ✓ %s", url)
        else:
            log.info("  – not found")

        if not dry_run and processed % 10 == 0:
            save_json(path, data)
        time.sleep(0.8)

    if not dry_run:
        save_json(path, data)
    log.info("[%s] done — %d processed, %d found", path.name, processed, found)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--only", choices=["companies", "carriers"], default=None)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if OpenAI is None:
        log.error("openai not installed — pip install openai")
        return 1
    api_key = os.environ.get("OPENAI_API_KEY")
    client_ai = OpenAI(api_key=api_key) if api_key else None
    if client_ai is None:
        log.warning("OPENAI_API_KEY not set — LLM fallback disabled")

    targets: list[Path] = []
    if args.only in (None, "carriers"):
        targets.append(CARRIERS_PATH)
    if args.only in (None, "companies"):
        targets.append(COMPANIES_PATH)

    with httpx.Client(headers={"User-Agent": UA}) as client:
        for p in targets:
            if p.exists():
                process_file(p, args.limit, args.dry_run, client, client_ai)

    return 0


if __name__ == "__main__":
    sys.exit(main())
