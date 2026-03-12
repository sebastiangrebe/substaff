ALTER TABLE "agents" ADD COLUMN "manager_id" text;
ALTER TABLE "agents" ADD CONSTRAINT "agents_manager_id_user_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
