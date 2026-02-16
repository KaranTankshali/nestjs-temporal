import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';

import { TemporalClientService } from '../src/services/temporal-client.service';
import { TEMPORAL_MODULE_OPTIONS } from '../src/constants';
import { TemporalModuleOptions } from '../src/interfaces';

// Mock @temporalio/client — use inline jest.fn() to avoid hoisting issues
jest.mock('@temporalio/client', () => {
  const close = jest.fn();
  const start = jest.fn();
  const getHandle = jest.fn();

  return {
    Connection: {
      connect: jest.fn().mockResolvedValue({ close }),
    },
    Client: jest.fn().mockImplementation(() => ({
      workflow: { start, getHandle },
    })),
    __mocks: { close, start, getHandle },
  };
});

interface TemporalClientMocks {
  __mocks: { close: jest.Mock; start: jest.Mock; getHandle: jest.Mock };
  Connection: { connect: jest.Mock };
  Client: jest.Mock;
}

function getMocks() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('@temporalio/client') as TemporalClientMocks;
  return {
    mockClose: mod.__mocks.close,
    mockStart: mod.__mocks.start,
    mockGetHandle: mod.__mocks.getHandle,
    Connection: mod.Connection,
    Client: mod.Client,
  };
}

describe('TemporalClientService', () => {
  let service: TemporalClientService;

  const defaultOptions: TemporalModuleOptions = {
    address: 'localhost:7233',
    namespace: 'test-namespace',
  };

  beforeEach(async () => {
    const { mockClose, mockStart, mockGetHandle } = getMocks();
    mockClose.mockClear();
    mockStart.mockClear();
    mockGetHandle.mockClear();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TemporalClientService,
        {
          provide: TEMPORAL_MODULE_OPTIONS,
          useValue: defaultOptions,
        },
      ],
    }).compile();

    service = module.get<TemporalClientService>(TemporalClientService);
  });

  describe('onModuleInit', () => {
    it('should connect to Temporal with provided address and namespace', async () => {
      const { Connection, Client } = getMocks();

      await service.onModuleInit();

      expect(Connection.connect).toHaveBeenCalledWith({
        address: 'localhost:7233',
        tls: undefined,
      });
      expect(Client).toHaveBeenCalledWith({
        connection: expect.objectContaining({ close: expect.any(Function) }),
        namespace: 'test-namespace',
      });
    });

    it('should use default address and namespace when not provided', async () => {
      const emptyModule = await Test.createTestingModule({
        providers: [
          TemporalClientService,
          { provide: TEMPORAL_MODULE_OPTIONS, useValue: {} },
        ],
      }).compile();

      const emptyService =
        emptyModule.get<TemporalClientService>(TemporalClientService);
      const { Connection, Client } = getMocks();

      await emptyService.onModuleInit();

      expect(Connection.connect).toHaveBeenCalledWith({
        address: 'localhost:7233',
        tls: undefined,
      });
      expect(Client).toHaveBeenCalledWith({
        connection: expect.anything(),
        namespace: 'default',
      });
    });

    it('should pass TLS options when configured', async () => {
      const tlsOptions: TemporalModuleOptions = {
        address: 'temporal-cloud:7233',
        namespace: 'prod',
        tls: {
          clientCertPair: {
            crt: Buffer.from('cert'),
            key: Buffer.from('key'),
          },
          serverRootCACertificate: Buffer.from('ca'),
          serverNameOverride: 'override.temporal.cloud',
        },
      };

      const tlsModule = await Test.createTestingModule({
        providers: [
          TemporalClientService,
          { provide: TEMPORAL_MODULE_OPTIONS, useValue: tlsOptions },
        ],
      }).compile();

      const tlsService =
        tlsModule.get<TemporalClientService>(TemporalClientService);
      const { Connection } = getMocks();

      await tlsService.onModuleInit();

      expect(Connection.connect).toHaveBeenCalledWith({
        address: 'temporal-cloud:7233',
        tls: {
          clientCertPair: {
            crt: expect.any(Buffer),
            key: expect.any(Buffer),
          },
          serverRootCACertificate: expect.any(Buffer),
          serverNameOverride: 'override.temporal.cloud',
        },
      });
    });

    it('should not throw if connection fails', async () => {
      const { Connection } = getMocks();
      Connection.connect.mockRejectedValueOnce(
        new Error('Connection refused'),
      );

      await expect(service.onModuleInit()).resolves.not.toThrow();
    });
  });

  describe('onApplicationShutdown', () => {
    it('should close connection if it exists', async () => {
      const { mockClose } = getMocks();
      await service.onModuleInit();
      await service.onApplicationShutdown();

      expect(mockClose).toHaveBeenCalled();
    });

    it('should not throw if connection does not exist', async () => {
      await expect(
        service.onApplicationShutdown(),
      ).resolves.not.toThrow();
    });
  });

  describe('getClient', () => {
    it('should return the client after initialization', async () => {
      await service.onModuleInit();
      const client = service.getClient();
      expect(client).toBeDefined();
      expect(client.workflow).toBeDefined();
    });

    it('should throw if client is not initialized', () => {
      expect(() => service.getClient()).toThrow(
        'Temporal client not initialized',
      );
    });
  });

  describe('startWorkflow', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should start a workflow with correct parameters', async () => {
      const { mockStart } = getMocks();
      const mockHandle = { workflowId: 'test-wf-1' };
      mockStart.mockResolvedValue(mockHandle);

      const result = await service.startWorkflow(
        'MyWorkflow',
        'test-wf-1',
        [{ data: 'input' }],
        'my-task-queue',
      );

      expect(mockStart).toHaveBeenCalledWith('MyWorkflow', {
        taskQueue: 'my-task-queue',
        workflowId: 'test-wf-1',
        args: [{ data: 'input' }],
      });
      expect(result).toEqual(mockHandle);
    });

    it('should throw if workflow start fails', async () => {
      const { mockStart } = getMocks();
      mockStart.mockRejectedValue(new Error('Workflow start failed'));

      await expect(
        service.startWorkflow('MyWorkflow', 'wf-1', [], 'queue'),
      ).rejects.toThrow('Workflow start failed');
    });
  });

  describe('getWorkflowHandle', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should return a workflow handle', async () => {
      const { mockGetHandle } = getMocks();
      const mockHandle = { workflowId: 'wf-123' };
      mockGetHandle.mockReturnValue(mockHandle);

      const handle = await service.getWorkflowHandle('wf-123');
      expect(mockGetHandle).toHaveBeenCalledWith('wf-123');
      expect(handle).toEqual(mockHandle);
    });
  });

  describe('queryWorkflow', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should query a workflow', async () => {
      const { mockGetHandle } = getMocks();
      const mockQuery = jest.fn().mockResolvedValue({ status: 'running' });
      mockGetHandle.mockReturnValue({ query: mockQuery });

      const result = await service.queryWorkflow('wf-1', 'getStatus');
      expect(mockQuery).toHaveBeenCalledWith('getStatus');
      expect(result).toEqual({ status: 'running' });
    });

    it('should pass additional args to query', async () => {
      const { mockGetHandle } = getMocks();
      const mockQuery = jest.fn().mockResolvedValue('ok');
      mockGetHandle.mockReturnValue({ query: mockQuery });

      await service.queryWorkflow('wf-1', 'getStep', 'step1', 'arg2');
      expect(mockQuery).toHaveBeenCalledWith('getStep', 'step1', 'arg2');
    });
  });

  describe('signalWorkflow', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should signal a workflow', async () => {
      const { mockGetHandle } = getMocks();
      const mockSignal = jest.fn().mockResolvedValue(undefined);
      mockGetHandle.mockReturnValue({ signal: mockSignal });

      await service.signalWorkflow('wf-1', 'approveStep', true);
      expect(mockSignal).toHaveBeenCalledWith('approveStep', true);
    });
  });

  describe('cancelWorkflow', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should cancel a workflow', async () => {
      const { mockGetHandle } = getMocks();
      const mockCancel = jest.fn().mockResolvedValue(undefined);
      mockGetHandle.mockReturnValue({ cancel: mockCancel });

      await service.cancelWorkflow('wf-1');
      expect(mockCancel).toHaveBeenCalled();
    });
  });

  describe('getWorkflowResult', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should return workflow result', async () => {
      const { mockGetHandle } = getMocks();
      const mockResult = jest
        .fn()
        .mockResolvedValue({ completed: true, data: 42 });
      mockGetHandle.mockReturnValue({ result: mockResult });

      const result = await service.getWorkflowResult('wf-1');
      expect(result).toEqual({ completed: true, data: 42 });
    });
  });

  describe('getWorkflowStatus', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should return workflow status and runId', async () => {
      const { mockGetHandle } = getMocks();
      const mockDescribe = jest.fn().mockResolvedValue({
        status: { name: 'RUNNING' },
        runId: 'run-abc',
      });
      mockGetHandle.mockReturnValue({ describe: mockDescribe });

      const status = await service.getWorkflowStatus('wf-1');
      expect(status).toEqual({ status: 'RUNNING', runId: 'run-abc' });
    });
  });

  describe('terminateWorkflow', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should terminate a workflow with a reason', async () => {
      const { mockGetHandle } = getMocks();
      const mockTerminate = jest.fn().mockResolvedValue(undefined);
      mockGetHandle.mockReturnValue({ terminate: mockTerminate });

      await service.terminateWorkflow('wf-1', 'no longer needed');
      expect(mockTerminate).toHaveBeenCalledWith('no longer needed');
    });

    it('should terminate a workflow without a reason', async () => {
      const { mockGetHandle } = getMocks();
      const mockTerminate = jest.fn().mockResolvedValue(undefined);
      mockGetHandle.mockReturnValue({ terminate: mockTerminate });

      await service.terminateWorkflow('wf-1');
      expect(mockTerminate).toHaveBeenCalledWith(undefined);
    });
  });
});
