import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards, UsePipes } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { type AuthLoginUserDto, type AuthRegisterUserDto, zLoginSchema, zRegisterSchema } from './dtos/auth.dto';
import { ZodPipe } from 'src/pipes/zod/zod.pipe';
import { buildAppResponse } from 'src/utils/app_response.utils';
import { AuthGuard } from '@nestjs/passport';
import { ConditionalJwtGuard } from 'src/guards/conditional-jwt.guard';
import type { Response } from 'express';
import { JwtGuard } from 'src/guards/jwt.guard';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {

    constructor(private readonly authService: AuthService) {}

    @Post()
    @HttpCode(201)
    @ApiOperation({ summary: 'Register a new user', description: 'Create a new user account with email and password' })
    @ApiBody({ description: 'User registration data', schema: { example: { email: 'user@example.com', password: 'password123', name: 'John', lastName: 'Doe' } } })
    @ApiResponse({ status: 201, description: 'User successfully registered' })
    @ApiResponse({ status: 409, description: 'User already exists' })
    @ApiResponse({ status: 400, description: 'Invalid input data' })
    @UsePipes(new ZodPipe(zRegisterSchema))
    async registerUser(@Body() userDto: AuthRegisterUserDto) {
        return buildAppResponse(await this.authService.registerUser(userDto), 'User registered successfully', 201, '/api/auth');
    }

    @Post('login')
    @HttpCode(200)
    @ApiOperation({ summary: 'User login', description: 'Authenticate user with email and password, returns JWT token' })
    @ApiBody({ description: 'Login credentials', schema: { example: { email: 'user@example.com', password: 'password123' } } })
    @ApiResponse({ status: 200, description: 'Login successful', schema: { example: { success: true, data: { accessToken: 'jwt-token-here' }, message: 'User logged in successfully' } } })
    @ApiResponse({ status: 401, description: 'Invalid credentials' })
    @UsePipes(new ZodPipe(zLoginSchema))
    async login(@Body() userDto: AuthLoginUserDto) {
        return buildAppResponse(await this.authService.login(userDto), 'User logged in successfully', 200, '/api/auth/login');
    }

    // @Get('google')
    // @UseGuards(GoogleGuard)
    // async googleAuth() {
    //     // This will redirect to Google's OAuth page
    //     return;
    // }

    // @Get('google/callback')
    // @UseGuards(GoogleGuard)
    // async googleAuthCallback(@Req() req: any, @Res() res: Response) {
    //     // Successful authentication, redirect or send token
    //     const { _, token } = req.user;
        
    //     // Redirect to frontend with token
    //     const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    //     res.redirect(`${frontendUrl}/auth/callback?token=${token}`);
    // }

    @Post('verify-otp')
    @HttpCode(200)
    @UseGuards(JwtGuard)
    @ApiBearerAuth('JWT-auth')
    @ApiOperation({ summary: 'Verify OTP code', description: 'Verify the OTP code sent to user email for email verification' })
    @ApiBody({ schema: { example: { otp: '123456' } } })
    @ApiResponse({ status: 200, description: 'Email verified successfully' })
    @ApiResponse({ status: 400, description: 'Invalid or expired OTP' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async verifyOtp(@Req() req: any, @Body() body: { otp: string }) {
        return buildAppResponse(
            await this.authService.verifyOtp(req.user.id, body.otp),
            'Email verified successfully',
            200,
            '/api/auth/verify-otp',
        );
    }

    @Post('resend-otp')
    @HttpCode(200)
    @UseGuards(JwtGuard)
    @ApiBearerAuth('JWT-auth')
    @ApiOperation({ summary: 'Resend OTP code', description: 'Resend OTP code to user email' })
    @ApiResponse({ status: 200, description: 'OTP sent successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async resendOtp(@Req() req: any) {
        // Emit event to send OTP email asynchronously via outbox
        this.authService.sendOtpEmail(req.user.id, req.user.email);
        return buildAppResponse(
            { message: 'OTP sent to your email' },
            'OTP sent successfully',
            200,
            '/api/auth/resend-otp',
        );
    }

    @Post('refresh')
    @HttpCode(200)
    @ApiOperation({ summary: 'Refresh access token', description: 'Get a new access token using refresh token' })
    @ApiBody({ schema: { example: { refreshToken: 'refresh_token_here' } } })
    @ApiResponse({ status: 200, description: 'Tokens refreshed successfully' })
    @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
    async refreshToken(@Body() body: { refreshToken: string }) {
        return buildAppResponse(
            await this.authService.refreshToken(body.refreshToken),
            'Tokens refreshed successfully',
            200,
            '/api/auth/refresh',
        );
    }

    @Get('oauth-redirect')
    @ApiOperation({ summary: 'OAuth redirect handler', description: 'Handles OAuth redirects when callback URL is misconfigured (internal use)' })
    @ApiResponse({ status: 302, description: 'Redirects to correct callback URL' })
    oauthRedirect(@Req() req: any, @Res() res: Response) {
        // Handle Google OAuth callback redirects when callback URL is misconfigured
        if (req.query?.code) {
            const queryString = new URLSearchParams(req.query as any).toString();
            return res.redirect(`/api/auth/google/callback?${queryString}`);
        }
        // If no code, redirect to frontend
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        return res.redirect(`${frontendUrl}/auth/callback?error=invalid_oauth_redirect`);
    }

    @Get('profile')
    @UseGuards(ConditionalJwtGuard)
    @ApiBearerAuth('JWT-auth')
    @ApiOperation({ summary: 'Get user profile or handle OAuth redirect', description: 'Get user profile or redirect OAuth callbacks to correct endpoint. Note: GOOGLE_CALLBACK_URL is set to this endpoint in .env' })
    @ApiResponse({ status: 200, description: 'Profile retrieved successfully' })
    @ApiResponse({ status: 302, description: 'Redirects OAuth callback to correct endpoint' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing JWT token' })
    getProfile(@Req() req: any, @Res() res: Response) {
        // Check if this is a Google OAuth callback (has code parameter)
        // This handles the case where GOOGLE_CALLBACK_URL is set to /api/auth/profile in .env
        if (req.query?.code) {
            // Preserve all query parameters including state if present
            // Add state=user to ensure regular user role (since this is the default user sign-in)
            const queryParams = new URLSearchParams(req.query as any);
            if (!queryParams.has('state')) {
                queryParams.set('state', 'user');
            }
            // Redirect to the correct callback URL with all parameters
            return res.redirect(`/api/auth/google/callback?${queryParams.toString()}`);
        }
        
        // If no OAuth code, user should be authenticated via JWT
        return buildAppResponse(
            req.user, 
            'User profile retrieved successfully', 
            200, 
            '/api/auth/profile'
        );
    }
}
