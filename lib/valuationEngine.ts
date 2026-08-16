import type { MarketData } from "./rightmark";

export function applyRegulatoryShock(market: MarketData, catchChange: number, priceChange = 0, fuelChange = 0): MarketData {
  return {
    ...market,
    allowableCatchPercent: Math.max(35, Math.min(130, 100 + catchChange)),
    fishPrice: Math.max(0.5, market.fishPrice * (1 + priceChange / 100)),
    fuelCost: Math.max(1, market.fuelCost * (1 + fuelChange / 100)),
    regulatoryRisk: catchChange <= -15 ? "High" : catchChange < 0 ? "Moderate" : market.regulatoryRisk,
  };
}
