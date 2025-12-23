import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { OutboxModule } from './outbox/outbox.module';
import { DonationsModule } from './donations/donations.module';
import { MessagesModule } from './messages/messages.module';
import { NewsletterModule } from './newsletter/newsletter.module';
import { EmailModule } from './email/email.module';
import { PrayerRequestsModule } from './prayer-requests/prayer-requests.module';
import { FinancialModule } from './financial/financial.module';
import { EventsModule } from './events/events.module';
import { ScheduleModule } from '@nestjs/schedule';
import { SchedulerModule } from './scheduler/scheduler.module';
import { AnalyticsModule } from './analytics/analytics.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    UserModule,
    OutboxModule,
    DonationsModule,
    MessagesModule,
    NewsletterModule,
    EmailModule,
    PrayerRequestsModule,
    FinancialModule,
    EventsModule,
    SchedulerModule,
    AnalyticsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
