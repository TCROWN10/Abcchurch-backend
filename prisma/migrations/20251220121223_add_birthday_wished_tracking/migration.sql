-- AlterTable
ALTER TABLE "UserDetails" ADD COLUMN     "birthdayWished" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "birthdayWishedAt" TIMESTAMP(3);
