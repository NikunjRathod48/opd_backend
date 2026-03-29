ALTER TABLE "queue_tokens" ADD COLUMN "visit_type" VARCHAR(20) DEFAULT 'WALK_IN';
ALTER TABLE "queue_tokens" ADD COLUMN "priority" VARCHAR(20) DEFAULT 'NORMAL';
ALTER TABLE "queue_tokens" ADD COLUMN "appointment_id" INTEGER;
ALTER TABLE "queue_tokens" ADD CONSTRAINT "queue_tokens_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments" ("appointment_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
