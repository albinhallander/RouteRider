"""
RouteRider — Sales Outreach Tracker
Kör: streamlit run outreach/tracker.py
"""

import sys
from pathlib import Path

import pandas as pd
import streamlit as st

# ── Konfiguration ────────────────────────────────────────────────────────────

EXCEL_PATH = Path(__file__).parent.parent / "data_collection" / "routerider_foretag.xlsx"

STATUSES = [
    "Ej kontaktad",
    "E-post skickad",
    "Uppföljning",
    "Samtal bokat",
    "Demo",
    "Vunnen",
    "Förlorad",
]

STATUS_COLORS = {
    "Ej kontaktad":  "#6B7280",
    "E-post skickad": "#3B82F6",
    "Uppföljning":   "#F59E0B",
    "Samtal bokat":  "#8B5CF6",
    "Demo":          "#EC4899",
    "Vunnen":        "#10B981",
    "Förlorad":      "#EF4444",
}

EDITABLE_COLS = [
    "Outreach-status",
    "Kontaktperson",
    "Telefon",
    "Email",
    "Anteckningar",
]

DISPLAY_COLS = [
    "Prioritet",
    "Företagsnamn",
    "Stad (korridor)",
    "Bransch",
    "Omsättning (kr)",
    "Godspotential/mån",
    "Outreach-status",
    "Kontaktperson",
    "Telefon",
    "Email",
    "Anteckningar",
    "Hemsida",
]

# ── Data ─────────────────────────────────────────────────────────────────────

@st.cache_data(ttl=0)
def load_data() -> pd.DataFrame:
    if not EXCEL_PATH.exists():
        st.error(
            f"Hittade inte Excel-filen: `{EXCEL_PATH}`\n\n"
            "Kör `python data_collection/scraper.py` först."
        )
        st.stop()
    df = pd.read_excel(EXCEL_PATH, sheet_name="Företag", dtype=str)
    df["Omsättning (kr)"] = pd.to_numeric(df["Omsättning (kr)"], errors="coerce").fillna(0).astype(int)
    df["Godspotential/mån"] = pd.to_numeric(df["Godspotential/mån"], errors="coerce").fillna(0).astype(int)
    df["Outreach-status"] = df["Outreach-status"].fillna("Ej kontaktad")
    for col in ("Kontaktperson", "Telefon", "Email", "Anteckningar"):
        df[col] = df[col].fillna("")
    return df


def save_data(df: pd.DataFrame) -> None:
    with pd.ExcelWriter(EXCEL_PATH, engine="openpyxl", mode="w") as writer:
        df.to_excel(writer, index=False, sheet_name="Företag")


# ── Layout ───────────────────────────────────────────────────────────────────

st.set_page_config(
    page_title="RouteRider — Outreach",
    page_icon="🚛",
    layout="wide",
)

st.title("🚛 RouteRider — Sales Outreach")

if "df" not in st.session_state:
    st.session_state.df = load_data()

df: pd.DataFrame = st.session_state.df

# ── KPI-rad ──────────────────────────────────────────────────────────────────

st.subheader("Pipeline")
cols = st.columns(len(STATUSES))
for i, status in enumerate(STATUSES):
    count = (df["Outreach-status"] == status).sum()
    with cols[i]:
        color = STATUS_COLORS[status]
        st.markdown(
            f"""
            <div style="background:{color}22;border-left:4px solid {color};
                        padding:10px 14px;border-radius:6px;">
                <div style="font-size:11px;color:{color};font-weight:600;
                            text-transform:uppercase;letter-spacing:.5px">{status}</div>
                <div style="font-size:28px;font-weight:700;color:{color}">{count}</div>
            </div>
            """,
            unsafe_allow_html=True,
        )

st.divider()

# ── Sidebar-filter ───────────────────────────────────────────────────────────

with st.sidebar:
    st.header("Filter")

    prio_filter = st.multiselect(
        "Prioritet",
        options=["H", "M", "L"],
        default=["H", "M"],
    )
    status_filter = st.multiselect(
        "Status",
        options=STATUSES,
        default=[s for s in STATUSES if s not in ("Vunnen", "Förlorad")],
    )
    stad_options = sorted(df["Stad (korridor)"].dropna().unique().tolist())
    stad_filter = st.multiselect("Stad", options=stad_options, default=stad_options)

    st.divider()
    st.caption(f"Totalt: {len(df)} företag")
    vunna = (df["Outreach-status"] == "Vunnen").sum()
    kontaktade = (df["Outreach-status"] != "Ej kontaktad").sum()
    st.metric("Partners vunna", vunna)
    st.metric("Kontaktade", kontaktade)
    if kontaktade > 0:
        st.metric("Win rate", f"{vunna / kontaktade:.0%}")

# ── Filtrerad vy ─────────────────────────────────────────────────────────────

mask = (
    df["Prioritet"].isin(prio_filter)
    & df["Outreach-status"].isin(status_filter)
    & df["Stad (korridor)"].isin(stad_filter)
)
filtered = df[mask].copy()
filtered = filtered.sort_values(
    ["Prioritet", "Godspotential/mån"],
    ascending=[True, False],
)

st.markdown(f"**{len(filtered)} företag** matchar filtret")

# ── Redigerbar tabell ────────────────────────────────────────────────────────

existing_display = [c for c in DISPLAY_COLS if c in filtered.columns]

column_config = {
    "Outreach-status": st.column_config.SelectboxColumn(
        "Status",
        options=STATUSES,
        required=True,
        width="medium",
    ),
    "Prioritet": st.column_config.TextColumn("Prio", width="small"),
    "Omsättning (kr)": st.column_config.NumberColumn(
        "Omsättning",
        format="%d kr",
        width="medium",
    ),
    "Godspotential/mån": st.column_config.NumberColumn(
        "Gods/mån",
        width="small",
    ),
    "Hemsida": st.column_config.LinkColumn("Hemsida", width="medium"),
    "Anteckningar": st.column_config.TextColumn("Anteckningar", width="large"),
    "Kontaktperson": st.column_config.TextColumn("Kontaktperson", width="medium"),
    "Email": st.column_config.TextColumn("Email", width="medium"),
    "Telefon": st.column_config.TextColumn("Telefon", width="medium"),
}

disabled_cols = [c for c in existing_display if c not in EDITABLE_COLS]

edited = st.data_editor(
    filtered[existing_display].reset_index(drop=False),
    column_config=column_config,
    disabled=["index"] + disabled_cols,
    hide_index=True,
    use_container_width=True,
    num_rows="fixed",
    key="outreach_table",
)

# ── Spara ändringar ───────────────────────────────────────────────────────────

if st.button("💾 Spara ändringar till Excel", type="primary"):
    for _, row in edited.iterrows():
        orig_idx = row["index"]
        for col in EDITABLE_COLS:
            if col in row:
                df.at[orig_idx, col] = row[col]
    st.session_state.df = df
    save_data(df)
    st.cache_data.clear()
    st.success("Sparat!")
    st.rerun()

# ── Nästa att kontakta ───────────────────────────────────────────────────────

st.divider()
st.subheader("Nästa att kontakta")

next_up = df[df["Outreach-status"] == "Ej kontaktad"].copy()
next_up = next_up.sort_values(
    ["Prioritet", "Godspotential/mån"],
    ascending=[True, False],
).head(10)

if next_up.empty:
    st.info("Inga fler okontaktade företag — bra jobbat!")
else:
    for _, row in next_up.iterrows():
        prio = row.get("Prioritet", "")
        color = {"H": "#10B981", "M": "#F59E0B", "L": "#EF4444"}.get(prio, "#6B7280")
        st.markdown(
            f"""
            <div style="display:flex;align-items:center;gap:12px;
                        padding:8px 12px;border-radius:6px;margin-bottom:4px;
                        background:#F9FAFB;border:1px solid #E5E7EB">
                <span style="background:{color};color:white;font-weight:700;
                             font-size:11px;padding:2px 8px;border-radius:4px">{prio}</span>
                <span style="font-weight:600;flex:2">{row.get('Företagsnamn','')}</span>
                <span style="color:#6B7280;flex:1">{row.get('Stad (korridor)','')}</span>
                <span style="color:#6B7280;flex:2">{row.get('Bransch','')}</span>
                <span style="font-weight:600;flex:1">
                    {row.get('Godspotential/mån', 0)} gods/mån
                </span>
            </div>
            """,
            unsafe_allow_html=True,
        )
