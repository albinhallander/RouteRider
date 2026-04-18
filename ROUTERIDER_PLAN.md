# RouteRider — Produktplan

## Problemet vi löser

En elektrisk lastbil kör ut gods från Stockholm till Göteborg. Nu är lasten tömd och lastbilen måste köra hem. Den resan kostar pengar (energi, förartid) utan att generera intäkt. **Målet är att hitta gods längs returrutten som fyller lastbilen och maximerar vinsten på hemresan.**

Det handlar inte om att visa en statisk karta — det handlar om att svara på frågan:

> *"Jag är i Göteborg med en tom lastbil. Vad är bästa vägen hem till Stockholm för att tjäna mest pengar?"*

---

## Kärn-logiken (optimeringsmodellen)

### Vad som påverkar vilken rutt som är bäst

```
Värde för ett stopp =  Fraktintäkt
                     - Kostnad för omväg (kr/km × extra km)
                     - Tidskostnad (kr/h × extra tid)
                     - Energikostnad för extra km

Netto-score = Σ(värde per stopp längs rutten) - Baskostnad(direktrutt)
```

### Variabler per avsändare
- **Fraktintäkt** — pris per pall/kg, förhandlat eller marknadsbaserat
- **Avstånd från korridor** — hur långt av-vägen stoppet är (km)
- **Godsmängd** — pallar / vikt → avgör hur mycket lastkapacitet som används
- **Tidsfönster** — när godset kan hämtas (lastbilen måste vara där i tid)
- **Godstyp** — kylvara, farligt gods etc. påverkar vilka lastbilar som kan ta det

### Begränsningar
- Max lastkapacitet: 24 000 kg / ~33 EUR-pallar
- Max körtid per dag (kör- och vilotidsregler)
- Laddningsstopp måste planeras in baserat på SoC
- Tidsfönster hos avsändare måste respekteras

---

## Flödet i appen (UX-logik)

### Steg 1 — Ange uppdrag
```
Var är du nu?        [ Göteborg           ▼ ]
Vart ska du?         [ Stockholm          ▼ ]
Lastbilens kapacitet [ 24 ton / 33 pallar    ]
Senast framme:       [ Idag 22:00            ]
```

### Steg 2 — Appen visar tillgängliga avsändare
- Karta med alla avsändare längs korridoren som blå punkter
- Varje avsändare har ett **score-kort**: intäkt, omvägskostnad, nettovärde
- Filtrera på: gods-typ, minsta intäkt, max omväg

### Steg 3 — Välj kombination av stopp
- Appen föreslår **3 ruttpaket** automatiskt:
  1. **Max intäkt** — bäst nettovärde, kan vara fler stopp
  2. **Snabbast hem** — ett stopp, minimal omväg
  3. **Balanserat** — bra intäkt, rimlig restid
- Användaren kan manuellt lägga till/ta bort stopp
- Kartan uppdateras live med ny rutt och nya laddningsstopp

### Steg 4 — Kontakta avsändare
- Generera och skicka outreach direkt i appen
- Bekräftelse → stoppet låses in i rutten

### Steg 5 — Körning
- Optimerad rutt med alla stopp och laddningar
- Realtidsuppdatering (framtida fas)

---

## Teknisk implementation — faser

### Fas 1: Statisk prototyp (nu)
**Mål:** Visa konceptet med hårdkodad data, fungerande UI-flöde

- [ ] Sökformulär med origin/destination
- [ ] Karta med avsändare längs E4-korridoren
- [ ] 3 förgenererade ruttförslag med olika trade-offs
- [ ] Klicka på avsändare → se detaljer + skicka outreach
- [ ] Ruttlinjer på kartan för varje förslag

**Stack:** React + Leaflet (befintlig)

---

### Fas 2: Riktig ruttberäkning
**Mål:** Beräkna faktiska rutter dynamiskt baserat på valda stopp

- [ ] Integrera **OSRM** (open-source routing) eller **GraphHopper** för ruttberäkning
- [ ] Beräkna faktisk körtid och km per ruttvariant
- [ ] Dynamisk omvägsberäkning: "Om vi tar Husqvarna, kostar det 18 min och 22 km extra"
- [ ] Laddningsplanering baserat på SoC och laddstationernas positioner

**API-kandidater:**
- OSRM (gratis, self-hosted) — bäst för produktion
- GraphHopper API — enklare integration
- OSRM demo server — räcker för prototyp

---

### Fas 3: Optimeringsalgoritm
**Mål:** Automatiskt hitta bästa kombination av stopp

- [ ] Implementera **greedy-algoritm** som steg 1: välj stopp med bäst netto-score tills lastbilen är full
- [ ] Sedan: **branch-and-bound** eller **nearest-neighbor TSP** för att ordna stoppen optimalt
- [ ] Beakta tidsfönster (constraint satisfaction)
- [ ] Input: lista avsändare med koordinater, intäkt, godsvolym → Output: bästa ordning + rutt

**Bibliotek:**
- Pure JS för greedy-algoritmen — håller det enkelt
- Senare: integration med OR-Tools (Python microservice) om optimeringen blir komplex

---

### Fas 4: Riktig data
**Mål:** Faktiska avsändare, priser och kapacitet

- [ ] API mot fraktbörser (t.ex. **Transporeon**, **Freightos**) för live-priser
- [ ] Databas med återkommande avsändare och deras historiska priser
- [ ] Autentisering och lastbilshantering (flera fordon)
- [ ] Bokningssystem — inte bara outreach via e-post

---

## Datamodell (v1)

```js
// Avsändare
{
  id: 's-1',
  company: 'IKEA Distribution',
  location: 'Älmhult',
  position: [lat, lng],
  cargo: { pallets: 18, weightKg: 8200, type: 'general' },
  revenue: 4200,           // kr
  pickupWindow: ['14:00', '17:00'],
  distanceFromRoute: 12,   // km, beräknas dynamiskt
  detourCost: null,        // beräknas av routing-engine
  netScore: null           // revenue - detourCost
}

// Ruttförslag
{
  id: 'route-1',
  label: 'Max intäkt',
  stops: ['s-2', 's-5', 's-6'],
  totalRevenue: 21800,
  totalDetourKm: 26,
  totalDetourMin: 34,
  etaHome: '21:15',
  loadFactor: 0.82,        // 82% av kapacitet utnyttjad
  path: [[lat,lng], ...]   // från routing engine
}
```

---

## UI-prioriteringar (nästa steg)

1. **Karta + sökning** — redan på plats, förfina designen
2. **Avsändarkort med nettovärde** — visa tydligt vad varje stopp är värt EFTER omvägskostnaden
3. **Ruttjämförelse** — sida vid sida: tid, intäkt, lastfaktor
4. **Manuell ruttbyggare** — dra-och-släpp stopp på kartan
5. **Laddningsplanering** — visa exakt var och hur länge lastbilen behöver ladda

---

## Vad som INTE är prioriterat nu

- Realtidsspårning av lastbilen (GPS-integration)
- Fakturering och betalningar
- Flotta-hantering (flera lastbilar)
- Mobilapp

Dessa hör till en senare fas när kärnflödet är validerat.
