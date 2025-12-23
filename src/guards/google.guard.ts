import { ExecutionContext, Injectable, Logger } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

@Injectable()
export class GoogleGuard extends AuthGuard('google') {
    private readonly logger = new Logger(GoogleGuard.name);
    async canActivate(context: ExecutionContext): Promise<boolean> {
        try {
            const request = context.switchToHttp().getRequest();
            const url = request.url || request.originalUrl || '';
            const isCallback = url.includes('/callback');
            
            this.logger.log('=== GoogleGuard Activated ===');
            this.logger.log(`URL: ${url}`);
            this.logger.log(`Is Callback: ${isCallback}`);
            this.logger.log(`Query Params: ${JSON.stringify(request.query)}`);
            
            // Determine role based on the route (for initial auth, not callback)
            if (isCallback) {
              // For callback, extract role from state parameter
              const state = request.query?.state as string;
              if (state) {
                request.googleAuthRole = state;
              }
            } else {
                let role = 'user';
                if (url.includes('/super-admin')) {
                    role = 'super-admin';
                } else if (url.includes('/admin')) {
                    role = 'admin';
                }
                
                // Store role in request for later use in strategy
                request.googleAuthRole = role;
                
                // Pass state parameter via Passport's state option
                // We'll handle this in the strategy's validate method
            }
            
            // For callback route, we need to authenticate
            // For initial auth route, Passport will redirect to Google
            this.logger.log('Calling super.canActivate()...');
            const activate = (await super.canActivate(context)) as boolean;
            this.logger.log(`Activation result: ${activate}`);
            return activate;
        } catch (error) {
            this.logger.error('=== GoogleGuard Error ===');
            this.logger.error(error.message);
            this.logger.error(error.stack);
            this.logger.error('=========================');
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