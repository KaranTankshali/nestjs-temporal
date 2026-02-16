import 'reflect-metadata';
import { DynamicModule } from '@nestjs/common';

import {
  getWorkflowClientToken,
  InjectWorkflowClient,
} from '../src/decorators/inject-workflow-client.decorator';
import { TemporalModule } from '../src/temporal.module';
import { TemporalClientService } from '../src/services/temporal-client.service';

describe('getWorkflowClientToken', () => {
  it('should return a deterministic token for a given task queue', () => {
    const token = getWorkflowClientToken('orders');
    expect(token).toBe('TEMPORAL_WORKFLOW_CLIENT:orders');
  });

  it('should return different tokens for different task queues', () => {
    const token1 = getWorkflowClientToken('orders');
    const token2 = getWorkflowClientToken('notifications');
    expect(token1).not.toBe(token2);
  });
});

describe('@InjectWorkflowClient()', () => {
  it('should set the correct inject metadata on a constructor parameter', () => {
    class TestService {
      constructor(
        @InjectWorkflowClient('orders') public readonly orders: unknown,
      ) {}
    }

    // NestJS stores inject tokens as design:paramtypes + self metadata
    // The @Inject decorator sets SELF_DECLARED_DEPS_METADATA
    const selfDeps = Reflect.getMetadata('self:paramtypes', TestService);
    expect(selfDeps).toBeDefined();
    expect(selfDeps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          index: 0,
          param: 'TEMPORAL_WORKFLOW_CLIENT:orders',
        }),
      ]),
    );
  });
});

describe('TemporalModule.registerClient()', () => {
  it('should return a DynamicModule with the correct token provider (string form)', () => {
    const result: DynamicModule = TemporalModule.registerClient('orders');

    expect(result.module).toBe(TemporalModule);

    const providers = result.providers as Array<{
      provide: string;
      useFactory: (...args: unknown[]) => unknown;
      inject: unknown[];
    }>;

    expect(providers).toHaveLength(1);
    expect(providers[0].provide).toBe('TEMPORAL_WORKFLOW_CLIENT:orders');
    expect(providers[0].inject).toEqual([TemporalClientService]);
    expect(typeof providers[0].useFactory).toBe('function');
  });

  it('should return a DynamicModule with the correct token provider (object form)', () => {
    const result: DynamicModule = TemporalModule.registerClient({
      taskQueue: 'notifications',
    });

    const providers = result.providers as Array<{
      provide: string;
      useFactory: (...args: unknown[]) => unknown;
      inject: unknown[];
    }>;

    expect(providers).toHaveLength(1);
    expect(providers[0].provide).toBe(
      'TEMPORAL_WORKFLOW_CLIENT:notifications',
    );
  });

  it('should export the token so other modules can use the client', () => {
    const result: DynamicModule = TemporalModule.registerClient('orders');

    expect(result.exports).toContain('TEMPORAL_WORKFLOW_CLIENT:orders');
  });

  it('should create a WorkflowClient instance from the factory', () => {
    const result: DynamicModule = TemporalModule.registerClient('orders');

    const providers = result.providers as Array<{
      provide: string;
      useFactory: (clientService: TemporalClientService) => unknown;
      inject: unknown[];
    }>;

    // Call the factory with a mock TemporalClientService
    const mockClientService = {} as TemporalClientService;
    const client = providers[0].useFactory(mockClientService);

    expect(client).toBeDefined();
    expect((client as any).taskQueue).toBe('orders');
  });

  it('should produce independent modules for different task queues', () => {
    const ordersModule = TemporalModule.registerClient('orders');
    const notificationsModule =
      TemporalModule.registerClient('notifications');

    const ordersProviders = ordersModule.providers as Array<{
      provide: string;
    }>;
    const notificationsProviders = notificationsModule.providers as Array<{
      provide: string;
    }>;

    expect(ordersProviders[0].provide).toBe('TEMPORAL_WORKFLOW_CLIENT:orders');
    expect(notificationsProviders[0].provide).toBe(
      'TEMPORAL_WORKFLOW_CLIENT:notifications',
    );
  });
});
