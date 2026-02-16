import { Inject } from '@nestjs/common';

/**
 * Returns the DI token for a task-queue-scoped WorkflowClient.
 *
 * Used internally by `@InjectWorkflowClient()` and `TemporalModule.registerClient()`.
 *
 * @param taskQueue - The task queue name
 * @returns A unique string token
 */
export function getWorkflowClientToken(taskQueue: string): string {
  return `TEMPORAL_WORKFLOW_CLIENT:${taskQueue}`;
}

/**
 * Parameter decorator that injects a task-queue-scoped `WorkflowClient`.
 *
 * This is the Temporal equivalent of BullMQ's `@InjectQueue('queue-name')`.
 *
 * Prerequisites: the task queue must be registered via `TemporalModule.registerClient()`.
 *
 * @param taskQueue - The task queue name to bind to
 *
 * @example
 * ```typescript
 * // 1. Register the client in your module
 * @Module({
 *   imports: [
 *     TemporalModule.forRoot({ address: 'localhost:7233' }),
 *     TemporalModule.registerClient('orders'),
 *   ],
 * })
 * export class OrderModule {}
 *
 * // 2. Inject the scoped client in your service
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
 */
export const InjectWorkflowClient = (
  taskQueue: string,
): ParameterDecorator & PropertyDecorator => Inject(getWorkflowClientToken(taskQueue));
