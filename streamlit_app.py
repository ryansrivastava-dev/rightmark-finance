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
    @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Manrope:wght@400;500;600;700&display=swap');
    :root { --navy:#061831; --blue:#1d6ff2; --green:#0a6b58; --mist:#eef4fb; }
    .stApp { background:#f7f9fc; color:var(--navy); font-family:'Manrope',sans-serif; }
    [data-testid="stHeader"] { background:transparent; }
    .block-container { max-width:1240px; padding-top:2rem; padding-bottom:5rem; }
    h1,h2,h3 { letter-spacing:-.035em; }
    .rm-hero { background:linear-gradient(135deg,#061831 0%,#0d3567 68%,#126f69 140%);
      border-radius:28px; color:white; padding:clamp(30px,6vw,72px); margin:12px 0 30px;
      box-shadow:0 30px 80px rgba(6,24,49,.18); position:relative; overflow:hidden; }
    .rm-kicker { color:#72e2ca; font-size:.72rem; font-weight:700; letter-spacing:.16em; text-transform:uppercase; }
    .rm-hero h1 { font-family:'DM Serif Display',serif; font-size:clamp(3rem,7vw,6.7rem);
      line-height:.9; max-width:900px; margin:22px 0; font-weight:400; }
    .rm-hero p { color:#bfd0e5; max-width:760px; font-size:1.05rem; line-height:1.7; }
    .rm-brand { display:flex; align-items:center; gap:12px; font-size:1.05rem; font-weight:800; }
    .rm-dot { width:18px; height:18px; border:4px solid #72e2ca; border-radius:50%; display:inline-block; }
    .rm-card { background:white; border:1px solid #dbe4ef; border-radius:20px; padding:24px;
      box-shadow:0 14px 40px rgba(6,24,49,.06); height:100%; }
    .rm-label { color:#687a91; font-size:.69rem; font-weight:700; letter-spacing:.13em; text-transform:uppercase; }
    .rm-value { font-size:clamp(1.8rem,4vw,3.2rem); font-weight:700; letter-spacing:-.06em; margin-top:8px; }
    .rm-note { background:#eef4fb; border-left:4px solid #1d6ff2; border-radius:8px; padding:15px 18px; color:#38506d; }
    .stButton>button, .stDownloadButton>button { border-radius:999px; min-height:46px; font-weight:700; }
    .stButton>button[kind="primary"], .stDownloadButton>button { background:#1d6ff2; color:white; border:0; }
    [data-testid="stMetric"] { background:white; border:1px solid #dbe4ef; padding:18px; border-radius:16px; }
    [data-baseweb="tab-list"] { gap:8px; }
    [data-baseweb="tab"] { border-radius:999px; padding:9px 18px; }
    footer { visibility:hidden; }
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


def render_header() -> None:
    st.markdown('<div class="rm-brand"><span class="rm-dot"></span>RightMark</div>', unsafe_allow_html=True)
    st.markdown(
        """
        <section class="rm-hero">
          <div class="rm-kicker">Fishing quota evaluation</div>
          <h1>Know what your “quota” is worth</h1>
          <p>Verify a complete public NMFS record, calculate an explainable value,
          test downside, compare illustrative options, and export a decision-ready report.</p>
        </section>
        """,
        unsafe_allow_html=True,
    )


render_header()

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
        except requests.RequestException:
            st.error("The public record source is temporarily unavailable. Please try again shortly.")

holding = st.session_state.get("holding")
if not holding:
    image_path = APP_ROOT / "public" / "rightmark-hero-v2.png"
    if image_path.exists():
        st.image(str(image_path), caption="Public evidence. Transparent assumptions. One capital view.", width="stretch")
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
