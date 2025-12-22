import { Controller, Post, Get, UseGuards, Req, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { NewsletterService } from './newsletter.service';
import { JwtGuard } from 'src/guards/jwt.guard';
import { buildAppResponse } from 'src/utils/app_response.utils';

@ApiTags('Newsletter')
@Controller('newsletter')
export class NewsletterController {
  constructor(private readonly newsletterService: NewsletterService) {}

  @Post('subscribe')
  @UseGuards(JwtGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Subscribe to newsletter (Authenticated)', description: 'Subscribe the authenticated user to the newsletter' })
  @ApiBody({ schema: { example: { preferences: { messageUpdates: true, newsUpdates: true } } }, required: false })
  @ApiResponse({ status: 200, description: 'Successfully subscribed' })
  async subscribe(@Req() req: any, @Body() body?: { preferences?: any }) {
    const subscription = await this.newsletterService.subscribe(req.user.id, body?.preferences);
    return buildAppResponse(subscription, 'Subscribed to newsletter', 200, '/api/newsletter/subscribe');
  }

  @Post('subscribe-email')
  @ApiOperation({ summary: 'Subscribe to newsletter by email', description: 'Subscribe to newsletter using just an email address (no registration required)' })
  @ApiBody({ schema: { example: { email: 'subscriber@example.com', preferences: { messageUpdates: true, newsUpdates: true } } } })
  @ApiResponse({ status: 200, description: 'Successfully subscribed' })
  async subscribeByEmail(@Body() body: { email: string; preferences?: { messageUpdates?: boolean; newsUpdates?: boolean } }) {
    const subscription = await this.newsletterService.subscribeByEmail(body.email, body.preferences);
    return buildAppResponse(subscription, 'Subscribed to newsletter', 200, '/api/newsletter/subscribe-email');
  }

  @Post('unsubscribe-email')
  @ApiOperation({ summary: 'Unsubscribe by email', description: 'Unsubscribe from newsletter using email address' })
  @ApiBody({ schema: { example: { email: 'subscriber@example.com' } } })
  @ApiResponse({ status: 200, description: 'Successfully unsubscribed' })
  async unsubscribeByEmail(@Body() body: { email: string }) {
    await this.newsletterService.unsubscribeByEmail(body.email);
    return buildAppResponse(null, 'Unsubscribed from newsletter', 200, '/api/newsletter/unsubscribe-email');
  }

  @Post('unsubscribe')
  @UseGuards(JwtGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Unsubscribe from newsletter (Authenticated)', description: 'Unsubscribe the authenticated user from the newsletter' })
  @ApiResponse({ status: 200, description: 'Successfully unsubscribed' })
  async unsubscribe(@Req() req: any) {
    await this.newsletterService.unsubscribe(req.user.id);
    return buildAppResponse(null, 'Unsubscribed from newsletter', 200, '/api/newsletter/unsubscribe');
  }

  @Get('my-subscription')
  @UseGuards(JwtGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get my subscription', description: 'Get the authenticated user\'s newsletter subscription details' })
  @ApiResponse({ status: 200, description: 'Subscription retrieved' })
  async getMySubscription(@Req() req: any) {
    const subscriptions = await this.newsletterService.getSubscriptions(req.user.id);
    return buildAppResponse(subscriptions, 'Subscription retrieved', 200, '/api/newsletter/my-subscription');
  }
}

