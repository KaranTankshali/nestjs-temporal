import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';

import { TemporalWorkerService } from '../src/services/temporal-worker.service';
import { TEMPORAL_MODULE_OPTIONS } from '../src/constants';
import { TemporalModuleOptions } from '../src/interfaces';

// Mock @temporalio/worker — all fns inline to avoid hoisting issues
jest.mock('@temporalio/worker', () => {
  const workerRun = jest.fn().mockResolvedValue(undefined);
  const workerShutdown = jest.fn().mockResolvedValue(undefined);
  const workerCreate = jest.fn().mockResolvedValue({
    run: workerRun,
    shutdown: workerShutdown,
  });
  const nativeConnectionConnect = jest.fn().mockResolvedValue({});

  return {
    Worker: { create: workerCreate },
    NativeConnection: { connect: nativeConnectionConnect },
    __mocks: { workerRun, workerShutdown, workerCreate, nativeConnectionConnect },
  };
});

interface TemporalWorkerMocks {
  __mocks: {
    workerRun: jest.Mock;
    workerShutdown: jest.Mock;
    workerCreate: jest.Mock;
    nativeConnectionConnect: jest.Mock;
  };
}

function getMocks() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('@temporalio/worker') as TemporalWorkerMocks;
  return {
    mockWorkerRun: mod.__mocks.workerRun,
    mockWorkerShutdown: mod.__mocks.workerShutdown,
    mockWorkerCreate: mod.__mocks.workerCreate,
    mockNativeConnectionConnect: mod.__mocks.nativeConnectionConnect,
  };
}

describe('TemporalWorkerService', () => {
  let service: TemporalWorkerService;

  const defaultOptions: TemporalModuleOptions = {
    address: 'localhost:7233',
    namespace: 'test-namespace',
  };

  beforeEach(async () => {
    const { mockWorkerRun, mockWorkerShutdown, mockWorkerCreate, mockNativeConnectionConnect } =
      getMocks();
    mockWorkerRun.mockClear();
    mockWorkerShutdown.mockClear();
    mockWorkerCreate.mockClear().mockResolvedValue({
      run: mockWorkerRun,
      shutdown: mockWorkerShutdown,
    });
    mockNativeConnectionConnect.mockClear().mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TemporalWorkerService,
        { provide: TEMPORAL_MODULE_OPTIONS, useValue: defaultOptions },
      ],
    }).compile();

    service = module.get<TemporalWorkerService>(TemporalWorkerService);
  });

  describe('registerWorker', () => {
    const baseConfig = {
      taskQueue: 'test-queue',
      workflowsPath: '/absolute/path/to/workflows.js',
      activities: {
        activityOne: jest.fn(),
        activityTwo: jest.fn(),
      },
    };

    it('should create a NativeConnection with the configured address', async () => {
      const { mockNativeConnectionConnect } = getMocks();
      await service.registerWorker(baseConfig);

      expect(mockNativeConnectionConnect).toHaveBeenCalledWith({
        address: 'localhost:7233',
        tls: undefined,
      });
    });

    it('should create a Worker with the correct configuration', async () => {
      const { mockWorkerCreate } = getMocks();
      await service.registerWorker(baseConfig);

      expect(mockWorkerCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          namespace: 'test-namespace',
          taskQueue: 'test-queue',
          activities: baseConfig.activities,
          maxCachedWorkflows: 100,
          maxConcurrentActivityTaskExecutions: 10,
        }),
      );
    });

    it('should use default address and namespace when not configured', async () => {
      const { mockNativeConnectionConnect, mockWorkerCreate } = getMocks();

      const emptyModule = await Test.createTestingModule({
        providers: [
          TemporalWorkerService,
          { provide: TEMPORAL_MODULE_OPTIONS, useValue: {} },
        ],
      }).compile();

      const emptyService =
        emptyModule.get<TemporalWorkerService>(TemporalWorkerService);

      await emptyService.registerWorker(baseConfig);

      expect(mockNativeConnectionConnect).toHaveBeenCalledWith({
        address: 'localhost:7233',
        tls: undefined,
      });
      expect(mockWorkerCreate).toHaveBeenCalledWith(
        expect.objectContaining({ namespace: 'default' }),
      );
    });

    it('should start the worker in background (call run())', async () => {
      const { mockWorkerRun } = getMocks();
      await service.registerWorker(baseConfig);
      expect(mockWorkerRun).toHaveBeenCalled();
    });

    it('should store the worker and make it retrievable', async () => {
      await service.registerWorker(baseConfig);
      const worker = service.getWorker('test-queue');
      expect(worker).toBeDefined();
    });

    it('should skip registration if worker for same task queue already exists', async () => {
      const { mockWorkerCreate } = getMocks();
      await service.registerWorker(baseConfig);
      mockWorkerCreate.mockClear();

      await service.registerWorker(baseConfig);
      expect(mockWorkerCreate).not.toHaveBeenCalled();
    });

    it('should respect config-level worker overrides', async () => {
      const { mockWorkerCreate } = getMocks();
      await service.registerWorker({
        ...baseConfig,
        maxCachedWorkflows: 200,
        maxConcurrentActivityTaskExecutions: 50,
        maxConcurrentWorkflowTaskExecutions: 25,
      });

      expect(mockWorkerCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          maxCachedWorkflows: 200,
          maxConcurrentActivityTaskExecutions: 50,
          maxConcurrentWorkflowTaskExecutions: 25,
        }),
      );
    });

    it('should use workerDefaults from module options when config does not override', async () => {
      const { mockWorkerCreate } = getMocks();

      const moduleWithDefaults = await Test.createTestingModule({
        providers: [
          TemporalWorkerService,
          {
            provide: TEMPORAL_MODULE_OPTIONS,
            useValue: {
              ...defaultOptions,
              workerDefaults: {
                maxCachedWorkflows: 75,
                maxConcurrentActivityTaskExecutions: 15,
              },
            },
          },
        ],
      }).compile();

      const serviceWithDefaults =
        moduleWithDefaults.get<TemporalWorkerService>(TemporalWorkerService);

      await serviceWithDefaults.registerWorker(baseConfig);

      expect(mockWorkerCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          maxCachedWorkflows: 75,
          maxConcurrentActivityTaskExecutions: 15,
        }),
      );
    });

    it('should not throw if NativeConnection.connect fails', async () => {
      const { mockNativeConnectionConnect } = getMocks();
      mockNativeConnectionConnect.mockRejectedValueOnce(
        new Error('Connection refused'),
      );

      await expect(
        service.registerWorker(baseConfig),
      ).resolves.not.toThrow();
    });

    it('should not throw if Worker.create fails', async () => {
      const { mockWorkerCreate } = getMocks();
      mockWorkerCreate.mockRejectedValueOnce(
        new Error('Worker creation failed'),
      );

      await expect(
        service.registerWorker(baseConfig),
      ).resolves.not.toThrow();
    });

    it('should pass TLS options when configured', async () => {
      const { mockNativeConnectionConnect } = getMocks();

      const tlsModule = await Test.createTestingModule({
        providers: [
          TemporalWorkerService,
          {
            provide: TEMPORAL_MODULE_OPTIONS,
            useValue: {
              ...defaultOptions,
              tls: {
                clientCertPair: {
                  crt: Buffer.from('cert'),
                  key: Buffer.from('key'),
                },
              },
            },
          },
        ],
      }).compile();

      const tlsService =
        tlsModule.get<TemporalWorkerService>(TemporalWorkerService);
      await tlsService.registerWorker(baseConfig);

      expect(mockNativeConnectionConnect).toHaveBeenCalledWith({
        address: 'localhost:7233',
        tls: expect.objectContaining({
          clientCertPair: {
            crt: expect.any(Buffer),
            key: expect.any(Buffer),
          },
        }),
      });
    });
  });

  describe('getRegisteredTaskQueues', () => {
    it('should return empty array when no workers registered', () => {
      expect(service.getRegisteredTaskQueues()).toEqual([]);
    });

    it('should return all registered task queue names', async () => {
      const { mockWorkerRun, mockWorkerShutdown, mockWorkerCreate } = getMocks();

      await service.registerWorker({
        taskQueue: 'queue-a',
        workflowsPath: '/path/a',
        activities: {},
      });

      // Reset so a second create returns a fresh mock
      mockWorkerCreate.mockResolvedValue({
        run: jest.fn().mockResolvedValue(undefined),
        shutdown: jest.fn().mockResolvedValue(undefined),
      });

      await service.registerWorker({
        taskQueue: 'queue-b',
        workflowsPath: '/path/b',
        activities: {},
      });

      const queues = service.getRegisteredTaskQueues();
      expect(queues).toContain('queue-a');
      expect(queues).toContain('queue-b');
      expect(queues).toHaveLength(2);
    });
  });

  describe('getWorker', () => {
    it('should return undefined for non-existent task queue', () => {
      expect(service.getWorker('non-existent')).toBeUndefined();
    });
  });

  describe('shutdownWorker', () => {
    it('should shut down a specific worker and remove it from the map', async () => {
      const { mockWorkerShutdown } = getMocks();

      await service.registerWorker({
        taskQueue: 'test-queue',
        workflowsPath: '/path',
        activities: {},
      });

      await service.shutdownWorker('test-queue');

      expect(mockWorkerShutdown).toHaveBeenCalled();
      expect(service.getWorker('test-queue')).toBeUndefined();
      expect(service.getRegisteredTaskQueues()).toEqual([]);
    });

    it('should do nothing if worker does not exist', async () => {
      await expect(
        service.shutdownWorker('non-existent'),
      ).resolves.not.toThrow();
    });
  });

  describe('onApplicationShutdown', () => {
    it('should shut down all workers', async () => {
      const { mockWorkerShutdown } = getMocks();

      await service.registerWorker({
        taskQueue: 'queue-1',
        workflowsPath: '/path/1',
        activities: {},
      });

      await service.onApplicationShutdown('SIGTERM');

      expect(mockWorkerShutdown).toHaveBeenCalled();
      expect(service.getRegisteredTaskQueues()).toEqual([]);
    });

    it('should handle empty workers map gracefully', async () => {
      await expect(
        service.onApplicationShutdown('SIGINT'),
      ).resolves.not.toThrow();
    });
  });
});
