-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "action" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT,
    "result" TEXT NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "correlation_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_audit_log_user_id_created_at" ON "audit_log"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_audit_log_resource_type_resource_id" ON "audit_log"("resource_type", "resource_id");

-- CreateIndex
CREATE INDEX "idx_audit_log_action_created_at" ON "audit_log"("action", "created_at");

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("user_id") ON DELETE SET NULL ON UPDATE NO ACTION;