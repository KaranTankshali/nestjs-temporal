import 'reflect-metadata';

import { WorkflowClient } from '../src/services/workflow-client';
import { TemporalClientService } from '../src/services/temporal-client.service';

describe('WorkflowClient', () => {
  let workflowClient: WorkflowClient;
  let mockClientService: jest.Mocked<TemporalClientService>;

  const TASK_QUEUE = 'orders';

  beforeEach(() => {
    mockClientService = {
      startWorkflow: jest.fn(),
      getWorkflowHandle: jest.fn(),
      queryWorkflow: jest.fn(),
      signalWorkflow: jest.fn(),
      cancelWorkflow: jest.fn(),
      terminateWorkflow: jest.fn(),
      getWorkflowResult: jest.fn(),
      getWorkflowStatus: jest.fn(),
    } as unknown as jest.Mocked<TemporalClientService>;

    workflowClient = new WorkflowClient(mockClientService, TASK_QUEUE);
  });

  it('should expose the task queue name', () => {
    expect(workflowClient.taskQueue).toBe('orders');
  });

  describe('start', () => {
    it('should delegate to clientService.startWorkflow with the bound task queue', async () => {
      const mockHandle = { workflowId: 'order-123' };
      mockClientService.startWorkflow.mockResolvedValue(mockHandle as any);

      const result = await workflowClient.start('OrderWorkflow', {
        workflowId: 'order-123',
        args: [{ orderId: '123', items: ['a', 'b'] }],
      });

      expect(mockClientService.startWorkflow).toHaveBeenCalledWith(
        'OrderWorkflow',
        'order-123',
        [{ orderId: '123', items: ['a', 'b'] }],
        'orders',
      );
      expect(result).toEqual(mockHandle);
    });

    it('should default args to empty array', async () => {
      const mockHandle = { workflowId: 'order-456' };
      mockClientService.startWorkflow.mockResolvedValue(mockHandle as any);

      await workflowClient.start('OrderWorkflow', {
        workflowId: 'order-456',
      });

      expect(mockClientService.startWorkflow).toHaveBeenCalledWith(
        'OrderWorkflow',
        'order-456',
        [],
        'orders',
      );
    });
  });

  describe('execute', () => {
    it('should start workflow and return its result', async () => {
      const mockHandle = {
        workflowId: 'order-789',
        result: jest.fn().mockResolvedValue({ completed: true }),
      };
      mockClientService.startWorkflow.mockResolvedValue(mockHandle as any);

      const result = await workflowClient.execute('OrderWorkflow', {
        workflowId: 'order-789',
        args: [{ orderId: '789' }],
      });

      expect(mockClientService.startWorkflow).toHaveBeenCalledWith(
        'OrderWorkflow',
        'order-789',
        [{ orderId: '789' }],
        'orders',
      );
      expect(mockHandle.result).toHaveBeenCalled();
      expect(result).toEqual({ completed: true });
    });
  });

  describe('getHandle', () => {
    it('should delegate to clientService.getWorkflowHandle', async () => {
      const mockHandle = { workflowId: 'order-111' };
      mockClientService.getWorkflowHandle.mockResolvedValue(mockHandle as any);

      const handle = await workflowClient.getHandle('order-111');

      expect(mockClientService.getWorkflowHandle).toHaveBeenCalledWith(
        'order-111',
      );
      expect(handle).toEqual(mockHandle);
    });
  });

  describe('query', () => {
    it('should delegate to clientService.queryWorkflow', async () => {
      mockClientService.queryWorkflow.mockResolvedValue({ status: 'running' });

      const result = await workflowClient.query('wf-1', 'getStatus');

      expect(mockClientService.queryWorkflow).toHaveBeenCalledWith(
        'wf-1',
        'getStatus',
      );
      expect(result).toEqual({ status: 'running' });
    });

    it('should pass additional args', async () => {
      mockClientService.queryWorkflow.mockResolvedValue('step2');

      await workflowClient.query('wf-1', 'getStep', 'step2');

      expect(mockClientService.queryWorkflow).toHaveBeenCalledWith(
        'wf-1',
        'getStep',
        'step2',
      );
    });
  });

  describe('signal', () => {
    it('should delegate to clientService.signalWorkflow', async () => {
      mockClientService.signalWorkflow.mockResolvedValue(undefined);

      await workflowClient.signal('wf-1', 'approve', true);

      expect(mockClientService.signalWorkflow).toHaveBeenCalledWith(
        'wf-1',
        'approve',
        true,
      );
    });
  });

  describe('cancel', () => {
    it('should delegate to clientService.cancelWorkflow', async () => {
      mockClientService.cancelWorkflow.mockResolvedValue(undefined);

      await workflowClient.cancel('wf-1');

      expect(mockClientService.cancelWorkflow).toHaveBeenCalledWith('wf-1');
    });
  });

  describe('terminate', () => {
    it('should delegate to clientService.terminateWorkflow', async () => {
      mockClientService.terminateWorkflow.mockResolvedValue(undefined);

      await workflowClient.terminate('wf-1', 'no longer needed');

      expect(mockClientService.terminateWorkflow).toHaveBeenCalledWith(
        'wf-1',
        'no longer needed',
      );
    });

    it('should work without a reason', async () => {
      mockClientService.terminateWorkflow.mockResolvedValue(undefined);

      await workflowClient.terminate('wf-1');

      expect(mockClientService.terminateWorkflow).toHaveBeenCalledWith(
        'wf-1',
        undefined,
      );
    });
  });

  describe('result', () => {
    it('should delegate to clientService.getWorkflowResult', async () => {
      mockClientService.getWorkflowResult.mockResolvedValue({ data: 42 });

      const result = await workflowClient.result('wf-1');

      expect(mockClientService.getWorkflowResult).toHaveBeenCalledWith('wf-1');
      expect(result).toEqual({ data: 42 });
    });
  });

  describe('describe', () => {
    it('should delegate to clientService.getWorkflowStatus', async () => {
      mockClientService.getWorkflowStatus.mockResolvedValue({
        status: 'RUNNING',
        runId: 'run-abc',
      });

      const status = await workflowClient.describe('wf-1');

      expect(mockClientService.getWorkflowStatus).toHaveBeenCalledWith('wf-1');
      expect(status).toEqual({ status: 'RUNNING', runId: 'run-abc' });
    });
  });
});
