import { scaleAssetModel, type MarketData } from "../../../lib/rightmark";

export async function POST(request: Request) {
  const payload = (await request.json()) as { market: MarketData; qsUnits?: number };
  const market = payload.market;
  if ([market.allowableCatchPercent, market.fishPrice, market.fuelCost].some((value) => !Number.isFinite(value))) return Response.json({ error: "Scenario values must be valid numbers." }, { status: 400 });
  return Response.json({ valuation: scaleAssetModel(payload.qsUnits ?? 423_839, market) });
}
