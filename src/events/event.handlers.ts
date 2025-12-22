import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EmailService } from 'src/email/email.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { NewsletterService } from 'src/newsletter/newsletter.service';
import { FinancialService } from 'src/financial/financial.service';
import { OutboxService } from 'src/outbox/outbox.service';

@Injectable()
export class EventHandlers {
  private readonly logger = new Logger(EventHandlers.name);

  constructor(
    private readonly emailService: EmailService,
    private readonly prisma: PrismaService,
    private readonly newsletterService: NewsletterService,
    private readonly financialService: FinancialService,
    private readonly eventEmitter: EventEmitter2,
    private readonly outboxService: OutboxService,
  ) {}

  @OnEvent('donation.completed')
  async handleDonationCompleted(payload: Record<string, any>) {
    try {
      const donationId = payload.donationId || payload.id;
      const userId = payload.userId || payload.user?.id;

      if (!donationId) {
        this.logger.error('Donation ID missing in payload');
        return;
      }

      const donation = await this.prisma.donation.findUnique({
        where: { id: donationId },
        include: { user: true },
      });

      if (donation && donation.user) {
        await this.emailService.sendDonationConfirmationEmail(
          donation.user.email,
          Number(donation.amount),
          donation.type,
          donation.userId,
        );
        this.logger.log(`Donation confirmation email sent for donation ${donationId}`);
      }
    } catch (error) {
      this.logger.error(`Failed to handle donation.completed event:`, error);
    }
  }

  @OnEvent('message.published')
  async handleMessagePublished(payload: Record<string, any>) {
    try {
      const messageId = payload.messageId || payload.id;
      const messageType = payload.type || payload.messageType;

      if (!messageId) {
        this.logger.error('Message ID missing in payload');
        return;
      }

      const message = await this.prisma.message.findUnique({
        where: { id: messageId },
      });

      if (message) {
        // Get subscribers who want message updates
        const subscribers = await this.prisma.newsletterSubscription.findMany({
          where: {
            isActive: true,
            preferences: {
              path: ['messageUpdates'],
              equals: true,
            },
          },
          include: { user: true },
        });

        // Send email to each subscriber
        for (const subscriber of subscribers) {
          try {
            await this.emailService.sendMessageUpdateEmail(
              subscriber.email,
              message.title,
              messageType || message.type,
            );
          } catch (error) {
            this.logger.error(`Failed to send message update to ${subscriber.email}:`, error);
          }
        }

        this.logger.log(`Message update emails sent for message ${messageId}`);
      }
    } catch (error) {
      this.logger.error(`Failed to handle message.published event:`, error);
    }
  }

  @OnEvent('birthday.check')
  async handleBirthdayCheck(payload: Record<string, any>) {
    try {
      const today = new Date();
      const todayMonth = today.getMonth() + 1;
      const todayDay = today.getDate();
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

      // Find users with birthdays today who haven't been wished yet
      const users = await this.prisma.user.findMany({
        where: {
          details: {
            dob: {
              not: null,
            },
            // Only get users who haven't been wished today
            OR: [
              { birthdayWished: false },
              { birthdayWishedAt: { lt: todayStart } }, // Reset if it's a new day
            ],
          },
        },
        include: {
          details: true,
        },
      });

      const birthdayUsers = users.filter((user) => {
        if (!user.details?.dob) return false;
        const dob = new Date(user.details.dob);
        const isBirthday = dob.getMonth() + 1 === todayMonth && dob.getDate() === todayDay;
        // Also check if already wished today
        const alreadyWished = user.details.birthdayWished && 
          user.details.birthdayWishedAt && 
          new Date(user.details.birthdayWishedAt) >= todayStart;
        return isBirthday && !alreadyWished;
      });

      let sentCount = 0;
      for (const user of birthdayUsers) {
        try {
          const name = user.details?.name || 'Friend';
          await this.emailService.sendBirthdayEmail(user.id, user.email, name);
          
          // Mark as wished
          await this.prisma.userDetails.update({
            where: { id: user.detailsId! },
            data: {
              birthdayWished: true,
              birthdayWishedAt: new Date(),
            },
          });
          
          sentCount++;
          this.logger.log(`Birthday email sent to ${user.email}`);
        } catch (error) {
          this.logger.error(`Failed to send birthday email to ${user.email}:`, error);
        }
      }

      this.logger.log(`Birthday check completed. Sent ${sentCount} birthday emails (${birthdayUsers.length} total with birthdays today)`);
    } catch (error) {
      this.logger.error(`Failed to handle birthday.check event:`, error);
      throw error;
    }
  }

  @OnEvent('auth.send-otp')
  async handleSendOtp(payload: Record<string, any>) {
    try {
      const { userId, email } = payload;
      
      // Generate 6-digit OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 10); // 10 minutes expiry

      // Delete old unused OTPs for this user
      await this.prisma.otpCode.deleteMany({
        where: {
          userId,
          used: false,
        },
      });

      // Create new OTP
      await this.prisma.otpCode.create({
        data: {
          userId,
          code: otp,
          expiresAt,
        },
      });

      // Create outbox event to send email asynchronously
      await this.outboxService.createEvent({
        eventType: 'email.otp',
        payload: {
          userId,
          email,
          otp,
        },
      });

      this.logger.log(`OTP generated and email queued for user ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to handle send OTP event:`, error);
    }
  }

  @OnEvent('email.otp')
  async handleOtpEmail(payload: Record<string, any>) {
    try {
      const { userId, email, otp } = payload;

      const htmlContent = `
        <html>
          <body>
            <h2>Email Verification Code</h2>
            <p>Your verification code is: <strong>${otp}</strong></p>
            <p>This code will expire in 10 minutes.</p>
            <p>If you didn't request this code, please ignore this email.</p>
            <p>Blessings,<br>The ABC Church Family</p>
          </body>
        </html>
      `;

      await this.emailService.sendEmail({
        to: email,
        subject: 'ABC Church - Email Verification Code',
        htmlContent,
        emailType: 'otp',
        userId,
      });

      this.logger.log(`OTP email sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send OTP email:`, error);
    }
  }

  @OnEvent('donation.check-pending')
  async handleCheckPendingDonations(payload: Record<string, any>) {
    try {
      const cutoffTime = new Date(payload.cutoffTime);
      
      const pendingDonations = await this.prisma.donation.findMany({
        where: {
          status: 'pending',
          createdAt: {
            lt: cutoffTime,
          },
        },
        include: { user: true },
      });

      for (const donation of pendingDonations) {
        // Mark as failed
        await this.prisma.donation.update({
          where: { id: donation.id },
          data: { status: 'failed' },
        });

        // Create outbox event to send email notification asynchronously
        if (donation.user) {
          await this.outboxService.createEvent({
            eventType: 'email.donation_failed',
            payload: {
              userId: donation.userId,
              email: donation.user.email,
              donationId: donation.id,
              type: donation.type,
              amount: Number(donation.amount),
            },
          });
        }
      }

      this.logger.log(`Marked ${pendingDonations.length} pending donations as failed`);
    } catch (error) {
      this.logger.error(`Failed to check pending donations:`, error);
    }
  }

  @OnEvent('birthday.reset')
  async handleBirthdayReset(payload: Record<string, any>) {
    try {
      // Reset all birthdayWished flags at midnight for new day
      const result = await this.prisma.userDetails.updateMany({
        where: {
          birthdayWished: true,
        },
        data: {
          birthdayWished: false,
          birthdayWishedAt: null,
        },
      });

      this.logger.log(`Reset ${result.count} birthdayWished flags for new day`);
    } catch (error) {
      this.logger.error('Failed to reset birthday flags:', error);
    }
  }

  @OnEvent('cleanup.outbox')
  async handleCleanupOutbox(payload: Record<string, any>) {
    try {
      const condition = payload.condition || {};
      const olderThanDays = condition.olderThanDays || 7;
      const status = condition.status || 'COMPLETED';

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const result = await this.prisma.outbox.deleteMany({
        where: {
          status: status as any,
          processedAt: {
            lt: cutoffDate,
          },
        },
      });

      this.logger.log(`Cleaned up ${result.count} old outbox events (older than ${olderThanDays} days)`);
    } catch (error) {
      this.logger.error('Failed to cleanup outbox events:', error);
      throw error;
    }
  }

  @OnEvent('financial.export')
  async handleFinancialExport(payload: Record<string, any>) {
    try {
      const format = payload.format || payload.type;
      const filters = payload.filters || {};
      const recipientEmail = payload.recipientEmail || payload.email;
      
      if (!format || !recipientEmail) {
        this.logger.error('Missing required fields for financial export', { format, recipientEmail });
        return;
      }

      let fileBuffer: Buffer;
      let fileName: string;
      let contentType: string;

      if (format === 'excel') {
        const workbook = await this.financialService.exportToExcel(filters);
        fileBuffer = Buffer.from(await workbook.xlsx.writeBuffer());
        fileName = `donations_${new Date().toISOString().split('T')[0]}.xlsx`;
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      } else if (format === 'pdf') {
        fileBuffer = await this.financialService.exportToPDF(filters);
        fileName = `donations_${new Date().toISOString().split('T')[0]}.pdf`;
        contentType = 'application/pdf';
      } else {
        throw new Error(`Unsupported format: ${format}`);
      }

      // Send email with report info
      const filterSummary: string[] = [];
      if (filters.today) filterSummary.push('Today');
      if (filters.type) filterSummary.push(`Type: ${filters.type}`);
      if (filters.startDate) filterSummary.push(`From: ${filters.startDate}`);
      if (filters.endDate) filterSummary.push(`To: ${filters.endDate}`);

      const htmlContent = `
        <html>
          <body>
            <h2>Financial Report</h2>
            <p>Your financial report has been generated successfully.</p>
            <p><strong>Format:</strong> ${format.toUpperCase()}</p>
            <p><strong>Filters:</strong> ${filterSummary.join(', ') || 'All donations'}</p>
            <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
            <p>Note: File attachment support will be added in a future update.</p>
          </body>
        </html>
      `;

      await this.emailService.sendEmail({
        to: recipientEmail,
        subject: `Financial Report - ${format.toUpperCase()}`,
        htmlContent,
        emailType: 'financial_export',
        userId: payload.requestedBy,
      });

      this.logger.log(`Financial export ${format} notification sent to ${recipientEmail}`);
    } catch (error) {
      this.logger.error('Failed to handle financial export event:', error);
      throw error;
    }
  }
}

