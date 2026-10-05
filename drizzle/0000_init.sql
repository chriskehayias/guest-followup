CREATE TABLE "guests" (
	"upload_id" uuid NOT NULL,
	"row_index" integer NOT NULL,
	"first_name" text DEFAULT '' NOT NULL,
	"last_name" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"state" text DEFAULT '' NOT NULL,
	"zip" text DEFAULT '' NOT NULL,
	"visit_date" text DEFAULT '' NOT NULL,
	"service" text DEFAULT '' NOT NULL,
	"adults" text DEFAULT '' NOT NULL,
	"kids" text DEFAULT '' NOT NULL,
	"how_heard" text DEFAULT '' NOT NULL,
	"interested_in" text DEFAULT '' NOT NULL,
	CONSTRAINT "guests_upload_id_row_index_pk" PRIMARY KEY("upload_id","row_index")
);
--> statement-breakpoint
CREATE TABLE "uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_name" text NOT NULL,
	"row_count" integer NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "guests" ADD CONSTRAINT "guests_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."uploads"("id") ON DELETE cascade ON UPDATE no action;