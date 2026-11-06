import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post } from '@nestjs/common';
import { AuditAction, AuditResource, type CreatedApiKey } from '@bookorbit/types';

import { Auditable } from '../../common/decorators/auditable.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { DenyApiKey } from '../../common/decorators/deny-api-key.decorator';
import type { RequestUser } from '../../common/types/request-user';
import { ApiKeyService } from './api-key.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

/** Each user manages their own keys, from a signed-in session only - never with a key. */
@Controller('api-keys')
@DenyApiKey()
export class ApiKeyController {
  constructor(private readonly apiKeys: ApiKeyService) {}

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.apiKeys.list(user);
  }

  @Post()
  @Auditable({
    action: AuditAction.ApiKeyCreate,
    resource: AuditResource.ApiKey,
    getResourceId: (_req, body) => (body as CreatedApiKey | undefined)?.id,
    getMeta: (_req, body) => ({ scopes: (body as CreatedApiKey).scopes, expiresAt: (body as CreatedApiKey).expiresAt }),
    description: (_req, body) => `Created API key "${(body as CreatedApiKey).name}"`,
  })
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateApiKeyDto) {
    return this.apiKeys.create(user, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Auditable({
    action: AuditAction.ApiKeyRevoke,
    resource: AuditResource.ApiKey,
    getResourceId: (req) => Number(req.params.id),
    description: (req) => `Revoked API key ${req.params.id}`,
  })
  revoke(@CurrentUser() user: RequestUser, @Param('id', ParseIntPipe) id: number) {
    return this.apiKeys.revoke(user, id);
  }
}
