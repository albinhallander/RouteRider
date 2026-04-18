"""
SNI 2007 -> fraktintensitet (0.0 - 1.0)

Uppskattad sannolikhet att ett företag i denna bransch har meningsfulla
fysiska godsflöden som kan vara relevanta för Einride-backhaul.

1.0 = mycket tunga, kontinuerliga flöden (stål, kemi, livsmedel, motorfordon)
0.7-0.9 = regelbundna flöden (tillverkning, grossist, bygg)
0.4-0.6 = måttliga flöden (detaljhandel, vissa tjänster med fysisk leverans)
0.1-0.3 = sporadiska flöden
0.0 = inga fysiska flöden (IT, finans, juridik, konsult)

Lookup sker på tvåsiffrig huvudgrupp. Mer granulär lookup kan läggas till
via SNI_INTENSITY_DETAILED vid behov.
"""

SNI_INTENSITY = {
    # A: Jordbruk, skogsbruk, fiske
    "01": 0.8,  # Jordbruk och jakt
    "02": 0.9,  # Skogsbruk (stora volymer timmer)
    "03": 0.6,  # Fiske och vattenbruk

    # B: Utvinning av mineral
    "05": 1.0,  # Kolutvinning
    "06": 1.0,  # Olja och gas
    "07": 1.0,  # Metallmalmsutvinning
    "08": 1.0,  # Annan utvinning (sten, sand, grus)
    "09": 0.7,  # Stödtjänster till utvinning

    # C: Tillverkning (i princip allt har höga flöden)
    "10": 0.95, # Livsmedelsframställning
    "11": 0.9,  # Dryckesvaruframställning
    "12": 0.7,  # Tobaksvaror
    "13": 0.8,  # Textil
    "14": 0.7,  # Kläder
    "15": 0.7,  # Läder och skinnvaror
    "16": 0.95, # Trävaror (sågverk, skivor, emballage)
    "17": 0.95, # Papper och pappersvaror
    "18": 0.6,  # Grafisk produktion
    "19": 1.0,  # Petroleumprodukter
    "20": 0.95, # Kemikalier och kemiska produkter
    "21": 0.7,  # Farmaceutiska produkter
    "22": 0.85, # Gummi och plastvaror
    "23": 0.95, # Andra icke-metalliska mineraliska produkter (cement, glas)
    "24": 1.0,  # Stål och metaller
    "25": 0.85, # Metallvaror utom maskiner
    "26": 0.7,  # Datorer, elektronik, optik
    "27": 0.8,  # Elapparatur
    "28": 0.85, # Övriga maskiner
    "29": 0.95, # Motorfordon, släpfordon, påhängsvagnar
    "30": 0.85, # Andra transportmedel
    "31": 0.8,  # Möbler
    "32": 0.6,  # Annan tillverkning
    "33": 0.5,  # Reparation och installation av maskiner

    # D: El, gas, värme
    "35": 0.3,  # El, gas, värme (lite fysiska flöden, men distribuerat via nät)

    # E: Vatten, avlopp, avfall
    "36": 0.2,  # Vattenförsörjning
    "37": 0.5,  # Avloppsrening
    "38": 0.9,  # Avfallshantering (mycket transport)
    "39": 0.6,  # Sanering

    # F: Byggverksamhet
    "41": 0.75, # Byggande av hus
    "42": 0.85, # Anläggningsarbeten (stora materialflöden)
    "43": 0.7,  # Specialiserad bygg (VVS, el, målning)

    # G: Handel
    "45": 0.85, # Handel med motorfordon
    "46": 0.9,  # Parti och agenturhandel (grossist, hög fraktintensitet)
    "47": 0.6,  # Detaljhandel (distribution till butik)

    # H: Transport och magasinering (Einrides direkta konkurrenter eller partners)
    "49": 0.4,  # Landtransport (själva är logistikbolag, inte kund men beroende av)
    "50": 0.3,  # Sjötransport
    "51": 0.3,  # Lufttransport
    "52": 0.5,  # Magasinering och stödtjänster
    "53": 0.4,  # Post och kurir

    # I: Hotell och restaurang
    "55": 0.3,  # Hotell (leveranser men inte tunga)
    "56": 0.4,  # Restaurang (regelbundna leveranser)

    # J: Information och kommunikation (låga fysiska flöden)
    "58": 0.2,  # Förlagsverksamhet
    "59": 0.1,  # Film, video, TV
    "60": 0.05, # Radio och TV
    "61": 0.1,  # Telekommunikation
    "62": 0.0,  # Dataprogrammering, IT-konsult
    "63": 0.05, # Informationstjänster

    # K: Finans och försäkring
    "64": 0.0,  # Finansiella tjänster
    "65": 0.0,  # Försäkring
    "66": 0.0,  # Stödtjänster finans

    # L: Fastighetsverksamhet
    "68": 0.1,  # Fastighetsverksamhet

    # M: Tjänster (nästan inga flöden)
    "69": 0.0,  # Juridik och redovisning
    "70": 0.05, # Huvudkontor, managementkonsult
    "71": 0.1,  # Arkitekt, teknisk konsult
    "72": 0.2,  # FoU (lab-leveranser ibland)
    "73": 0.1,  # Reklam, marknadsundersökning
    "74": 0.1,  # Annan verksamhet inom juridik, ekonomi
    "75": 0.2,  # Veterinär

    # N: Uthyrning, fastighetsservice
    "77": 0.5,  # Uthyrning (maskiner, fordon)
    "78": 0.05, # Arbetsförmedling, bemanning
    "79": 0.1,  # Resebyrå
    "80": 0.1,  # Säkerhet och bevakning
    "81": 0.3,  # Fastighetsservice, rengöring
    "82": 0.1,  # Kontorstjänster

    # O: Offentlig förvaltning
    "84": 0.2,  # Offentlig förvaltning, försvar

    # P: Utbildning
    "85": 0.1,  # Utbildning

    # Q: Vård och omsorg
    "86": 0.3,  # Hälso och sjukvård
    "87": 0.2,  # Vård med boende
    "88": 0.1,  # Öppna sociala insatser

    # R: Kultur, nöje, fritid
    "90": 0.1,  # Kulturell verksamhet
    "91": 0.1,  # Bibliotek, museer
    "92": 0.2,  # Spel och vadhållning
    "93": 0.2,  # Sport, fritid

    # S: Annan serviceverksamhet
    "94": 0.1,  # Intresseorganisationer
    "95": 0.3,  # Reparation av datorer, hushållsartiklar
    "96": 0.2,  # Andra konsumenttjänster
}


def freight_intensity(sni_code: str) -> float:
    """
    Returnerar fraktintensitet 0.0-1.0 baserat på SNI-kod.
    
    Accepterar både 5-siffriga koder (46710) och 2-siffriga (46).
    Okänd kod returnerar 0.3 som konservativ default.
    """
    if not sni_code:
        return 0.3
    
    # Ta bort eventuella tecken, behåll bara siffror
    clean = "".join(c for c in str(sni_code) if c.isdigit())
    
    if len(clean) < 2:
        return 0.3
    
    prefix = clean[:2]
    return SNI_INTENSITY.get(prefix, 0.3)


def freight_category(sni_code: str) -> str:
    """Returnerar grov kategori för förklarbarhet i UI."""
    score = freight_intensity(sni_code)
    if score >= 0.8:
        return "Hög fraktintensitet"
    elif score >= 0.5:
        return "Medel fraktintensitet"
    elif score >= 0.2:
        return "Låg fraktintensitet"
    else:
        return "Minimal fraktintensitet"


if __name__ == "__main__":
    # Snabb sanity check
    test_cases = [
        ("24100", "Stålverk"),
        ("46710", "Grossist drivmedel"),
        ("62010", "IT-konsult"),
        ("10710", "Bageri"),
        ("69201", "Revisor"),
        ("99999", "Okänd"),
        ("", "Tom"),
    ]
    
    print(f"{'SNI':<10} {'Score':<8} {'Kategori':<30} {'Beskrivning'}")
    print("-" * 70)
    for sni, desc in test_cases:
        score = freight_intensity(sni)
        cat = freight_category(sni)
        print(f"{sni:<10} {score:<8.2f} {cat:<30} {desc}")