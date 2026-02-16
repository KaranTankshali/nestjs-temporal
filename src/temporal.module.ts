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
}
