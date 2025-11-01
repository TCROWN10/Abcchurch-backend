import { ExecutionContext, Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

@Injectable()
export class GoogleGuard extends AuthGuard('google') {
    constructor() {
        super({
            accessType: 'offline',
            prompt: 'consent',
        });
    }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        try {
            const activate = (await super.canActivate(context)) as boolean;
            const request = context.switchToHttp().getRequest();
            await super.logIn(request);
            return activate;
        } catch (error) {
            console.error('Google OAuth error:', error);
            throw error;
        }
    }

    handleRequest(err: any, user: any, info: any, context: any, status: any) {
        if (err || !user) {
            throw err || new Error('Authentication failed');
        }
        return user;
    }
}