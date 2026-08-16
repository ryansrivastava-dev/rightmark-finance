import { ensureSchema, getD1 } from "../../../db";
import { lookupNoaaHolding } from "../../../lib/public-data";
import { DEMO_ASSET, DEMO_MARKET, scaleAssetModel, type MarketData } from "../../../lib/rightmark";

export async function POST(request: Request) {
  const payload = (await request.json()) as { nmfsId?: string; quotaId?: string; assetType?: string; market?: MarketData };
  const nmfsId = (payload.nmfsId ?? payload.quotaId ?? "").trim();
  if (!/^\d{1,8}$/.test(nmfsId)) return Response.json({ error: "Enter a numeric NMFS ID from the public quota-share dataset." }, { status: 400 });
  if (payload.assetType && payload.assetType !== "fishing") return Response.json({ error: "The live public-record workflow currently supports Alaska halibut quota share." }, { status: 400 });
  const holding = await lookupNoaaHolding(nmfsId);
  if (!holding) return Response.json({ error: `No 2026 Pacific halibut quota-share record was found for NMFS ID ${nmfsId}.` }, { status: 404 });
  await ensureSchema();
  const market = payload.market ?? DEMO_MARKET;
  const valuation = scaleAssetModel(holding.qsUnits, market);
  const id = crypto.randomUUID();
  await getD1().prepare(`INSERT INTO analyses (id, quota_id, asset_type, owner, estimated_value, stress_value, borrowing_power, score, data_source, market_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, nmfsId, "fishing", holding.holderName, valuation.estimatedValue, valuation.stressValue, valuation.borrowingPower, valuation.score, market.source, JSON.stringify({ market, holding })).run();
  return Response.json({
    analysis: {
      id, ...DEMO_ASSET, name: "Pacific Halibut Quota Share", quotaId: nmfsId,
      owner: holding.holderName, ...valuation, market, holding,
      verificationLevel: "Public government record matched — identity and control not authenticated",
    },
    verification: [
      "2026 NOAA holder dataset reached", "NMFS ID matched to public record",
      `${holding.recordCount} quota-share records aggregated`, "Species, areas and categories parsed",
      "NOAA, IPHC and EIA market inputs linked", "RightMark model assumptions applied",
    ],
  }, { status: 201 });
}
