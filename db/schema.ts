import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const analyses = sqliteTable("analyses", {
  id: text("id").primaryKey(), quotaId: text("quota_id").notNull(),
  assetType: text("asset_type").notNull(), owner: text("owner").notNull(),
  estimatedValue: integer("estimated_value").notNull(), stressValue: integer("stress_value").notNull(),
  borrowingPower: integer("borrowing_power").notNull(), score: integer("score").notNull(),
  dataSource: text("data_source").notNull(), marketJson: text("market_json").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const offers = sqliteTable("offers", {
  id: text("id").primaryKey(), analysisId: text("analysis_id").notNull().references(() => analyses.id),
  lender: text("lender").notNull(), amount: integer("amount").notNull(), apr: real("apr").notNull(),
  termMonths: integer("term_months").notNull(), monthlyPayment: real("monthly_payment").notNull(),
  bestMatch: integer("best_match", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const matches = sqliteTable("matches", {
  id: text("id").primaryKey(), offerId: text("offer_id").notNull().references(() => offers.id),
  amount: integer("amount").notNull(), platformFee: integer("platform_fee").notNull(),
  status: text("status").notNull().default("simulated_matched"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
