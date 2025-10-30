import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

@Module({
    imports: [
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
    ]
})
export class AuthModule {}
