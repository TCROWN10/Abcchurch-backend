import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { DonationType } from '@prisma/client';
import Stripe from 'stripe';
import { ConfigService } from '@nestjs/config';
import { OutboxService } from 'src/outbox/outbox.service';

export interface CheckoutSessionClientView {
  id: string;
  status: string;
  payment_status: string;
  amount_total: number | null;
  currency: string | null;
  customer_email: string | null;
  mode: string;
  metadata: Record<string, string>;
  created: number;
  formatted_amount: string | null;
  line_items: Array<{
    description: string | null;
    amount_total: number | null;
    formatted_amount: string | null;
    quantity: number | null;
  }>;
  subscription: {
    id: string;
    status: string | null;
    current_period_end: number | null;
  } | null;
  payment_intent: {
    id: string;
    status: string | null;
  } | null;
}

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
    try {
      this.stripe = new Stripe(stripeSecretKey);
      this.logger.log('Stripe initialized successfully');
    } catch (error) {
      this.logger.error(`Failed to initialize Stripe: ${error.message}`);
      this.logger.error(`Error stack: ${error.stack}`);
      throw error;
    }
  }

  private formatAmount(amountTotal: number | null, currency: string | null): string | null {
    if (amountTotal == null || !currency) return null;
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency.toUpperCase(),
      }).format(amountTotal / 100);
    } catch {
      return `$${(amountTotal / 100).toFixed(2)}`;
    }
  }

  private checkoutSessionToClientView(session: Stripe.Checkout.Session): CheckoutSessionClientView {
    const md = session.metadata ?? {};
    const meta: Record<string, string> = {};
    for (const [k, v] of Object.entries(md)) {
      if (v != null) meta[k] = String(v);
    }

    let paymentIntent: CheckoutSessionClientView['payment_intent'] = null;
    if (session.payment_intent) {
      if (typeof session.payment_intent === 'string') {
        paymentIntent = { id: session.payment_intent, status: null };
      } else {
        paymentIntent = {
          id: session.payment_intent.id,
          status: session.payment_intent.status ?? null,
        };
      }
    }

    let subscription: CheckoutSessionClientView['subscription'] = null;
    if (session.subscription) {
      if (typeof session.subscription === 'string') {
        subscription = { id: session.subscription, status: null, current_period_end: null };
      } else {
        const sub = session.subscription as Stripe.Subscription & {
          current_period_end?: number | null;
        };
        subscription = {
          id: sub.id,
          status: sub.status ?? null,
          current_period_end: sub.current_period_end ?? null,
        };
      }
    }

    return {
      id: session.id,
      status: session.status ?? 'open',
      payment_status: session.payment_status ?? 'unpaid',
      amount_total: session.amount_total,
      currency: session.currency,
      customer_email: session.customer_email ?? session.customer_details?.email ?? null,
      mode: session.mode,
      metadata: meta,
      created: session.created,
      formatted_amount: this.formatAmount(session.amount_total, session.currency),
      line_items: [],
      subscription,
      payment_intent: paymentIntent,
    };
  }

  private async findOrCreateGuestUser(email: string, fullName?: string): Promise<number> {
    const normalizedEmail = email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) {
      return existing.id;
    }

    const nameParts = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] ?? 'Guest';
    const lastName = nameParts.slice(1).join(' ') || 'Donor';

    const details = await this.prisma.userDetails.create({
      data: {
        name: firstName,
        lastName,
      },
    });

    const created = await this.prisma.user.create({
      data: {
        email: normalizedEmail,
        isEmailVerified: false,
        detailsId: details.id,
      },
    });
    return created.id;
  }

  async createGuestCheckoutSession(
    guestEmail: string,
    amount: number,
    type: DonationType,
    currency: string = 'USD',
    isRecurring: boolean = false,
    recurringPeriod?: string,
    designation?: string,
    displayCategory?: string,
    guestName?: string,
  ) {
    const userId = await this.findOrCreateGuestUser(guestEmail, guestName);
    return this.createCheckoutSession(
      userId,
      amount,
      type,
      currency,
      isRecurring,
      recurringPeriod,
      designation,
      displayCategory,
    );
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
    designation?: string,
    displayCategory?: string,
  ) {
    let donation;

    try {
      this.logger.log(`=== Creating Checkout Session ===`);
      this.logger.log(`UserId: ${userId}, Amount: ${amount}, Type: ${type}, Currency: ${currency}`);

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

      if (existingDonation) {
        this.logger.log(`Updating existing donation: ${existingDonation.id}`);
        donation = await this.prisma.donation.update({
          where: { id: existingDonation.id },
          data: {
            amount,
            currency,
            isRecurring,
            recurringPeriod,
            description: designation ?? existingDonation.description,
            updatedAt: new Date(),
          },
        });
      } else {
        this.logger.log('Creating new donation record');
        donation = await this.prisma.donation.create({
          data: {
            userId,
            type,
            amount,
            currency,
            isRecurring,
            recurringPeriod,
            status: 'pending',
            description: designation,
          },
        });
        this.logger.log(`Donation created in DB: ${donation.id}`);
      }

      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        throw new Error('User not found');
      }

      const frontendBase = (this.configService.get('FRONTEND_URL') || 'http://localhost:3000').replace(
        /\/$/,
        '',
      );
      const donationSuccessPath = this.configService.get<string>('DONATION_SUCCESS_PATH');
      const donationCancelPath = this.configService.get<string>('DONATION_CANCEL_PATH');

      const defaultSuccess = `${frontendBase}/donate/success?session_id={CHECKOUT_SESSION_ID}`;
      const defaultCancel = `${frontendBase}/donate/cancel?session_id={CHECKOUT_SESSION_ID}`;

      const withSessionPlaceholder = (base: string) =>
        base.includes('{CHECKOUT_SESSION_ID}')
          ? base
          : `${base}${base.includes('?') ? '&' : '?'}session_id={CHECKOUT_SESSION_ID}`;

      const successUrl = donationSuccessPath?.startsWith('http')
        ? withSessionPlaceholder(donationSuccessPath)
        : donationSuccessPath
          ? withSessionPlaceholder(`${frontendBase}${donationSuccessPath.startsWith('/') ? '' : '/'}${donationSuccessPath}`)
          : defaultSuccess;

      const cancelUrl = donationCancelPath?.startsWith('http')
        ? withSessionPlaceholder(donationCancelPath)
        : donationCancelPath
          ? withSessionPlaceholder(`${frontendBase}${donationCancelPath.startsWith('/') ? '' : '/'}${donationCancelPath}`)
          : defaultCancel;

      const recurringInterval: Stripe.PriceCreateParams.Recurring.Interval | undefined = isRecurring
        ? recurringPeriod === 'weekly'
          ? 'week'
          : recurringPeriod === 'yearly'
            ? 'year'
            : 'month'
        : undefined;

      const productName = displayCategory
        ? `${displayCategory} - ABC Church`
        : `${type} - ABC Church`;

      const session = await this.stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: currency.toLowerCase(),
              product_data: {
                name: productName,
                description: designation
                  ? `Thank you for your ${type.toLowerCase()}: ${designation}`
                  : `Thank you for your ${type.toLowerCase()}`,
              },
              unit_amount: Math.round(Number(amount) * 100),
              ...(isRecurring &&
                recurringInterval && {
                  recurring: {
                    interval: recurringInterval,
                  },
                }),
            },
            quantity: 1,
          },
        ],
        mode: isRecurring ? 'subscription' : 'payment',
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          donationId: donation.id,
          userId: userId.toString(),
          type,
          category: displayCategory ?? type,
          frequency: recurringPeriod ?? '',
        },
        customer_email: user.email,
      });

      this.logger.log(`Stripe session created: ${session.id}`);

      await this.prisma.donation.update({
        where: { id: donation.id },
        data: { stripeSessionId: session.id },
      });

      this.logger.log(`Donation ${donation.id} updated with Stripe session ID`);

      return { sessionId: session.id, url: session.url, donationId: donation.id };
    } catch (error) {
      this.logger.error('=== Error Creating Checkout Session ===');
      this.logger.error(`Error: ${error.message}`);
      this.logger.error(`Stack: ${error.stack}`);

      if (donation) {
        this.logger.log(`Marking donation ${donation.id} as failed due to Stripe error`);
        try {
          await this.prisma.donation.update({
            where: { id: donation.id },
            data: { status: 'failed' },
          });
        } catch (updateError) {
          this.logger.error(`Failed to update donation status: ${updateError.message}`);
        }
      }

      throw error;
    }
  }

  async handleStripeWebhookFromRequest(rawBody: Buffer, signature: string | undefined): Promise<void> {
    const webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!webhookSecret) {
      this.logger.error('STRIPE_WEBHOOK_SECRET is not configured');
      throw new BadRequestException('Webhook is not configured');
    }
    if (!signature) {
      throw new BadRequestException('Missing Stripe-Signature header');
    }
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err) {
      this.logger.warn(`Webhook signature verification failed: ${err.message}`);
      throw new BadRequestException('Invalid webhook signature');
    }
    await this.handleStripeWebhook(event);
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
      default:
        this.logger.debug(`Unhandled Stripe event type: ${event.type}`);
    }
  }

  private shouldMarkCheckoutCompleted(session: Stripe.Checkout.Session): boolean {
    const status = session.payment_status;
    if (status === 'paid' || status === 'no_payment_required') {
      return true;
    }
    if (session.mode === 'subscription' && status === 'unpaid') {
      return false;
    }
    return false;
  }

  /**
   * Handle checkout completed webhook event
   */
  private async handleCheckoutCompleted(session: Stripe.Checkout.Session) {
    this.logger.log(`=== Handling checkout.completed webhook ===`);
    this.logger.log(`Session ID: ${session.id}`);
    this.logger.log(`Payment Status: ${session.payment_status}`);

    const donationId = session.metadata?.donationId;
    if (!donationId) {
      this.logger.error('Donation ID not found in session metadata');
      return;
    }

    const existingDonation = await this.prisma.donation.findUnique({
      where: { id: donationId },
    });

    if (!existingDonation) {
      this.logger.error(`Donation ${donationId} not found`);
      return;
    }

    if (existingDonation.status === 'completed') {
      this.logger.log(`Donation ${donationId} already completed, skipping webhook processing`);
      return;
    }

    if (!this.shouldMarkCheckoutCompleted(session)) {
      this.logger.log(
        `Checkout session ${session.id} payment_status=${session.payment_status}; not marking donation completed yet`,
      );
      return;
    }

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
        stripePaymentId: paymentIntent || undefined,
        status: 'completed',
      },
    });

    await this.outboxService.createEvent({
      eventType: 'donation.completed',
      payload: {
        donationId: donationId,
        userId: session.metadata?.userId || String(donation.userId),
        amount: Number(donation.amount),
        type: donation.type,
        timestamp: new Date().toISOString(),
      },
    });

    this.logger.log(`Donation ${donationId} completed via webhook`);
  }

  private async handlePaymentSucceeded(paymentIntent: Stripe.PaymentIntent) {
    const donation = await this.prisma.donation.findFirst({
      where: { stripePaymentId: paymentIntent.id },
    });

    if (donation && donation.status !== 'completed') {
      await this.prisma.donation.update({
        where: { id: donation.id },
        data: { status: 'completed' },
      });
    }
  }

  private async handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
    const inv = invoice as Stripe.Invoice & {
      subscription?: string | Stripe.Subscription | null;
    };
    const subscriptionId = inv.subscription
      ? typeof inv.subscription === 'string'
        ? inv.subscription
        : inv.subscription.id
      : null;
    this.logger.log(
      `Recurring payment received for subscription: ${subscriptionId ?? 'unknown'} (invoice ${invoice.id})`,
    );
  }

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

  async getAllDonations(filters?: {
    type?: DonationType;
    status?: string;
    startDate?: Date;
    endDate?: Date;
  }) {
    const where: Record<string, unknown> = {
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
   * Public preview of a Checkout Session (success UI details or cancel page)
   */
  async getCheckoutSessionPreview(sessionId: string): Promise<CheckoutSessionClientView> {
    const session = await this.stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['line_items'],
    });
    const view = this.checkoutSessionToClientView(session);
    if (session.line_items?.data?.length) {
      view.line_items = session.line_items.data.map((item) => ({
        description: item.description,
        amount_total: item.amount_total,
        formatted_amount: this.formatAmount(item.amount_total, session.currency),
        quantity: item.quantity,
      }));
    }
    return view;
  }

  /**
   * Verify checkout session after successful payment (return trip from Stripe)
   */
  async verifyCheckoutSession(sessionId: string) {
    try {
      this.logger.log(`=== Verifying checkout session ===`);
      this.logger.log(`Session ID: ${sessionId}`);

      const session = await this.stripe.checkout.sessions.retrieve(sessionId, {
        expand: ['line_items'],
      });

      if (!session) {
        throw new Error('Session not found');
      }

      this.logger.log(`Session status: ${session.payment_status}`);
      this.logger.log(`Session mode: ${session.mode}`);

      const donationId = session.metadata?.donationId;
      if (!donationId) {
        throw new Error('Donation ID not found in session metadata');
      }

      const donation = await this.prisma.donation.findUnique({
        where: { id: donationId },
        include: { user: true },
      });

      if (!donation) {
        throw new Error('Donation not found');
      }

      const sessionView = this.checkoutSessionToClientView(session);
      const lineItems = session.line_items;
      if (lineItems && typeof lineItems === 'object' && 'data' in lineItems && Array.isArray(lineItems.data)) {
        sessionView.line_items = lineItems.data.map((item) => ({
          description: item.description,
          amount_total: item.amount_total,
          formatted_amount: this.formatAmount(item.amount_total, session.currency),
          quantity: item.quantity,
        }));
      }

      if (session.payment_status === 'paid' || session.payment_status === 'no_payment_required') {
        if (donation.status === 'completed') {
          return {
            verified: true,
            donationId: donation.id,
            donationStatus: donation.status,
            session: sessionView,
          };
        }

        let paymentIntent = '';
        if (session.payment_intent) {
          if (typeof session.payment_intent === 'string') {
            paymentIntent = session.payment_intent;
          } else {
            paymentIntent = session.payment_intent.id || '';
          }
        }

        await this.prisma.donation.update({
          where: { id: donation.id },
          data: {
            status: 'completed',
            stripePaymentId: paymentIntent || donation.stripePaymentId,
          },
        });

        await this.outboxService.createEvent({
          eventType: 'donation.completed',
          payload: {
            donationId: donation.id,
            userId: donation.userId,
            amount: Number(donation.amount),
            type: donation.type,
            timestamp: new Date().toISOString(),
          },
        });

        this.logger.log(`Donation ${donation.id} verified and marked as completed`);
        return {
          verified: true,
          donationId: donation.id,
          donationStatus: 'completed' as const,
          session: sessionView,
        };
      }

      this.logger.log(`Payment status is ${session.payment_status}, donation remains pending`);
      return {
        verified: false,
        donationId: donation.id,
        donationStatus: donation.status,
        session: sessionView,
      };
    } catch (error) {
      this.logger.error(`Failed to verify checkout session: ${error.message}`);
      throw error;
    }
  }

  async getDonationStats(startDate?: Date, endDate?: Date) {
    const where: Record<string, unknown> = {
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
