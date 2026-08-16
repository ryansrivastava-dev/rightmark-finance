"use client";

import { useEffect, useMemo, useState } from "react";
import { calculateValuation, DEMO_ASSET, DEMO_MARKET, type MarketData, type RiskLevel } from "../lib/rightmark";
import type { PublicHolding } from "../lib/public-data";

type Screen = "landing" | "add" | "verify" | "dashboard" | "stress" | "market" | "details" | "success";
type Analysis = typeof DEMO_ASSET & ReturnType<typeof calculateValuation> & { id: string; market: MarketData; holding: PublicHolding; annualCashFlow: number; verificationLevel: string; breakdown: { quotaOwnershipValue: number; futureCashFlow: number; scarcityPremium: number; regulatoryAdjustment: number; marketAdjustment: number } };
type Offer = { id: string; lender: string; amount: number; apr: number; termMonths: number; monthlyPayment: number; bestMatch: boolean };
type Match = { id: string; amount: number; lender: string; platformFee: number; status: string };

const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
const exactMoney = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);

function Brand() { return <span className="brand"><i />RightMark</span>; }
function Button({ children, variant = "primary", onClick, disabled = false, type = "button" }: { children: React.ReactNode; variant?: "primary" | "ghost" | "dark"; onClick?: () => void; disabled?: boolean; type?: "button" | "submit" }) {
  return <button type={type} className={`button ${variant}`} onClick={onClick} disabled={disabled}>{children}</button>;
}

export function RightMarkApp() {
  const [screen, setScreen] = useState<Screen>("landing");
  const [quotaId, setQuotaId] = useState("43983");
  const [market, setMarket] = useState<MarketData>(DEMO_MARKET);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [valuation, setValuation] = useState(calculateValuation(DEMO_MARKET));
  const [verification, setVerification] = useState<string[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [selectedOffer, setSelectedOffer] = useState<Offer | null>(null);
  const [match, setMatch] = useState<Match | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/market-data").then((r) => r.json()).then((data) => data.market && setMarket(data.market)).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (screen !== "stress") return;
    const timer = setTimeout(() => {
      fetch("/api/stress", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ market, qsUnits: analysis?.holding.qsUnits }) })
        .then((r) => r.json()).then((data) => data.valuation && setValuation(data.valuation)).catch(() => setValuation(calculateValuation(market)));
    }, 80);
    return () => clearTimeout(timer);
  }, [market, screen, analysis]);

  function navigate(next: Screen) { setError(""); setScreen(next); window.scrollTo({ top: 0, behavior: "smooth" }); }

  async function analyze(skipForm = false) {
    setBusy(true); setError(""); setVerification([]); navigate("verify");
    const staged = ["Loading NOAA 2026 holder data", "Matching NMFS public record", "Aggregating quota-share units", "Linking IPHC fishery data", "Loading EIA diesel price", "Applying model assumptions"];
    let index = 0;
    const timer = window.setInterval(() => { setVerification((current) => current.length < staged.length ? [...current, staged[index++]] : current); }, 350);
    try {
      const response = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nmfsId: skipForm ? "43983" : quotaId, assetType: "fishing", market }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Analysis could not be completed.");
      await new Promise((resolve) => setTimeout(resolve, 2200));
      setVerification(data.verification);
      setAnalysis(data.analysis); setValuation(data.analysis); setTimeout(() => navigate("dashboard"), 450);
    } catch (reason) {
      navigate("add"); setError(reason instanceof Error ? reason.message : "Analysis could not be completed.");
    } finally { window.clearInterval(timer); setBusy(false); }
  }

  async function getOffers() {
    if (!analysis) return analyze(true);
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/offers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ analysisId: analysis.id }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Offers are unavailable.");
      setOffers(data.offers); navigate("market");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Offers are unavailable."); }
    finally { setBusy(false); }
  }

  async function acceptOffer() {
    if (!selectedOffer) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/offers/accept", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ offerId: selectedOffer.id }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "The demo offer could not be accepted.");
      setMatch(data.match); navigate("success");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The demo offer could not be accepted."); }
    finally { setBusy(false); }
  }

  const insight = useMemo(() => {
    if (valuation.changePercent < -2) return `Estimated value declined ${Math.abs(valuation.changePercent)}%. Lower catch or market revenue reduces modeled future cash flow and increases lender downside exposure.`;
    if (valuation.changePercent > 2) return `Estimated value increased ${valuation.changePercent}%. Stronger operating conditions improve cash-flow coverage, while the model still applies regulatory and market haircuts.`;
    return "This asset remains within its stable operating range. Verified scarcity and historical cash flow support a low–moderate risk assessment.";
  }, [valuation]);

  const steps = ["Verify", "Value", "Stress", "Match"];
  const stepIndex = ({ landing: 0, add: 0, verify: 0, dashboard: 1, stress: 2, market: 3, details: 3, success: 3 } as Record<Screen, number>)[screen];

  return <div className="app-shell">
    <header className="nav"><button className="brandButton" onClick={() => navigate("landing")} aria-label="RightMark home"><Brand /></button><div className="navSteps">{steps.map((step, i) => <span className={i <= stepIndex && screen !== "landing" ? "active" : ""} key={step}><i>{i + 1}</i>{step}</span>)}</div><span className="demoPill">LIVE DATA · MODELED OUTPUTS</span></header>
    {error && <div className="errorBar">{error}<button onClick={() => setError("")}>×</button></div>}

    {screen === "landing" && <Landing onAnalyze={() => navigate("add")} onDemo={() => analyze(true)} />}
    {screen === "add" && <AddAsset quotaId={quotaId} setQuotaId={setQuotaId} onAnalyze={() => analyze()} busy={busy} error={error} />}
    {screen === "verify" && <Verification checks={verification} />}
    {screen === "dashboard" && analysis && <Dashboard analysis={analysis} market={market} onStress={() => navigate("stress")} onFinance={getOffers} busy={busy} />}
    {screen === "stress" && analysis && <StressTest market={market} setMarket={setMarket} valuation={valuation} insight={insight} onBack={() => navigate("dashboard")} onFinance={getOffers} />}
    {screen === "market" && analysis && <Marketplace analysis={analysis} offers={offers} onBack={() => navigate("dashboard")} onSelect={(offer) => { setSelectedOffer(offer); navigate("details"); }} />}
    {screen === "details" && analysis && selectedOffer && <OfferDetails analysis={analysis} offer={selectedOffer} busy={busy} onBack={() => navigate("market")} onAccept={acceptOffer} />}
    {screen === "success" && analysis && selectedOffer && match && <Success analysis={analysis} match={match} onRestart={() => { setAnalysis(null); setSelectedOffer(null); setMatch(null); navigate("landing"); }} />}
    <footer><Brand /><p>Government records and market inputs are sourced; valuations and financing scenarios are modeled. RightMark is not a lender, broker, or appraiser.</p><span>© 2026 RightMark</span></footer>
  </div>;
}

function Landing({ onAnalyze, onDemo }: { onAnalyze: () => void; onDemo: () => void }) {
  return <main><section className="hero"><div className="heroCopy"><span className="eyebrow">ALTERNATIVE ASSET INTELLIGENCE</span><h1>Turn overlooked rights into <em>usable capital.</em></h1><p>RightMark combines current government records and market signals with transparent financial modeling. Public-record matches are kept separate from identity and ownership authentication.</p><div className="heroActions"><Button onClick={onAnalyze}>Analyze a public record <b>↗</b></Button><Button variant="dark" onClick={onDemo}>Run live-data demo</Button></div><div className="trustRow"><span><b>✓</b> NOAA holder data</span><span><b>✓</b> IPHC + EIA inputs</span><span><b>✓</b> Sourced outputs</span></div></div><div className="terminalCard"><div className="terminalTop"><span><i /> LIVE-DATA MODEL</span><small>NMFS ID 43983</small></div><div className="terminalValue"><small>MODELED RIGHTMARK VALUE</small><strong>$142,600</strong><span>+ public record matched</span></div><div className="terminalGrid"><div><small>MODEL SCORE</small><b>86 <i>/100</i></b></div><div><small>MODELED CAPACITY</small><b>$71,300</b></div></div><div className="sparkBars">{[34, 44, 39, 56, 51, 68, 61, 75, 72, 86, 82, 94].map((h, i) => <i key={i} style={{ height: `${h}%` }} />)}</div><p>Pacific Halibut QS <span>Public data + assumptions</span></p></div></section>
    <section className="assetBand"><p>COMMERCIAL RIGHTS WE CAN MODEL</p><div><span>◒ <b>Fishing quotas</b></span><span>≋ <b>Water rights</b></span><span>◆ <b>Taxi medallions</b></span><span>⌁ <b>Spectrum rights</b></span></div></section>
    <section className="contentSection"><div className="sectionIntro"><span className="eyebrow darkText">THE RIGHTMARK ENGINE</span><h2>From public record to clear model.</h2><p>Every output distinguishes sourced facts, model assumptions, and indicative financing scenarios.</p></div><div className="engineGrid">{[["01","Match","NOAA public records match the supplied NMFS ID."],["02","Analyze","NOAA, IPHC and EIA signals are collected with source links."],["03","Model","Transparent assumptions estimate economic value."],["04","Stress test","Downside scenarios reveal modeled collateral resilience."],["05","Size","Risk-adjusted value and maximum LTV are calculated."],["06","Compare","Indicative terms are compared; no lender approval is implied."]].map(([n,t,d]) => <article key={n}><span>{n}</span><h3>{t}</h3><p>{d}</p></article>)}</div></section>
    <section className="impactSection"><div><span className="eyebrow">THE ACCESS GAP</span><h2>Financial infrastructure for overlooked businesses.</h2><p>Large companies hire lawyers, bankers, analysts and specialized consultants. RightMark gives smaller operators a clearer picture of the value recorded in public datasets.</p></div><div className="comparison"><article><small>BEFORE RIGHTMARK</small><p>Asset value <b>Unknown</b></p><p>Borrowing power <b>Unknown</b></p><p>Financing options <b>Limited</b></p></article><article className="after"><small>WITH RIGHTMARK</small><p>Modeled value <b>$142,600</b></p><p>Modeled capacity <b>$71,300</b></p><p>Indicative scenarios <b>3 compared</b></p></article></div></section>
  </main>;
}

function AddAsset({ quotaId, setQuotaId, onAnalyze, busy }: { quotaId: string; setQuotaId: (value: string) => void; onAnalyze: () => void; busy: boolean; error: string }) {
  return <main className="workspace"><div className="workspaceHead"><span className="eyebrow darkText">PUBLIC RECORD LOOKUP</span><h1>Find a quota-share record.</h1><p>Enter an NMFS ID published in NOAA’s 2026 Alaska IFQ holder dataset.</p></div><div className="assetChoices"><article className="selected"><span>◒</span><b>Alaska halibut quota share</b><small>LIVE PUBLIC DATA</small></article><article className="disabled"><span>≋</span><b>Water right</b><small>NO LIVE CONNECTOR</small></article><article className="disabled"><span>◆</span><b>Taxi medallion</b><small>NO LIVE CONNECTOR</small></article><article className="disabled"><span>⌁</span><b>Spectrum license</b><small>NO LIVE CONNECTOR</small></article></div><form className="intakeCard" onSubmit={(event) => { event.preventDefault(); onAnalyze(); }}><div><label htmlFor="quota">NMFS ID</label><p>RightMark will aggregate current public halibut QS records for this ID.</p></div><input id="quota" inputMode="numeric" value={quotaId} onChange={(e) => setQuotaId(e.target.value)} aria-describedby="quotaHint" /><small id="quotaHint">Public example: 43983 · Cape Barnabas Inc. The lookup does not authenticate the current user.</small><Button type="submit" disabled={busy}>{busy ? "Connecting…" : "Match public record ↗"}</Button><div className="securityNote">◇ NOAA public dataset &nbsp;·&nbsp; No credit check &nbsp;·&nbsp; No ownership authentication</div></form></main>;
}

function Verification({ checks }: { checks: string[] }) {
  const all = ["2026 NOAA holder dataset reached", "NMFS ID matched to public record", "Quota-share records aggregated", "Species, areas and categories parsed", "NOAA, IPHC and EIA inputs linked", "RightMark model assumptions applied"];
  return <main className="verifyPage"><div className="scanOrb"><span>RM</span><i /></div><span className="eyebrow darkText">RIGHTMARK PUBLIC DATA</span><h1>Building the sourced record.</h1><p>Connecting current government, fishery, price and energy signals.</p><div className="checkList">{all.map((label, i) => <div className={i < checks.length ? "done" : i === checks.length ? "running" : ""} key={label}><span>{i < checks.length ? "✓" : i === checks.length ? "↻" : "·"}</span><p>{label}</p><small>{i < checks.length ? "COMPLETE" : i === checks.length ? "PROCESSING" : "QUEUED"}</small></div>)}</div><p className="apiNote">NOAA · IPHC · U.S. Energy Information Administration</p></main>;
}

function Dashboard({ analysis, market, onStress, onFinance, busy }: { analysis: Analysis; market: MarketData; onStress: () => void; onFinance: () => void; busy: boolean }) {
  return <main className="workspace wide"><div className="dashboardTitle"><div><span className="statusBadge">✓ PUBLIC RECORD MATCHED</span><h1>Pacific Halibut Quota Share</h1><p>{analysis.owner} <i /> NMFS ID {analysis.quotaId} <i /> {analysis.holding.qsUnits.toLocaleString()} QS units</p></div><Button onClick={onFinance} disabled={busy}>{busy ? "Calculating…" : "View indicative terms ↗"}</Button></div><div className="recordNotice"><b>What is verified:</b> NOAA’s public dataset contains this holder and these QS records. <b>What is not verified:</b> the visitor’s identity, current control, liens, transfer eligibility, or collateral value.</div><div className="metrics"><Metric label="MODELED ASSET VALUE" value={money(analysis.estimatedValue)} note="RightMark estimate, not appraisal" /><Metric label="RIGHTMARK MODEL SCORE" value={`${analysis.score} / 100`} note="Scenario-derived" accent /><Metric label="MODELED ANNUAL CASH FLOW" value={money(analysis.annualCashFlow)} note="Assumption-based estimate" /><Metric label="MODELED CAPACITY" value={money(analysis.borrowingPower)} note="60% maximum LTV assumption" accent /></div>
    <div className="dashboardBody"><section className="valuationCard"><div className="cardHead"><div><small>TRANSPARENT VALUATION MODEL</small><h2>Sourced inputs, modeled output.</h2></div><span className="sourceBadge"><i /> {market.source}</span></div><div className="valuationRows"><p><span>Quota ownership value<small>{analysis.holding.qsUnits.toLocaleString()} public NOAA QS units</small></span><b className="positive">+{money(analysis.breakdown.quotaOwnershipValue)}</b></p><p><span>Expected future cash flow<small>IPHC $8.18/lb benchmark + model assumptions</small></span><b className="positive">+{money(analysis.breakdown.futureCashFlow)}</b></p><p><span>Scarcity premium<small>Limited issuance and transfer supply</small></span><b className="positive">+{money(analysis.breakdown.scarcityPremium)}</b></p><p><span>Regulatory risk adjustment<small>Transfer and allowable-catch exposure</small></span><b className="negative">−{money(Math.abs(analysis.breakdown.regulatoryAdjustment))}</b></p><p><span>Market volatility adjustment<small>EIA diesel ${market.fuelCost.toFixed(3)}/gal + price variance</small></span><b className="negative">−{money(Math.abs(analysis.breakdown.marketAdjustment))}</b></p><p className="valuationTotal"><span>MODELED RIGHTMARK VALUE</span><b>{money(analysis.estimatedValue)}</b></p></div></section>
      <aside className="riskCard"><small>DOWNSIDE READINESS</small><h2>{money(analysis.stressValue)}</h2><p>Modeled stress value after applying the current risk factor.</p><div className="riskScale"><i /><i /><i className="marker" /><i /><i /></div><div className="scaleLabels"><span>Lower risk</span><span>Higher risk</span></div><Button variant="dark" onClick={onStress}>Run interactive stress test →</Button><div className="dataSource"><b>Current public signals</b><p>NOAA: {market.halibutLandedPercent}% of {Intl.NumberFormat("en-US", { notation: "compact" }).format(market.halibutAllocationLb)} lb allocation landed</p><p>IPHC: {Intl.NumberFormat("en-US", { notation: "compact" }).format(market.mortalityToDateLb)} lb of {Intl.NumberFormat("en-US", { notation: "compact" }).format(market.fisheryLimitLb)} lb limit</p><div className="sourceList">{market.sources.map((source) => <a href={source.url} target="_blank" rel="noreferrer" key={source.url}><i className={source.live ? "on" : ""} />{source.label} ↗</a>)}</div></div></aside></div>
    <section className="modelStrip"><div><small>MODEL LOGIC</small><h3>Every calculated number is labeled.</h3></div><p><span>Modeled asset value</span><b>{money(analysis.estimatedValue)}</b></p><i>×</i><p><span>Risk factor</span><b>0.83</b></p><i>=</i><p><span>Modeled stress value</span><b>{money(analysis.stressValue)}</b></p><i>× 60%</i><p className="highlight"><span>Modeled capacity</span><b>{money(analysis.borrowingPower)}</b></p></section>
  </main>;
}

function Metric({ label, value, note, accent = false }: { label: string; value: string; note: string; accent?: boolean }) { return <article className={accent ? "metric accent" : "metric"}><small>{label}</small><strong>{value}</strong><span>{accent ? "●" : "↗"} {note}</span></article>; }

function StressTest({ market, setMarket, valuation, insight, onBack, onFinance }: { market: MarketData; setMarket: (market: MarketData) => void; valuation: ReturnType<typeof calculateValuation>; insight: string; onBack: () => void; onFinance: () => void }) {
  const set = <K extends keyof MarketData>(key: K, value: MarketData[K]) => setMarket({ ...market, [key]: value });
  const chart = [0.72, 0.76, 0.8, 0.86, 0.91, 0.96, 1, 1.03, 1.07, 1.11, 1.14, 1.18].map((factor) => Math.min(100, Math.max(20, factor * valuation.scenarioFactor * 72)));
  return <main className="workspace wide"><button className="backLink" onClick={onBack}>← Asset dashboard</button><div className="workspaceHead split"><div><span className="eyebrow darkText">INTERACTIVE STRESS TEST</span><h1>What happens if conditions change?</h1><p>Adjust the operating environment and see the underwriting response.</p></div><span className="liveBadge"><i /> MODEL UPDATES LIVE</span></div><div className="stressLayout"><section className="controlCard"><Control label="Allowable catch" value={`${market.allowableCatchPercent}%`} min={50} max={120} step={1} current={market.allowableCatchPercent} onChange={(v) => set("allowableCatchPercent", v)} /><Control label="Fish market price" value={`$${market.fishPrice.toFixed(2)} / lb`} min={4} max={12} step={0.1} current={market.fishPrice} onChange={(v) => set("fishPrice", v)} /><Control label="Fuel costs" value={`$${market.fuelCost.toFixed(2)} / gal`} min={2} max={8} step={0.1} current={market.fuelCost} onChange={(v) => set("fuelCost", v)} /><div className="selectControl"><label htmlFor="risk">Regulatory risk <b>{market.regulatoryRisk}</b></label><div className="riskButtons">{(["Low","Moderate","High"] as RiskLevel[]).map((risk) => <button id={risk === "Low" ? "risk" : undefined} className={market.regulatoryRisk === risk ? "active" : ""} onClick={() => set("regulatoryRisk", risk)} key={risk}>{risk}</button>)}</div></div><button className="resetButton" onClick={() => setMarket({ ...DEMO_MARKET, source: market.source, refreshedAt: market.refreshedAt })}>↻ Reset baseline</button></section>
      <section className="scenarioCard"><div className="cardHead"><div><small>SCENARIO VALUE TRAJECTORY</small><h2>{money(valuation.estimatedValue)}</h2></div><span className={valuation.changePercent < 0 ? "delta negative" : "delta positive"}>{valuation.changePercent >= 0 ? "+" : ""}{valuation.changePercent}%</span></div><div className="barChart">{chart.map((height, i) => <i key={i} className={i === 6 ? "current" : ""} style={{ height: `${height}%` }} />)}</div><div className="chartAxis"><span>Downside</span><span>Current scenario</span><span>Upside</span></div><div className="scenarioMetrics"><Metric label="RISK SCORE" value={`${valuation.score}`} note="out of 100" accent /><Metric label="STRESS-TESTED VALUE" value={money(valuation.stressValue)} note="risk adjusted" /><Metric label="BORROWING POWER" value={money(valuation.borrowingPower)} note="60% max LTV" accent /></div></section></div>
    <section className="insightBox"><span>✦</span><div><small>RIGHTMARK INSIGHT</small><h3>{valuation.changePercent < -2 ? "Downside detected in this scenario." : "The asset remains financeable."}</h3><p>{insight}</p></div><Button onClick={onFinance}>Compare offers →</Button></section>
  </main>;
}

function Control({ label, value, min, max, step, current, onChange }: { label: string; value: string; min: number; max: number; step: number; current: number; onChange: (value: number) => void }) { return <div className="rangeControl"><label>{label}<b>{value}</b></label><input aria-label={label} type="range" min={min} max={max} step={step} value={current} onChange={(e) => onChange(Number(e.target.value))} /><div><span>{min}</span><span>{max}</span></div></div>; }

function Marketplace({ analysis, offers, onBack, onSelect }: { analysis: Analysis; offers: Offer[]; onBack: () => void; onSelect: (offer: Offer) => void }) {
  return <main className="workspace wide"><button className="backLink" onClick={onBack}>← Asset dashboard</button><div className="workspaceHead split"><div><span className="eyebrow darkText">INDICATIVE TERM SCENARIOS</span><h1>Three modeled structures.</h1><p>These calculations are not lender quotes, approvals, or market offers.</p></div><span className="demoPill light">NO LENDER INVOLVED</span></div><div className="assetSummary"><div><small>PUBLIC RECORD</small><b>Pacific Halibut QS</b><span>NMFS ID {analysis.quotaId}</span></div><div><small>MODELED VALUE</small><b>{money(analysis.estimatedValue)}</b></div><div><small>MODELED STRESS VALUE</small><b>{money(analysis.stressValue)}</b></div><div className="recommended"><small>MODELED CAPACITY</small><b>{money(analysis.borrowingPower)}</b></div></div><div className="offerGrid">{offers.map((offer) => <article className={offer.bestMatch ? "offerCard best" : "offerCard"} key={offer.id}>{offer.bestMatch && <span className="bestLabel">MODEL FIT</span>}<div className="lenderLogo">{offer.lender.split(" ").map((word) => word[0]).join("")}</div><h2>{offer.lender}</h2><p className="offerAmount">{money(offer.amount)}<small>HYPOTHETICAL PRINCIPAL</small></p><div className="offerTerms"><p><small>ASSUMED APR</small><b>{offer.apr}%</b></p><p><small>TERM</small><b>{offer.termMonths} mo</b></p><p><small>CALC. MONTHLY</small><b>{exactMoney(offer.monthlyPayment)}</b></p><p><small>STRESS LTV</small><b>{(offer.amount / analysis.stressValue * 100).toFixed(1)}%</b></p></div><Button variant={offer.bestMatch ? "primary" : "ghost"} onClick={() => onSelect(offer)}>Inspect scenario →</Button><small className="nonbinding">Illustrative · not a quote · no lender involved</small></article>)}</div><div className="whyMatch"><span>◇</span><div><b>What these scenarios mean</b><p>They demonstrate payment and LTV mechanics using assumed terms. A real offer requires a licensed lender, underwriting, consent, and authenticated records.</p></div></div></main>;
}

function OfferDetails({ analysis, offer, busy, onBack, onAccept }: { analysis: Analysis; offer: Offer; busy: boolean; onBack: () => void; onAccept: () => void }) {
  return <main className="workspace offerDetail"><button className="backLink" onClick={onBack}>← All scenarios</button><div className="detailHeader"><div className="lenderLogo">{offer.lender.split(" ").map((w) => w[0]).join("")}</div><div><span className="eyebrow darkText">INDICATIVE SCENARIO</span><h1>{offer.lender}</h1><p>Scenario ID {offer.id.slice(-14).toUpperCase()}</p></div><span className="statusBadge">MODEL FIT</span></div><section className="summaryCard"><div className="summaryHero"><small>HYPOTHETICAL PRINCIPAL</small><strong>{money(offer.amount)}</strong><p><span>{offer.apr}% assumed APR</span><i />{offer.termMonths} months<i />{exactMoney(offer.monthlyPayment)} / month</p></div><div className="summaryRows"><p><span>Public record</span><b>Pacific Halibut QS · NMFS {analysis.quotaId}</b></p><p><span>Modeled value</span><b>{money(analysis.estimatedValue)}</b></p><p><span>Modeled stress value</span><b>{money(analysis.stressValue)}</b></p><p><span>Calculated LTV</span><b>{(offer.amount / analysis.stressValue * 100).toFixed(1)}%</b></p><p><span>Illustrative platform fee</span><b>{money(offer.amount * 0.01)} (1%)</b></p></div><div className="qualified"><h3>Model checks</h3>{["NOAA public record matched", "Risk-adjusted modeled value", "Current public market inputs", "Regulatory haircut applied", "Scenario below modeled LTV cap"].map((item) => <span key={item}>✓ {item}</span>)}</div><div className="legalNotice"><b>No real offer or ownership authentication</b><p>No lender participated. No transaction, credit pull, application, lien, or transfer occurs. Public holder data does not prove the visitor controls the asset.</p></div><Button onClick={onAccept} disabled={busy}>{busy ? "Recording scenario…" : "Complete illustrative scenario →"}</Button></section></main>;
}

function Success({ analysis, match, onRestart }: { analysis: Analysis; match: Match; onRestart: () => void }) {
  return <main className="successPage"><div className="successMark">✓<i /></div><span className="eyebrow darkText">ILLUSTRATIVE SCENARIO COMPLETE</span><h1>{money(match.amount)} structure modeled.</h1><p>This demonstrates a potential financing structure for the public record associated with NMFS ID {analysis.quotaId}. It is not an offer or transaction.</p><section className="successReceipt"><div><small>HYPOTHETICAL PRINCIPAL</small><b>{money(match.amount)}</b><span>No funds disbursed</span></div><div><small>PUBLIC RECORD</small><b>Pacific Halibut QS</b><span>Modeled value {money(analysis.estimatedValue)}</span></div><div className="fee"><small>ILLUSTRATIVE REVENUE</small><b>{money(match.platformFee)}</b><span>1% potential platform fee</span></div></section><section className="impactCallout"><span>THE PRODUCT HYPOTHESIS</span><h2>Better data could expand responsible capital access.</h2><p>A real transaction would require authenticated ownership, lien and transfer checks, complete underwriting, and a licensed lending partner.</p></section><div className="successActions"><Button onClick={onRestart}>Analyze another record</Button><Button variant="ghost" onClick={() => window.print()}>Print scenario summary</Button></div><p className="matchId">Scenario ID: {match.id}</p></main>;
}
