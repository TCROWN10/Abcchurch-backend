import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Req,
  Query,
  HttpCode,
  Headers,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { DonationsService } from './donations.service';
import { JwtGuard } from 'src/guards/jwt.guard';
import { RolesGuard, Roles } from 'src/guards/roles.guard';
import { UserRole, DonationType } from '@prisma/client';
import { buildAppResponse } from 'src/utils/app_response.utils';
import { z } from 'zod';
import type { Request } from 'express';

const createDonationSchema = z.object({
  amount: z.number().positive(),
  type: z.enum(['TITHE', 'OFFERING', 'DONATION']),
  currency: z.string().default('USD'),
  isRecurring: z.boolean().default(false),
  recurringPeriod: z.enum(['monthly', 'weekly', 'yearly']).optional(),
  designation: z.string().max(500).optional(),
  displayCategory: z.string().max(120).optional(),
});

const createGuestDonationSchema = createDonationSchema.extend({
  email: z.string().email(),
  guestName: z.string().max(120).optional(),
});

@ApiTags('Donations')
@Controller('donations')
export class DonationsController {
  constructor(private readonly donationsService: DonationsService) {}

  @Post('create-checkout')
  @UseGuards(JwtGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Create Stripe checkout session',
    description: 'Create a Stripe checkout session for donation payment (requires login)',
  })
  @ApiBody({
    schema: {
      example: {
        amount: 50,
        type: 'TITHE',
        currency: 'USD',
        isRecurring: false,
        displayCategory: 'Tithes',
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Checkout session created successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async createCheckout(@Req() req: { user: { id: number } }, @Body() body: unknown) {
    const parsed = createDonationSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid donation payload',
        issues: parsed.error.flatten(),
      });
    }
    const validated = parsed.data;
    const result = await this.donationsService.createCheckoutSession(
      req.user.id,
      validated.amount,
      validated.type as DonationType,
      validated.currency,
      validated.isRecurring,
      validated.recurringPeriod,
      validated.designation,
      validated.displayCategory,
    );
    return buildAppResponse(result, 'Checkout session created', 200, '/api/donations/create-checkout');
  }

  @Post('create-checkout-guest')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Create Stripe checkout session (Guest)',
    description: 'Create a Stripe checkout session without authentication using guest email',
  })
  @ApiBody({
    schema: {
      example: {
        email: 'guest@example.com',
        guestName: 'Guest Donor',
        amount: 50,
        type: 'DONATION',
        currency: 'USD',
        isRecurring: false,
        displayCategory: 'General Giving',
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Guest checkout session created successfully' })
  async createGuestCheckout(@Body() body: unknown) {
    const parsed = createGuestDonationSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid guest donation payload',
        issues: parsed.error.flatten(),
      });
    }
    const validated = parsed.data;
    const result = await this.donationsService.createGuestCheckoutSession(
      validated.email,
      validated.amount,
      validated.type as DonationType,
      validated.currency,
      validated.isRecurring,
      validated.recurringPeriod,
      validated.designation,
      validated.displayCategory,
      validated.guestName,
    );
    return buildAppResponse(
      result,
      'Guest checkout session created',
      200,
      '/api/donations/create-checkout-guest',
    );
  }

  @Get('my-donations')
  @UseGuards(JwtGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get user donations', description: 'Get all donations made by the authenticated user' })
  @ApiQuery({ name: 'type', required: false, enum: ['TITHE', 'OFFERING', 'DONATION'], description: 'Filter by donation type' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status (pending, completed, failed)' })
  @ApiResponse({ status: 200, description: 'Donations retrieved successfully' })
  async getMyDonations(
    @Req() req: { user: { id: number } },
    @Query('type') type?: string,
    @Query('status') status?: string,
  ) {
    const donations = await this.donationsService.getUserDonations(req.user.id, {
      type: type as DonationType,
      status,
    });
    return buildAppResponse(donations, 'Donations retrieved', 200, '/api/donations/my-donations');
  }

  @Get('all')
  @UseGuards(JwtGuard, RolesGuard)
  @ApiBearerAuth('JWT-auth')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Get all donations (Super Admin only)',
    description: 'Get all donations in the system with filtering options',
  })
  @ApiQuery({ name: 'type', required: false, enum: ['TITHE', 'OFFERING', 'DONATION'] })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'startDate', required: false, type: String, example: '2024-01-01' })
  @ApiQuery({ name: 'endDate', required: false, type: String, example: '2024-12-31' })
  @ApiResponse({ status: 200, description: 'All donations retrieved' })
  @ApiResponse({ status: 403, description: 'Forbidden - Super Admin access required' })
  async getAllDonations(
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const donations = await this.donationsService.getAllDonations({
      type: type as DonationType,
      status,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
    return buildAppResponse(donations, 'All donations retrieved', 200, '/api/donations/all');
  }

  @Get('stats')
  @UseGuards(JwtGuard, RolesGuard)
  @ApiBearerAuth('JWT-auth')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Get donation statistics (Super Admin only)',
    description: 'Get aggregated donation statistics',
  })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Statistics retrieved' })
  async getStats(@Query('startDate') startDate?: string, @Query('endDate') endDate?: string) {
    const stats = await this.donationsService.getDonationStats(
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
    return buildAppResponse(stats, 'Donation statistics retrieved', 200, '/api/donations/stats');
  }

  @Get('subscriptions')
  @UseGuards(JwtGuard, RolesGuard)
  @ApiBearerAuth('JWT-auth')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'List recurring donation subscriptions (Super Admin)',
    description:
      'Returns Stripe-linked recurring donations from the database. Optional `subscriptionId` returns a single row by Stripe subscription id (legacy compat with Next `/api/subscriptions`).',
  })
  @ApiQuery({ name: 'subscriptionId', required: false, description: 'Stripe subscription id (e.g. sub_...)' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by Stripe subscription status' })
  @ApiQuery({ name: 'category', required: false, description: 'Filter by display category (metadata)' })
  @ApiQuery({ name: 'customerEmail', required: false, description: 'Filter by donor email (contains)' })
  @ApiResponse({ status: 200, description: 'Subscriptions retrieved' })
  @ApiResponse({ status: 404, description: 'Subscription not found (when subscriptionId is set)' })
  async listSubscriptions(
    @Query('subscriptionId') subscriptionId?: string,
    @Query('status') status?: string,
    @Query('category') category?: string,
    @Query('customerEmail') customerEmail?: string,
  ) {
    if (subscriptionId?.trim()) {
      const row = await this.donationsService.getDonationSubscriptionByStripeId(subscriptionId.trim());
      if (!row) {
        throw new NotFoundException('Subscription not found');
      }
      return buildAppResponse(row, 'Subscription retrieved', 200, '/api/donations/subscriptions');
    }
    const { records, total } = await this.donationsService.listDonationSubscriptions({
      status,
      category,
      customerEmail,
    });
    return buildAppResponse(
      { data: records, total },
      'Subscriptions retrieved',
      200,
      '/api/donations/subscriptions',
    );
  }

  @Get('checkout-session')
  @ApiOperation({
    summary: 'Get Stripe checkout session (Public)',
    description:
      'Returns session details for the thank-you or cancel page. Does not change donation status.',
  })
  @ApiQuery({ name: 'session_id', required: true, description: 'Stripe Checkout Session ID' })
  @ApiResponse({ status: 200, description: 'Session retrieved' })
  @ApiResponse({ status: 400, description: 'Invalid session ID' })
  async getCheckoutSession(@Query('session_id') sessionId: string) {
    if (!sessionId?.trim()) {
      throw new BadRequestException('session_id is required');
    }
    const data = await this.donationsService.getCheckoutSessionPreview(sessionId.trim());
    return buildAppResponse(data, 'Checkout session retrieved', 200, '/api/donations/checkout-session');
  }

  @Get('success')
  @ApiOperation({
    summary: 'Donation success callback (Public)',
    description:
      'Verify and update donation status after successful Stripe payment. Called when user is redirected from Stripe.',
  })
  @ApiQuery({ name: 'session_id', required: true, description: 'Stripe checkout session ID' })
  @ApiResponse({ status: 200, description: 'Donation verified successfully' })
  @ApiResponse({ status: 400, description: 'Invalid session ID or donation not found' })
  async handleSuccess(@Query('session_id') sessionId: string) {
    try {
      if (!sessionId?.trim()) {
        return buildAppResponse(
          { error: 'session_id is required' },
          'Failed to verify donation',
          400,
          '/api/donations/success',
        );
      }
      const result = await this.donationsService.verifyCheckoutSession(sessionId.trim());
      return buildAppResponse(result, 'Donation verified successfully', 200, '/api/donations/success');
    } catch (error) {
      return buildAppResponse(
        { error: error.message, sessionId },
        'Failed to verify donation',
        400,
        '/api/donations/success',
      );
    }
  }

  @Get('cancel')
  @ApiOperation({
    summary: 'Donation cancel callback (Public)',
    description: 'Handle when user cancels the Stripe checkout.',
  })
  @ApiResponse({ status: 200, description: 'Donation cancelled' })
  async handleCancel() {
    return buildAppResponse(
      { message: 'Donation was cancelled. You can try again anytime.' },
      'Donation cancelled',
      200,
      '/api/donations/cancel',
    );
  }

  @Post('webhook')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Stripe webhook endpoint',
    description:
      'Stripe sends signed POST requests here. Configure STRIPE_WEBHOOK_SECRET and point Stripe to {BACKEND_URL}/api/donations/webhook',
  })
  @ApiResponse({ status: 200, description: 'Webhook received' })
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | undefined,
  ) {
    const rawBody = req.rawBody;
    if (!rawBody) {
      throw new BadRequestException('Missing raw body (ensure Nest rawBody is enabled)');
    }
    await this.donationsService.handleStripeWebhookFromRequest(rawBody, signature);
    return { received: true };
  }
}
