/**
 * Comprehensive tests for Multi-Environment Monitor
 * Tests enterprise multi-environment monitoring functionality
 */

import { jest } from '@jest/globals';
import { MultiEnvironmentMonitor } from '../enterprise/MultiEnvironmentMonitor.js';
import { 
  EnvironmentConfig, 
  EnvironmentStatus,
  SLADefinition,
  SLAComplianceReport,
  EnvironmentComparison,
  MonitoringMetrics,
  EnvironmentHealth,
  DeploymentTracker,
  ResourceUsage
} from '../types.js';

// Mock external dependencies
jest.mock('../../monitoring/real-time-monitor.js');
jest.mock('axios');
jest.mock('ws');

// Mock axios for API calls
const mockAxios = {
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
  create: jest.fn(() => mockAxios)
};
jest.doMock('axios', () => mockAxios);

describe('MultiEnvironmentMonitor', () => {
  let monitor: MultiEnvironmentMonitor;
  let mockEnvironments: EnvironmentConfig[];

  beforeEach(() => {
    mockEnvironments = [
      {
        name: 'development',
        type: 'development',
        endpoint: 'https://dev.example.com',
        apiKey: 'dev-api-key',
        monitoring: {
          enabled: true,
          interval: 30000, // 30 seconds
          retentionDays: 7,
          metrics: ['responseTime', 'memoryUsage', 'cpuUsage', 'errorRate']
        },
        sla: {
          availability: { target: 95.0, measurement: 'uptime' },
          performance: {
            responseTime: { p50: 500, p95: 1000, p99: 2000 },
            throughput: { min: 50 },
            errorRate: { max: 5.0 }
          },
          resources: {
            memory: { max: 2 * 1024 * 1024 * 1024, sustained: 1.5 * 1024 * 1024 * 1024 },
            cpu: { max: 90, sustained: 70 }
          }
        },
        alerts: {
          enabled: true,
          channels: ['email', 'slack']
        }
      },
      {
        name: 'staging',
        type: 'staging',
        endpoint: 'https://staging.example.com',
        apiKey: 'staging-api-key',
        monitoring: {
          enabled: true,
          interval: 15000, // 15 seconds
          retentionDays: 14,
          metrics: ['responseTime', 'memoryUsage', 'cpuUsage', 'errorRate', 'diskUsage']
        },
        sla: {
          availability: { target: 98.5, measurement: 'uptime' },
          performance: {
            responseTime: { p50: 300, p95: 600, p99: 1200 },
            throughput: { min: 100 },
            errorRate: { max: 2.0 }
          },
          resources: {
            memory: { max: 4 * 1024 * 1024 * 1024, sustained: 3 * 1024 * 1024 * 1024 },
            cpu: { max: 85, sustained: 65 }
          }
        },
        alerts: {
          enabled: true,
          channels: ['email', 'slack', 'pagerduty']
        }
      },
      {
        name: 'production',
        type: 'production',
        endpoint: 'https://api.example.com',
        apiKey: 'prod-api-key',
        monitoring: {
          enabled: true,
          interval: 10000, // 10 seconds
          retentionDays: 30,
          metrics: ['responseTime', 'memoryUsage', 'cpuUsage', 'errorRate', 'diskUsage', 'networkIO']
        },
        sla: {
          availability: { target: 99.9, measurement: 'uptime' },
          performance: {
            responseTime: { p50: 200, p95: 500, p99: 1000 },
            throughput: { min: 200 },
            errorRate: { max: 0.1 }
          },
          resources: {
            memory: { max: 8 * 1024 * 1024 * 1024, sustained: 6 * 1024 * 1024 * 1024 },
            cpu: { max: 80, sustained: 60 }
          }
        },
        alerts: {
          enabled: true,
          channels: ['email', 'slack', 'pagerduty', 'webhook']
        },
        compliance: {
          enabled: true,
          standards: ['SOC2', 'GDPR', 'HIPAA'],
          auditInterval: 86400000 // 24 hours
        }
      }
    ];

    monitor = new MultiEnvironmentMonitor();
  });

  afterEach(() => {
    jest.clearAllMocks();
    monitor.stop();
  });

  describe('Environment Registration', () => {
    test('should register environments successfully', async () => {
      for (const env of mockEnvironments) {
        await monitor.registerEnvironment(env);
      }

      const environments = monitor.getEnvironments();
      expect(environments).toHaveLength(3);
      expect(environments.map(e => e.name)).toEqual(['development', 'staging', 'production']);
    });

    test('should validate environment configuration', async () => {
      const invalidEnv: EnvironmentConfig = {
        name: '',
        type: 'development',
        endpoint: 'invalid-url',
        monitoring: {
          enabled: true,
          interval: -1000, // Invalid negative interval
          retentionDays: 0,
          metrics: []
        }
      };

      await expect(monitor.registerEnvironment(invalidEnv)).rejects.toThrow();
    });

    test('should prevent duplicate environment names', async () => {
      await monitor.registerEnvironment(mockEnvironments[0]);
      
      const duplicate = { ...mockEnvironments[0] };
      await expect(monitor.registerEnvironment(duplicate)).rejects.toThrow('Environment already exists');
    });

    test('should unregister environments', async () => {
      await monitor.registerEnvironment(mockEnvironments[0]);
      
      const success = await monitor.unregisterEnvironment('development');
      expect(success).toBe(true);
      
      const environments = monitor.getEnvironments();
      expect(environments).toHaveLength(0);
    });
  });

  describe('Health Monitoring', () => {
    beforeEach(async () => {
      for (const env of mockEnvironments) {
        await monitor.registerEnvironment(env);
      }
    });

    test('should check environment health', async () => {
      mockAxios.get.mockResolvedValueOnce({
        status: 200,
        data: { status: 'healthy', version: '1.0.0' },
        headers: { 'x-response-time': '150' }
      });

      const health = await monitor.checkEnvironmentHealth('production');

      expect(health.status).toBe('healthy');
      expect(health.responseTime).toBeDefined();
      expect(health.lastCheck).toBeInstanceOf(Date);
      expect(mockAxios.get).toHaveBeenCalledWith('https://api.example.com/health', expect.any(Object));
    });

    test('should handle unhealthy environments', async () => {
      mockAxios.get.mockRejectedValueOnce(new Error('Connection refused'));

      const health = await monitor.checkEnvironmentHealth('development');

      expect(health.status).toBe('unhealthy');
      expect(health.error).toContain('Connection refused');
    });

    test('should collect comprehensive metrics', async () => {
      mockAxios.get.mockResolvedValueOnce({
        status: 200,
        data: {
          metrics: {
            responseTime: { p50: 180, p95: 450, p99: 800 },
            memoryUsage: {
              used: 3 * 1024 * 1024 * 1024,
              total: 8 * 1024 * 1024 * 1024,
              percentage: 37.5
            },
            cpuUsage: 45,
            errorRate: 0.05,
            diskUsage: {
              used: 50 * 1024 * 1024 * 1024,
              total: 100 * 1024 * 1024 * 1024,
              percentage: 50
            },
            networkIO: {
              bytesIn: 1024 * 1024 * 100,
              bytesOut: 1024 * 1024 * 200
            }
          }
        }
      });

      const metrics = await monitor.collectMetrics('production');

      expect(metrics.responseTime.p50).toBe(180);
      expect(metrics.memoryUsage.percentage).toBe(37.5);
      expect(metrics.cpuUsage).toBe(45);
      expect(metrics.errorRate).toBe(0.05);
    });

    test('should start monitoring all environments', async () => {
      const healthCheckSpy = jest.spyOn(monitor, 'checkEnvironmentHealth').mockResolvedValue({
        status: 'healthy',
        responseTime: 200,
        lastCheck: new Date(),
        version: '1.0.0'
      });

      await monitor.startMonitoring();

      // Wait for initial monitoring cycle
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(healthCheckSpy).toHaveBeenCalledTimes(3); // Once for each environment
      expect(monitor.isMonitoring()).toBe(true);
    });

    test('should stop monitoring gracefully', async () => {
      await monitor.startMonitoring();
      expect(monitor.isMonitoring()).toBe(true);

      await monitor.stopMonitoring();
      expect(monitor.isMonitoring()).toBe(false);
    });
  });

  describe('SLA Monitoring and Compliance', () => {
    beforeEach(async () => {
      for (const env of mockEnvironments) {
        await monitor.registerEnvironment(env);
      }
    });

    test('should calculate SLA compliance for availability', async () => {
      // Mock 24 hours of uptime data (95% uptime = 22.8 hours up, 1.2 hours down)
      const uptimeData = Array.from({ length: 24 }, (_, hour) => ({
        timestamp: new Date(Date.now() - (23 - hour) * 3600000),
        status: hour < 23 ? 'up' : 'down' // Last hour down
      }));

      jest.spyOn(monitor as any, 'getUptimeData').mockResolvedValue(uptimeData);

      const compliance = await monitor.getSLAComplianceReport('production');

      expect(compliance.availability.actual).toBeCloseTo(95.8, 1); // 23/24 hours
      expect(compliance.availability.target).toBe(99.9);
      expect(compliance.availability.compliant).toBe(false);
    });

    test('should calculate SLA compliance for performance', async () => {
      const performanceData = {
        responseTime: { p50: 180, p95: 450, p99: 900 },
        throughput: 250,
        errorRate: 0.05
      };

      jest.spyOn(monitor as any, 'getPerformanceData').mockResolvedValue(performanceData);

      const compliance = await monitor.getSLAComplianceReport('production');

      expect(compliance.performance.responseTime.p50.actual).toBe(180);
      expect(compliance.performance.responseTime.p50.target).toBe(200);
      expect(compliance.performance.responseTime.p50.compliant).toBe(true);

      expect(compliance.performance.throughput.actual).toBe(250);
      expect(compliance.performance.throughput.target).toBe(200);
      expect(compliance.performance.throughput.compliant).toBe(true);

      expect(compliance.performance.errorRate.actual).toBe(0.05);
      expect(compliance.performance.errorRate.target).toBe(0.1);
      expect(compliance.performance.errorRate.compliant).toBe(true);
    });

    test('should calculate SLA compliance for resources', async () => {
      const resourceData = {
        memory: {
          max: 7 * 1024 * 1024 * 1024, // 7GB (within limit)
          sustained: 5 * 1024 * 1024 * 1024 // 5GB (within sustained limit)
        },
        cpu: {
          max: 75, // Within limit
          sustained: 55 // Within sustained limit
        }
      };

      jest.spyOn(monitor as any, 'getResourceData').mockResolvedValue(resourceData);

      const compliance = await monitor.getSLAComplianceReport('production');

      expect(compliance.resources.memory.compliant).toBe(true);
      expect(compliance.resources.cpu.compliant).toBe(true);
    });

    test('should generate comprehensive SLA reports', async () => {
      jest.spyOn(monitor as any, 'getUptimeData').mockResolvedValue([]);
      jest.spyOn(monitor as any, 'getPerformanceData').mockResolvedValue({});
      jest.spyOn(monitor as any, 'getResourceData').mockResolvedValue({});

      const report = await monitor.getSLAComplianceReport('production');

      expect(report.environmentName).toBe('production');
      expect(report.reportPeriod).toBeDefined();
      expect(report.availability).toBeDefined();
      expect(report.performance).toBeDefined();
      expect(report.resources).toBeDefined();
      expect(report.overallCompliance).toBeDefined();
    });
  });

  describe('Environment Comparison', () => {
    beforeEach(async () => {
      for (const env of mockEnvironments) {
        await monitor.registerEnvironment(env);
      }
    });

    test('should compare environments', async () => {
      const stagingMetrics = {
        responseTime: { p50: 350, p95: 700, p99: 1400 },
        memoryUsage: { percentage: 60 },
        cpuUsage: 50,
        errorRate: 1.5
      };

      const productionMetrics = {
        responseTime: { p50: 180, p95: 450, p99: 900 },
        memoryUsage: { percentage: 37.5 },
        cpuUsage: 45,
        errorRate: 0.05
      };

      jest.spyOn(monitor, 'collectMetrics')
        .mockResolvedValueOnce(stagingMetrics)
        .mockResolvedValueOnce(productionMetrics);

      const comparison = await monitor.compareEnvironments(['staging', 'production']);

      expect(comparison.environments).toEqual(['staging', 'production']);
      expect(comparison.metrics).toBeDefined();
      expect(comparison.differences).toBeDefined();
      
      // Production should have better response times
      expect(comparison.differences.responseTime).toBeDefined();
    });

    test('should identify performance discrepancies', async () => {
      const devMetrics = {
        responseTime: { p50: 800, p95: 1500, p99: 3000 },
        memoryUsage: { percentage: 80 },
        cpuUsage: 85,
        errorRate: 8.0
      };

      const prodMetrics = {
        responseTime: { p50: 180, p95: 450, p99: 900 },
        memoryUsage: { percentage: 37.5 },
        cpuUsage: 45,
        errorRate: 0.05
      };

      jest.spyOn(monitor, 'collectMetrics')
        .mockResolvedValueOnce(devMetrics)
        .mockResolvedValueOnce(prodMetrics);

      const comparison = await monitor.compareEnvironments(['development', 'production']);

      expect(comparison.discrepancies).toBeDefined();
      expect(comparison.discrepancies.length).toBeGreaterThan(0);
      expect(comparison.discrepancies.some(d => d.metric === 'responseTime')).toBe(true);
      expect(comparison.discrepancies.some(d => d.metric === 'errorRate')).toBe(true);
    });

    test('should provide improvement recommendations', async () => {
      const comparison = await monitor.compareEnvironments(['development', 'production']);

      expect(comparison.recommendations).toBeDefined();
      expect(Array.isArray(comparison.recommendations)).toBe(true);
    });
  });

  describe('Deployment Tracking', () => {
    beforeEach(async () => {
      for (const env of mockEnvironments) {
        await monitor.registerEnvironment(env);
      }
    });

    test('should track deployments across environments', async () => {
      const deployment = {
        id: 'deploy-123',
        version: '2.1.0',
        commit: 'abc123def456',
        author: 'developer@company.com',
        timestamp: new Date(),
        environments: ['staging', 'production'],
        strategy: 'blue-green' as const,
        status: 'in-progress' as const
      };

      await monitor.trackDeployment(deployment);

      const trackedDeployments = monitor.getDeployments();
      expect(trackedDeployments).toHaveLength(1);
      expect(trackedDeployments[0].id).toBe('deploy-123');
    });

    test('should update deployment status', async () => {
      const deployment = {
        id: 'deploy-456',
        version: '2.2.0',
        commit: 'def456ghi789',
        author: 'developer@company.com',
        timestamp: new Date(),
        environments: ['production'],
        strategy: 'rolling' as const,
        status: 'in-progress' as const
      };

      await monitor.trackDeployment(deployment);
      await monitor.updateDeploymentStatus('deploy-456', 'completed');

      const updatedDeployment = monitor.getDeployment('deploy-456');
      expect(updatedDeployment?.status).toBe('completed');
    });

    test('should correlate deployments with performance changes', async () => {
      const deployment = {
        id: 'deploy-789',
        version: '2.3.0',
        commit: 'ghi789jkl012',
        author: 'developer@company.com',
        timestamp: new Date(Date.now() - 3600000), // 1 hour ago
        environments: ['production'],
        strategy: 'canary' as const,
        status: 'completed' as const
      };

      await monitor.trackDeployment(deployment);

      // Mock performance data showing degradation after deployment
      const preDeploymentMetrics = {
        responseTime: { p50: 180, p95: 450, p99: 900 }
      };

      const postDeploymentMetrics = {
        responseTime: { p50: 250, p95: 600, p99: 1200 }
      };

      jest.spyOn(monitor as any, 'getMetricsForTimeRange')
        .mockResolvedValueOnce(preDeploymentMetrics)
        .mockResolvedValueOnce(postDeploymentMetrics);

      const impact = await monitor.analyzeDeploymentImpact('deploy-789');

      expect(impact.hasPerformanceImpact).toBe(true);
      expect(impact.metrics.responseTime.change).toBeGreaterThan(0);
    });
  });

  describe('Resource Usage Monitoring', () => {
    beforeEach(async () => {
      for (const env of mockEnvironments) {
        await monitor.registerEnvironment(env);
      }
    });

    test('should track resource usage patterns', async () => {
      const resourceData = {
        timestamp: new Date(),
        memory: {
          used: 4 * 1024 * 1024 * 1024, // 4GB
          total: 8 * 1024 * 1024 * 1024, // 8GB
          percentage: 50
        },
        cpu: {
          usage: 60,
          cores: 4,
          loadAverage: [1.2, 1.5, 1.8]
        },
        disk: {
          used: 60 * 1024 * 1024 * 1024, // 60GB
          total: 100 * 1024 * 1024 * 1024, // 100GB
          percentage: 60
        },
        network: {
          bytesIn: 100 * 1024 * 1024,
          bytesOut: 200 * 1024 * 1024,
          packetsIn: 50000,
          packetsOut: 75000
        }
      };

      await monitor.recordResourceUsage('production', resourceData);

      const usage = await monitor.getResourceUsage('production', 3600000); // 1 hour
      expect(usage).toHaveLength(1);
      expect(usage[0].memory.percentage).toBe(50);
      expect(usage[0].cpu.usage).toBe(60);
    });

    test('should predict resource exhaustion', async () => {
      // Mock increasing resource usage over time
      const usageData = Array.from({ length: 24 }, (_, hour) => ({
        timestamp: new Date(Date.now() - (23 - hour) * 3600000),
        memory: {
          percentage: 50 + hour * 2 // Increasing by 2% per hour
        },
        cpu: {
          usage: 30 + hour * 1.5 // Increasing by 1.5% per hour
        }
      }));

      jest.spyOn(monitor as any, 'getResourceHistory').mockResolvedValue(usageData);

      const prediction = await monitor.predictResourceExhaustion('production');

      expect(prediction.memory.willExhaust).toBe(true);
      expect(prediction.memory.timeToExhaustion).toBeDefined();
      expect(prediction.cpu.willExhaust).toBe(true);
      expect(prediction.cpu.timeToExhaustion).toBeDefined();
    });

    test('should recommend scaling actions', async () => {
      const highUsageData = {
        memory: { percentage: 85 },
        cpu: { usage: 90 },
        disk: { percentage: 75 }
      };

      jest.spyOn(monitor as any, 'getCurrentResourceUsage').mockResolvedValue(highUsageData);

      const recommendations = await monitor.getScalingRecommendations('production');

      expect(recommendations).toBeDefined();
      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations.some(r => r.type === 'scale-up')).toBe(true);
    });
  });

  describe('Compliance and Auditing', () => {
    beforeEach(async () => {
      for (const env of mockEnvironments) {
        await monitor.registerEnvironment(env);
      }
    });

    test('should perform compliance audits', async () => {
      const auditResult = await monitor.performComplianceAudit('production');

      expect(auditResult.environmentName).toBe('production');
      expect(auditResult.standards).toEqual(['SOC2', 'GDPR', 'HIPAA']);
      expect(auditResult.timestamp).toBeInstanceOf(Date);
      expect(auditResult.findings).toBeDefined();
      expect(auditResult.overallScore).toBeDefined();
    });

    test('should generate compliance reports', async () => {
      const report = await monitor.generateComplianceReport('production', 'SOC2');

      expect(report.standard).toBe('SOC2');
      expect(report.environmentName).toBe('production');
      expect(report.controls).toBeDefined();
      expect(report.evidence).toBeDefined();
      expect(report.recommendations).toBeDefined();
    });

    test('should maintain audit trails', async () => {
      const auditEvent = {
        type: 'configuration-change',
        actor: 'admin@company.com',
        resource: 'environment-config',
        action: 'update-sla-thresholds',
        timestamp: new Date(),
        details: {
          environment: 'production',
          changes: {
            'sla.performance.responseTime.p99': { from: 1000, to: 800 }
          }
        }
      };

      await monitor.recordAuditEvent(auditEvent);

      const auditTrail = await monitor.getAuditTrail('production', 86400000); // 24 hours
      expect(auditTrail).toHaveLength(1);
      expect(auditTrail[0].type).toBe('configuration-change');
    });
  });

  describe('Alert Integration', () => {
    beforeEach(async () => {
      for (const env of mockEnvironments) {
        await monitor.registerEnvironment(env);
      }
    });

    test('should generate alerts for SLA violations', async () => {
      const slaViolation = {
        environmentName: 'production',
        metric: 'responseTime.p99',
        threshold: 1000,
        actual: 1500,
        severity: 'critical' as const,
        duration: 300000 // 5 minutes
      };

      const alert = await monitor.generateSLAAlert(slaViolation);

      expect(alert.type).toBe('sla-violation');
      expect(alert.severity).toBe('critical');
      expect(alert.environmentName).toBe('production');
      expect(alert.message).toContain('responseTime.p99');
    });

    test('should escalate persistent violations', async () => {
      const persistentViolation = {
        environmentName: 'production',
        metric: 'availability',
        threshold: 99.9,
        actual: 95.0,
        severity: 'critical' as const,
        duration: 1800000 // 30 minutes
      };

      const escalatedAlert = await monitor.escalateAlert(persistentViolation);

      expect(escalatedAlert.escalated).toBe(true);
      expect(escalatedAlert.escalationLevel).toBeGreaterThan(1);
    });

    test('should integrate with external alerting systems', async () => {
      mockAxios.post.mockResolvedValueOnce({ status: 200 });

      const alert = {
        id: 'alert-123',
        type: 'sla-violation',
        severity: 'critical' as const,
        environmentName: 'production',
        message: 'Response time SLA violation',
        timestamp: new Date()
      };

      await monitor.sendAlert(alert, 'production');

      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('webhook'),
        expect.objectContaining({
          alert: expect.objectContaining({
            severity: 'critical',
            environmentName: 'production'
          })
        })
      );
    });
  });

  describe('Performance and Scalability', () => {
    test('should handle monitoring of many environments efficiently', async () => {
      // Register many environments
      const manyEnvironments = Array.from({ length: 50 }, (_, i) => ({
        name: `env-${i}`,
        type: 'development' as const,
        endpoint: `https://env-${i}.example.com`,
        monitoring: {
          enabled: true,
          interval: 60000,
          retentionDays: 7,
          metrics: ['responseTime', 'memoryUsage', 'cpuUsage']
        }
      }));

      const startTime = Date.now();
      
      for (const env of manyEnvironments) {
        await monitor.registerEnvironment(env);
      }

      const endTime = Date.now();
      const registrationTime = endTime - startTime;

      expect(registrationTime).toBeLessThan(5000); // Should complete within 5 seconds
      expect(monitor.getEnvironments()).toHaveLength(50);
    });

    test('should efficiently store and retrieve historical data', async () => {
      await monitor.registerEnvironment(mockEnvironments[0]);

      // Generate large amount of historical data
      const historicalData = Array.from({ length: 1000 }, (_, i) => ({
        timestamp: new Date(Date.now() - i * 60000), // 1 minute intervals
        responseTime: { p50: 100 + Math.random() * 100 },
        memoryUsage: { percentage: 30 + Math.random() * 40 },
        cpuUsage: 20 + Math.random() * 60
      }));

      const startTime = Date.now();
      
      for (const data of historicalData) {
        await monitor.recordMetrics('development', data);
      }

      const queryStart = Date.now();
      const retrieved = await monitor.getMetricsHistory('development', 3600000); // 1 hour
      const queryTime = Date.now() - queryStart;

      expect(queryTime).toBeLessThan(1000); // Should query within 1 second
      expect(retrieved.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling and Resilience', () => {
    beforeEach(async () => {
      await monitor.registerEnvironment(mockEnvironments[0]);
    });

    test('should handle API failures gracefully', async () => {
      mockAxios.get.mockRejectedValue(new Error('Network timeout'));

      const health = await monitor.checkEnvironmentHealth('development');

      expect(health.status).toBe('unhealthy');
      expect(health.error).toContain('Network timeout');
    });

    test('should continue monitoring other environments when one fails', async () => {
      await monitor.registerEnvironment(mockEnvironments[1]);
      await monitor.registerEnvironment(mockEnvironments[2]);

      mockAxios.get
        .mockRejectedValueOnce(new Error('Dev environment down'))
        .mockResolvedValueOnce({ status: 200, data: { status: 'healthy' } })
        .mkResolvedValueOnce({ status: 200, data: { status: 'healthy' } });

      await monitor.startMonitoring();

      // Wait for monitoring cycle
      await new Promise(resolve => setTimeout(resolve, 200));

      const environments = monitor.getEnvironmentStatuses();
      expect(environments.find(e => e.name === 'development')?.status).toBe('unhealthy');
      expect(environments.find(e => e.name === 'staging')?.status).toBe('healthy');
      expect(environments.find(e => e.name === 'production')?.status).toBe('healthy');
    });

    test('should recover from temporary failures', async () => {
      let callCount = 0;
      mockAxios.get.mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          return Promise.reject(new Error('Temporary failure'));
        }
        return Promise.resolve({ status: 200, data: { status: 'healthy' } });
      });

      await monitor.startMonitoring();

      // Wait for multiple monitoring cycles
      await new Promise(resolve => setTimeout(resolve, 500));

      const health = await monitor.checkEnvironmentHealth('development');
      expect(health.status).toBe('healthy'); // Should recover after failures
    });

    test('should handle invalid response data', async () => {
      mockAxios.get.mockResolvedValue({
        status: 200,
        data: 'invalid json response'
      });

      const metrics = await monitor.collectMetrics('development');

      expect(metrics).toBeDefined();
      // Should have default/fallback values when response is invalid
    });
  });
});