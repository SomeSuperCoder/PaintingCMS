-- ══════════════════════════════════════════════════════════════════════════
-- DOWN migration — 0000_init (reverses drizzle/0000_init.sql)
-- Hand-written (drizzle-kit 0.31.10 generates up-only; no --down flag).
--
-- Drops all six tables in REVERSE dependency order so no FK can block:
--   photos (FK → paintings) → paintings (FK → locations)
--   → locations → ownership_events (FKs → users) → app_state (FKs → users)
--   → users (no dependents left).
--
-- DROP TABLE removes the table's own indexes, unique indexes, and CHECK
-- constraints automatically; explicit DROP INDEX statements are therefore
-- unnecessary and omitted.
-- ══════════════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS "photos";
--> statement-breakpoint
DROP TABLE IF EXISTS "paintings";
--> statement-breakpoint
DROP TABLE IF EXISTS "locations";
--> statement-breakpoint
DROP TABLE IF EXISTS "ownership_events";
--> statement-breakpoint
DROP TABLE IF EXISTS "app_state";
--> statement-breakpoint
DROP TABLE IF EXISTS "users";
