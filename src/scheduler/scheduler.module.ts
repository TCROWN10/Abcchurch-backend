import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { BirthdayScheduler } from './birthday.scheduler';
import { CleanupScheduler } from './cleanup.scheduler';
import { DonationsScheduler } from './donations.scheduler';
import { EventsModule } from 'src/events/events.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { OutboxModule } from 'src/outbox/outbox.module';
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
  imports: [ScheduleModule, EventsModule, PrismaModule, OutboxModule, EventEmitterModule],
  providers: [BirthdayScheduler, CleanupScheduler, DonationsScheduler],
})
export class SchedulerModule {}

