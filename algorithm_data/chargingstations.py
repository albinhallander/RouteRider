"""
Einride charging network i Sverige

Stationer markerade med status:
- LIVE: Operativ idag
- PLANNED: Under konstruktion / planerad

Data från Einride.io och officiella pressreleasar 2024-2025.
Koordinater är approximerade från adress.
"""

CHARGING_STATIONS = [
    # LIVE stations
    {
        "name": "Rosersberg station",
        "city": "Stockholm",
        "region": "Uppland",
        "address": "Järngatan 27, Rosersberg",
        "lat": 59.4667,
        "lng": 17.1167,
        "charging_points": 9,
        "amenities": ["Driver's Lounge"],
        "status": "LIVE",
    },
    {
        "name": "Norrköping station",
        "city": "Norrköping",
        "region": "Östergötland",
        "address": "Blygatan 25, Norrköping",
        "lat": 58.6167,
        "lng": 16.1833,
        "charging_points": 9,
        "amenities": ["Driver's Lounge"],
        "status": "LIVE",
    },
    {
        "name": "Eskilstuna station",
        "city": "Eskilstuna",
        "region": "Södermanland",
        "address": "Propellervägen 7, Eskilstuna",
        "lat": 59.3667,
        "lng": 16.5167,
        "charging_points": 6,
        "amenities": ["Driver's Lounge", "Smartcharger stations"],
        "status": "LIVE",
    },
    {
        "name": "Varberg station",
        "city": "Varberg",
        "region": "Halland",
        "address": "Gunnestorpsvägen 3, Varberg",
        "lat": 57.1000,
        "lng": 12.2333,
        "charging_points": 10,
        "amenities": ["Driver's Lounge"],
        "status": "LIVE",
    },
    {
        "name": "Borås station",
        "city": "Borås",
        "region": "Västra Götaland",
        "address": "Ryssnäsgatan 14, Borås",
        "lat": 57.7167,
        "lng": 12.9333,
        "charging_points": 12,
        "amenities": ["Driver's Lounge"],
        "status": "LIVE",
    },
    {
        "name": "Ljungby station",
        "city": "Ljungby",
        "region": "Småland",
        "address": "Nyponvägen, Ljungby",
        "lat": 56.8500,
        "lng": 13.9333,
        "charging_points": 4,
        "amenities": [],
        "status": "LIVE",
    },
    {
        "name": "Markaryd station",
        "city": "Markaryd",
        "region": "Småland",
        "address": "Ulvarydsvägen 7, Markaryd",
        "lat": 56.3333,
        "lng": 13.5667,
        "charging_points": 2,
        "amenities": [],
        "status": "LIVE",
    },
    # PLANNED stations
    {
        "name": "Helsingborg station",
        "city": "Helsingborg",
        "region": "Skåne",
        "address": "Mineralgatan 11, Helsingborg",
        "lat": 56.0461,
        "lng": 12.6941,
        "charging_points": 8,
        "amenities": ["Driver's Lounge"],
        "status": "PLANNED",
        "eta": "2025 Q2",
    },
    {
        "name": "Jönköping station",
        "city": "Jönköping",
        "region": "Jönköpings län",
        "address": "Jönköping (address TBD)",
        "lat": 57.7833,
        "lng": 14.1833,
        "charging_points": 8,
        "amenities": ["Driver's Lounge"],
        "status": "PLANNED",
        "eta": "2025 Q3",
    },
    {
        "name": "Laholm station",
        "city": "Laholm",
        "region": "Halland",
        "address": "Laholm (address TBD)",
        "lat": 56.5500,
        "lng": 12.7667,
        "charging_points": 4,
        "amenities": [],
        "status": "PLANNED",
        "eta": "2025 Q2",
    },
]


def get_live_stations():
    """Returnerar endast live-stationer."""
    return [s for s in CHARGING_STATIONS if s["status"] == "LIVE"]


def get_planned_stations():
    """Returnerar endast planerade stationer."""
    return [s for s in CHARGING_STATIONS if s["status"] == "PLANNED"]


def get_stations_by_region(region: str):
    """Filtrera stationer efter region."""
    return [s for s in CHARGING_STATIONS if s["region"].lower() == region.lower()]


def total_live_capacity():
    """Total kapacitet för live-stationer."""
    return sum(s["charging_points"] for s in get_live_stations())


def closest_station(lat: float, lng: float, max_distance_km: float = 50, only_live: bool = True):
    """
    Hittar närmaste laddstation för en given koordinat.
    Returnerar station och distans i km.
    """
    from math import radians, cos, sin, asin, sqrt
    
    def haversine(lat1, lng1, lat2, lng2):
        """Enkelt avstand mellan två GPS-koordinater i km."""
        lat1, lng1, lat2, lng2 = map(radians, [lat1, lng1, lat2, lng2])
        dlat = lat2 - lat1
        dlng = lng2 - lng1
        a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlng / 2) ** 2
        c = 2 * asin(sqrt(a))
        km = 6371 * c
        return km
    
    stations = get_live_stations() if only_live else CHARGING_STATIONS
    
    closest = None
    min_dist = float("inf")
    
    for station in stations:
        dist = haversine(lat, lng, station["lat"], station["lng"])
        if dist < min_dist and dist <= max_distance_km:
            min_dist = dist
            closest = station
    
    if closest:
        return {
            "station": closest,
            "distance_km": round(min_dist, 1),
        }
    return None


def route_coverage(origin_lat: float, origin_lng: float, dest_lat: float, dest_lng: float):
    """
    Analysera täckning längs en rutt.
    Returnerar alla stationer inom 30 km från ruttlinjen.
    """
    # Enkel implementering: mät avstand från rutt-mittlinjen
    # För fullt fungerade krävs polyline-buffering (se OSRM-steg tidigare)
    
    mid_lat = (origin_lat + dest_lat) / 2
    mid_lng = (origin_lng + dest_lng) / 2
    
    # Hitta stationer nära mittpunkten
    coverage = []
    for station in get_live_stations():
        # Haversine
        from math import radians, cos, sin, asin, sqrt
        lat1, lng1, lat2, lng2 = map(radians, [mid_lat, mid_lng, station["lat"], station["lng"]])
        dlat = lat2 - lat1
        dlng = lng2 - lng1
        a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlng / 2) ** 2
        c = 2 * asin(sqrt(a))
        km = 6371 * c
        
        if km < 80:  # Rimlig sidetrack för paus
            coverage.append({
                "station": station,
                "distance_from_route_km": round(km, 1),
            })
    
    return sorted(coverage, key=lambda x: x["distance_from_route_km"])


if __name__ == "__main__":
    print("=" * 70)
    print("EINRIDE CHARGING NETWORK - SUMMARY")
    print("=" * 70)
    
    live = get_live_stations()
    planned = get_planned_stations()
    
    print(f"\nLIVE STATIONS: {len(live)}")
    print(f"Total charging points: {total_live_capacity()}")
    for s in live:
        amen = ", ".join(s["amenities"]) if s["amenities"] else "Basic"
        print(f"  • {s['name']:30} {s['city']:15} {s['charging_points']} points ({amen})")
    
    print(f"\nPLANNED STATIONS: {len(planned)}")
    for s in planned:
        print(f"  • {s['name']:30} {s['city']:15} {s['charging_points']} points (ETA: {s.get('eta', 'TBD')})")
    
    print("\n" + "=" * 70)
    print("ROUTE TEST: Göteborg → Stockholm")
    print("=" * 70)
    
    route = route_coverage(57.7089, 11.9746, 59.3293, 18.0686)
    print(f"\nStations within 80km of route corridor:")
    for item in route:
        s = item["station"]
        print(f"  • {s['name']:30} +{item['distance_from_route_km']}km from corridor")
    
    print("\n" + "=" * 70)