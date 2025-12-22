import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { UserService } from 'src/user/user.service';
import { AuthLoginUserDto, AuthRegisterUserDto } from './dtos/auth.dto';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/prisma/prisma.service';
import { OutboxService } from 'src/outbox/outbox.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class AuthService {
    constructor(
        private readonly userService: UserService,
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService,
        private readonly prisma: PrismaService,
        private readonly outboxService: OutboxService,
        private readonly eventEmitter: EventEmitter2,
    ) {}

    async registerUser(userDto: AuthRegisterUserDto) {
        const user = await this.userService.registerUser(userDto);
        
        // Emit event to send OTP email asynchronously
        this.eventEmitter.emit('auth.send-otp', {
            userId: user.id,
            email: user.email,
        });
        
        // Generate tokens
        const tokens = await this.generateTokens(user);
        
        return {
            user: {
                id: user.id,
                email: user.email,
                isEmailVerified: user.isEmailVerified,
            },
            ...tokens,
        };
    }

    async login(userDto: AuthLoginUserDto) {
        const user = await this.userService.findUserAndCompareCredential(userDto.email, userDto.password);
        if (!user) {
            throw new UnauthorizedException('Invalid credentials');
        }

        // Check if email is verified (unless Google OAuth user)
        if (!user.isEmailVerified && !user.googleId) {
            // Emit event to send OTP email asynchronously
            this.eventEmitter.emit('auth.send-otp', {
                userId: user.id,
                email: user.email,
            });
            throw new UnauthorizedException('Please verify your email before logging in. Check your inbox for the OTP code.');
        }

        const tokens = await this.generateTokens(user);
        return tokens;
    }

    async generateToken(user: any) {
        const payload = {
            id: user.id,
            email: user.email,
        };
        return this.jwtService.sign(payload);
    }

    async generateTokens(user: any) {
        const payload = {
            id: user.id,
            email: user.email,
        };
        
        const accessToken = this.jwtService.sign(payload);
        
        // Generate refresh token using JWT with separate secret and expiry
        const refreshTokenPayload = {
            id: user.id,
            email: user.email,
            type: 'refresh',
        };
        
        // Use JWT_SECRET as fallback if JWT_REFRESH_SECRET is not set
        const refreshSecret = this.configService.get('JWT_REFRESH_SECRET') || this.configService.getOrThrow('JWT_SECRET');
        const refreshExpiresIn = this.configService.get('JWT_REFRESH_EXPIRES_IN') || '7d';
        
        const refreshToken = this.jwtService.sign(refreshTokenPayload, {
            secret: refreshSecret,
            expiresIn: refreshExpiresIn,
        });
        
        // Calculate expiry date from token
        const refreshTokenExpiry = refreshExpiresIn;
        const expiresAt = this.calculateExpiryDate(refreshTokenExpiry);
        
        // Store refresh token in database
        await this.prisma.refreshToken.create({
            data: {
                userId: user.id,
                token: refreshToken,
                expiresAt,
            },
        });

        return {
            accessToken,
            refreshToken,
        };
    }

    private calculateExpiryDate(expiresIn: string): Date {
        const expiresAt = new Date();
        const match = expiresIn.match(/(\d+)([dhm])/);
        if (match) {
            const value = parseInt(match[1]);
            const unit = match[2];
            if (unit === 'd') {
                expiresAt.setDate(expiresAt.getDate() + value);
            } else if (unit === 'h') {
                expiresAt.setHours(expiresAt.getHours() + value);
            } else if (unit === 'm') {
                expiresAt.setMinutes(expiresAt.getMinutes() + value);
            }
        } else {
            // Default to 7 days
            expiresAt.setDate(expiresAt.getDate() + 7);
        }
        return expiresAt;
    }

    async refreshToken(refreshToken: string) {
        try {
            // Use JWT_SECRET as fallback if JWT_REFRESH_SECRET is not set
            const refreshSecret = this.configService.get('JWT_REFRESH_SECRET') || this.configService.getOrThrow('JWT_SECRET');
            
            // Verify refresh token using JWT
            const refreshTokenPayload = this.jwtService.verify(refreshToken, {
                secret: refreshSecret,
            });

            // Check if token exists in database
            const tokenRecord = await this.prisma.refreshToken.findUnique({
                where: { token: refreshToken },
                include: { user: true },
            });

            if (!tokenRecord || tokenRecord.expiresAt < new Date()) {
                throw new UnauthorizedException('Invalid or expired refresh token');
            }

            // Delete old refresh token
            await this.prisma.refreshToken.delete({
                where: { id: tokenRecord.id },
            });

            // Generate new tokens
            return this.generateTokens(tokenRecord.user);
        } catch (error) {
            throw new UnauthorizedException('Invalid or expired refresh token');
        }
    }

    async sendOtpEmail(userId: number, email: string) {
        // Emit event to send OTP email asynchronously via outbox pattern
        // The event handler will generate OTP and send email
        this.eventEmitter.emit('auth.send-otp', {
            userId,
            email,
        });
    }

    async verifyOtp(userId: number, otp: string) {
        const otpRecord = await this.prisma.otpCode.findFirst({
            where: {
                userId,
                code: otp,
                used: false,
            },
            orderBy: { createdAt: 'desc' },
        });

        if (!otpRecord) {
            throw new BadRequestException('Invalid OTP code');
        }

        if (otpRecord.expiresAt < new Date()) {
            throw new BadRequestException('OTP code has expired');
        }

        // Mark OTP as used
        await this.prisma.otpCode.update({
            where: { id: otpRecord.id },
            data: { used: true },
        });

        // Verify user email
        await this.prisma.user.update({
            where: { id: userId },
            data: { isEmailVerified: true },
        });

        return { success: true, message: 'Email verified successfully' };
    }
}
