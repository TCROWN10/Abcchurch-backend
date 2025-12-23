import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Mailjet from 'node-mailjet';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly mailjet: Mailjet;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const apiKey = this.configService.getOrThrow('MAILJET_API_KEY');
    const apiSecret = this.configService.getOrThrow('MAILJET_API_SECRET');
    this.mailjet = new Mailjet({
      apiKey,
      apiSecret,
    });
  }

  async sendEmail(data: {
    to: string;
    subject: string;
    htmlContent: string;
    textContent?: string;
    emailType: string;
    userId?: number;
  }) {
    try {
      this.logger.log(`=== Sending Email ===`);
      this.logger.log(`To: ${data.to}`);
      this.logger.log(`Subject: ${data.subject}`);
      this.logger.log(`Type: ${data.emailType}`);
      
      const fromEmail = this.configService.getOrThrow('MAILJET_FROM_EMAIL');
      const fromName = this.configService.get('MAILJET_FROM_NAME') || 'ABC Church';
      
      this.logger.log(`From: ${fromEmail} (${fromName})`);
      
      const result: any = await this.mailjet.post('send', { version: 'v3.1' }).request({
        Messages: [
          {
            From: {
              Email: fromEmail,
              Name: fromName,
            },
            To: [
              {
                Email: data.to,
              },
            ],
            Subject: data.subject,
            TextPart: data.textContent || data.subject,
            HTMLPart: data.htmlContent,
          },
        ],
      });

      this.logger.log(`Mailjet API Response: ${JSON.stringify(result.body)}`);

      const messageId = result.body?.Messages?.[0]?.To?.[0]?.MessageID || 'unknown';

      // Log email
      await this.prisma.emailLog.create({
        data: {
          userId: data.userId,
          recipientEmail: data.to,
          subject: data.subject,
          emailType: data.emailType,
          status: 'sent',
          mailjetMessageId: messageId.toString(),
          sentAt: new Date(),
        },
      });

      this.logger.log(`Email sent successfully to ${data.to}: ${messageId}`);
      this.logger.log('=====================');
      return { success: true, messageId };
    } catch (error) {
      this.logger.error(`=== Failed to send email to ${data.to} ===`);
      this.logger.error(`Error: ${error.message}`);
      this.logger.error(`Stack: ${error.stack}`);
      this.logger.error('==========================================');

      // Log failed email
      try {
        await this.prisma.emailLog.create({
          data: {
            userId: data.userId,
            recipientEmail: data.to,
            subject: data.subject,
            emailType: data.emailType,
            status: 'failed',
            errorMessage: error.message,
          },
        });
      } catch (logError) {
        this.logger.error(`Failed to log email error: ${logError.message}`);
      }

      throw error;
    }
  }

  async sendBirthdayEmail(userId: number, email: string, name: string) {
    const htmlContent = `
      <html>
        <body>
          <h2>Happy Birthday ${name}!</h2>
          <p>We at ABC Church want to wish you a blessed and wonderful birthday!</p>
          <p>May God's grace and love be with you on this special day and throughout the year.</p>
          <p>Blessings,<br>The ABC Church Family</p>
        </body>
      </html>
    `;

    return this.sendEmail({
      to: email,
      subject: 'Happy Birthday from ABC Church!',
      htmlContent,
      emailType: 'birthday',
      userId,
    });
  }

  async sendMessageUpdateEmail(email: string, messageTitle: string, messageType: string) {
    const htmlContent = `
      <html>
        <body>
          <h2>New ${messageType} Message Available</h2>
          <p>A new message "${messageTitle}" has been published.</p>
          <p>Visit our website to watch or listen to the message.</p>
          <p>Blessings,<br>The ABC Church Family</p>
        </body>
      </html>
    `;

    return this.sendEmail({
      to: email,
      subject: `New ${messageType} Message: ${messageTitle}`,
      htmlContent,
      emailType: 'message_update',
    });
  }

  async sendDonationConfirmationEmail(email: string, amount: number, type: string, userId?: number) {
    const htmlContent = `
      <html>
        <body>
          <h2>Thank You for Your ${type}</h2>
          <p>We have received your ${type.toLowerCase()} of $${amount.toFixed(2)}.</p>
          <p>Your generosity helps us continue our mission and serve our community.</p>
          <p>May God bless you abundantly!</p>
          <p>Blessings,<br>The ABC Church Family</p>
        </body>
      </html>
    `;

    return this.sendEmail({
      to: email,
      subject: `Thank You for Your ${type}`,
      htmlContent,
      emailType: 'donation_confirmation',
      userId,
    });
  }

  async sendWelcomeEmail(userId: number, email: string, name: string) {
    const htmlContent = `
      <html>
        <body>
          <h2>Welcome to ABC Church, ${name}!</h2>
          <p>We're thrilled to have you join our church family!</p>
          <p>Your email has been successfully verified, and your account is now active.</p>
          <p>You can now:</p>
          <ul>
            <li>Access all church resources and messages</li>
            <li>Make donations and tithes</li>
            <li>Submit prayer requests</li>
            <li>Subscribe to our newsletter for updates</li>
          </ul>
          <p>If you have any questions or need assistance, please don't hesitate to reach out to us.</p>
          <p>We look forward to seeing you at our services!</p>
          <p>Blessings,<br>The ABC Church Family</p>
        </body>
      </html>
    `;

    return this.sendEmail({
      to: email,
      subject: 'Welcome to ABC Church!',
      htmlContent,
      emailType: 'welcome',
      userId,
    });
  }
}

