import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  OnApplicationShutdown,
} from '@nestjs/common';
import {
  Connection,
  Client,
  WorkflowHandle,
  Workflow,
} from '@temporalio/client';

import { TEMPORAL_MODULE_OPTIONS } from '../constants';
import { TemporalModuleOptions } from '../interfaces';

/** Strip newlines and control characters to prevent log injection. */
function sanitize(value: string): string {
  return value.replace(/[\r\n\t\x00-\x1f]/g, '');
}

/**
 * Temporal Client Service
 *
 * Manages the connection to the Temporal server and provides
 * a high-level API for starting, querying, signaling, and
 * cancelling workflows.
 *
 * Automatically connects on module init and disconnects on shutdown.
 *
 * @example
 * ```typescript
 * @Injectable()
 * export class MyService {
 *   constructor(private readonly temporal: TemporalClientService) {}
 *
 *   async startMyWorkflow(id: string, args: MyInput) {
 *     return this.temporal.startWorkflow('MyWorkflow', `my-wf-${id}`, [args], 'my-task-queue');
 *   }
 * }
 * ```
 */
@Injectable()
export class TemporalClientService
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(TemporalClientService.name);
  private connection!: Connection;
  private client!: Client;

  constructor(
    @Inject(TEMPORAL_MODULE_OPTIONS)
    private readonly options: TemporalModuleOptions,
  ) {}

  async onModuleInit(): Promise<void> {
    const address = this.options.address || 'localhost:7233';
    const namespace = this.options.namespace || 'default';

    try {
      this.connection = await Connection.connect({
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

      this.client = new Client({
        connection: this.connection,
        namespace,
      });

      this.logger.log('✅ Temporal client connected');
      this.logger.debug(`  Address: ${address}, Namespace: ${namespace}`);
    } catch (error) {
      this.logger.error('❌ Failed to connect Temporal client', error);
      // Don't throw — allow app to start even if Temporal is unavailable
    }
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.connection) {
      this.logger.log('Closing Temporal client connection...');
      await this.connection.close();
    }
  }

  /**
   * Get the underlying Temporal Client instance.
   * @throws Error if the client is not initialized
   */
  getClient(): Client {
    if (!this.client) {
      throw new Error(
        'Temporal client not initialized. Check that the Temporal server is reachable.',
      );
    }
    return this.client;
  }

  /**
   * Start a new workflow execution.
   *
   * @param workflowType - Workflow function name (must match the exported function name)
   * @param workflowId - Unique workflow ID
   * @param args - Arguments to pass to the workflow
   * @param taskQueue - Task queue to schedule the workflow on
   * @returns Workflow handle
   */
  async startWorkflow<T extends Workflow>(
    workflowType: string,
    workflowId: string,
    args: unknown[],
    taskQueue: string,
  ): Promise<WorkflowHandle<T>> {
    const client = this.getClient();

    try {
      const handle = await client.workflow.start(workflowType, {
        taskQueue,
        workflowId,
        args,
      });

      this.logger.log(`🚀 Started workflow: ${sanitize(workflowId)} (${sanitize(workflowType)})`);
      return handle;
    } catch (error) {
      this.logger.error(`❌ Failed to start workflow: ${sanitize(workflowId)}`, error);
      throw error;
    }
  }

  /**
   * Get a handle to an existing workflow by ID.
   */
  async getWorkflowHandle(workflowId: string): Promise<WorkflowHandle> {
    const client = this.getClient();
    return client.workflow.getHandle(workflowId);
  }

  /**
   * Query a running workflow.
   */
  async queryWorkflow<T = unknown>(
    workflowId: string,
    queryType: string,
    ...args: unknown[]
  ): Promise<T> {
    const handle = await this.getWorkflowHandle(workflowId);
    return handle.query(queryType, ...args);
  }

  /**
   * Send a signal to a running workflow.
   */
  async signalWorkflow(
    workflowId: string,
    signalName: string,
    ...args: unknown[]
  ): Promise<void> {
    const handle = await this.getWorkflowHandle(workflowId);
    await handle.signal(signalName, ...args);
    this.logger.log(
      `📨 Sent signal '${sanitize(signalName)}' to workflow ${sanitize(workflowId)}`,
    );
  }

  /**
   * Cancel a running workflow.
   */
  async cancelWorkflow(workflowId: string): Promise<void> {
    const handle = await this.getWorkflowHandle(workflowId);
    await handle.cancel();
    this.logger.log(`❌ Cancelled workflow ${sanitize(workflowId)}`);
  }

  /**
   * Wait for a workflow to complete and return its result.
   */
  async getWorkflowResult<T = unknown>(workflowId: string): Promise<T> {
    const handle = await this.getWorkflowHandle(workflowId);
    return handle.result();
  }

  /**
   * Get the current status of a workflow.
   */
  async getWorkflowStatus(
    workflowId: string,
  ): Promise<{ status: string; runId: string }> {
    const handle = await this.getWorkflowHandle(workflowId);
    const description = await handle.describe();
    return {
      status: description.status.name,
      runId: description.runId,
    };
  }

  /**
   * Terminate a workflow with a reason.
   */
  async terminateWorkflow(
    workflowId: string,
    reason?: string,
  ): Promise<void> {
    const handle = await this.getWorkflowHandle(workflowId);
    await handle.terminate(reason);
    this.logger.log(`🛑 Terminated workflow ${sanitize(workflowId)}`);
  }
}
