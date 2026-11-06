import { Permission } from "./permissions";

/**
 * The one scope that is not a permission: plain GET/HEAD lookups on routes that only require a
 * signed-in user. Every other route an API key can reach is one that requires a permission, and the
 * key must hold that permission as a scope.
 */
export const API_KEY_READ_SCOPE = "read" as const;

export type ApiKeyScope = Permission | typeof API_KEY_READ_SCOPE;

/** Prefix every API key secret starts with, so a bearer token can be told apart from a JWT. */
export const API_KEY_TOKEN_PREFIX = "bo_";

export interface ApiKeySummary {
  id: number;
  name: string;
  /** First characters of the key, for telling keys apart; never enough to use it. */
  keyPrefix: string;
  scopes: ApiKeyScope[];
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface CreatedApiKey extends ApiKeySummary {
  /** The full key. Returned once, at creation, and never stored. */
  token: string;
}
