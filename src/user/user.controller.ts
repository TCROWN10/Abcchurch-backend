import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery, ApiParam, ApiBody } from '@nestjs/swagger';
import { UserService } from './user.service';
import { JwtGuard } from 'src/guards/jwt.guard';
import { RolesGuard, Roles } from 'src/guards/roles.guard';
import { UserRole } from '@prisma/client';
import { buildAppResponse } from 'src/utils/app_response.utils';
import { z } from 'zod';

const updateUserDetailsSchema = z.object({
  name: z.string().optional(),
  lastName: z.string().optional(),
  phoneNumber: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  country: z.string().optional(),
  profilePicture: z.string().optional(),
  gender: z.string().optional(),
  dob: z.string().optional(),
});

@ApiTags('Users')
@ApiBearerAuth('JWT-auth')
@Controller('users')
@UseGuards(JwtGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('profile')
  @ApiOperation({ summary: 'Get my profile', description: 'Get the authenticated user\'s profile information' })
  @ApiResponse({ status: 200, description: 'Profile retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMyProfile(@Req() req: any) {
    const user = await this.userService.findUserById(req.user.id);
    return buildAppResponse(user, 'Profile retrieved successfully', 200, '/api/users/profile');
  }

  @Put('profile')
  @ApiOperation({ summary: 'Update my profile', description: 'Update the authenticated user\'s profile details' })
  @ApiBody({ schema: { example: { name: 'John', lastName: 'Doe', phoneNumber: '+1234567890', address: '123 Main St', city: 'New York', state: 'NY', zipCode: '10001', country: 'USA', gender: 'Male', dob: '1990-01-01' } } })
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async updateMyProfile(@Req() req: any, @Body() body: z.infer<typeof updateUserDetailsSchema>) {
    const validated = updateUserDetailsSchema.parse(body);
    const details: any = { ...validated };
    if (validated.dob) {
      details.dob = new Date(validated.dob);
    } else {
      delete details.dob;
    }
    const user = await this.userService.updateUserDetails(req.user.id, details);
    return buildAppResponse(user, 'Profile updated successfully', 200, '/api/users/profile');
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get all users (Admin/Super Admin)', description: 'Get all users with optional filtering. Requires Admin or Super Admin role.' })
  @ApiQuery({ name: 'role', required: false, enum: ['USER', 'ADMIN', 'SUPER_ADMIN'], description: 'Filter by user role' })
  @ApiQuery({ name: 'isEmailVerified', required: false, type: Boolean, description: 'Filter by email verification status' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of results to return (default: 50)' })
  @ApiQuery({ name: 'offset', required: false, type: Number, description: 'Number of results to skip (default: 0)' })
  @ApiResponse({ status: 200, description: 'Users retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin access required' })
  async getAllUsers(
    @Query('role') role?: string,
    @Query('isEmailVerified') isEmailVerified?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const users = await this.userService.getAllUsers({
      role: role as UserRole,
      isEmailVerified: isEmailVerified === 'true' ? true : isEmailVerified === 'false' ? false : undefined,
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined,
    });
    return buildAppResponse(users, 'Users retrieved successfully', 200, '/api/users');
  }

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get user by ID (Admin/Super Admin)', description: 'Get a specific user by their ID. Requires Admin or Super Admin role.' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin access required' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUserById(@Param('id') id: string) {
    const user = await this.userService.findUserById(parseInt(id));
    return buildAppResponse(user, 'User retrieved successfully', 200, `/api/users/${id}`);
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update user (Super Admin only)', description: 'Update user information. Requires Super Admin role.' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiBody({ schema: { example: { email: 'user@example.com', role: 'ADMIN', isEmailVerified: true } } })
  @ApiResponse({ status: 200, description: 'User updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Super Admin access required' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async updateUser(
    @Param('id') id: string,
    @Body() body: { email?: string; role?: UserRole; isEmailVerified?: boolean },
  ) {
    const user = await this.userService.updateUser(parseInt(id), body);
    return buildAppResponse(user, 'User updated successfully', 200, `/api/users/${id}`);
  }

  @Put(':id/details')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update user details (Super Admin only)', description: 'Update user profile details. Requires Super Admin role.' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiBody({ schema: { example: { name: 'John', lastName: 'Doe', phoneNumber: '+1234567890' } } })
  @ApiResponse({ status: 200, description: 'User details updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Super Admin access required' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async updateUserDetails(
    @Param('id') id: string,
    @Body() body: z.infer<typeof updateUserDetailsSchema>,
  ) {
    const validated = updateUserDetailsSchema.parse(body);
    const details: any = { ...validated };
    if (validated.dob) {
      details.dob = new Date(validated.dob);
    } else {
      delete details.dob;
    }
    const user = await this.userService.updateUserDetails(parseInt(id), details);
    return buildAppResponse(user, 'User details updated successfully', 200, `/api/users/${id}/details`);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Delete user (Super Admin only)', description: 'Permanently delete a user. Requires Super Admin role.' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User deleted successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - Super Admin access required' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async deleteUser(@Param('id') id: string) {
    await this.userService.deleteUser(parseInt(id));
    return buildAppResponse(null, 'User deleted successfully', 200, `/api/users/${id}`);
  }
}

