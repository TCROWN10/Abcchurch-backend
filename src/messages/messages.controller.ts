import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiBearerAuth, ApiQuery, ApiParam } from '@nestjs/swagger';
import { MessagesService } from './messages.service';
import { JwtGuard } from 'src/guards/jwt.guard';
import { RolesGuard, Roles } from 'src/guards/roles.guard';
import { UserRole, MessageType } from '@prisma/client';
import { buildAppResponse } from 'src/utils/app_response.utils';
import { z } from 'zod';

const createMessageSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  type: z.enum(['SUNDAY', 'WEEKDAY']),
  videoUrl: z.string().optional(),
  audioUrl: z.string().optional(),
  imageUrl: z.string().optional(),
});

@ApiTags('Messages')
@Controller('messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get()
  @ApiOperation({ summary: 'Get all messages', description: 'Retrieve messages with optional filtering by type and published status' })
  @ApiQuery({ name: 'type', required: false, enum: ['SUNDAY', 'WEEKDAY'] })
  @ApiQuery({ name: 'published', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Messages retrieved successfully' })
  async getMessages(
    @Query('type') type?: string,
    @Query('published') published?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    let isPublished: boolean | undefined;
    if (published === 'true') {
      isPublished = true;
    } else if (published === 'false') {
      isPublished = false;
    }
    
    const messages = await this.messagesService.getMessages({
      type: type as MessageType,
      isPublished,
      limit: limit ? Number.parseInt(limit, 10) : undefined,
      offset: offset ? Number.parseInt(offset, 10) : undefined,
    });
    return buildAppResponse(messages, 'Messages retrieved', 200, '/api/messages');
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get message by ID', description: 'Retrieve a specific message by its ID' })
  @ApiParam({ name: 'id', description: 'Message ID' })
  @ApiResponse({ status: 200, description: 'Message retrieved' })
  @ApiResponse({ status: 404, description: 'Message not found' })
  async getMessage(@Param('id') id: string) {
    const message = await this.messagesService.getMessageById(id);
    return buildAppResponse(message, 'Message retrieved', 200, `/api/messages/${id}`);
  }

  @Post()
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Create message (Admin/Super Admin)', description: 'Create a new Sunday or Weekday message' })
  @ApiBody({ schema: { example: { title: 'Sunday Service', content: 'Message content...', type: 'SUNDAY', videoUrl: 'https://...' } } })
  @ApiResponse({ status: 201, description: 'Message created' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin access required' })
  async createMessage(@Body() body: z.infer<typeof createMessageSchema>, @Req() req: any) {
    const validated = createMessageSchema.parse(body);
    const message = await this.messagesService.createMessage({
      ...validated,
      authorId: req.user.id,
    });
    return buildAppResponse(message, 'Message created', 201, '/api/messages');
  }

  @Put(':id/publish')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Publish message (Admin/Super Admin)', description: 'Publish a message to make it visible to users' })
  @ApiParam({ name: 'id', description: 'Message ID' })
  @ApiResponse({ status: 200, description: 'Message published' })
  async publishMessage(@Param('id') id: string) {
    const message = await this.messagesService.publishMessage(id);
    return buildAppResponse(message, 'Message published', 200, `/api/messages/${id}/publish`);
  }

  @Put(':id')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update message (Admin/Super Admin)', description: 'Update an existing message' })
  @ApiParam({ name: 'id', description: 'Message ID' })
  @ApiResponse({ status: 200, description: 'Message updated' })
  async updateMessage(@Param('id') id: string, @Body() body: any) {
    const message = await this.messagesService.updateMessage(id, body);
    return buildAppResponse(message, 'Message updated', 200, `/api/messages/${id}`);
  }

  @Delete(':id')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Delete message (Admin/Super Admin)', description: 'Delete a message' })
  @ApiParam({ name: 'id', description: 'Message ID' })
  @ApiResponse({ status: 200, description: 'Message deleted' })
  async deleteMessage(@Param('id') id: string) {
    await this.messagesService.deleteMessage(id);
    return buildAppResponse(null, 'Message deleted', 200, `/api/messages/${id}`);
  }
}

