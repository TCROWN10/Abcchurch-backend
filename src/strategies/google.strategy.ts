import { Injectable, Req } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { Profile, Strategy } from "passport-google-oauth20";
import { UserService } from "src/user/user.service";
import { AuthService } from "src/auth/auth.service";
import { type Request } from "express";
import { UserRole } from "@prisma/client";

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
    constructor(
        private readonly configService: ConfigService,
        private readonly userService: UserService,
        private readonly authService: AuthService
    ) {
        console.log('GoogleStrategy constructor');
        super({
            clientID: configService.getOrThrow('GOOGLE_CLIENT_ID'),
            clientSecret: configService.getOrThrow('GOOGLE_CLIENT_SECRET'),
            callbackURL: configService.getOrThrow('GOOGLE_CALLBACK_URL'),
            scope: ['email', 'profile'],
            passReqToCallback: true,
            // Note: state is handled manually via request.googleAuthRole
            // We don't use sessions, so we can't use Passport's built-in state management
        });
    }

    async validate(request: Request, accessToken: string, refreshToken: string, profile: Profile, done: Function) {
        try {
            console.log('GoogleStrategy validate');
            if (!profile.emails?.[0]?.value) {
                throw new Error('No email provided by Google');
            }

            const email = profile.emails[0].value;
            const firstName = profile.name?.givenName || profile.displayName?.split(' ')[0] || '';
            const lastName = profile.name?.familyName || profile.displayName?.split(' ').slice(1).join(' ') || '';
            const picture = profile.photos?.[0]?.value || null;
            
            // Determine role based on request path
            const role = this.getRqPath(request);
            console.log("Determined role from path:", role);

            // Check if user exists by email or googleId
            let user = await this.userService.findUserByEmail(email);
            const userByGoogleId = profile.id ? await this.userService.findUserByGoogleId(profile.id) : null;
            
            console.log("user by email:", user);
            console.log("user by googleId:", userByGoogleId);

            if (!user && !userByGoogleId) {
                // Create new user if doesn't exist
                user = await this.userService.createUserFromGoogle({
                    email,
                    firstName,
                    lastName,
                    picture,
                    googleId: profile.id,
                    role: role
                });
                console.log("new user created:", user);
            } else if (user && !user.googleId) {
                // Update existing user with Google ID if not set
                user = await this.userService.updateUserGoogleId(user.id, profile.id);
                console.log("updated user with googleId:", user);
            } else if (userByGoogleId && !user) {
                // User exists with Google ID but different email (shouldn't happen, but handle it)
                user = userByGoogleId;
            } else if (user && user.googleId && user.googleId !== profile.id) {
                // Email matches but Google ID is different - this is a conflict
                throw new Error('Email is already associated with a different Google account');
            }
            
            if (!user) {
                throw new Error('Failed to process user');
            }

            // Generate tokens (access and refresh)
            const tokens = await this.authService.generateTokens({
                id: user.id,
                email: user.email,
                details: user.details
            });
            console.log("tokens generated successfully");
            done(null, { user, token: tokens.accessToken, refreshToken: tokens.refreshToken });
        } catch (error) {
            console.error('Google OAuth error:', error);
            done(error, false);
        }
    }

    private getRqPath(req: Request & { googleAuthRole?: string }): UserRole {
        // Check if role was stored in request by the guard
        if (req.googleAuthRole) {
            if (req.googleAuthRole === 'super-admin') {
                return UserRole.SUPER_ADMIN;
            } else if (req.googleAuthRole === 'admin') {
                return UserRole.ADMIN;
            }
        }
        
        // Fallback: Check the state parameter
        const state = req.query?.state as string;
        if (state) {
            if (state.includes('super-admin')) {
                return UserRole.SUPER_ADMIN;
            } else if (state.includes('admin')) {
                return UserRole.ADMIN;
            }
        }
        
        // Fallback: Check URL path
        const url = req.originalUrl || req.url || '';
        if (url.includes('/super-admin')) {
            return UserRole.SUPER_ADMIN;
        } else if (url.includes('/admin')) {
            return UserRole.ADMIN;
        }
        
        // Default to USER role
        return UserRole.USER;
    }
}