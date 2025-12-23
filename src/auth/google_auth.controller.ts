import { AuthService } from "./auth.service";
import { Controller, Get, UseGuards, Req, Logger } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiExcludeEndpoint } from '@nestjs/swagger';
import { GoogleGuard } from "src/guards/google.guard";
import { buildAppResponse } from 'src/utils/app_response.utils';

@ApiTags('Authentication')
@Controller('auth/google')
export class GoogleAuthController {
    private readonly logger = new Logger(GoogleAuthController.name);
    constructor(private readonly authService: AuthService) {}

    @Get()
    @UseGuards(GoogleGuard)
    @ApiOperation({ summary: 'Initiate Google OAuth (User)', description: 'Redirects to Google OAuth consent screen for regular user authentication' })
    @ApiResponse({ status: 302, description: 'Redirects to Google OAuth' })
    async googleAuth() {
        // This will redirect to Google's OAuth page
        // The guard handles the redirect automatically
    }

    @Get('admin')
    @UseGuards(GoogleGuard)
    @ApiOperation({ summary: 'Initiate Google OAuth (Admin)', description: 'Redirects to Google OAuth for admin role authentication' })
    @ApiResponse({ status: 302, description: 'Redirects to Google OAuth' })
    async googleAuthAdmin() {
        // This will redirect to Google's OAuth page with admin role
        // The guard handles the redirect automatically
    }

    @Get('super-admin')
    @UseGuards(GoogleGuard)
    @ApiOperation({ summary: 'Initiate Google OAuth (Super Admin)', description: 'Redirects to Google OAuth for super admin role authentication' })
    @ApiResponse({ status: 302, description: 'Redirects to Google OAuth' })
    async googleAuthSuperAdmin() {
        // This will redirect to Google's OAuth page with super admin role
        // The guard handles the redirect automatically
    }

    @Get('callback')
    @UseGuards(GoogleGuard)
    @ApiExcludeEndpoint()
    @ApiOperation({ summary: 'Google OAuth callback', description: 'Handles Google OAuth callback and returns tokens like login endpoint' })
    @ApiResponse({ status: 200, description: 'Authentication successful', schema: { example: { success: true, data: { accessToken: 'jwt-token', refreshToken: 'refresh-token' }, message: 'Google authentication successful' } } })
    @ApiResponse({ status: 401, description: 'Authentication failed' })
    async googleAuthCallback(@Req() req: any) {
        try {
            this.logger.log('=== Google OAuth Callback Received ===');
            this.logger.log(`Request URL: ${req.url}`);
            this.logger.log(`Request Query: ${JSON.stringify(req.query)}`);
            this.logger.log(`User object: ${JSON.stringify(req.user ? 'present' : 'missing')}`);
            
            // Successful authentication, return tokens like login
            const { token, refreshToken } = req.user || {};
            
            if (!token) {
                this.logger.error('Token not found in req.user');
                this.logger.error(`req.user: ${JSON.stringify(req.user)}`);
                throw new Error('Token not generated');
            }
            
            this.logger.log('=== Tokens in Callback ===');
            this.logger.log(`Access Token: ${token.substring(0, 50)}...`);
            this.logger.log(`Full Access Token: ${token}`);
            if (refreshToken) {
                this.logger.log(`Refresh Token: ${refreshToken.substring(0, 50)}...`);
                this.logger.log(`Full Refresh Token: ${refreshToken}`);
            }
            this.logger.log('==========================');
            
            // Return JSON response like login endpoint
            return buildAppResponse(
                { accessToken: token, refreshToken: refreshToken || null },
                'Google authentication successful',
                200,
                '/api/auth/google/callback'
            );
        } catch (error) {
            this.logger.error('=== Google OAuth Callback Error ===');
            this.logger.error(error.message);
            this.logger.error(error.stack);
            this.logger.error('===================================');
            throw error;
        }
    }
}