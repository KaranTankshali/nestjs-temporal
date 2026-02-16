import {
  Inject,
  Injectable,
  Logger,
  OnApplicationShutdown,
} from '@nestjs/common';
import { Worker, NativeConnection } from '@temporalio/worker';

import { TEMPORAL_MODULE_OPTIONS } from '../constants';
import { TemporalModuleOptions } from '../interfaces';

/**
 * Internal worker registration config.
 * Used by TemporalDiscoveryService to register workers.
 */
export interface WorkerRegistrationConfig {
  taskQueue: string;
  workflowsPath: string;
  activities: Record<string, (...args: unknown[]) => Promise<unknown>>;
  maxCachedWorkflows?: number;
  maxConcurrentActivityTaskExecutions?: number;
  maxConcurrentWorkflowTaskExecutions?: number;
}

/**
 * Temporal Worker Service
 *
 * Manages the lifecycle of Temporal Workers. Supports multiple workers
 * for different task queues, each with their own workflows and activities.
 *
 * Workers are created by the TemporalDiscoveryService during module init.
 * You typically don't need to interact with this service directly.
 *
 * @example
 * ```typescript
 * // Check registered workers (for diagnostics)
 * const queues = workerService.getRegisteredTaskQueues();
 * console.log('Active workers:', queues);
 * ```
 */
@Injectable()
export class TemporalWorkerService implements OnApplicationShutdown {
  private readonly logger = new Logger(TemporalWorkerService.name);
  private workers: Map<string, Worker> = new Map();

  constructor(
    @Inject(TEMPORAL_MODULE_OPTIONS)
    private readonly options: TemporalModuleOptions,
  ) {}

  /**
   * Register and start a worker for the given task queue.
   *
   * Called internally by TemporalDiscoveryService. You typically don't
   * need to call this directly — use the @Worker() decorator instead.
   *
   * @param config Worker configuration
   */
  async registerWorker(config: WorkerRegistrationConfig): Promise<void> {
    const { taskQueue } = config;

    if (this.workers.has(taskQueue)) {
      this.logger.warn(
        `Worker for task queue '${taskQueue}' already exists. Skipping registration.`,
      );
      return;
    }

    const address = this.options.address || 'localhost:7233';
    const namespace = this.options.namespace || 'default';

    let connection: NativeConnection | undefined;

    try {
      this.logger.log(
        `🚀 Starting Temporal Worker for task queue: ${taskQueue}...`,
      );

      connection = await NativeConnection.connect({
        address,
        tls: this.options.tls
          ? {
              clientCertPair: this.options.tls.clientCertPair,
              serverRootCACertificate:
                this.options.tls.serverRootCACertificate,
              serverNameOverride: this.options.tls.serverNameOverride,
            }
          : undefined,
      });

      // Resolve workflows path
      let workflowsPath: string;
      try {
        workflowsPath = require.resolve(config.workflowsPath);
      } catch {
        // If require.resolve fails, use the path as-is (might be absolute)
        workflowsPath = config.workflowsPath;
      }

      const defaults = this.options.workerDefaults || {};

      const worker = await Worker.create({
        connection,
        namespace,
        taskQueue,
        workflowsPath,
        activities: config.activities,
        maxCachedWorkflows:
          config.maxCachedWorkflows || defaults.maxCachedWorkflows || 100,
        maxConcurrentActivityTaskExecutions:
          config.maxConcurrentActivityTaskExecutions ||
          defaults.maxConcurrentActivityTaskExecutions ||
          10,
        maxConcurrentWorkflowTaskExecutions:
          config.maxConcurrentWorkflowTaskExecutions ||
          defaults.maxConcurrentWorkflowTaskExecutions ||
          undefined,
      });

      const activityNames = Object.keys(config.activities);
      this.logger.log(
        `✅ Worker started for task queue "${taskQueue}" with ${activityNames.length} activit${activityNames.length === 1 ? 'y' : 'ies'}`,
      );
      this.logger.debug(`  Address: ${address}, Namespace: ${namespace}`);
      this.logger.debug(`  Workflows: ${workflowsPath}`);
      this.logger.debug(`  Activities: ${activityNames.join(', ')}`);

      // Run worker in background (non-blocking)
      worker.run().catch((err) => {
        this.logger.error(
          `❌ Worker error for task queue '${taskQueue}':`,
          err,
        );
      });

      this.workers.set(taskQueue, worker);
    } catch (error) {
      this.logger.error(
        `❌ Failed to start Temporal Worker for task queue '${taskQueue}':`,
        error,
      );

      // Clean up the connection if it was established but worker creation failed
      if (connection) {
        try {
          await connection.close();
        } catch {
          // Best-effort cleanup
        }
      }

      // Don't throw — allow app to continue if a worker fails to start
    }
  }

  /**
   * Get a registered worker by task queue name.
   */
  getWorker(taskQueue: string): Worker | undefined {
    return this.workers.get(taskQueue);
  }

  /**
   * Shutdown a specific worker.
   */
  async shutdownWorker(taskQueue: string): Promise<void> {
    const worker = this.workers.get(taskQueue);
    if (worker) {
      this.logger.log(
        `Shutting down Temporal Worker for task queue: ${taskQueue}...`,
      );
      await worker.shutdown();
      this.workers.delete(taskQueue);
    }
  }

  /**
   * Get all registered task queue names.
   */
  getRegisteredTaskQueues(): string[] {
    return Array.from(this.workers.keys());
  }

  async onApplicationShutdown(signal?: string): Promise<void> {
    this.logger.log(`Shutting down all Temporal Workers (${signal})...`);

    const shutdownPromises = Array.from(this.workers.entries()).map(
      async ([taskQueue, worker]) => {
        this.logger.log(
          `Shutting down worker for task queue: ${taskQueue}...`,
        );
        await worker.shutdown();
      },
    );

    await Promise.all(shutdownPromises);
    this.workers.clear();
  }
}
