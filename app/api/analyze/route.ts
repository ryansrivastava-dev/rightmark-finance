import { ensureSchema, getD1 } from "../../../db";
import { lookupNoaaHolding } from "../../../lib/public-data";
import { DEMO_ASSET, DEMO_MARKET, scaleAssetModel, type MarketData } from "../../../lib/rightmark";

export async function POST(request: Request) {
  const payload = (await request.json()) as { nmfsId?: string; quotaId?: string; assetType?: string; market?: MarketData };
  const nmfsId = (payload.nmfsId ?? payload.quotaId ?? "").trim();
  if (!/^\d{1,8}$/.test(nmfsId)) return Response.json({ error: "Enter a numeric NMFS ID from the public quota-share dataset." }, { status: 400 });
  if (payload.assetType && payload.assetType !== "fishing") return Response.json({ error: "The live public-record workflow supports Alaska halibut and sablefish quota share." }, { status: 400 });
  const holding = await lookupNoaaHolding(nmfsId);
  if (!holding) return Response.json({ error: `No current 2026 halibut or sablefish quota-share record was found for NMFS ID ${nmfsId}.` }, { status: 404 });
  await ensureSchema();
  const market = { ...(payload.market ?? DEMO_MARKET), fishPrice: holding.weightedPricePerLb || 8.18 };
  const valuation = scaleAssetModel(holding.estimatedGrossHarvestValue, holding.weightedPricePerLb, market);
  const id = crypto.randomUUID();
  await getD1().prepare(`INSERT INTO analyses (id, quota_id, asset_type, owner, estimated_value, stress_value, borrowing_power, score, data_source, market_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, nmfsId, "fishing", holding.holderName, valuation.estimatedValue, valuation.stressValue, valuation.borrowingPower, valuation.score, market.source, JSON.stringify({ market, holding })).run();
  return Response.json({
    analysis: {
      id, ...DEMO_ASSET, name: `${holding.species} Quota Share`, quotaId: nmfsId,
      owner: holding.holderName, ...valuation, market, holding,
      verificationLevel: "Public government record matched — identity and control not authenticated",
    },
    verification: [
      "2026 NOAA holder dataset reached", "NMFS ID matched to public record",
      `${holding.recordCount} quota-share records aggregated`, `${holding.speciesHoldings.length} species profile(s) resolved by area`,
      `${holding.securityRecordCount} serial-group records checked for asserted interests`, "2026 QS-to-IFQ ratios and transfer eligibility linked",
      "NOAA, IPHC and EIA market inputs linked",
    ],
  }, { status: 201 });
}
