import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { JwtGuard } from 'src/guards/jwt.guard';
import { RolesGuard, Roles } from 'src/guards/roles.guard';
import { UserRole } from '@prisma/client';
import { buildAppResponse } from 'src/utils/app_response.utils';

@ApiTags('Analytics')
@ApiBearerAuth('JWT-auth')
@Controller('analytics')
@UseGuards(JwtGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('birthdays')
  @ApiOperation({ summary: 'Get birthday analytics (Admin/Super Admin)', description: 'Get birthday statistics for today or a specific date' })
  @ApiQuery({ name: 'date', required: false, type: String, description: 'Date in YYYY-MM-DD format (defaults to today)' })
  @ApiResponse({ status: 200, description: 'Birthday analytics retrieved' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin access required' })
  async getBirthdayAnalytics(@Query('date') date?: string) {
    if (date) {
      const analytics = await this.analyticsService.getBirthdayAnalyticsForDate(new Date(date));
      return buildAppResponse(analytics, 'Birthday analytics retrieved', 200, '/api/analytics/birthdays');
    }

    const analytics = await this.analyticsService.getBirthdayAnalytics();
    return buildAppResponse(analytics, 'Today\'s birthday analytics retrieved', 200, '/api/analytics/birthdays');
  }
}

