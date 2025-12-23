import { Module } from '@nestjs/common';
import { EventHandlers } from './event.handlers';
import { EmailModule } from 'src/email/email.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { NewsletterModule } from 'src/newsletter/newsletter.module';
import { FinancialModule } from 'src/financial/financial.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { OutboxModule } from 'src/outbox/outbox.module';

@Module({
  imports: [EmailModule, PrismaModule, NewsletterModule, FinancialModule, EventEmitterModule, OutboxModule],
  providers: [EventHandlers],
})
export class EventsModule {}

