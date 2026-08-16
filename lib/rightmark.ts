export type RiskLevel = "Low" | "Moderate" | "High";
export type DataSource = { label: string; url: string; live: boolean };
export type MarketData = { allowableCatchPercent: number; fishPrice: number; fuelCost: number; regulatoryRisk: RiskLevel; halibutAllocationLb: number; halibutLandedPercent: number; fisheryLimitLb: number; mortalityToDateLb: number; fuelObservedOn: string; source: "Live public data" | "Public data with cached values"; sourceUrl: string; refreshedAt: string; sources: DataSource[] };

export const DEMO_ASSET = { name: "Pacific Halibut IFQ", owner: "North Shore Fisheries LLC", quotaId: "IFQ-482917", annualCashFlow: 31_800, baseAssetValue: 117_000, futureCashFlow: 38_000, scarcityPremium: 11_000, regulatoryAdjustment: -13_200, marketAdjustment: -10_200 };
export const DEMO_MARKET: MarketData = { allowableCatchPercent: 100, fishPrice: 8.18, fuelCost: 5.257, regulatoryRisk: "Moderate", halibutAllocationLb: 13_908_000, halibutLandedPercent: 47, fisheryLimitLb: 23_180_000, mortalityToDateLb: 6_025_604, fuelObservedOn: "2026-08-10", source: "Public data with cached values", sourceUrl: "https://www.fisheries.noaa.gov/sites/default/files/akro/26ifqland.htm", refreshedAt: "2026-08-10T12:00:00.000Z", sources: [] };

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
export function scaleAssetModel(qsUnits: number, market: MarketData) {
  const holdingsScale = Math.max(0.1, qsUnits / 423_839);
  const scenario = calculateValuation(market);
  return {
    ...scenario,
    estimatedValue: Math.round(scenario.estimatedValue * holdingsScale),
    stressValue: Math.round(scenario.stressValue * holdingsScale),
    borrowingPower: Math.round(scenario.borrowingPower * holdingsScale),
    annualCashFlow: Math.round(31_800 * holdingsScale),
    breakdown: {
      quotaOwnershipValue: Math.round(117_000 * holdingsScale),
      futureCashFlow: Math.round(38_000 * holdingsScale),
      scarcityPremium: Math.round(11_000 * holdingsScale),
      regulatoryAdjustment: Math.round(-13_200 * holdingsScale),
      marketAdjustment: Math.round(-10_200 * holdingsScale),
    },
  };
}
export function makeOffers(analysisId: string) {
  return [
    { lender: "Indicative Term A", amount: 50_000, apr: 7.6, termMonths: 48, bestMatch: true },
    { lender: "Indicative Term B", amount: 55_000, apr: 8.1, termMonths: 60, bestMatch: false },
    { lender: "Indicative Term C", amount: 45_000, apr: 7.2, termMonths: 36, bestMatch: false },
  ].map((offer, index) => ({ id: `${analysisId}-offer-${index + 1}`, analysisId, ...offer, monthlyPayment: payment(offer.amount, offer.apr, offer.termMonths) }));
}
