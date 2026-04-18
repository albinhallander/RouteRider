# RouteRider

Applikation som föreslår företag längs en given rutt (Stockholm–Göteborg) som kan vara potentiella upphämtningspunkter för gods. Rutter rankas efter **nettovärde** — inte kortaste väg — med hänsyn till lastfyllnadsgrad, bränsle och tid.

## Fas 1 — Datainsamling (nu)

```bash
cd data_collection
pip install -r requirements.txt
python scraper.py
```

Producerar `routerider_foretag.xlsx` med:
- Företagsnamn, adress, bransch, omsättning, hemsida
- Koordinater (lat/lng) för kartplotting
- Godspotential-score och prioritet (H/M/L) baserat på omsättning × branschfaktor

Skriptet sparar `checkpoint.json` löpande — avbryt och fortsätt utan att börja om.

## Fas 2 — Värdebaserad ruttoptimering (kommer)

```
Ruttvärde = Intäkt (lastfyllnad × pris/kg) − Kostnad (bränsle + tid + lön)
```

En rutt med 480 km och 95% full lastbil är mer värd än 400 km med 60% full.

## Fas 3 — Applikation (kommer)

React + Mapbox — rita en rutt, få förslag på företag längs vägen sorterade efter ruttvärde.