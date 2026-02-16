import { ModuleMetadata, Type } from '@nestjs/common';

/**
 * TLS configuration for connecting to Temporal Cloud
 * or self-hosted Temporal with mTLS enabled.
 */
export interface TemporalTlsOptions {
  clientCertPair?: {
    crt: Buffer;
    key: Buffer;
  };
  serverRootCACertificate?: Buffer;
  serverNameOverride?: string;
}

/**
 * Configuration options for the TemporalModule.
 *
 * @example
 * // Simple local development
 * TemporalModule.forRoot({
 *   address: 'localhost:7233',
 *   namespace: 'default',
 * })
 *
 * @example
 * // Temporal Cloud
 * TemporalModule.forRoot({
 *   address: 'my-namespace.tmprl.cloud:7233',
 *   namespace: 'my-namespace',
 *   tls: {
 *     clientCertPair: {
 *       crt: fs.readFileSync('/path/to/client.pem'),
 *       key: fs.readFileSync('/path/to/client.key'),
 *     },
 *   },
 * })
 */
export interface TemporalModuleOptions {
  /**
   * Temporal server address.
   * @default 'localhost:7233'
   */
  address?: string;

  /**
   * Temporal namespace.
   * @default 'default'
   */
  namespace?: string;

  /**
   * Whether to enable worker registration in this process.
   * Set to false if this service only needs the client (e.g., to start workflows)
   * but workers run in a separate process.
   * @default true
   */
  enableWorker?: boolean;

  /**
   * TLS configuration for Temporal Cloud or mTLS setups.
   */
  tls?: TemporalTlsOptions;

  /**
   * Default worker options applied to all workers unless overridden.
   */
  workerDefaults?: {
    maxCachedWorkflows?: number;
    maxConcurrentActivityTaskExecutions?: number;
    maxConcurrentWorkflowTaskExecutions?: number;
  };
}

/**
 * Async configuration for TemporalModule.
 * Follows the standard NestJS async module pattern (like @nestjs/bullmq, @nestjs/typeorm).
 *
 * @example
 * TemporalModule.forRootAsync({
 *   imports: [ConfigModule],
 *   useFactory: (config: ConfigService) => ({
 *     address: config.get('TEMPORAL_ADDRESS'),
 *     namespace: config.get('TEMPORAL_NAMESPACE'),
 *     enableWorker: config.get('ENABLE_WORKFLOW_WORKER') === 'true',
 *   }),
 *   inject: [ConfigService],
 * })
 */
export interface TemporalModuleAsyncOptions
  extends Pick<ModuleMetadata, 'imports'> {
  /**
   * Factory function that returns TemporalModuleOptions.
   * Can be async.
   */
  useFactory: (
    ...args: unknown[]
  ) => Promise<TemporalModuleOptions> | TemporalModuleOptions;

  /**
   * Providers to inject into the factory function.
   */
  inject?: Array<Type<unknown> | string | symbol>;
}
