import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from 'src/prisma/prisma.service';
import { OutboxStatus } from '@prisma/client';
import { OutboxService } from 'src/outbox/outbox.service';

@Injectable()
export class CleanupScheduler {
  private readonly logger = new Logger(CleanupScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outboxService: OutboxService,
  ) {}

  /**
   * Clean up completed outbox events older than 7 days
   * Runs daily at 2:00 AM
   */
  @Cron('0 2 * * *') // Every day at 2:00 AM
  async cleanupOldOutboxEvents() {
    try {
      this.logger.log('Starting outbox cleanup...');
      
      // Create cleanup event in outbox (event-driven)
      await this.outboxService.createEvent({
        eventType: 'cleanup.outbox',
        payload: {
          action: 'delete',
          entity: 'outbox',
          condition: {
            status: 'COMPLETED',
            olderThanDays: 7,
          },
        },
      });

      this.logger.log('Cleanup event created in outbox');
    } catch (error) {
      this.logger.error('Failed to create cleanup event:', error);
    }
  }

  /**
   * Reset birthdayWished flag at midnight
   * This ensures users can receive birthday wishes on a new day
   * Runs daily at 12:00 AM
   */
  @Cron('0 0 * * *') // Every day at midnight
  async resetBirthdayWished() {
    try {
      this.logger.log('Resetting birthdayWished flags...');
      
      // Create reset event in outbox (event-driven)
      await this.outboxService.createEvent({
        eventType: 'birthday.reset',
        payload: {
          action: 'reset',
          entity: 'birthdayWished',
          timestamp: new Date().toISOString(),
        },
      });

      this.logger.log('Birthday reset event created in outbox');
    } catch (error) {
      this.logger.error('Failed to create birthday reset event:', error);
    }
  }
}

