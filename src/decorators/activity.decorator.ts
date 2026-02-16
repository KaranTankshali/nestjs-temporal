import { SetMetadata } from '@nestjs/common';

import { TEMPORAL_ACTIVITY_METADATA } from '../constants';
import { ActivityOptions } from '../interfaces';

/**
 * Method decorator that marks a method as a Temporal activity.
 *
 * Only methods decorated with `@Activity()` on a `@Worker()` class
 * will be auto-registered with the Temporal Worker.
 *
 * The activity name defaults to the method name, but can be overridden.
 *
 * @param options - Optional activity configuration
 *
 * @example
 * ```typescript
 * @Worker({ taskQueue: 'my-queue', workflowsPath: '...' })
 * @Injectable()
 * export class MyActivities {
 *   // Registered as 'addUser'
 *   @Activity()
 *   async addUser(input: UserInput) { ... }
 *
 *   // Registered as 'sendEmail' (overridden name)
 *   @Activity({ name: 'sendEmail' })
 *   async handleEmailNotification(input: EmailInput) { ... }
 *
 *   // NOT registered — no @Activity() decorator
 *   private helperMethod() { ... }
 * }
 * ```
 */
export const Activity = (options?: ActivityOptions): MethodDecorator =>
  SetMetadata(TEMPORAL_ACTIVITY_METADATA, options || {});
