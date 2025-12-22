import { Module } from '@nestjs/common';
import { OutboxService } from './outbox.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { OutboxProcessor } from './outbox.processor';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [PrismaModule, EventEmitterModule, ScheduleModule],
  providers: [OutboxService, OutboxProcessor],
  exports: [OutboxService],
})
export class OutboxModule {}

