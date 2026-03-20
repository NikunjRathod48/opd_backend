import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('JWT_SECRET') ||
        'fallback_secret_do_not_use_in_prod',
    });
  }

  async validate(payload: any) {
    // This payload is the decoded JWT token
    // We return an object that will be injected into req.user
    return {
      userId: payload.sub,
      role: payload.role,
      email: payload.email,
    };
  }
}
