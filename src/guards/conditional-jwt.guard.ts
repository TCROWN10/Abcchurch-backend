import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';

@Injectable()
export class ConditionalJwtGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    
    // If this is an OAuth callback (has code parameter), skip JWT guard
    if (request.query?.code) {
      return true;
    }
    
    // Otherwise, apply JWT guard
    return super.canActivate(context) as Promise<boolean>;
  }
}


