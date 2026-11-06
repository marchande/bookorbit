import { SetMetadata } from '@nestjs/common';

export const DENY_API_KEY_KEY = 'denyApiKey';

/**
 * Refuses API-key requests outright, whatever scopes the key holds. For routes that manage
 * credentials or sessions, where a key must never be able to mint, widen or outlive itself.
 */
export const DenyApiKey = () => SetMetadata(DENY_API_KEY_KEY, true);
