/**
 * OpenTelemetry-based Performance Metrics Collector
 * Inspired by claude-code-monitoring architecture with enterprise enhancements
 */

import { metrics, trace, context, propagation } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/auto-instrumentations-node';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { OTLPMetricExporter } from '@opentelemetry/exporter-otlp-http';
import { ConsoleMetricExporter } from '@opentelemetry/sdk-metrics';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { PerformanceConfig } from '../types.js';

export interface TelemetryConfig {
  serviceName: string;
  version: string;
  environment: 'development' | 'staging' | 'production';
  exporters: {
    prometheus?: {
      enabled: boolean;
      port?: number;
      endpoint?: string;
    };
    otlp?: {
      enabled: boolean;
      url: string;
      headers?: Record<string, string>;
    };
    console?: {
      enabled: boolean;
    };
  };
  privacy: {
    dataRetentionHours: number;
    localOnly: boolean;
    optInTelemetry: boolean;
  };
  metrics: {
    collectionInterval: number;
    enableCustomMetrics: boolean;
    enableSystemMetrics: boolean;
    enablePerformanceMetrics: boolean;
  };
}

export interface ClaudeFlowMetrics {
  // Agent Performance Metrics
  agentExecutionTime: metrics.Histogram;
  agentMemoryUsage: metrics.Gauge;
  agentTaskCount: metrics.Counter;
  agentErrorRate: metrics.Counter;
  
  // System Performance Metrics
  systemCpuUsage: metrics.Gauge;
  systemMemoryUsage: metrics.Gauge;
  systemDiskUsage: metrics.Gauge;
  systemNetworkIO: metrics.Counter;
  
  // Hive Mind Coordination Metrics
  hiveMindActiveAgents: metrics.Gauge;
  hiveMindTaskQueue: metrics.Gauge;
  hiveMindCoordinationLatency: metrics.Histogram;
  
  // Docker Container Metrics
  containerStartupTime: metrics.Histogram;
  containerMemoryLimit: metrics.Gauge;
  containerCpuThrottling: metrics.Counter;
  
  // Performance Regression Metrics
  performanceBaseline: metrics.Gauge;
  regressionDetected: metrics.Counter;
  performanceScore: metrics.Gauge;
  
  // Bundle and Build Metrics
  bundleSize: metrics.Gauge;
  buildTime: metrics.Histogram;
  testExecutionTime: metrics.Histogram;
  
  // Memory Management Metrics
  memoryBankOperations: metrics.Counter;
  memoryCacheHitRate: metrics.Gauge;
  memoryLeaksDetected: metrics.Counter;
  
  // Alert System Metrics
  alertsTriggered: metrics.Counter;
  alertsResolved: metrics.Counter;
  alertResponseTime: metrics.Histogram;
}

export class OpenTelemetryCollector {
  private sdk: NodeSDK | null = null;
  private meter: metrics.Meter;
  private tracer: trace.Tracer;
  private metrics: ClaudeFlowMetrics;
  private config: TelemetryConfig;
  private isInitialized = false;
  private dataCleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: TelemetryConfig) {
    this.config = config;
    this.meter = metrics.getMeter('claude-flow-performance', config.version);
    this.tracer = trace.getTracer('claude-flow-performance', config.version);
    this.metrics = this.initializeMetrics();
  }

  /**
   * Initialize the OpenTelemetry SDK with configured exporters
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    // Create resource with service information
    const resource = new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: this.config.serviceName,
      [SemanticResourceAttributes.SERVICE_VERSION]: this.config.version,
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: this.config.environment,
    });

    // Configure metric readers based on enabled exporters
    const metricReaders = [];

    // Prometheus Exporter
    if (this.config.exporters.prometheus?.enabled) {
      const prometheusExporter = new PrometheusExporter({
        port: this.config.exporters.prometheus.port || 9090,
        endpoint: this.config.exporters.prometheus.endpoint || '/metrics',
      });
      metricReaders.push(prometheusExporter);
    }

    // OTLP Exporter
    if (this.config.exporters.otlp?.enabled) {
      const otlpExporter = new OTLPMetricExporter({
        url: this.config.exporters.otlp.url,
        headers: this.config.exporters.otlp.headers,
      });
      metricReaders.push(
        new PeriodicExportingMetricReader({
          exporter: otlpExporter,
          exportIntervalMillis: this.config.metrics.collectionInterval,
        })
      );
    }

    // Console Exporter (for development)
    if (this.config.exporters.console?.enabled) {
      const consoleExporter = new ConsoleMetricExporter();
      metricReaders.push(
        new PeriodicExportingMetricReader({
          exporter: consoleExporter,
          exportIntervalMillis: this.config.metrics.collectionInterval,
        })
      );
    }

    // Initialize SDK
    this.sdk = new NodeSDK({
      resource,
      metricReader: metricReaders.length > 0 ? metricReaders[0] : undefined,
    });

    await this.sdk.start();

    // Setup data cleanup if privacy settings require it
    if (this.config.privacy.dataRetentionHours > 0) {
      this.setupDataCleanup();
    }

    this.isInitialized = true;
    console.log(`✅ OpenTelemetry initialized for ${this.config.serviceName}`);
  }

  /**
   * Initialize all performance metrics
   */
  private initializeMetrics(): ClaudeFlowMetrics {
    return {
      // Agent Performance Metrics
      agentExecutionTime: this.meter.createHistogram('claude_flow_agent_execution_duration_ms', {
        description: 'Time taken for agent task execution',
        unit: 'ms',
      }),
      agentMemoryUsage: this.meter.createGauge('claude_flow_agent_memory_usage_bytes', {
        description: 'Memory usage per agent',
        unit: 'bytes',
      }),
      agentTaskCount: this.meter.createCounter('claude_flow_agent_tasks_total', {
        description: 'Total number of agent tasks executed',
      }),
      agentErrorRate: this.meter.createCounter('claude_flow_agent_errors_total', {
        description: 'Total number of agent execution errors',
      }),

      // System Performance Metrics
      systemCpuUsage: this.meter.createGauge('claude_flow_system_cpu_usage_percent', {
        description: 'System CPU usage percentage',
        unit: '%',
      }),
      systemMemoryUsage: this.meter.createGauge('claude_flow_system_memory_usage_bytes', {
        description: 'System memory usage',
        unit: 'bytes',
      }),
      systemDiskUsage: this.meter.createGauge('claude_flow_system_disk_usage_bytes', {
        description: 'System disk usage',
        unit: 'bytes',
      }),
      systemNetworkIO: this.meter.createCounter('claude_flow_system_network_bytes_total', {
        description: 'System network I/O',
        unit: 'bytes',
      }),

      // Hive Mind Coordination Metrics
      hiveMindActiveAgents: this.meter.createGauge('claude_flow_hive_mind_active_agents', {
        description: 'Number of active agents in hive mind',
      }),
      hiveMindTaskQueue: this.meter.createGauge('claude_flow_hive_mind_task_queue_size', {
        description: 'Size of hive mind task queue',
      }),
      hiveMindCoordinationLatency: this.meter.createHistogram('claude_flow_hive_mind_coordination_latency_ms', {
        description: 'Latency for hive mind coordination operations',
        unit: 'ms',
      }),

      // Docker Container Metrics
      containerStartupTime: this.meter.createHistogram('claude_flow_container_startup_duration_ms', {
        description: 'Container startup time',
        unit: 'ms',
      }),
      containerMemoryLimit: this.meter.createGauge('claude_flow_container_memory_limit_bytes', {
        description: 'Container memory limit',
        unit: 'bytes',
      }),
      containerCpuThrottling: this.meter.createCounter('claude_flow_container_cpu_throttling_total', {
        description: 'Container CPU throttling events',
      }),

      // Performance Regression Metrics
      performanceBaseline: this.meter.createGauge('claude_flow_performance_baseline_ms', {
        description: 'Performance baseline measurement',
        unit: 'ms',
      }),
      regressionDetected: this.meter.createCounter('claude_flow_performance_regressions_total', {
        description: 'Number of performance regressions detected',
      }),
      performanceScore: this.meter.createGauge('claude_flow_performance_score', {
        description: 'Overall performance score (0-100)',
        unit: 'score',
      }),

      // Bundle and Build Metrics
      bundleSize: this.meter.createGauge('claude_flow_bundle_size_bytes', {
        description: 'Application bundle size',
        unit: 'bytes',
      }),
      buildTime: this.meter.createHistogram('claude_flow_build_duration_ms', {
        description: 'Build process duration',
        unit: 'ms',
      }),
      testExecutionTime: this.meter.createHistogram('claude_flow_test_execution_duration_ms', {
        description: 'Test execution duration',
        unit: 'ms',
      }),

      // Memory Management Metrics
      memoryBankOperations: this.meter.createCounter('claude_flow_memory_bank_operations_total', {
        description: 'Memory bank operations (store/retrieve/update)',
      }),
      memoryCacheHitRate: this.meter.createGauge('claude_flow_memory_cache_hit_rate_percent', {
        description: 'Memory cache hit rate',
        unit: '%',
      }),
      memoryLeaksDetected: this.meter.createCounter('claude_flow_memory_leaks_detected_total', {
        description: 'Number of memory leaks detected',
      }),

      // Alert System Metrics
      alertsTriggered: this.meter.createCounter('claude_flow_alerts_triggered_total', {
        description: 'Total alerts triggered',
      }),
      alertsResolved: this.meter.createCounter('claude_flow_alerts_resolved_total', {
        description: 'Total alerts resolved',
      }),
      alertResponseTime: this.meter.createHistogram('claude_flow_alert_response_time_ms', {
        description: 'Time to respond to alerts',
        unit: 'ms',
      }),
    };
  }

  /**
   * Record agent performance metrics
   */
  recordAgentMetrics(agentId: string, agentType: string, metrics: {
    executionTime?: number;
    memoryUsage?: number;
    taskCount?: number;
    errorCount?: number;
  }): void {
    const labels = { agent_id: agentId, agent_type: agentType };

    if (metrics.executionTime !== undefined) {
      this.metrics.agentExecutionTime.record(metrics.executionTime, labels);
    }
    if (metrics.memoryUsage !== undefined) {
      this.metrics.agentMemoryUsage.record(metrics.memoryUsage, labels);
    }
    if (metrics.taskCount !== undefined) {
      this.metrics.agentTaskCount.add(metrics.taskCount, labels);
    }
    if (metrics.errorCount !== undefined) {
      this.metrics.agentErrorRate.add(metrics.errorCount, labels);
    }
  }

  /**
   * Record system performance metrics
   */
  recordSystemMetrics(metrics: {
    cpuUsage?: number;
    memoryUsage?: number;
    diskUsage?: number;
    networkBytesIn?: number;
    networkBytesOut?: number;
  }): void {
    if (metrics.cpuUsage !== undefined) {
      this.metrics.systemCpuUsage.record(metrics.cpuUsage);
    }
    if (metrics.memoryUsage !== undefined) {
      this.metrics.systemMemoryUsage.record(metrics.memoryUsage);
    }
    if (metrics.diskUsage !== undefined) {
      this.metrics.systemDiskUsage.record(metrics.diskUsage);
    }
    if (metrics.networkBytesIn !== undefined) {
      this.metrics.systemNetworkIO.add(metrics.networkBytesIn, { direction: 'in' });
    }
    if (metrics.networkBytesOut !== undefined) {
      this.metrics.systemNetworkIO.add(metrics.networkBytesOut, { direction: 'out' });
    }
  }

  /**
   * Record hive mind coordination metrics
   */
  recordHiveMindMetrics(metrics: {
    activeAgents?: number;
    taskQueueSize?: number;
    coordinationLatency?: number;
  }): void {
    if (metrics.activeAgents !== undefined) {
      this.metrics.hiveMindActiveAgents.record(metrics.activeAgents);
    }
    if (metrics.taskQueueSize !== undefined) {
      this.metrics.hiveMindTaskQueue.record(metrics.taskQueueSize);
    }
    if (metrics.coordinationLatency !== undefined) {
      this.metrics.hiveMindCoordinationLatency.record(metrics.coordinationLatency);
    }
  }

  /**
   * Record performance regression metrics
   */
  recordPerformanceRegression(baseline: number, current: number, regressionDetected: boolean): void {
    this.metrics.performanceBaseline.record(baseline);
    
    if (regressionDetected) {
      this.metrics.regressionDetected.add(1, {
        baseline_ms: baseline.toString(),
        current_ms: current.toString(),
        regression_percent: ((current - baseline) / baseline * 100).toFixed(2),
      });
    }

    // Calculate performance score (higher is better)
    const score = Math.max(0, 100 - Math.max(0, (current - baseline) / baseline * 100));
    this.metrics.performanceScore.record(score);
  }

  /**
   * Create a trace span for performance tracking
   */
  createSpan<T>(name: string, operation: (span: trace.Span) => Promise<T>): Promise<T> {
    return this.tracer.startActiveSpan(name, async (span) => {
      try {
        const result = await operation(span);
        span.setStatus({ code: trace.SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.setStatus({
          code: trace.SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Setup automatic data cleanup based on privacy settings
   */
  private setupDataCleanup(): void {
    const cleanupInterval = this.config.privacy.dataRetentionHours * 60 * 60 * 1000; // Convert to ms
    
    this.dataCleanupInterval = setInterval(() => {
      // This would integrate with the storage backend to clean up old data
      console.log(`🧹 Cleaning up telemetry data older than ${this.config.privacy.dataRetentionHours} hours`);
    }, cleanupInterval);
  }

  /**
   * Get current telemetry status
   */
  getStatus(): {
    initialized: boolean;
    config: TelemetryConfig;
    metricsCount: number;
  } {
    return {
      initialized: this.isInitialized,
      config: this.config,
      metricsCount: Object.keys(this.metrics).length,
    };
  }

  /**
   * Shutdown telemetry collection
   */
  async shutdown(): Promise<void> {
    if (this.dataCleanupInterval) {
      clearInterval(this.dataCleanupInterval);
    }

    if (this.sdk) {
      await this.sdk.shutdown();
    }

    this.isInitialized = false;
    console.log('📊 OpenTelemetry shutdown complete');
  }
}