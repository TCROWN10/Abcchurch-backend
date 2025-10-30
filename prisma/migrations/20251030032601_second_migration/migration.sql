/*
  Warnings:

  - You are about to drop the column `lastName` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `User` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[detailsId]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `detailsId` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "lastName",
DROP COLUMN "name",
ADD COLUMN     "detailsId" INTEGER NOT NULL;

-- CreateTable
CREATE TABLE "UserDetails" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "zipCode" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "profilePicture" TEXT NOT NULL,
    "gender" TEXT NOT NULL,
    "dob" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserDetails_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_detailsId_key" ON "User"("detailsId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_detailsId_fkey" FOREIGN KEY ("detailsId") REFERENCES "UserDetails"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
