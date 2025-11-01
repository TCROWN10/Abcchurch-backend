import { AuthService } from "./auth.service";
import { Controller, Get, UseGuards, Req, Res } from "@nestjs/common";
import { GoogleGuard } from "src/guards/google.guard";
import { type Response } from "express";


@Controller('auth/google')
@UseGuards(GoogleGuard)
export class GoogleAuthController {
    constructor(private readonly authService: AuthService) {

    }

    @Get()
    // @UseGuards(GoogleGuard)
    async googleAuth() {
        console.log('googleAuth called');
        // This will redirect to Google's OAuth page
        // return;
    }

    //admin route for google auth
    @Get('admin')
    // @UseGuards(GoogleGuard)
    async googleAuthAdmin() {
        // This will redirect to Google's OAuth page
        // return;
    }

    //admin route for super admin
    @Get('super-admin')
    // @UseGuards(GoogleGuard)
    async googleAuthSuperAdmin() {
        // This will redirect to Google's OAuth page
        // return;
    }

    @Get('callback')
    // @UseGuards(GoogleGuard)
    async googleAuthCallback(@Req() req: any, @Res() res: Response) {
        // Successful authentication, redirect or send token
        const { user , token } = req.user;
        
        // Redirect to frontend with token
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        res.redirect(`${frontendUrl}/auth/callback?token=${token}`);
    }
}