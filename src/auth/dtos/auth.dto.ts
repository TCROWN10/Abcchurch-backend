import z, { email } from "zod";


export const zRegisterSchema = z.object({
    email: email({error: 'not a valid email pattern'}),
    password: z.string()
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/)
    .min(6, 'password must be at least 6 characters long'),
    name: z.string().min(3, 'name must be at least 3 characters long').optional(),
    lastName: z.string().min(3, 'last name must be at least 3 characters long').optional(),
    phoneNumber: z.string().min(10, 'phone number must be at least 10 characters long').optional(),
    address: z.string().min(3, 'address must be at least 3 characters long').optional(),
    city: z.string().min(3, 'city must be at least 3 characters long').optional(),
    state: z.string().min(3, 'state must be at least 3 characters long').optional(),
    zipCode: z.string().min(3, 'zip code must be at least 3 characters long').optional(),
    country: z.string().min(3, 'country must be at least 3 characters long').optional(),
    profilePicture: z.string().min(3, 'profile picture must be at least 3 characters long').optional(),
    gender: z.enum(['male', 'female', 'other'], { error: 'gender must be male, female or other' }).optional(),
    dob: z.date().optional(),
});

export type AuthRegisterUserDto = z.infer<typeof zRegisterSchema>;
