"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import Image from "next/image";
import { calculateValuation, DEMO_ASSET, DEMO_MARKET, scaleAssetModel, type MarketData, type RiskLevel } from "../lib/rightmark";
import type { PublicHolding } from "../lib/public-data";
import { applyRegulatoryShock } from "../lib/valuationEngine";
import { SAMPLE_IFQ_DOCUMENT, SAMPLE_REGULATION } from "../data/mockDocuments";
import { explainValuation, generateStressScenario, requestRightMarkIntelligence, type IntelligenceAction, type IntelligenceResult } from "../services/aiService";

gsap.registerPlugin(ScrollTrigger, useGSAP);

type Screen = "landing" | "intelligence" | "add" | "verify" | "dashboard" | "stress" | "market" | "details" | "success";
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
      fetch("/api/stress", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ market, annualGrossValue: analysis?.holding.estimatedGrossHarvestValue, referencePrice: analysis?.holding.weightedPricePerLb }) })
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
      setAnalysis(data.analysis); setValuation(data.analysis); setMarket(data.analysis.market); setTimeout(() => navigate("dashboard"), 450);
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
  const stepIndex = ({ landing: 0, intelligence: 0, add: 0, verify: 0, dashboard: 1, stress: 2, market: 3, details: 3, success: 3 } as Record<Screen, number>)[screen];

  return <div className="app-shell">
    <header className="nav"><button className="brandButton" onClick={() => navigate("landing")} aria-label="RightMark home"><Brand /></button><span className="navEdition">RIGHTS INTELLIGENCE / 2026</span><button className={screen === "intelligence" ? "intelligenceNav active" : "intelligenceNav"} onClick={() => navigate("intelligence")}>Intelligence workspace</button><div className="navSteps">{steps.map((step, i) => <span className={i <= stepIndex && screen !== "landing" ? "active" : ""} key={step}><i>{i + 1}</i>{step}</span>)}</div><span className="demoPill"><i /> LIVE PUBLIC DATA</span></header>
    {error && <div className="errorBar">{error}<button onClick={() => setError("")}>×</button></div>}

    {screen === "landing" && <PremiumLanding market={market} onAnalyze={() => navigate("add")} onIntelligence={() => navigate("intelligence")} onDemo={() => analyze(true)} />}
    {screen === "intelligence" && <IntelligenceStudio market={market} analysis={analysis} onOpenModel={() => analysis ? navigate("dashboard") : analyze(true)} />}
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

function PremiumLanding({ market, onAnalyze, onIntelligence, onDemo }: { market: MarketData; onAnalyze: () => void; onIntelligence: () => void; onDemo: () => void }) {
  const root = useRef<HTMLElement>(null);
  const [perspective, setPerspective] = useState(0);

  useGSAP(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) return;

    const intro = gsap.timeline({ defaults: { ease: "power3.out" } });
    intro
      .from(".taste-hero-copy > *", { y: 42, opacity: 0, duration: 0.9, stagger: 0.08 })
      .from(".taste-hero-visual", { clipPath: "inset(0 0 100% 0)", scale: 1.08, duration: 1.25 }, "-=0.72");

    gsap.fromTo(".reveal-word", { opacity: 0.12, y: 18 }, { opacity: 1, y: 0, stagger: 0.035, ease: "none", scrollTrigger: { trigger: ".technology-statement", start: "top 78%", end: "bottom 42%", scrub: 1.2 } });
    const media = gsap.matchMedia();
    media.add("(min-width: 900px)", () => {
      ScrollTrigger.create({ trigger: ".technology-split", start: "top 12%", end: "bottom 82%", pin: ".technology-copy", pinSpacing: false });
    });
    return () => media.revert();
  }, { scope: root });

  const signals = [
    `NOAA ${new Date().getFullYear()} holder records`,
    `$${market.fishPrice.toFixed(2)} weighted price basis`,
    `$${market.fuelCost.toFixed(3)} EIA diesel per gallon`,
    `${Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(market.halibutAllocationLb + market.sablefishAllocationLb)} allocation tracked`,
  ];
  const perspectives = [
    { role: "Owner-operator perspective", quote: "Show me the public record, what the right may support, and exactly what still needs verification." },
    { role: "Specialty lender perspective", quote: "Give me an explainable collateral view with regulatory restrictions, downside, and source provenance attached." },
    { role: "Portfolio risk perspective", quote: "Translate new rules into structured shocks before a slow-moving covenant report surfaces the problem." },
  ];

  return <main ref={root} className="taste-landing overflow-x-hidden w-full max-w-full">
    <section className="taste-hero">
      <div className="taste-hero-copy">
        <p className="taste-kicker">RightMark Intelligence</p>
        <h1 className="max-w-6xl w-full">AI understands the <span className="inline-photo" aria-hidden="true" /> asset. Finance determines the dollars.</h1>
        <p className="taste-lede">RightMark reads obscure commercial rights, public records, and regulations, then passes verified facts into transparent financial models built for underwriting.</p>
        <div className="heroActions">
          <Button onClick={onIntelligence}>Open RightMark Intelligence</Button>
          <Button variant="dark" onClick={onDemo}>Explore a live record</Button>
        </div>
        <p className="hero-proof">AI interpretation and deterministic finance, clearly separated at every step.</p>
      </div>
      <div className="taste-hero-visual js-media">
        <Image src="https://picsum.photos/seed/alaska-commercial-harbor/1400/1600" alt="Commercial vessel at an Alaskan harbor" fill priority sizes="(max-width: 820px) 100vw, 46vw" unoptimized />
        <div className="visual-wash" />
        <div className="visual-caption"><span>RightMark intelligence</span><p>Public evidence, species-level modeling, and clear risk context in one decision surface.</p></div>
      </div>
    </section>

    <section className="signal-marquee" aria-label="Current public market signals">
      <div className="marquee-track">{[...signals, ...signals].map((signal, index) => <span key={`${signal}-${index}`}><i />{signal}</span>)}</div>
    </section>

    <section className="taste-interest">
      <div className="chapter-heading">
        <p>See the asset clearly</p>
        <h2>A complete record, not another black box.</h2>
        <span>Every output separates sourced evidence from assumptions and indicative scenarios.</span>
      </div>
      <div className="taste-bento">
        <article className="bento-primary">
          <div><span className="card-wordmark">RM</span><p>Complete public record</p></div>
          <h3>One holder ID. Every matching quota-share line.</h3>
          <p>Aggregate halibut and sablefish holdings across species, area, vessel category, block, and serial-group records.</p>
          <div className="record-lines" aria-hidden="true"><i /><i /><i /><i /><i /></div>
        </article>
        <article className="bento-secondary">
          <p>Explainable valuation</p>
          <h3>Follow every input to the modeled value.</h3>
          <div className="formula"><span>Public record</span><b>+</b><span>Market context</span><b>−</b><span>Risk</span></div>
        </article>
        <article className="bento-tertiary">
          <p>Interactive downside</p>
          <h3>Stress catch, price, fuel, and regulatory exposure.</h3>
          <div className="mini-bars" aria-hidden="true">{[58, 72, 49, 86, 68, 94, 80].map((height) => <i style={{ height: `${height}%` }} key={height} />)}</div>
        </article>
      </div>
    </section>

    <section className="technology-split">
      <div className="technology-copy">
        <p>One intelligence layer</p>
        <h2 className="technology-statement">{"AI interprets reality. Finance turns it into numbers.".split(" ").map((word, index) => <span className="reveal-word" key={`${word}-${index}`}>{word} </span>)}</h2>
        <Button onClick={onIntelligence}>Enter the intelligence workspace</Button>
      </div>
      <div className="technology-flow">
        <article><span>01 / INTERPRET</span><h3>Document and registry intelligence</h3><p>Classifies a commercial right, extracts its identifier, and surfaces transfer or eligibility restrictions from the available record.</p><small>AI ANALYSIS</small></article>
        <article><span>02 / VERIFY</span><h3>Authoritative public connections</h3><p>Matches fishing quota, medallion, spectrum, and water-linked identifiers against current government data endpoints.</p><small>LIVE SOURCE MATCH</small></article>
        <article><span>03 / CALCULATE</span><h3>Deterministic financial engine</h3><p>Uses immutable formulas for value, stress value, capacity, coverage, payments, and regulatory shock propagation.</p><small>FINANCIAL MODEL CALCULATION</small></article>
        <article><span>04 / MONITOR</span><h3>Sentinel portfolio intelligence</h3><p>Explains emerging regulatory, liquidity, and collateral risks without rewriting the underlying financial values.</p><small>AI EXPLANATION</small></article>
      </div>
    </section>

    <section className="asset-accordion-section">
      <div className="chapter-heading light-heading">
        <p>Built beyond conventional collateral</p>
        <h2>Scarce rights deserve modern financial infrastructure.</h2>
      </div>
      <div className="asset-accordion">
        <article className="active"><div className="accordion-index">Fishing quotas</div><div className="accordion-content"><h3>Federal catch and quota-share rights</h3><p>Live coverage across every current Alaska IFQ NMFS ID, with species-specific conversion and market context.</p><button onClick={onAnalyze}>Open the lookup</button></div></article>
        <article><div className="accordion-index">Water rights</div><div className="accordion-content"><h3>Transferable diversion entitlements</h3><p>A future RightMark market for scarce, regulated water access.</p><span>Research track</span></div></article>
        <article><div className="accordion-index">Mobility rights</div><div className="accordion-content"><h3>Regulated medallions and permits</h3><p>Structured records for rights that underpin local operating businesses.</p><span>Research track</span></div></article>
        <article><div className="accordion-index">Spectrum rights</div><div className="accordion-content"><h3>Licensed frequency allocations</h3><p>Decision infrastructure for high-scarcity communications assets.</p><span>Research track</span></div></article>
      </div>
    </section>

    <section className="taste-desire">
      <div className="desire-media js-media"><Image src="https://picsum.photos/seed/north-pacific-workboat/1800/1200" alt="Working vessel on cold northern water" fill sizes="(max-width: 820px) 100vw, 55vw" unoptimized /></div>
      <div className="desire-copy">
        <p>Designed for decisions</p>
        <h2>From a public identifier to a defensible capital view.</h2>
        <div className="process-list">
          <article><span>Match</span><p>Find the full holder record across the current NOAA source file.</p></article>
          <article><span>Model</span><p>Apply species, area, price, energy, and regulatory assumptions transparently.</p></article>
          <article><span>Stress</span><p>See how downside conditions change value and indicative capacity.</p></article>
        </div>
      </div>
    </section>

    <section className="perspective-section">
      <div className="perspective-label"><p>Designed around real underwriting questions</p><span>{String(perspective + 1).padStart(2, "0")} / {String(perspectives.length).padStart(2, "0")}</span></div>
      <div className="perspective-carousel" aria-live="polite">
        <blockquote>“{perspectives[perspective].quote}”</blockquote>
        <div><span>{perspectives[perspective].role}</span><nav aria-label="Change perspective"><button onClick={() => setPerspective((perspective - 1 + perspectives.length) % perspectives.length)} aria-label="Previous perspective">Previous</button><button onClick={() => setPerspective((perspective + 1) % perspectives.length)} aria-label="Next perspective">Next</button></nav></div>
      </div>
    </section>

    <section className="taste-action">
      <div>
        <p>Start with a public record</p>
        <h2>Know what the right could support.</h2>
      </div>
      <div className="action-buttons"><Button onClick={onIntelligence}>Open RightMark Intelligence</Button><button className="text-action" onClick={onAnalyze}>Use the focused NMFS lookup</button><button className="text-action" onClick={onDemo}>View the live example</button></div>
    </section>
  </main>;
}

type RegistryKind = "fishing" | "medallion" | "spectrum" | "water";
type RegistryRecord = { type: RegistryKind; identifier: string; name: string; owner: string; status: string; agency: string; geography: string; expiration: string; restrictions: string; amount: string; recordCount?: number };

const registryOptions: Array<{ type: RegistryKind; label: string; example: string; note: string }> = [
  { type: "fishing", label: "Fishing quota", example: "NMFS-43983", note: "NOAA 2026 IFQ records" },
  { type: "medallion", label: "Taxi medallion", example: "4C21", note: "NYC TLC authorized vehicles" },
  { type: "spectrum", label: "Spectrum license", example: "WQVF475", note: "FCC ULS 3650 locations" },
  { type: "water", label: "Water-linked record", example: "USGS-09296800", note: "USGS monitoring location" },
];

function IntelligenceStudio({ market, analysis, onOpenModel }: { market: MarketData; analysis: Analysis | null; onOpenModel: () => void }) {
  const [tab, setTab] = useState<"scanner" | "regulation" | "shock" | "underwriting" | "sentinel">("scanner");
  const [registryType, setRegistryType] = useState<RegistryKind>("fishing");
  const [identifier, setIdentifier] = useState("NMFS-43983");
  const [documentText, setDocumentText] = useState(SAMPLE_IFQ_DOCUMENT.trim());
  const [regulationText, setRegulationText] = useState(SAMPLE_REGULATION.trim());
  const [registry, setRegistry] = useState<RegistryRecord | null>(null);
  const [source, setSource] = useState<{ label: string; url: string; live: boolean } | null>(null);
  const [intelligence, setIntelligence] = useState<IntelligenceResult | null>(null);
  const [secondaryIntelligence, setSecondaryIntelligence] = useState<IntelligenceResult | null>(null);
  const [scanStage, setScanStage] = useState(0);
  const [working, setWorking] = useState(false);
  const [studioError, setStudioError] = useState("");
  const [requestedAmount, setRequestedAmount] = useState(50000);
  const [shockMarket, setShockMarket] = useState<MarketData>(market);
  const [shockModel, setShockModel] = useState(calculateValuation(market));
  const [question, setQuestion] = useState("");
  const [chatAnswer, setChatAnswer] = useState<IntelligenceResult | null>(null);

  const context = useMemo(() => ({
    assetType: registry?.name ?? "Fishing quota",
    identifier: registry?.identifier ?? analysis?.quotaId ?? identifier,
    owner: registry?.owner ?? analysis?.owner,
    estimatedValue: analysis?.estimatedValue ?? shockModel.estimatedValue,
    stressValue: analysis?.stressValue ?? shockModel.stressValue,
    borrowingPower: analysis?.borrowingPower ?? shockModel.borrowingPower,
    score: analysis?.score ?? shockModel.score,
    annualCashFlow: analysis?.annualCashFlow ?? DEMO_ASSET.annualCashFlow,
    requestedAmount,
    coverage: requestedAmount > 0 ? (analysis?.annualCashFlow ?? DEMO_ASSET.annualCashFlow) / Math.max(1, requestedAmount * 0.11) : 0,
  }), [analysis, identifier, registry, requestedAmount, shockModel]);

  function chooseRegistry(type: RegistryKind) {
    const option = registryOptions.find((item) => item.type === type) ?? registryOptions[0];
    setRegistryType(type); setIdentifier(option.example); setRegistry(null); setSource(null); setIntelligence(null); setStudioError("");
    if (type === "fishing") setDocumentText(SAMPLE_IFQ_DOCUMENT.trim());
    else setDocumentText(`${option.label.toUpperCase()} PUBLIC RECORD\nIdentifier: ${option.example}\nTransfer and collateral treatment remain subject to the issuing agency and current registry data.`);
  }

  async function run(action: IntelligenceAction, input: string, nextContext = context) {
    return requestRightMarkIntelligence(action, input, nextContext);
  }

  async function scanRecord() {
    setWorking(true); setStudioError(""); setRegistry(null); setSource(null); setIntelligence(null); setScanStage(1);
    const stageTimer = window.setInterval(() => setScanStage((current) => Math.min(4, current + 1)), 420);
    try {
      const response = await fetch("/api/registry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: registryType, identifier }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The public registry could not be reached.");
      setRegistry(data.registry); setSource(data.source);
      const result = await run("scan", `${documentText}\n\nAUTHORITATIVE REGISTRY MATCH:\n${JSON.stringify(data.registry)}`, { ...context, assetType: data.registry.name, identifier: data.registry.identifier, owner: data.registry.owner });
      setIntelligence(result); setScanStage(5);
    } catch (reason) { setStudioError(reason instanceof Error ? reason.message : "The record could not be analyzed."); }
    finally { window.clearInterval(stageTimer); setWorking(false); }
  }

  async function interpretRegulation() {
    setWorking(true); setStudioError(""); setSecondaryIntelligence(null);
    try {
      const [summary, eligibility] = await Promise.all([run("regulation", regulationText), run("eligibility", regulationText)]);
      setIntelligence(summary); setSecondaryIntelligence(eligibility);
    } catch { setStudioError("The regulation could not be interpreted."); }
    finally { setWorking(false); }
  }

  function calculateShock(catchChange: number, priceChange: number, fuelChange: number) {
    const nextMarket = applyRegulatoryShock(market, catchChange, priceChange, fuelChange);
    const nextModel = analysis ? scaleAssetModel(analysis.holding.estimatedGrossHarvestValue, analysis.holding.weightedPricePerLb, nextMarket) : calculateValuation(nextMarket);
    setShockMarket(nextMarket); setShockModel(nextModel); return nextModel;
  }

  async function interpretShock(text = regulationText) {
    setWorking(true); setStudioError(""); setSecondaryIntelligence(null);
    try {
      const result = await run("shock", text);
      const catchChange = Number(result.structured.allowableCatchChange ?? result.structured.catchChange ?? 0);
      const priceChange = Number(result.structured.priceChange ?? 0);
      const fuelChange = Number(result.structured.fuelChange ?? 0);
      calculateShock(catchChange, priceChange, fuelChange); setIntelligence(result);
    } catch { setStudioError("The announcement could not be converted into a financial shock."); }
    finally { setWorking(false); }
  }

  async function applyScenario(label: "mild" | "severe" | "positive") {
    const result = generateStressScenario(label);
    calculateShock(Number(result.structured.catchChange), Number(result.structured.priceChange), Number(result.structured.fuelChange));
    setIntelligence(result);
  }

  async function runUnderwriting() {
    setWorking(true); setStudioError("");
    try {
      const [match, summary] = await Promise.all([run("lender-match", `Match lenders for a ${money(requestedAmount)} request.`), run("underwriting", `Generate the underwriting summary for a ${money(requestedAmount)} request.`)]);
      setIntelligence(match); setSecondaryIntelligence(summary);
    } catch { setStudioError("The underwriting analysis could not be completed."); }
    finally { setWorking(false); }
  }

  async function runSentinel(action: "sentinel" | "portfolio" | "anomaly" = "sentinel") {
    setWorking(true); setStudioError("");
    const prompt = action === "anomaly" ? "Detect an anomalous 14% collateral decline and a new transfer restriction." : action === "portfolio" ? "Which simulated loans are most exposed to regulatory changes?" : "Monitor collateral coverage, regulation, and liquidity for this simulated loan.";
    try { setIntelligence(await run(action, prompt)); setSecondaryIntelligence(null); }
    catch { setStudioError("Portfolio intelligence is temporarily unavailable."); }
    finally { setWorking(false); }
  }

  async function askQuestion(event: React.FormEvent) {
    event.preventDefault(); if (!question.trim()) return;
    setWorking(true);
    try { setChatAnswer(await run("chat", question)); setQuestion(""); }
    catch { setStudioError("RightMark could not answer that question."); }
    finally { setWorking(false); }
  }

  const baseline = analysis ? analysis : calculateValuation(market);
  const tabs = [{ id: "scanner", label: "Asset scanner" }, { id: "regulation", label: "Regulation" }, { id: "shock", label: "Shock lab" }, { id: "underwriting", label: "Underwriting" }, { id: "sentinel", label: "Sentinel" }] as const;

  return <main className="intelligenceStudio">
    <section className="studioHero"><div><span className="studioKicker">RightMark Intelligence</span><h1>Understand the right.<br/><em>Then underwrite it.</em></h1><p>A connected workspace for public-record verification, commercial-right interpretation, regulatory risk, financial stress, and capital decisions.</p></div><div className="studioMode"><span><i /> AI MODE: {intelligence?.mode ?? "DEMO"}</span><p>Live public registries<br/>Deterministic finance<br/>Explainable analysis</p></div></section>
    <nav className="studioTabs" aria-label="Intelligence capabilities">{tabs.map((item, index) => <button className={tab === item.id ? "active" : ""} onClick={() => { setTab(item.id); setStudioError(""); setIntelligence(null); setSecondaryIntelligence(null); }} key={item.id}><i>{String(index + 1).padStart(2, "0")}</i>{item.label}</button>)}</nav>
    {studioError && <div className="studioError">{studioError}</div>}

    {tab === "scanner" && <section className="studioGrid">
      <div className="studioControl"><div className="sectionMarker"><span>01</span><p>Select a rights registry</p></div><div className="registryChoices">{registryOptions.map((option) => <button className={registryType === option.type ? "active" : ""} onClick={() => chooseRegistry(option.type)} key={option.type}><b>{option.label}</b><span>{option.note}</span></button>)}</div><label className="studioField">Public identifier<input value={identifier} onChange={(event) => setIdentifier(event.target.value)} /><small>Try {registryOptions.find((item) => item.type === registryType)?.example}</small></label><label className="studioField">Document or permit text<textarea rows={8} value={documentText} onChange={(event) => setDocumentText(event.target.value)} /></label><label className="fileDrop">Attach a text document<input type="file" accept=".txt,.md,.csv,.json,.pdf" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; setDocumentText(file.type === "application/pdf" ? `${file.name}\nPDF attached. Text extraction requires live document processing; the public identifier will still be verified.` : await file.text()); }} /><span>TXT, CSV, JSON, MD, or PDF</span></label><Button onClick={scanRecord} disabled={working}>{working ? "Scanning public sources" : "Scan and verify record"}</Button></div>
      <div className="studioOutput">{working && <div className="scanSequence"><span className="scanBeam" />{["Reading supplied material", "Classifying the right", "Matching the authoritative registry", "Extracting restrictions", "Preparing the underwriting record"].map((item, index) => <p className={scanStage > index ? "done" : scanStage === index ? "current" : ""} key={item}><i>{scanStage > index ? "Done" : String(index + 1).padStart(2, "0")}</i>{item}</p>)}</div>}{registry && <RegistryPanel registry={registry} source={source} />}{intelligence && <AIResultPanel result={intelligence} />}{!working && !registry && <StudioEmpty number="01" title="A universal front door for commercial rights." body="Choose a registry, use the real example identifier, and RightMark will match the government record before AI explains it." />}</div>
    </section>}

    {tab === "regulation" && <section className="studioGrid"><div className="studioControl"><div className="sectionMarker"><span>02</span><p>Paste a rule, permit condition, or announcement</p></div><label className="studioField">Regulatory source text<textarea rows={16} value={regulationText} onChange={(event) => setRegulationText(event.target.value)} /></label><div className="buttonRow"><Button onClick={interpretRegulation} disabled={working}>{working ? "Interpreting" : "Analyze restrictions"}</Button><button className="plainButton" onClick={() => setRegulationText(SAMPLE_REGULATION.trim())}>Restore sample</button></div></div><div className="studioOutput">{intelligence ? <><AIResultPanel result={intelligence} />{secondaryIntelligence && <AIResultPanel result={secondaryIntelligence} />}</> : <StudioEmpty number="02" title="Regulation becomes structured risk." body="The interpretation layer identifies transfer rules, eligible-buyer limits, approval conditions, expiration terms, and the financing impact." />}</div></section>}

    {tab === "shock" && <section className="studioGrid"><div className="studioControl"><div className="sectionMarker"><span>03</span><p>Regulatory shock simulator</p></div><label className="studioField">Government announcement<textarea rows={9} value={regulationText} onChange={(event) => setRegulationText(event.target.value)} /></label><Button onClick={() => interpretShock()} disabled={working}>{working ? "Interpreting event" : "Interpret and apply shock"}</Button><div className="scenarioPresets"><span>AI-generated scenarios</span><button onClick={() => applyScenario("mild")}>Mild downturn</button><button onClick={() => applyScenario("severe")}>Severe shock</button><button onClick={() => applyScenario("positive")}>Positive scenario</button></div></div><div className="studioOutput"><div className="modelComparison"><span className="calculationBadge">Financial Model Calculation</span><div><p><small>BEFORE EVENT</small><b>{money(baseline.estimatedValue)}</b><span>{money(baseline.borrowingPower)} capacity</span></p><i>to</i><p className="after"><small>AFTER EVENT</small><b>{money(shockModel.estimatedValue)}</b><span>{money(shockModel.borrowingPower)} capacity</span></p></div><footer><span>Catch basis {shockMarket.allowableCatchPercent}%</span><span>Price ${shockMarket.fishPrice.toFixed(2)}/lb</span><span>Fuel ${shockMarket.fuelCost.toFixed(2)}/gal</span></footer></div>{intelligence ? <AIResultPanel result={intelligence} /> : <StudioEmpty number="03" title="Language in. Model variables out." body="AI interprets the announcement. The financial engine independently applies the resulting catch, price, fuel, and risk variables." />}</div></section>}

    {tab === "underwriting" && <section className="studioGrid"><div className="studioControl"><div className="sectionMarker"><span>04</span><p>AI underwriting copilot</p></div><label className="studioField">Requested financing amount<input type="number" min="10000" step="5000" value={requestedAmount} onChange={(event) => setRequestedAmount(Number(event.target.value))} /></label><div className="underwritingFacts"><p><span>Modeled value</span><b>{money(context.estimatedValue)}</b></p><p><span>Stress value</span><b>{money(context.stressValue)}</b></p><p><span>Modeled capacity</span><b>{money(context.borrowingPower)}</b></p><p><span>Risk score</span><b>{context.score}/100</b></p></div><Button onClick={runUnderwriting} disabled={working}>{working ? "Running underwriting" : "Match and underwrite"}</Button><small className="simulationNote">Lender profiles and loan terms are simulated for product demonstration.</small></div><div className="studioOutput">{intelligence ? <><AIResultPanel result={intelligence} />{secondaryIntelligence && <AIResultPanel result={secondaryIntelligence} />}</> : <StudioEmpty number="04" title="A decision memo, not a black box." body="RightMark compares simulated lender criteria, explains fit, and produces an audit-ready underwriting summary without implying approval." />}</div></section>}

    {tab === "sentinel" && <section className="studioGrid"><div className="studioControl"><div className="sectionMarker"><span>05</span><p>Portfolio and covenant intelligence</p></div><div className="sentinelAsset"><span>SIMULATED ACTIVE LOAN</span><h2>RM-FQ-43983</h2><p>Fishing quota collateral</p><div><b>{money(context.requestedAmount)}</b><small>exposure</small><b>{(context.coverage ?? 0).toFixed(2)}x</b><small>coverage</small></div></div><div className="sentinelActions"><button onClick={() => runSentinel("sentinel")}>Run collateral review</button><button onClick={() => runSentinel("anomaly")}>Trigger anomaly</button><button onClick={() => runSentinel("portfolio")}>Ask portfolio question</button></div></div><div className="studioOutput">{intelligence ? <AIResultPanel result={intelligence} /> : <StudioEmpty number="05" title="Risk signals before the next report." body="Monitor collateral value, covenant coverage, market conditions, and regulatory events across a simulated loan portfolio." />}</div></section>}

    <section className="askRightMark"><div><span>Contextual intelligence</span><h2>Ask RightMark about this asset.</h2></div><form onSubmit={askQuestion}><input aria-label="Ask RightMark" placeholder="Why is this asset risky? What changed after the rule?" value={question} onChange={(event) => setQuestion(event.target.value)} /><button disabled={working}>Ask</button></form>{chatAnswer && <div className="chatResponse"><span>AI {chatAnswer.mode}</span><p>{chatAnswer.summary}</p></div>}<button className="openModel" onClick={onOpenModel}>Open the complete financial model</button></section>
  </main>;
}

function RegistryPanel({ registry, source }: { registry: RegistryRecord; source: { label: string; url: string; live: boolean } | null }) {
  return <article className="registryPanel"><header><span><i /> Live public record</span><a href={source?.url} target="_blank" rel="noreferrer">{source?.label ?? "Authoritative source"}</a></header><div className="registryTitle"><small>{registry.identifier}</small><h2>{registry.name}</h2><p>{registry.owner}</p></div><div className="registryFacts">{[["Status", registry.status], ["Agency", registry.agency], ["Geography", registry.geography], ["Record", registry.amount], ["Term", registry.expiration], ["Restrictions", registry.restrictions]].map(([label, value]) => <p key={label}><span>{label}</span><b>{value}</b></p>)}</div></article>;
}

function AIResultPanel({ result }: { result: IntelligenceResult }) {
  return <article className="aiResult"><header><span className="aiBadge">AI Analysis</span><small>{result.mode} / {result.confidence}% confidence</small></header><h2>{result.title}</h2><p className="aiSummary">{result.summary}</p><div className="aiFindings">{result.findings.map((finding) => <p className={finding.tone} key={`${finding.label}-${finding.value}`}><span>{finding.label}</span><b>{finding.value}</b></p>)}</div>{result.risks.length > 0 && <div className="aiRisks"><span>Material considerations</span>{result.risks.map((risk) => <p key={risk}>{risk}</p>)}</div>}<footer>{result.sources.map((item) => <span key={item}>{item}</span>)}</footer></article>;
}

function StudioEmpty({ number, title, body }: { number: string; title: string; body: string }) {
  return <div className="studioEmpty"><span>{number}</span><div><h2>{title}</h2><p>{body}</p></div></div>;
}

export function Landing({ onAnalyze, onDemo }: { onAnalyze: () => void; onDemo: () => void }) {
  return <main><section className="hero"><div className="heroAtmosphere" aria-hidden="true"><i /><i /><i /></div><div className="heroCopy"><div className="heroKicker"><span className="eyebrow">ALTERNATIVE ASSET INTELLIGENCE</span><small>01 — 06</small></div><h1>The operating system for <em>alternative collateral.</em></h1><p>Search every current Alaska IFQ holder ID and turn complete halibut and sablefish records into an auditable capital view—using species- and area-specific NOAA conversion data.</p><div className="heroActions"><Button onClick={onAnalyze}>Analyze any NMFS ID <b>↗</b></Button><Button variant="dark" onClick={onDemo}>Explore the live model <span>⌘</span></Button></div><div className="trustRow"><span><b>01</b> 2,488 NMFS IDs</span><span><b>02</b> 7,112 QS records</span><span><b>03</b> Halibut + sablefish</span></div></div><div className="heroModel"><div className="modelCaption"><span>RIGHTMARK / COLLATERAL VIEW</span><span>REFRESHED LIVE</span></div><div className="terminalCard"><div className="terminalTop"><span><i /> PUBLIC RECORD MATCH</span><small>NMFS 43983 / AK</small></div><div className="terminalValue"><small>MODELED COLLATERAL VALUE</small><strong>$136,255</strong><span>↗ species-specific analysis</span></div><div className="terminalGrid"><div><small>DATASET COVERAGE</small><b>100 <i>%</i></b></div><div><small>PUBLIC RECORDS</small><b>12</b></div></div><div className="sparkBars" aria-label="Illustrative twelve-period value trend">{[34, 44, 39, 56, 51, 68, 61, 75, 72, 86, 82, 94].map((h, i) => <i key={i} style={{ height: `${h}%`, animationDelay: `${i * 55}ms` }} />)}</div><p><b>Alaska IFQ quota share</b><span>All current holder IDs</span></p></div><div className="modelFoot"><span>DATA COVERAGE <b>08 SOURCES</b></span><span>MODEL STATUS <b>ACTIVE</b></span></div></div></section>
    <section className="marketTicker" aria-label="Current public market signals"><span>LIVE SIGNALS</span><p><b>NOAA 2026</b> IFQ HOLDER RECORDS</p><i /><p><b>$8.18</b> IPHC PRICE BENCHMARK</p><i /><p><b>$5.257</b> EIA DIESEL / GAL</p><i /><p><b>23.18M LB</b> FISHERY LIMIT</p></section>
    <section className="assetBand"><div className="assetBandIntro"><span>02</span><p>ASSET COVERAGE</p><h2>Rights with scarcity.<br/><em>Value with context.</em></h2></div><div className="assetList"><article><small>01 / ACTIVE</small><span>◒</span><b>Fishing quotas</b><p>Federal catch and quota-share rights</p></article><article><small>02 / ROADMAP</small><span>≋</span><b>Water rights</b><p>Transferable diversion entitlements</p></article><article><small>03 / ROADMAP</small><span>◆</span><b>Mobility rights</b><p>Regulated medallions and permits</p></article><article><small>04 / ROADMAP</small><span>⌁</span><b>Spectrum rights</b><p>Licensed frequency allocations</p></article></div></section>
    <section className="contentSection"><div className="sectionIntro"><div><span className="eyebrow darkText">THE RIGHTMARK ENGINE</span><small>03 / METHODOLOGY</small></div><h2>From public record<br/>to a decision-ready view.</h2><p>Every output distinguishes sourced facts, model assumptions, and indicative scenarios—so operators and capital providers can see exactly what drives the number.</p></div><div className="engineGrid">{[["01","Match","Find the supplied NMFS identifier in the current NOAA holder dataset."],["02","Enrich","Bring NOAA, IPHC, and EIA signals into one normalized record."],["03","Model","Translate quota units and market conditions into an explainable value."],["04","Stress","Expose downside sensitivity across catch, price, fuel, and regulation."],["05","Size","Calculate risk-adjusted value and an explicit maximum LTV."],["06","Compare","Test indicative capital structures without implying lender approval."]].map(([n,t,d]) => <article key={n}><span>{n}</span><div><h3>{t}</h3><p>{d}</p></div><b>↗</b></article>)}</div></section>
    <section className="impactSection"><div><span className="eyebrow">THE ACCESS GAP</span><h2>Financial infrastructure for overlooked businesses.</h2><p>Large companies hire lawyers, bankers, analysts and specialized consultants. RightMark gives smaller operators a clearer picture of the value recorded in public datasets.</p></div><div className="comparison"><article><small>BEFORE RIGHTMARK</small><p>Asset value <b>Unknown</b></p><p>Borrowing power <b>Unknown</b></p><p>Financing options <b>Limited</b></p></article><article className="after"><small>LIVE EXAMPLE / NMFS 43983</small><p>Modeled value <b>$136,255</b></p><p>Modeled capacity <b>$67,855</b></p><p>NOAA records <b>12 matched</b></p></article></div></section>
  </main>;
}

function AddAsset({ quotaId, setQuotaId, onAnalyze, busy }: { quotaId: string; setQuotaId: (value: string) => void; onAnalyze: () => void; busy: boolean; error: string }) {
  return <main className="workspace"><div className="workspaceHead"><span className="eyebrow darkText">ALL-HOLDER PUBLIC LOOKUP</span><h1>Find any current IFQ record.</h1><p>Search all 2,488 NMFS IDs in NOAA’s 2026 Alaska halibut and sablefish quota-share file.</p></div><div className="assetChoices"><article className="selected"><span>◒</span><b>Halibut + sablefish QS</b><small>7,112 LIVE RECORDS</small></article><article className="disabled"><span>≋</span><b>Water right</b><small>NO LIVE CONNECTOR</small></article><article className="disabled"><span>◆</span><b>Mobility right</b><small>NO LIVE CONNECTOR</small></article><article className="disabled"><span>⌁</span><b>Spectrum license</b><small>NO LIVE CONNECTOR</small></article></div><form className="intakeCard" onSubmit={(event) => { event.preventDefault(); onAnalyze(); }}><div><label htmlFor="quota">NMFS ID</label><p>RightMark aggregates every matching species, area, vessel category, block, and QS unit record.</p></div><input id="quota" inputMode="numeric" value={quotaId} onChange={(e) => setQuotaId(e.target.value)} aria-describedby="quotaHint" /><small id="quotaHint">Examples: 43983 halibut · 1752 sablefish · 1460 mixed holdings. Public lookup does not authenticate the current user.</small><Button type="submit" disabled={busy}>{busy ? "Connecting…" : "Match complete record ↗"}</Button><div className="securityNote">◇ NOAA 2026 public files &nbsp;·&nbsp; All current IDs &nbsp;·&nbsp; No ownership authentication</div></form></main>;
}

function Verification({ checks }: { checks: string[] }) {
  const all = ["2026 NOAA holder dataset reached", "NMFS ID matched across all current records", "Halibut and sablefish holdings aggregated", "Area-specific QS-to-IFQ ratios applied", "Transfer eligibility files checked", "NOAA, IPHC and EIA inputs linked", "Species-specific model assumptions applied"];
  return <main className="verifyPage"><div className="scanOrb"><span>RM</span><i /></div><span className="eyebrow darkText">RIGHTMARK PUBLIC DATA</span><h1>Building the sourced record.</h1><p>Connecting current government, fishery, price and energy signals.</p><div className="checkList">{all.map((label, i) => <div className={i < checks.length ? "done" : i === checks.length ? "running" : ""} key={label}><span>{i < checks.length ? "✓" : i === checks.length ? "↻" : "·"}</span><p>{label}</p><small>{i < checks.length ? "COMPLETE" : i === checks.length ? "PROCESSING" : "QUEUED"}</small></div>)}</div><p className="apiNote">NOAA · IPHC · U.S. Energy Information Administration</p></main>;
}

function Dashboard({ analysis, market, onStress, onFinance, busy }: { analysis: Analysis; market: MarketData; onStress: () => void; onFinance: () => void; busy: boolean }) {
  const aiValuation = explainValuation({ assetType: analysis.name, identifier: analysis.quotaId, owner: analysis.owner, estimatedValue: analysis.estimatedValue, stressValue: analysis.stressValue, borrowingPower: analysis.borrowingPower, score: analysis.score, annualCashFlow: analysis.annualCashFlow });
  return <main className="workspace wide"><div className="dashboardTitle"><div><span className="statusBadge">✓ COMPLETE PUBLIC RECORD MATCHED</span><h1>{analysis.name}</h1><p>{analysis.owner} <i /> NMFS ID {analysis.quotaId} <i /> {analysis.holding.qsUnits.toLocaleString()} QS units</p></div><Button onClick={onFinance} disabled={busy}>{busy ? "Calculating…" : "View indicative terms ↗"}</Button></div><div className="recordNotice"><b>Public record:</b> {analysis.holding.recordCount} holder rows and {analysis.holding.securityRecordCount} serial-group rows; transfer file status: {analysis.holding.transferEligibility}. <b>Asserted-interest file:</b> {analysis.holding.assertedInterestParties.length ? analysis.holding.assertedInterestParties.join(", ") : "no party named on matched serial rows"}. <b>Not authenticated:</b> visitor identity, current control, lien status, transfer approval, or collateral value.</div><div className="metrics"><Metric label="MODELED ASSET VALUE" value={money(analysis.estimatedValue)} note="RightMark estimate, not appraisal" /><Metric label="EST. 2026 IFQ POUNDS" value={Math.round(analysis.holding.estimatedIfqPounds).toLocaleString()} note="QS divided by NOAA area ratio" accent /><Metric label="GROSS HARVEST BASIS" value={money(analysis.holding.estimatedGrossHarvestValue)} note="Published price benchmarks" /><Metric label="MODELED CAPACITY" value={money(analysis.borrowingPower)} note="60% maximum LTV assumption" accent /></div>
    <div className="dashboardBody"><section className="valuationCard"><div className="cardHead"><div><small>COMPLETE SPECIES-SPECIFIC RECORD</small><h2>Sourced inputs, modeled output.</h2></div><span className="sourceBadge"><i /> {market.source}</span></div><div className="speciesBreakdown">{analysis.holding.speciesHoldings.map((item) => <article key={item.species}><div><small>{item.species.toUpperCase()}</small><b>{item.qsUnits.toLocaleString()} QS</b></div><div><small>AREAS / CATEGORIES</small><b>{item.areas.join(", ")} · {item.categories.join(", ")}</b></div><div><small>EST. 2026 IFQ</small><b>{Math.round(item.estimatedIfqPounds).toLocaleString()} lb</b></div><div><small>PRICE BASIS</small><b>${item.benchmarkPricePerLb.toFixed(2)}/lb</b></div></article>)}</div><div className="valuationRows"><p><span>Quota ownership value<small>{analysis.holding.qsUnits.toLocaleString()} NOAA QS units across {analysis.holding.recordCount} records</small></span><b className="positive">+{money(analysis.breakdown.quotaOwnershipValue)}</b></p><p><span>Expected future cash flow<small>{money(analysis.holding.estimatedGrossHarvestValue)} gross harvest basis</small></span><b className="positive">+{money(analysis.breakdown.futureCashFlow)}</b></p><p><span>Scarcity premium<small>Limited issuance and transfer supply</small></span><b className="positive">+{money(analysis.breakdown.scarcityPremium)}</b></p><p><span>Regulatory risk adjustment<small>Transfer and allowable-catch exposure</small></span><b className="negative">−{money(Math.abs(analysis.breakdown.regulatoryAdjustment))}</b></p><p><span>Market volatility adjustment<small>EIA diesel ${market.fuelCost.toFixed(3)}/gal + price variance</small></span><b className="negative">−{money(Math.abs(analysis.breakdown.marketAdjustment))}</b></p><p className="valuationTotal"><span>MODELED RIGHTMARK VALUE</span><b>{money(analysis.estimatedValue)}</b></p></div></section>
      <aside className="riskCard"><small>DOWNSIDE READINESS</small><h2>{money(analysis.stressValue)}</h2><p>Modeled stress value after applying the current risk factor.</p><div className="riskScale"><i /><i /><i className="marker" /><i /><i /></div><div className="scaleLabels"><span>Lower risk</span><span>Higher risk</span></div><Button variant="dark" onClick={onStress}>Run interactive stress test →</Button><div className="dataSource"><b>Current public signals</b><p>Halibut: {market.halibutLandedPercent}% of {Intl.NumberFormat("en-US", { notation: "compact" }).format(market.halibutAllocationLb)} lb landed</p><p>Sablefish: {market.sablefishLandedPercent}% of {Intl.NumberFormat("en-US", { notation: "compact" }).format(market.sablefishAllocationLb)} lb landed</p><p>IPHC mortality: {Intl.NumberFormat("en-US", { notation: "compact" }).format(market.mortalityToDateLb)} lb</p><div className="sourceList">{market.sources.map((source) => <a href={source.url} target="_blank" rel="noreferrer" key={source.url}><i className={source.live ? "on" : ""} />{source.label} ↗</a>)}</div></div></aside></div>
    <section className="modelStrip"><div><small>MODEL LOGIC</small><h3>Every calculated number is labeled.</h3></div><p><span>Modeled asset value</span><b>{money(analysis.estimatedValue)}</b></p><i>×</i><p><span>Risk factor</span><b>0.83</b></p><i>=</i><p><span>Modeled stress value</span><b>{money(analysis.stressValue)}</b></p><i>× 60%</i><p className="highlight"><span>Modeled capacity</span><b>{money(analysis.borrowingPower)}</b></p></section>
    <section className="dashboardAI"><AIResultPanel result={aiValuation} /></section>
  </main>;
}

function Metric({ label, value, note, accent = false }: { label: string; value: string; note: string; accent?: boolean }) { return <article className={accent ? "metric accent" : "metric"}><small>{label}</small><strong>{value}</strong><span>{accent ? "●" : "↗"} {note}</span></article>; }

function StressTest({ market, setMarket, valuation, insight, onBack, onFinance }: { market: MarketData; setMarket: (market: MarketData) => void; valuation: ReturnType<typeof calculateValuation>; insight: string; onBack: () => void; onFinance: () => void }) {
  const set = <K extends keyof MarketData>(key: K, value: MarketData[K]) => setMarket({ ...market, [key]: value });
  const chart = [0.72, 0.76, 0.8, 0.86, 0.91, 0.96, 1, 1.03, 1.07, 1.11, 1.14, 1.18].map((factor) => Math.min(100, Math.max(20, factor * valuation.scenarioFactor * 72)));
  return <main className="workspace wide"><button className="backLink" onClick={onBack}>← Asset dashboard</button><div className="workspaceHead split"><div><span className="eyebrow darkText">INTERACTIVE STRESS TEST</span><h1>What happens if conditions change?</h1><p>Adjust the operating environment and see the underwriting response.</p></div><span className="liveBadge"><i /> MODEL UPDATES LIVE</span></div><div className="stressLayout"><section className="controlCard"><Control label="Allowable catch" value={`${market.allowableCatchPercent}%`} min={50} max={120} step={1} current={market.allowableCatchPercent} onChange={(v) => set("allowableCatchPercent", v)} /><Control label="Weighted species price" value={`$${market.fishPrice.toFixed(2)} / lb`} min={Math.max(.5, valuation.referencePrice * .5)} max={Math.max(3, valuation.referencePrice * 1.5)} step={0.05} current={market.fishPrice} onChange={(v) => set("fishPrice", v)} /><Control label="Fuel costs" value={`$${market.fuelCost.toFixed(2)} / gal`} min={2} max={8} step={0.1} current={market.fuelCost} onChange={(v) => set("fuelCost", v)} /><div className="selectControl"><label htmlFor="risk">Regulatory risk <b>{market.regulatoryRisk}</b></label><div className="riskButtons">{(["Low","Moderate","High"] as RiskLevel[]).map((risk) => <button id={risk === "Low" ? "risk" : undefined} className={market.regulatoryRisk === risk ? "active" : ""} onClick={() => set("regulatoryRisk", risk)} key={risk}>{risk}</button>)}</div></div><button className="resetButton" onClick={() => setMarket({ ...market, allowableCatchPercent: 100, fishPrice: valuation.referencePrice, fuelCost: DEMO_MARKET.fuelCost, regulatoryRisk: "Moderate" })}>↻ Reset holder baseline</button></section>
      <section className="scenarioCard"><div className="cardHead"><div><small>SCENARIO VALUE TRAJECTORY</small><h2>{money(valuation.estimatedValue)}</h2></div><span className={valuation.changePercent < 0 ? "delta negative" : "delta positive"}>{valuation.changePercent >= 0 ? "+" : ""}{valuation.changePercent}%</span></div><div className="barChart">{chart.map((height, i) => <i key={i} className={i === 6 ? "current" : ""} style={{ height: `${height}%` }} />)}</div><div className="chartAxis"><span>Downside</span><span>Current scenario</span><span>Upside</span></div><div className="scenarioMetrics"><Metric label="RISK SCORE" value={`${valuation.score}`} note="out of 100" accent /><Metric label="STRESS-TESTED VALUE" value={money(valuation.stressValue)} note="risk adjusted" /><Metric label="BORROWING POWER" value={money(valuation.borrowingPower)} note="60% max LTV" accent /></div></section></div>
    <section className="insightBox"><span>✦</span><div><small>RIGHTMARK INSIGHT</small><h3>{valuation.changePercent < -2 ? "Downside detected in this scenario." : "The asset remains financeable."}</h3><p>{insight}</p></div><Button onClick={onFinance}>Compare offers →</Button></section>
  </main>;
}

function Control({ label, value, min, max, step, current, onChange }: { label: string; value: string; min: number; max: number; step: number; current: number; onChange: (value: number) => void }) { return <div className="rangeControl"><label>{label}<b>{value}</b></label><input aria-label={label} type="range" min={min} max={max} step={step} value={current} onChange={(e) => onChange(Number(e.target.value))} /><div><span>{min}</span><span>{max}</span></div></div>; }

function Marketplace({ analysis, offers, onBack, onSelect }: { analysis: Analysis; offers: Offer[]; onBack: () => void; onSelect: (offer: Offer) => void }) {
  return <main className="workspace wide"><button className="backLink" onClick={onBack}>← Asset dashboard</button><div className="workspaceHead split"><div><span className="eyebrow darkText">INDICATIVE TERM SCENARIOS</span><h1>Three modeled structures.</h1><p>These calculations are not lender quotes, approvals, or market offers.</p></div><span className="demoPill light">NO LENDER INVOLVED</span></div><div className="assetSummary"><div><small>PUBLIC RECORD</small><b>{analysis.holding.species} QS</b><span>NMFS ID {analysis.quotaId}</span></div><div><small>MODELED VALUE</small><b>{money(analysis.estimatedValue)}</b></div><div><small>MODELED STRESS VALUE</small><b>{money(analysis.stressValue)}</b></div><div className="recommended"><small>MODELED CAPACITY</small><b>{money(analysis.borrowingPower)}</b></div></div><div className="offerGrid">{offers.map((offer) => <article className={offer.bestMatch ? "offerCard best" : "offerCard"} key={offer.id}>{offer.bestMatch && <span className="bestLabel">MODEL FIT</span>}<div className="lenderLogo">{offer.lender.split(" ").map((word) => word[0]).join("")}</div><h2>{offer.lender}</h2><p className="offerAmount">{money(offer.amount)}<small>HYPOTHETICAL PRINCIPAL</small></p><div className="offerTerms"><p><small>ASSUMED APR</small><b>{offer.apr}%</b></p><p><small>TERM</small><b>{offer.termMonths} mo</b></p><p><small>CALC. MONTHLY</small><b>{exactMoney(offer.monthlyPayment)}</b></p><p><small>STRESS LTV</small><b>{analysis.stressValue > 0 ? (offer.amount / analysis.stressValue * 100).toFixed(1) : "—"}%</b></p></div><Button variant={offer.bestMatch ? "primary" : "ghost"} onClick={() => onSelect(offer)}>Inspect scenario →</Button><small className="nonbinding">Illustrative · not a quote · no lender involved</small></article>)}</div><div className="whyMatch"><span>◇</span><div><b>What these scenarios mean</b><p>They demonstrate payment and LTV mechanics using assumed terms. A real offer requires a licensed lender, underwriting, consent, and authenticated records.</p></div></div></main>;
}

function OfferDetails({ analysis, offer, busy, onBack, onAccept }: { analysis: Analysis; offer: Offer; busy: boolean; onBack: () => void; onAccept: () => void }) {
  return <main className="workspace offerDetail"><button className="backLink" onClick={onBack}>← All scenarios</button><div className="detailHeader"><div className="lenderLogo">{offer.lender.split(" ").map((w) => w[0]).join("")}</div><div><span className="eyebrow darkText">INDICATIVE SCENARIO</span><h1>{offer.lender}</h1><p>Scenario ID {offer.id.slice(-14).toUpperCase()}</p></div><span className="statusBadge">MODEL FIT</span></div><section className="summaryCard"><div className="summaryHero"><small>HYPOTHETICAL PRINCIPAL</small><strong>{money(offer.amount)}</strong><p><span>{offer.apr}% assumed APR</span><i />{offer.termMonths} months<i />{exactMoney(offer.monthlyPayment)} / month</p></div><div className="summaryRows"><p><span>Public record</span><b>{analysis.holding.species} QS · NMFS {analysis.quotaId}</b></p><p><span>Modeled value</span><b>{money(analysis.estimatedValue)}</b></p><p><span>Modeled stress value</span><b>{money(analysis.stressValue)}</b></p><p><span>Calculated LTV</span><b>{analysis.stressValue > 0 ? (offer.amount / analysis.stressValue * 100).toFixed(1) : "—"}%</b></p><p><span>Illustrative platform fee</span><b>{money(offer.amount * 0.01)} (1%)</b></p></div><div className="qualified"><h3>Model checks</h3>{["Complete NOAA holder record matched", "2026 area conversion ratios applied", "Current public market inputs", "Regulatory haircut applied", "Scenario below modeled LTV cap"].map((item) => <span key={item}>✓ {item}</span>)}</div><div className="legalNotice"><b>No real offer or ownership authentication</b><p>No lender participated. No transaction, credit pull, application, lien, or transfer occurs. Public holder data does not prove the visitor controls the asset.</p></div><Button onClick={onAccept} disabled={busy}>{busy ? "Recording scenario…" : "Complete illustrative scenario →"}</Button></section></main>;
}

function Success({ analysis, match, onRestart }: { analysis: Analysis; match: Match; onRestart: () => void }) {
  return <main className="successPage"><div className="successMark">✓<i /></div><span className="eyebrow darkText">ILLUSTRATIVE SCENARIO COMPLETE</span><h1>{money(match.amount)} structure modeled.</h1><p>This demonstrates a potential financing structure for the public record associated with NMFS ID {analysis.quotaId}. It is not an offer or transaction.</p><section className="successReceipt"><div><small>HYPOTHETICAL PRINCIPAL</small><b>{money(match.amount)}</b><span>No funds disbursed</span></div><div><small>PUBLIC RECORD</small><b>{analysis.holding.species} QS</b><span>Modeled value {money(analysis.estimatedValue)}</span></div><div className="fee"><small>ILLUSTRATIVE REVENUE</small><b>{money(match.platformFee)}</b><span>1% potential platform fee</span></div></section><section className="impactCallout"><span>THE PRODUCT HYPOTHESIS</span><h2>Better data could expand responsible capital access.</h2><p>A real transaction would require authenticated ownership, lien and transfer checks, complete underwriting, and a licensed lending partner.</p></section><div className="successActions"><Button onClick={onRestart}>Analyze another record</Button><Button variant="ghost" onClick={() => window.print()}>Print scenario summary</Button></div><p className="matchId">Scenario ID: {match.id}</p></main>;
}
