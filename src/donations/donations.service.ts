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
    this.logger.log('=== Initializing Stripe ===');
    this.logger.log(`Stripe Secret Key: ${stripeSecretKey.substring(0, 10)}...`);
    
    try {
      // Use the API version that matches the Stripe package version
      // The package version determines the default API version
      this.stripe = new Stripe(stripeSecretKey, {
        apiVersion: '2025-12-15.clover',
      });
      this.logger.log('Stripe initialized successfully');
    } catch (error) {
      this.logger.error(`Failed to initialize Stripe: ${error.message}`);
      this.logger.error(`Error stack: ${error.stack}`);
      throw error;
    }
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
    let donation;
    
    try {
      this.logger.log(`=== Creating Checkout Session ===`);
      this.logger.log(`UserId: ${userId}, Amount: ${amount}, Type: ${type}, Currency: ${currency}`);
      
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

      if (existingDonation) {
        // Update existing donation instead of creating new one
        this.logger.log(`Updating existing donation: ${existingDonation.id}`);
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
          },
        });
        this.logger.log(`Donation created in DB: ${donation.id}`);
      }

      // Get user email for Stripe
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        throw new Error('User not found');
      }

      const backendUrl = this.configService.get('BACKEND_URL') || 'http://localhost:4000';
      const donationSuccessPath = this.configService.get('DONATION_SUCCESS_PATH') || '/api/donations/success';
      const donationCancelPath = this.configService.get('DONATION_CANCEL_PATH') || '/api/donations/cancel';
      
      // Build success URL - point directly to backend
      const successUrl = donationSuccessPath.startsWith('http') 
        ? `${donationSuccessPath}?session_id={CHECKOUT_SESSION_ID}`
        : `${backendUrl}${donationSuccessPath}?session_id={CHECKOUT_SESSION_ID}`;
      
      const cancelUrl = donationCancelPath.startsWith('http')
        ? donationCancelPath
        : `${backendUrl}${donationCancelPath}`;
      
      this.logger.log('Creating Stripe checkout session...');
      this.logger.log(`Backend URL: ${backendUrl}`);
      this.logger.log(`Success URL: ${successUrl}`);
      this.logger.log(`Cancel URL: ${cancelUrl}`);
      this.logger.log(`Mode: ${isRecurring ? 'subscription' : 'payment'}`);
      
      // Create Stripe checkout session
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
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          donationId: donation.id.toString(),
          userId: userId.toString(),
          type,
        },
        customer_email: user.email,
      });

      this.logger.log(`Stripe session created: ${session.id}`);
      this.logger.log(`Session URL: ${session.url}`);

      // Update donation with Stripe session ID
      await this.prisma.donation.update({
        where: { id: donation.id },
        data: { stripeSessionId: session.id },
      });

      this.logger.log(`Donation ${donation.id} updated with Stripe session ID`);
      this.logger.log('=== Checkout Session Created Successfully ===');

      return { sessionId: session.id, url: session.url, donationId: donation.id };
    } catch (error) {
      this.logger.error('=== Error Creating Checkout Session ===');
      this.logger.error(`Error: ${error.message}`);
      this.logger.error(`Stack: ${error.stack}`);
      
      // If donation was created but Stripe failed, mark it as failed
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
      
      this.logger.error('==========================================');
      throw error;
    }
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

  /**
   * Handle checkout completed webhook event
   * This is called by Stripe webhook (server-to-server) - more reliable than callback
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

    // Check if donation already processed
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

    let paymentIntent = '';
    if (session.payment_intent) {
      if (typeof session.payment_intent === 'string') {
        paymentIntent = session.payment_intent;
      } else {
        paymentIntent = session.payment_intent.id || '';
      }
    }

    // Update donation status
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
        donationId: donationId,
        userId: session.metadata?.userId || donation.userId,
        amount: Number(donation.amount),
        type: donation.type,
        timestamp: new Date().toISOString(),
      },
    });

    this.logger.log(`Donation ${donationId} completed via webhook`);
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
   * Verify checkout session after successful payment
   * Called when user is redirected from Stripe
   */
  async verifyCheckoutSession(sessionId: string) {
    try {
      this.logger.log(`=== Verifying checkout session ===`);
      this.logger.log(`Session ID: ${sessionId}`);

      // Retrieve the checkout session from Stripe
      const session = await this.stripe.checkout.sessions.retrieve(sessionId);

      if (!session) {
        throw new Error('Session not found');
      }

      this.logger.log(`Session status: ${session.payment_status}`);
      this.logger.log(`Session mode: ${session.mode}`);

      // Get donation ID from metadata
      const donationId = session.metadata?.donationId;
      if (!donationId) {
        throw new Error('Donation ID not found in session metadata');
      }

      // Find the donation (ID is UUID string in schema)
      const donation = await this.prisma.donation.findUnique({
        where: { id: donationId },
        include: { user: true },
      });

      if (!donation) {
        throw new Error('Donation not found');
      }

      // Update donation status based on payment status
      if (session.payment_status === 'paid') {
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
            stripePaymentId: paymentIntent,
          },
        });

        // Create outbox event for donation confirmation email
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
      } else {
        this.logger.log(`Payment status is ${session.payment_status}, donation remains pending`);
      }

      return {
        donationId: donation.id,
        status: session.payment_status === 'paid' ? 'completed' : donation.status,
        amount: Number(donation.amount),
        type: donation.type,
        sessionId: session.id,
      };
    } catch (error) {
      this.logger.error(`Failed to verify checkout session: ${error.message}`);
      throw error;
    }
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

