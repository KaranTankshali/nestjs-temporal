<p align="center">
  <img src="https://nestjs.com/img/logo-small.svg" width="60" alt="NestJS Logo" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://temporal.io/favicon.svg" width="60" alt="Temporal Logo" />
</p>

<h1 align="center">nest-temporal</h1>

<p align="center">
  A first-class <a href="https://nestjs.com/">NestJS</a> integration for <a href="https://temporal.io/">Temporal.io</a> —
  decorator-based activity registration, automatic worker discovery, and a clean client API.<br />
  Inspired by how <code>@nestjs/bullmq</code> wraps BullMQ.
</p>

<p align="center">
  <a href="#installation">Installation</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#starting-workflows">Starting Workflows</a> •
  <a href="#api-reference">API Reference</a> •
  <a href="#configuration">Configuration</a> •
  <a href="#testing">Testing</a> •
  <a href="#contributing">Contributing</a>
</p>

---

## Why this package?

Temporal.io is an incredible platform for orchestrating long-running, fault-tolerant workflows. But integrating it into a NestJS application today means a lot of manual wiring:

| Problem | Without `nest-temporal` | With `nest-temporal` |
|---|---|---|
| **Worker registration** | Manual `Worker.create()` calls in `onModuleInit`, repeated per task queue | Automatic — decorate your class with `@Worker()` |
| **Activity binding** | Hand-build an `activities` map, manually `.bind()` each method | Automatic — decorate methods with `@Activity()` |
| **Dependency injection** | Activities lose access to NestJS DI (`this.myService` is `undefined`) | Preserved — activities are bound to their class instance |
| **Client setup** | Duplicate `Connection.connect()` boilerplate in every project | `TemporalClientService` or `@InjectWorkflowClient()` — your choice |
| **Multi-queue support** | Custom plumbing to run workers for different task queues | Built-in — multiple `@Worker()` classes with different queues |
| **Configuration** | Scattered `process.env` reads | Centralized `forRoot()` / `forRootAsync()` with async factory support |

The result is **less boilerplate, better DI integration, and a familiar decorator-driven API** that feels native to NestJS.

## Who is this for?

- **NestJS teams adopting Temporal** who want an idiomatic integration instead of manual setup.
- **Teams running multiple task queues** (e.g., onboarding, billing, notifications) that need clean worker separation.
- **Developers coming from `@nestjs/bullmq`** who want the same `@Processor` / `@Process` / `@InjectQueue` ergonomics for Temporal.
- **Platform teams** building internal workflow orchestration and want a reusable module across services.

## Installation

```bash
# npm
npm install nest-temporal @temporalio/client @temporalio/worker

# pnpm
pnpm add nest-temporal @temporalio/client @temporalio/worker

# yarn
yarn add nest-temporal @temporalio/client @temporalio/worker
```

> **Peer dependencies:** This package requires `@nestjs/common ^10 || ^11`, `@nestjs/core ^10 || ^11`, `@temporalio/client ^1.9+`, and `@temporalio/worker ^1.9+` (optional — only needed if running workers).

## Quick Start

### 1. Register the module

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { TemporalModule } from 'nest-temporal';

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
import { Worker, Activity } from 'nest-temporal';

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

### 4. Start workflows from your service

```typescript
// services/order.service.ts
import { Injectable } from '@nestjs/common';
import { TemporalClientService } from 'nest-temporal';

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

That's it. When the app starts, `nest-temporal` will:

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

---

## Starting Workflows

`nest-temporal` offers **two approaches** for starting workflows. Choose whichever fits your project best — they both use the same underlying connection and can coexist.

### Approach A: Global `TemporalClientService`

Inject the global service and pass the task queue on every call. Simple and flexible.

```typescript
import { Injectable } from '@nestjs/common';
import { TemporalClientService } from 'nest-temporal';

@Injectable()
export class OrderService {
  constructor(private readonly temporal: TemporalClientService) {}

  async placeOrder(orderId: string, items: Item[]) {
    return this.temporal.startWorkflow(
      'OrderWorkflow',
      `order-${orderId}`,
      [{ orderId, items }],
      'order-processing',       // ← task queue passed every time
    );
  }

  async shipOrder(orderId: string) {
    return this.temporal.startWorkflow(
      'ShipWorkflow',
      `ship-${orderId}`,
      [{ orderId }],
      'shipping',               // ← different queue, same service
    );
  }
}
```

**No extra module configuration needed** — `TemporalClientService` is always available after `forRoot()`.

### Approach B: Scoped `@InjectWorkflowClient()` (BullMQ-style)

Register a task-queue-scoped client and inject it. The queue name is declared once — never repeated.

This is the direct equivalent of BullMQ's `@InjectQueue('audio')` pattern.

**Step 1 — Register the client(s) in your module:**

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { TemporalModule } from 'nest-temporal';

@Module({
  imports: [
    TemporalModule.forRoot({ address: 'localhost:7233' }),
    TemporalModule.registerClient('order-processing'),    // ← like BullModule.registerQueue()
    TemporalModule.registerClient('shipping'),
  ],
})
export class AppModule {}
```

**Step 2 — Inject the scoped client:**

```typescript
// services/order.service.ts
import { Injectable } from '@nestjs/common';
import { InjectWorkflowClient, WorkflowClient } from 'nest-temporal';

@Injectable()
export class OrderService {
  constructor(
    @InjectWorkflowClient('order-processing')             // ← like @InjectQueue('audio')
    private readonly orders: WorkflowClient,

    @InjectWorkflowClient('shipping')
    private readonly shipping: WorkflowClient,
  ) {}

  async placeOrder(orderId: string, items: Item[]) {
    return this.orders.start('OrderWorkflow', {            // ← no task queue needed
      workflowId: `order-${orderId}`,
      args: [{ orderId, items }],
    });
  }

  async shipOrder(orderId: string) {
    return this.shipping.start('ShipWorkflow', {
      workflowId: `ship-${orderId}`,
      args: [{ orderId }],
    });
  }

  async cancelOrder(orderId: string) {
    return this.orders.cancel(`order-${orderId}`);
  }

  async getOrderStatus(orderId: string) {
    return this.orders.describe(`order-${orderId}`);
  }
}
```

### Which approach should I use?

| Scenario | Recommended |
|---|---|
| Single task queue, simple app / prototype | **Approach A** — less ceremony |
| Multiple task queues, team project | **Approach B** — safety + clarity |
| Dynamic queue names determined at runtime | **Approach A** — queue is a parameter |
| Feature-module isolation (each module owns its queue) | **Approach B** — explicit dependency declaration |
| Migrating from `@nestjs/bullmq` | **Approach B** — 1:1 mental model |

> Both approaches share the same underlying `TemporalClientService` connection. There's no performance overhead in using both side by side.

---

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

`TemporalClientService` (and any `@InjectWorkflowClient()` clients) are still available for injection; the `@Worker()` discovery step is simply skipped.

### `TemporalModuleOptions` reference

| Option | Type | Default | Description |
|---|---|---|---|
| `address` | `string` | `'localhost:7233'` | Temporal server gRPC address |
| `namespace` | `string` | `'default'` | Temporal namespace |
| `enableWorker` | `boolean` | `true` | Whether to discover and start workers |
| `tls` | `TemporalTlsOptions` | — | mTLS / Temporal Cloud configuration |
| `workerDefaults` | `object` | — | Default limits for all workers |

## API Reference

### Module Methods

#### `TemporalModule.forRoot(options?)`

Register the module with static options. Provides `TemporalClientService` globally.

#### `TemporalModule.forRootAsync(options)`

Register with an async factory — use when you need to inject `ConfigService` etc.

#### `TemporalModule.registerClient(taskQueue)`

Register a task-queue-scoped `WorkflowClient` provider. This is the equivalent of `BullModule.registerQueue()`.

```typescript
// String form
TemporalModule.registerClient('orders')

// Object form
TemporalModule.registerClient({ taskQueue: 'orders' })
```

Can be called multiple times for different task queues. The registered client is injectable via `@InjectWorkflowClient('orders')`.

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

#### `@InjectWorkflowClient(taskQueue: string)`

Parameter/property decorator. Injects a task-queue-scoped `WorkflowClient`.

Equivalent to BullMQ's `@InjectQueue()`.

```typescript
constructor(
  @InjectWorkflowClient('orders') private readonly orders: WorkflowClient,
) {}
```

> **Prerequisite:** The task queue must be registered via `TemporalModule.registerClient('orders')`.

### Services

#### `TemporalClientService`

Global injectable service for interacting with the Temporal server. Use this when you want full flexibility and don't mind passing the task queue on each call.

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

#### `WorkflowClient`

Task-queue-scoped client injected via `@InjectWorkflowClient()`. Pre-bound to a specific task queue — you never pass the queue name.

Equivalent to the `Queue` object from `@InjectQueue()` in BullMQ.

| Method | Returns | Description |
|---|---|---|
| `taskQueue` | `string` | The bound task queue name (readonly property) |
| `start(type, { workflowId, args? })` | `WorkflowHandle` | Start a new workflow |
| `execute(type, { workflowId, args? })` | `T` | Start + wait for result |
| `getHandle(workflowId)` | `WorkflowHandle` | Get handle to an existing workflow |
| `query(workflowId, queryType, ...args)` | `T` | Query a running workflow |
| `signal(workflowId, signalName, ...args)` | `void` | Send a signal to a workflow |
| `cancel(workflowId)` | `void` | Cancel a running workflow |
| `terminate(workflowId, reason?)` | `void` | Forcefully terminate a workflow |
| `result(workflowId)` | `T` | Wait for completion and return result |
| `describe(workflowId)` | `{ status, runId }` | Get workflow status and run ID |

#### `TemporalWorkerService`

Injectable service for worker lifecycle management (usually managed automatically).

| Method | Returns | Description |
|---|---|---|
| `getWorker(taskQueue)` | `Worker \| undefined` | Get a registered worker by queue name |
| `getRegisteredTaskQueues()` | `string[]` | List all active task queue names |
| `shutdownWorker(taskQueue)` | `void` | Shut down a specific worker |

### Helper Functions

#### `getWorkflowClientToken(taskQueue: string)`

Returns the DI injection token for a given task queue. Useful for advanced scenarios like manual provider registration or testing.

```typescript
import { getWorkflowClientToken } from 'nest-temporal';

const token = getWorkflowClientToken('orders');
// → 'TEMPORAL_WORKFLOW_CLIENT:orders'
```

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
┌──────────────────────────────────────────────────────────────┐
│  AppModule                                                   │
│                                                              │
│  TemporalModule.forRoot({ ... })                             │
│  TemporalModule.registerClient('orders')                     │
│  TemporalModule.registerClient('notifications')              │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  TemporalDiscoveryService              (on init)       │  │
│  │    ├─ Scans all providers for @Worker()                │  │
│  │    ├─ Collects @Activity() methods                     │  │
│  │    └─ Registers workers via TemporalWorkerService      │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌─────────────────────┐  ┌────────────────────────────────┐ │
│  │ TemporalClientService│  │ TemporalWorkerService          │ │
│  │  • startWorkflow()  │  │  • registerWorker()            │ │
│  │  • signalWorkflow() │  │  • Worker per task queue       │ │
│  │  • queryWorkflow()  │  │  • Auto-shutdown on exit       │ │
│  └────────┬────────────┘  └────────────────────────────────┘ │
│           │                                                  │
│  ┌────────▼────────────────────────────────────────────────┐ │
│  │  WorkflowClient (scoped)        one per registerClient  │ │
│  │  • @InjectWorkflowClient('orders')   → orders client   │ │
│  │  • @InjectWorkflowClient('notifs')   → notifs client   │ │
│  │  • Pre-bound to task queue, delegates to ClientService  │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  Your Feature Modules                                   │ │
│  │                                                         │ │
│  │  @Worker({ taskQueue: 'onboarding' })                   │ │
│  │  class OnboardingActivities {                           │ │
│  │    @Activity() addUser() { ... }                        │ │
│  │    @Activity() sendEmail() { ... }                      │ │
│  │  }                                                      │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

## Testing

The package includes a full test suite. To run:

```bash
npx jest --config jest.config.js
```

```
Test Suites: 7 passed, 7 total
Tests:       96 passed, 96 total
```

### Mocking the global `TemporalClientService`

When testing services that inject `TemporalClientService` directly:

```typescript
import { Test } from '@nestjs/testing';
import { TemporalClientService } from 'nest-temporal';

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

### Mocking a scoped `WorkflowClient`

When testing services that use `@InjectWorkflowClient()`:

```typescript
import { Test } from '@nestjs/testing';
import { getWorkflowClientToken, WorkflowClient } from 'nest-temporal';

const module = await Test.createTestingModule({
  providers: [
    OrderService,
    {
      provide: getWorkflowClientToken('orders'),
      useValue: {
        start: jest.fn().mockResolvedValue({ workflowId: 'order-1' }),
        cancel: jest.fn().mockResolvedValue(undefined),
        describe: jest.fn().mockResolvedValue({ status: 'RUNNING', runId: 'run-1' }),
      } as Partial<WorkflowClient>,
    },
  ],
}).compile();
```

> **Tip:** With `@InjectWorkflowClient`, you only mock the methods your service actually calls — and you never need to assert the `taskQueue` argument since it's pre-bound.

## Comparison with `@nestjs/bullmq`

If you've used `@nestjs/bullmq`, the concepts map directly:

| `@nestjs/bullmq` | `nest-temporal` | Purpose |
|---|---|---|
| `BullModule.forRoot()` | `TemporalModule.forRoot()` | Module registration |
| `BullModule.registerQueue({ name })` | `TemporalModule.registerClient(taskQueue)` | Register a queue-scoped provider |
| `@InjectQueue('audio')` | `@InjectWorkflowClient('orders')` | Inject queue-scoped client |
| `queue.add('jobName', data)` | `client.start('WorkflowName', { workflowId, args })` | Dispatch work |
| `@Processor('queue')` | `@Worker({ taskQueue })` | Class-level queue binding |
| `@Process('job')` | `@Activity()` | Method-level handler |
| `WorkerHost` | — (not needed) | Base class for workers |

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
git clone git@github.com:KaranTankshali/nestjs-temporal.git
cd nest-temporal

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
│   ├── activity.decorator.ts           # @Activity() method decorator
│   └── inject-workflow-client.decorator.ts  # @InjectWorkflowClient() + token helper
├── interfaces/
│   ├── temporal-module-options.interface.ts
│   ├── temporal-worker-options.interface.ts
│   └── activity-options.interface.ts
├── services/
│   ├── temporal-client.service.ts      # Global client for starting/querying workflows
│   ├── temporal-worker.service.ts      # Worker lifecycle management
│   ├── temporal-discovery.service.ts   # Auto-discovers @Worker() providers
│   └── workflow-client.ts             # Task-queue-scoped client (BullMQ-style)
├── temporal.module.ts                  # Dynamic NestJS module (forRoot, forRootAsync, registerClient)
└── index.ts                            # Public API exports
test/
├── decorators.spec.ts
├── inject-workflow-client.spec.ts
├── workflow-client.spec.ts
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
