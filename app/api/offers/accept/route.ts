import { ensureSchema, getD1 } from "../../../../db";

export async function POST(request: Request) {
  const { offerId } = (await request.json()) as { offerId?: string };
  if (!offerId) return Response.json({ error: "offerId is required" }, { status: 400 });
  await ensureSchema();
  const offer = await getD1().prepare("SELECT * FROM offers WHERE id = ?").bind(offerId).first<{ id: string; amount: number; lender: string }>();
  if (!offer) return Response.json({ error: "Offer not found" }, { status: 404 });
  const id = crypto.randomUUID(), platformFee = Math.round(offer.amount * 0.01);
  await getD1().prepare("INSERT INTO matches (id, offer_id, amount, platform_fee) VALUES (?, ?, ?, ?)").bind(id, offer.id, offer.amount, platformFee).run();
  return Response.json({ match: { id, amount: offer.amount, lender: offer.lender, platformFee, status: "simulated_matched" } }, { status: 201 });
}
