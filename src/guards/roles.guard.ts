// src/guards/roles.guard.ts
import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // If role is missing, fetch from database
    let userRole = user.role;
    if (!userRole && user.id) {
      try {
        const dbUser = await this.prisma.user.findUnique({
          where: { id: user.id },
          select: { role: true },
        });
        userRole = dbUser?.role;
        // Update user object in request for future use
        user.role = userRole;
      } catch (error) {
        this.logger.error(`Failed to fetch user role: ${error.message}`);
      }
    }

    if (!userRole) {
      this.logger.error(`User role not found for user ID: ${user.id}`);
      throw new ForbiddenException('User role not found in token');
    }

    const hasRole = requiredRoles.includes(userRole);
    if (!hasRole) {
      this.logger.warn(`User role ${userRole} does not match required roles: ${requiredRoles.join(', ')}`);
      throw new ForbiddenException('Forbidden resource');
    }

    return true;
  }
}