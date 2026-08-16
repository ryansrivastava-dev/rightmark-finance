export type AIMode = "LIVE" | "DEMO";
export type IntelligenceAction = "scan" | "classify" | "regulation" | "eligibility" | "valuation" | "shock" | "capital" | "loan" | "lender-match" | "underwriting" | "portfolio" | "anomaly" | "sentinel" | "chat";

export type IntelligenceFinding = {
  label: string;
  value: string;
  tone: "positive" | "neutral" | "warning" | "negative";
};

export type IntelligenceResult = {
  mode: AIMode;
  action: IntelligenceAction;
  title: string;
  summary: string;
  confidence: number;
  findings: IntelligenceFinding[];
  risks: string[];
  sources: string[];
  structured: Record<string, string | number | boolean | string[]>;
};

export type FinancialContext = {
  assetType?: string;
  identifier?: string;
  owner?: string;
  estimatedValue?: number;
  stressValue?: number;
  borrowingPower?: number;
  score?: number;
  requestedAmount?: number;
  annualCashFlow?: number;
  coverage?: number;
};

const clean = (value: unknown) => String(value ?? "").trim();
const money = (value = 0) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
const lower = (value: unknown) => clean(value).toLowerCase();

function stableConfidence(input: string, floor = 84, range = 12) {
  const score = [...input].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return floor + (score % range);
}

function result(action: IntelligenceAction, input: string, fields: Omit<IntelligenceResult, "mode" | "action" | "confidence"> & { confidence?: number }): IntelligenceResult {
  return { mode: "DEMO", action, confidence: fields.confidence ?? stableConfidence(input), ...fields };
}

export function classifyCommercialRight(input: string): IntelligenceResult {
  const text = lower(input);
  const type = /medallion|taxi|tlc/.test(text) ? "Taxi medallion" : /spectrum|frequency|fcc|call sign/.test(text) ? "Spectrum license" : /water|appropriation|diversion|usgs/.test(text) ? "Water-linked right" : "Fishing quota";
  const subtype = type === "Fishing quota" ? "Individual Fishing Quota" : type === "Taxi medallion" ? "Urban operating medallion" : type === "Spectrum license" ? "Wireless authorization" : "Appropriation or diversion record";
  const jurisdiction = type === "Taxi medallion" ? "Municipal" : type === "Water-linked right" ? "State or federal" : "Federal";
  return result("classify", input, {
    title: "Commercial right classified",
    summary: `RightMark Intelligence identified this record as a ${type.toLowerCase()} and selected the ${subtype} analysis path.`,
    findings: [
      { label: "Detected asset type", value: type, tone: "positive" },
      { label: "Subtype", value: subtype, tone: "neutral" },
      { label: "Jurisdiction", value: jurisdiction, tone: "neutral" },
      { label: "Model route", value: `${type} financial model`, tone: "positive" },
    ],
    risks: type === "Fishing quota" ? ["Transfer eligibility", "Annual allocation sensitivity"] : ["Registry-specific transfer rules", "Limited transaction comparables"],
    sources: ["User-supplied text", "RightMark asset taxonomy"],
    structured: { assetType: type, subtype, jurisdiction, modelRoute: `${type} model` },
  });
}

export function analyzeAssetDocuments(input: string, context: FinancialContext = {}): IntelligenceResult {
  const classification = classifyCommercialRight(`${context.assetType ?? ""} ${input}`);
  const identifierMatch = input.match(/(?:NMFS[- ]?|IFQ[- ]?|CALL SIGN[: ]*|MEDALLION[: ]*|USGS[- ])([A-Z0-9-]{3,16})/i);
  const identifier = context.identifier || identifierMatch?.[1] || (classification.structured.assetType === "Fishing quota" ? "43983" : "Registry identifier required");
  const owner = context.owner || (/north shore/i.test(input) ? "North Shore Fisheries LLC" : "Subject to registry verification");
  return result("scan", input + identifier, {
    title: "AI asset analysis complete",
    summary: "The scanner extracted the commercial-right record, classified the asset, and separated document claims from fields that require an authoritative registry match.",
    findings: [
      { label: "Asset", value: String(classification.structured.subtype), tone: "positive" },
      { label: "Identifier", value: identifier, tone: "neutral" },
      { label: "Owner", value: owner, tone: owner.includes("Subject") ? "warning" : "positive" },
      { label: "Issuing agency", value: classification.structured.assetType === "Fishing quota" ? "NOAA Fisheries" : classification.structured.assetType === "Taxi medallion" ? "NYC TLC" : classification.structured.assetType === "Spectrum license" ? "Federal Communications Commission" : "State water agency / USGS-linked record", tone: "neutral" },
      { label: "Transferability", value: "Restricted", tone: "warning" },
      { label: "Potential collateral eligibility", value: "Likely eligible with restrictions", tone: "positive" },
    ],
    risks: ["Government approval may be required", "Ownership and lien status require current verification", "Qualified buyer pool may be limited"],
    sources: ["Uploaded or pasted document", "RightMark asset taxonomy", "Connected public registry"],
    structured: { ...classification.structured, identifier, owner, transferability: "restricted", collateralEligibility: "eligible-with-restrictions" },
  });
}

export function summarizeRegulation(input: string): IntelligenceResult {
  const text = lower(input);
  const catchChange = Number(text.match(/(?:decline|decrease|reduced?|fall)[^\d]{0,18}(\d+(?:\.\d+)?)\s*%/)?.[1] ?? 0);
  const approval = /approval|consent|authorize/.test(text);
  const qualified = /eligible|qualified|participant/.test(text);
  const expiration = /expir|renew/.test(text);
  const restrictions = [approval && "Government approval required for transfer", qualified && "Buyer must meet eligibility requirements", expiration && "Renewal or expiration conditions apply", catchChange > 0 && `Allowable catch reduction of ${catchChange}% detected`].filter(Boolean) as string[];
  return result("regulation", input, {
    title: "Regulation interpreted",
    summary: restrictions.length ? `The text creates a restricted transfer path with ${restrictions.length} material financing consideration${restrictions.length === 1 ? "" : "s"}.` : "No explicit prohibition was detected, but the source text still requires legal and agency verification.",
    findings: [
      { label: "Impact on financing", value: catchChange >= 15 || restrictions.length >= 3 ? "High" : "Moderate", tone: catchChange >= 15 ? "negative" : "warning" },
      { label: "Transferability", value: approval || qualified ? "Restricted" : "Not explicitly restricted", tone: approval || qualified ? "warning" : "neutral" },
      { label: "Collateral recommendation", value: "Eligible with restrictions", tone: "positive" },
      { label: "Detected catch change", value: catchChange ? `-${catchChange}%` : "None stated", tone: catchChange ? "negative" : "neutral" },
    ],
    risks: restrictions.length ? restrictions : ["Ambiguous source language", "Agency practice may add conditions not stated in the excerpt"],
    sources: ["Supplied regulation text", "RightMark restriction taxonomy"],
    structured: { transferability: approval || qualified ? "restricted" : "open", governmentApprovalRequired: approval, eligibleBuyerRestriction: qualified, expirationConditions: expiration, allowableCatchChange: catchChange ? -catchChange : 0, regulatoryRisk: catchChange >= 15 ? 78 : 56 },
  });
}

export function assessCollateralEligibility(input: string, context: FinancialContext = {}): IntelligenceResult {
  const regulation = summarizeRegulation(input);
  const eligible = regulation.structured.transferability !== "non-transferable";
  return result("eligibility", input, {
    title: eligible ? "Collateral eligible with restrictions" : "Valuation only",
    summary: eligible ? "RightMark Intelligence found no explicit rule preventing collateral consideration. A default transfer would still require registry, lien, and government-approval review." : "The detected restrictions prevent a reliable collateral enforcement path.",
    findings: [
      { label: "Economic value", value: context.estimatedValue ? money(context.estimatedValue) : "Model required", tone: context.estimatedValue ? "positive" : "neutral" },
      { label: "Transfer mechanism", value: eligible ? "Present with conditions" : "Not established", tone: eligible ? "warning" : "negative" },
      { label: "Eligible buyer pool", value: "Limited", tone: "warning" },
      { label: "Regulatory complexity", value: "Moderate", tone: "warning" },
    ],
    risks: regulation.risks,
    sources: [...regulation.sources, "Deterministic eligibility rules"],
    structured: { eligible, confidence: stableConfidence(input, 86, 8), requiresApproval: regulation.structured.governmentApprovalRequired },
  });
}

export function explainValuation(context: FinancialContext): IntelligenceResult {
  const input = JSON.stringify(context);
  const value = context.estimatedValue ?? 0;
  const stress = context.stressValue ?? 0;
  const discount = value > 0 ? Math.round((1 - stress / value) * 100) : 0;
  return result("valuation", input, {
    title: "AI valuation analyst",
    summary: `The ${money(value)} modeled value is supported by scarcity and expected operating cash flow. A ${discount}% stress discount reflects transfer restrictions, market volatility, and regulatory sensitivity.`,
    findings: [
      { label: "Modeled market value", value: money(value), tone: "positive" },
      { label: "Stress-tested value", value: money(stress), tone: "warning" },
      { label: "Modeled borrowing capacity", value: money(context.borrowingPower), tone: "positive" },
      { label: "Valuation confidence", value: `${stableConfidence(input, 86, 8)}%`, tone: "positive" },
    ],
    risks: ["Transfer restrictions reduce liquidity", "Regulatory changes can alter future cash flow", "Comparable transaction data is asset-specific"],
    sources: ["RightMark deterministic financial model", "Public registry record", "Current market inputs"],
    structured: { value, stressValue: stress, borrowingPower: context.borrowingPower ?? 0, stressDiscountPercent: discount, positiveDrivers: ["Scarcity", "Historical cash flow", "Limited issuance"], negativeDrivers: ["Transfer restrictions", "Regulatory uncertainty"] },
  });
}

export function generateRiskFactors(context: FinancialContext): IntelligenceResult {
  return result("sentinel", JSON.stringify(context), {
    title: "RightMark Sentinel",
    summary: "The asset remains inside the monitored range, but regulation and liquidity are the leading forward-looking risks.",
    findings: [
      { label: "Risk level", value: (context.score ?? 80) >= 80 ? "Moderate-low" : "Elevated", tone: (context.score ?? 80) >= 80 ? "positive" : "warning" },
      { label: "Collateral coverage", value: `${(context.coverage ?? 2.18).toFixed(2)}x`, tone: (context.coverage ?? 2.18) >= 1.7 ? "positive" : "negative" },
      { label: "Regulatory trajectory", value: "Watching", tone: "warning" },
      { label: "Liquidity signal", value: "Stable", tone: "neutral" },
    ],
    risks: ["Coverage could compress after a material catch reduction", "Qualified buyer restrictions may extend liquidation time"],
    sources: ["Simulated loan state", "Current market inputs", "Regulatory event stream"],
    structured: { riskLevel: (context.score ?? 80) >= 80 ? "moderate-low" : "elevated", projectedCoverage: context.coverage ?? 2.18, warningHorizonDays: 45 },
  });
}

export function analyzeRegulatoryEvent(input: string): IntelligenceResult {
  const regulation = summarizeRegulation(input);
  const catchChange = Number(regulation.structured.allowableCatchChange ?? 0);
  const severity = Math.abs(catchChange) >= 15 ? "High" : Math.abs(catchChange) >= 5 ? "Moderate" : "Low";
  return result("shock", input, {
    title: "AI event interpretation",
    summary: catchChange ? `RightMark Intelligence detected a ${Math.abs(catchChange)}% allowable-catch reduction and converted it into structured variables for the financial engine.` : "The event affects regulatory risk but contains no explicit numeric catch change.",
    findings: [
      { label: "Affected asset", value: "Pacific Halibut IFQ", tone: "neutral" },
      { label: "Event type", value: "Catch restriction", tone: "warning" },
      { label: "Severity", value: severity, tone: severity === "High" ? "negative" : "warning" },
      { label: "Allowable catch change", value: catchChange ? `${catchChange}%` : "No numeric change", tone: catchChange < 0 ? "negative" : "neutral" },
      { label: "Regulatory risk change", value: catchChange ? `+${Math.round(Math.abs(catchChange) * 0.67)} points` : "+4 points", tone: "warning" },
    ],
    risks: ["Lower operating cash flow", "Reduced stress-tested collateral value", "Potential liquidity compression"],
    sources: ["Supplied government announcement", "RightMark event taxonomy"],
    structured: { allowableCatchChange: catchChange, priceChange: 0, fuelChange: 0, riskPointChange: catchChange ? Math.round(Math.abs(catchChange) * 0.67) : 4, liquidityImpact: severity === "High" ? "moderate" : "limited" },
  });
}

export function generateStressScenario(input: string): IntelligenceResult {
  const text = lower(input);
  const severe = /severe|shock|high/.test(text);
  const positive = /positive|upside|growth/.test(text);
  const changes = positive ? { catch: 0, price: 12, fuel: -3 } : severe ? { catch: -25, price: -12, fuel: 14 } : { catch: -5, price: -8, fuel: 7 };
  return result("shock", input, {
    title: positive ? "Positive operating scenario" : severe ? "Severe regulatory shock" : "Mild downturn",
    summary: "AI generated a realistic scenario definition. The financial engine, not the language model, applies these variables to valuation and borrowing capacity.",
    findings: [
      { label: "Allowable catch", value: `${changes.catch}%`, tone: changes.catch < 0 ? "negative" : "neutral" },
      { label: "Species price", value: `${changes.price > 0 ? "+" : ""}${changes.price}%`, tone: changes.price > 0 ? "positive" : "negative" },
      { label: "Fuel cost", value: `${changes.fuel > 0 ? "+" : ""}${changes.fuel}%`, tone: changes.fuel > 0 ? "negative" : "positive" },
    ],
    risks: positive ? ["Upside is not guaranteed"] : ["Lower cash flow", "Higher operating costs", "Reduced lender headroom"],
    sources: ["RightMark scenario library", "Current asset context"],
    structured: { catchChange: changes.catch, priceChange: changes.price, fuelChange: changes.fuel },
  });
}

export function recommendCapitalStrategy(input: string, context: FinancialContext = {}): IntelligenceResult {
  const need = Number(input.match(/\$?([\d,]{4,})/)?.[1]?.replaceAll(",", "") ?? context.requestedAmount ?? 50_000);
  const capacity = context.borrowingPower ?? 75_000;
  const borrow = need <= capacity;
  return result("capital", input, {
    title: "AI capital strategist",
    summary: borrow ? `Borrowing appears to preserve more long-term economic value because the stated ${money(need)} need is within the modeled ${money(capacity)} capacity.` : `The stated ${money(need)} need exceeds modeled capacity, so a smaller loan, partial transfer, or additional collateral should be evaluated.`,
    findings: [
      { label: "Recommended path", value: borrow ? "Borrow within modeled capacity" : "Reduce or restructure request", tone: borrow ? "positive" : "warning" },
      { label: "Capital need", value: money(need), tone: "neutral" },
      { label: "Modeled capacity", value: money(capacity), tone: need <= capacity ? "positive" : "negative" },
    ],
    risks: ["Educational analysis only", "Financing requires lender underwriting", "Transfer and lien checks remain outstanding"],
    sources: ["User-stated objective", "RightMark financial model"],
    structured: { need, capacity, recommendedPath: borrow ? "borrow" : "restructure" },
  });
}

export function explainLoanDecision(context: FinancialContext): IntelligenceResult {
  const requested = context.requestedAmount ?? 75_000;
  const stress = context.stressValue ?? 197_400;
  const ltv = stress > 0 ? requested / stress : 1;
  const approved = ltv <= 0.6;
  return result("loan", JSON.stringify(context), {
    title: approved ? "Why this simulated offer was generated" : "Why the request was not matched",
    summary: approved ? `The ${money(requested)} request equals ${Math.round(ltv * 100)}% of modeled stress value, inside the 60% demonstration cap.` : `The request equals ${Math.round(ltv * 100)}% of modeled stress value and exceeds the demonstration lender's maximum permitted LTV.`,
    findings: [
      { label: "Requested amount", value: money(requested), tone: "neutral" },
      { label: "Stress-value LTV", value: `${Math.round(ltv * 100)}%`, tone: approved ? "positive" : "negative" },
      { label: "Decision status", value: approved ? "Compatible with criteria" : "Outside criteria", tone: approved ? "positive" : "negative" },
    ],
    risks: ["Simulated decision only", "No lender approval", "Ownership, cash flow, and liens require verification"],
    sources: ["RightMark financial model", "Mock lender criteria"],
    structured: { approved, requestedAmount: requested, ltv: Math.round(ltv * 1000) / 10, maxLtv: 60 },
  });
}

export function matchLenders(context: FinancialContext): IntelligenceResult {
  const request = context.requestedAmount ?? Math.min(context.borrowingPower ?? 75_000, 75_000);
  const score = context.score ?? 86;
  const matches = [
    { name: "Harbor Capital", match: Math.min(97, 88 + Math.round((score - 70) / 2)), reason: "Specializes in fishing-industry collateral and accepts modeled LTVs up to 55%." },
    { name: "Coastal Bank", match: Math.min(94, 82 + Math.round((score - 70) / 3)), reason: "Strong cash-flow fit and the lowest modeled total financing cost." },
    { name: "BlueWave Finance", match: Math.min(88, 72 + Math.round((score - 70) / 4)), reason: "Flexible term structure, with a higher risk premium for specialized collateral." },
  ];
  return result("lender-match", JSON.stringify(context), {
    title: "AI lender match",
    summary: `RightMark compared the ${money(request)} simulated request with lender-specific asset, LTV, score, geography, and term criteria.`,
    findings: matches.map((match, index) => ({ label: match.name, value: `${match.match}% match`, tone: index === 0 ? "positive" : "neutral" })),
    risks: ["Compatibility ranking is not a credit decision", "All lenders and offers are simulated"],
    sources: ["Mock lender criteria", "Current RightMark asset and loan state"],
    structured: { matches: matches.map((match) => `${match.name}|${match.match}|${match.reason}`), requestedAmount: request },
  });
}

export function analyzeLoanPortfolio(input: string): IntelligenceResult {
  const text = lower(input);
  const answer = /largest|concentration/.test(text) ? "38% of monitored collateral value is associated with fishing-related rights." : /1\.7|coverage|decline/.test(text) ? "RM-82921 and RM-17282 would approach the 1.70x threshold after a 20% collateral-value decline." : "RM-82921, RM-44820, and RM-17282 have the highest modeled exposure to regulatory changes.";
  return result("portfolio", input, {
    title: "Ask RightMark portfolio analysis",
    summary: answer,
    findings: [
      { label: "Fishing quota exposure", value: "38%", tone: "warning" },
      { label: "Loans on watch", value: "3", tone: "warning" },
      { label: "Portfolio coverage", value: "2.46x", tone: "positive" },
    ],
    risks: ["Single-industry concentration", "Two loans are sensitive to a 20% collateral shock"],
    sources: ["RightMark simulated institutional portfolio"],
    structured: { answer, exposedLoans: ["RM-82921", "RM-44820", "RM-17282"], concentrationPercent: 38 },
  });
}

export function detectAnomalies(input: string): IntelligenceResult {
  const text = lower(input);
  const anomaly = /owner/.test(text) ? "Uploaded owner does not match the public registry record." : /valuation|price/.test(text) ? "Asking valuation is 47% above selected comparable transactions." : /duplicate/.test(text) ? "Duplicate collateral identifier detected in the simulated portfolio." : "Existing lien indicator may already be associated with this asset.";
  return result("anomaly", input, {
    title: "Anomaly detected",
    summary: anomaly,
    confidence: stableConfidence(input, 91, 7),
    findings: [
      { label: "Review priority", value: "High", tone: "negative" },
      { label: "Automated action", value: "Hold for manual verification", tone: "warning" },
    ],
    risks: [anomaly, "Do not advance financing until the conflict is resolved"],
    sources: ["Uploaded document", "Connected registry", "Simulated collateral ledger"],
    structured: { anomaly, holdForReview: true },
  });
}

export function generateUnderwritingSummary(context: FinancialContext): IntelligenceResult {
  const value = context.estimatedValue ?? 242_800;
  const request = context.requestedAmount ?? 75_000;
  return result("underwriting", JSON.stringify(context), {
    title: "Underwriting copilot",
    summary: `${context.owner ?? "The borrower"} is requesting ${money(request)} against a modeled commercial right value of ${money(value)}. The request has low modeled LTV and moderate regulatory exposure.`,
    findings: [
      { label: "RightMark assessment", value: "Moderate-low risk", tone: "positive" },
      { label: "Primary strength", value: "Low requested LTV", tone: "positive" },
      { label: "Primary risk", value: "Limited collateral buyer pool", tone: "warning" },
      { label: "Question to review", value: "Verify existing liens and transfer timing", tone: "neutral" },
    ],
    risks: ["Moderate regulatory exposure", "Seasonal revenue concentration", "Government transfer approval timing"],
    sources: ["Public asset record", "RightMark financial model", "Simulated borrower and loan data"],
    structured: { assessment: "moderate-low", strengths: ["Low requested LTV", "Stable modeled cash flow", "Strong collateral coverage"], reviewQuestions: ["Confirm latest business cash flow", "Verify existing liens", "Review transfer approval timeline"] },
  });
}

export function askRightMark(input: string, context: FinancialContext = {}): IntelligenceResult {
  const text = lower(input);
  if (/borrowing|capacity|ltv/.test(text)) return explainLoanDecision({ ...context, requestedAmount: context.borrowingPower ?? 0 });
  if (/value|decrease|why/.test(text)) return explainValuation(context);
  if (/lender|harbor|bluewave/.test(text)) return matchLenders(context);
  if (/risk|exit|liquid/.test(text)) return generateRiskFactors(context);
  return recommendCapitalStrategy(input, context);
}

export function runDeterministicAI(action: IntelligenceAction, input: string, context: FinancialContext = {}): IntelligenceResult {
  switch (action) {
    case "scan": return analyzeAssetDocuments(input, context);
    case "classify": return classifyCommercialRight(input);
    case "regulation": return summarizeRegulation(input);
    case "eligibility": return assessCollateralEligibility(input, context);
    case "valuation": return explainValuation(context);
    case "shock": return analyzeRegulatoryEvent(input);
    case "capital": return recommendCapitalStrategy(input, context);
    case "loan": return explainLoanDecision(context);
    case "lender-match": return matchLenders(context);
    case "underwriting": return generateUnderwritingSummary(context);
    case "portfolio": return analyzeLoanPortfolio(input);
    case "anomaly": return detectAnomalies(input);
    case "sentinel": return generateRiskFactors(context);
    case "chat": return askRightMark(input, context);
  }
}

export async function requestRightMarkIntelligence(action: IntelligenceAction, input: string, context: FinancialContext = {}) {
  try {
    const response = await fetch("/api/intelligence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, input, context }) });
    if (!response.ok) throw new Error("Intelligence request failed");
    return await response.json() as IntelligenceResult;
  } catch {
    return runDeterministicAI(action, input, context);
  }
}
