import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { PrismaService } from "src/prisma/prisma.service";


@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {

    constructor(
        private readonly configService: ConfigService,
        private readonly prisma: PrismaService,
    ) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            secretOrKey: configService.getOrThrow('JWT_SECRET'),
            ignoreExpiration: false,
        });
    }
    
    async validate(payload: any): Promise<any> {
        // If role is already in payload (new tokens), return as-is
        if (payload.role) {
            return payload;
        }
        
        // For old tokens without role, fetch from database
        if (payload.id) {
            const user = await this.prisma.user.findUnique({
                where: { id: payload.id },
                select: { id: true, email: true, role: true },
            });
            
            if (user) {
                return {
                    id: user.id,
                    email: user.email,
                    role: user.role,
                };
            }
        }
        
        // Fallback: return payload as-is (will fail role check but at least won't crash)
        return payload;
    }
}