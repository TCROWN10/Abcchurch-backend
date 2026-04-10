-- AlterTable
ALTER TABLE "Donation" ADD COLUMN "stripeSubscriptionId" TEXT,
ADD COLUMN "stripeCustomerId" TEXT,
ADD COLUMN "subscriptionStatus" TEXT,
ADD COLUMN "subscriptionCurrentPeriodEnd" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Donation_stripeSubscriptionId_key" ON "Donation"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "Donation_stripeSubscriptionId_idx" ON "Donation"("stripeSubscriptionId");
