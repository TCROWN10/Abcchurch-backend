import { UserRole } from "@prisma/client";


export class RegisterUserDto {
    email: string;
    password: string;
    role?: UserRole;

  name?: string;

  lastName?: string;

  phoneNumber?: string;

  address?: string;

  city?: string;

  state?: string;

  zipCode?: string;

  country?: string;

  profilePicture?: string;

  gender?: string;

  dob?: Date;
}