import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody, ApiQuery, ApiParam } from '@nestjs/swagger';
import { PrayerRequestsService } from './prayer-requests.service';
import { JwtGuard } from 'src/guards/jwt.guard';
import { RolesGuard, Roles } from 'src/guards/roles.guard';
import { UserRole, PrayerRequestStatus } from '@prisma/client';
import { buildAppResponse } from 'src/utils/app_response.utils';
import { z } from 'zod';

const createRequestSchema = z.object({
  requesterName: z.string().min(1),
  requesterEmail: z.string().email().optional(),
  title: z.string().min(1),
  content: z.string().min(1),
  isPublic: z.boolean().default(false),
});

@ApiTags('Prayer Requests')
@Controller('prayer-requests')
export class PrayerRequestsController {
  constructor(private readonly prayerRequestsService: PrayerRequestsService) {}

  @Post()
  @UseGuards(JwtGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Create prayer request', description: 'Submit a new prayer request (public or private). User must be authenticated.' })
  @ApiBody({ schema: { example: { requesterName: 'John Doe', requesterEmail: 'john@example.com', title: 'Prayer for healing', content: 'Please pray for...', isPublic: false } } })
  @ApiResponse({ status: 201, description: 'Prayer request created' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async createRequest(@Body() body: z.infer<typeof createRequestSchema>, @Req() req: any) {
    const validated = createRequestSchema.parse(body);
    const request = await this.prayerRequestsService.createRequest({
      ...validated,
      userId: req.user.id, // Always use authenticated user ID
    });
    return buildAppResponse(request, 'Prayer request created', 201, '/api/prayer-requests');
  }

  @Get()
  @ApiOperation({ summary: 'Get all prayer requests', description: 'Get prayer requests with optional filtering' })
  @ApiQuery({ name: 'status', required: false, enum: ['PENDING', 'READ', 'ARCHIVED'] })
  @ApiQuery({ name: 'public', required: false, type: String, description: 'Filter by public status (true/false)' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Prayer requests retrieved' })
  async getRequests(
    @Query('status') status?: string,
    @Query('public') isPublicQuery?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const requests = await this.prayerRequestsService.getRequests({
      status: status as PrayerRequestStatus,
      isPublic: isPublicQuery === 'true',
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined,
    });
    return buildAppResponse(requests, 'Prayer requests retrieved', 200, '/api/prayer-requests');
  }

  @Get('my-requests')
  @UseGuards(JwtGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get my prayer requests', description: 'Get all prayer requests submitted by the authenticated user' })
  @ApiResponse({ status: 200, description: 'Prayer requests retrieved' })
  async getMyRequests(@Req() req: any) {
    const requests = await this.prayerRequestsService.getRequests({
      userId: req.user.id,
    });
    return buildAppResponse(requests, 'My prayer requests retrieved', 200, '/api/prayer-requests/my-requests');
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get prayer request by ID', description: 'Get a specific prayer request by its ID' })
  @ApiParam({ name: 'id', description: 'Prayer request ID' })
  @ApiResponse({ status: 200, description: 'Prayer request retrieved' })
  @ApiResponse({ status: 404, description: 'Prayer request not found' })
  async getRequest(@Param('id') id: string) {
    const request = await this.prayerRequestsService.getRequestById(id);
    return buildAppResponse(request, 'Prayer request retrieved', 200, `/api/prayer-requests/${id}`);
  }

  @Put(':id/mark-read')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Mark prayer request as read (Admin/Super Admin)', description: 'Mark a prayer request as read by the admin' })
  @ApiParam({ name: 'id', description: 'Prayer request ID' })
  @ApiResponse({ status: 200, description: 'Prayer request marked as read' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin access required' })
  async markAsRead(@Param('id') id: string, @Req() req: any) {
    const request = await this.prayerRequestsService.markAsRead(id, req.user.id);
    return buildAppResponse(request, 'Prayer request marked as read', 200, `/api/prayer-requests/${id}/mark-read`);
  }

  @Put(':id/mark-unread')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Mark prayer request as unread (Admin/Super Admin)', description: 'Mark a prayer request as unread' })
  @ApiParam({ name: 'id', description: 'Prayer request ID' })
  @ApiResponse({ status: 200, description: 'Prayer request marked as unread' })
  async markAsUnread(@Param('id') id: string) {
    const request = await this.prayerRequestsService.markAsUnread(id);
    return buildAppResponse(request, 'Prayer request marked as unread', 200, `/api/prayer-requests/${id}/mark-unread`);
  }

  @Put(':id/notes')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Add notes to prayer request (Admin/Super Admin)', description: 'Add admin notes to a prayer request' })
  @ApiParam({ name: 'id', description: 'Prayer request ID' })
  @ApiBody({ schema: { example: { notes: 'Admin notes here...' } } })
  @ApiResponse({ status: 200, description: 'Notes added' })
  async addNotes(@Param('id') id: string, @Body() body: { notes: string }) {
    const request = await this.prayerRequestsService.addNotes(id, body.notes);
    return buildAppResponse(request, 'Notes added', 200, `/api/prayer-requests/${id}/notes`);
  }

  @Put(':id/archive')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Archive prayer request (Admin/Super Admin)', description: 'Archive a prayer request' })
  @ApiParam({ name: 'id', description: 'Prayer request ID' })
  @ApiResponse({ status: 200, description: 'Prayer request archived' })
  async archiveRequest(@Param('id') id: string) {
    const request = await this.prayerRequestsService.archiveRequest(id);
    return buildAppResponse(request, 'Prayer request archived', 200, `/api/prayer-requests/${id}/archive`);
  }

  @Delete(':id')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Delete prayer request (Admin/Super Admin)', description: 'Delete a prayer request permanently' })
  @ApiParam({ name: 'id', description: 'Prayer request ID' })
  @ApiResponse({ status: 200, description: 'Prayer request deleted' })
  async deleteRequest(@Param('id') id: string) {
    await this.prayerRequestsService.deleteRequest(id);
    return buildAppResponse(null, 'Prayer request deleted', 200, `/api/prayer-requests/${id}`);
  }
}

