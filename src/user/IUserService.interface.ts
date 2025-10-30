import { RegisterUserDto } from "./dtos/user.dto";


export interface IUserService {
    registerUser(userDto: RegisterUserDto): Promise<any>
}