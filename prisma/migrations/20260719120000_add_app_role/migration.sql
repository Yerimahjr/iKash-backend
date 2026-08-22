-- CreateEnum
CREATE TYPE "app_role" AS ENUM ('user', 'admin', 'support');

-- AlterTable
ALTER TABLE "app_user" ADD COLUMN "role" "app_role" NOT NULL DEFAULT 'user';
