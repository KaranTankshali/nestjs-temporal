/**
 * Injection token for module configuration options.
 * Used internally to inject the user-provided TemporalModuleOptions.
 */
export const TEMPORAL_MODULE_OPTIONS = Symbol('TEMPORAL_MODULE_OPTIONS');

/**
 * Metadata key applied by @Worker() class decorator.
 * Stores the worker configuration (task queue, workflows path, etc.)
 */
export const TEMPORAL_WORKER_METADATA = 'nestjs-temporal:worker';

/**
 * Metadata key applied by @Activity() method decorator.
 * Marks a method for auto-registration as a Temporal activity.
 */
export const TEMPORAL_ACTIVITY_METADATA = 'nestjs-temporal:activity';
