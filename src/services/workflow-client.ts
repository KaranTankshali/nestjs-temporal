import { WorkflowHandle, Workflow } from '@temporalio/client';

import { TemporalClientService } from './temporal-client.service';

/**
 * Options for starting a workflow via WorkflowClient.
 * Since the task queue is already bound, you only need the workflow ID and args.
 */
export interface WorkflowStartOptions {
  /**
   * Unique workflow ID.
   *
   * @example `order-${orderId}`
   */
  workflowId: string;

  /**
   * Arguments to pass to the workflow function.
   * @default []
   */
  args?: unknown[];
}

/**
 * Task-queue-scoped Temporal workflow client.
 *
 * This is the Temporal equivalent of BullMQ's `Queue` object returned by `@InjectQueue()`.
 * It's pre-bound to a specific task queue so you never need to repeat it.
 *
 * Obtain an instance via `@InjectWorkflowClient('my-task-queue')`.
 *
 * @example
 * ```typescript
 * @Injectable()
 * export class OrderService {
 *   constructor(
 *     @InjectWorkflowClient('orders') private readonly orders: WorkflowClient,
 *   ) {}
 *
 *   async placeOrder(orderId: string, items: Item[]) {
 *     return this.orders.start('OrderWorkflow', {
 *       workflowId: `order-${orderId}`,
 *       args: [{ orderId, items }],
 *     });
 *   }
 *
 *   async cancelOrder(orderId: string) {
 *     return this.orders.cancel(`order-${orderId}`);
 *   }
 * }
 * ```
 */
export class WorkflowClient {
  constructor(
    private readonly clientService: TemporalClientService,
    /** The task queue this client is bound to. */
    public readonly taskQueue: string,
  ) {}

  /**
   * Start a new workflow execution on the bound task queue.
   *
   * Equivalent to `queue.add(jobName, data)` in BullMQ.
   *
   * @param workflowType - Workflow function name (must match the exported function name)
   * @param options - Workflow ID and arguments
   * @returns Workflow handle
   */
  async start<T extends Workflow>(
    workflowType: string,
    options: WorkflowStartOptions,
  ): Promise<WorkflowHandle<T>> {
    return this.clientService.startWorkflow<T>(
      workflowType,
      options.workflowId,
      options.args || [],
      this.taskQueue,
    );
  }

  /**
   * Start a workflow and wait for its result.
   *
   * Convenience method combining `start()` + `result()`.
   *
   * @param workflowType - Workflow function name
   * @param options - Workflow ID and arguments
   * @returns The workflow's return value
   */
  async execute<T = unknown>(
    workflowType: string,
    options: WorkflowStartOptions,
  ): Promise<T> {
    const handle = await this.start(workflowType, options);
    return handle.result();
  }

  /**
   * Get a handle to an existing workflow by ID.
   */
  async getHandle(workflowId: string): Promise<WorkflowHandle> {
    return this.clientService.getWorkflowHandle(workflowId);
  }

  /**
   * Query a running workflow.
   */
  async query<T = unknown>(
    workflowId: string,
    queryType: string,
    ...args: unknown[]
  ): Promise<T> {
    return this.clientService.queryWorkflow<T>(workflowId, queryType, ...args);
  }

  /**
   * Send a signal to a running workflow.
   */
  async signal(
    workflowId: string,
    signalName: string,
    ...args: unknown[]
  ): Promise<void> {
    return this.clientService.signalWorkflow(workflowId, signalName, ...args);
  }

  /**
   * Cancel a running workflow.
   */
  async cancel(workflowId: string): Promise<void> {
    return this.clientService.cancelWorkflow(workflowId);
  }

  /**
   * Terminate a workflow with an optional reason.
   */
  async terminate(workflowId: string, reason?: string): Promise<void> {
    return this.clientService.terminateWorkflow(workflowId, reason);
  }

  /**
   * Wait for a workflow to complete and return its result.
   */
  async result<T = unknown>(workflowId: string): Promise<T> {
    return this.clientService.getWorkflowResult<T>(workflowId);
  }

  /**
   * Get the current status of a workflow.
   */
  async describe(
    workflowId: string,
  ): Promise<{ status: string; runId: string }> {
    return this.clientService.getWorkflowStatus(workflowId);
  }
}
