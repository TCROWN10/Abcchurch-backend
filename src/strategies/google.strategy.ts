import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { Profile, Strategy } from "passport-google-oauth20";
import { UserService } from "src/user/user.service";


@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy) {
    constructor(
        private readonly configService: ConfigService,
        private readonly userService: UserService
    ) {
        super({
            clientID: configService.getOrThrow('GOOGLE_CLIENT_ID'),
            clientSecret: configService.getOrThrow('GOOGLE_CLIENT_SECRET'),
            callbackURL: configService.getOrThrow('GOOGLE_CALLBACK_URL'),
            scope: ['email', 'profile'],
        });
    }

    validate(accessToken: string, refreshToken: string, profile: Profile, done: Function) {
        console.log("profile ::: ", profile);
        const { id, displayName, photos, emails, _json } = profile;
        console.log("_json ::: ", _json);
        const user = this.userService.findUserByEmail('');
        if(user) {
            done(null, user);
        }else {
            done(null, profile);
        }
    }
}