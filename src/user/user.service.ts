import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { RegisterUserDto } from './dtos/user.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UserService {
    constructor(private readonly prismaService: PrismaService) {}

    async registerUser(userDto: RegisterUserDto): Promise<any> {
        const { email, password, ...userDetails } = userDto;
        const user = await this.prismaService.user.findUnique({
            where: {
                email,
            },
        });
        if (user) {
            throw new Error('User already exists');
        }
        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = await this.prismaService.user.create({
            data: {
                email,
                password: hashedPassword,
                details: {
                    create: {
                        ...userDetails
                    },
                },
            },
            select: {
                email: true,
                detailsId: true,
                id: true,
                createdAt: true,
                updatedAt: true
            }
        });

        
        return newUser;
    }

    async findUserByEmail(email: string) {
        return await this.prismaService.user.findUnique({
            where: {
                email,
            },
            select: {
                password: false,
                details: true,
                id: true,
                createdAt: true,
                updatedAt: true,
                email: true,
                detailsId: true,
            },
        });
    }

    async findUserAndCompareCredential(email: string, password: string) {
        try{
            const user = await this.prismaService.user.findUniqueOrThrow({
                where: {
                    email,
                },
            });
            if (!user) {
                throw new Error('User not found');
            }
            const isPasswordValid = await bcrypt.compare(password, user.password);
            if (!isPasswordValid) {
                // throw new Error('Invalid password');
            }
            return user;
        }catch(error){
            throw error;
        }
    }

}
