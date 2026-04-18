#!/usr/bin/env python3
"""
RouteRider — Sustainability enrichment.

For each entry in src/data/companies.json and src/data/carriers.json:
  1. Scrape the company website for sustainability / ESG / CSRD content.
  2. Pull Google News RSS hits and keep those mentioning sustainability topics.
  3. Ask an LLM (OpenAI) to classify the combined evidence into category + score.

Writes a `sustainability` block back in-place:
    {
      "score": 0-100,
      "category": "leader|active|mentioned|silent|unknown",
      "evidence": ["short sentence", ...],
      "source": "primary url",
      "checkedAt": "ISO-8601"
    }

Usage:
    export OPENAI_API_KEY=sk-...
    python sustainability_enrich.py                  # process both files
    python sustainability_enrich.py --limit 10       # only first 10 per file
    python sustainability_enrich.py --only carriers  # one file
    python sustainability_enrich.py --dry-run        # no write-back
    python sustainability_enrich.py --refresh 30     # re-check entries older than N days
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import logging
import os
import re
import sys
import time
import urllib.parse
from pathlib import Path

import feedparser
import httpx
from bs4 import BeautifulSoup

try:
    from openai import OpenAI
except ImportError:
    OpenAI = None

log = logging.getLogger("sustain")
logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-7s %(message)s")

ROOT = Path(__file__).resolve().parent.parent
COMPANIES_PATH = ROOT / "src" / "data" / "companies.json"
CARRIERS_PATH = ROOT / "src" / "data" / "carriers.json"
CHECKPOINT_PATH = Path(__file__).resolve().parent / "sustainability_checkpoint.json"

SUSTAIN_LINK_RE = re.compile(
    r"(h[aå]llbar|sustainab|esg|klimat|milj[oö]|csrd|annual[-_ ]?report|sustainability[-_ ]?report)",
    re.I,
)
SUSTAIN_KEYWORDS = [
    "hållbar", "hållbarhet", "klimat", "elektri", "fossilfri", "utsläpp",
    "emission", "sustainab", "net zero", "netto noll", "esg", "csrd",
    "certif", "iso 14001", "science based targets", "sbti",
]

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
)

OPENAI_MODEL = os.environ.get("OPENAI_SUSTAIN_MODEL", "gpt-4o-mini")
SYSTEM_PROMPT = (
    "You rate how seriously a company treats sustainability, based on evidence "
    "from their own website and recent news. Distinguish CONCRETE actions "
    "(electrification, ISO 14001, CSRD-aligned reporting, SBTi targets, published "
    "emissions data, reductions with year-over-year numbers) from GENERIC marketing "
    "copy (vague 'we care about the planet' statements, future promises without "
    "numbers, sponsored feel-good mentions). Prefer silence to wishful scoring.\n\n"
    "Return STRICT JSON, no prose, no code fences:\n"
    "{\n"
    '  "score": 0-100,\n'
    '  "category": "leader" | "active" | "mentioned" | "silent" | "unknown",\n'
    '  "evidence": ["short sentence quoting or summarising a concrete signal", ...],\n'
    '  "primary_source": "URL of the strongest source"\n'
    "}\n\n"
    "Category rubric:\n"
    "  leader    — published sustainability report with numeric targets + progress, "
    "electrified/low-carbon operations, third-party certifications.\n"
    "  active    — dedicated sustainability section, some concrete measures, "
    "reporting underway.\n"
    "  mentioned — topic surfaces in marketing/news but no substance.\n"
    "  silent    — website crawled, no meaningful sustainability content.\n"
    "  unknown   — no evidence gathered at all."
)


def load_json(path: Path) -> list[dict]:
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def save_json(path: Path, data) -> None:
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def load_checkpoint() -> dict:
    if CHECKPOINT_PATH.exists():
        return json.loads(CHECKPOINT_PATH.read_text())
    return {}


def save_checkpoint(cp: dict) -> None:
    CHECKPOINT_PATH.write_text(json.dumps(cp, ensure_ascii=False, indent=2))


def website_of(entry: dict) -> str | None:
    url = entry.get("website") or entry.get("hemsida") or ""
    url = url.strip()
    if not url:
        return None
    if not url.startswith("http"):
        url = "https://" + url.lstrip("/")
    return url


def fetch(client: httpx.Client, url: str) -> str | None:
    try:
        r = client.get(url, timeout=15.0, follow_redirects=True)
        if r.status_code >= 400:
            return None
        ctype = r.headers.get("content-type", "")
        if "text/html" not in ctype and "xml" not in ctype:
            return None
        return r.text
    except Exception as e:
        log.debug("fetch %s: %s", url, e)
        return None


def scrape_website(client: httpx.Client, root_url: str) -> tuple[list[str], list[str]]:
    """Return (text_snippets, sustainability_links). Depth up to 2."""
    snippets: list[str] = []
    links_found: list[str] = []

    home = fetch(client, root_url)
    if not home:
        return snippets, links_found

    soup = BeautifulSoup(home, "lxml")
    snippets.append(soup.get_text(" ", strip=True)[:1200])

    sus_links = []
    for a in soup.find_all("a", href=True):
        text = (a.get_text(" ", strip=True) or "") + " " + a["href"]
        if SUSTAIN_LINK_RE.search(text):
            sus_links.append(urllib.parse.urljoin(root_url, a["href"]))

    # Dedupe, cap depth
    seen = set()
    for link in sus_links:
        if link in seen or link == root_url:
            continue
        seen.add(link)
        if len(links_found) >= 4:
            break
        links_found.append(link)

        if link.lower().endswith(".pdf"):
            continue  # skip PDF body, but the URL itself is evidence

        html = fetch(client, link)
        if not html:
            continue
        sub = BeautifulSoup(html, "lxml")
        snippets.append(sub.get_text(" ", strip=True)[:2000])
        time.sleep(0.5)

    return snippets, links_found


def news_snippets(name: str) -> list[tuple[str, str]]:
    """Google News RSS hits filtered by sustainability keywords."""
    q = urllib.parse.quote(f'"{name}" hållbarhet OR sustainability')
    url = f"https://news.google.com/rss/search?q={q}&hl=sv&gl=SE&ceid=SE:sv"
    try:
        feed = feedparser.parse(url)
    except Exception as e:
        log.debug("news feed %s: %s", name, e)
        return []

    hits: list[tuple[str, str]] = []
    for entry in feed.entries[:15]:
        title = (entry.get("title") or "")
        summary = (entry.get("summary") or "")
        blob = f"{title} {summary}".lower()
        if any(k in blob for k in SUSTAIN_KEYWORDS):
            link = entry.get("link", "")
            hits.append((f"{title}. {summary}"[:280], link))
        if len(hits) >= 5:
            break
    return hits


def classify(client_ai, name: str, site_snippets: list[str], site_links: list[str],
             news: list[tuple[str, str]]) -> dict:
    if client_ai is None:
        return {"score": 0, "category": "unknown",
                "evidence": [], "primary_source": ""}

    website_text = "\n\n".join(site_snippets)[:5500]
    links_text = "\n".join(site_links)[:800]
    news_text = "\n".join(f"- {t}  [{l}]" for t, l in news)[:2500]

    user_msg = (
        f"Company: {name}\n\n"
        f"== Website snippets ==\n{website_text or '(none)'}\n\n"
        f"== Sustainability-linked URLs on site ==\n{links_text or '(none)'}\n\n"
        f"== Recent news mentioning sustainability ==\n{news_text or '(none)'}\n"
    )

    try:
        resp = client_ai.chat.completions.create(
            model=OPENAI_MODEL,
            max_tokens=600,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_msg},
            ],
        )
    except Exception as e:
        log.warning("LLM error for %s: %s", name, e)
        return {"score": 0, "category": "unknown",
                "evidence": [], "primary_source": ""}

    text = (resp.choices[0].message.content or "").strip()
    text = re.sub(r"^```(?:json)?|```$", "", text, flags=re.M).strip()
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", text, re.S)
        data = json.loads(m.group(0)) if m else {}

    cat = data.get("category", "unknown")
    if cat not in {"leader", "active", "mentioned", "silent", "unknown"}:
        cat = "unknown"
    score = int(data.get("score", 0) or 0)
    evidence = [str(e)[:260] for e in (data.get("evidence") or [])][:4]
    return {
        "score": max(0, min(100, score)),
        "category": cat,
        "evidence": evidence,
        "primary_source": str(data.get("primary_source") or ""),
    }


def enrich_entry(entry: dict, client: httpx.Client, client_ai) -> dict | None:
    name = (entry.get("name") or "").strip()
    if not name:
        return None
    site = website_of(entry)
    site_snippets: list[str] = []
    site_links: list[str] = []
    if site:
        site_snippets, site_links = scrape_website(client, site)
    news = news_snippets(name)

    if not site_snippets and not news:
        return {
            "score": 0, "category": "unknown",
            "evidence": [], "source": site or "",
            "checkedAt": dt.datetime.utcnow().isoformat(timespec="seconds") + "Z",
        }

    cls = classify(client_ai, name, site_snippets, site_links, news)
    primary = cls.pop("primary_source") or (site_links[0] if site_links else (
        news[0][1] if news else (site or "")
    ))
    cls["source"] = primary
    cls["checkedAt"] = dt.datetime.utcnow().isoformat(timespec="seconds") + "Z"
    return cls


def is_stale(entry: dict, refresh_days: int) -> bool:
    sus = entry.get("sustainability")
    if not sus:
        return True
    checked = sus.get("checkedAt")
    if not checked:
        return True
    try:
        ts = dt.datetime.fromisoformat(checked.rstrip("Z"))
    except ValueError:
        return True
    age = dt.datetime.utcnow() - ts
    return age.days >= refresh_days


def process_file(path: Path, limit: int | None, refresh_days: int,
                 dry_run: bool, client: httpx.Client, client_ai,
                 cp: dict) -> None:
    data = load_json(path)
    bucket = cp.setdefault(path.name, {})
    processed = 0

    for entry in data:
        if limit is not None and processed >= limit:
            break
        if not is_stale(entry, refresh_days):
            continue

        name = (entry.get("name") or "").strip()
        if not name:
            continue

        log.info("[%s] %s", path.name, name)
        result = enrich_entry(entry, client, client_ai)
        if result is None:
            continue

        entry["sustainability"] = result
        bucket[name] = result["checkedAt"]
        processed += 1

        log.info("  → %s (score=%d) src=%s",
                 result["category"], result.get("score", 0), result.get("source", "")[:70])

        if not dry_run and processed % 5 == 0:
            save_json(path, data)
            save_checkpoint(cp)

        time.sleep(1.0)

    if not dry_run:
        save_json(path, data)
        save_checkpoint(cp)
    log.info("[%s] done — %d entries processed", path.name, processed)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None,
                    help="Max entries per file (default: all)")
    ap.add_argument("--only", choices=["companies", "carriers"], default=None,
                    help="Process only one file")
    ap.add_argument("--dry-run", action="store_true",
                    help="Don't write back to JSON")
    ap.add_argument("--refresh", type=int, default=90,
                    help="Re-check entries older than N days (default: 90)")
    args = ap.parse_args()

    if OpenAI is None:
        log.error("openai package not installed — run: pip install openai")
        return 1
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        log.error("OPENAI_API_KEY not set")
        return 1

    client_ai = OpenAI(api_key=api_key)
    cp = load_checkpoint()

    targets: list[Path] = []
    if args.only in (None, "carriers"):
        targets.append(CARRIERS_PATH)
    if args.only in (None, "companies"):
        targets.append(COMPANIES_PATH)

    with httpx.Client(headers={"User-Agent": UA}, http2=False) as client:
        for path in targets:
            if not path.exists():
                log.warning("skipping %s — not found", path)
                continue
            process_file(path, args.limit, args.refresh, args.dry_run,
                         client, client_ai, cp)

    return 0


if __name__ == "__main__":
    sys.exit(main())
