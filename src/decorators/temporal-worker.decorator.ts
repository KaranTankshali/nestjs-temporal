import { SetMetadata } from '@nestjs/common';

import { TEMPORAL_WORKER_METADATA } from '../constants';
import { TemporalWorkerOptions } from '../interfaces';

/**
 * Class decorator that marks a provider as a Temporal activity host.
 *
 * The decorated class's `@Activity()` methods will be auto-discovered
 * and registered with a Temporal Worker for the specified task queue.
 *
 * Equivalent to `@Processor('queue-name')` in `@nestjs/bullmq`.
 *
 * @param options - Worker configuration (task queue, workflows path, etc.)
 *
 * @example
 * ```typescript
 * @Worker({
 *   taskQueue: 'my-app-onboarding',
 *   workflowsPath: require.resolve('./workflows'),
 * })
 * @Injectable()
 * export class OnboardingActivities {
 *   @Activity()
 *   async processOrder(input: OrderInput) { ... }
 * }
 * ```
 */
export const Worker = (
  options: TemporalWorkerOptions,
): ClassDecorator => SetMetadata(TEMPORAL_WORKER_METADATA, options);
