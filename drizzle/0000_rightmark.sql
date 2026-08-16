CREATE TABLE `analyses` (
	`id` text PRIMARY KEY NOT NULL,
	`quota_id` text NOT NULL,
	`asset_type` text NOT NULL,
	`owner` text NOT NULL,
	`estimated_value` integer NOT NULL,
	`stress_value` integer NOT NULL,
	`borrowing_power` integer NOT NULL,
	`score` integer NOT NULL,
	`data_source` text NOT NULL,
	`market_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `offers` (
	`id` text PRIMARY KEY NOT NULL,
	`analysis_id` text NOT NULL,
	`lender` text NOT NULL,
	`amount` integer NOT NULL,
	`apr` real NOT NULL,
	`term_months` integer NOT NULL,
	`monthly_payment` real NOT NULL,
	`best_match` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`analysis_id`) REFERENCES `analyses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_offers_analysis_id` ON `offers` (`analysis_id`);
--> statement-breakpoint
CREATE TABLE `matches` (
	`id` text PRIMARY KEY NOT NULL,
	`offer_id` text NOT NULL,
	`amount` integer NOT NULL,
	`platform_fee` integer NOT NULL,
	`status` text DEFAULT 'simulated_matched' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`offer_id`) REFERENCES `offers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_matches_offer_id` ON `matches` (`offer_id`);
--> statement-breakpoint
PRAGMA optimize;
