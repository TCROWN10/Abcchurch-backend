import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { DonationType } from '@prisma/client';
import Stripe from 'stripe';
import { ConfigService } from '@nestjs/config';
import { OutboxService } from 'src/outbox/outbox.service';

@Injectable()
export class DonationsService {
  private readonly logger = new Logger(DonationsService.name);
  private readonly stripe: Stripe;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly outboxService: OutboxService,
  ) {
    const stripeSecretKey = this.configService.getOrThrow('STRIPE_SECRET_KEY');
    this.stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2025-12-15.clover',
    });
  }

  /**
   * Create a Stripe checkout session for donation
   */
  async createCheckoutSession(
    userId: number,
    amount: number,
    type: DonationType,
    currency: string = 'USD',
    isRecurring: boolean = false,
    recurringPeriod?: string,
  ) {
    // Check for duplicate donation within 1 hour (same user, same type)
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);

    const existingDonation = await this.prisma.donation.findFirst({
      where: {
        userId,
        type,
        status: 'pending',
        createdAt: {
          gte: oneHourAgo,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    let donation;
    if (existingDonation) {
      // Update existing donation instead of creating new one
      donation = await this.prisma.donation.update({
        where: { id: existingDonation.id },
        data: {
          amount,
          currency,
          isRecurring,
          recurringPeriod,
          updatedAt: new Date(),
        },
      });
    } else {
      // Create new donation
      donation = await this.prisma.donation.create({
        data: {
          userId,
          type,
          amount,
          currency,
          isRecurring,
          recurringPeriod,
          status: 'pending',
        },
      });
    }

    const session = await this.stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: currency.toLowerCase(),
            product_data: {
              name: `${type} - ABC Church`,
              description: `Thank you for your ${type.toLowerCase()}`,
            },
            unit_amount: Math.round(amount * 100), // Convert to cents
            ...(isRecurring && {
              recurring: {
                interval: recurringPeriod === 'monthly' ? 'month' : 'week',
              },
            }),
          },
          quantity: 1,
        },
      ],
      mode: isRecurring ? 'subscription' : 'payment',
      success_url: `${this.configService.get('FRONTEND_URL')}/donations/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${this.configService.get('FRONTEND_URL')}/donations/cancel`,
      metadata: {
        donationId: donation.id,
        userId: userId.toString(),
        type,
      },
      customer_email: (await this.prisma.user.findUnique({ where: { id: userId } }))?.email,
    });

    await this.prisma.donation.update({
      where: { id: donation.id },
      data: { stripeSessionId: session.id },
    });

    return { sessionId: session.id, url: session.url, donationId: donation.id };
  }

  /**
   * Handle Stripe webhook
   */
  async handleStripeWebhook(event: Stripe.Event) {
    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'payment_intent.succeeded':
        await this.handlePaymentSucceeded(event.data.object as Stripe.PaymentIntent);
        break;
      case 'invoice.payment_succeeded':
        await this.handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;
    }
  }

  private async handleCheckoutCompleted(session: Stripe.Checkout.Session) {
    const donationId = session.metadata?.donationId;
    if (!donationId) return;

    let paymentIntent = '';
    if (session.payment_intent) {
      if (typeof session.payment_intent === 'string') {
        paymentIntent = session.payment_intent;
      } else {
        paymentIntent = session.payment_intent.id || '';
      }
    }

    const donation = await this.prisma.donation.update({
      where: { id: donationId },
      data: {
        stripePaymentId: paymentIntent,
        status: 'completed',
      },
    });

    // Create outbox event for donation confirmation email
    await this.outboxService.createEvent({
      eventType: 'donation.completed',
      payload: {
        donationId,
        userId: session.metadata?.userId,
        amount: Number(donation.amount),
        type: donation.type,
        timestamp: new Date().toISOString(),
      },
    });

    this.logger.log(`Donation completed: ${donationId}`);
  }

  private async handlePaymentSucceeded(paymentIntent: Stripe.PaymentIntent) {
    // Handle one-time payment
    const donation = await this.prisma.donation.findFirst({
      where: { stripePaymentId: paymentIntent.id },
    });

    if (donation) {
      await this.prisma.donation.update({
        where: { id: donation.id },
        data: { status: 'completed' },
      });
    }
  }

  private async handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
    // Handle recurring payment
    // Note: invoice.subscription is a string ID or Subscription object
    const subscriptionId = (invoice as any).subscription 
      ? (typeof (invoice as any).subscription === 'string' 
          ? (invoice as any).subscription 
          : ((invoice as any).subscription as Stripe.Subscription)?.id || 'unknown')
      : 'unknown';
    // Find donation by subscription metadata or create new record
    this.logger.log(`Recurring payment received for subscription: ${subscriptionId}`);
  }

  /**
   * Get user donations
   */
  async getUserDonations(userId: number, filters?: { type?: DonationType; status?: string }) {
    return this.prisma.donation.findMany({
      where: {
        userId,
        ...(filters?.type && { type: filters.type }),
        ...(filters?.status && { status: filters.status }),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get all donations (Super Admin only)
   */
  async getAllDonations(filters?: {
    type?: DonationType;
    status?: string;
    startDate?: Date;
    endDate?: Date;
  }) {
    const where: any = {
      ...(filters?.type && { type: filters.type }),
      ...(filters?.status && { status: filters.status }),
      ...(filters?.startDate &&
        filters?.endDate && {
          createdAt: {
            gte: filters.startDate,
            lte: filters.endDate,
          },
        }),
    };

    return this.prisma.donation.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            details: {
              select: {
                name: true,
                lastName: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get donation statistics
   */
  async getDonationStats(startDate?: Date, endDate?: Date) {
    const where: any = {
      status: 'completed',
      ...(startDate &&
        endDate && {
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        }),
    };

    const [total, byType, count] = await Promise.all([
      this.prisma.donation.aggregate({
        where,
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.donation.groupBy({
        by: ['type'],
        where,
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.donation.count({ where }),
    ]);

    return {
      totalAmount: total._sum.amount || 0,
      totalCount: count,
      byType: byType.map((item) => ({
        type: item.type,
        amount: item._sum.amount || 0,
        count: item._count,
      })),
    };
  }
}

