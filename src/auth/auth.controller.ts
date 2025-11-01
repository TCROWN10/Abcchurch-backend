import { Body, Controller, Get, HttpCode, Post, Req, UseGuards, UsePipes } from '@nestjs/common';
import { AuthService } from './auth.service';
import { type AuthLoginUserDto, type AuthRegisterUserDto, zLoginSchema, zRegisterSchema } from './dtos/auth.dto';
import { ZodPipe } from 'src/pipes/zod/zod.pipe';
import { buildAppResponse } from 'src/utils/app_response.utils';
import { AuthGuard } from '@nestjs/passport';

@Controller('auth')
export class AuthController {

    constructor(private readonly authService: AuthService) {}

    @Post()
    @HttpCode(201)
    @UsePipes(new ZodPipe(zRegisterSchema))
    async registerUser(@Body() userDto: AuthRegisterUserDto) {
        return buildAppResponse(await this.authService.registerUser(userDto), 'User registered successfully', 201, '/api/auth');
    }

    @Post('login')
    @HttpCode(200)
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

    @Get('profile')
    // @UseGuards(AuthGuard('jwt'))
    getProfile(@Req() req: any) {
        console.log('profile');
        return buildAppResponse(
            req.user, 
            'User profile retrieved successfully', 
            200, 
            '/api/auth/profile'
        );
    }
}
