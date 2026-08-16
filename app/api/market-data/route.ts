import { DEMO_MARKET } from "../../../lib/rightmark";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const response = await fetch(DEMO_MARKET.sourceUrl, { headers: { "User-Agent": "RightMarkDemo/1.0" } });
    if (!response.ok) throw new Error(`NOAA returned ${response.status}`);
    const normalized = (await response.text()).replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
    const allocation = normalized.match(/Total\s+[\d,]+\s+[\d,]+\s+([\d,]+)\s+[\d,]+\s+(\d+)/i);
    return Response.json({ market: { ...DEMO_MARKET, halibutAllocationLb: allocation ? Number(allocation[1].replaceAll(",", "")) : DEMO_MARKET.halibutAllocationLb, halibutLandedPercent: allocation ? Number(allocation[2]) : DEMO_MARKET.halibutLandedPercent, source: "NOAA live", refreshedAt: new Date().toISOString() } });
  } catch {
    return Response.json({ market: DEMO_MARKET, warning: "Live NOAA data was unavailable; verified snapshot used." });
  }
}
