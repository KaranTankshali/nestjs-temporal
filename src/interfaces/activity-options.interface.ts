/**
 * Options for the @Activity() method decorator.
 */
export interface ActivityOptions {
  /**
   * Override the activity name registered with Temporal.
   * Defaults to the method name if not specified.
   *
   * @example
   * @Activity({ name: 'processPayment' })
   * async handlePayment(input: PaymentInput) { ... }
   * // Registered as 'processPayment' instead of 'handlePayment'
   */
  name?: string;
}
