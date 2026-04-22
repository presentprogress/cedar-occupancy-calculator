CREATE TABLE "versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"state" jsonb NOT NULL,
	"is_auto" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
