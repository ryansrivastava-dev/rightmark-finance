export type RiskLevel = "Low" | "Moderate" | "High";
export type MarketData = { allowableCatchPercent: number; fishPrice: number; fuelCost: number; regulatoryRisk: RiskLevel; halibutAllocationLb: number; halibutLandedPercent: number; source: "NOAA live" | "NOAA demo snapshot"; sourceUrl: string; refreshedAt: string };

export const DEMO_ASSET = { name: "Pacific Halibut IFQ", owner: "North Shore Fisheries LLC", quotaId: "IFQ-482917", annualCashFlow: 31_800, baseAssetValue: 117_000, futureCashFlow: 38_000, scarcityPremium: 11_000, regulatoryAdjustment: -13_200, marketAdjustment: -10_200 };
export const DEMO_MARKET: MarketData = { allowableCatchPercent: 100, fishPrice: 7.3, fuelCost: 4, regulatoryRisk: "Moderate", halibutAllocationLb: 13_908_000, halibutLandedPercent: 47, source: "NOAA demo snapshot", sourceUrl: "https://www.fisheries.noaa.gov/sites/default/files/akro/26ifqland.htm", refreshedAt: "2026-08-01T12:00:00.000Z" };

export function calculateValuation(market: MarketData) {
  const scenarioFactor = (market.allowableCatchPercent / 100) * (0.7 + 0.3 * market.fishPrice / 7.3) * Math.max(0.82, 1 - (market.fuelCost - 4) * 0.022) * ({ Low: 1.04, Moderate: 1, High: 0.9 }[market.regulatoryRisk]);
  const estimatedValue = Math.round(142_600 * scenarioFactor);
  const riskFactor = Math.max(0.7, Math.min(0.9, 0.83 + (scenarioFactor - 1) * 0.1));
  const stressValue = Math.round(estimatedValue * riskFactor);
  const borrowingPower = Math.round(stressValue * 0.6);
  const score = Math.round(Math.max(48, Math.min(94, 86 + (scenarioFactor - 1) * 34)));
  const changePercent = Math.round((scenarioFactor - 1) * 100);
  return { estimatedValue, stressValue, borrowingPower, score, scenarioFactor, changePercent };
}

export function payment(amount: number, apr: number, termMonths: number) { const rate = apr / 1200; return amount * (rate * (1 + rate) ** termMonths) / ((1 + rate) ** termMonths - 1); }
export function makeOffers(analysisId: string) {
  return [
    { lender: "Harbor Capital", amount: 50_000, apr: 7.6, termMonths: 48, bestMatch: true },
    { lender: "BlueWave Finance", amount: 55_000, apr: 8.1, termMonths: 60, bestMatch: false },
    { lender: "Coastal Business Credit", amount: 45_000, apr: 7.2, termMonths: 36, bestMatch: false },
  ].map((offer, index) => ({ id: `${analysisId}-offer-${index + 1}`, analysisId, ...offer, monthlyPayment: payment(offer.amount, offer.apr, offer.termMonths) }));
}
