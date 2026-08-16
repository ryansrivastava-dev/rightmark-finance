import { calculateValuation, type MarketData } from "../../../lib/rightmark";

export async function POST(request: Request) {
  const market = (await request.json()) as MarketData;
  if ([market.allowableCatchPercent, market.fishPrice, market.fuelCost].some((value) => !Number.isFinite(value))) return Response.json({ error: "Scenario values must be valid numbers." }, { status: 400 });
  return Response.json({ valuation: calculateValuation(market) });
}
