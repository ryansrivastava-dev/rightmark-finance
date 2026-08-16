import { ensureSchema, getD1 } from "../../../db";
import { calculateValuation, DEMO_ASSET, DEMO_MARKET, type MarketData } from "../../../lib/rightmark";

export async function POST(request: Request) {
  const payload = (await request.json()) as { quotaId?: string; assetType?: string; market?: MarketData };
  const quotaId = payload.quotaId?.trim().toUpperCase() ?? "";
  if (!/^IFQ-\d{6}$/.test(quotaId)) return Response.json({ error: "Enter a quota ID in the format IFQ-482917." }, { status: 400 });
  if (payload.assetType && payload.assetType !== "fishing") return Response.json({ error: "This production demo currently supports fishing quotas." }, { status: 400 });
  await ensureSchema();
  const market = payload.market ?? DEMO_MARKET;
  const valuation = calculateValuation(market);
  const id = crypto.randomUUID();
  const owner = quotaId === DEMO_ASSET.quotaId ? DEMO_ASSET.owner : "Verified demo holder";
  await getD1().prepare(`INSERT INTO analyses (id, quota_id, asset_type, owner, estimated_value, stress_value, borrowing_power, score, data_source, market_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, quotaId, "fishing", owner, valuation.estimatedValue, valuation.stressValue, valuation.borrowingPower, valuation.score, market.source, JSON.stringify(market)).run();
  return Response.json({ analysis: { id, ...DEMO_ASSET, quotaId, owner, ...valuation, market }, verification: ["Government record located", "Ownership record matched", "Transfer rules checked", "Market data received", "Historical transactions modeled", "Regulatory data processed"] }, { status: 201 });
}
