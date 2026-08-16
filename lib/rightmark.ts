export type RiskLevel = "Low" | "Moderate" | "High";
export type DataSource = { label: string; url: string; live: boolean };
export type MarketData = { allowableCatchPercent: number; fishPrice: number; sablefishPrice: number; fuelCost: number; regulatoryRisk: RiskLevel; halibutAllocationLb: number; halibutLandedPercent: number; sablefishAllocationLb: number; sablefishLandedPercent: number; fisheryLimitLb: number; mortalityToDateLb: number; fuelObservedOn: string; source: "Live public data" | "Public data with cached values"; sourceUrl: string; refreshedAt: string; sources: DataSource[] };

export const DEMO_ASSET = { name: "Pacific Halibut IFQ", owner: "North Shore Fisheries LLC", quotaId: "IFQ-482917", annualCashFlow: 31_800, baseAssetValue: 117_000, futureCashFlow: 38_000, scarcityPremium: 11_000, regulatoryAdjustment: -13_200, marketAdjustment: -10_200 };
export const DEMO_MARKET: MarketData = { allowableCatchPercent: 100, fishPrice: 8.18, sablefishPrice: 1.84, fuelCost: 5.257, regulatoryRisk: "Moderate", halibutAllocationLb: 13_908_000, halibutLandedPercent: 47, sablefishAllocationLb: 60_271_559, sablefishLandedPercent: 43, fisheryLimitLb: 23_180_000, mortalityToDateLb: 6_025_604, fuelObservedOn: "2026-08-10", source: "Public data with cached values", sourceUrl: "https://www.fisheries.noaa.gov/sites/default/files/akro/26ifqland.htm", refreshedAt: "2026-08-10T12:00:00.000Z", sources: [] };

export function calculateValuation(market: MarketData) {
  const scenarioFactor = (market.allowableCatchPercent / 100) * (0.7 + 0.3 * market.fishPrice / 8.18) * Math.max(0.82, 1 - (market.fuelCost - 5.257) * 0.022) * ({ Low: 1.04, Moderate: 1, High: 0.9 }[market.regulatoryRisk]);
  const estimatedValue = Math.round(142_600 * scenarioFactor);
  const riskFactor = Math.max(0.7, Math.min(0.9, 0.83 + (scenarioFactor - 1) * 0.1));
  const stressValue = Math.round(estimatedValue * riskFactor);
  const borrowingPower = Math.round(stressValue * 0.6);
  const score = Math.round(Math.max(48, Math.min(94, 86 + (scenarioFactor - 1) * 34)));
  const changePercent = Math.round((scenarioFactor - 1) * 100);
  return { estimatedValue, stressValue, borrowingPower, score, scenarioFactor, changePercent };
}

export function payment(amount: number, apr: number, termMonths: number) { const rate = apr / 1200; return amount * (rate * (1 + rate) ** termMonths) / ((1 + rate) ** termMonths - 1); }
export function scaleAssetModel(annualGrossValue: number, referencePrice: number, market: MarketData) {
  const priceFactor = referencePrice > 0 ? market.fishPrice / referencePrice : 1;
  const adjustedMarket = { ...market, fishPrice: 8.18 * priceFactor };
  const scenario = calculateValuation(adjustedMarket);
  const baselineValue = annualGrossValue * 1.05;
  const scenarioScale = scenario.scenarioFactor;
  return {
    ...scenario,
    estimatedValue: Math.round(baselineValue * scenarioScale),
    stressValue: Math.round(baselineValue * scenarioScale * Math.max(0.7, Math.min(0.9, 0.83 + (scenarioScale - 1) * 0.1))),
    borrowingPower: Math.round(baselineValue * scenarioScale * Math.max(0.7, Math.min(0.9, 0.83 + (scenarioScale - 1) * 0.1)) * 0.6),
    annualCashFlow: Math.round(annualGrossValue * 0.22 * scenarioScale),
    annualGrossValue: Math.round(annualGrossValue),
    referencePrice,
    breakdown: {
      quotaOwnershipValue: Math.round(annualGrossValue * 0.86 * scenarioScale),
      futureCashFlow: Math.round(annualGrossValue * 0.24 * scenarioScale),
      scarcityPremium: Math.round(annualGrossValue * 0.10 * scenarioScale),
      regulatoryAdjustment: Math.round(-annualGrossValue * 0.09 * scenarioScale),
      marketAdjustment: Math.round(-annualGrossValue * 0.06 * scenarioScale),
    },
  };
}
export function makeOffers(analysisId: string, borrowingPower: number) {
  const anchor = Math.max(0, Math.round(borrowingPower / 1_000) * 1_000);
  return [
    { lender: "Indicative Term A", amount: Math.round(anchor * 0.8), apr: 7.6, termMonths: 48, bestMatch: true },
    { lender: "Indicative Term B", amount: Math.round(anchor * 0.95), apr: 8.1, termMonths: 60, bestMatch: false },
    { lender: "Indicative Term C", amount: Math.round(anchor * 0.65), apr: 7.2, termMonths: 36, bestMatch: false },
  ].map((offer, index) => ({ id: `${analysisId}-offer-${index + 1}`, analysisId, ...offer, monthlyPayment: payment(offer.amount, offer.apr, offer.termMonths) }));
}
