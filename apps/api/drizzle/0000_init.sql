CREATE TABLE "app_state" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"current_owner_id" text NOT NULL,
	"pending_transfer_to_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_state_single_row" CHECK ("app_state"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"value" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "locations_kind_check" CHECK ("locations"."kind" IN ('offline', 'online')),
	CONSTRAINT "locations_value_check" CHECK (length("locations"."value") > 0)
);
--> statement-breakpoint
CREATE TABLE "ownership_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"actor_id" text NOT NULL,
	"from_owner_id" text,
	"to_owner_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ownership_events_type_check" CHECK ("ownership_events"."event_type" IN ('claim', 'transfer-initiated', 'transfer-confirmed'))
);
--> statement-breakpoint
CREATE TABLE "paintings" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"price_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"location_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "paintings_name_check" CHECK (length("paintings"."name") > 0),
	CONSTRAINT "paintings_price_check" CHECK ("paintings"."price_minor" >= 0),
	CONSTRAINT "paintings_currency_check" CHECK ("paintings"."currency" IN ('rub', 'usd', 'eur'))
);
--> statement-breakpoint
CREATE TABLE "photos" (
	"id" serial PRIMARY KEY NOT NULL,
	"painting_id" integer NOT NULL,
	"file_path" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text,
	"first_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_state" ADD CONSTRAINT "app_state_current_owner_id_users_id_fk" FOREIGN KEY ("current_owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_state" ADD CONSTRAINT "app_state_pending_transfer_to_id_users_id_fk" FOREIGN KEY ("pending_transfer_to_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ownership_events" ADD CONSTRAINT "ownership_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ownership_events" ADD CONSTRAINT "ownership_events_from_owner_id_users_id_fk" FOREIGN KEY ("from_owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ownership_events" ADD CONSTRAINT "ownership_events_to_owner_id_users_id_fk" FOREIGN KEY ("to_owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paintings" ADD CONSTRAINT "paintings_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_painting_id_paintings_id_fk" FOREIGN KEY ("painting_id") REFERENCES "public"."paintings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "locations_kind_idx" ON "locations" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "ownership_events_created_at_idx" ON "ownership_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "paintings_created_at_idx" ON "paintings" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "photos_painting_position_idx" ON "photos" USING btree ("painting_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_idx" ON "users" USING btree ("username");