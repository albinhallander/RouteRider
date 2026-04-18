"""
Sustainability-profiler per SNI-kod (mockup)

Logik:
1. Vissa branscher har naturligt högre press att implementera grön logistik
   (ex grossist i livsmedel, tillverkning) pga miljöregler, kundsignaler, mediekritik
2. Andra är "lågt på radar" (IT, juridik, finans)
3. Mockup-värdena är:
   - sni_sustainability_bias: Hur sannolikt är det att ett företag i denna sektor
     har SBTi-mål eller liknande? (0.0-1.0)
   - likely_scope3_focus: Fokuserar de på Scope 3 transport? (0-1)
   - green_logistics_adoption: Sannolikhet att de redan använder el-transport (0-1)

Värdena baseras på:
- Reglering (EU Green Deal, ESG-krav från storkundler)
- Branschmediering (livsmedel och kemi är under observation)
- Kundsignaler (B2B-leverantörer under press från stora köpare)
"""

SNI_SUSTAINABILITY_PROFILE = {
    # A: Jordbruk, skogsbruk
    "01": {
        "sni_name": "Jordbruk och jakt",
        "sni_sustainability_bias": 0.6,
        "likely_scope3_focus": 0.3,
        "green_logistics_adoption": 0.3,
        "reason": "Pressure från miljökrav, men ofta små aktörer",
    },
    "02": {
        "sni_name": "Skogsbruk",
        "sni_sustainability_bias": 0.7,
        "likely_scope3_focus": 0.4,
        "green_logistics_adoption": 0.2,
        "reason": "EU-pressure på hållbar skogsbruk, men logistik ofta outsourcad",
    },

    # C: Tillverkning (högt fokus)
    "10": {
        "sni_name": "Livsmedelsframställning",
        "sni_sustainability_bias": 0.75,
        "likely_scope3_focus": 0.6,
        "green_logistics_adoption": 0.5,
        "reason": "Miljökrav, consumer pressure, stora köpare (Systembolaget, ICA) kräver grön logistik",
    },
    "11": {
        "sni_name": "Dryckesvaruframställning",
        "sni_sustainability_bias": 0.7,
        "likely_scope3_focus": 0.5,
        "green_logistics_adoption": 0.4,
        "reason": "Branschledare (Carlsberg, etc) har net-zero-mål, skapar druck",
    },
    "16": {
        "sni_name": "Trävaror (sågverk, emballage)",
        "sni_sustainability_bias": 0.65,
        "likely_scope3_focus": 0.4,
        "green_logistics_adoption": 0.3,
        "reason": "EU-krav på rammskogsbruk, men ofta transportintensiv",
    },
    "17": {
        "sni_name": "Papper och pappersvaror",
        "sni_sustainability_bias": 0.75,
        "likely_scope3_focus": 0.55,
        "green_logistics_adoption": 0.45,
        "reason": "Massa- och pappersindustrin är under EU-lupp, stora energiflöden",
    },
    "19": {
        "sni_name": "Petroleumprodukter",
        "sni_sustainability_bias": 0.5,
        "likely_scope3_focus": 0.3,
        "green_logistics_adoption": 0.2,
        "reason": "PR-risk högst, men långsamma på transition. Lagkrav ökar",
    },
    "20": {
        "sni_name": "Kemikalier och kemiska produkter",
        "sni_sustainability_bias": 0.8,
        "likely_scope3_focus": 0.65,
        "green_logistics_adoption": 0.55,
        "reason": "Höga miljörisker, strikt reglering (REACH), SBTi vanligt i denna sektor",
    },
    "21": {
        "sni_name": "Farmaceutiska produkter",
        "sni_sustainability_bias": 0.6,
        "likely_scope3_focus": 0.4,
        "green_logistics_adoption": 0.3,
        "reason": "Regulerad sektor, men miljöfokus kan vara lågt prioriterat vs compliance",
    },
    "22": {
        "sni_name": "Gummi och plastvaror",
        "sni_sustainability_bias": 0.65,
        "likely_scope3_focus": 0.45,
        "green_logistics_adoption": 0.35,
        "reason": "Plastfokus i media, lagkrav på circular economy ökar",
    },
    "23": {
        "sni_name": "Mineral, cement, glas",
        "sni_sustainability_bias": 0.7,
        "likely_scope3_focus": 0.5,
        "green_logistics_adoption": 0.4,
        "reason": "Cementproduktion mycket CO2-intensiv, EU-fokus högt",
    },
    "24": {
        "sni_name": "Stål och metaller",
        "sni_sustainability_bias": 0.8,
        "likely_scope3_focus": 0.65,
        "green_logistics_adoption": 0.55,
        "reason": "SSAB, LKAB leder på grön stål. SBTi väldigt vanligt. Kundsignaler från biltillverkare.",
    },
    "25": {
        "sni_name": "Metallvaror utom maskiner",
        "sni_sustainability_bias": 0.65,
        "likely_scope3_focus": 0.4,
        "green_logistics_adoption": 0.35,
        "reason": "Nerstämmande från storkundler, men ofta små medel-stora actors",
    },
    "29": {
        "sni_name": "Motorfordon",
        "sni_sustainability_bias": 0.85,
        "likely_scope3_focus": 0.7,
        "green_logistics_adoption": 0.7,
        "reason": "Volvo, SCANIA, BYD alla på net-zero-kurs. Är själva transportörer så hög signal.",
    },

    # G: Handel (Grossist = höga flöden)
    "46": {
        "sni_name": "Parti- och agenturhandel (grossist)",
        "sni_sustainability_bias": 0.7,
        "likely_scope3_focus": 0.55,
        "green_logistics_adoption": 0.5,
        "reason": "Ofta leverantör till storkedja (ICA, Coop), de har strikt krav på grön logistik. SBTi vanligt.",
    },
    "47": {
        "sni_name": "Detaljhandel",
        "sni_sustainability_bias": 0.6,
        "likely_scope3_focus": 0.4,
        "green_logistics_adoption": 0.35,
        "reason": "Consumer-facing, ESG-tryckt, men ofta outsourcar logistik",
    },

    # F: Bygge
    "41": {
        "sni_name": "Byggande av hus",
        "sni_sustainability_bias": 0.6,
        "likely_scope3_focus": 0.35,
        "green_logistics_adoption": 0.25,
        "reason": "Miljöfokus växer, men ofta småföretag. Materialflöden stora.",
    },
    "42": {
        "sni_name": "Anläggningsarbeten",
        "sni_sustainability_bias": 0.65,
        "likely_scope3_focus": 0.4,
        "green_logistics_adoption": 0.3,
        "reason": "Tunga maskiner, stora CO2-flöden. Pressure från kommuner/staten.",
    },

    # Låga sustainability-signaler
    "49": {
        "sni_name": "Landtransport",
        "sni_sustainability_bias": 0.75,
        "likely_scope3_focus": 0.55,
        "green_logistics_adoption": 0.65,
        "reason": "Är själva på frontlinjen. Einride-konkurrenter ofta ambitiösa på el.",
    },
    "52": {
        "sni_name": "Magasinering och stödtjänster",
        "sni_sustainability_bias": 0.55,
        "likely_scope3_focus": 0.35,
        "green_logistics_adoption": 0.3,
        "reason": "Lagerhall-branschen växer, men är ofta underordnad",
    },
    "56": {
        "sni_name": "Restaurang",
        "sni_sustainability_bias": 0.5,
        "likely_scope3_focus": 0.2,
        "green_logistics_adoption": 0.15,
        "reason": "Småföretag ofta, fokus på mat och service, inte transport",
    },

    # IT, Finans, Juridik (nästan ingenting)
    "62": {
        "sni_name": "IT-programmering, datakonsult",
        "sni_sustainability_bias": 0.3,
        "likely_scope3_focus": 0.1,
        "green_logistics_adoption": 0.1,
        "reason": "Inga fysiska godflöden, low emission-impact från logistik",
    },
    "64": {
        "sni_name": "Finansiella tjänster",
        "sni_sustainability_bias": 0.25,
        "likely_scope3_focus": 0.05,
        "green_logistics_adoption": 0.05,
        "reason": "Scope 3 transport inte relevant",
    },
    "69": {
        "sni_name": "Juridik och redovisning",
        "sni_sustainability_bias": 0.2,
        "likely_scope3_focus": 0.05,
        "green_logistics_adoption": 0.05,
        "reason": "Ingen relevans för backhaul",
    },
    "70": {
        "sni_name": "Huvudkontor, management consulting",
        "sni_sustainability_bias": 0.3,
        "likely_scope3_focus": 0.1,
        "green_logistics_adoption": 0.1,
        "reason": "Tjänsteföretag, låga fysiska flöden",
    },
}

# Default för SNI-koder utan explicit profil
DEFAULT_PROFILE = {
    "sni_name": "Unknown sector",
    "sni_sustainability_bias": 0.4,
    "likely_scope3_focus": 0.2,
    "green_logistics_adoption": 0.2,
    "reason": "Unknown sector - conservative estimate",
}


def sni_sustainability_score(sni_code: str) -> dict:
    """
    Returnerar sustainability-profil för en SNI-kod.
    
    Komponenter:
    - sni_sustainability_bias: Sannolikhet att företaget har NÅGOT miljöåtagande (0-1)
    - likely_scope3_focus: Sannolikhet att de specifikt fokuserar på transport-emissioner (0-1)
    - green_logistics_adoption: Sannolikhet att de redan använder grön logistik (0-1)
    - combined_score: Vägt medelvärde (mer på bias)
    """
    if not sni_code:
        profile = DEFAULT_PROFILE.copy()
    else:
        clean = "".join(c for c in str(sni_code) if c.isdigit())
        prefix = clean[:2] if len(clean) >= 2 else ""
        profile = SNI_SUSTAINABILITY_PROFILE.get(prefix, DEFAULT_PROFILE).copy()
    
    # Vägt kombinerat poäng
    # Bias är viktigast (säger om de tänker på miljö överhuvudtaget)
    # Scope 3 och adoption är underordnat
    combined = (
        profile["sni_sustainability_bias"] * 0.6 +
        profile["likely_scope3_focus"] * 0.25 +
        profile["green_logistics_adoption"] * 0.15
    )
    
    profile["combined_score"] = round(combined, 2)
    
    return profile


def sustainability_category(score: float) -> str:
    """Kategorisera sustainability-score för UI."""
    if score >= 0.70:
        return "High sustainability potential"
    elif score >= 0.50:
        return "Medium sustainability potential"
    elif score >= 0.30:
        return "Low sustainability potential"
    else:
        return "Minimal sustainability signal"


def estimate_sbti_likelihood(sni_code: str) -> str:
    """
    Grov bedömning baserad på SNI: skulle detta företag ha SBTi-targets?
    Använd för snabb filterering.
    """
    profile = sni_sustainability_score(sni_code)
    bias = profile["sni_sustainability_bias"]
    
    if bias >= 0.75:
        return "HIGH"  # Väldigt troligt de har SBTi
    elif bias >= 0.60:
        return "MEDIUM"  # Ganska troligt
    elif bias >= 0.40:
        return "LOW"  # Möjligt
    else:
        return "VERY_LOW"  # Osannolikt


if __name__ == "__main__":
    print("=" * 80)
    print("SUSTAINABILITY SCORING BY SNI - MOCKUP")
    print("=" * 80)
    
    test_companies = [
        ("24100", "SSAB Stålverk"),
        ("20100", "Kemikalieföretag"),
        ("46710", "Grossist (Mat/dryck)"),
        ("29100", "Bilproducent"),
        ("62010", "IT-konsultbolag"),
        ("69201", "Revisor"),
        ("10100", "Livsmedelstillverking"),
        ("42110", "Anläggningsarbete"),
        ("64191", "Finansiell tjänst"),
    ]
    
    print(f"\n{'SNI':<10} {'Company':<30} {'Bias':<8} {'Scope3':<8} {'Green':<8} {'Combined':<10} {'Category':<30}")
    print("-" * 80)
    
    for sni, name in test_companies:
        profile = sni_sustainability_score(sni)
        cat = sustainability_category(profile["combined_score"])
        likelihood = estimate_sbti_likelihood(sni)
        
        print(
            f"{sni:<10} {name:<30} "
            f"{profile['sni_sustainability_bias']:<8.2f} "
            f"{profile['likely_scope3_focus']:<8.2f} "
            f"{profile['green_logistics_adoption']:<8.2f} "
            f"{profile['combined_score']:<10.2f} "
            f"{cat:<30}"
        )
        print(f"           → Likely SBTi: {likelihood}")
        print()
    
    print("=" * 80)
    print("INTERPRETATION FOR SALES TEAM")
    print("=" * 80)
    print("""
HIGH (0.70+): "This sector has strong environmental pressure. Likely to have 
             SBTi targets or similar. Good fit for green logistics pitch."

MEDIUM (0.50-0.69): "Growing environmental focus. May respond to sustainability 
                   value prop, but not guaranteed to have formal targets."

LOW (0.30-0.49): "Limited environmental signal. Use alternative angles (cost, 
                efficiency) for pitch."

MINIMAL (<0.30): "Not an environmental buyer. May not care about green logistics."
    """)