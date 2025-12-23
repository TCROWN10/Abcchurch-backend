import { Module } from '@nestjs/common';
import { DonationsService } from './donations.service';
import { DonationsController } from './donations.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { OutboxModule } from 'src/outbox/outbox.module';

@Module({
  imports: [PrismaModule, OutboxModule],
  controllers: [DonationsController],
  providers: [DonationsService],
  exports: [DonationsService],
})
export class DonationsModule {}

