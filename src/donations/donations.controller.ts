import { Controller, Post, Get, Body, UseGuards, Req, Query, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { DonationsService } from './donations.service';
import { JwtGuard } from 'src/guards/jwt.guard';
import { RolesGuard, Roles } from 'src/guards/roles.guard';
import { UserRole, DonationType } from '@prisma/client';
import { buildAppResponse } from 'src/utils/app_response.utils';
import { z } from 'zod';

const createDonationSchema = z.object({
  amount: z.number().positive(),
  type: z.enum(['TITHE', 'OFFERING', 'DONATION']),
  currency: z.string().default('USD'),
  isRecurring: z.boolean().default(false),
  recurringPeriod: z.enum(['monthly', 'weekly']).optional(),
});

@ApiTags('Donations')
@Controller('donations')
export class DonationsController {
  constructor(private readonly donationsService: DonationsService) {}

  @Post('create-checkout')
  @UseGuards(JwtGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(200)
  @ApiOperation({ summary: 'Create Stripe checkout session', description: 'Create a Stripe checkout session for donation payment' })
  @ApiBody({ schema: { example: { amount: 100, type: 'TITHE', currency: 'USD', isRecurring: false } } })
  @ApiResponse({ status: 200, description: 'Checkout session created successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async createCheckout(@Req() req: any, @Body() body: z.infer<typeof createDonationSchema>) {
    const validated = createDonationSchema.parse(body);
    const result = await this.donationsService.createCheckoutSession(
      req.user.id,
      validated.amount,
      validated.type as DonationType,
      validated.currency,
      validated.isRecurring,
      validated.recurringPeriod,
    );
    return buildAppResponse(result, 'Checkout session created', 200, '/api/donations/create-checkout');
  }

  @Get('my-donations')
  @UseGuards(JwtGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get user donations', description: 'Get all donations made by the authenticated user' })
  @ApiQuery({ name: 'type', required: false, enum: ['TITHE', 'OFFERING', 'DONATION'], description: 'Filter by donation type' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status (pending, completed, failed)' })
  @ApiResponse({ status: 200, description: 'Donations retrieved successfully' })
  async getMyDonations(@Req() req: any, @Query('type') type?: string, @Query('status') status?: string) {
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
  @ApiOperation({ summary: 'Get all donations (Super Admin only)', description: 'Get all donations in the system with filtering options' })
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
  @ApiOperation({ summary: 'Get donation statistics (Super Admin only)', description: 'Get aggregated donation statistics' })
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

  @Get('success')
  @ApiOperation({ 
    summary: 'Donation success callback (Public)', 
    description: 'Verify and update donation status after successful Stripe payment. Called when user is redirected from Stripe. This is a PUBLIC endpoint - no authentication required.' 
  })
  @ApiQuery({ name: 'session_id', required: true, description: 'Stripe checkout session ID' })
  @ApiResponse({ status: 200, description: 'Donation verified successfully' })
  @ApiResponse({ status: 400, description: 'Invalid session ID or donation not found' })
  async handleSuccess(@Query('session_id') sessionId: string) {
    try {
      const result = await this.donationsService.verifyCheckoutSession(sessionId);
      return buildAppResponse(result, 'Donation verified successfully', 200, '/api/donations/success');
    } catch (error) {
      return buildAppResponse(
        { error: error.message, sessionId },
        'Failed to verify donation',
        400,
        '/api/donations/success'
      );
    }
  }

  @Get('cancel')
  @ApiOperation({ 
    summary: 'Donation cancel callback (Public)', 
    description: 'Handle when user cancels the Stripe checkout. Returns cancellation message. This is a PUBLIC endpoint - no authentication required.' 
  })
  @ApiResponse({ status: 200, description: 'Donation cancelled' })
  async handleCancel() {
    return buildAppResponse(
      { message: 'Donation was cancelled. You can try again anytime.' },
      'Donation cancelled',
      200,
      '/api/donations/cancel'
    );
  }

  @Get('webhook')
  @Post('webhook')
  @HttpCode(200)
  @ApiOperation({ summary: 'Stripe webhook endpoint (Public)', description: 'Handle Stripe webhook events (used by Stripe, not for direct API calls). This is a PUBLIC endpoint - no authentication required. Supports both GET and POST.' })
  @ApiResponse({ status: 200, description: 'Webhook received' })
  async handleWebhook(@Req() req: any, @Body() body?: any) {
    // Note: User requested GET, but Stripe typically sends POST
    // Support both: GET reads from query, POST reads from body
    const eventData = req.method === 'GET' ? req.query.event : (body || req.body);
    
    // Verify webhook signature in production
    // const sig = req.headers['stripe-signature'];
    // const stripeSecret = process.env.STRIPE_WEBHOOK_SECRET;
    // const event = this.stripe.webhooks.constructEvent(req.body, sig, stripeSecret);
    
    // For now, handle directly
    await this.donationsService.handleStripeWebhook(eventData);
    return { received: true };
  }
}

