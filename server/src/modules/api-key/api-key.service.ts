import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { API_KEY_READ_SCOPE, API_KEY_TOKEN_PREFIX, Permission, type ApiKeyScope, type ApiKeySummary, type CreatedApiKey } from '@bookorbit/types';

import type { ApiKey } from '../../db/schema';
import type { RequestUser } from '../../common/types/request-user';
import { AuthService } from '../auth/auth.service';
import { ApiKeyRepository } from './api-key.repository';
import type { CreateApiKeyDto } from './dto/create-api-key.dto';

/** Characters of the key kept in clear (the `bo_` prefix plus 8), so a person can tell keys apart. */
const VISIBLE_PREFIX_LENGTH = API_KEY_TOKEN_PREFIX.length + 8;
/** `last_used_at` is a hint, not a log: one write a minute per key is plenty. */
const TOUCH_INTERVAL_MS = 60_000;

export function hashApiKey(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class ApiKeyService {
  private readonly logger = new Logger(ApiKeyService.name);

  constructor(
    private readonly repo: ApiKeyRepository,
    private readonly authService: AuthService,
  ) {}

  /**
   * A key may only carry scopes its owner already has: the scope list narrows access, it never
   * widens it. `read` is the exception, since every signed-in user can already read.
   */
  async create(user: RequestUser, dto: CreateApiKeyDto): Promise<CreatedApiKey> {
    const scopes = [...new Set(dto.scopes)];
    const notHeld = scopes.filter((scope) => scope !== API_KEY_READ_SCOPE && !user.isSuperuser && !user.permissions.includes(scope as Permission));
    if (notHeld.length > 0) throw new ForbiddenException(`You cannot grant scopes you do not hold: ${notHeld.join(', ')}`);

    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (expiresAt && expiresAt.getTime() <= Date.now()) throw new BadRequestException('expiresAt must be in the future');

    const token = API_KEY_TOKEN_PREFIX + randomBytes(32).toString('base64url');
    const row = await this.repo.create({
      userId: user.id,
      name: dto.name.trim(),
      keyPrefix: token.slice(0, VISIBLE_PREFIX_LENGTH),
      keyHash: hashApiKey(token),
      scopes,
      expiresAt,
    });
    return { ...this.toSummary(row), token };
  }

  async list(user: RequestUser): Promise<ApiKeySummary[]> {
    return (await this.repo.findAllForUser(user.id)).map((row) => this.toSummary(row));
  }

  async revoke(user: RequestUser, id: number): Promise<void> {
    if (!(await this.repo.revoke(id, user.id))) throw new NotFoundException('API key not found or already revoked');
  }

  /**
   * The user a bearer API key acts as, with the key's scopes attached. Throws the same error for
   * every failure, so a caller learns nothing about which part was wrong.
   */
  async authenticate(token: string): Promise<RequestUser> {
    if (!token.startsWith(API_KEY_TOKEN_PREFIX)) throw new UnauthorizedException();
    const row = await this.repo.findByHash(hashApiKey(token));
    const now = new Date();
    if (!row || row.revokedAt || (row.expiresAt && row.expiresAt <= now)) throw new UnauthorizedException();

    const user = await this.authService.findActingUser(row.userId);
    if (!user) throw new UnauthorizedException();

    if (!row.lastUsedAt || now.getTime() - row.lastUsedAt.getTime() > TOUCH_INTERVAL_MS) {
      this.repo.touch(row.id, now).catch((error: unknown) => this.logger.warn(`[api_key.touch] [fail] keyId=${row.id} error="${String(error)}"`));
    }
    return { ...user, apiKey: { id: row.id, name: row.name, scopes: row.scopes as ApiKeyScope[] } };
  }

  private toSummary(row: ApiKey): ApiKeySummary {
    return {
      id: row.id,
      name: row.name,
      keyPrefix: row.keyPrefix,
      scopes: row.scopes as ApiKeyScope[],
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt?.toISOString() ?? null,
      lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
      revokedAt: row.revokedAt?.toISOString() ?? null,
    };
  }
}
