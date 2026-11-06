import { ExecutionContext, ForbiddenException, Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';

import { ALLOW_DEFAULT_PASSWORD_KEY } from '../decorators/allow-default-password.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { RequestUser } from '../types/request-user';
import { API_KEY_TOKEN_PREFIX, AuthenticationMethod } from '@bookorbit/types';
import { ApiKeyService } from '../../modules/api-key/api-key.service';

const API_KEY_BEARER = `Bearer ${API_KEY_TOKEN_PREFIX}`;

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private readonly reflector: Reflector,
    // Optional so a controller that applies this guard locally still resolves without the key module.
    @Optional() private readonly apiKeys?: ApiKeyService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Since Nest 12, global guards also run on gateway messages. A socket.io message carries no
    // Authorization header for passport to read; gateways authenticate the socket once, in
    // handleConnection, and their handlers read that user through resolveSocketUser.
    if (context.getType() === 'ws') return true;
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;

    // An API key is a bearer token too, but not a JWT, so it is resolved here instead of by passport.
    const request = context.switchToHttp().getRequest<{ headers?: Record<string, unknown>; user?: RequestUser }>();
    const authorization = request.headers?.authorization;
    if (typeof authorization === 'string' && authorization.startsWith(API_KEY_BEARER)) {
      if (!this.apiKeys) throw new UnauthorizedException();
      const user = await this.apiKeys.authenticate(authorization.slice('Bearer '.length).trim());
      request.user = this.handleRequest(null, user, undefined, context);
      return true;
    }

    return super.canActivate(context) as Promise<boolean>;
  }

  handleRequest<T extends RequestUser>(err: unknown, user: T, _info: unknown, context: ExecutionContext): T {
    if (err || !user) {
      throw new UnauthorizedException();
    }

    if (user.isDefaultPassword && user.authenticationMethod !== AuthenticationMethod.Oidc) {
      const allowDefaultPassword = this.reflector.getAllAndOverride<boolean>(ALLOW_DEFAULT_PASSWORD_KEY, [context.getHandler(), context.getClass()]);
      // The password-change routes stay closed to a key: only a person signing in can clear the flag.
      if (!allowDefaultPassword || user.apiKey) {
        throw new ForbiddenException('Password change required');
      }
    }

    return user;
  }
}
