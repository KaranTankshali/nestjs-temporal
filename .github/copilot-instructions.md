# GitHub Copilot Instructions for nest-temporal

## About this project

nest-temporal is a NestJS dynamic module for Temporal.io. It provides:

- `TemporalModule.forRoot()` / `forRootAsync()` — centralized Temporal config
- `TemporalModule.registerClient(taskQueue)` — registers a task-queue-scoped WorkflowClient
- `@Worker({ taskQueue, workflowsPath })` — class decorator marking a provider as an activity host
- `@Activity()` — method decorator registering a method as a Temporal activity
- `@InjectWorkflowClient(taskQueue)` — injects a scoped WorkflowClient (like BullMQ's `@InjectQueue`)
- `TemporalClientService` — global client for starting/querying/signaling workflows
- `WorkflowClient` — task-queue-scoped client with `start()`, `execute()`, `cancel()`, `signal()`, etc.

## Import rules

All imports come from `'nest-temporal'`. Never use subpath imports.

```typescript
import {
  TemporalModule,
  Worker, Activity,
  InjectWorkflowClient, WorkflowClient,
  TemporalClientService,
  getWorkflowClientToken,
} from 'nest-temporal';
```

## Two patterns for starting workflows

### Pattern A: Global service (simple, flexible)
```typescript
constructor(private readonly temporal: TemporalClientService) {}
await this.temporal.startWorkflow('MyWorkflow', 'wf-id', [args], 'my-queue');
```

### Pattern B: Scoped client (BullMQ-style, type-safe)
```typescript
// In module: TemporalModule.registerClient('my-queue')
constructor(@InjectWorkflowClient('my-queue') private readonly client: WorkflowClient) {}
await this.client.start('MyWorkflow', { workflowId: 'wf-id', args: [args] });
```

## Activity classes must

1. Have `@Worker({ taskQueue, workflowsPath: require.resolve('./workflow') })` decorator
2. Have `@Injectable()` decorator
3. Be registered as NestJS providers in a module
4. Have `@Activity()` on each method to register

## Workflows

Workflows are standard Temporal code — they do NOT use NestJS or nest-temporal imports:

```typescript
import { proxyActivities } from '@temporalio/workflow';
const { myActivity } = proxyActivities({ startToCloseTimeout: '30s' });
export async function MyWorkflow(input: string) { await myActivity(input); }
```

## Testing

Mock `WorkflowClient` using `getWorkflowClientToken()`:

```typescript
{
  provide: getWorkflowClientToken('my-queue'),
  useValue: { start: jest.fn(), cancel: jest.fn() },
}
```

Mock `TemporalClientService` directly:

```typescript
{
  provide: TemporalClientService,
  useValue: { startWorkflow: jest.fn() },
}
```

## Build & test commands

```bash
npm test        # run all Jest tests
npm run build   # compile to dist/
```
