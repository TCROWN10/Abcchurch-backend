import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OutboxService } from 'src/outbox/outbox.service';

@Injectable()
export class BirthdayScheduler {
  private readonly logger = new Logger(BirthdayScheduler.name);

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly outboxService: OutboxService,
  ) {}

  /**
   * Run birthday check 3 times daily:
   * - 9:00 AM (morning)
   * - 2:00 PM (afternoon)
   * - 6:00 PM (evening)
   * This ensures users who register or update their profile after the first run
   * still get their birthday wishes on the same day.
   */
  @Cron('0 9 * * *') // 9:00 AM daily
  async handleBirthdayCheckMorning() {
    this.logger.log('Running morning birthday check (9:00 AM)...');
    await this.triggerBirthdayCheck('morning');
  }

  @Cron('0 14 * * *') // 2:00 PM daily
  async handleBirthdayCheckAfternoon() {
    this.logger.log('Running afternoon birthday check (2:00 PM)...');
    await this.triggerBirthdayCheck('afternoon');
  }

  @Cron('0 18 * * *') // 6:00 PM daily
  async handleBirthdayCheckEvening() {
    this.logger.log('Running evening birthday check (6:00 PM)...');
    await this.triggerBirthdayCheck('evening');
  }

  private async triggerBirthdayCheck(period: string) {
    // Create event in outbox (event-driven)
    await this.outboxService.createEvent({
      eventType: 'birthday.check',
      payload: {
        action: 'check',
        entity: 'birthday',
        period,
        timestamp: new Date().toISOString(),
      },
    });
  }
}

