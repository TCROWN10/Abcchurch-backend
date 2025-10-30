import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { IUserService } from './IUserService.interface';
import { RegisterUserDto } from './dtos/user.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UserService implements IUserService {
    constructor(private readonly prismaService: PrismaService) {}

    async registerUser(userDto: RegisterUserDto): Promise<any> {
        const { email, password, } = userDto;
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
            },
        });

        
        return newUser;
    }

}
