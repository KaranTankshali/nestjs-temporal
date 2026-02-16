import 'reflect-metadata';
import { Injectable } from '@nestjs/common';

import {
  Worker,
  Activity,
  TEMPORAL_WORKER_METADATA,
  TEMPORAL_ACTIVITY_METADATA,
} from '../src';

describe('Decorators', () => {
  describe('@Worker()', () => {
    it('should set worker metadata on the class', () => {
      const options = {
        taskQueue: 'test-queue',
        workflowsPath: '/path/to/workflows',
      };

      @Worker(options)
      @Injectable()
      class TestActivities {}

      const metadata = Reflect.getMetadata(
        TEMPORAL_WORKER_METADATA,
        TestActivities,
      );
      expect(metadata).toEqual(options);
    });

    it('should preserve optional worker configuration', () => {
      const options = {
        taskQueue: 'test-queue',
        workflowsPath: '/path/to/workflows',
        maxCachedWorkflows: 50,
        maxConcurrentActivityTaskExecutions: 20,
        maxConcurrentWorkflowTaskExecutions: 5,
      };

      @Worker(options)
      @Injectable()
      class TestActivities {}

      const metadata = Reflect.getMetadata(
        TEMPORAL_WORKER_METADATA,
        TestActivities,
      );
      expect(metadata).toEqual(options);
      expect(metadata.maxCachedWorkflows).toBe(50);
      expect(metadata.maxConcurrentActivityTaskExecutions).toBe(20);
      expect(metadata.maxConcurrentWorkflowTaskExecutions).toBe(5);
    });

    it('should not set activity metadata on a non-decorated class', () => {
      @Injectable()
      class PlainService {}

      const metadata = Reflect.getMetadata(
        TEMPORAL_WORKER_METADATA,
        PlainService,
      );
      expect(metadata).toBeUndefined();
    });
  });

  describe('@Activity()', () => {
    it('should set activity metadata on the method', () => {
      class TestActivities {
        @Activity()
        async myActivity() {
          return 'result';
        }
      }

      const instance = new TestActivities();
      const metadata = Reflect.getMetadata(
        TEMPORAL_ACTIVITY_METADATA,
        instance.myActivity,
      );
      expect(metadata).toEqual({});
    });

    it('should set custom name in activity metadata', () => {
      class TestActivities {
        @Activity({ name: 'customActivityName' })
        async myActivity() {
          return 'result';
        }
      }

      const instance = new TestActivities();
      const metadata = Reflect.getMetadata(
        TEMPORAL_ACTIVITY_METADATA,
        instance.myActivity,
      );
      expect(metadata).toEqual({ name: 'customActivityName' });
    });

    it('should not set metadata on non-decorated methods', () => {
      class TestActivities {
        @Activity()
        async decoratedMethod() {}

        async plainMethod() {}
      }

      const instance = new TestActivities();
      const decoratedMeta = Reflect.getMetadata(
        TEMPORAL_ACTIVITY_METADATA,
        instance.decoratedMethod,
      );
      const plainMeta = Reflect.getMetadata(
        TEMPORAL_ACTIVITY_METADATA,
        instance.plainMethod,
      );

      expect(decoratedMeta).toEqual({});
      expect(plainMeta).toBeUndefined();
    });

    it('should support multiple decorated methods on the same class', () => {
      class TestActivities {
        @Activity()
        async activityOne() {}

        @Activity({ name: 'renamedTwo' })
        async activityTwo() {}

        @Activity()
        async activityThree() {}
      }

      const instance = new TestActivities();

      expect(
        Reflect.getMetadata(TEMPORAL_ACTIVITY_METADATA, instance.activityOne),
      ).toEqual({});
      expect(
        Reflect.getMetadata(TEMPORAL_ACTIVITY_METADATA, instance.activityTwo),
      ).toEqual({ name: 'renamedTwo' });
      expect(
        Reflect.getMetadata(
          TEMPORAL_ACTIVITY_METADATA,
          instance.activityThree,
        ),
      ).toEqual({});
    });
  });

  describe('@Worker() + @Activity() combined', () => {
    it('should set both class-level and method-level metadata', () => {
      const workerOptions = {
        taskQueue: 'combined-queue',
        workflowsPath: '/path/to/workflows',
      };

      @Worker(workerOptions)
      @Injectable()
      class CombinedActivities {
        @Activity()
        async processOrder() {}

        @Activity({ name: 'sendNotification' })
        async handleNotification() {}
      }

      // Class-level metadata
      const classMeta = Reflect.getMetadata(
        TEMPORAL_WORKER_METADATA,
        CombinedActivities,
      );
      expect(classMeta).toEqual(workerOptions);

      // Method-level metadata
      const instance = new CombinedActivities();
      expect(
        Reflect.getMetadata(
          TEMPORAL_ACTIVITY_METADATA,
          instance.processOrder,
        ),
      ).toEqual({});
      expect(
        Reflect.getMetadata(
          TEMPORAL_ACTIVITY_METADATA,
          instance.handleNotification,
        ),
      ).toEqual({ name: 'sendNotification' });
    });
  });
});
