import { ensureSchema, getD1 } from "../../../db";
import { makeOffers } from "../../../lib/rightmark";

export async function POST(request: Request) {
  const { analysisId } = (await request.json()) as { analysisId?: string };
  if (!analysisId) return Response.json({ error: "analysisId is required" }, { status: 400 });
  await ensureSchema();
  if (!(await getD1().prepare("SELECT id FROM analyses WHERE id = ?").bind(analysisId).first())) return Response.json({ error: "Analysis not found" }, { status: 404 });
  const offers = makeOffers(analysisId);
  for (const offer of offers) await getD1().prepare(`INSERT OR REPLACE INTO offers (id, analysis_id, lender, amount, apr, term_months, monthly_payment, best_match) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(offer.id, offer.analysisId, offer.lender, offer.amount, offer.apr, offer.termMonths, offer.monthlyPayment, offer.bestMatch ? 1 : 0).run();
  return Response.json({ offers });
}
