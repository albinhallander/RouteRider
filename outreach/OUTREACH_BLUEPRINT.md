# RouteRider — Outreach Blueprint

## Syfte

Kontakta företag med hög godspotential (H/M-prioritet i datasetet) och erbjuda dem att bli partners i RouteRiders nätverket — dvs. registrerade upphämtningspunkter för gods längs Stockholm–Göteborg.

---

## Målgrupp & Prioritering

Använd `routerider_foretag.xlsx` som källa. Filtrera på:

| Prioritet | Omsättning | Insats |
|-----------|-----------|--------|
| H (Hög)   | >50 MSEK  | Personligt samtal + e-post |
| M (Medel) | 10–50 MSEK | E-post + uppföljningssamtal |
| L (Låg)   | <10 MSEK  | Automatiserad e-post |

**Branschfokus i första vågen:** Tillverkning, grossist/handel, livsmedelsindustri — dessa har högst frekvens och volym.

---

## Kanalstrategi

```
1. E-post (kall kontakt)       → öppnar dörren
2. LinkedIn (beslutsfattaren)  → bygger relation
3. Telefonsamtal               → bokar demo/möte
4. Demo/möte                   → stänger affären
```

---

## E-postmallar

### Mall 1 — Kall kontakt (H/M-prioritet)

```
Ämne: Sänk era fraktkostnader längs Stockholm–Göteborg

Hej [Namn],

Jag heter [Ditt namn] och jobbar med RouteRider — en tjänst som 
matchar åkerier med gods längs fasta rutter.

Vi ser att [Företag] troligen skickar regelbundna leveranser längs 
Stockholm–Göteborg-korridoren. Genom att registrera er hos oss 
kopplas ni ihop med åkerier som redan kör er väg — utan onödiga 
tomkörningar.

Det innebär typiskt 15–25% lägre fraktkostnad jämfört med att 
boka spottransporter.

Har du 20 minuter nästa vecka för ett kort samtal?

Mvh,
[Namn]
RouteRider
[Telefon]
```

---

### Mall 2 — Uppföljning (efter 5 dagar utan svar)

```
Ämne: Re: Sänk era fraktkostnader längs Stockholm–Göteborg

Hej [Namn],

Skickade ett mejl härom veckan — vill bara följa upp kort.

Förstår om det är dålig timing. Om ni inte har egna regelbundna 
transporter längs stråket är det absolut inte rätt tjänst för er.

Om ni däremot skickar gods minst 2–3 gånger/månad mot Göteborg 
eller Stockholm är det värt 20 minuter.

Svarar gärna på frågor direkt här.

Mvh,
[Namn]
```

---

### Mall 3 — LinkedIn (kort, direkt)

```
Hej [Namn],

Jobbar med RouteRider som matchar åkerier med gods längs 
Stockholm–Göteborg. Ser att [Företag] är verksamma längs stråket.

Kan vara relevant om ni vill sänka fraktkostnaderna. 
Öppet för ett kort samtal?
```

---

## Samtalsscript (Telefon)

**Öppning (15 sek):**
> "Hej, jag heter [namn] och ringer från RouteRider. Vi jobbar med 
> att koppla ihop företag längs Stockholm–Göteborg med åkerier — 
> har du 2 minuter?"

**Kvalificeringsfrågor:**
1. Hur ofta skickar ni gods längs den korridoren idag?
2. Vem hanterar logistiken/fraktbokningen?
3. Vad är den största smärtan med nuvarande lösning?

**Invändningar:**

| Invändning | Svar |
|------------|------|
| "Vi har redan en åkare" | "Perfekt — vi kompletterar, vi konkurrerar inte. Ni får ett alternativ när det är bråttom eller er åkare inte har kapacitet." |
| "För litet volym" | "Vi tar allt från enstaka pall — ni betalar bara när vi levererar." |
| "Ingen tid just nu" | "Förstår helt. Kan jag skicka ett mail så tittar ni när det passar?" |

**Avslut:**
> "Ska vi boka 20 minuter nästa vecka? Jag kan visa hur det fungerar 
> konkret för ett företag i er bransch."

---

## Uppföljningskadans

```
Dag 0  — Kall e-post
Dag 5  — Uppföljnings-e-post
Dag 8  — LinkedIn-kontakt
Dag 12 — Telefonsamtal
Dag 18 — Sista e-post ("stänger tråden")
```

**Stängningsmejl (dag 18):**
```
Hej [Namn],

Har hört av mig några gånger utan respons — avslutar kontakten 
nu för att inte störa.

Om ni någon gång funderar på att optimera er frakt längs 
Stockholm–Göteborg är ni välkomna att höra av er.

Allt gott,
[Namn]
```

---

## CRM-spårning

Skapa ett blad i `routerider_foretag.xlsx` (flik: **Outreach**) med:

| Kolumn | Värden |
|--------|--------|
| Företag | — |
| Kontaktperson | — |
| E-post | — |
| LinkedIn | — |
| Telefon | — |
| Status | `Ej kontaktad / E-post skickad / Uppföljning / Samtal bokat / Demo / Vunnen / Förlorad` |
| Senaste kontakt | datum |
| Nästa åtgärd | — |
| Anteckningar | — |

---

## KPIer att följa

| Metric | Mål (första 60 dagarna) |
|--------|------------------------|
| Företag kontaktade | 100 |
| Svarsfrekvens e-post | >15% |
| Samtal bokade | 15 |
| Demos genomförda | 10 |
| Partners onboardade | 3–5 |

---

## Nästa steg

- [ ] Exportera H/M-prioritetsföretag från `routerider_foretag.xlsx`
- [ ] Hitta rätt kontaktperson (logistikchef, inköpschef, VD i mindre bolag)
- [ ] Lägg in i CRM-fliken och sätt status `Ej kontaktad`
- [ ] Skicka första batchen (15–20 mejl) och mät öppningsfrekvens
- [ ] Justera mallarna efter feedback från de första samtalen
