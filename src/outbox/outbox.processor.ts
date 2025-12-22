import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OutboxService } from './outbox.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class OutboxProcessor {
  private readonly logger = new Logger(OutboxProcessor.name);

  constructor(
    private readonly outboxService: OutboxService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Process pending outbox events every minute
   */
  @Cron(CronExpression.EVERY_10_SECONDS)
  async processPendingEvents() {
    try {

      this.logger.log('Processing pending outbox events');
      const pendingEvents = await this.outboxService.getPendingEvents(50);

      for (const event of pendingEvents) {
        try {
          this.logger.log(`Processing outbox event: ${event.id} (${event.eventType})`);

          await this.outboxService.markAsProcessing(event.id);

          // Emit the event to be handled by event handlers
          await this.eventEmitter.emitAsync(event.eventType, event.payload);

          await this.outboxService.markAsCompleted(event.id);
          this.logger.log(`Completed outbox event: ${event.id}`);
        } catch (error) {
          this.logger.error(`Failed to process outbox event ${event.id}:`, error);
          await this.outboxService.markAsFailed(event.id, error.message);

          // Retry logic: reset to pending if retry count is less than 3
          if (event.retryCount < 3) {
            await this.outboxService.resetToPending(event.id);
          }
        }
      }
    } catch (error) {
      this.logger.error('Error processing outbox events:', error);
    }
  }
}

