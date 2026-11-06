import { Permission } from '@bookorbit/types';
import type { AuthenticationMethod } from '@bookorbit/types';
import type { ApiKeyScope, ContentFilterRules } from '@bookorbit/types';

export interface RequestUser {
  id: number;
  username: string;
  name: string;
  email: string | null;
  active: boolean;
  isSuperuser: boolean;
  isDefaultPassword: boolean;
  tokenVersion: number;
  sessionId?: number;
  settings: Record<string, unknown>;
  avatarUrl: string | null;
  avatarSource?: 'none' | 'external' | 'uploaded' | null;
  avatarVersion?: number | null;
  provisioningMethod: string;
  authenticationMethod?: AuthenticationMethod;
  permissions: Permission[];
  contentFilters: ContentFilterRules;
  /** Set when the request authenticated with an API key: the key's id, name and the only scopes it may use. */
  apiKey?: { id: number; name: string; scopes: ApiKeyScope[] };
}
