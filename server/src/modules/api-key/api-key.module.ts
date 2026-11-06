import { Global, Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ApiKeyController } from './api-key.controller';
import { ApiKeyRepository } from './api-key.repository';
import { ApiKeyService } from './api-key.service';

/** Global because the app-wide auth guard resolves API keys on every request. */
@Global()
@Module({
  imports: [AuthModule],
  controllers: [ApiKeyController],
  providers: [ApiKeyRepository, ApiKeyService],
  exports: [ApiKeyService],
})
export class ApiKeyModule {}
