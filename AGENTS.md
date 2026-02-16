# AGENTS.md — AI Agent Instructions for nest-temporal

This file provides instructions for AI coding agents (OpenAI Codex, Claude, etc.) working on the **nest-temporal** source code itself.

If you are generating code that **uses** nest-temporal as a dependency, see `llms.txt` and `llms-full.txt` instead.

---

## Project Overview

nest-temporal is a NestJS dynamic module that wraps the Temporal.io TypeScript SDK. It provides:
- Decorator-based activity registration (`@Worker`, `@Activity`)
- Automatic worker discovery at startup via NestJS `DiscoveryService`
- A global `TemporalClientService` for starting/managing workflows
- A scoped `@InjectWorkflowClient()` decorator (BullMQ's `@InjectQueue` equivalent)
- `forRoot()` / `forRootAsync()` / `registerClient()` module configuration

## Tech Stack

- **Language:** TypeScript 5.4+ (strict mode, experimentalDecorators)
- **Runtime:** Node.js ≥18
- **Framework:** NestJS 10 or 11
- **External SDK:** @temporalio/client, @temporalio/worker
- **Testing:** Jest + ts-jest
- **Build:** tsc (no bundler)

## Commands

```bash
# Install dependencies
npm install

# Build (compiles src/ → dist/)
npm run build

# Run all tests
npm test

# Run a specific test file
npx jest test/workflow-client.spec.ts

# Type-check without emitting
npx tsc -p tsconfig.build.json --noEmit

# Lint (if eslint is configured)
npm run lint
```

## Project Structure

```
src/
├── constants.ts                             # Injection tokens & metadata keys
├── index.ts                                 # Public API barrel — EVERY export goes here
├── temporal.module.ts                       # DynamicModule: forRoot, forRootAsync, registerClient
├── decorators/
│   ├── temporal-worker.decorator.ts         # @Worker() — class decorator using SetMetadata
│   ├── activity.decorator.ts                # @Activity() — method decorator using SetMetadata
│   ├── inject-workflow-client.decorator.ts  # @InjectWorkflowClient() + getWorkflowClientToken()
│   └── index.ts                             # Barrel
├── interfaces/
│   ├── temporal-module-options.interface.ts  # TemporalModuleOptions, AsyncOptions, TlsOptions
│   ├── temporal-worker-options.interface.ts  # TemporalWorkerOptions
│   ├── activity-options.interface.ts         # ActivityOptions
│   └── index.ts                             # Barrel
└── services/
    ├── temporal-client.service.ts            # Global Temporal client (Connection + Client)
    ├── temporal-worker.service.ts            # Worker lifecycle management
    ├── temporal-discovery.service.ts         # Auto-discovers @Worker/@Activity at startup
    ├── workflow-client.ts                    # WorkflowClient — task-queue-scoped proxy
    └── index.ts                             # Barrel

test/
├── decorators.spec.ts
├── inject-workflow-client.spec.ts
├── workflow-client.spec.ts
├── temporal-client.service.spec.ts
├── temporal-worker.service.spec.ts
├── temporal-discovery.service.spec.ts
└── temporal.module.spec.ts
```

## Code Conventions

1. **All public exports go through `src/index.ts`** — users import from `'nest-temporal'` only.
2. **Decorators use `SetMetadata` from `@nestjs/common`** — no custom reflect-metadata calls.
3. **Services use standard NestJS patterns** — `@Injectable()`, `OnModuleInit`, `OnApplicationShutdown`.
4. **Injection tokens** are defined in `src/constants.ts`:
   - `TEMPORAL_MODULE_OPTIONS` (Symbol) — internal, not exported
   - `TEMPORAL_WORKER_METADATA` (string) — exported
   - `TEMPORAL_ACTIVITY_METADATA` (string) — exported
5. **WorkflowClient tokens** use the pattern `TEMPORAL_WORKFLOW_CLIENT:{taskQueue}` (string).
6. **The module is `@Global()`** — TemporalClientService is available everywhere after forRoot().
7. **Errors are logged but not thrown** during connection/worker startup (graceful degradation).
8. **Log messages use emoji prefixes** (✅, ❌, 🚀, 📦, 🔍) for visual scanning.
9. **JSDoc is required** on all exported classes, methods, interfaces, and decorators.
10. **Tests mock `@temporalio/client` and `@temporalio/worker`** — no real Temporal server needed.

## How to Add a New Feature

### Adding a new decorator
1. Create `src/decorators/my-decorator.ts` using `SetMetadata` or `@Inject`
2. Export it from `src/decorators/index.ts`
3. Export it from `src/index.ts`
4. Add tests in `test/decorators.spec.ts` or a new spec file
5. Document in README.md and llms-full.txt

### Adding a new service method
1. Add the method to the relevant service in `src/services/`
2. If the method should be on `WorkflowClient` too, add a proxy method there
3. Add tests
4. Update the method table in README.md and llms-full.txt

### Adding a new module method (like registerClient)
1. Add the static method to `TemporalModule` in `src/temporal.module.ts`
2. Export any new types/helpers from `src/index.ts`
3. Add tests in `test/temporal.module.spec.ts`
4. Document in README.md and llms-full.txt

## Testing Patterns

- Tests are in `test/` directory (not colocated with source)
- Jest config is in `jest.config.js`
- Temporal SDK modules are fully mocked via `jest.mock()`
- Use `Test.createTestingModule()` from `@nestjs/testing` for service tests
- Use `Reflect.getMetadata()` for decorator tests
- **Always run `npm test` after changes** — all 96 tests must pass

## Important Design Decisions

1. **Why @Global()?** — TemporalClientService should be injectable anywhere without re-importing the module. Same pattern as @nestjs/bullmq.
2. **Why separate WorkflowClient from TemporalClientService?** — WorkflowClient is task-queue-scoped (like BullMQ's Queue). TemporalClientService is the global fallback.
3. **Why doesn't the module throw on connection failure?** — Graceful degradation. The app should start even if Temporal is temporarily down.
4. **Why are workflows loaded from file paths?** — Temporal sandboxes workflows in V8 isolates. They cannot participate in NestJS DI.
5. **Why does discoverWorkers() merge same-queue activities?** — Multiple @Worker classes can share a task queue (e.g., OrderActivities + InvoiceActivities both on 'billing'). They're combined into one Temporal Worker.
