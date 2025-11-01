import { Injectable } from '@nestjs/common';
import { Prisma, User, UserRole } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { RegisterUserDto } from './dtos/user.dto';
import * as bcrypt from 'bcrypt';

type UserWithDetails = Prisma.UserGetPayload<{
    include: { details: true; createdBy?: boolean; createdUsers?: boolean }
}>;

@Injectable()
export class UserService {
    constructor(private readonly prismaService: PrismaService) {}

    async registerUser(userDto: RegisterUserDto ) {
        const { email, password, role = UserRole.USER, ...userDetails } = userDto;
        
        const existingUser = await this.prismaService.user.findUnique({
            where: { email },
        });
        
        if (existingUser) {
            throw new Error('User already exists');
        }

        const hashedPassword = password ? await bcrypt.hash(password, 10) : null;

        return this.prismaService.user.create({
            data: {
                email,
                password: hashedPassword,
                role,
                details: {
                    create: {
                        name: userDetails.name,
                        lastName: userDetails.lastName,
                    },
                },
            },
            include: { details: true },
        });
    }

    async findUserByEmail(email: string) {
        return this.prismaService.user.findUnique({
            where: { email },
            include: { details: true }
        });
    }

    async updateUserGoogleId(userId: number, googleId: string) {
        return this.prismaService.user.update({
            where: { id: userId },
            data: { 
                googleId: googleId as any,
                isEmailVerified: true 
            },
            include: { 
                details: true 
            }
        });
    }

    async findUserAndCompareCredential(email: string, password: string): Promise<User | null> {
        const user = await this.prismaService.user.findUnique({
            where: { email }
        });

        if (!user) {
            return null;
        }

        const isPasswordValid = await bcrypt.compare(password, user.password || '');
        return isPasswordValid ? user : null;
    }

    async createUserFromGoogle(profile: {
        email: string;
        firstName: string;
        lastName: string;
        picture?: string | null;
        googleId: string;
        role?: UserRole;
    }) {
        return this.prismaService.user.create({
            data: {
                email: profile.email,
                googleId: profile.googleId as any,
                isEmailVerified: true,
                details: {
                    create: {
                        name: profile.firstName,
                        lastName: profile.lastName,
                        profilePicture: profile.picture || null,
                    },
                },
            },
            include: {
                details: true,
            },
        });
    }
}
