CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"label" text NOT NULL,
	"symbol" text NOT NULL,
	"condition_type" text NOT NULL,
	"threshold" numeric,
	"active" boolean DEFAULT true NOT NULL,
	"triggered" boolean DEFAULT false NOT NULL,
	"triggered_at" timestamp with time zone,
	"auto_reset" boolean DEFAULT false NOT NULL,
	"last_price" numeric,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_filings" (
	"tax_year" integer,
	"period" text,
	"filed_on" date NOT NULL,
	"amount_paid_php" numeric(14,2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tax_filings_pkey" PRIMARY KEY("tax_year","period")
);
--> statement-breakpoint
CREATE TABLE "tax_income_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"received_on" date NOT NULL,
	"source" text NOT NULL,
	"amount_php" numeric(14,2) NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webauthn_credentials" (
	"credential_id" text PRIMARY KEY,
	"public_key" text NOT NULL,
	"counter" bigint DEFAULT 0 NOT NULL,
	"transports" text[] DEFAULT '{}'::text[] NOT NULL,
	"device_label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone
);
--> statement-breakpoint
DROP TABLE "planets";--> statement-breakpoint
CREATE INDEX "alerts_active_idx" ON "alerts" ("active");--> statement-breakpoint
CREATE INDEX "tax_income_entries_received_on_idx" ON "tax_income_entries" ("received_on");--> statement-breakpoint
CREATE INDEX "webauthn_credentials_last_used_idx" ON "webauthn_credentials" ("last_used_at");