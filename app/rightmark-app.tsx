"use client";

import { useEffect, useMemo, useState } from "react";
import { calculateValuation, DEMO_ASSET, DEMO_MARKET, type MarketData, type RiskLevel } from "../lib/rightmark";

type Screen = "landing" | "add" | "verify" | "dashboard" | "stress" | "market" | "details" | "success";
type Analysis = typeof DEMO_ASSET & ReturnType<typeof calculateValuation> & { id: string; market: MarketData };
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
  const [quotaId, setQuotaId] = useState(DEMO_ASSET.quotaId);
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
      fetch("/api/stress", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(market) })
        .then((r) => r.json()).then((data) => data.valuation && setValuation(data.valuation)).catch(() => setValuation(calculateValuation(market)));
    }, 80);
    return () => clearTimeout(timer);
  }, [market, screen]);

  function navigate(next: Screen) { setError(""); setScreen(next); window.scrollTo({ top: 0, behavior: "smooth" }); }

  async function analyze(skipForm = false) {
    setBusy(true); setError(""); setVerification([]); navigate("verify");
    const staged = ["Connecting to government records", "Matching ownership record", "Checking transfer rules", "Collecting market data", "Modeling historical transactions", "Processing regulatory data"];
    let index = 0;
    const timer = window.setInterval(() => { setVerification((current) => current.length < staged.length ? [...current, staged[index++]] : current); }, 350);
    try {
      const response = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quotaId: skipForm ? DEMO_ASSET.quotaId : quotaId, assetType: "fishing", market }) });
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
    <header className="nav"><button className="brandButton" onClick={() => navigate("landing")} aria-label="RightMark home"><Brand /></button><div className="navSteps">{steps.map((step, i) => <span className={i <= stepIndex && screen !== "landing" ? "active" : ""} key={step}><i>{i + 1}</i>{step}</span>)}</div><span className="demoPill">SIMULATION MODE</span></header>
    {error && <div className="errorBar">{error}<button onClick={() => setError("")}>×</button></div>}

    {screen === "landing" && <Landing onAnalyze={() => navigate("add")} onDemo={() => analyze(true)} />}
    {screen === "add" && <AddAsset quotaId={quotaId} setQuotaId={setQuotaId} onAnalyze={() => analyze()} busy={busy} error={error} />}
    {screen === "verify" && <Verification checks={verification} />}
    {screen === "dashboard" && analysis && <Dashboard analysis={analysis} market={market} onStress={() => navigate("stress")} onFinance={getOffers} busy={busy} />}
    {screen === "stress" && analysis && <StressTest market={market} setMarket={setMarket} valuation={valuation} insight={insight} onBack={() => navigate("dashboard")} onFinance={getOffers} />}
    {screen === "market" && analysis && <Marketplace analysis={analysis} offers={offers} onBack={() => navigate("dashboard")} onSelect={(offer) => { setSelectedOffer(offer); navigate("details"); }} />}
    {screen === "details" && analysis && selectedOffer && <OfferDetails analysis={analysis} offer={selectedOffer} busy={busy} onBack={() => navigate("market")} onAccept={acceptOffer} />}
    {screen === "success" && analysis && selectedOffer && match && <Success match={match} offer={selectedOffer} onRestart={() => { setAnalysis(null); setSelectedOffer(null); setMatch(null); navigate("landing"); }} />}
    <footer><Brand /><p>RightMark is a technology prototype, not a lender or broker. All valuations, offers and transactions are simulated and non-binding.</p><span>© 2026 RightMark</span></footer>
  </div>;
}

function Landing({ onAnalyze, onDemo }: { onAnalyze: () => void; onDemo: () => void }) {
  return <main><section className="hero"><div className="heroCopy"><span className="eyebrow">ALTERNATIVE ASSET INTELLIGENCE</span><h1>Turn overlooked rights into <em>usable capital.</em></h1><p>RightMark transforms difficult-to-value commercial rights into understandable financial assets—and connects their owners with potential financing opportunities.</p><div className="heroActions"><Button onClick={onAnalyze}>Analyze my asset <b>↗</b></Button><Button variant="dark" onClick={onDemo}>Run 90-sec demo</Button></div><div className="trustRow"><span><b>✓</b> Government data</span><span><b>✓</b> Downside modeling</span><span><b>✓</b> No asset sale</span></div></div><div className="terminalCard"><div className="terminalTop"><span><i /> LIVE ASSET MODEL</span><small>RM–IFQ–482917</small></div><div className="terminalValue"><small>RIGHTMARK VALUE</small><strong>$142,600</strong><span>+ verified commercial right</span></div><div className="terminalGrid"><div><small>RISK SCORE</small><b>86 <i>/100</i></b></div><div><small>BORROWING POWER</small><b>$71,300</b></div></div><div className="sparkBars">{[34, 44, 39, 56, 51, 68, 61, 75, 72, 86, 82, 94].map((h, i) => <i key={i} style={{ height: `${h}%` }} />)}</div><p>Pacific Halibut IFQ <span>Low–Moderate risk</span></p></div></section>
    <section className="assetBand"><p>COMMERCIAL RIGHTS WE CAN MODEL</p><div><span>◒ <b>Fishing quotas</b></span><span>≋ <b>Water rights</b></span><span>◆ <b>Taxi medallions</b></span><span>⌁ <b>Spectrum rights</b></span></div></section>
    <section className="contentSection"><div className="sectionIntro"><span className="eyebrow darkText">THE RIGHTMARK ENGINE</span><h2>From opaque right to clear financing signal.</h2><p>One workflow brings fragmented government, market, and regulatory signals into a lender-ready view.</p></div><div className="engineGrid">{[["01","Verify","Government records confirm the right and holder."],["02","Analyze","Market, transaction and regulatory data are processed."],["03","Value","Financial models estimate the right’s economic value."],["04","Stress test","Downside scenarios reveal resilient collateral value."],["05","Underwrite","Risk-adjusted value and maximum LTV are calculated."],["06","Match","Eligible simulated lenders are compared side-by-side."]].map(([n,t,d]) => <article key={n}><span>{n}</span><h3>{t}</h3><p>{d}</p></article>)}</div></section>
    <section className="impactSection"><div><span className="eyebrow">THE ACCESS GAP</span><h2>Financial infrastructure for overlooked businesses.</h2><p>Large companies hire lawyers, bankers, analysts and specialized consultants. RightMark gives smaller operators a clearer picture of the value they already own.</p></div><div className="comparison"><article><small>BEFORE RIGHTMARK</small><p>Asset value <b>Unknown</b></p><p>Borrowing power <b>Unknown</b></p><p>Financing options <b>Limited</b></p></article><article className="after"><small>WITH RIGHTMARK</small><p>Asset value <b>$142,600</b></p><p>Borrowing power <b>$71,300</b></p><p>Financing offers <b>3 matched</b></p></article></div></section>
  </main>;
}

function AddAsset({ quotaId, setQuotaId, onAnalyze, busy }: { quotaId: string; setQuotaId: (value: string) => void; onAnalyze: () => void; busy: boolean; error: string }) {
  return <main className="workspace"><div className="workspaceHead"><span className="eyebrow darkText">ASSET INTAKE</span><h1>What do you own?</h1><p>Select a commercial right and connect it to the RightMark engine.</p></div><div className="assetChoices"><article className="selected"><span>◒</span><b>Fishing quota</b><small>FULL ANALYSIS</small></article><article className="disabled"><span>≋</span><b>Water right</b><small>DATA ADAPTER READY</small></article><article className="disabled"><span>◆</span><b>Taxi medallion</b><small>DATA ADAPTER READY</small></article><article className="disabled"><span>⌁</span><b>Spectrum license</b><small>DATA ADAPTER READY</small></article></div><form className="intakeCard" onSubmit={(event) => { event.preventDefault(); onAnalyze(); }}><div><label htmlFor="quota">QUOTA IDENTIFIER</label><p>We’ll match this ID against the demo government record.</p></div><input id="quota" value={quotaId} onChange={(e) => setQuotaId(e.target.value)} aria-describedby="quotaHint" /><small id="quotaHint">Try the verified demo record: IFQ-482917</small><Button type="submit" disabled={busy}>{busy ? "Connecting…" : "Analyze asset ↗"}</Button><div className="securityNote">◇ Encrypted in transit &nbsp;·&nbsp; No credit check &nbsp;·&nbsp; Simulation only</div></form></main>;
}

function Verification({ checks }: { checks: string[] }) {
  const all = ["Government record located", "Ownership record matched", "Transfer rules checked", "Market data received", "Historical transactions modeled", "Regulatory data processed"];
  return <main className="verifyPage"><div className="scanOrb"><span>RM</span><i /></div><span className="eyebrow darkText">RIGHTMARK VERIFY</span><h1>Building the asset record.</h1><p>Connecting government, market, and regulatory signals.</p><div className="checkList">{all.map((label, i) => <div className={i < checks.length ? "done" : i === checks.length ? "running" : ""} key={label}><span>{i < checks.length ? "✓" : i === checks.length ? "↻" : "·"}</span><p>{label}</p><small>{i < checks.length ? "COMPLETE" : i === checks.length ? "PROCESSING" : "QUEUED"}</small></div>)}</div><p className="apiNote">Official NOAA data source + RightMark demo records</p></main>;
}

function Dashboard({ analysis, market, onStress, onFinance, busy }: { analysis: Analysis; market: MarketData; onStress: () => void; onFinance: () => void; busy: boolean }) {
  return <main className="workspace wide"><div className="dashboardTitle"><div><span className="statusBadge">✓ VERIFIED ASSET</span><h1>Pacific Halibut IFQ</h1><p>{analysis.owner} <i /> {analysis.quotaId}</p></div><Button onClick={onFinance} disabled={busy}>{busy ? "Matching…" : "Get financing ↗"}</Button></div><div className="metrics"><Metric label="ESTIMATED MARKET VALUE" value={money(analysis.estimatedValue)} note="Model confidence: high" /><Metric label="RIGHTMARK SCORE" value={`${analysis.score} / 100`} note="Low–Moderate risk" accent /><Metric label="EST. ANNUAL CASH FLOW" value={money(DEMO_ASSET.annualCashFlow)} note="Trailing model estimate" /><Metric label="BORROWING POWER" value={money(analysis.borrowingPower)} note="60% maximum LTV" accent /></div>
    <div className="dashboardBody"><section className="valuationCard"><div className="cardHead"><div><small>VALUATION MODEL</small><h2>What this right is worth.</h2></div><span className="sourceBadge"><i /> {market.source}</span></div><div className="valuationRows"><p><span>Quota ownership value<small>Comparable rights &amp; quota units</small></span><b className="positive">+$117,000</b></p><p><span>Expected future cash flow<small>Risk-adjusted operating income</small></span><b className="positive">+$38,000</b></p><p><span>Scarcity premium<small>Limited issuance and transfer supply</small></span><b className="positive">+$11,000</b></p><p><span>Regulatory risk adjustment<small>Transfer and allowable-catch exposure</small></span><b className="negative">−$13,200</b></p><p><span>Market volatility adjustment<small>Price and operating-cost variance</small></span><b className="negative">−$10,200</b></p><p className="valuationTotal"><span>RIGHTMARK VALUE</span><b>{money(analysis.estimatedValue)}</b></p></div></section>
      <aside className="riskCard"><small>DOWNSIDE READINESS</small><h2>{money(analysis.stressValue)}</h2><p>Stress-tested value after applying a 17% risk factor.</p><div className="riskScale"><i /><i /><i className="marker" /><i /><i /></div><div className="scaleLabels"><span>Lower risk</span><span>Higher risk</span></div><Button variant="dark" onClick={onStress}>Run interactive stress test →</Button><div className="dataSource"><b>Market signal</b><p>{market.halibutLandedPercent}% of {Intl.NumberFormat("en-US", { notation: "compact" }).format(market.halibutAllocationLb)} lb allocation landed</p><a href={market.sourceUrl} target="_blank" rel="noreferrer">View NOAA source ↗</a></div></aside></div>
    <section className="modelStrip"><div><small>MODEL LOGIC</small><h3>Transparent enough to challenge.</h3></div><p><span>Estimated market value</span><b>{money(analysis.estimatedValue)}</b></p><i>×</i><p><span>Risk factor</span><b>0.83</b></p><i>=</i><p><span>Stress-tested value</span><b>{money(analysis.stressValue)}</b></p><i>× 60%</i><p className="highlight"><span>Borrowing power</span><b>{money(analysis.borrowingPower)}</b></p></section>
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
  return <main className="workspace wide"><button className="backLink" onClick={onBack}>← Asset dashboard</button><div className="workspaceHead split"><div><span className="eyebrow darkText">FINANCING MARKETPLACE</span><h1>Three matched offers.</h1><p>Compare simulated terms modeled against your verified asset.</p></div><span className="demoPill light">SIMULATION ONLY</span></div><div className="assetSummary"><div><small>YOUR ASSET</small><b>Pacific Halibut IFQ</b><span>{analysis.quotaId}</span></div><div><small>RIGHTMARK VALUE</small><b>{money(analysis.estimatedValue)}</b></div><div><small>STRESS-TESTED VALUE</small><b>{money(analysis.stressValue)}</b></div><div className="recommended"><small>MAX RECOMMENDED</small><b>{money(analysis.borrowingPower)}</b></div></div><div className="offerGrid">{offers.map((offer) => <article className={offer.bestMatch ? "offerCard best" : "offerCard"} key={offer.id}>{offer.bestMatch && <span className="bestLabel">BEST MATCH</span>}<div className="lenderLogo">{offer.lender.split(" ").map((word) => word[0]).join("")}</div><h2>{offer.lender}</h2><p className="offerAmount">{money(offer.amount)}<small>LOAN AMOUNT</small></p><div className="offerTerms"><p><small>APR</small><b>{offer.apr}%</b></p><p><small>TERM</small><b>{offer.termMonths} mo</b></p><p><small>EST. MONTHLY</small><b>{exactMoney(offer.monthlyPayment)}</b></p><p><small>STRESS LTV</small><b>{(offer.amount / analysis.stressValue * 100).toFixed(1)}%</b></p></div><Button variant={offer.bestMatch ? "primary" : "ghost"} onClick={() => onSelect(offer)}>View offer →</Button><small className="nonbinding">Non-binding · no credit pull · simulated</small></article>)}</div><div className="whyMatch"><span>◇</span><div><b>Why these offers?</b><p>Your verified asset value, stable historical cash flow and sub-60% stress LTV met each simulated lender’s credit policy.</p></div></div></main>;
}

function OfferDetails({ analysis, offer, busy, onBack, onAccept }: { analysis: Analysis; offer: Offer; busy: boolean; onBack: () => void; onAccept: () => void }) {
  return <main className="workspace offerDetail"><button className="backLink" onClick={onBack}>← All offers</button><div className="detailHeader"><div className="lenderLogo">{offer.lender.split(" ").map((w) => w[0]).join("")}</div><div><span className="eyebrow darkText">SIMULATED OFFER</span><h1>{offer.lender}</h1><p>Offer ID {offer.id.slice(-14).toUpperCase()}</p></div><span className="statusBadge">BEST MATCH</span></div><section className="summaryCard"><div className="summaryHero"><small>FINANCING AMOUNT</small><strong>{money(offer.amount)}</strong><p><span>{offer.apr}% APR</span><i />{offer.termMonths} months<i />{exactMoney(offer.monthlyPayment)} / month</p></div><div className="summaryRows"><p><span>Collateral</span><b>Pacific Halibut IFQ #{analysis.quotaId.replace("IFQ-", "")}</b></p><p><span>RightMark value</span><b>{money(analysis.estimatedValue)}</b></p><p><span>Stress-tested value</span><b>{money(analysis.stressValue)}</b></p><p><span>Loan-to-value</span><b>{(offer.amount / analysis.stressValue * 100).toFixed(1)}%</b></p><p><span>RightMark platform fee</span><b>{money(offer.amount * 0.01)} (1%)</b></p></div><div className="qualified"><h3>Why you qualified</h3>{["Verified ownership", "Strong risk-adjusted asset value", "Stable historical cash flow", "Acceptable regulatory risk", "Loan below recommended LTV"].map((item) => <span key={item}>✓ {item}</span>)}</div><div className="legalNotice"><b>Simulation only</b><p>No real financial transaction, credit pull, application, or asset lien occurs. Terms are illustrative and non-binding.</p></div><Button onClick={onAccept} disabled={busy}>{busy ? "Recording simulated match…" : "Accept demo offer →"}</Button></section></main>;
}

function Success({ match, offer, onRestart }: { match: Match; offer: Offer; onRestart: () => void }) {
  return <main className="successPage"><div className="successMark">✓<i /></div><span className="eyebrow darkText">SIMULATED MATCH COMPLETE</span><h1>{money(match.amount)} financing matched.</h1><p>North Shore Fisheries keeps its Pacific Halibut IFQ while exploring a new path to equipment capital.</p><section className="successReceipt"><div><small>BUSINESS RECEIVES</small><b>{money(match.amount)}</b><span>Simulated working capital</span></div><div><small>ASSET RETAINED</small><b>Pacific Halibut IFQ</b><span>RightMark value $142,600</span></div><div className="fee"><small>RIGHTMARK REVENUE</small><b>{money(match.platformFee)}</b><span>1% potential platform fee</span></div></section><section className="impactCallout"><span>THE IMPACT</span><h2>Capital access without giving up a valuable right.</h2><p>Instead of selling an economically productive asset, this business can potentially fund repairs and continue operating while retaining ownership.</p></section><div className="successActions"><Button onClick={onRestart}>Analyze another asset</Button><Button variant="ghost" onClick={() => window.print()}>Print demo summary</Button></div><p className="matchId">Demo match ID: {match.id}</p></main>;
}
