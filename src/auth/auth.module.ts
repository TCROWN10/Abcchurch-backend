import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { UserModule } from 'src/user/user.module';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy, } from 'src/strategies/jwt.strategy';
import { GoogleStrategy } from 'src/strategies/google.strategy';
import { AuthController } from './auth.controller';
import { Reflector } from '@nestjs/core';
import { GoogleAuthController } from './google_auth.controller';

@Module({
    imports: [
        UserModule,
        PassportModule.registerAsync({
            useFactory: async () => ({
                defaultStrategy: 'jwt',
                session: false,
            }),
        }),
        Reflector,
        JwtModule.registerAsync({
            imports: [ConfigModule],
            useFactory: async (configService: ConfigService) => ({
                global: true,
                secret: await configService.getOrThrow('JWT_SECRET'),
                signOptions: {
                    algorithm: 'HS256', 
                    expiresIn: await configService.getOrThrow('JWT_EXPIRES_IN') 
                },
            }),
            inject: [ConfigService],
        }),
    ],
    providers: [AuthService, JwtStrategy, GoogleStrategy],
    controllers: [AuthController, GoogleAuthController]
})
export class AuthModule {}
