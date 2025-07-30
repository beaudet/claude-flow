/**
 * Comprehensive tests for Performance Dashboard
 * Tests real-time performance dashboard functionality
 */

import { jest } from '@jest/globals';
import { PerformanceDashboard } from '../dashboard/PerformanceDashboard.js';
import { 
  DashboardConfig, 
  DashboardMetrics, 
  ChartData,
  DashboardWidget,
  DashboardTheme,
  DashboardUser,
  DashboardSession
} from '../types.js';

// Mock HTTP server and WebSocket
const mockHttpServer = {
  listen: jest.fn((port, callback) => callback()),
  close: jest.fn((callback) => callback()),
  on: jest.fn()
};

const mockWebSocketServer = {
  on: jest.fn(),
  clients: new Set(),
  broadcast: jest.fn()
};

const mockExpress = {
  static: jest.fn(),
  json: jest.fn(),
  urlencoded: jest.fn()
};

const mockApp = {
  use: jest.fn(),
  get: jest.fn(),
  post: jest.fn(),
  listen: jest.fn(() => mockHttpServer),
  set: jest.fn()
};

// Mock external dependencies
jest.mock('express', () => {
  return jest.fn(() => mockApp);
});

jest.mock('ws', () => ({
  WebSocketServer: jest.fn(() => mockWebSocketServer)
}));

jest.mock('../../monitoring/real-time-monitor.js');

describe('PerformanceDashboard', () => {
  let dashboard: PerformanceDashboard;
  let mockConfig: DashboardConfig;

  beforeEach(() => {
    mockConfig = {
      port: 3001,
      host: 'localhost',
      enableAuth: false,
      enableRealtime: true,
      updateInterval: 5000,
      retentionPeriod: 86400000, // 24 hours
      theme: 'light',
      widgets: [
        {
          id: 'memory-usage',
          type: 'line-chart',
          title: 'Memory Usage',
          position: { x: 0, y: 0, width: 6, height: 4 },
          config: {
            metrics: ['memoryUsage.heapUsed'],
            timeWindow: 3600000 // 1 hour
          }
        },
        {
          id: 'cpu-usage',
          type: 'gauge',
          title: 'CPU Usage',
          position: { x: 6, y: 0, width: 3, height: 4 },
          config: {
            metrics: ['cpuUsage'],
            thresholds: [
              { value: 70, color: 'yellow' },
              { value: 90, color: 'red' }
            ]
          }
        }
      ],
      customization: {
        brandName: 'Claude Flow Performance',
        logoUrl: '/assets/logo.png',
        primaryColor: '#007bff',
        backgroundColor: '#f8f9fa'
      }
    };

    dashboard = new PerformanceDashboard(mockConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
    dashboard.stop();
  });

  describe('Dashboard Initialization', () => {
    test('should initialize dashboard with correct configuration', () => {
      expect(dashboard).toBeDefined();
      expect(dashboard.getConfig()).toEqual(mockConfig);
    });

    test('should validate dashboard configuration', () => {
      const invalidConfig = {
        ...mockConfig,
        port: -1 // Invalid port
      };

      expect(() => new PerformanceDashboard(invalidConfig)).toThrow();
    });

    test('should use default configuration when not provided', () => {
      const minimalConfig: Partial<DashboardConfig> = {
        port: 3002
      };

      const defaultDashboard = new PerformanceDashboard(minimalConfig as DashboardConfig);
      
      expect(defaultDashboard).toBeDefined();
      expect(defaultDashboard.getConfig().enableRealtime).toBe(true);
      
      defaultDashboard.stop();
    });
  });

  describe('Server Management', () => {
    test('should start HTTP server successfully', async () => {
      await dashboard.start();

      expect(mockApp.listen).toHaveBeenCalledWith(
        mockConfig.port,
        mockConfig.host,
        expect.any(Function)
      );
      expect(dashboard.isRunning()).toBe(true);
    });

    test('should stop server gracefully', async () => {
      await dashboard.start();
      expect(dashboard.isRunning()).toBe(true);

      await dashboard.stop();
      
      expect(mockHttpServer.close).toHaveBeenCalled();
      expect(dashboard.isRunning()).toBe(false);
    });

    test('should handle server startup errors', async () => {
      mockApp.listen.mockImplementationOnce(() => {
        throw new Error('Port already in use');
      });

      await expect(dashboard.start()).rejects.toThrow('Port already in use');
    });

    test('should setup express middleware correctly', async () => {
      await dashboard.start();

      expect(mockApp.use).toHaveBeenCalledWith(mockExpress.json());
      expect(mockApp.use).toHaveBeenCalledWith(mockExpress.urlencoded({ extended: true }));
      expect(mockApp.use).toHaveBeenCalledWith('/assets', mockExpress.static(expect.any(String)));
    });
  });

  describe('Real-time Data Management', () => {
    test('should process and store real-time metrics', async () => {
      const metrics: DashboardMetrics = {
        timestamp: new Date().toISOString(),
        memoryUsage: {
          heapUsed: 100 * 1024 * 1024,
          heapTotal: 150 * 1024 * 1024,
          external: 10 * 1024 * 1024,
          rss: 120 * 1024 * 1024,
          arrayBuffers: 5 * 1024 * 1024
        },
        cpuUsage: 65,
        networkIO: {
          bytesIn: 1024 * 1024,
          bytesOut: 2 * 1024 * 1024,
          packetsIn: 1000,
          packetsOut: 1500,
          connectionsActive: 25
        },
        diskIO: {
          bytesRead: 4 * 1024 * 1024,
          bytesWritten: 2 * 1024 * 1024,
          operationsRead: 100,
          operationsWrite: 50,
          queueLength: 5
        },
        bundleSize: 8 * 1024 * 1024,
        testResults: {
          total: 150,
          passed: 145,
          failed: 5,
          duration: 12000
        },
        alerts: {
          active: 2,
          acknowledged: 1,
          resolved: 8
        }
      };

      await dashboard.updateMetrics(metrics);

      const storedData = dashboard.getMetricsHistory(3600000); // 1 hour
      expect(storedData).toHaveLength(1);
      expect(storedData[0].cpuUsage).toBe(65);
    });

    test('should broadcast real-time updates to connected clients', async () => {
      await dashboard.start();

      const metrics: DashboardMetrics = {
        timestamp: new Date().toISOString(),
        memoryUsage: {
          heapUsed: 100 * 1024 * 1024,
          heapTotal: 150 * 1024 * 1024,
          external: 10 * 1024 * 1024,
          rss: 120 * 1024 * 1024,
          arrayBuffers: 5 * 1024 * 1024
        },
        cpuUsage: 75,
        networkIO: {
          bytesIn: 1024 * 1024,
          bytesOut: 2 * 1024 * 1024,
          packetsIn: 1000,
          packetsOut: 1500,
          connectionsActive: 25
        },
        diskIO: {
          bytesRead: 4 * 1024 * 1024,
          bytesWritten: 2 * 1024 * 1024,
          operationsRead: 100,
          operationsWrite: 50,
          queueLength: 5
        },
        bundleSize: 8 * 1024 * 1024,
        testResults: {
          total: 150,
          passed: 145,
          failed: 5,
          duration: 12000
        },
        alerts: {
          active: 3,
          acknowledged: 1,
          resolved: 8
        }
      };

      await dashboard.updateMetrics(metrics);

      expect(mockWebSocketServer.broadcast).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'metrics-update',
          data: metrics
        })
      );
    });

    test('should maintain metrics history within retention period', async () => {
      const now = Date.now();
      
      // Add old metrics (older than retention period)
      const oldMetrics: DashboardMetrics = {
        timestamp: new Date(now - 2 * 86400000).toISOString(), // 2 days ago
        memoryUsage: {
          heapUsed: 50 * 1024 * 1024,
          heapTotal: 100 * 1024 * 1024,
          external: 5 * 1024 * 1024,
          rss: 70 * 1024 * 1024,
          arrayBuffers: 2 * 1024 * 1024
        },
        cpuUsage: 30,
        networkIO: {
          bytesIn: 512 * 1024,
          bytesOut: 1024 * 1024,
          packetsIn: 500,
          packetsOut: 750,
          connectionsActive: 10
        },
        diskIO: {
          bytesRead: 1024 * 1024,
          bytesWritten: 512 * 1024,
          operationsRead: 50,
          operationsWrite: 25,
          queueLength: 2
        },
        bundleSize: 6 * 1024 * 1024,
        testResults: {
          total: 100,
          passed: 98,
          failed: 2,
          duration: 8000
        },
        alerts: {
          active: 0,
          acknowledged: 0,
          resolved: 3
        }
      };

      // Add recent metrics
      const recentMetrics: DashboardMetrics = {
        timestamp: new Date(now).toISOString(),
        memoryUsage: {
          heapUsed: 100 * 1024 * 1024,
          heapTotal: 150 * 1024 * 1024,
          external: 10 * 1024 * 1024,
          rss: 120 * 1024 * 1024,
          arrayBuffers: 5 * 1024 * 1024
        },
        cpuUsage: 65,
        networkIO: {
          bytesIn: 1024 * 1024,
          bytesOut: 2 * 1024 * 1024,
          packetsIn: 1000,
          packetsOut: 1500,
          connectionsActive: 25
        },
        diskIO: {
          bytesRead: 4 * 1024 * 1024,
          bytesWritten: 2 * 1024 * 1024,
          operationsRead: 100,
          operationsWrite: 50,
          queueLength: 5
        },
        bundleSize: 8 * 1024 * 1024,
        testResults: {
          total: 150,
          passed: 145,
          failed: 5,
          duration: 12000
        },
        alerts: {
          active: 2,
          acknowledged: 1,
          resolved: 8
        }
      };

      await dashboard.updateMetrics(oldMetrics);
      await dashboard.updateMetrics(recentMetrics);

      // Clean up old data
      await dashboard.cleanupOldData();

      const history = dashboard.getMetricsHistory(3 * 86400000); // 3 days
      expect(history).toHaveLength(1); // Only recent metrics should remain
      expect(history[0].timestamp).toBe(recentMetrics.timestamp);
    });
  });

  describe('Widget Management', () => {
    test('should add new widgets', () => {
      const newWidget: DashboardWidget = {
        id: 'network-io',
        type: 'area-chart',
        title: 'Network I/O',
        position: { x: 0, y: 4, width: 12, height: 3 },
        config: {
          metrics: ['networkIO.bytesIn', 'networkIO.bytesOut'],
          timeWindow: 1800000 // 30 minutes
        }
      };

      dashboard.addWidget(newWidget);

      const widgets = dashboard.getWidgets();
      expect(widgets).toHaveLength(3); // 2 initial + 1 new
      expect(widgets.find(w => w.id === 'network-io')).toBeDefined();
    });

    test('should remove widgets', () => {
      const success = dashboard.removeWidget('memory-usage');
      
      expect(success).toBe(true);
      
      const widgets = dashboard.getWidgets();
      expect(widgets.find(w => w.id === 'memory-usage')).toBeUndefined();
    });

    test('should update widget configuration', () => {
      const updatedConfig = {
        metrics: ['memoryUsage.heapUsed', 'memoryUsage.heapTotal'],
        timeWindow: 7200000 // 2 hours
      };

      const success = dashboard.updateWidget('memory-usage', { config: updatedConfig });
      
      expect(success).toBe(true);
      
      const widgets = dashboard.getWidgets();
      const memoryWidget = widgets.find(w => w.id === 'memory-usage');
      expect(memoryWidget?.config.timeWindow).toBe(7200000);
    });

    test('should generate chart data for widgets', () => {
      // Add some metrics
      const metrics1: DashboardMetrics = {
        timestamp: new Date(Date.now() - 60000).toISOString(), // 1 minute ago
        memoryUsage: {
          heapUsed: 80 * 1024 * 1024,
          heapTotal: 120 * 1024 * 1024,
          external: 8 * 1024 * 1024,
          rss: 100 * 1024 * 1024,
          arrayBuffers: 4 * 1024 * 1024
        },
        cpuUsage: 60,
        networkIO: {
          bytesIn: 800 * 1024,
          bytesOut: 1.5 * 1024 * 1024,
          packetsIn: 800,
          packetsOut: 1200,
          connectionsActive: 20
        },
        diskIO: {
          bytesRead: 3 * 1024 * 1024,
          bytesWritten: 1.5 * 1024 * 1024,
          operationsRead: 80,
          operationsWrite: 40,
          queueLength: 3
        },
        bundleSize: 7.5 * 1024 * 1024,
        testResults: {
          total: 140,
          passed: 138,
          failed: 2,
          duration: 10000
        },
        alerts: {
          active: 1,
          acknowledged: 0,
          resolved: 5
        }
      };

      const metrics2: DashboardMetrics = {
        timestamp: new Date().toISOString(),
        memoryUsage: {
          heapUsed: 100 * 1024 * 1024,
          heapTotal: 150 * 1024 * 1024,
          external: 10 * 1024 * 1024,
          rss: 120 * 1024 * 1024,
          arrayBuffers: 5 * 1024 * 1024
        },
        cpuUsage: 75,
        networkIO: {
          bytesIn: 1024 * 1024,
          bytesOut: 2 * 1024 * 1024,
          packetsIn: 1000,
          packetsOut: 1500,
          connectionsActive: 25
        },
        diskIO: {
          bytesRead: 4 * 1024 * 1024,
          bytesWritten: 2 * 1024 * 1024,
          operationsRead: 100,
          operationsWrite: 50,
          queueLength: 5
        },
        bundleSize: 8 * 1024 * 1024,
        testResults: {
          total: 150,
          passed: 145,
          failed: 5,
          duration: 12000
        },
        alerts: {
          active: 2,
          acknowledged: 1,
          resolved: 8
        }
      };

      dashboard.updateMetrics(metrics1);
      dashboard.updateMetrics(metrics2);

      const chartData = dashboard.getChartData('memory-usage');
      
      expect(chartData).toBeDefined();
      expect(chartData.labels).toHaveLength(2);
      expect(chartData.datasets).toHaveLength(1);
      expect(chartData.datasets[0].data).toHaveLength(2);
    });
  });

  describe('Authentication and Authorization', () => {
    test('should handle authentication when enabled', async () => {
      const authConfig = {
        ...mockConfig,
        enableAuth: true,
        authToken: 'test-secret-token'
      };

      const authDashboard = new PerformanceDashboard(authConfig);
      await authDashboard.start();

      // Should set up authentication middleware
      expect(mockApp.use).toHaveBeenCalledWith(expect.any(Function));

      authDashboard.stop();
    });

    test('should validate user sessions', () => {
      const authConfig = {
        ...mockConfig,
        enableAuth: true,
        authToken: 'test-secret-token'
      };

      const authDashboard = new PerformanceDashboard(authConfig);
      
      const validToken = 'test-secret-token';
      const invalidToken = 'wrong-token';

      expect(authDashboard.validateSession(validToken)).toBe(true);
      expect(authDashboard.validateSession(invalidToken)).toBe(false);

      authDashboard.stop();
    });

    test('should manage user sessions', () => {
      const authConfig = {
        ...mockConfig,
        enableAuth: true,
        authToken: 'test-secret-token'
      };

      const authDashboard = new PerformanceDashboard(authConfig);
      
      const user: DashboardUser = {
        id: 'user-1',
        username: 'testuser',
        role: 'viewer',
        permissions: ['view-dashboard', 'view-metrics']
      };

      const sessionId = authDashboard.createSession(user);
      expect(sessionId).toBeDefined();

      const session = authDashboard.getSession(sessionId);
      expect(session?.user.username).toBe('testuser');

      const success = authDashboard.destroySession(sessionId);
      expect(success).toBe(true);

      authDashboard.stop();
    });
  });

  describe('Theme and Customization', () => {
    test('should apply custom themes', () => {
      const customTheme: DashboardTheme = {
        name: 'dark',
        colors: {
          primary: '#ffffff',
          secondary: '#cccccc',
          background: '#121212',
          surface: '#1e1e1e',
          error: '#ff5252',
          warning: '#ff9800',
          success: '#4caf50'
        },
        typography: {
          fontFamily: 'Roboto, sans-serif',
          fontSize: {
            small: '12px',
            medium: '14px',
            large: '16px'
          }
        }
      };

      dashboard.setTheme(customTheme);

      const currentTheme = dashboard.getTheme();
      expect(currentTheme.name).toBe('dark');
      expect(currentTheme.colors.background).toBe('#121212');
    });

    test('should update dashboard branding', () => {
      const branding = {
        brandName: 'Custom Performance Dashboard',
        logoUrl: '/custom-logo.png',
        primaryColor: '#ff5722',
        backgroundColor: '#fafafa'
      };

      dashboard.updateBranding(branding);

      const config = dashboard.getConfig();
      expect(config.customization?.brandName).toBe('Custom Performance Dashboard');
      expect(config.customization?.primaryColor).toBe('#ff5722');
    });
  });

  describe('Export and Reporting', () => {
    test('should export dashboard configuration', () => {
      const exportedConfig = dashboard.exportConfiguration();

      expect(exportedConfig).toBeDefined();
      expect(exportedConfig.widgets).toHaveLength(2);
      expect(exportedConfig.theme).toBeDefined();
    });

    test('should import dashboard configuration', () => {
      const importConfig = {
        widgets: [
          {
            id: 'imported-widget',
            type: 'bar-chart',
            title: 'Imported Widget',
            position: { x: 0, y: 0, width: 6, height: 4 },
            config: {
              metrics: ['testResults.total'],
              timeWindow: 3600000
            }
          }
        ],
        theme: 'dark',
        customization: {
          brandName: 'Imported Dashboard'
        }
      };

      dashboard.importConfiguration(importConfig);

      const widgets = dashboard.getWidgets();
      expect(widgets.find(w => w.id === 'imported-widget')).toBeDefined();
    });

    test('should generate performance reports', async () => {
      // Add some test data
      const metrics: DashboardMetrics = {
        timestamp: new Date().toISOString(),
        memoryUsage: {
          heapUsed: 100 * 1024 * 1024,
          heapTotal: 150 * 1024 * 1024,
          external: 10 * 1024 * 1024,
          rss: 120 * 1024 * 1024,
          arrayBuffers: 5 * 1024 * 1024
        },
        cpuUsage: 65,
        networkIO: {
          bytesIn: 1024 * 1024,
          bytesOut: 2 * 1024 * 1024,
          packetsIn: 1000,
          packetsOut: 1500,
          connectionsActive: 25
        },
        diskIO: {
          bytesRead: 4 * 1024 * 1024,
          bytesWritten: 2 * 1024 * 1024,
          operationsRead: 100,
          operationsWrite: 50,
          queueLength: 5
        },
        bundleSize: 8 * 1024 * 1024,
        testResults: {
          total: 150,
          passed: 145,
          failed: 5,
          duration: 12000
        },
        alerts: {
          active: 2,
          acknowledged: 1,
          resolved: 8
        }
      };

      await dashboard.updateMetrics(metrics);

      const report = dashboard.generateReport('json', {
        timeRange: 3600000, // 1 hour
        includeCharts: true,
        includeMetrics: true
      });

      expect(report).toBeDefined();
      expect(typeof report).toBe('string');
      
      const parsedReport = JSON.parse(report);
      expect(parsedReport.summary).toBeDefined();
      expect(parsedReport.metrics).toBeDefined();
    });
  });

  describe('WebSocket Communication', () => {
    test('should handle WebSocket connections', async () => {
      await dashboard.start();

      // Simulate WebSocket connection
      const mockWebSocket = {
        send: jest.fn(),
        on: jest.fn(),
        readyState: 1 // OPEN
      };

      // Simulate connection event
      const connectionCallback = mockWebSocketServer.on.mock.calls.find(
        call => call[0] === 'connection'
      )?.[1];

      if (connectionCallback) {
        connectionCallback(mockWebSocket);
      }

      expect(mockWebSocketServer.on).toHaveBeenCalledWith('connection', expect.any(Function));
    });

    test('should broadcast alerts to connected clients', async () => {
      await dashboard.start();

      const alert = {
        id: 'alert-1',
        severity: 'warning',
        message: 'High CPU usage detected',
        timestamp: new Date().toISOString()
      };

      dashboard.broadcastAlert(alert);

      expect(mockWebSocketServer.broadcast).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'alert',
          data: alert
        })
      );
    });
  });

  describe('Performance and Scalability', () => {
    test('should handle large amounts of metrics data efficiently', async () => {
      const startTime = Date.now();

      // Generate large dataset
      const promises = [];
      for (let i = 0; i < 1000; i++) {
        const metrics: DashboardMetrics = {
          timestamp: new Date(Date.now() - i * 1000).toISOString(),
          memoryUsage: {
            heapUsed: (50 + i % 100) * 1024 * 1024,
            heapTotal: (100 + i % 50) * 1024 * 1024,
            external: (5 + i % 10) * 1024 * 1024,
            rss: (70 + i % 80) * 1024 * 1024,
            arrayBuffers: (2 + i % 5) * 1024 * 1024
          },
          cpuUsage: 30 + (i % 70),
          networkIO: {
            bytesIn: (500 + i % 1000) * 1024,
            bytesOut: (1000 + i % 2000) * 1024,
            packetsIn: 500 + i % 1000,
            packetsOut: 750 + i % 1500,
            connectionsActive: 10 + i % 40
          },
          diskIO: {
            bytesRead: (1 + i % 5) * 1024 * 1024,
            bytesWritten: (0.5 + i % 3) * 1024 * 1024,
            operationsRead: 50 + i % 100,
            operationsWrite: 25 + i % 75,
            queueLength: 1 + i % 10
          },
          bundleSize: (6 + i % 4) * 1024 * 1024,
          testResults: {
            total: 100 + i % 100,
            passed: 95 + i % 5,
            failed: i % 5,
            duration: 8000 + i % 5000
          },
          alerts: {
            active: i % 5,
            acknowledged: i % 3,
            resolved: i % 10
          }
        };

        promises.push(dashboard.updateMetrics(metrics));
      }

      await Promise.all(promises);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should process efficiently (under 5 seconds for 1000 metrics)
      expect(duration).toBeLessThan(5000);

      const history = dashboard.getMetricsHistory(3600000); // 1 hour
      expect(history.length).toBe(1000);
    });

    test('should limit memory usage with data cleanup', async () => {
      // Configure shorter retention for testing
      const shortRetentionConfig = {
        ...mockConfig,
        retentionPeriod: 60000 // 1 minute
      };

      const shortRetentionDashboard = new PerformanceDashboard(shortRetentionConfig);

      // Add old data
      const oldMetrics: DashboardMetrics = {
        timestamp: new Date(Date.now() - 120000).toISOString(), // 2 minutes ago
        memoryUsage: {
          heapUsed: 50 * 1024 * 1024,
          heapTotal: 100 * 1024 * 1024,
          external: 5 * 1024 * 1024,
          rss: 70 * 1024 * 1024,
          arrayBuffers: 2 * 1024 * 1024
        },
        cpuUsage: 30,
        networkIO: {
          bytesIn: 512 * 1024,
          bytesOut: 1024 * 1024,
          packetsIn: 500,
          packetsOut: 750,
          connectionsActive: 10
        },
        diskIO: {
          bytesRead: 1024 * 1024,
          bytesWritten: 512 * 1024,
          operationsRead: 50,
          operationsWrite: 25,
          queueLength: 2
        },
        bundleSize: 6 * 1024 * 1024,
        testResults: {
          total: 100,
          passed: 98,
          failed: 2,
          duration: 8000
        },
        alerts: {
          active: 0,
          acknowledged: 0,
          resolved: 3
        }
      };

      await shortRetentionDashboard.updateMetrics(oldMetrics);

      // Clean up old data
      await shortRetentionDashboard.cleanupOldData();

      const history = shortRetentionDashboard.getMetricsHistory(180000); // 3 minutes
      expect(history).toHaveLength(0); // Old data should be cleaned up

      shortRetentionDashboard.stop();
    });
  });

  describe('Error Handling and Resilience', () => {
    test('should handle server errors gracefully', async () => {
      mockApp.listen.mockImplementationOnce(() => {
        throw new Error('Server startup failed');
      });

      await expect(dashboard.start()).rejects.toThrow('Server startup failed');
      expect(dashboard.isRunning()).toBe(false);
    });

    test('should handle WebSocket errors gracefully', async () => {
      await dashboard.start();

      // Simulate WebSocket error
      const errorCallback = mockWebSocketServer.on.mock.calls.find(
        call => call[0] === 'error'
      )?.[1];

      if (errorCallback) {
        expect(() => errorCallback(new Error('WebSocket error'))).not.toThrow();
      }
    });

    test('should handle malformed metrics data', async () => {
      const malformedMetrics = {
        timestamp: 'invalid-date',
        memoryUsage: 'not-an-object',
        cpuUsage: 'not-a-number'
      } as any;

      // Should not throw error
      await expect(dashboard.updateMetrics(malformedMetrics)).resolves.not.toThrow();

      const history = dashboard.getMetricsHistory(3600000);
      expect(history).toHaveLength(0); // Malformed data should be rejected
    });
  });
});