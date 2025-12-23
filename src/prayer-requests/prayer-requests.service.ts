import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { PrayerRequestStatus, Prisma } from '@prisma/client';

@Injectable()
export class PrayerRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  async createRequest(data: {
    userId?: number;
    requesterName: string;
    requesterEmail?: string;
    title: string;
    content: string;
    isPublic?: boolean;
  }) {
    return this.prisma.prayerRequest.create({
      data: {
        ...data,
        status: PrayerRequestStatus.PENDING,
      },
      include: { user: { include: { details: true } } },
    });
  }

  async getRequests(filters?: {
    status?: PrayerRequestStatus;
    isPublic?: boolean;
    userId?: number;
    limit?: number;
    offset?: number;
  }) {
    const where: any = {
      ...(filters?.status && { status: filters.status }),
      ...(filters?.isPublic !== undefined && { isPublic: filters.isPublic }),
      ...(filters?.userId && { userId: filters.userId }),
    };

    return this.prisma.prayerRequest.findMany({
      where,
      include: { user: { include: { details: true } } },
      orderBy: { createdAt: 'desc' },
      take: filters?.limit || 50,
      skip: filters?.offset || 0,
    });
  }

  async getRequestById(id: string) {
    return this.prisma.prayerRequest.findUnique({
      where: { id },
      include: { user: { include: { details: true } } },
    });
  }

  async markAsRead(id: string, adminId: number) {
    const request = await this.prisma.prayerRequest.findUnique({
      where: { id },
    });

    const readBy = (request?.readBy as number[]) || [];
    if (!readBy.includes(adminId)) {
      readBy.push(adminId);
    }

    return this.prisma.prayerRequest.update({
      where: { id },
      data: {
        status: PrayerRequestStatus.READ,
        readBy: readBy,
        readAt: new Date(),
      },
    });
  }

  async markAsUnread(id: string) {
    return this.prisma.prayerRequest.update({
      where: { id },
      data: {
        status: PrayerRequestStatus.PENDING,
        readAt: null,
      },
    });
  }

  async addNotes(id: string, notes: string) {
    return this.prisma.prayerRequest.update({
      where: { id },
      data: { notes },
    });
  }

  async archiveRequest(id: string) {
    return this.prisma.prayerRequest.update({
      where: { id },
      data: { status: PrayerRequestStatus.ARCHIVED },
    });
  }

  async deleteRequest(id: string) {
    return this.prisma.prayerRequest.delete({
      where: { id },
    });
  }
}

