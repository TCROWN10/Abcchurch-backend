import { Injectable } from '@nestjs/common';
import { UserService } from 'src/user/user.service';
import { AuthLoginUserDto, AuthRegisterUserDto } from './dtos/auth.dto';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
    constructor(private readonly userService: UserService, private readonly jwtService: JwtService) {}

    async registerUser(userDto: AuthRegisterUserDto) {
        return await this.userService.registerUser(userDto);
    }

    async login(userDto: AuthLoginUserDto) {
        try{
            const user = await this.userService.findUserAndCompareCredential(userDto.email, userDto.password);
            if (!user) {
                throw new Error('User not found');
            }
            return { accessToken: await this.generateToken(user) };
        }catch(error){
            throw error;
        }
    }

    async generateToken(user: any) {
        const payload = {
            id: user.id,
            email: user.email,
        };
        try{
            return this.jwtService.sign(payload);
        }catch(error){
            throw error;
        }
    }
}
