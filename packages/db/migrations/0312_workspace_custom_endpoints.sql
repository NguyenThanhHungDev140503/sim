CREATE TABLE IF NOT EXISTS "workspace_custom_endpoints" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL,
  "name" text NOT NULL,
  "protocol" text NOT NULL,
  "base_url" text NOT NULL,
  "encrypted_api_key" text,
  "models" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_by" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "workspace_custom_endpoints_workspace_id_workspace_id_fk"
    FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade,
  CONSTRAINT "workspace_custom_endpoints_created_by_user_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null
);
CREATE INDEX IF NOT EXISTS "workspace_custom_endpoints_workspace_idx"
  ON "workspace_custom_endpoints" USING btree ("workspace_id");
CREATE UNIQUE INDEX IF NOT EXISTS "workspace_custom_endpoints_workspace_name_unique"
  ON "workspace_custom_endpoints" USING btree ("workspace_id", "name");
