import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';

import {
  TEMPORAL_MODULE_OPTIONS,
  TEMPORAL_WORKER_METADATA,
  TEMPORAL_ACTIVITY_METADATA,
} from '../constants';
import {
  TemporalModuleOptions,
  TemporalWorkerOptions,
  ActivityOptions,
} from '../interfaces';
import {
  TemporalWorkerService,
  WorkerRegistrationConfig,
} from './temporal-worker.service';

/**
 * Temporal Discovery Service
 *
 * Scans all NestJS providers at startup to find classes decorated with
 * `@Worker()` and methods decorated with `@Activity()`.
 *
 * For each unique task queue discovered, a Temporal Worker is registered
 * with all the activities bound to their class instances (preserving DI context).
 *
 * This is equivalent to how `@nestjs/bullmq` auto-discovers `@Processor()` classes.
 */
@Injectable()
export class TemporalDiscoveryService implements OnModuleInit {
  private readonly logger = new Logger(TemporalDiscoveryService.name);

  constructor(
    @Inject(TEMPORAL_MODULE_OPTIONS)
    private readonly options: TemporalModuleOptions,
    private readonly discoveryService: DiscoveryService,
    private readonly metadataScanner: MetadataScanner,
    private readonly reflector: Reflector,
    private readonly temporalWorkerService: TemporalWorkerService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.options.enableWorker === false) {
      this.logger.log(
        '⏭️  Worker registration disabled (enableWorker: false). Skipping activity discovery.',
      );
      return;
    }

    this.logger.log('🔍 Discovering @Worker() providers...');

    const workerMap = this.discoverWorkers();

    if (workerMap.size === 0) {
      this.logger.log(
        'No @Worker() providers found. No workers to register.',
      );
      return;
    }

    // Register a worker for each task queue
    for (const [taskQueue, config] of workerMap) {
      const activityCount = Object.keys(config.activities).length;
      this.logger.log(
        `📦 Registering worker for "${taskQueue}" with ${activityCount} activit${activityCount === 1 ? 'y' : 'ies'}`,
      );

      await this.temporalWorkerService.registerWorker(config);
    }
  }

  /**
   * Discover all @Worker() classes and their @Activity() methods.
   *
   * Supports multiple activity classes on the same task queue —
   * their activities are merged into a single worker.
   */
  private discoverWorkers(): Map<string, WorkerRegistrationConfig> {
    const workerMap = new Map<string, WorkerRegistrationConfig>();
    const providers = this.discoveryService.getProviders();

    for (const wrapper of providers) {
      const { instance } = wrapper;
      if (!instance || !instance.constructor) continue;

      // Check for @Worker() metadata on the class
      const workerMeta = this.reflector.get<TemporalWorkerOptions | undefined>(
        TEMPORAL_WORKER_METADATA,
        instance.constructor,
      );

      if (!workerMeta) continue;

      this.logger.debug(
        `Found @Worker() on ${instance.constructor.name} → ${workerMeta.taskQueue}`,
      );

      // Get or create the config for this task queue
      const existing = workerMap.get(workerMeta.taskQueue) || {
        taskQueue: workerMeta.taskQueue,
        workflowsPath: workerMeta.workflowsPath,
        activities: {} as Record<string, (...args: unknown[]) => Promise<unknown>>,
        maxCachedWorkflows: workerMeta.maxCachedWorkflows,
        maxConcurrentActivityTaskExecutions:
          workerMeta.maxConcurrentActivityTaskExecutions,
        maxConcurrentWorkflowTaskExecutions:
          workerMeta.maxConcurrentWorkflowTaskExecutions,
      };

      // Scan all methods for @Activity() metadata
      const prototype = Object.getPrototypeOf(instance);
      const methodNames = this.metadataScanner.getAllMethodNames(prototype);

      for (const methodName of methodNames) {
        const method = instance[methodName];
        if (typeof method !== 'function') continue;

        const activityMeta = this.reflector.get<
          ActivityOptions | undefined
        >(TEMPORAL_ACTIVITY_METADATA, method);

        if (!activityMeta) continue;

        // Use the override name, or fall back to method name
        const activityName = activityMeta.name || methodName;

        if (existing.activities[activityName]) {
          this.logger.warn(
            `⚠️  Duplicate activity name "${activityName}" — last registration wins` +
              ` (${instance.constructor.name}.${methodName})`,
          );
        }

        // Bind method to its class instance to preserve DI context
        existing.activities[activityName] = method.bind(instance);

        this.logger.debug(
          `  └─ Activity: ${instance.constructor.name}.${methodName}()` +
            (activityMeta.name
              ? ` → registered as "${activityName}"`
              : ''),
        );
      }

      workerMap.set(workerMeta.taskQueue, existing);
    }

    return workerMap;
  }
}
