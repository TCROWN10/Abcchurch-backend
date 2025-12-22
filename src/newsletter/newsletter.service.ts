import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { EmailService } from 'src/email/email.service';

@Injectable()
export class NewsletterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  async subscribe(userId: number, preferences?: { messageUpdates?: boolean; newsUpdates?: boolean }) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { details: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Check if subscription exists
    const existing = await this.prisma.newsletterSubscription.findFirst({
      where: { email: user.email },
    });

    if (existing) {
      return this.prisma.newsletterSubscription.update({
        where: { id: existing.id },
        data: {
          userId,
          isActive: true,
          preferences: preferences || {},
          unsubscribedAt: null,
        },
      });
    }

    const subscription = await this.prisma.newsletterSubscription.create({
      data: {
        userId,
        email: user.email,
        isActive: true,
        preferences: preferences || { messageUpdates: true, newsUpdates: true },
      },
    });

    return subscription;
  }

  async subscribeByEmail(email: string, preferences?: { messageUpdates?: boolean; newsUpdates?: boolean }) {
    // Check if user exists with this email
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (user) {
      // User exists, create subscription with userId
      // Check if subscription already exists
      const existing = await this.prisma.newsletterSubscription.findFirst({
        where: { email },
      });

      if (existing) {
        return this.prisma.newsletterSubscription.update({
          where: { id: existing.id },
          data: {
            userId: user.id,
            isActive: true,
            preferences: preferences || {},
            unsubscribedAt: null,
          },
        });
      }

      return this.prisma.newsletterSubscription.create({
        data: {
          userId: user.id,
          email: user.email,
          isActive: true,
          preferences: preferences || { messageUpdates: true, newsUpdates: true },
        },
      });
    } else {
      // User doesn't exist, create subscription without userId (email-only)
      const existing = await this.prisma.newsletterSubscription.findFirst({
        where: { email },
      });

      if (existing) {
        return this.prisma.newsletterSubscription.update({
          where: { id: existing.id },
          data: {
            isActive: true,
            preferences: preferences || {},
            unsubscribedAt: null,
          },
        });
      }

      // Create new email-only subscription (userId is null)
      return this.prisma.newsletterSubscription.create({
        data: {
          email,
          userId: null,
          isActive: true,
          preferences: preferences || { messageUpdates: true, newsUpdates: true },
        },
      });
    }
  }

  async unsubscribeByEmail(email: string) {
    return this.prisma.newsletterSubscription.updateMany({
      where: { email },
      data: {
        isActive: false,
        unsubscribedAt: new Date(),
      },
    });
  }

  async unsubscribe(userId: number) {
    return this.prisma.newsletterSubscription.updateMany({
      where: { userId },
      data: {
        isActive: false,
        unsubscribedAt: new Date(),
      },
    });
  }

  async getSubscriptions(userId?: number) {
    if (userId) {
      return this.prisma.newsletterSubscription.findMany({
        where: { userId },
      });
    }
    return this.prisma.newsletterSubscription.findMany({
      where: { isActive: true },
      include: { user: { include: { details: true } } },
    });
  }

  async sendToSubscribers(subject: string, content: string, emailType: string = 'newsletter') {
    const subscribers = await this.prisma.newsletterSubscription.findMany({
      where: { isActive: true },
      include: { user: true },
    });

    const results: Array<{ email: string; status: string; error?: string }> = [];
    for (const subscriber of subscribers) {
      try {
        await this.emailService.sendEmail({
          to: subscriber.email,
          subject,
          htmlContent: content,
          emailType,
          userId: subscriber.userId ?? undefined,
        });
        results.push({ email: subscriber.email, status: 'sent' });
      } catch (error: any) {
        results.push({ email: subscriber.email, status: 'failed', error: error?.message || 'Unknown error' });
      }
    }

    return results;
  }
}

