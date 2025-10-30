import { Injectable } from '@nestjs/common';
import { UserService } from 'src/user/user.service';
import { AuthRegisterUserDto } from './dtos/auth.dto';

@Injectable()
export class AuthService {
    constructor(private readonly userService: UserService) {}

    async registerUser(userDto: AuthRegisterUserDto) {
        return await this.userService.registerUser(userDto);
    }
}
