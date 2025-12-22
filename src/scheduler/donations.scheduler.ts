import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from 'src/prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class DonationsScheduler {
  private readonly logger = new Logger(DonationsScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async markPendingDonationsAsFailed() {
    this.logger.log('Checking for pending donations older than 3 hours...');
    
    const threeHoursAgo = new Date();
    threeHoursAgo.setHours(threeHoursAgo.getHours() - 3);

    // Emit event for processing
    await this.eventEmitter.emitAsync('donation.check-pending', {
      cutoffTime: threeHoursAgo.toISOString(),
    });
  }
}

