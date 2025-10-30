import { PassportStrategy } from "@nestjs/passport";
import { Strategy } from "passport-local";


export class LocalStrategy extends PassportStrategy(Strategy) {
    constructor() {
        super({
            usernameField: 'email',
            passwordField: 'password',
        });
    }
    validate(...args: any[]): unknown {
        throw new Error("Method not implemented.");
    }
}