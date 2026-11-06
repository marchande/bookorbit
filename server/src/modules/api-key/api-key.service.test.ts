import { BadRequestException, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { EMPTY_CONTENT_FILTER_RULES, Permission } from '@bookorbit/types';

import type { RequestUser } from '../../common/types/request-user';
import { ApiKeyService, hashApiKey } from './api-key.service';

function makeUser(overrides: Partial<RequestUser> = {}): RequestUser {
  return {
    id: 4,
    username: 'owner',
    name: 'Owner',
    email: null,
    active: true,
    isSuperuser: false,
    isDefaultPassword: false,
    tokenVersion: 1,
    settings: {},
    avatarUrl: null,
    provisioningMethod: 'local',
    permissions: [Permission.LibraryDeleteBooks],
    contentFilters: EMPTY_CONTENT_FILTER_RULES,
    ...overrides,
  };
}

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 11,
    userId: 4,
    name: 'cleanup script',
    keyPrefix: 'bo_abcdefgh',
    keyHash: 'hash',
    scopes: [Permission.LibraryDeleteBooks],
    expiresAt: null as Date | null,
    lastUsedAt: null as Date | null,
    createdAt: new Date('2026-11-06T00:00:00Z'),
    revokedAt: null as Date | null,
    ...overrides,
  };
}

function setup() {
  const repo = {
    create: vi.fn((data: Record<string, unknown>) => Promise.resolve(makeRow(data))),
    findByHash: vi.fn(),
    findAllForUser: vi.fn(() => Promise.resolve([makeRow()])),
    revoke: vi.fn(() => Promise.resolve(true)),
    touch: vi.fn(() => Promise.resolve(undefined)),
  };
  const authService = { findActingUser: vi.fn(() => Promise.resolve(makeUser())) };
  return { repo, authService, service: new ApiKeyService(repo as never, authService as never) };
}

describe('ApiKeyService', () => {
  describe('create', () => {
    it('returns the key once and stores only its hash', async () => {
      const { repo, service } = setup();
      const created = await service.create(makeUser(), { name: ' cleanup script ', scopes: [Permission.LibraryDeleteBooks, 'read'] });

      expect(created.token).toMatch(/^bo_[A-Za-z0-9_-]{43}$/);
      const stored = repo.create.mock.calls[0][0] as { keyHash: string; keyPrefix: string; name: string };
      expect(stored.keyHash).toBe(hashApiKey(created.token));
      expect(JSON.stringify(stored)).not.toContain(created.token);
      expect(stored.keyPrefix).toBe(created.token.slice(0, 11));
      expect(stored.name).toBe('cleanup script');
    });

    it('refuses scopes the creator does not hold', async () => {
      const { repo, service } = setup();
      await expect(service.create(makeUser(), { name: 'k', scopes: [Permission.ManageUsers] })).rejects.toBeInstanceOf(ForbiddenException);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('lets a superuser grant any scope', async () => {
      const { service } = setup();
      await expect(
        service.create(makeUser({ isSuperuser: true, permissions: [] }), { name: 'k', scopes: [Permission.ManageUsers] }),
      ).resolves.toHaveProperty('token');
    });

    it('refuses an expiry in the past', async () => {
      const { service } = setup();
      await expect(service.create(makeUser(), { name: 'k', scopes: ['read'], expiresAt: '2000-01-01T00:00:00Z' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('authenticate', () => {
    it('returns the owner with the key attached', async () => {
      const { repo, service } = setup();
      repo.findByHash.mockResolvedValue(makeRow());

      const user = await service.authenticate('bo_whatever');
      expect(repo.findByHash).toHaveBeenCalledWith(hashApiKey('bo_whatever'));
      expect(user.id).toBe(4);
      expect(user.apiKey).toEqual({ id: 11, name: 'cleanup script', scopes: [Permission.LibraryDeleteBooks] });
    });

    it.each([
      ['an unknown key', undefined],
      ['a revoked key', makeRow({ revokedAt: new Date('2026-11-01T00:00:00Z') })],
      ['an expired key', makeRow({ expiresAt: new Date('2026-01-01T00:00:00Z') })],
    ])('rejects %s', async (_label, row) => {
      const { repo, service } = setup();
      repo.findByHash.mockResolvedValue(row);
      await expect(service.authenticate('bo_whatever')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a key whose owner can no longer act (inactive, or a revoked shared account)', async () => {
      const { repo, authService, service } = setup();
      repo.findByHash.mockResolvedValue(makeRow());
      authService.findActingUser.mockResolvedValue(null as never);
      await expect(service.authenticate('bo_whatever')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects anything that is not a bo_ key without touching the database', async () => {
      const { repo, service } = setup();
      await expect(service.authenticate('eyJhbGciOi.jwt')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(repo.findByHash).not.toHaveBeenCalled();
    });

    it('records last use at most once a minute', async () => {
      const { repo, service } = setup();
      repo.findByHash.mockResolvedValue(makeRow({ lastUsedAt: new Date(Date.now() - 10_000) }));
      await service.authenticate('bo_whatever');
      expect(repo.touch).not.toHaveBeenCalled();

      repo.findByHash.mockResolvedValue(makeRow({ lastUsedAt: new Date(Date.now() - 120_000) }));
      await service.authenticate('bo_whatever');
      expect(repo.touch).toHaveBeenCalledTimes(1);
    });
  });

  it('revokes only the caller’s own live keys', async () => {
    const { repo, service } = setup();
    await service.revoke(makeUser(), 11);
    expect(repo.revoke).toHaveBeenCalledWith(11, 4);

    repo.revoke.mockResolvedValue(false);
    await expect(service.revoke(makeUser(), 99)).rejects.toBeInstanceOf(NotFoundException);
  });
});
