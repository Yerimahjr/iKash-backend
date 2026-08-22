import { SetMetadata } from '@nestjs/common';
import {
  ResourceOwnerMetadata,
  ResourceType,
} from '../interfaces/resource-owner.interface';

export const RESOURCE_OWNER_KEY = 'resource_owner';

export const ResourceOwner = (type: ResourceType, paramKey = 'id') =>
  SetMetadata<string, ResourceOwnerMetadata>(RESOURCE_OWNER_KEY, {
    type,
    paramKey,
  });
