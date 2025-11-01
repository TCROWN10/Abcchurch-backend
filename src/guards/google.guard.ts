import { ExecutionContext, Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

@Injectable()
export class GoogleGuard extends AuthGuard('google') {
    constructor() {
        // super('google');
        super({
            // passReqToCallback: true,
            // session: false,
        });
    }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        try {
            console.log('GoogleGuard canActivate');
            const activate = (await super.canActivate(context)) as boolean;
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
        console.log('GoogleGuard handleRequest');
        return user;
    }
}