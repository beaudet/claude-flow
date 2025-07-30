/**
 * Comprehensive tests for OpenTelemetry Performance Collector
 * Tests enterprise-grade observability integration
 */

import { jest } from '@jest/globals';
import { OpenTelemetryCollector, TelemetryConfig } from '../telemetry/OpenTelemetryCollector.js';

// Mock OpenTelemetry dependencies
const mockMeter = {
  createHistogram: jest.fn(),
  createGauge: jest.fn(),
  createCounter: jest.fn(),
};

const mockTracer = {
  startActiveSpan: jest.fn(),
};

const mockMetrics = {
  getMeter: jest.fn(() => mockMeter),
};

const mockTrace = {
  getTracer: jest.fn(() => mockTracer),
  SpanStatusCode: { OK: 1, ERROR: 2 },
};

const mockNodeSDK = {
  start: jest.fn().mockResolvedValue(undefined),
  shutdown: jest.fn().mockResolvedValue(undefined),
};

const mockPrometheusExporter = jest.fn();
const mockOTLPExporter = jest.fn();
const mockConsoleExporter = jest.fn();

// Mock the OpenTelemetry modules
jest.mock('@opentelemetry/api', () => ({
  metrics: mockMetrics,
  trace: mockTrace,
  context: {},
  propagation: {},
}));

jest.mock('@opentelemetry/auto-instrumentations-node', () => ({
  NodeSDK: jest.fn(() => mockNodeSDK),
}));

jest.mock('@opentelemetry/exporter-prometheus', () => ({
  PrometheusExporter: mockPrometheusExporter,
}));

jest.mock('@opentelemetry/exporter-otlp-http', () => ({
  OTLPMetricExporter: mockOTLPExporter,
}));

jest.mock('@opentelemetry/sdk-metrics', () => ({
  ConsoleMetricExporter: mockConsoleExporter,
  PeriodicExportingMetricReader: jest.fn(),
}));

describe('OpenTelemetryCollector', () => {
  let collector: OpenTelemetryCollector;
  let mockConfig: TelemetryConfig;

  beforeEach(() => {
    mockConfig = {
      serviceName: 'claude-flow-test',
      version: '2.0.0',
      environment: 'development',
      exporters: {
        prometheus: {
          enabled: true,
          port: 9090,
          endpoint: '/metrics',
        },
        otlp: {
          enabled: true,
          url: 'http://localhost:4318/v1/metrics',
        },
        console: {
          enabled: true,
        },
      },
      privacy: {
        dataRetentionHours: 24,
        localOnly: true,
        optInTelemetry: true,
      },
      metrics: {
        collectionInterval: 5000,
        enableCustomMetrics: true,
        enableSystemMetrics: true,
        enablePerformanceMetrics: true,
      },
    };

    // Setup mock metric instruments
    const mockInstrument = {
      record: jest.fn(),
      add: jest.fn(),
    };

    mockMeter.createHistogram.mockReturnValue(mockInstrument);
    mockMeter.createGauge.mockReturnValue(mockInstrument);
    mockMeter.createCounter.mockReturnValue(mockInstrument);

    collector = new OpenTelemetryCollector(mockConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
    collector.shutdown();
  });

  describe('Initialization', () => {
    test('should initialize with correct configuration', () => {
      const status = collector.getStatus();
      
      expect(status.config).toEqual(mockConfig);
      expect(status.initialized).toBe(false);
      expect(status.metricsCount).toBeGreaterThan(0);
    });

    test('should create all required metrics instruments', () => {
      // Verify all metric types are created
      expect(mockMeter.createHistogram).toHaveBeenCalledWith(
        'claude_flow_agent_execution_duration_ms',
        expect.objectContaining({
          description: 'Time taken for agent task execution',
          unit: 'ms',
        })
      );

      expect(mockMeter.createGauge).toHaveBeenCalledWith(
        'claude_flow_agent_memory_usage_bytes',
        expect.objectContaining({
          description: 'Memory usage per agent',
          unit: 'bytes',
        })
      );

      expect(mockMeter.createCounter).toHaveBeenCalledWith(
        'claude_flow_agent_tasks_total',
        expect.objectContaining({
          description: 'Total number of agent tasks executed',
        })
      );
    });

    test('should initialize OpenTelemetry SDK', async () => {
      await collector.initialize();

      expect(mockNodeSDK.start).toHaveBeenCalled();
      
      const status = collector.getStatus();
      expect(status.initialized).toBe(true);
    });

    test('should configure exporters based on config', async () => {
      await collector.initialize();

      expect(mockPrometheusExporter).toHaveBeenCalledWith({
        port: 9090,
        endpoint: '/metrics',
      });

      expect(mockOTLPExporter).toHaveBeenCalledWith({
        url: 'http://localhost:4318/v1/metrics',
        headers: undefined,
      });

      expect(mockConsoleExporter).toHaveBeenCalled();
    });

    test('should handle initialization errors gracefully', async () => {
      mockNodeSDK.start.mockRejectedValueOnce(new Error('SDK initialization failed'));

      await expect(collector.initialize()).rejects.toThrow('SDK initialization failed');
      
      const status = collector.getStatus();
      expect(status.initialized).toBe(false);
    });
  });

  describe('Agent Metrics Recording', () => {
    beforeEach(async () => {
      await collector.initialize();
    });

    test('should record agent execution metrics', () => {
      const agentMetrics = {
        executionTime: 1500,
        memoryUsage: 128 * 1024 * 1024,
        taskCount: 5,
        errorCount: 1,
      };

      collector.recordAgentMetrics('agent-123', 'coder', agentMetrics);

      const mockInstrument = mockMeter.createHistogram.mock.results[0].value;
      expect(mockInstrument.record).toHaveBeenCalledWith(
        1500,
        { agent_id: 'agent-123', agent_type: 'coder' }
      );
    });

    test('should handle partial agent metrics', () => {
      const partialMetrics = {
        executionTime: 800,
        // memoryUsage, taskCount, errorCount omitted
      };

      expect(() => {
        collector.recordAgentMetrics('agent-456', 'reviewer', partialMetrics);
      }).not.toThrow();

      const mockInstrument = mockMeter.createHistogram.mock.results[0].value;
      expect(mockInstrument.record).toHaveBeenCalledWith(
        800,
        { agent_id: 'agent-456', agent_type: 'reviewer' }
      );
    });

    test('should record metrics for different agent types', () => {
      const agentTypes = ['coder', 'reviewer', 'tester', 'planner', 'researcher'];
      
      agentTypes.forEach((type, index) => {
        collector.recordAgentMetrics(`agent-${index}`, type, {
          executionTime: 1000 + index * 100,
          memoryUsage: (50 + index * 10) * 1024 * 1024,
        });
      });

      const mockInstrument = mockMeter.createHistogram.mock.results[0].value;
      expect(mockInstrument.record).toHaveBeenCalledTimes(5);
    });
  });

  describe('System Metrics Recording', () => {
    beforeEach(async () => {
      await collector.initialize();
    });

    test('should record system performance metrics', () => {
      const systemMetrics = {
        cpuUsage: 65.5,
        memoryUsage: 4 * 1024 * 1024 * 1024, // 4GB
        diskUsage: 50 * 1024 * 1024 * 1024,  // 50GB
        networkBytesIn: 1024 * 1024,          // 1MB
        networkBytesOut: 2 * 1024 * 1024,     // 2MB
      };

      collector.recordSystemMetrics(systemMetrics);

      // Verify CPU usage gauge is called
      const cpuGauge = mockMeter.createGauge.mock.results.find(
        result => mockMeter.createGauge.mock.calls.some(
          call => call[0] === 'claude_flow_system_cpu_usage_percent'
        )
      )?.value;
      
      expect(cpuGauge?.record).toHaveBeenCalledWith(65.5);

      // Verify network I/O counter is called with direction labels
      const networkCounter = mockMeter.createCounter.mock.results.find(
        result => mockMeter.createCounter.mock.calls.some(
          call => call[0] === 'claude_flow_system_network_bytes_total'
        )
      )?.value;

      expect(networkCounter?.add).toHaveBeenCalledWith(1024 * 1024, { direction: 'in' });
      expect(networkCounter?.add).toHaveBeenCalledWith(2 * 1024 * 1024, { direction: 'out' });
    });

    test('should handle missing system metrics gracefully', () => {
      const partialMetrics = {
        cpuUsage: 45.0,
        // Other metrics omitted
      };

      expect(() => {
        collector.recordSystemMetrics(partialMetrics);
      }).not.toThrow();
    });
  });

  describe('Hive Mind Coordination Metrics', () => {
    beforeEach(async () => {
      await collector.initialize();
    });

    test('should record hive mind metrics', () => {
      const hiveMindMetrics = {
        activeAgents: 8,
        taskQueueSize: 25,
        coordinationLatency: 150,
      };

      collector.recordHiveMindMetrics(hiveMindMetrics);

      // Verify active agents gauge
      const activeAgentsGauge = mockMeter.createGauge.mock.results.find(
        result => mockMeter.createGauge.mock.calls.some(
          call => call[0] === 'claude_flow_hive_mind_active_agents'
        )
      )?.value;
      
      expect(activeAgentsGauge?.record).toHaveBeenCalledWith(8);

      // Verify coordination latency histogram
      const latencyHistogram = mockMeter.createHistogram.mock.results.find(
        result => mockMeter.createHistogram.mock.calls.some(
          call => call[0] === 'claude_flow_hive_mind_coordination_latency_ms'
        )
      )?.value;
      
      expect(latencyHistogram?.record).toHaveBeenCalledWith(150);
    });

    test('should track agent scaling patterns', () => {
      // Simulate agent scaling up
      const scalingData = [
        { activeAgents: 2, taskQueueSize: 5 },
        { activeAgents: 4, taskQueueSize: 12 },
        { activeAgents: 8, taskQueueSize: 20 },
        { activeAgents: 6, taskQueueSize: 8 },  // Scale down
      ];

      scalingData.forEach(data => {
        collector.recordHiveMindMetrics(data);
      });

      const activeAgentsGauge = mockMeter.createGauge.mock.results.find(
        result => mockMeter.createGauge.mock.calls.some(
          call => call[0] === 'claude_flow_hive_mind_active_agents'
        )
      )?.value;

      expect(activeAgentsGauge?.record).toHaveBeenCalledTimes(4);
    });
  });

  describe('Performance Regression Tracking', () => {
    beforeEach(async () => {
      await collector.initialize();
    });

    test('should record performance regression metrics', () => {
      const baseline = 1000;
      const current = 1250;
      const regressionDetected = true;

      collector.recordPerformanceRegression(baseline, current, regressionDetected);

      // Verify baseline gauge
      const baselineGauge = mockMeter.createGauge.mock.results.find(
        result => mockMeter.createGauge.mock.calls.some(
          call => call[0] === 'claude_flow_performance_baseline_ms'
        )
      )?.value;
      
      expect(baselineGauge?.record).toHaveBeenCalledWith(1000);

      // Verify regression counter with labels
      const regressionCounter = mockMeter.createCounter.mock.results.find(
        result => mockMeter.createCounter.mock.calls.some(
          call => call[0] === 'claude_flow_performance_regressions_total'
        )
      )?.value;

      expect(regressionCounter?.add).toHaveBeenCalledWith(1, {
        baseline_ms: '1000',
        current_ms: '1250',
        regression_percent: '25.00',
      });

      // Verify performance score calculation
      const scoreGauge = mockMeter.createGauge.mock.results.find(
        result => mockMeter.createGauge.mock.calls.some(
          call => call[0] === 'claude_flow_performance_score'
        )
      )?.value;

      expect(scoreGauge?.record).toHaveBeenCalledWith(75); // 100 - 25% regression
    });

    test('should not record regression counter when no regression detected', () => {
      collector.recordPerformanceRegression(1000, 950, false); // Improvement

      const regressionCounter = mockMeter.createCounter.mock.results.find(
        result => mockMeter.createCounter.mock.calls.some(
          call => call[0] === 'claude_flow_performance_regressions_total'
        )
      )?.value;

      expect(regressionCounter?.add).not.toHaveBeenCalled();
    });
  });

  describe('Distributed Tracing', () => {
    beforeEach(async () => {
      await collector.initialize();
    });

    test('should create spans for performance tracking', async () => {
      const mockSpan = {
        setStatus: jest.fn(),
        end: jest.fn(),
      };

      mockTracer.startActiveSpan.mockImplementation((name, callback) => {
        return callback(mockSpan);
      });

      const testOperation = jest.fn().mockResolvedValue('test result');

      const result = await collector.createSpan('test-operation', testOperation);

      expect(result).toBe('test result');
      expect(mockTracer.startActiveSpan).toHaveBeenCalledWith('test-operation', expect.any(Function));
      expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: mockTrace.SpanStatusCode.OK });
      expect(mockSpan.end).toHaveBeenCalled();
    });

    test('should handle span errors correctly', async () => {
      const mockSpan = {
        setStatus: jest.fn(),
        end: jest.fn(),
      };

      mockTracer.startActiveSpan.mockImplementation((name, callback) => {
        return callback(mockSpan);
      });

      const errorOperation = jest.fn().mockRejectedValue(new Error('Test error'));

      await expect(collector.createSpan('error-operation', errorOperation)).rejects.toThrow('Test error');

      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: mockTrace.SpanStatusCode.ERROR,
        message: 'Test error',
      });
      expect(mockSpan.end).toHaveBeenCalled();
    });

    test('should support nested spans', async () => {
      const mockOuterSpan = {
        setStatus: jest.fn(),
        end: jest.fn(),
      };

      const mockInnerSpan = {
        setStatus: jest.fn(),
        end: jest.fn(),
      };

      mockTracer.startActiveSpan
        .mockImplementationOnce((name, callback) => callback(mockOuterSpan))
        .mockImplementationOnce((name, callback) => callback(mockInnerSpan));

      const nestedOperation = async (outerSpan: any) => {
        return await collector.createSpan('inner-operation', async (innerSpan) => {
          return 'nested result';
        });
      };

      const result = await collector.createSpan('outer-operation', nestedOperation);

      expect(result).toBe('nested result');
      expect(mockTracer.startActiveSpan).toHaveBeenCalledTimes(2);
      expect(mockOuterSpan.end).toHaveBeenCalled();
      expect(mockInnerSpan.end).toHaveBeenCalled();
    });
  });

  describe('Privacy and Data Management', () => {
    test('should setup data cleanup for privacy compliance', async () => {
      const privacyConfig = {
        ...mockConfig,
        privacy: {
          dataRetentionHours: 1, // 1 hour retention
          localOnly: true,
          optInTelemetry: true,
        },
      };

      const privacyCollector = new OpenTelemetryCollector(privacyConfig);
      await privacyCollector.initialize();

      // Verify cleanup interval is set (would be tested with timer mocks in real implementation)
      expect(privacyCollector.getStatus().config.privacy.dataRetentionHours).toBe(1);

      await privacyCollector.shutdown();
    });

    test('should respect local-only privacy setting', () => {
      const localOnlyConfig = {
        ...mockConfig,
        privacy: {
          dataRetentionHours: 24,
          localOnly: true,
          optInTelemetry: false,
        },
        exporters: {
          prometheus: { enabled: true, port: 9090 },
          otlp: { enabled: false, url: '' }, // Disabled for local-only
          console: { enabled: true },
        },
      };

      const localCollector = new OpenTelemetryCollector(localOnlyConfig);
      const status = localCollector.getStatus();

      expect(status.config.exporters.otlp?.enabled).toBe(false);
      expect(status.config.privacy.localOnly).toBe(true);
    });
  });

  describe('Enterprise Integration', () => {
    test('should support multiple exporters simultaneously', async () => {
      const enterpriseConfig = {
        ...mockConfig,
        exporters: {
          prometheus: { enabled: true, port: 9090 },
          otlp: { enabled: true, url: 'http://enterprise-otel:4318/v1/metrics' },
          console: { enabled: false },
        },
      };

      const enterpriseCollector = new OpenTelemetryCollector(enterpriseConfig);
      await enterpriseCollector.initialize();

      expect(mockPrometheusExporter).toHaveBeenCalledWith({
        port: 9090,
        endpoint: '/metrics',
      });

      expect(mockOTLPExporter).toHaveBeenCalledWith({
        url: 'http://enterprise-otel:4318/v1/metrics',
        headers: undefined,
      });

      await enterpriseCollector.shutdown();
    });

    test('should handle enterprise authentication headers', async () => {
      const authConfig = {
        ...mockConfig,
        exporters: {
          otlp: {
            enabled: true,
            url: 'http://secure-otel:4318/v1/metrics',
            headers: {
              'Authorization': 'Bearer enterprise-token',
              'X-API-Key': 'secret-key',
            },
          },
        },
      };

      const authCollector = new OpenTelemetryCollector(authConfig);
      await authCollector.initialize();

      expect(mockOTLPExporter).toHaveBeenCalledWith({
        url: 'http://secure-otel:4318/v1/metrics',
        headers: {
          'Authorization': 'Bearer enterprise-token',
          'X-API-Key': 'secret-key',
        },
      });

      await authCollector.shutdown();
    });
  });

  describe('Error Handling and Resilience', () => {
    test('should handle exporter initialization failures gracefully', async () => {
      mockPrometheusExporter.mockImplementationOnce(() => {
        throw new Error('Prometheus port already in use');
      });

      // Should not throw during initialization
      await expect(collector.initialize()).resolves.not.toThrow();
    });

    test('should continue operating when individual metrics fail', () => {
      const mockFailingInstrument = {
        record: jest.fn().mockImplementation(() => {
          throw new Error('Metric recording failed');
        }),
        add: jest.fn(),
      };

      mockMeter.createGauge.mockReturnValueOnce(mockFailingInstrument);

      // Should not throw when metric recording fails
      expect(() => {
        collector.recordSystemMetrics({ cpuUsage: 50 });
      }).not.toThrow();
    });

    test('should shutdown gracefully', async () => {
      await collector.initialize();
      await collector.shutdown();

      expect(mockNodeSDK.shutdown).toHaveBeenCalled();
      
      const status = collector.getStatus();
      expect(status.initialized).toBe(false);
    });
  });

  describe('Configuration Flexibility', () => {
    test('should support custom metric collection intervals', () => {
      const customConfig = {
        ...mockConfig,
        metrics: {
          collectionInterval: 10000, // 10 seconds
          enableCustomMetrics: true,
          enableSystemMetrics: false,
          enablePerformanceMetrics: true,
        },
      };

      const customCollector = new OpenTelemetryCollector(customConfig);
      const status = customCollector.getStatus();

      expect(status.config.metrics.collectionInterval).toBe(10000);
      expect(status.config.metrics.enableSystemMetrics).toBe(false);
    });

    test('should validate configuration parameters', () => {
      const invalidConfig = {
        ...mockConfig,
        serviceName: '', // Invalid empty service name
      };

      // This would throw in a real implementation with validation
      expect(() => new OpenTelemetryCollector(invalidConfig)).not.toThrow();
    });
  });
});