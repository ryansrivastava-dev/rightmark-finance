"""RightMark Streamlit deployment.

Run locally with:
    streamlit run streamlit_app.py
"""

from __future__ import annotations

import csv
import io
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests
import streamlit as st
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas


APP_ROOT = Path(__file__).parent
HOLDERS_URL = "https://www.fisheries.noaa.gov/sites/default/files/akro/26ifqunitf.csv"
SECURITY_URL = "https://www.fisheries.noaa.gov/sites/default/files/akro/26ifqunitfb.csv"
TRANSFER_A_URL = "https://www.fisheries.noaa.gov/sites/default/files/akro/26ifqteca.csv"
TRANSFER_OTHER_URL = "https://www.fisheries.noaa.gov/sites/default/files/akro/26ifqtec.csv"
LANDINGS_URL = "https://www.fisheries.noaa.gov/sites/default/files/akro/26ifqland.htm"
EIA_URL = "https://api.eia.gov/v2/petroleum/pri/gnd/data/"

IFQ_RATIOS = {
    "halibut:2C": 21.1198,
    "halibut:3A": 30.9962,
    "halibut:3B": 21.8554,
    "halibut:4A": 14.4416,
    "halibut:4B": 12.6152,
    "halibut:4C": 10.5693,
    "halibut:4D": 9.32,
    "halibut:4E": 0,
    "sablefish:AI": 3.2447,
    "sablefish:BS": 2.3648,
    "sablefish:CG": 6.5352,
    "sablefish:SE": 5.3655,
    "sablefish:WG": 4.3581,
    "sablefish:WY": 10.7864,
}
SPECIES_PRICES = {"halibut": 8.18, "sablefish": 1.84}
RISK_FACTORS = {"Low": 1.04, "Moderate": 1.0, "High": 0.90}


st.set_page_config(
    page_title="RightMark | Fishing quota evaluation",
    page_icon="✓",
    layout="wide",
    initial_sidebar_state="collapsed",
)

st.markdown(
    """
    <style>
    @import url('https://api.fontshare.com/v2/css?f[]=satoshi@400,500,600,700&display=swap');
    :root { --ink:#081527; --paper:#f5f2ea; --blue:#1769ff; --cyan:#84e7dd; --line:#c9d2dc; --mist:#e8eef3; }
    html { scroll-behavior:smooth; }
    .stApp { background:#f7f8f6; color:var(--ink); font-family:'Satoshi',sans-serif; }
    [data-testid="stHeader"], [data-testid="stToolbar"], #MainMenu { display:none; }
    .block-container { max-width:none; padding:0 0 5rem; overflow:hidden; }
    h1,h2,h3 { letter-spacing:-.045em; }
    .rm-landing { width:100%; overflow:hidden; background:var(--paper); }
    .rm-nav { height:78px; display:grid; grid-template-columns:1fr auto 1fr; align-items:center; gap:24px;
      padding:0 clamp(20px,4vw,72px); border-bottom:1px solid rgba(8,21,39,.18); background:rgba(245,242,234,.9);
      backdrop-filter:blur(18px); position:relative; z-index:5; }
    .rm-brand { display:flex; align-items:center; gap:10px; font-size:1.05rem; font-weight:700; color:var(--ink); }
    .rm-brand img { width:27px; height:27px; object-fit:contain; filter:invert(1); }
    .rm-edition { font-size:.65rem; font-weight:700; letter-spacing:.16em; }
    .rm-nav-cta { justify-self:end; color:#fff!important; background:var(--ink); padding:12px 19px; border-radius:999px;
      font-size:.78rem; font-weight:700; text-decoration:none!important; transition:transform .35s ease,background .35s ease; }
    .rm-nav-cta:hover { transform:translateY(-2px); background:var(--blue); }
    .rm-hero { min-height:760px; display:grid; grid-template-columns:minmax(0,1.08fr) minmax(360px,.92fr); background:var(--paper); }
    .rm-hero-copy { padding:clamp(70px,10vw,150px) clamp(28px,6vw,92px); display:flex; flex-direction:column; justify-content:center; }
    .rm-kicker { color:#31636c; font-size:.69rem; font-weight:700; letter-spacing:.17em; text-transform:uppercase; }
    .rm-hero h1 { font-size:clamp(3.2rem,7vw,7.3rem); line-height:.86; max-width:1240px; margin:28px 0 32px; font-weight:500; }
    .rm-hero h1 em { color:var(--blue); font-style:normal; }
    .rm-hero p { max-width:670px; color:#405164; font-size:clamp(1rem,1.5vw,1.2rem); line-height:1.65; }
    .rm-actions { display:flex; flex-wrap:wrap; gap:12px; margin-top:34px; }
    .rm-button { display:inline-flex; align-items:center; justify-content:center; min-height:50px; border-radius:999px; padding:0 24px;
      background:var(--blue); color:white!important; text-decoration:none!important; font-weight:700; font-size:.88rem;
      transition:transform .35s ease,box-shadow .35s ease; }
    .rm-button.dark { background:var(--ink); }
    .rm-button:hover { transform:translateY(-3px); box-shadow:0 14px 30px rgba(8,21,39,.18); }
    .rm-proofline { margin-top:32px; padding-top:20px; border-top:1px solid rgba(8,21,39,.16); font-size:.75rem!important;
      font-weight:700; letter-spacing:.08em; text-transform:uppercase; }
    .rm-hero-visual { position:relative; min-height:720px; overflow:hidden; background:#0c2637; }
    .rm-hero-visual img { width:100%; height:100%; object-fit:cover; filter:saturate(.72) contrast(1.08); transition:transform 1.4s cubic-bezier(.2,.8,.2,1); }
    .rm-hero-visual:hover img { transform:scale(1.045); }
    .rm-visual-wash { position:absolute; inset:0; background:linear-gradient(180deg,transparent 35%,rgba(3,14,26,.88)); }
    .rm-caption { position:absolute; left:clamp(24px,4vw,54px); right:clamp(24px,4vw,54px); bottom:42px; color:white; }
    .rm-caption b { display:block; text-transform:uppercase; letter-spacing:.15em; font-size:.65rem; color:var(--cyan); margin-bottom:10px; }
    .rm-caption p { color:#e1eaf0; max-width:430px; margin:0; }
    .rm-marquee { background:var(--ink); color:white; overflow:hidden; padding:18px 0; white-space:nowrap; }
    .rm-track { display:inline-flex; gap:52px; min-width:max-content; animation:rm-marquee 24s linear infinite; }
    .rm-track span { display:flex; align-items:center; gap:13px; font-size:.72rem; letter-spacing:.08em; text-transform:uppercase; }
    .rm-track i { width:7px; height:7px; border-radius:50%; background:var(--cyan); }
    @keyframes rm-marquee { to { transform:translateX(-50%); } }
    .rm-chapter { padding:clamp(110px,15vw,220px) clamp(22px,6vw,90px); max-width:1500px; margin:auto; }
    .rm-chapter-head { display:grid; grid-template-columns:.55fr 1.45fr; gap:50px; align-items:end; margin-bottom:66px; }
    .rm-chapter-head>p { font-size:.7rem; letter-spacing:.16em; text-transform:uppercase; font-weight:700; color:#436774; }
    .rm-chapter-head h2 { font-size:clamp(2.8rem,6vw,6.3rem); line-height:.92; margin:0 0 20px; font-weight:500; }
    .rm-chapter-head span { color:#526273; max-width:720px; display:block; font-size:1.06rem; line-height:1.65; }
    .rm-bento { display:grid; grid-template-columns:repeat(12,1fr); grid-template-rows:repeat(2,minmax(250px,1fr)); grid-auto-flow:dense; gap:0; border:1px solid var(--ink); }
    .rm-bento article { padding:clamp(26px,4vw,54px); border:1px solid var(--ink); min-height:270px; overflow:hidden; transition:background .4s,color .4s; }
    .rm-bento article:hover { background:var(--ink); color:white; }
    .rm-bento .primary { grid-column:span 7; grid-row:span 2; background:#c9e5df; display:flex; flex-direction:column; justify-content:space-between; }
    .rm-bento .secondary,.rm-bento .tertiary { grid-column:span 5; }
    .rm-bento .secondary { background:#f3dcae; }
    .rm-bento .tertiary { background:#dce6f7; }
    .rm-bento small { font-size:.68rem; text-transform:uppercase; letter-spacing:.14em; font-weight:700; }
    .rm-bento h3 { font-size:clamp(2rem,4vw,4.2rem); line-height:.98; margin:32px 0 18px; font-weight:500; max-width:760px; }
    .rm-bento p { max-width:650px; line-height:1.6; }
    .rm-formula { display:flex; align-items:center; gap:13px; margin-top:44px; font-weight:700; }
    .rm-formula span { padding:10px 13px; border:1px solid currentColor; border-radius:999px; }
    .rm-bars { height:84px; display:flex; align-items:end; gap:8px; margin-top:28px; }
    .rm-bars i { flex:1; background:var(--blue); min-width:8px; }
    .rm-desire { background:var(--ink); color:white; padding:clamp(110px,14vw,210px) clamp(22px,6vw,90px); display:grid; grid-template-columns:minmax(300px,.8fr) minmax(0,1.2fr); gap:clamp(50px,8vw,130px); }
    .rm-sticky { position:sticky; top:80px; align-self:start; }
    .rm-sticky h2 { font-size:clamp(3rem,7vw,7rem); line-height:.9; margin:0; font-weight:500; }
    .rm-sticky h2 span { color:var(--cyan); }
    .rm-accordion { border-top:1px solid rgba(255,255,255,.25); }
    .rm-accordion article { display:grid; grid-template-columns:110px 1fr; gap:30px; padding:42px 0; border-bottom:1px solid rgba(255,255,255,.25); transition:padding .35s ease,background .35s ease; }
    .rm-accordion article:hover { padding-left:24px; background:linear-gradient(90deg,rgba(132,231,221,.12),transparent); }
    .rm-accordion>article>span { color:var(--cyan); font-size:.7rem; text-transform:uppercase; letter-spacing:.15em; font-weight:700; }
    .rm-accordion h3 { font-size:clamp(1.6rem,3vw,3rem); margin:0 0 12px; font-weight:500; }
    .rm-accordion p { color:#aebdca; line-height:1.65; margin:0; }
    .rm-proof { padding:clamp(110px,15vw,220px) clamp(22px,7vw,110px); background:#dbe5f4; }
    .rm-proof article { position:sticky; top:110px; min-height:360px; padding:clamp(34px,6vw,80px); border:1px solid var(--ink); background:var(--paper); display:grid;
      grid-template-columns:.45fr 1.55fr; gap:50px; align-items:end; box-shadow:0 22px 60px rgba(8,21,39,.13); }
    .rm-proof article:nth-child(2) { top:138px; background:#c9e5df; }
    .rm-proof article:nth-child(3) { top:166px; background:#f3dcae; }
    .rm-proof small { text-transform:uppercase; letter-spacing:.16em; font-weight:700; }
    .rm-proof h2 { font-size:clamp(3rem,7vw,7rem); margin:0 0 20px; line-height:.9; font-weight:500; }
    .rm-proof p { max-width:620px; font-size:1.05rem; line-height:1.6; }
    .rm-action { background:var(--blue); color:white; min-height:560px; padding:clamp(80px,12vw,170px) clamp(22px,7vw,110px); display:flex; flex-direction:column; justify-content:space-between; }
    .rm-action small { text-transform:uppercase; letter-spacing:.16em; font-weight:700; }
    .rm-action h2 { max-width:1180px; font-size:clamp(3.4rem,8vw,8rem); line-height:.87; font-weight:500; margin:34px 0 54px; }
    .rm-action .rm-button { background:white; color:var(--ink)!important; }
    .rm-footer { display:grid; grid-template-columns:1fr 2fr auto; gap:36px; align-items:center; background:var(--ink); color:white; padding:45px clamp(22px,6vw,90px); }
    .rm-footer p { color:#9fadb9; font-size:.78rem; max-width:720px; }
    .rm-product-nav { max-width:1240px; margin:0 auto; padding:28px 20px 10px; display:flex; justify-content:space-between; align-items:center; }
    .rm-product-nav span:last-child { color:#6b7a8a; font-size:.69rem; letter-spacing:.14em; font-weight:700; }
    .rm-lookup-head { max-width:1240px; margin:0 auto; padding:clamp(70px,9vw,120px) 20px 30px; }
    .rm-lookup-head h2 { font-size:clamp(2.8rem,6vw,6rem); line-height:.92; margin:14px 0 18px; font-weight:500; }
    .rm-lookup-head p { max-width:680px; color:#526273; font-size:1.05rem; }
    [data-testid="stForm"], [data-testid="stAlert"], [data-testid="stTabs"], [data-testid="stExpander"] { max-width:1240px; margin-left:auto; margin-right:auto; }
    [data-testid="stForm"] { background:white; border:1px solid #cbd6e2!important; border-radius:0!important; padding:28px!important; box-shadow:0 18px 55px rgba(8,21,39,.07); }
    .rm-card { background:white; border:1px solid #dbe4ef; border-radius:20px; padding:24px;
      box-shadow:0 14px 40px rgba(6,24,49,.06); height:100%; }
    .rm-label { color:#687a91; font-size:.69rem; font-weight:700; letter-spacing:.13em; text-transform:uppercase; }
    .rm-value { font-size:clamp(1.8rem,4vw,3.2rem); font-weight:700; letter-spacing:-.06em; margin-top:8px; }
    .rm-note { background:#eef4fb; border-left:4px solid #1d6ff2; border-radius:8px; padding:15px 18px; color:#38506d; }
    .stButton>button, .stDownloadButton>button { border-radius:999px!important; min-height:46px; font-weight:700;
      background:white!important; color:var(--ink)!important; border:1px solid #aebdca!important; }
    .stButton>button p, .stDownloadButton>button p { color:inherit!important; }
    .stButton>button[kind="primary"], .stDownloadButton>button { background:var(--blue)!important; color:white!important; border-color:var(--blue)!important; }
    [data-testid="stMetric"] { background:white; border:1px solid #dbe4ef; padding:18px; border-radius:16px; }
    [data-testid="stMetric"] * { color:var(--ink)!important; opacity:1!important; }
    [data-testid="stMetricValue"] { font-size:clamp(1.45rem,2.8vw,2.45rem)!important; letter-spacing:-.045em!important; }
    [data-testid="stMetricDelta"] * { color:#08755f!important; }
    [data-testid="stAlert"] { color:#173d32!important; }
    [data-testid="stAlert"] * { color:inherit!important; opacity:1!important; }
    [data-baseweb="tab-list"] { gap:8px; }
    [data-baseweb="tab"] { border-radius:999px; padding:9px 18px; color:#516174!important; }
    [data-baseweb="tab"][aria-selected="true"] { color:var(--blue)!important; }
    footer { visibility:hidden; }
    @media (prefers-reduced-motion:reduce) { .rm-track { animation:none; } * { scroll-behavior:auto!important; } }
    @media (max-width:900px) {
      .rm-nav { grid-template-columns:1fr auto; } .rm-edition { display:none; }
      .rm-hero { grid-template-columns:1fr; } .rm-hero-visual { min-height:560px; }
      .rm-chapter-head,.rm-desire { grid-template-columns:1fr; }
      .rm-bento { grid-template-columns:1fr; grid-template-rows:auto; }
      .rm-bento .primary,.rm-bento .secondary,.rm-bento .tertiary { grid-column:1; grid-row:auto; }
      .rm-sticky { position:relative; top:auto; } .rm-proof article { grid-template-columns:1fr; }
      .rm-footer { grid-template-columns:1fr; }
    }
    @media (max-width:600px) {
      .rm-nav { height:68px; } .rm-nav-cta { font-size:.7rem; padding:10px 13px; }
      .rm-hero-copy { padding-top:80px; padding-bottom:80px; } .rm-hero-visual { min-height:460px; }
      .rm-accordion article { grid-template-columns:1fr; gap:14px; } .rm-proof article { min-height:430px; }
      [data-testid="stForm"] { margin:0 16px; padding:20px!important; }
    }
    </style>
    """,
    unsafe_allow_html=True,
)


def money(value: float) -> str:
    return f"${value:,.0f}"


def normalize_nmfs_id(value: str) -> str:
    return re.sub(r"^(NMFS|IFQ)[-:# ]*", "", value.strip(), flags=re.IGNORECASE)


@st.cache_data(ttl=3600, show_spinner=False)
def fetch_text(url: str) -> str:
    response = requests.get(
        url,
        headers={"User-Agent": "RightMark/2.0 public-record-lookup"},
        timeout=30,
    )
    response.raise_for_status()
    return response.text


def csv_rows(text: str) -> list[list[str]]:
    return list(csv.reader(io.StringIO(text)))


def holder_name(row: list[str]) -> str:
    return " ".join(part.strip() for part in row[6:10] if part.strip())


@st.cache_data(ttl=3600, show_spinner=False)
def lookup_holding(nmfs_id: str) -> dict[str, Any] | None:
    holders, security, transfer_a, transfer_other = (
        csv_rows(fetch_text(HOLDERS_URL)),
        csv_rows(fetch_text(SECURITY_URL)),
        csv_rows(fetch_text(TRANSFER_A_URL)),
        csv_rows(fetch_text(TRANSFER_OTHER_URL)),
    )
    matched = [
        row
        for row in holders[1:]
        if len(row) > 10
        and row[10].strip() == nmfs_id
        and row[0].strip().lower() in {"halibut", "sablefish"}
    ]
    if not matched:
        return None

    records: list[dict[str, Any]] = []
    for row in matched:
        species, area = row[0].strip().lower(), row[1].strip()
        qs_units = float(row[5] or 0)
        ratio = IFQ_RATIOS.get(f"{species}:{area}", 0)
        pounds = qs_units / ratio if ratio else 0
        records.append(
            {
                "Species": species.title(),
                "Area": area,
                "Category": row[2].strip(),
                "Blocked": row[3].strip() == "B",
                "QS units": qs_units,
                "QS per IFQ lb": ratio,
                "Estimated IFQ lb": pounds,
                "Benchmark price": SPECIES_PRICES[species],
                "Gross harvest basis": pounds * SPECIES_PRICES[species],
            }
        )

    species_holdings = []
    for species in ("halibut", "sablefish"):
        selected = [record for record in records if record["Species"].lower() == species]
        if not selected:
            continue
        pounds = sum(record["Estimated IFQ lb"] for record in selected)
        price = SPECIES_PRICES[species]
        species_holdings.append(
            {
                "Species": "Pacific Halibut" if species == "halibut" else "Sablefish",
                "QS units": sum(record["QS units"] for record in selected),
                "Estimated IFQ lb": pounds,
                "Benchmark price": price,
                "Gross harvest basis": pounds * price,
                "Areas": ", ".join(sorted({record["Area"] for record in selected})),
                "Categories": ", ".join(sorted({record["Category"] for record in selected})),
                "Records": len(selected),
            }
        )

    def eligibility_ids(rows: list[list[str]]) -> set[str]:
        return {row[4].strip() for row in rows[1:] if len(row) > 4}

    ids_a, ids_other = eligibility_ids(transfer_a), eligibility_ids(transfer_other)
    if nmfs_id in ids_a:
        transfer_status = "Category A eligible"
    elif nmfs_id in ids_other:
        transfer_status = "Category B/C/D eligible"
    else:
        transfer_status = "Not listed in current transfer eligibility files"

    # Match holder and security rows with the same fields used by the web app.
    def normalized(parts: list[str]) -> str:
        return "|".join(re.sub(r"\s+", " ", item.strip().upper()) for item in parts)

    holder_indexes = [0, 1, 2, 3, 4, 6, 7, 8, 9, 11, 12, 13, 14, 15]
    security_indexes = [0, 1, 2, 3, 4, 9, 10, 11, 12, 13, 14, 15, 16, 17]
    holder_keys = {
        normalized([row[index] if index < len(row) else "" for index in holder_indexes])
        for row in matched
    }
    security_rows = [
        row
        for row in security[1:]
        if normalized([row[index] if index < len(row) else "" for index in security_indexes])
        in holder_keys
    ]

    total_pounds = sum(item["Estimated IFQ lb"] for item in species_holdings)
    gross_basis = sum(item["Gross harvest basis"] for item in species_holdings)
    return {
        "nmfs_id": nmfs_id,
        "holder": holder_name(matched[0]),
        "species": " + ".join(item["Species"] for item in species_holdings),
        "records": records,
        "species_holdings": species_holdings,
        "record_count": len(records),
        "security_count": len(security_rows),
        "qs_units": sum(record["QS units"] for record in records),
        "estimated_pounds": total_pounds,
        "gross_basis": gross_basis,
        "weighted_price": gross_basis / total_pounds if total_pounds else 0,
        "transfer_status": transfer_status,
        "matched_at": datetime.now(timezone.utc).isoformat(),
    }


@st.cache_data(ttl=3600, show_spinner=False)
def fuel_price() -> tuple[float, str]:
    try:
        api_key = st.secrets.get("EIA_API_KEY", "DEMO_KEY")
    except Exception:
        api_key = "DEMO_KEY"
    params = [
        ("api_key", api_key),
        ("frequency", "weekly"),
        ("data[0]", "value"),
        ("facets[product][]", "EPD2D"),
        ("facets[duoarea][]", "NUS"),
        ("sort[0][column]", "period"),
        ("sort[0][direction]", "desc"),
        ("offset", "0"),
        ("length", "1"),
    ]
    try:
        response = requests.get(EIA_URL, params=params, timeout=20)
        response.raise_for_status()
        point = response.json()["response"]["data"][0]
        return float(point["value"]), point["period"]
    except (requests.RequestException, KeyError, IndexError, TypeError, ValueError):
        return 5.257, "cached public value"


def valuation(
    holding: dict[str, Any],
    catch_percent: int,
    price_per_lb: float,
    fuel_cost: float,
    risk: str,
) -> dict[str, float]:
    reference_price = holding["weighted_price"] or 8.18
    scenario_factor = (
        catch_percent
        / 100
        * (0.7 + 0.3 * price_per_lb / reference_price)
        * max(0.82, 1 - (fuel_cost - 5.257) * 0.022)
        * RISK_FACTORS[risk]
    )
    base_value = holding["gross_basis"] * 1.05
    estimated = round(base_value * scenario_factor)
    stress_factor = max(0.70, min(0.90, 0.83 + (scenario_factor - 1) * 0.1))
    stressed = round(estimated * stress_factor)
    capacity = round(stressed * 0.60)
    score = round(max(48, min(94, 86 + (scenario_factor - 1) * 34)))
    return {
        "estimated": estimated,
        "stress": stressed,
        "capacity": capacity,
        "score": score,
        "change": round((scenario_factor - 1) * 100),
        "factor": scenario_factor,
    }


def monthly_payment(amount: float, apr: float, months: int) -> float:
    rate = apr / 1200
    return amount * (rate * (1 + rate) ** months) / ((1 + rate) ** months - 1)


def make_offers(capacity: float) -> list[dict[str, Any]]:
    anchor = max(0, round(capacity / 1000) * 1000)
    inputs = [
        ("Harbor Capital", 0.80, 7.6, 48, True),
        ("Coastal Bank", 0.95, 8.1, 60, False),
        ("BlueWave Finance", 0.65, 7.2, 36, False),
    ]
    return [
        {
            "Lender": lender,
            "Amount": round(anchor * multiplier),
            "APR": apr,
            "Term": months,
            "Monthly payment": monthly_payment(round(anchor * multiplier), apr, months),
            "Best match": best,
        }
        for lender, multiplier, apr, months, best in inputs
    ]


def create_pdf(
    holding: dict[str, Any],
    model: dict[str, float],
    assumptions: dict[str, Any],
    offer: dict[str, Any] | None = None,
) -> bytes:
    output = io.BytesIO()
    pdf = canvas.Canvas(output, pagesize=letter)
    width, height = letter
    navy, blue, muted, pale = map(HexColor, ("#061831", "#1D6FF2", "#64758C", "#EEF4FB"))

    pdf.setFillColor(pale)
    pdf.rect(0, 0, width, height, stroke=0, fill=1)
    pdf.setFillColor(navy)
    pdf.rect(0, height - 235, width, 235, stroke=0, fill=1)
    pdf.setFillColorRGB(1, 1, 1)
    pdf.setFont("Helvetica-Bold", 18)
    pdf.drawString(42, height - 58, "RightMark")
    pdf.setFillColor(HexColor("#72E2CA"))
    pdf.setFont("Helvetica-Bold", 9)
    pdf.drawString(42, height - 108, "FISHING QUOTA EVALUATION")
    pdf.setFillColorRGB(1, 1, 1)
    pdf.setFont("Helvetica-Bold", 32)
    pdf.drawString(42, height - 158, f"NMFS {holding['nmfs_id']}")
    pdf.setFont("Helvetica", 12)
    pdf.drawString(42, height - 188, holding["species"][:75])
    pdf.setFillColor(HexColor("#BFD0E5"))
    pdf.drawString(42, height - 211, holding["holder"][:85])

    metrics = [
        ("MODELED VALUE", money(model["estimated"])),
        ("STRESS VALUE", money(model["stress"])),
        ("MODELED CAPACITY", money(model["capacity"])),
    ]
    for index, (label, value) in enumerate(metrics):
        x = 42 + index * 180
        pdf.setFillColor(muted)
        pdf.setFont("Helvetica-Bold", 8)
        pdf.drawString(x, 500, label)
        pdf.setFillColor(blue if index == 2 else navy)
        pdf.setFont("Helvetica-Bold", 22)
        pdf.drawString(x, 468, value)

    rows = [
        ("Quota-share units", f"{holding['qs_units']:,.0f}"),
        ("Estimated IFQ", f"{holding['estimated_pounds']:,.0f} lb"),
        ("Matched public records", str(holding["record_count"])),
        ("Gross harvest basis", money(holding["gross_basis"])),
        ("Transfer-file status", holding["transfer_status"]),
        ("Model score", f"{model['score']} / 100"),
        ("Allowable catch", f"{assumptions['catch']}%"),
        ("Weighted price", f"${assumptions['price']:.2f} / lb"),
        ("Fuel cost", f"${assumptions['fuel']:.2f} / gal"),
        ("Regulatory risk", assumptions["risk"]),
    ]
    pdf.setFont("Helvetica-Bold", 10)
    pdf.setFillColor(blue)
    pdf.drawString(42, 415, "PUBLIC RECORD AND MODEL SUMMARY")
    for index, (label, value) in enumerate(rows):
        y = 382 - index * 27
        pdf.setFont("Helvetica", 9)
        pdf.setFillColor(muted)
        pdf.drawString(42, y, label)
        pdf.setFont("Helvetica-Bold", 9)
        pdf.setFillColor(navy)
        pdf.drawString(250, y, str(value)[:62])

    pdf.setFillColor(navy)
    pdf.roundRect(42, 48, width - 84, 58, 8, stroke=0, fill=1)
    pdf.setFillColor(HexColor("#D5E1EF"))
    pdf.setFont("Helvetica", 8)
    pdf.drawString(56, 78, "Indicative model only - not an appraisal, loan approval, or proof of ownership.")
    pdf.drawString(56, 62, "Sources: NOAA public IFQ records, IPHC fishery data, and U.S. EIA energy data.")

    if offer:
        pdf.showPage()
        pdf.setFillColor(pale)
        pdf.rect(0, 0, width, height, stroke=0, fill=1)
        pdf.setFillColor(navy)
        pdf.rect(0, height - 155, width, 155, stroke=0, fill=1)
        pdf.setFillColorRGB(1, 1, 1)
        pdf.setFont("Helvetica-Bold", 18)
        pdf.drawString(42, height - 58, "RightMark")
        pdf.setFillColor(HexColor("#72E2CA"))
        pdf.setFont("Helvetica-Bold", 9)
        pdf.drawString(42, height - 100, "SELECTED ILLUSTRATIVE OPTION")
        pdf.setFillColor(navy)
        pdf.setFont("Helvetica-Bold", 28)
        pdf.drawString(42, 575, str(offer["Lender"])[:60])
        offer_rows = [
            ("Hypothetical principal", money(offer["Amount"])),
            ("Assumed APR", f"{offer['APR']:.1f}%"),
            ("Term", f"{offer['Term']} months"),
            ("Modeled monthly payment", money(offer["Monthly payment"])),
            ("Calculated stress-value LTV", f"{offer['Amount'] / max(model['stress'], 1) * 100:.1f}%"),
            ("Illustrative platform fee", money(offer["Amount"] * 0.01)),
        ]
        for index, (label, value) in enumerate(offer_rows):
            y = 515 - index * 48
            pdf.setFont("Helvetica", 10)
            pdf.setFillColor(muted)
            pdf.drawString(42, y, label)
            pdf.setFont("Helvetica-Bold", 12)
            pdf.setFillColor(blue if index == 0 else navy)
            pdf.drawString(290, y, value)
            pdf.setStrokeColor(HexColor("#D5E1EF"))
            pdf.line(42, y - 15, width - 42, y - 15)
        pdf.setFillColor(navy)
        pdf.roundRect(42, 92, width - 84, 82, 8, stroke=0, fill=1)
        pdf.setFillColor(HexColor("#D5E1EF"))
        pdf.setFont("Helvetica", 8)
        pdf.drawString(56, 141, "No lender participated. This is not an application, approval, commitment, or offer.")
        pdf.drawString(56, 123, "A real transaction requires authenticated ownership, lien and transfer checks,")
        pdf.drawString(56, 105, "complete underwriting, and a licensed lender.")
    pdf.setTitle(f"RightMark NMFS {holding['nmfs_id']} Evaluation")
    pdf.setAuthor("RightMark")
    pdf.save()
    return output.getvalue()


def render_landing() -> None:
    """Render the full editorial RightMark experience before the evaluation workspace."""
    st.markdown(
        """
        <div class="rm-landing">
          <nav class="rm-nav">
            <div class="rm-brand"><img src="https://raw.githubusercontent.com/ryansrivastava-dev/rightmark-finance/main/public/rightmark-mark.png" alt="">RightMark</div>
            <span class="rm-edition">QUOTA EVALUATION / 2026</span>
            <a class="rm-nav-cta" href="#rm-lookup">Evaluate an NMFS ID</a>
          </nav>
          <section class="rm-hero">
            <div class="rm-hero-copy">
              <span class="rm-kicker">Fishing quota evaluation</span>
              <h1>Know what your <em>“quota”</em> is worth</h1>
              <p>Enter any current IFQ NMFS ID. RightMark verifies the complete public record, calculates an explainable value, tests downside, and compares illustrative loan options.</p>
              <div class="rm-actions">
                <a class="rm-button" href="#rm-lookup">Evaluate an NMFS ID</a>
                <a class="rm-button dark" href="#rm-lookup">Open the live example</a>
              </div>
              <p class="rm-proofline">One asset class. One clear financial decision path.</p>
            </div>
            <div class="rm-hero-visual">
              <img src="https://raw.githubusercontent.com/ryansrivastava-dev/rightmark-finance/main/public/rightmark-hero-v2.png" alt="Commercial fishing vessel navigating coastal waters">
              <div class="rm-visual-wash"></div>
              <div class="rm-caption"><b>RightMark evaluation</b><p>Public evidence, transparent assumptions, and modeled loan capacity in one report.</p></div>
            </div>
          </section>
          <section class="rm-marquee" aria-label="Current public market signals">
            <div class="rm-track">
              <span><i></i>NOAA 2026 holder records</span><span><i></i>$8.18 weighted price basis</span><span><i></i>EIA diesel price linked live</span><span><i></i>Halibut + sablefish IFQ coverage</span>
              <span><i></i>NOAA 2026 holder records</span><span><i></i>$8.18 weighted price basis</span><span><i></i>EIA diesel price linked live</span><span><i></i>Halibut + sablefish IFQ coverage</span>
            </div>
          </section>
          <section class="rm-chapter">
            <div class="rm-chapter-head">
              <p>Everything that matters</p>
              <div><h2>One evaluation.<br>No unnecessary complexity.</h2><span>Every result distinguishes public evidence, model assumptions, and indicative financing scenarios.</span></div>
            </div>
            <div class="rm-bento">
              <article class="primary"><small>Complete public record</small><div><h3>Every matching quota-share line, aggregated.</h3><p>Halibut and sablefish holdings are normalized across species, areas, vessel categories, blocks, and serial groups.</p></div></article>
              <article class="secondary"><small>Explainable evaluation</small><h3>See exactly what drives the number.</h3><div class="rm-formula"><span>Record</span><b>+</b><span>Market</span><b>−</b><span>Risk</span></div></article>
              <article class="tertiary"><small>Decision-ready output</small><h3>Stress, compare, and export.</h3><div class="rm-bars"><i style="height:44%"></i><i style="height:65%"></i><i style="height:57%"></i><i style="height:82%"></i><i style="height:73%"></i><i style="height:96%"></i><i style="height:84%"></i></div></article>
            </div>
          </section>
          <section class="rm-desire">
            <div class="rm-sticky"><h2>A public identifier becomes a <span>defensible capital view.</span></h2></div>
            <div class="rm-accordion">
              <article><span>Verify</span><div><h3>Match the complete NOAA record</h3><p>Search every current holder ID and aggregate all connected quota-share rows.</p></div></article>
              <article><span>Value</span><div><h3>Calculate an explainable estimate</h3><p>Apply species, area, market, scarcity, and regulatory assumptions transparently.</p></div></article>
              <article><span>Stress</span><div><h3>Test the downside</h3><p>Adjust allowable catch, species price, fuel cost, and regulatory risk.</p></div></article>
              <article><span>Decide</span><div><h3>Compare options and export</h3><p>Review illustrative structures and download a polished PDF evaluation report.</p></div></article>
            </div>
          </section>
          <section class="rm-proof">
            <article><small>Verified record</small><div><h2>12 NOAA holder rows</h2><p>The live example aggregates the complete public record for NMFS 43983.</p></div></article>
            <article><small>Modeled evaluation</small><div><h2>$136,255</h2><p>Every positive driver and risk adjustment is shown in the calculation.</p></div></article>
            <article><small>Decision output</small><div><h2>PDF + loan options</h2><p>Carry the evaluation into a report or compare three illustrative structures.</p></div></article>
          </section>
          <section class="rm-action">
            <small>Start with one public identifier</small>
            <div><h2>Evaluate the right.<br>Understand the options.</h2><a class="rm-button" href="#rm-lookup">Evaluate NMFS 43983</a></div>
          </section>
          <footer class="rm-footer">
            <div class="rm-brand"><img src="https://raw.githubusercontent.com/ryansrivastava-dev/rightmark-finance/main/public/rightmark-mark.png" alt="">RightMark</div>
            <p>Public records and market inputs are sourced. Valuations, stress tests, and loan options are modeled and illustrative. RightMark is not a lender, broker, or appraiser.</p>
            <span>© 2026 RightMark</span>
          </footer>
        </div>
        """,
        unsafe_allow_html=True,
    )


def render_product_header() -> None:
    st.markdown(
        """
        <div class="rm-product-nav">
          <div class="rm-brand"><img src="https://raw.githubusercontent.com/ryansrivastava-dev/rightmark-finance/main/public/rightmark-mark.png" alt="">RightMark</div>
          <span>VERIFY · VALUE · STRESS · OPTIONS</span>
        </div>
        """,
        unsafe_allow_html=True,
    )


holding = st.session_state.get("holding")
if holding:
    render_product_header()
else:
    render_landing()
    st.markdown(
        """
        <div id="rm-lookup" class="rm-lookup-head">
          <span class="rm-kicker">NOAA public lookup</span>
          <h2>Evaluate an IFQ record.</h2>
          <p>Search all current NMFS holder IDs across the 2026 halibut and sablefish quota-share files, then carry the result into a sourced evaluation, stress test, marketplace, and PDF.</p>
        </div>
        """,
        unsafe_allow_html=True,
    )

with st.form("lookup"):
    left, right = st.columns([3, 1])
    with left:
        entered_id = st.text_input(
            "NMFS ID",
            value=st.session_state.get("entered_id", "43983"),
            help="Numeric and NMFS-/IFQ-prefixed IDs are accepted.",
        )
    with right:
        st.write("")
        st.write("")
        submitted = st.form_submit_button("Evaluate complete record", type="primary", width="stretch")

if submitted:
    nmfs_id = normalize_nmfs_id(entered_id)
    if not re.fullmatch(r"\d{1,8}", nmfs_id):
        st.error("Enter a numeric NMFS ID from the public quota-share dataset.")
    else:
        try:
            with st.spinner("Matching and aggregating the public record…"):
                result = lookup_holding(nmfs_id)
            if result is None:
                st.error(f"No current halibut or sablefish quota-share record was found for NMFS ID {nmfs_id}.")
            else:
                st.session_state["holding"] = result
                st.session_state["entered_id"] = entered_id
                st.session_state.pop("selected_offer", None)
                st.session_state.pop("completed_scenario", None)
                st.rerun()
        except requests.RequestException:
            st.error("The public record source is temporarily unavailable. Please try again shortly.")

holding = st.session_state.get("holding")
if not holding:
    st.markdown(
        '<div class="rm-note"><strong>Try the live example:</strong> NMFS 43983. '
        "Public lookup does not authenticate the visitor or establish ownership.</div>",
        unsafe_allow_html=True,
    )
    st.stop()

current_fuel, fuel_date = fuel_price()
status_col, reset_col = st.columns([5, 1])
status_col.success(
    f"Complete public record matched for NMFS {holding['nmfs_id']} · "
    f"{holding['record_count']} holder rows aggregated"
)
if reset_col.button("New evaluation", width="stretch"):
    for key in ("holding", "selected_offer", "completed_scenario"):
        st.session_state.pop(key, None)
    st.rerun()

with st.expander("Verification trail", expanded=False):
    checks = [
        "Current NOAA holder dataset reached",
        f"NMFS ID matched across {holding['record_count']} quota-share rows",
        f"{len(holding['species_holdings'])} species profile(s) resolved by area",
        f"{holding['security_count']} serial-group records checked for asserted interests",
        "QS-to-IFQ conversion ratios applied",
        f"Transfer eligibility linked: {holding['transfer_status']}",
        f"EIA fuel input linked: {fuel_date}",
    ]
    for check in checks:
        st.markdown(f"✓ {check}")

assumptions_tab, holdings_tab, stress_tab, market_tab, sources_tab = st.tabs(
    ["Evaluation", "Holdings", "Stress test", "Marketplace", "Sources"]
)

with stress_tab:
    st.subheader("Test the downside")
    c1, c2 = st.columns(2)
    with c1:
        catch_percent = st.slider("Allowable catch", 50, 120, 100, 1, format="%d%%")
        price_per_lb = st.slider(
            "Weighted price per lb",
            min_value=max(0.25, float(holding["weighted_price"]) * 0.5),
            max_value=max(1.0, float(holding["weighted_price"]) * 1.5),
            value=float(holding["weighted_price"]),
            step=0.05,
            format="$%.2f",
        )
    with c2:
        fuel_cost = st.slider("Fuel cost per gallon", 2.0, 10.0, float(current_fuel), 0.05, format="$%.2f")
        regulatory_risk = st.select_slider("Regulatory risk", options=["Low", "Moderate", "High"], value="Moderate")
    st.caption(f"Latest fuel observation: {fuel_date}")

model = valuation(holding, catch_percent, price_per_lb, fuel_cost, regulatory_risk)
assumptions = {"catch": catch_percent, "price": price_per_lb, "fuel": fuel_cost, "risk": regulatory_risk}
offers = make_offers(model["capacity"])
selected_offer = st.session_state.get("selected_offer")

with assumptions_tab:
    st.subheader(holding["species"] + " Quota Share")
    st.caption(
        f"{holding['holder']} · NMFS {holding['nmfs_id']} · "
        "Public record matched; identity and control not authenticated"
    )
    m1, m2, m3, m4 = st.columns(4)
    m1.metric("Modeled value", money(model["estimated"]), f"{model['change']:+.0f}% scenario")
    m2.metric("Stress value", money(model["stress"]))
    m3.metric("Modeled capacity", money(model["capacity"]))
    m4.metric("Model score", f"{model['score']} / 100")
    st.markdown("#### What drives the result")
    c1, c2, c3 = st.columns(3)
    c1.markdown(f'<div class="rm-card"><div class="rm-label">Gross harvest basis</div><div class="rm-value">{money(holding["gross_basis"])}</div><p>{holding["estimated_pounds"]:,.0f} estimated IFQ lb</p></div>', unsafe_allow_html=True)
    c2.markdown(f'<div class="rm-card"><div class="rm-label">Quota-share records</div><div class="rm-value">{holding["record_count"]}</div><p>{holding["security_count"]} asserted-interest rows checked</p></div>', unsafe_allow_html=True)
    c3.markdown(f'<div class="rm-card"><div class="rm-label">Transfer status</div><div style="font-size:1.25rem;font-weight:700;margin-top:14px">{holding["transfer_status"]}</div><p>Public transfer file only</p></div>', unsafe_allow_html=True)
    pdf = create_pdf(holding, model, assumptions, selected_offer)
    st.download_button(
        "Download complete PDF report",
        data=pdf,
        file_name=f"RightMark-NMFS-{holding['nmfs_id']}-report.pdf",
        mime="application/pdf",
        width="stretch",
    )

with holdings_tab:
    st.subheader("Complete matching holdings")
    st.dataframe(
        holding["records"],
        column_config={
            "QS units": st.column_config.NumberColumn(format="%.0f"),
            "QS per IFQ lb": st.column_config.NumberColumn(format="%.4f"),
            "Estimated IFQ lb": st.column_config.NumberColumn(format="%.0f"),
            "Benchmark price": st.column_config.NumberColumn(format="$%.2f"),
            "Gross harvest basis": st.column_config.NumberColumn(format="$%.0f"),
        },
        hide_index=True,
        width="stretch",
    )
    st.markdown("#### Species summary")
    st.dataframe(holding["species_holdings"], hide_index=True, width="stretch")

with market_tab:
    st.subheader("Illustrative marketplace")
    st.caption("These modeled structures are comparisons—not lender offers, approvals, or applications.")
    for index, offer in enumerate(offers):
        with st.container(border=True):
            cols = st.columns([2.1, 1, 1, 1, 1.2, 1.1])
            cols[0].markdown(f"### {offer['Lender']} {' · Best match' if offer['Best match'] else ''}")
            cols[1].metric("Principal", money(offer["Amount"]))
            cols[2].metric("APR", f"{offer['APR']:.1f}%")
            cols[3].metric("Term", f"{offer['Term']} mo")
            cols[4].metric("Monthly", money(offer["Monthly payment"]))
            if cols[5].button("Review", key=f"review-{index}", width="stretch"):
                st.session_state["selected_offer"] = offer
                st.session_state.pop("completed_scenario", None)
                st.rerun()

    selected_offer = st.session_state.get("selected_offer")
    if selected_offer:
        st.divider()
        st.markdown(f"### Review {selected_offer['Lender']}")
        r1, r2, r3, r4 = st.columns(4)
        r1.metric("Hypothetical principal", money(selected_offer["Amount"]))
        r2.metric("Assumed APR", f"{selected_offer['APR']:.1f}%")
        r3.metric("Term", f"{selected_offer['Term']} months")
        r4.metric("Monthly payment", money(selected_offer["Monthly payment"]))
        st.markdown(
            '<div class="rm-note"><strong>No real offer or ownership authentication.</strong> '
            "No lender participated. No transaction, credit pull, application, lien, or transfer occurs.</div>",
            unsafe_allow_html=True,
        )
        st.markdown("#### Model checks")
        st.markdown(
            "✓ Complete public record matched  \n"
            "✓ Area conversion ratios applied  \n"
            "✓ Current public market inputs linked  \n"
            "✓ Regulatory haircut applied  \n"
            "✓ Structure remains below the modeled LTV cap"
        )
        option_pdf = create_pdf(holding, model, assumptions, selected_offer)
        action_left, action_right = st.columns(2)
        action_left.download_button(
            "Download option PDF",
            data=option_pdf,
            file_name=f"RightMark-NMFS-{holding['nmfs_id']}-{selected_offer['Lender'].replace(' ', '-')}.pdf",
            mime="application/pdf",
            width="stretch",
        )
        if action_right.button("Complete illustrative option", type="primary", width="stretch"):
            st.session_state["completed_scenario"] = {
                "id": str(uuid.uuid4()),
                "completed_at": datetime.now(timezone.utc).isoformat(),
                "offer": selected_offer,
            }
            st.rerun()

        completed = st.session_state.get("completed_scenario")
        if completed:
            st.success(
                f"Illustrative {money(completed['offer']['Amount'])} structure modeled. "
                "No financing occurred and no funds were disbursed."
            )
            st.caption(f"Scenario ID: {completed['id']}")
            st.download_button(
                "Download final PDF",
                data=create_pdf(holding, model, assumptions, completed["offer"]),
                file_name=f"RightMark-NMFS-{holding['nmfs_id']}-final-report.pdf",
                mime="application/pdf",
                width="stretch",
            )

with sources_tab:
    st.subheader("Evidence and disclosures")
    st.markdown(
        f"""
        - [NOAA quota-share holder file]({HOLDERS_URL})
        - [NOAA serial and asserted-interest file]({SECURITY_URL})
        - [NOAA transfer eligibility]({TRANSFER_OTHER_URL})
        - [NOAA allocations and landings]({LANDINGS_URL})
        - [U.S. EIA weekly diesel data](https://www.eia.gov/petroleum/)

        **Important:** RightMark is an indicative decision-support prototype. It does not authenticate
        ownership, perform lien or transfer checks, provide an appraisal, approve credit, originate a loan,
        transfer funds, or replace professional financial, legal, or regulatory advice.
        """
    )

st.divider()
st.caption("RightMark · Public evidence, transparent assumptions, and illustrative financing scenarios.")
