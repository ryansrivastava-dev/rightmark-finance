export async function GET() {
  return Response.json({ status: "ok", product: "RightMark", mode: "simulation", capabilities: ["D1 persistence", "NOAA market data", "valuation", "stress testing", "underwriting", "offer matching"] });
}
