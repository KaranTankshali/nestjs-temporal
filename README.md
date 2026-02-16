<p align="center">
  <img src="https://nestjs.com/img/logo-small.svg" width="60" alt="NestJS Logo" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://temporal.io/favicon.svg" width="60" alt="Temporal Logo" />
</p>

<h1 align="center">nestjs-temporalio</h1>

<p align="center">
  A first-class <a href="https://nestjs.com/">NestJS</a> integration for <a href="https://temporal.io/">Temporal.io</a> —
  decorator-based activity registration, automatic worker discovery, and a clean client API.<br />
  Inspired by how <code>@nestjs/bullmq</code> wraps BullMQ.
</p>

<p align="center">
  <a href="#installation">Installation</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#api-reference">API Reference</a> •
  <a href="#configuration">Configuration</a> •
  <a href="#testing">Testing</a> •
  <a href="#contributing">Contributing</a>
</p>

---

## Why this package?

Temporal.io is an incredible platform for orchestrating long-running, fault-tolerant workflows. But integrating it into a NestJS application today means a lot of manual wiring:

| Problem | Without `nestjs-temporalio` | With `nestjs-temporalio` |
|---|---|---|
| **Worker registration** | Manual `Worker.create()` calls in `onModuleInit`, repeated per task queue | Automatic — decorate your class with `@Worker()` |
| **Activity binding** | Hand-build an `activities` map, manually `.bind()` each method | Automatic — decorate methods with `@Activity()` |
| **Dependency injection** | Activities lose access to NestJS DI (`this.myService` is `undefined`) | Preserved — activities are bound to their class instance |
| **Client setup** | Duplicate `Connection.connect()` boilerplate in every project | `TemporalClientService` injected anywhere via standard NestJS DI |
| **Multi-queue support** | Custom plumbing to run workers for different task queues | Built-in — multiple `@Worker()` classes with different queues |
| **Configuration** | Scattered `process.env` reads | Centralized `forRoot()` / `forRootAsync()` with async factory support |

The result is **less boilerplate, better DI integration, and a familiar decorator-driven API** that feels native to NestJS.

## Who is this for?

- **NestJS teams adopting Temporal** who want an idiomatic integration instead of manual setup.
- **Teams running multiple task queues** (e.g., onboarding, billing, notifications) that need clean worker separation.
- **Developers coming from `@nestjs/bullmq`** who want the same `@Processor` / `@Process` ergonomics for Temporal.
- **Platform teams** building internal workflow orchestration and want a reusable module across services.

## Installation

```bash
# npm
npm install nestjs-temporalio @temporalio/client @temporalio/worker

# pnpm
pnpm add nestjs-temporalio @temporalio/client @temporalio/worker

# yarn
yarn add nestjs-temporalio @temporalio/client @temporalio/worker
```

> **Peer dependencies:** This package requires `@nestjs/common ^10 || ^11`, `@nestjs/core ^10 || ^11`, `@temporalio/client ^1.9+`, and `@temporalio/worker ^1.9+` (optional — only needed if running workers).

## Quick Start

### 1. Register the module

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { TemporalModule } from 'nestjs-temporalio';

@Module({
  imports: [
    TemporalModule.forRoot({
      address: 'localhost:7233',
      namespace: 'default',
      enableWorker: true,
    }),
  ],
})
export class AppModule {}
```

### 2. Define activities with decorators

```typescript
// activities/order.activities.ts
import { Injectable } from '@nestjs/common';
import { TemporalWorker, Activity } from 'nestjs-temporalio';

import { PaymentService } from '../services/payment.service';
import { EmailService } from '../services/email.service';

@Worker({
  taskQueue: 'order-processing',
  workflowsPath: require.resolve('../workflows/order.workflow'),
})
@Injectable()
export class OrderActivities {
  // Full NestJS dependency injection works here
  constructor(
    private readonly payments: PaymentService,
    private readonly emails: EmailService,
  ) {}

  @Activity()
  async chargePayment(orderId: string, amount: number) {
    return this.payments.charge(orderId, amount);
  }

  @Activity()
  async sendConfirmationEmail(orderId: string, email: string) {
    return this.emails.sendOrderConfirmation(orderId, email);
  }

  @Activity({ name: 'refundPayment' })
  async handleRefund(orderId: string) {
    return this.payments.refund(orderId);
  }

  // Private helpers are NOT registered — only @Activity() methods are
  private formatReceipt(orderId: string) {
    return `Receipt for ${orderId}`;
  }
}
```

### 3. Write a workflow (standard Temporal — no decorators needed)

```typescript
// workflows/order.workflow.ts
import { proxyActivities } from '@temporalio/workflow';

// Activities are referenced by name (matches the method name or @Activity({ name }))
const { chargePayment, sendConfirmationEmail } = proxyActivities({
  startToCloseTimeout: '30s',
  retry: { maximumAttempts: 3 },
});

export async function OrderWorkflow(orderId: string, email: string, amount: number) {
  await chargePayment(orderId, amount);
  await sendConfirmationEmail(orderId, email);
  return { success: true, orderId };
}
```

> **Why aren't workflows decorated?** Temporal runs workflows inside a deterministic V8 sandbox — they can't access NestJS DI, Node.js APIs, or external modules. They must be loaded from a file path. The `workflowsPath` in `@Worker()` handles this.

### 4. Start workflows from anywhere

```typescript
// services/order.service.ts
import { Injectable } from '@nestjs/common';
import { TemporalClientService } from 'nestjs-temporalio';

@Injectable()
export class OrderService {
  constructor(private readonly temporal: TemporalClientService) {}

  async placeOrder(orderId: string, email: string, amount: number) {
    const handle = await this.temporal.startWorkflow(
      'OrderWorkflow',
      `order-${orderId}`,
      [orderId, email, amount],
      'order-processing',
    );

    return { workflowId: handle.workflowId };
  }

  async getOrderStatus(orderId: string) {
    return this.temporal.getWorkflowStatus(`order-${orderId}`);
  }
}
```

### 5. Register everything in your feature module

```typescript
// order.module.ts
import { Module } from '@nestjs/common';

import { OrderActivities } from './activities/order.activities';
import { OrderService } from './services/order.service';
import { OrderController } from './order.controller';

@Module({
  controllers: [OrderController],
  providers: [OrderActivities, OrderService],
})
export class OrderModule {}
```

That's it. When the app starts, `nestjs-temporalio` will:

1. Scan all providers for `@Worker()` classes
2. Collect their `@Activity()` methods (bound to the class instance for DI)
3. Start a Temporal Worker for each unique task queue
4. Log what it discovered:

```
🔍 Discovering @Worker() providers...
📦 Registering worker for "order-processing" with 3 activities
🚀 Starting Temporal Worker for task queue: order-processing...
✅ Worker connected to Temporal at localhost:7233
📋 Task queue: order-processing
🔧 Namespace: default
⚡ Activities: chargePayment, sendConfirmationEmail, refundPayment
```

## Configuration

### Static configuration — `forRoot()`

```typescript
TemporalModule.forRoot({
  address: 'localhost:7233',
  namespace: 'default',
  enableWorker: true,
  workerDefaults: {
    maxCachedWorkflows: 100,
    maxConcurrentActivityTaskExecutions: 10,
  },
})
```

### Async configuration — `forRootAsync()`

Use `forRootAsync()` to inject `ConfigService` or any other provider:

```typescript
import { ConfigModule, ConfigService } from '@nestjs/config';

TemporalModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    address: config.get('TEMPORAL_ADDRESS', 'localhost:7233'),
    namespace: config.get('TEMPORAL_NAMESPACE', 'default'),
    enableWorker: config.get('ENABLE_WORKFLOW_WORKER') === 'true',
  }),
})
```

### Temporal Cloud (mTLS)

```typescript
import * as fs from 'fs';

TemporalModule.forRoot({
  address: 'my-namespace.tmprl.cloud:7233',
  namespace: 'my-namespace.my-account',
  tls: {
    clientCertPair: {
      crt: fs.readFileSync('/certs/client.pem'),
      key: fs.readFileSync('/certs/client.key'),
    },
    serverRootCACertificate: fs.readFileSync('/certs/ca.pem'),
    serverNameOverride: 'my-namespace.tmprl.cloud',
  },
})
```

### Client-only mode (no workers)

If a service only needs to *start* workflows but workers run in a separate process:

```typescript
TemporalModule.forRoot({
  address: 'localhost:7233',
  enableWorker: false, // No workers will be started
})
```

`TemporalClientService` is still available for injection; the `@Worker()` discovery step is simply skipped.

### `TemporalModuleOptions` reference

| Option | Type | Default | Description |
|---|---|---|---|
| `address` | `string` | `'localhost:7233'` | Temporal server gRPC address |
| `namespace` | `string` | `'default'` | Temporal namespace |
| `enableWorker` | `boolean` | `true` | Whether to discover and start workers |
| `tls` | `TemporalTlsOptions` | — | mTLS / Temporal Cloud configuration |
| `workerDefaults` | `object` | — | Default limits for all workers |

## API Reference

### Decorators

#### `@Worker(options: TemporalWorkerOptions)`

Class decorator. Marks a NestJS provider as a Temporal activity host.

```typescript
@Worker({
  taskQueue: 'my-queue',
  workflowsPath: require.resolve('./my.workflow'),
  maxConcurrentActivityTaskExecutions: 20, // optional override
})
@Injectable()
export class MyActivities { ... }
```

| Option | Type | Required | Description |
|---|---|---|---|
| `taskQueue` | `string` | ✅ | Task queue name the worker polls |
| `workflowsPath` | `string` | ✅ | Path to workflow definitions (use `require.resolve()`) |
| `maxCachedWorkflows` | `number` | — | Override module-level default |
| `maxConcurrentActivityTaskExecutions` | `number` | — | Override module-level default |
| `maxConcurrentWorkflowTaskExecutions` | `number` | — | Override module-level default |

#### `@Activity(options?: ActivityOptions)`

Method decorator. Marks a method as a Temporal activity.

```typescript
@Activity()                           // registered as 'myMethod'
async myMethod() { ... }

@Activity({ name: 'customName' })     // registered as 'customName'
async myMethod() { ... }
```

| Option | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | method name | Override the activity name |

### Services

#### `TemporalClientService`

Injectable service for interacting with the Temporal server.

| Method | Returns | Description |
|---|---|---|
| `getClient()` | `Client` | Raw Temporal `Client` instance |
| `startWorkflow(type, id, args, taskQueue)` | `WorkflowHandle` | Start a new workflow |
| `getWorkflowHandle(workflowId)` | `WorkflowHandle` | Get handle to an existing workflow |
| `queryWorkflow(workflowId, queryType, ...args)` | `T` | Query a running workflow |
| `signalWorkflow(workflowId, signalName, ...args)` | `void` | Send a signal to a workflow |
| `cancelWorkflow(workflowId)` | `void` | Cancel a running workflow |
| `terminateWorkflow(workflowId, reason?)` | `void` | Forcefully terminate a workflow |
| `getWorkflowResult(workflowId)` | `T` | Wait for completion and return result |
| `getWorkflowStatus(workflowId)` | `{ status, runId }` | Get workflow status and run ID |

#### `TemporalWorkerService`

Injectable service for worker lifecycle management (usually managed automatically).

| Method | Returns | Description |
|---|---|---|
| `getWorker(taskQueue)` | `Worker \| undefined` | Get a registered worker by queue name |
| `getRegisteredTaskQueues()` | `string[]` | List all active task queue names |
| `shutdownWorker(taskQueue)` | `void` | Shut down a specific worker |

### Multi-queue support

Multiple `@Worker()` classes targeting the same task queue are automatically merged into a single worker:

```typescript
@Worker({ taskQueue: 'billing', workflowsPath: require.resolve('./billing.workflow') })
@Injectable()
export class PaymentActivities {
  @Activity()
  async charge() { ... }
}

@Worker({ taskQueue: 'billing', workflowsPath: require.resolve('./billing.workflow') })
@Injectable()
export class InvoiceActivities {
  @Activity()
  async generateInvoice() { ... }
}

// Result: ONE worker for 'billing' with activities: [charge, generateInvoice]
```

## Architecture

```
┌────────────────────────────────────────────────────────┐
│  AppModule                                             │
│                                                        │
│  TemporalModule.forRootAsync({                         │
│    useFactory: (config) => ({ ... })                   │
│  })                                                    │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │  TemporalDiscoveryService         (on init)      │  │
│  │    ├─ Scans all providers for @Worker()  │  │
│  │    ├─ Collects @Activity() methods               │  │
│  │    └─ Registers workers via TemporalWorkerService│  │
│  └──────────────────────────────────────────────────┘  │
│                                                        │
│  ┌─────────────────────┐  ┌──────────────────────────┐ │
│  │ TemporalClientService│  │ TemporalWorkerService    │ │
│  │  • startWorkflow()  │  │  • registerWorker()      │ │
│  │  • signalWorkflow() │  │  • Worker per task queue  │ │
│  │  • queryWorkflow()  │  │  • Auto-shutdown on exit │ │
│  └─────────────────────┘  └──────────────────────────┘ │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Your Feature Modules                            │  │
│  │                                                  │  │
│  │  @Worker({ taskQueue: 'onboarding' })    │  │
│  │  class OnboardingActivities {                    │  │
│  │    @Activity() addUser() { ... }                 │  │
│  │    @Activity() sendEmail() { ... }               │  │
│  │  }                                               │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

## Testing

The package includes a full test suite. To run:

```bash
cd lib/nestjs-temporalio
npx jest --config jest.config.js
```

```
Test Suites: 5 passed, 5 total
Tests:       69 passed, 69 total
```

When writing tests for *your own* activities, you can mock the Temporal services:

```typescript
import { Test } from '@nestjs/testing';
import { TemporalClientService } from 'nestjs-temporalio';

const module = await Test.createTestingModule({
  providers: [
    MyService,
    {
      provide: TemporalClientService,
      useValue: {
        startWorkflow: jest.fn().mockResolvedValue({ workflowId: 'wf-1' }),
        getWorkflowStatus: jest.fn().mockResolvedValue({ status: 'RUNNING' }),
      },
    },
  ],
}).compile();
```

## Comparison with `@nestjs/bullmq`

If you've used `@nestjs/bullmq`, the concepts map directly:

| `@nestjs/bullmq` | `nestjs-temporalio` | Purpose |
|---|---|---|
| `BullModule.forRoot()` | `TemporalModule.forRoot()` | Module registration |
| `@Processor('queue')` | `@Worker({ taskQueue })` | Class-level queue binding |
| `@Process('job')` | `@Activity()` | Method-level handler |
| `WorkerHost` | — (not needed) | Base class for workers |
| `InjectQueue()` | Inject `TemporalClientService` | Starting jobs/workflows |

## Compatibility

| Dependency | Supported Versions |
|---|---|
| NestJS | `^10.0.0 \|\| ^11.0.0` |
| `@temporalio/client` | `^1.9.0 \|\| ^1.10.0 \|\| ^1.11.0` |
| `@temporalio/worker` | `^1.9.0 \|\| ^1.10.0 \|\| ^1.11.0` (optional) |
| Node.js | `>=18` |
| TypeScript | `>=5.0` |

## Contributing

Contributions are welcome! Here's how to get started:

### Development setup

```bash
# 1. Clone the repository
git clone https://github.com/your-org/nestjs-temporalio.git
cd nestjs-temporalio

# 2. Install dependencies
npm install

# 3. Run tests
npm test

# 4. Build
npm run build
```

### Project structure

```
src/
├── constants.ts                        # Injection tokens & metadata keys
├── decorators/
│   ├── temporal-worker.decorator.ts    # @Worker() class decorator
│   └── activity.decorator.ts           # @Activity() method decorator
├── interfaces/
│   ├── temporal-module-options.interface.ts
│   ├── temporal-worker-options.interface.ts
│   └── activity-options.interface.ts
├── services/
│   ├── temporal-client.service.ts      # Client for starting/querying workflows
│   ├── temporal-worker.service.ts      # Worker lifecycle management
│   └── temporal-discovery.service.ts   # Auto-discovers @Worker() providers
├── temporal.module.ts                  # Dynamic NestJS module
└── index.ts                            # Public API exports
test/
├── decorators.spec.ts
├── temporal-client.service.spec.ts
├── temporal-worker.service.spec.ts
├── temporal-discovery.service.spec.ts
└── temporal.module.spec.ts
```

### Guidelines

1. **Write tests** — every new feature or bugfix should include test coverage.
2. **Follow existing patterns** — decorators use `SetMetadata`, services use standard NestJS DI.
3. **Keep the API surface small** — this package wraps Temporal; it shouldn't re-invent it.
4. **Document public APIs** — JSDoc comments on all exported interfaces, classes, and methods.

### Submitting a PR

1. Fork the repo and create a feature branch (`git checkout -b feat/my-feature`)
2. Make your changes and add/update tests
3. Ensure all tests pass (`npm test`)
4. Ensure the build succeeds (`npm run build`)
5. Open a PR with a clear title and description

### Ideas for contribution

- [ ] `@OnWorkerEvent()` decorator for worker lifecycle hooks (e.g., on error, on shutdown)
- [ ] `@WorkflowQuery()` / `@WorkflowSignal()` decorator helpers for workflow definitions
- [ ] Health check indicator for NestJS Terminus (`TemporalHealthIndicator`)
- [ ] Interceptor / middleware support for activity execution (logging, tracing, metrics)
- [ ] OpenTelemetry integration for distributed tracing
- [ ] CLI schematics (`nest generate temporal-worker`)
