/**
 * Configuration for the @Worker() class decorator.
 * Defines the task queue, workflows path, and optional worker settings.
 */
export interface TemporalWorkerOptions {
  /**
   * Task queue name this worker will poll.
   * Must match the task queue used when starting workflows.
   *
   * @example 'my-app-onboarding'
   */
  taskQueue: string;

  /**
   * Path to the workflows file or directory.
   *
   * Temporal runs workflows in a sandboxed V8 isolate, so they must be loaded
   * from a file path — they cannot be discovered via NestJS DI.
   *
   * The path is resolved via `require.resolve()` relative to the worker service file
   * inside this package. For reliability, use `require.resolve()` at the call site:
   *
   * @example
   * // Recommended: resolve at the decorator site
   * @Worker({
   *   taskQueue: 'my-queue',
   *   workflowsPath: require.resolve('./workflows'),
   * })
   *
   * @example
   * // Also works: relative path (resolved by the worker service)
   * @Worker({
   *   taskQueue: 'my-queue',
   *   workflowsPath: '../my-module/workflows/my.workflow',
   * })
   */
  workflowsPath: string;

  /**
   * Override the default max cached workflows for this worker.
   */
  maxCachedWorkflows?: number;

  /**
   * Override the default max concurrent activity task executions for this worker.
   */
  maxConcurrentActivityTaskExecutions?: number;

  /**
   * Override the default max concurrent workflow task executions for this worker.
   */
  maxConcurrentWorkflowTaskExecutions?: number;
}
