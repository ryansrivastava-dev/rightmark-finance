import { env } from "cloudflare:workers";
import { fetchRealMarketData } from "../../../lib/public-data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const apiKey = (env as unknown as { EIA_API_KEY?: string }).EIA_API_KEY ?? "DEMO_KEY";
    const market = await fetchRealMarketData(apiKey);
    return Response.json({ market, credentialMode: apiKey === "DEMO_KEY" ? "EIA public demo key" : "EIA site secret" });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Public data sources are unavailable." }, { status: 502 });
  }
}
