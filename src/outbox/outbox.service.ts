import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { OutboxStatus } from '@prisma/client';

export interface OutboxEvent {
  eventType: string;
  payload: Record<string, any>;
}

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create an event in the outbox table
   */
  async createEvent(event: OutboxEvent): Promise<string> {
    const outbox = await this.prisma.outbox.create({
      data: {
        eventType: event.eventType,
        payload: event.payload,
        status: OutboxStatus.PENDING,
      },
    });

    this.logger.log(`Created outbox event: ${outbox.id} (${event.eventType})`);
    return outbox.id;
  }

  /**
   * Get pending events for processing
   */
  async getPendingEvents(limit: number = 10): Promise<any[]> {
    this.logger.log('Getting pending events');
    return this.prisma.outbox.findMany({
      where: {
        status: OutboxStatus.PENDING,
      },
      orderBy: {
        createdAt: 'asc',
      },
      take: limit,
    });
  }

  /**
   * Mark event as processing
   */
  async markAsProcessing(id: string): Promise<void> {
    await this.prisma.outbox.update({
      where: { id },
      data: {
        status: OutboxStatus.PROCESSING,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Mark event as completed
   */
  async markAsCompleted(id: string): Promise<void> {
    await this.prisma.outbox.update({
      where: { id },
      data: {
        status: OutboxStatus.COMPLETED,
        processedAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Mark event as failed
   */
  async markAsFailed(id: string, errorMessage: string): Promise<void> {
    const outbox = await this.prisma.outbox.findUnique({
      where: { id },
    });

    await this.prisma.outbox.update({
      where: { id },
      data: {
        status: OutboxStatus.FAILED,
        errorMessage,
        retryCount: (outbox?.retryCount || 0) + 1,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Reset failed event to pending for retry
   */
  async resetToPending(id: string): Promise<void> {
    await this.prisma.outbox.update({
      where: { id },
      data: {
        status: OutboxStatus.PENDING,
        errorMessage: null,
        updatedAt: new Date(),
      },
    });
  }
}

