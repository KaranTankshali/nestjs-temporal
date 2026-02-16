// ── Module ──
export { TemporalModule } from './temporal.module';

// ── Decorators ──
export { Worker } from './decorators/temporal-worker.decorator';
export { Activity } from './decorators/activity.decorator';
export {
  InjectWorkflowClient,
  getWorkflowClientToken,
} from './decorators/inject-workflow-client.decorator';

// ── Services ──
export { TemporalClientService } from './services/temporal-client.service';
export {
  TemporalWorkerService,
  WorkerRegistrationConfig,
} from './services/temporal-worker.service';
export { TemporalDiscoveryService } from './services/temporal-discovery.service';
export {
  WorkflowClient,
  WorkflowStartOptions,
} from './services/workflow-client';

// ── Interfaces ──
export {
  TemporalModuleOptions,
  TemporalModuleAsyncOptions,
  TemporalTlsOptions,
} from './interfaces/temporal-module-options.interface';
export { TemporalWorkerOptions } from './interfaces/temporal-worker-options.interface';
export { ActivityOptions } from './interfaces/activity-options.interface';

// ── Constants (metadata keys only — TEMPORAL_MODULE_OPTIONS is internal) ──
export {
  TEMPORAL_WORKER_METADATA,
  TEMPORAL_ACTIVITY_METADATA,
} from './constants';
