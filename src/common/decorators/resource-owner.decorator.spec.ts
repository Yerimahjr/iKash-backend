import { Reflector } from '@nestjs/core';
import { ResourceOwner, RESOURCE_OWNER_KEY } from './resource-owner.decorator';
import {
  ResourceOwnerMetadata,
  ResourceType,
} from '../interfaces/resource-owner.interface';

function getHandlerMetadata(target: object): ResourceOwnerMetadata | undefined {
  return Reflect.getMetadata(RESOURCE_OWNER_KEY, target) as
    | ResourceOwnerMetadata
    | undefined;
}

describe('ResourceOwner decorator', () => {
  it('sets RESOURCE_OWNER_KEY metadata with the given type and default paramKey', () => {
    class TestController {
      @ResourceOwner(ResourceType.ORDER)
      handler() {}
    }

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const metadata = getHandlerMetadata(TestController.prototype.handler);

    expect(metadata).toEqual({ type: ResourceType.ORDER, paramKey: 'id' });
  });

  it('sets a custom paramKey when provided', () => {
    class TestController {
      @ResourceOwner(ResourceType.PAYMENT_METHOD, 'paymentId')
      handler() {}
    }

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const metadata = getHandlerMetadata(TestController.prototype.handler);

    expect(metadata).toEqual({
      type: ResourceType.PAYMENT_METHOD,
      paramKey: 'paymentId',
    });
  });

  it('is readable through Reflector.get, exactly as the guard reads it', () => {
    class TestController {
      @ResourceOwner(ResourceType.ESCROW, 'escrowId')
      handler() {}
    }

    const reflector = new Reflector();
    const metadata = reflector.get<ResourceOwnerMetadata | undefined>(
      RESOURCE_OWNER_KEY,
      // eslint-disable-next-line @typescript-eslint/unbound-method
      TestController.prototype.handler,
    );

    expect(metadata).toEqual({
      type: ResourceType.ESCROW,
      paramKey: 'escrowId',
    });
  });

  it('leaves undecorated handlers without metadata', () => {
    class TestController {
      handler() {}
    }

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const metadata = getHandlerMetadata(TestController.prototype.handler);

    expect(metadata).toBeUndefined();
  });
});
