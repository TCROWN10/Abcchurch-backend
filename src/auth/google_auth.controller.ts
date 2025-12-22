import { AuthService } from "./auth.service";
import { Controller, Get, UseGuards, Req, Res } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiExcludeEndpoint } from '@nestjs/swagger';
import { GoogleGuard } from "src/guards/google.guard";
import { type Response } from "express";

@ApiTags('Authentication')
@Controller('auth/google')
export class GoogleAuthController {
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
    @ApiOperation({ summary: 'Google OAuth callback', description: 'Handles Google OAuth callback (internal use only)' })
    async googleAuthCallback(@Req() req: any, @Res() res: Response) {
        try {
            // Successful authentication, redirect or send token
            const { token, refreshToken } = req.user;
            
            if (!token) {
                throw new Error('Token not generated');
            }
            
            // Redirect to frontend with tokens
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
            const tokenParam = refreshToken 
                ? `token=${token}&refreshToken=${refreshToken}`
                : `token=${token}`;
            res.redirect(`${frontendUrl}/auth/callback?${tokenParam}`);
        } catch (error) {
            console.error('Google OAuth callback error:', error);
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
            res.redirect(`${frontendUrl}/auth/callback?error=${encodeURIComponent(error.message || 'Authentication failed')}`);
        }
    }
}