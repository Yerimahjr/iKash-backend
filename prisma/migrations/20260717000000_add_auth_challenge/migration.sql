-- CreateTable
CREATE TABLE "auth_challenge" (
    "challenge_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "public_key" TEXT NOT NULL,
    "challenge" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_challenge_pkey" PRIMARY KEY ("challenge_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auth_challenge_public_key_key" ON "auth_challenge"("public_key");

-- CreateIndex
CREATE INDEX "auth_challenge_expires_at_idx" ON "auth_challenge"("expires_at");
