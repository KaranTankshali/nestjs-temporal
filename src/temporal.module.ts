import { DynamicModule, Global, Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';

import { TEMPORAL_MODULE_OPTIONS } from './constants';
import {
  TemporalModuleOptions,
  TemporalModuleAsyncOptions,
} from './interfaces';
import { TemporalClientService } from './services/temporal-client.service';
import { TemporalWorkerService } from './services/temporal-worker.service';
import { TemporalDiscoveryService } from './services/temporal-discovery.service';
import { WorkflowClient } from './services/workflow-client';
import { getWorkflowClientToken } from './decorators/inject-workflow-client.decorator';

/**
 * NestJS module for Temporal.io integration.
 *
 * Provides decorator-based activity registration, automatic worker discovery,
 * and a Temporal client for starting / querying / signaling workflows.
 *
 * ## Quick Start
 *
 * ```typescript
 * // app.module.ts
 * @Module({
 *   imports: [
 *     TemporalModule.forRoot({
 *       address: 'localhost:7233',
 *       namespace: 'default',
 *     }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 *
 * ## Async Configuration
 *
 * ```typescript
 * TemporalModule.forRootAsync({
 *   imports: [ConfigModule],
 *   useFactory: (config: ConfigService) => ({
 *     address: config.get('TEMPORAL_ADDRESS'),
 *     namespace: config.get('TEMPORAL_NAMESPACE'),
 *     enableWorker: config.get('ENABLE_WORKER') === 'true',
 *   }),
 *   inject: [ConfigService],
 * })
 * ```
 *
 * ## Task-Queue-Scoped Clients (like @InjectQueue in BullMQ)
 *
 * ```typescript
 * // Register a task-queue-scoped client
 * @Module({
 *   imports: [
 *     TemporalModule.forRoot({ address: 'localhost:7233' }),
 *     TemporalModule.registerClient('orders'),
 *     TemporalModule.registerClient('notifications'),
 *   ],
 * })
 * export class AppModule {}
 *
 * // Inject the scoped client
 * @Injectable()
 * export class OrderService {
 *   constructor(
 *     @InjectWorkflowClient('orders') private readonly orders: WorkflowClient,
 *   ) {}
 *
 *   async placeOrder(id: string, items: Item[]) {
 *     return this.orders.start('OrderWorkflow', {
 *       workflowId: `order-${id}`,
 *       args: [{ id, items }],
 *     });
 *   }
 * }
 * ```
 *
 * ## Defining Activities
 *
 * ```typescript
 * @Worker({
 *   taskQueue: 'my-task-queue',
 *   workflowsPath: require.resolve('./workflows'),
 * })
 * @Injectable()
 * export class MyActivities {
 *   @Activity()
 *   async processOrder(input: OrderInput) { ... }
 * }
 * ```
 */
@Global()
@Module({})
export class TemporalModule {
  /**
   * Register with static options.
   *
   * @param options - Temporal connection and worker configuration
   */
  static forRoot(options: TemporalModuleOptions = {}): DynamicModule {
    return {
      module: TemporalModule,
      imports: [DiscoveryModule],
      providers: [
        {
          provide: TEMPORAL_MODULE_OPTIONS,
          useValue: options,
        },
        TemporalClientService,
        TemporalWorkerService,
        TemporalDiscoveryService,
      ],
      exports: [
        TemporalClientService,
        TemporalWorkerService,
      ],
    };
  }

  /**
   * Register with async factory (for injecting ConfigService, etc.).
   *
   * @param options - Async configuration options
   */
  static forRootAsync(options: TemporalModuleAsyncOptions): DynamicModule {
    return {
      module: TemporalModule,
      imports: [...(options.imports || []), DiscoveryModule],
      providers: [
        {
          provide: TEMPORAL_MODULE_OPTIONS,
          useFactory: options.useFactory,
          inject: options.inject || [],
        },
        TemporalClientService,
        TemporalWorkerService,
        TemporalDiscoveryService,
      ],
      exports: [
        TemporalClientService,
        TemporalWorkerService,
      ],
    };
  }

  /**
   * Register a task-queue-scoped `WorkflowClient`.
   *
   * This is the Temporal equivalent of `BullModule.registerQueue({ name: 'audio' })`.
   * It creates a `WorkflowClient` bound to the given task queue that can be
   * injected via `@InjectWorkflowClient('task-queue-name')`.
   *
   * Can be called multiple times for different task queues.
   *
   * @param taskQueue - Task queue name to bind the WorkflowClient to.
   *                    Can be a string or `{ taskQueue: string }` for consistency with BullMQ style.
   *
   * @example
   * ```typescript
   * // String form
   * TemporalModule.registerClient('orders')
   *
   * // Object form (matches BullMQ's registerQueue style)
   * TemporalModule.registerClient({ taskQueue: 'orders' })
   *
   * // Register multiple queues
   * @Module({
   *   imports: [
   *     TemporalModule.forRoot({ address: 'localhost:7233' }),
   *     TemporalModule.registerClient('orders'),
   *     TemporalModule.registerClient('notifications'),
   *   ],
   * })
   * export class AppModule {}
   * ```
   */
  static registerClient(
    taskQueue: string | { taskQueue: string },
  ): DynamicModule {
    const queue =
      typeof taskQueue === 'string' ? taskQueue : taskQueue.taskQueue;
    const token = getWorkflowClientToken(queue);

    return {
      module: TemporalModule,
      providers: [
        {
          provide: token,
          useFactory: (clientService: TemporalClientService) =>
            new WorkflowClient(clientService, queue),
          inject: [TemporalClientService],
        },
      ],
      exports: [token],
    };
  }
}
