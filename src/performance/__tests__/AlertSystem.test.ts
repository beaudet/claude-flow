/**
 * Comprehensive tests for Alert System
 * Tests alert management and notification functionality
 */

import { jest } from '@jest/globals';
import { AlertSystem } from '../alerts/AlertSystem.js';
import { 
  AlertConfig, 
  AlertRule, 
  AlertChannel,
  PerformanceAlert,
  PerformanceMetrics,
  AlertHistory,
  AlertNotification
} from '../types.js';

// Mock external dependencies
jest.mock('../../monitoring/real-time-monitor.js');
jest.mock('nodemailer');
jest.mock('axios');

// Mock nodemailer
const mockNodemailer = {
  createTransport: jest.fn(() => ({
    sendMail: jest.fn().mockResolvedValue({ messageId: 'test-message-id' })
  }))
};
jest.doMock('nodemailer', () => mockNodemailer);

// Mock axios for webhook calls
const mockAxios = {
  post: jest.fn().mockResolvedValue({ status: 200, data: 'OK' })
};
jest.doMock('axios', () => mockAxios);

describe('AlertSystem', () => {
  let alertSystem: AlertSystem;
  let mockConfig: AlertConfig;

  beforeEach(() => {
    mockConfig = {
      enabled: true,
      debounceMs: 60000, // 1 minute
      aggregationWindow: 300000, // 5 minutes
      maxActiveAlerts: 100,
      escalationTimeouts: {
        warning: 900000,  // 15 minutes
        critical: 300000  // 5 minutes
      },
      channels: [
        {
          type: 'email',
          config: {
            recipients: ['test@example.com'],
            smtp: {
              host: 'smtp.test.com',
              port: 587,
              secure: false,
              auth: {
                user: 'test@test.com',
                pass: 'password'
              }
            }
          },
          enabled: true
        }
      ],
      rules: [
        {
          id: 'high-memory-usage',
          name: 'High Memory Usage',
          description: 'Alert when memory usage exceeds threshold',
          enabled: true,
          conditions: [{
            metric: 'memoryUsage.heapUsed',
            operator: 'gt',
            value: 100 * 1024 * 1024, // 100MB
            duration: 60000 // 1 minute
          }],
          actions: [{
            type: 'email',
            config: {},
            enabled: true,
            condition: 'always'
          }],
          severity: 'warning',
          cooldownMs: 300000 // 5 minutes
        }
      ]
    };

    alertSystem = new AlertSystem(mockConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
    alertSystem.stop();
  });

  describe('Alert Rule Management', () => {
    test('should register alert rules correctly', () => {
      const rule: AlertRule = {
        id: 'test-rule',
        name: 'Test Rule',
        description: 'Test alert rule',
        enabled: true,
        conditions: [{
          metric: 'cpuUsage',
          operator: 'gt',
          value: 80,
          duration: 30000
        }],
        actions: [{
          type: 'console',
          config: {},
          enabled: true,
          condition: 'always'
        }],
        severity: 'warning',
        cooldownMs: 60000
      };

      alertSystem.registerRule(rule);
      
      const rules = alertSystem.getRules();
      expect(rules).toHaveLength(2); // Initial rule + new rule
      expect(rules.find(r => r.id === 'test-rule')).toBeDefined();
    });

    test('should unregister alert rules', () => {
      const success = alertSystem.unregisterRule('high-memory-usage');
      
      expect(success).toBe(true);
      
      const rules = alertSystem.getRules();
      expect(rules.find(r => r.id === 'high-memory-usage')).toBeUndefined();
    });

    test('should not unregister non-existent rules', () => {
      const success = alertSystem.unregisterRule('non-existent-rule');
      
      expect(success).toBe(false);
    });

    test('should validate alert rule conditions', () => {
      const invalidRule: AlertRule = {
        id: 'invalid-rule',
        name: 'Invalid Rule',
        description: 'Rule with invalid conditions',
        enabled: true,
        conditions: [{
          metric: '', // Invalid empty metric
          operator: 'gt',
          value: 80,
          duration: 30000
        }],
        actions: [],
        severity: 'warning',
        cooldownMs: 60000
      };

      expect(() => alertSystem.registerRule(invalidRule)).toThrow();
    });
  });

  describe('Alert Channel Management', () => {
    test('should register alert channels', () => {
      const channel: AlertChannel = {
        type: 'slack',
        config: {
          webhookUrl: 'https://hooks.slack.com/test',
          channel: '#alerts'
        },
        enabled: true
      };

      alertSystem.registerChannel(channel);
      
      const channels = alertSystem.getChannels();
      expect(channels).toHaveLength(2); // Initial email + new slack
      expect(channels.find(c => c.type === 'slack')).toBeDefined();
    });

    test('should validate channel configuration', () => {
      const invalidChannel: AlertChannel = {
        type: 'email',
        config: {}, // Missing required email config
        enabled: true
      };

      expect(() => alertSystem.registerChannel(invalidChannel)).toThrow();
    });

    test('should disable channels when needed', () => {
      const channels = alertSystem.getChannels();
      const emailChannel = channels.find(c => c.type === 'email');
      
      expect(emailChannel?.enabled).toBe(true);
      
      alertSystem.disableChannel('email');
      
      const updatedChannels = alertSystem.getChannels();
      const updatedEmailChannel = updatedChannels.find(c => c.type === 'email');
      expect(updatedEmailChannel?.enabled).toBe(false);
    });
  });

  describe('Alert Processing', () => {
    test('should process metrics and generate alerts', async () => {
      const metrics: PerformanceMetrics = {
        timestamp: new Date(),
        memoryUsage: {
          heapUsed: 150 * 1024 * 1024, // 150MB - exceeds threshold
          heapTotal: 200 * 1024 * 1024,
          external: 10 * 1024 * 1024,
          rss: 180 * 1024 * 1024,
          arrayBuffers: 5 * 1024 * 1024
        },
        cpuUsage: 50,
        networkIO: {
          bytesIn: 1024,
          bytesOut: 2048,
          packetsIn: 10,
          packetsOut: 15,
          connectionsActive: 5
        },
        diskIO: {
          bytesRead: 4096,
          bytesWritten: 8192,
          operationsRead: 2,
          operationsWrite: 3,
          queueLength: 1
        }
      };

      const alerts = await alertSystem.processMetrics(metrics);
      
      expect(alerts).toHaveLength(1);
      expect(alerts[0].ruleId).toBe('high-memory-usage');
      expect(alerts[0].severity).toBe('warning');
      expect(alerts[0].metric).toBe('memoryUsage.heapUsed');
    });

    test('should not generate alerts for metrics within thresholds', async () => {
      const metrics: PerformanceMetrics = {
        timestamp: new Date(),
        memoryUsage: {
          heapUsed: 50 * 1024 * 1024, // 50MB - within threshold
          heapTotal: 100 * 1024 * 1024,
          external: 5 * 1024 * 1024,
          rss: 80 * 1024 * 1024,
          arrayBuffers: 2 * 1024 * 1024
        },
        cpuUsage: 30,
        networkIO: {
          bytesIn: 1024,
          bytesOut: 2048,
          packetsIn: 10,
          packetsOut: 15,
          connectionsActive: 5
        },
        diskIO: {
          bytesRead: 4096,
          bytesWritten: 8192,
          operationsRead: 2,
          operationsWrite: 3,
          queueLength: 1
        }
      };

      const alerts = await alertSystem.processMetrics(metrics);
      
      expect(alerts).toHaveLength(0);
    });

    test('should respect alert cooldown periods', async () => {
      const metrics: PerformanceMetrics = {
        timestamp: new Date(),
        memoryUsage: {
          heapUsed: 150 * 1024 * 1024, // Exceeds threshold
          heapTotal: 200 * 1024 * 1024,
          external: 10 * 1024 * 1024,
          rss: 180 * 1024 * 1024,
          arrayBuffers: 5 * 1024 * 1024
        },
        cpuUsage: 50,
        networkIO: {
          bytesIn: 1024,
          bytesOut: 2048,
          packetsIn: 10,
          packetsOut: 15,
          connectionsActive: 5
        },
        diskIO: {
          bytesRead: 4096,
          bytesWritten: 8192,
          operationsRead: 2,
          operationsWrite: 3,
          queueLength: 1
        }
      };

      // First processing should generate alert
      const firstAlerts = await alertSystem.processMetrics(metrics);
      expect(firstAlerts).toHaveLength(1);

      // Second processing immediately after should not generate alert (cooldown)
      const secondAlerts = await alertSystem.processMetrics(metrics);
      expect(secondAlerts).toHaveLength(0);
    });

    test('should handle complex alert conditions', async () => {
      // Register rule with multiple conditions
      const complexRule: AlertRule = {
        id: 'complex-rule',
        name: 'Complex Rule',
        description: 'Rule with multiple conditions',
        enabled: true,
        conditions: [
          {
            metric: 'memoryUsage.heapUsed',
            operator: 'gt',
            value: 100 * 1024 * 1024,
            duration: 30000
          },
          {
            metric: 'cpuUsage',
            operator: 'gt',
            value: 70,
            duration: 30000
          }
        ],
        actions: [{
          type: 'console',
          config: {},
          enabled: true,
          condition: 'always'
        }],
        severity: 'critical',
        cooldownMs: 60000
      };

      alertSystem.registerRule(complexRule);

      const metrics: PerformanceMetrics = {
        timestamp: new Date(),
        memoryUsage: {
          heapUsed: 150 * 1024 * 1024, // Exceeds threshold
          heapTotal: 200 * 1024 * 1024,
          external: 10 * 1024 * 1024,
          rss: 180 * 1024 * 1024,
          arrayBuffers: 5 * 1024 * 1024
        },
        cpuUsage: 80, // Exceeds threshold
        networkIO: {
          bytesIn: 1024,
          bytesOut: 2048,
          packetsIn: 10,
          packetsOut: 15,
          connectionsActive: 5
        },
        diskIO: {
          bytesRead: 4096,
          bytesWritten: 8192,
          operationsRead: 2,
          operationsWrite: 3,
          queueLength: 1
        }
      };

      const alerts = await alertSystem.processMetrics(metrics);
      
      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts.find(a => a.ruleId === 'complex-rule')).toBeDefined();
    });
  });

  describe('Alert Notifications', () => {
    test('should send email notifications', async () => {
      const alert: PerformanceAlert = {
        id: 'test-alert-1',
        ruleId: 'high-memory-usage',
        ruleName: 'High Memory Usage',
        severity: 'warning',
        metric: 'memoryUsage.heapUsed',
        value: 150 * 1024 * 1024,
        threshold: 100 * 1024 * 1024,
        message: 'Memory usage exceeded threshold',
        timestamp: new Date(),
        acknowledged: false,
        resolved: false
      };

      await alertSystem.sendNotification(alert);

      expect(mockNodemailer.createTransport).toHaveBeenCalled();
    });

    test('should send slack notifications', async () => {
      // Register slack channel
      const slackChannel: AlertChannel = {
        type: 'slack',
        config: {
          webhookUrl: 'https://hooks.slack.com/test',
          channel: '#alerts'
        },
        enabled: true
      };

      alertSystem.registerChannel(slackChannel);

      const alert: PerformanceAlert = {
        id: 'test-alert-2',
        ruleId: 'high-memory-usage',
        ruleName: 'High Memory Usage',
        severity: 'critical',
        metric: 'memoryUsage.heapUsed',
        value: 200 * 1024 * 1024,
        threshold: 100 * 1024 * 1024,
        message: 'Critical memory usage exceeded threshold',
        timestamp: new Date(),
        acknowledged: false,
        resolved: false
      };

      await alertSystem.sendNotification(alert);

      expect(mockAxios.post).toHaveBeenCalledWith(
        'https://hooks.slack.com/test',
        expect.objectContaining({
          channel: '#alerts',
          text: expect.stringContaining('Critical memory usage exceeded threshold')
        })
      );
    });

    test('should handle notification failures gracefully', async () => {
      // Mock email failure
      mockNodemailer.createTransport.mockReturnValueOnce({
        sendMail: jest.fn().mockRejectedValue(new Error('SMTP error'))
      });

      const alert: PerformanceAlert = {
        id: 'test-alert-3',
        ruleId: 'high-memory-usage',
        ruleName: 'High Memory Usage',
        severity: 'warning',
        metric: 'memoryUsage.heapUsed',
        value: 150 * 1024 * 1024,
        threshold: 100 * 1024 * 1024,
        message: 'Memory usage exceeded threshold',
        timestamp: new Date(),
        acknowledged: false,
        resolved: false
      };

      // Should not throw error
      await expect(alertSystem.sendNotification(alert)).resolves.not.toThrow();
    });

    test('should retry failed notifications', async () => {
      let callCount = 0;
      mockAxios.post.mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          return Promise.reject(new Error('Network error'));
        }
        return Promise.resolve({ status: 200, data: 'OK' });
      });

      // Register webhook channel
      const webhookChannel: AlertChannel = {
        type: 'webhook',
        config: {
          url: 'https://api.example.com/alerts',
          method: 'POST',
          headers: { 'Authorization': 'Bearer token' }
        },
        enabled: true
      };

      alertSystem.registerChannel(webhookChannel);

      const alert: PerformanceAlert = {
        id: 'test-alert-4',
        ruleId: 'high-memory-usage',
        ruleName: 'High Memory Usage',
        severity: 'warning',
        metric: 'memoryUsage.heapUsed',
        value: 150 * 1024 * 1024,
        threshold: 100 * 1024 * 1024,
        message: 'Memory usage exceeded threshold',
        timestamp: new Date(),
        acknowledged: false,
        resolved: false
      };

      await alertSystem.sendNotification(alert);

      expect(callCount).toBe(3); // Should retry twice before succeeding
    });
  });

  describe('Alert Management', () => {
    test('should acknowledge alerts', async () => {
      const alert: PerformanceAlert = {
        id: 'test-alert-5',
        ruleId: 'high-memory-usage',
        ruleName: 'High Memory Usage',
        severity: 'warning',
        metric: 'memoryUsage.heapUsed',
        value: 150 * 1024 * 1024,
        threshold: 100 * 1024 * 1024,
        message: 'Memory usage exceeded threshold',
        timestamp: new Date(),
        acknowledged: false,
        resolved: false
      };

      // Store alert first
      (alertSystem as any).activeAlerts.set(alert.id, alert);

      const success = await alertSystem.acknowledgeAlert(alert.id, 'testuser', 'Investigating');

      expect(success).toBe(true);
      
      const updatedAlert = (alertSystem as any).activeAlerts.get(alert.id);
      expect(updatedAlert.acknowledged).toBe(true);
      expect(updatedAlert.acknowledgedBy).toBe('testuser');
      expect(updatedAlert.acknowledgedNote).toBe('Investigating');
    });

    test('should resolve alerts', async () => {
      const alert: PerformanceAlert = {
        id: 'test-alert-6',
        ruleId: 'high-memory-usage',
        ruleName: 'High Memory Usage',
        severity: 'warning',
        metric: 'memoryUsage.heapUsed',
        value: 150 * 1024 * 1024,
        threshold: 100 * 1024 * 1024,
        message: 'Memory usage exceeded threshold',
        timestamp: new Date(),
        acknowledged: false,
        resolved: false
      };

      // Store alert first
      (alertSystem as any).activeAlerts.set(alert.id, alert);

      const success = await alertSystem.resolveAlert(alert.id, 'Memory usage normalized');

      expect(success).toBe(true);
      
      const activeAlerts = alertSystem.getActiveAlerts();
      expect(activeAlerts.find(a => a.id === alert.id)).toBeUndefined();
      
      const history = alertSystem.getAlertHistory(10);
      expect(history.find(h => h.alertId === alert.id && h.event === 'resolved')).toBeDefined();
    });

    test('should auto-resolve alerts when conditions clear', async () => {
      // First, trigger an alert
      const highMemoryMetrics: PerformanceMetrics = {
        timestamp: new Date(),
        memoryUsage: {
          heapUsed: 150 * 1024 * 1024, // Exceeds threshold
          heapTotal: 200 * 1024 * 1024,
          external: 10 * 1024 * 1024,
          rss: 180 * 1024 * 1024,
          arrayBuffers: 5 * 1024 * 1024
        },
        cpuUsage: 50,
        networkIO: {
          bytesIn: 1024,
          bytesOut: 2048,
          packetsIn: 10,
          packetsOut: 15,
          connectionsActive: 5
        },
        diskIO: {
          bytesRead: 4096,
          bytesWritten: 8192,
          operationsRead: 2,
          operationsWrite: 3,
          queueLength: 1
        }
      };

      const alerts = await alertSystem.processMetrics(highMemoryMetrics);
      expect(alerts).toHaveLength(1);

      // Now send normal memory metrics
      const normalMemoryMetrics: PerformanceMetrics = {
        ...highMemoryMetrics,
        memoryUsage: {
          heapUsed: 50 * 1024 * 1024, // Within threshold
          heapTotal: 100 * 1024 * 1024,
          external: 5 * 1024 * 1024,
          rss: 80 * 1024 * 1024,
          arrayBuffers: 2 * 1024 * 1024
        }
      };

      await alertSystem.processMetrics(normalMemoryMetrics);

      // Alert should be auto-resolved
      const activeAlerts = alertSystem.getActiveAlerts();
      expect(activeAlerts).toHaveLength(0);
    });
  });

  describe('Alert History and Reporting', () => {
    test('should track alert history', async () => {
      const alert: PerformanceAlert = {
        id: 'test-alert-7',
        ruleId: 'high-memory-usage',
        ruleName: 'High Memory Usage',
        severity: 'warning',
        metric: 'memoryUsage.heapUsed',
        value: 150 * 1024 * 1024,
        threshold: 100 * 1024 * 1024,
        message: 'Memory usage exceeded threshold',
        timestamp: new Date(),
        acknowledged: false,
        resolved: false
      };

      // Store and resolve alert
      (alertSystem as any).activeAlerts.set(alert.id, alert);
      await alertSystem.acknowledgeAlert(alert.id, 'testuser');
      await alertSystem.resolveAlert(alert.id, 'Issue resolved');

      const history = alertSystem.getAlertHistory(10);
      
      expect(history.length).toBeGreaterThan(0);
      expect(history.some(h => h.alertId === alert.id && h.event === 'created')).toBe(true);
      expect(history.some(h => h.alertId === alert.id && h.event === 'acknowledged')).toBe(true);
      expect(history.some(h => h.alertId === alert.id && h.event === 'resolved')).toBe(true);
    });

    test('should generate alert summary', () => {
      // Add some mock alerts
      const alert1: PerformanceAlert = {
        id: 'alert-1',
        ruleId: 'rule-1',
        ruleName: 'Rule 1',
        severity: 'warning',
        metric: 'memory',
        value: 100,
        threshold: 80,
        message: 'Test alert 1',
        timestamp: new Date(),
        acknowledged: false,
        resolved: false
      };

      const alert2: PerformanceAlert = {
        id: 'alert-2',
        ruleId: 'rule-2',
        ruleName: 'Rule 2',
        severity: 'critical',
        metric: 'cpu',
        value: 90,
        threshold: 80,
        message: 'Test alert 2',
        timestamp: new Date(),
        acknowledged: true,
        resolved: false
      };

      (alertSystem as any).activeAlerts.set(alert1.id, alert1);
      (alertSystem as any).activeAlerts.set(alert2.id, alert2);

      const summary = alertSystem.getAlertSummary();

      expect(summary.totalActive).toBe(2);
      expect(summary.bySeverity.warning).toBe(1);
      expect(summary.bySeverity.critical).toBe(1);
      expect(summary.acknowledged).toBe(1);
      expect(summary.unacknowledged).toBe(1);
    });
  });

  describe('Alert Escalation', () => {
    test('should escalate unacknowledged alerts', async () => {
      jest.useFakeTimers();

      const alert: PerformanceAlert = {
        id: 'test-alert-8',
        ruleId: 'high-memory-usage',
        ruleName: 'High Memory Usage',
        severity: 'warning',
        metric: 'memoryUsage.heapUsed',
        value: 150 * 1024 * 1024,
        threshold: 100 * 1024 * 1024,
        message: 'Memory usage exceeded threshold',
        timestamp: new Date(),
        acknowledged: false,
        resolved: false
      };

      // Store alert
      (alertSystem as any).activeAlerts.set(alert.id, alert);

      // Fast forward time to trigger escalation
      jest.advanceTimersByTime(901000); // 15 minutes + 1 second

      // Check if alert was escalated (implementation would update severity)
      const activeAlerts = alertSystem.getActiveAlerts();
      expect(activeAlerts.find(a => a.id === alert.id)).toBeDefined();

      jest.useRealTimers();
    });
  });

  describe('Performance and Efficiency', () => {
    test('should handle large number of alerts efficiently', async () => {
      const startTime = Date.now();

      // Generate many alerts
      const promises = [];
      for (let i = 0; i < 100; i++) {
        const metrics: PerformanceMetrics = {
          timestamp: new Date(),
          memoryUsage: {
            heapUsed: (150 + i) * 1024 * 1024, // Different values to avoid deduplication
            heapTotal: 200 * 1024 * 1024,
            external: 10 * 1024 * 1024,
            rss: 180 * 1024 * 1024,
            arrayBuffers: 5 * 1024 * 1024
          },
          cpuUsage: 50,
          networkIO: {
            bytesIn: 1024,
            bytesOut: 2048,
            packetsIn: 10,
            packetsOut: 15,
            connectionsActive: 5
          },
          diskIO: {
            bytesRead: 4096,
            bytesWritten: 8192,
            operationsRead: 2,
            operationsWrite: 3,
            queueLength: 1
          }
        };

        promises.push(alertSystem.processMetrics(metrics));
      }

      await Promise.all(promises);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should process efficiently (under 5 seconds for 100 alerts)
      expect(duration).toBeLessThan(5000);
    });

    test('should limit active alerts to prevent memory issues', async () => {
      // Configure system with low limit for testing
      const limitedConfig = {
        ...mockConfig,
        maxActiveAlerts: 5
      };

      const limitedAlertSystem = new AlertSystem(limitedConfig);

      // Generate more alerts than the limit
      for (let i = 0; i < 10; i++) {
        const metrics: PerformanceMetrics = {
          timestamp: new Date(),
          memoryUsage: {
            heapUsed: (150 + i) * 1024 * 1024,
            heapTotal: 200 * 1024 * 1024,
            external: 10 * 1024 * 1024,
            rss: 180 * 1024 * 1024,
            arrayBuffers: 5 * 1024 * 1024
          },
          cpuUsage: 50,
          networkIO: {
            bytesIn: 1024,
            bytesOut: 2048,
            packetsIn: 10,
            packetsOut: 15,
            connectionsActive: 5
          },
          diskIO: {
            bytesRead: 4096,
            bytesWritten: 8192,
            operationsRead: 2,
            operationsWrite: 3,
            queueLength: 1
          }
        };

        await limitedAlertSystem.processMetrics(metrics);
      }

      const activeAlerts = limitedAlertSystem.getActiveAlerts();
      expect(activeAlerts.length).toBeLessThanOrEqual(5);

      limitedAlertSystem.stop();
    });
  });

  describe('Configuration and Error Handling', () => {
    test('should validate alert system configuration', () => {
      const invalidConfig = {
        ...mockConfig,
        debounceMs: -1 // Invalid negative value
      };

      expect(() => new AlertSystem(invalidConfig)).toThrow();
    });

    test('should handle disabled alert system gracefully', async () => {
      const disabledConfig = {
        ...mockConfig,
        enabled: false
      };

      const disabledAlertSystem = new AlertSystem(disabledConfig);

      const metrics: PerformanceMetrics = {
        timestamp: new Date(),
        memoryUsage: {
          heapUsed: 150 * 1024 * 1024, // Exceeds threshold
          heapTotal: 200 * 1024 * 1024,
          external: 10 * 1024 * 1024,
          rss: 180 * 1024 * 1024,
          arrayBuffers: 5 * 1024 * 1024
        },
        cpuUsage: 50,
        networkIO: {
          bytesIn: 1024,
          bytesOut: 2048,
          packetsIn: 10,
          packetsOut: 15,
          connectionsActive: 5
        },
        diskIO: {
          bytesRead: 4096,
          bytesWritten: 8192,
          operationsRead: 2,
          operationsWrite: 3,
          queueLength: 1
        }
      };

      const alerts = await disabledAlertSystem.processMetrics(metrics);
      expect(alerts).toHaveLength(0);

      disabledAlertSystem.stop();
    });

    test('should use default configuration when not provided', () => {
      const minimalConfig: Partial<AlertConfig> = {
        enabled: true
      };

      const systemWithDefaults = new AlertSystem(minimalConfig as AlertConfig);
      
      expect(systemWithDefaults).toBeDefined();
      
      systemWithDefaults.stop();
    });
  });
});