import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  return drizzle(getD1(), { schema });
}

export function getD1() {
  if (!env.DB) throw new Error("Cloudflare D1 binding `DB` is unavailable.");
  return env.DB;
}

export async function ensureSchema() {
  const d1 = getD1();
  await d1.batch([
    d1.prepare(`CREATE TABLE IF NOT EXISTS analyses (id TEXT PRIMARY KEY, quota_id TEXT NOT NULL, asset_type TEXT NOT NULL, owner TEXT NOT NULL, estimated_value INTEGER NOT NULL, stress_value INTEGER NOT NULL, borrowing_power INTEGER NOT NULL, score INTEGER NOT NULL, data_source TEXT NOT NULL, market_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS offers (id TEXT PRIMARY KEY, analysis_id TEXT NOT NULL, lender TEXT NOT NULL, amount INTEGER NOT NULL, apr REAL NOT NULL, term_months INTEGER NOT NULL, monthly_payment REAL NOT NULL, best_match INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (analysis_id) REFERENCES analyses(id))`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS matches (id TEXT PRIMARY KEY, offer_id TEXT NOT NULL, amount INTEGER NOT NULL, platform_fee INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'simulated_matched', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (offer_id) REFERENCES offers(id))`),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_offers_analysis_id ON offers(analysis_id)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS idx_matches_offer_id ON matches(offer_id)"),
  ]);
}
