export async function GET() {
  return Response.json({ status: "ok", product: "RightMark", mode: "live public data + modeled financing", capabilities: ["NOAA 2026 holder lookup", "NOAA landings", "IPHC limits and price benchmark", "EIA weekly diesel", "D1 persistence", "modeled valuation", "stress testing", "indicative terms"] });
}
