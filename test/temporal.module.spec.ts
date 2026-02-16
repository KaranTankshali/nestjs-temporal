import 'reflect-metadata';
import { DynamicModule } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';

import { TemporalModule } from '../src/temporal.module';
import { TEMPORAL_MODULE_OPTIONS } from '../src/constants';
import { TemporalClientService } from '../src/services/temporal-client.service';
import { TemporalWorkerService } from '../src/services/temporal-worker.service';
import { TemporalDiscoveryService } from '../src/services/temporal-discovery.service';

interface ValueProvider {
  provide: symbol | string;
  useValue: unknown;
}

interface FactoryProvider {
  provide: symbol | string;
  useFactory: (...args: unknown[]) => unknown;
  inject: unknown[];
}

function findProvider(
  result: DynamicModule,
  token: symbol | string,
): ValueProvider | FactoryProvider | undefined {
  return (result.providers as (ValueProvider | FactoryProvider)[])?.find(
    (p) => typeof p === 'object' && 'provide' in p && p.provide === token,
  );
}

describe('TemporalModule', () => {
  describe('forRoot', () => {
    it('should return a DynamicModule with correct structure', () => {
      const result = TemporalModule.forRoot({
        address: 'localhost:7233',
        namespace: 'default',
      });

      expect(result.module).toBe(TemporalModule);
      expect(result.imports).toContain(DiscoveryModule);
    });

    it('should provide TEMPORAL_MODULE_OPTIONS with the supplied options', () => {
      const options = {
        address: 'temporal:7233',
        namespace: 'my-ns',
        enableWorker: true,
      };

      const result = TemporalModule.forRoot(options);
      const optionsProvider = findProvider(
        result,
        TEMPORAL_MODULE_OPTIONS,
      ) as ValueProvider;

      expect(optionsProvider).toBeDefined();
      expect(optionsProvider.useValue).toEqual(options);
    });

    it('should use empty defaults when called without arguments', () => {
      const result = TemporalModule.forRoot();
      const optionsProvider = findProvider(
        result,
        TEMPORAL_MODULE_OPTIONS,
      ) as ValueProvider;

      expect(optionsProvider.useValue).toEqual({});
    });

    it('should register all three services as providers', () => {
      const result = TemporalModule.forRoot();

      expect(result.providers).toContain(TemporalClientService);
      expect(result.providers).toContain(TemporalWorkerService);
      expect(result.providers).toContain(TemporalDiscoveryService);
    });

    it('should export TemporalClientService and TemporalWorkerService', () => {
      const result = TemporalModule.forRoot();

      expect(result.exports).toContain(TemporalClientService);
      expect(result.exports).toContain(TemporalWorkerService);
    });

    it('should NOT export TEMPORAL_MODULE_OPTIONS (contains sensitive config)', () => {
      const result = TemporalModule.forRoot();
      expect(result.exports).not.toContain(TEMPORAL_MODULE_OPTIONS);
    });

    it('should NOT export TemporalDiscoveryService (internal only)', () => {
      const result = TemporalModule.forRoot();
      expect(result.exports).not.toContain(TemporalDiscoveryService);
    });
  });

  describe('forRootAsync', () => {
    it('should return a DynamicModule with correct structure', () => {
      const result = TemporalModule.forRootAsync({
        useFactory: () => ({
          address: 'localhost:7233',
        }),
      });

      expect(result.module).toBe(TemporalModule);
      expect(result.imports).toContain(DiscoveryModule);
    });

    it('should provide TEMPORAL_MODULE_OPTIONS via useFactory', () => {
      const factory = jest.fn().mockReturnValue({
        address: 'temporal:7233',
        namespace: 'ns',
      });

      const result = TemporalModule.forRootAsync({
        useFactory: factory,
        inject: ['ConfigService'],
      });

      const optionsProvider = findProvider(
        result,
        TEMPORAL_MODULE_OPTIONS,
      ) as FactoryProvider;

      expect(optionsProvider).toBeDefined();
      expect(optionsProvider.useFactory).toBe(factory);
      expect(optionsProvider.inject).toEqual(['ConfigService']);
    });

    it('should include user-provided imports', () => {
      class FakeConfigModule {}

      const result = TemporalModule.forRootAsync({
        imports: [FakeConfigModule],
        useFactory: () => ({}),
      });

      expect(result.imports).toContain(FakeConfigModule);
      expect(result.imports).toContain(DiscoveryModule);
    });

    it('should handle empty imports and inject arrays', () => {
      const result = TemporalModule.forRootAsync({
        useFactory: () => ({}),
      });

      const optionsProvider = findProvider(
        result,
        TEMPORAL_MODULE_OPTIONS,
      ) as FactoryProvider;

      expect(optionsProvider.inject).toEqual([]);
      expect(result.imports).toContain(DiscoveryModule);
    });

    it('should register all three services', () => {
      const result = TemporalModule.forRootAsync({
        useFactory: () => ({}),
      });

      expect(result.providers).toContain(TemporalClientService);
      expect(result.providers).toContain(TemporalWorkerService);
      expect(result.providers).toContain(TemporalDiscoveryService);
    });

    it('should export TemporalClientService and TemporalWorkerService (not raw options)', () => {
      const result = TemporalModule.forRootAsync({
        useFactory: () => ({}),
      });

      expect(result.exports).toContain(TemporalClientService);
      expect(result.exports).toContain(TemporalWorkerService);
      expect(result.exports).not.toContain(TEMPORAL_MODULE_OPTIONS);
    });
  });
});
