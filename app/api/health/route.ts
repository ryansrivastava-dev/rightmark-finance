export async function GET() {
  return Response.json({ status: "ok", product: "RightMark", mode: "live public data + modeled financing", capabilities: ["All 2026 NOAA halibut/sablefish NMFS IDs", "species/area/category QS records", "2026 QS-to-IFQ ratios", "transfer eligibility files", "NOAA allocations and landings", "IPHC limits", "EIA weekly diesel", "D1 persistence", "species-specific modeled valuation", "stress testing", "indicative terms"] });
}
