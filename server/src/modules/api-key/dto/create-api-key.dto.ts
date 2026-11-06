import { ArrayMinSize, ArrayUnique, IsArray, IsDateString, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { API_KEY_READ_SCOPE, Permission, type ApiKeyScope } from '@bookorbit/types';

export const API_KEY_SCOPES: readonly ApiKeyScope[] = [
  API_KEY_READ_SCOPE,
  ...Object.values(Permission).filter((p) => p !== Permission.DemoRestricted),
];

export class CreateApiKeyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsIn(API_KEY_SCOPES, { each: true })
  scopes: ApiKeyScope[];

  @IsDateString()
  @IsOptional()
  expiresAt?: string;
}
