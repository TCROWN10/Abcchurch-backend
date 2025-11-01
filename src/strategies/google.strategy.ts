import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { Profile, Strategy } from "passport-google-oauth20";
import { UserService } from "src/user/user.service";
import { AuthService } from "src/auth/auth.service";

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
    constructor(
        private readonly configService: ConfigService,
        private readonly userService: UserService,
        private readonly authService: AuthService
    ) {
        super({
            clientID: configService.getOrThrow('GOOGLE_CLIENT_ID'),
            clientSecret: configService.getOrThrow('GOOGLE_CLIENT_SECRET'),
            callbackURL: configService.getOrThrow('GOOGLE_CALLBACK_URL'),
            scope: ['email', 'profile'],
            passReqToCallback: true,
        });
    }

    async validate(request: any, accessToken: string, refreshToken: string, profile: Profile, done: Function) {
        try {
            if (!profile.emails?.[0]?.value) {
                throw new Error('No email provided by Google');
            }

            const email = profile.emails[0].value;
            const firstName = profile.name?.givenName || profile.displayName?.split(' ')[0] || '';
            const lastName = profile.name?.familyName || profile.displayName?.split(' ').slice(1).join(' ') || '';
            const picture = profile.photos?.[0]?.value || null;
            
            // Check if user exists
            let user = await this.userService.findUserByEmail(email);
            
            if (!user) {
                // Create new user if doesn't exist
                user = await this.userService.createUserFromGoogle({
                    email,
                    firstName,
                    lastName,
                    picture,
                    googleId: profile.id,
                });
            } else if (!user.googleId) {
                // Update existing user with Google ID if not set
                user = await this.userService.updateUserGoogleId(user.id, profile.id);
            }
            
            if (!user) {
                throw new Error('Failed to process user');
            }

            // Generate JWT token
            const token = await this.authService.generateToken({
                id: user.id,
                email: user.email,
                details: user.details
            });
            
            done(null, { user, token });
        } catch (error) {
            console.error('Google OAuth error:', error);
            done(error, false);
        }
    }
}