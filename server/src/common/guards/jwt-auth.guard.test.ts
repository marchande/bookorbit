import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';

import { ALLOW_DEFAULT_PASSWORD_KEY } from '../decorators/allow-default-password.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { RequestUser } from '../types/request-user';
import { JwtAuthGuard } from './jwt-auth.guard';
import { EMPTY_CONTENT_FILTER_RULES } from '@bookorbit/types';

function makeUser(overrides: Partial<RequestUser> = {}): RequestUser {
  return {
    id: 1,
    username: 'jdoe',
    name: 'Jane Doe',
    email: 'jdoe@example.com',
    active: true,
    isSuperuser: false,
    isDefaultPassword: false,
    tokenVersion: 1,
    settings: {},
    avatarUrl: null,
    provisioningMethod: 'local',
    authenticationMethod: 'password',
    permissions: [],
    ...overrides,

    contentFilters: EMPTY_CONTENT_FILTER_RULES,
  };
}

function makeContext(type: 'http' | 'ws' = 'http', request: Record<string, unknown> = { method: 'POST', url: '/api/v1/somewhere' }) {
  return {
    getType: () => type,
    getHandler: vi.fn(),
    getClass: vi.fn(),
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  /** The passport half of the guard, which reads a bearer token from HTTP headers. */
  const passportCanActivate = () => vi.spyOn(Object.getPrototypeOf(JwtAuthGuard.prototype) as { canActivate: () => unknown }, 'canActivate');

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lets gateway messages through without asking passport, which would read headers a socket does not have', async () => {
    const passport = passportCanActivate().mockReturnValue(false);
    const reflector = { getAllAndOverride: vi.fn() };
    const guard = new JwtAuthGuard(reflector as never);

    await expect(guard.canActivate(makeContext('ws'))).resolves.toBe(true);
    expect(passport).not.toHaveBeenCalled();
  });

  it('still authenticates every non-public HTTP request through passport', async () => {
    const passport = passportCanActivate().mockReturnValue(false);
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(undefined) };
    const guard = new JwtAuthGuard(reflector as never);
    const context = makeContext('http');

    await expect(guard.canActivate(context)).resolves.toBe(false);
    expect(passport).toHaveBeenCalledWith(context);
  });

  it('returns true in canActivate for @Public routes', async () => {
    const reflector = {
      getAllAndOverride: vi.fn((key: string) => {
        if (key === IS_PUBLIC_KEY) return true;
        return undefined;
      }),
    };
    const guard = new JwtAuthGuard(reflector as never);

    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
  });

  it('throws UnauthorizedException when passport strategy returns an error', () => {
    const reflector = { getAllAndOverride: vi.fn() };
    const guard = new JwtAuthGuard(reflector as never);

    expect(() => guard.handleRequest(new Error('boom'), makeUser(), undefined, makeContext())).toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when no authenticated user is present', () => {
    const reflector = { getAllAndOverride: vi.fn() };
    const guard = new JwtAuthGuard(reflector as never);

    expect(() => guard.handleRequest(undefined, undefined as never, undefined, makeContext())).toThrow(UnauthorizedException);
  });

  it('throws ForbiddenException for default-password users on routes without allow metadata', () => {
    const reflector = {
      getAllAndOverride: vi.fn((key: string) => {
        if (key === ALLOW_DEFAULT_PASSWORD_KEY) return undefined;
        return false;
      }),
    };
    const guard = new JwtAuthGuard(reflector as never);

    expect(() => guard.handleRequest(undefined, makeUser({ isDefaultPassword: true }), undefined, makeContext())).toThrow(ForbiddenException);
  });

  it('allows default-password users on routes with allow metadata', () => {
    const reflector = {
      getAllAndOverride: vi.fn((key: string) => {
        if (key === ALLOW_DEFAULT_PASSWORD_KEY) return true;
        return false;
      }),
    };
    const guard = new JwtAuthGuard(reflector as never);
    const user = makeUser({ isDefaultPassword: true });

    const result = guard.handleRequest(undefined, user, undefined, makeContext());
    expect(result).toBe(user);
  });

  it('does not force a password change for an OIDC-authenticated session', () => {
    const reflector = { getAllAndOverride: vi.fn() };
    const guard = new JwtAuthGuard(reflector as never);

    expect(() =>
      guard.handleRequest(undefined, makeUser({ isDefaultPassword: true, authenticationMethod: 'oidc' }), undefined, makeContext()),
    ).not.toThrow();
  });

  describe('API keys', () => {
    const keyUser = () => makeUser({ apiKey: { id: 9, name: 'script', scopes: ['library_delete_books'] as never } });
    const keyRequest = (authorization: string) => ({ method: 'GET', url: '/api/v1/books', headers: { authorization } });

    it('resolves a bo_ bearer token through the key service, not passport, and sets the request user', async () => {
      const passport = passportCanActivate().mockReturnValue(false);
      const reflector = { getAllAndOverride: vi.fn().mockReturnValue(undefined) };
      const apiKeys = { authenticate: vi.fn().mockResolvedValue(keyUser()) };
      const guard = new JwtAuthGuard(reflector as never, apiKeys as never);
      const request = keyRequest('Bearer bo_secret');

      await expect(guard.canActivate(makeContext('http', request))).resolves.toBe(true);
      expect(apiKeys.authenticate).toHaveBeenCalledWith('bo_secret');
      expect((request as { user?: RequestUser }).user?.apiKey?.id).toBe(9);
      expect(passport).not.toHaveBeenCalled();
    });

    it('rejects a key the service refuses', async () => {
      const reflector = { getAllAndOverride: vi.fn().mockReturnValue(undefined) };
      const apiKeys = { authenticate: vi.fn().mockRejectedValue(new UnauthorizedException()) };
      const guard = new JwtAuthGuard(reflector as never, apiKeys as never);

      await expect(guard.canActivate(makeContext('http', keyRequest('Bearer bo_bad')))).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a key outright where the key module is not available', async () => {
      const reflector = { getAllAndOverride: vi.fn().mockReturnValue(undefined) };
      const guard = new JwtAuthGuard(reflector as never);

      await expect(guard.canActivate(makeContext('http', keyRequest('Bearer bo_secret')))).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('still sends ordinary bearer JWTs to passport', async () => {
      const passport = passportCanActivate().mockReturnValue(true);
      const reflector = { getAllAndOverride: vi.fn().mockReturnValue(undefined) };
      const apiKeys = { authenticate: vi.fn() };
      const guard = new JwtAuthGuard(reflector as never, apiKeys as never);

      await expect(guard.canActivate(makeContext('http', keyRequest('Bearer eyJhbGciOi.jwt')))).resolves.toBe(true);
      expect(apiKeys.authenticate).not.toHaveBeenCalled();
      expect(passport).toHaveBeenCalled();
    });

    it('keeps a key off the password-change routes while its owner still has the default password', () => {
      const reflector = { getAllAndOverride: vi.fn((key: string) => key === ALLOW_DEFAULT_PASSWORD_KEY) };
      const guard = new JwtAuthGuard(reflector as never);

      expect(() =>
        guard.handleRequest(null, makeUser({ isDefaultPassword: true, apiKey: { id: 1, name: 'k', scopes: [] } }), undefined, makeContext()),
      ).toThrow(ForbiddenException);
    });
  });
});
