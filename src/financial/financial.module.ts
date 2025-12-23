import { Module } from '@nestjs/common';
import { FinancialService } from './financial.service';
import { FinancialController } from './financial.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { OutboxModule } from 'src/outbox/outbox.module';

@Module({
  imports: [PrismaModule, OutboxModule],
  controllers: [FinancialController],
  providers: [FinancialService],
  exports: [FinancialService],
})
export class FinancialModule {}

