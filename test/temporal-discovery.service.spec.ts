import 'reflect-metadata';
import { Injectable } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';

import { TemporalDiscoveryService } from '../src/services/temporal-discovery.service';
import {
  TemporalWorkerService,
  WorkerRegistrationConfig,
} from '../src/services/temporal-worker.service';
import { TEMPORAL_MODULE_OPTIONS } from '../src/constants';
import { Worker } from '../src/decorators/temporal-worker.decorator';
import { Activity } from '../src/decorators/activity.decorator';

describe('TemporalDiscoveryService', () => {
  let discoveryService: TemporalDiscoveryService;
  let mockWorkerService: jest.Mocked<TemporalWorkerService>;
  let mockDiscovery: jest.Mocked<DiscoveryService>;
  let metadataScanner: MetadataScanner;
  let reflector: Reflector;

  // ── Test activity classes ──

  @Worker({
    taskQueue: 'onboarding-queue',
    workflowsPath: '/path/to/onboarding.workflow',
  })
  @Injectable()
  class OnboardingActivities {
    @Activity()
    async addUser() {
      return 'user added';
    }

    @Activity()
    async sendWelcomeEmail() {
      return 'email sent';
    }

    // Not an activity — no decorator
    helperMethod() {
      return 'helper';
    }
  }

  @Worker({
    taskQueue: 'billing-queue',
    workflowsPath: '/path/to/billing.workflow',
    maxCachedWorkflows: 50,
  })
  @Injectable()
  class BillingActivities {
    @Activity({ name: 'processPayment' })
    async handlePayment() {
      return 'paid';
    }
  }

  // Same task queue as OnboardingActivities — should be merged
  @Worker({
    taskQueue: 'onboarding-queue',
    workflowsPath: '/path/to/onboarding.workflow',
  })
  @Injectable()
  class MoreOnboardingActivities {
    @Activity()
    async verifyIdentity() {
      return 'verified';
    }
  }

  // Class without @Worker — should be ignored
  @Injectable()
  class PlainService {
    doSomething() {
      return 'done';
    }
  }

  function createProviderWrapper(
    instance: object,
  ): InstanceWrapper<unknown> {
    return { instance } as unknown as InstanceWrapper<unknown>;
  }

  beforeEach(async () => {
    jest.clearAllMocks();

    mockWorkerService = {
      registerWorker: jest.fn().mockResolvedValue(undefined),
      getWorker: jest.fn(),
      shutdownWorker: jest.fn(),
      getRegisteredTaskQueues: jest.fn(),
      onApplicationShutdown: jest.fn(),
    } as unknown as jest.Mocked<TemporalWorkerService>;

    // Use real MetadataScanner and Reflector (they're stateless utilities)
    metadataScanner = new MetadataScanner();
    reflector = new Reflector();

    mockDiscovery = {
      getProviders: jest.fn(),
      getControllers: jest.fn(),
    } as unknown as jest.Mocked<DiscoveryService>;
  });

  async function createService(
    options: Record<string, unknown> = {},
    providers: object[] = [],
  ) {
    mockDiscovery.getProviders.mockReturnValue(
      providers.map(createProviderWrapper),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TemporalDiscoveryService,
        { provide: TEMPORAL_MODULE_OPTIONS, useValue: options },
        { provide: DiscoveryService, useValue: mockDiscovery },
        { provide: MetadataScanner, useValue: metadataScanner },
        { provide: Reflector, useValue: reflector },
        { provide: TemporalWorkerService, useValue: mockWorkerService },
      ],
    }).compile();

    discoveryService = module.get<TemporalDiscoveryService>(
      TemporalDiscoveryService,
    );
  }

  describe('onModuleInit — worker disabled', () => {
    it('should skip discovery when enableWorker is false', async () => {
      await createService({ enableWorker: false });
      await discoveryService.onModuleInit();

      expect(mockDiscovery.getProviders).not.toHaveBeenCalled();
      expect(mockWorkerService.registerWorker).not.toHaveBeenCalled();
    });
  });

  describe('onModuleInit — no providers decorated', () => {
    it('should not register any workers if no @Worker providers found', async () => {
      await createService({}, [new PlainService()]);
      await discoveryService.onModuleInit();

      expect(mockWorkerService.registerWorker).not.toHaveBeenCalled();
    });
  });

  describe('onModuleInit — single activity class', () => {
    it('should discover activities and register a worker', async () => {
      const instance = new OnboardingActivities();
      await createService({}, [instance]);
      await discoveryService.onModuleInit();

      expect(mockWorkerService.registerWorker).toHaveBeenCalledTimes(1);

      const config = mockWorkerService.registerWorker.mock.calls[0][0];
      expect(config.taskQueue).toBe('onboarding-queue');
      expect(config.workflowsPath).toBe('/path/to/onboarding.workflow');
      expect(Object.keys(config.activities)).toContain('addUser');
      expect(Object.keys(config.activities)).toContain('sendWelcomeEmail');
      // helperMethod should NOT be registered
      expect(Object.keys(config.activities)).not.toContain('helperMethod');
    });

    it('should bind activities to the class instance for DI context', async () => {
      const instance = new OnboardingActivities();
      await createService({}, [instance]);
      await discoveryService.onModuleInit();

      const config = mockWorkerService.registerWorker.mock.calls[0][0];

      // Call the bound activity and verify it runs on the correct instance
      const result = await config.activities['addUser']();
      expect(result).toBe('user added');
    });
  });

  describe('onModuleInit — activity name override', () => {
    it('should register activity with the custom name from @Activity({ name })', async () => {
      const instance = new BillingActivities();
      await createService({}, [instance]);
      await discoveryService.onModuleInit();

      const config = mockWorkerService.registerWorker.mock.calls[0][0];
      expect(Object.keys(config.activities)).toContain('processPayment');
      expect(Object.keys(config.activities)).not.toContain('handlePayment');
    });
  });

  describe('onModuleInit — multiple activity classes on same task queue', () => {
    it('should merge activities from multiple classes into one worker', async () => {
      const onboarding = new OnboardingActivities();
      const moreOnboarding = new MoreOnboardingActivities();
      await createService({}, [onboarding, moreOnboarding]);
      await discoveryService.onModuleInit();

      // Only one worker for "onboarding-queue"
      expect(mockWorkerService.registerWorker).toHaveBeenCalledTimes(1);

      const config = mockWorkerService.registerWorker.mock.calls[0][0];
      expect(config.taskQueue).toBe('onboarding-queue');
      expect(Object.keys(config.activities)).toContain('addUser');
      expect(Object.keys(config.activities)).toContain('sendWelcomeEmail');
      expect(Object.keys(config.activities)).toContain('verifyIdentity');
    });
  });

  describe('onModuleInit — multiple different task queues', () => {
    it('should register separate workers for different task queues', async () => {
      const onboarding = new OnboardingActivities();
      const billing = new BillingActivities();
      await createService({}, [onboarding, billing]);
      await discoveryService.onModuleInit();

      expect(mockWorkerService.registerWorker).toHaveBeenCalledTimes(2);

      const calls = mockWorkerService.registerWorker.mock.calls;
      const taskQueues = calls.map(
        (c: [WorkerRegistrationConfig]) => c[0].taskQueue,
      );
      expect(taskQueues).toContain('onboarding-queue');
      expect(taskQueues).toContain('billing-queue');
    });

    it('should pass worker config options to each queue', async () => {
      const billing = new BillingActivities();
      await createService({}, [billing]);
      await discoveryService.onModuleInit();

      const config = mockWorkerService.registerWorker.mock.calls[0][0];
      expect(config.maxCachedWorkflows).toBe(50);
    });
  });

  describe('onModuleInit — enableWorker default (undefined)', () => {
    it('should discover activities when enableWorker is undefined (defaults to true)', async () => {
      const instance = new OnboardingActivities();
      await createService({}, [instance]);
      await discoveryService.onModuleInit();

      expect(mockWorkerService.registerWorker).toHaveBeenCalledTimes(1);
    });

    it('should discover activities when enableWorker is explicitly true', async () => {
      const instance = new OnboardingActivities();
      await createService({ enableWorker: true }, [instance]);
      await discoveryService.onModuleInit();

      expect(mockWorkerService.registerWorker).toHaveBeenCalledTimes(1);
    });
  });

  describe('onModuleInit — edge cases', () => {
    it('should skip providers with null instance', async () => {
      mockDiscovery.getProviders.mockReturnValue([
        { instance: null },
        { instance: undefined },
        createProviderWrapper(new OnboardingActivities()),
      ] as unknown as ReturnType<DiscoveryService['getProviders']>);

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          TemporalDiscoveryService,
          { provide: TEMPORAL_MODULE_OPTIONS, useValue: {} },
          { provide: DiscoveryService, useValue: mockDiscovery },
          { provide: MetadataScanner, useValue: metadataScanner },
          { provide: Reflector, useValue: reflector },
          { provide: TemporalWorkerService, useValue: mockWorkerService },
        ],
      }).compile();

      discoveryService = module.get<TemporalDiscoveryService>(
        TemporalDiscoveryService,
      );

      await discoveryService.onModuleInit();
      expect(mockWorkerService.registerWorker).toHaveBeenCalledTimes(1);
    });

    it('should handle classes with no methods', async () => {
      @Worker({
        taskQueue: 'empty-queue',
        workflowsPath: '/path/to/empty.workflow',
      })
      @Injectable()
      class EmptyActivities {}

      const instance = new EmptyActivities();
      await createService({}, [instance]);
      await discoveryService.onModuleInit();

      const config = mockWorkerService.registerWorker.mock.calls[0][0];
      expect(Object.keys(config.activities)).toHaveLength(0);
    });
  });
});
