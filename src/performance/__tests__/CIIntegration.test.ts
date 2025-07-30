/**
 * Comprehensive tests for CI Integration
 * Tests CI/CD pipeline integration and automation functionality
 */

import { jest } from '@jest/globals';
import { CIIntegration } from '../ci/CIIntegration.js';
import { 
  CIConfig, 
  CIProvider,
  PipelineStage,
  DeploymentConfig,
  TestResult,
  BuildResult,
  DeploymentResult,
  PipelineContext,
  QualityGate
} from '../types.js';

// Mock external dependencies
jest.mock('../../monitoring/real-time-monitor.js');
jest.mock('child_process');
jest.mock('fs/promises');

// Mock child_process
const mockChildProcess = {
  spawn: jest.fn(),
  exec: jest.fn(),
  execSync: jest.fn()
};
jest.doMock('child_process', () => mockChildProcess);

// Mock file system
const mockFs = {
  readFile: jest.fn(),
  writeFile: jest.fn(),
  mkdir: jest.fn(),
  access: jest.fn(),
  stat: jest.fn()
};
jest.doMock('fs/promises', () => mockFs);

describe('CIIntegration', () => {
  let ciIntegration: CIIntegration;
  let mockConfig: CIConfig;

  beforeEach(() => {
    mockConfig = {
      provider: 'github-actions',
      repository: {
        owner: 'testorg',
        name: 'test-repo',
        branch: 'main'
      },
      authentication: {
        token: 'test-token',
        apiUrl: 'https://api.github.com'
      },
      pipeline: {
        stages: [
          {
            name: 'build',
            type: 'build',
            commands: ['npm ci', 'npm run build'],
            timeout: 600000, // 10 minutes
            environment: {
              NODE_ENV: 'production'
            },
            requirements: {
              nodeVersion: '18.x',
              memory: '2GB',
              cpu: '2 cores'
            }
          },
          {
            name: 'test',
            type: 'test',
            commands: ['npm run test', 'npm run test:performance'],
            timeout: 900000, // 15 minutes
            parallel: true,
            environment: {
              NODE_ENV: 'test'
            }
          },
          {
            name: 'quality-gates',
            type: 'quality-check',
            commands: ['npm run lint', 'npm run typecheck'],
            timeout: 300000, // 5 minutes
            gates: [
              {
                name: 'test-coverage',
                threshold: 80,
                metric: 'coverage.percentage',
                required: true
              },
              {
                name: 'performance-regression',
                threshold: 10,
                metric: 'performance.regressionPercent',
                required: true
              }
            ]
          },
          {
            name: 'deploy',
            type: 'deployment',
            commands: ['npm run deploy'],
            timeout: 1200000, // 20 minutes
            environment: {
              NODE_ENV: 'production'
            },
            approvalRequired: true,
            deployment: {
              strategy: 'blue-green',
              environments: ['staging', 'production'],
              healthChecks: ['http://localhost:3000/health'],
              rollbackOnFailure: true
            }
          }
        ],
        triggers: {
          push: ['main', 'develop'],
          pullRequest: ['main'],
          schedule: '0 2 * * *' // Daily at 2 AM
        },
        notifications: {
          onSuccess: ['slack://dev-team'],
          onFailure: ['slack://dev-team', 'email://alerts@company.com'],
          onApprovalNeeded: ['email://leads@company.com']
        }
      },
      performance: {
        enabled: true,
        baselineComparison: true,
        regressionThreshold: 10,
        failOnRegression: true,
        reportFormat: 'json'
      },
      security: {
        enabled: true,
        scanDependencies: true,
        scanCode: true,
        enforceCompliance: true
      }
    };

    ciIntegration = new CIIntegration(mockConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('CI Configuration', () => {
    test('should initialize with correct configuration', () => {
      expect(ciIntegration).toBeDefined();
      expect(ciIntegration.getConfig()).toEqual(mockConfig);
    });

    test('should validate CI configuration', () => {
      const invalidConfig = {
        ...mockConfig,
        provider: 'invalid-provider' as CIProvider
      };

      expect(() => new CIIntegration(invalidConfig)).toThrow();
    });

    test('should support multiple CI providers', () => {
      const providers: CIProvider[] = ['github-actions', 'gitlab-ci', 'jenkins', 'azure-devops'];
      
      providers.forEach(provider => {
        const config = { ...mockConfig, provider };
        expect(() => new CIIntegration(config)).not.toThrow();
      });
    });

    test('should use default configuration when not provided', () => {
      const minimalConfig: Partial<CIConfig> = {
        provider: 'github-actions',
        repository: {
          owner: 'test',
          name: 'test',
          branch: 'main'
        }
      };

      const defaultCI = new CIIntegration(minimalConfig as CIConfig);
      expect(defaultCI).toBeDefined();
    });
  });

  describe('Pipeline Execution', () => {
    test('should execute pipeline stages in order', async () => {
      mockChildProcess.exec.mockImplementation((command, options, callback) => {
        callback(null, { stdout: 'success', stderr: '' });
      });

      const context: PipelineContext = {
        commit: 'abc123',
        branch: 'main',
        author: 'testuser',
        message: 'Test commit',
        timestamp: new Date(),
        environment: 'production'
      };

      const result = await ciIntegration.executePipeline(context);

      expect(result.success).toBe(true);
      expect(result.stages).toHaveLength(4);
      expect(result.stages[0].name).toBe('build');
      expect(result.stages[1].name).toBe('test');
      expect(result.stages[2].name).toBe('quality-gates');
      expect(result.stages[3].name).toBe('deploy');
    });

    test('should handle stage failures', async () => {
      mockChildProcess.exec
        .mockImplementationOnce((command, options, callback) => {
          callback(null, { stdout: 'build success', stderr: '' });
        })
        .mockImplementationOnce((command, options, callback) => {
          callback(new Error('Test failed'), { stdout: '', stderr: 'Test error' });
        });

      const context: PipelineContext = {
        commit: 'def456',
        branch: 'feature-branch',
        author: 'developer',
        message: 'Feature implementation',
        timestamp: new Date(),
        environment: 'development'
      };

      const result = await ciIntegration.executePipeline(context);

      expect(result.success).toBe(false);
      expect(result.stages[0].success).toBe(true);
      expect(result.stages[1].success).toBe(false);
      expect(result.stages[1].error).toContain('Test failed');
      expect(result.stages).toHaveLength(2); // Should stop after failure
    });

    test('should respect stage timeouts', async () => {
      jest.useFakeTimers();

      mockChildProcess.exec.mockImplementation((command, options, callback) => {
        // Never call callback to simulate hanging process
      });

      const shortTimeoutConfig = {
        ...mockConfig,
        pipeline: {
          ...mockConfig.pipeline,
          stages: [{
            name: 'timeout-test',
            type: 'build' as const,
            commands: ['sleep 30'],
            timeout: 1000 // 1 second
          }]
        }
      };

      const timeoutCI = new CIIntegration(shortTimeoutConfig);
      
      const context: PipelineContext = {
        commit: 'timeout123',
        branch: 'main',
        author: 'testuser',
        message: 'Timeout test',
        timestamp: new Date(),
        environment: 'test'
      };

      const resultPromise = timeoutCI.executePipeline(context);

      // Fast forward time
      jest.advanceTimersByTime(2000);

      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.stages[0].error).toContain('timeout');

      jest.useRealTimers();
    });

    test('should execute parallel stages concurrently', async () => {
      const executionOrder: string[] = [];
      
      mockChildProcess.exec.mockImplementation((command, options, callback) => {
        const delay = command.includes('test1') ? 100 : 50;
        setTimeout(() => {
          executionOrder.push(command);
          callback(null, { stdout: 'success', stderr: '' });
        }, delay);
      });

      const parallelConfig = {
        ...mockConfig,
        pipeline: {
          ...mockConfig.pipeline,
          stages: [{
            name: 'parallel-tests',
            type: 'test' as const,
            commands: ['npm run test1', 'npm run test2'],
            timeout: 300000,
            parallel: true
          }]
        }
      };

      const parallelCI = new CIIntegration(parallelConfig);
      
      const context: PipelineContext = {
        commit: 'parallel123',
        branch: 'main',
        author: 'testuser',
        message: 'Parallel test',
        timestamp: new Date(),
        environment: 'test'
      };

      const startTime = Date.now();
      const result = await parallelCI.executePipeline(context);
      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(150); // Should complete faster than sequential
      expect(executionOrder).toHaveLength(2);
    });
  });

  describe('Quality Gates', () => {
    test('should evaluate quality gates', async () => {
      const mockTestResult: TestResult = {
        success: true,
        coverage: {
          percentage: 85,
          lines: 1700,
          coveredLines: 1445
        },
        testSuites: [{
          name: 'unit-tests',
          tests: 50,
          passed: 48,
          failed: 2,
          duration: 5000
        }],
        performance: {
          averageTime: 120,
          regressionPercent: 5
        }
      };

      const gates: QualityGate[] = [
        {
          name: 'test-coverage',
          threshold: 80,
          metric: 'coverage.percentage',
          required: true
        },
        {
          name: 'performance-regression',
          threshold: 10,
          metric: 'performance.regressionPercent',
          required: true
        }
      ];

      const gateResults = await ciIntegration.evaluateQualityGates(gates, mockTestResult);

      expect(gateResults).toHaveLength(2);
      expect(gateResults[0].passed).toBe(true); // 85% > 80%
      expect(gateResults[1].passed).toBe(true); // 5% < 10%
    });

    test('should fail quality gates when thresholds not met', async () => {
      const mockTestResult: TestResult = {
        success: true,
        coverage: {
          percentage: 75, // Below threshold
          lines: 1000,
          coveredLines: 750
        },
        testSuites: [{
          name: 'unit-tests',
          tests: 100,
          passed: 85,
          failed: 15,
          duration: 8000
        }],
        performance: {
          averageTime: 200,
          regressionPercent: 15 // Above threshold
        }
      };

      const gates: QualityGate[] = [
        {
          name: 'test-coverage',
          threshold: 80,
          metric: 'coverage.percentage',
          required: true
        },
        {
          name: 'performance-regression',
          threshold: 10,
          metric: 'performance.regressionPercent',
          required: true
        }
      ];

      const gateResults = await ciIntegration.evaluateQualityGates(gates, mockTestResult);

      expect(gateResults[0].passed).toBe(false); // 75% < 80%
      expect(gateResults[1].passed).toBe(false); // 15% > 10%
    });

    test('should handle optional quality gates', async () => {
      const mockTestResult: TestResult = {
        success: true,
        coverage: {
          percentage: 75,
          lines: 1000,
          coveredLines: 750
        },
        testSuites: [{
          name: 'unit-tests',
          tests: 50,
          passed: 50,
          failed: 0,
          duration: 5000
        }],
        performance: {
          averageTime: 100,
          regressionPercent: 5
        }
      };

      const gates: QualityGate[] = [
        {
          name: 'test-coverage',
          threshold: 80,
          metric: 'coverage.percentage',
          required: false // Optional gate
        }
      ];

      const gateResults = await ciIntegration.evaluateQualityGates(gates, mockTestResult);
      const overallPassed = ciIntegration.shouldPassQualityGates(gateResults);

      expect(gateResults[0].passed).toBe(false);
      expect(overallPassed).toBe(true); // Should pass because gate is optional
    });
  });

  describe('Performance Testing Integration', () => {
    test('should run performance tests', async () => {
      mockChildProcess.exec.mockImplementation((command, options, callback) => {
        if (command.includes('test:performance')) {
          const mockResults = JSON.stringify({
            duration: 15000,
            memoryUsage: 120 * 1024 * 1024,
            cpuUsage: 65,
            regressionPercent: 8
          });
          callback(null, { stdout: mockResults, stderr: '' });
        } else {
          callback(null, { stdout: 'success', stderr: '' });
        }
      });

      const context: PipelineContext = {
        commit: 'perf123',
        branch: 'main',
        author: 'testuser',
        message: 'Performance test',
        timestamp: new Date(),
        environment: 'test'
      };

      const result = await ciIntegration.runPerformanceTests(context);

      expect(result.success).toBe(true);
      expect(result.metrics.duration).toBe(15000);
      expect(result.metrics.regressionPercent).toBe(8);
    });

    test('should compare with baseline performance', async () => {
      const baseline = {
        duration: 12000,
        memoryUsage: 100 * 1024 * 1024,
        cpuUsage: 50
      };

      const current = {
        duration: 15000,
        memoryUsage: 130 * 1024 * 1024,
        cpuUsage: 65
      };

      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(baseline));

      const comparison = await ciIntegration.compareWithBaseline(current, 'performance-baseline.json');

      expect(comparison.hasRegression).toBe(true);
      expect(comparison.regressionPercent).toBeGreaterThan(0);
      expect(comparison.details.duration.change).toBe(25); // 25% increase
    });

    test('should handle missing baseline gracefully', async () => {
      mockFs.readFile.mockRejectedValueOnce(new Error('File not found'));

      const current = {
        duration: 15000,
        memoryUsage: 130 * 1024 * 1024,
        cpuUsage: 65
      };

      const comparison = await ciIntegration.compareWithBaseline(current, 'missing-baseline.json');

      expect(comparison.hasRegression).toBe(false);
      expect(comparison.baselineExists).toBe(false);
    });
  });

  describe('Deployment Integration', () => {
    test('should execute deployment stages', async () => {
      mockChildProcess.exec.mockImplementation((command, options, callback) => {
        callback(null, { stdout: 'deployment success', stderr: '' });
      });

      const deploymentConfig: DeploymentConfig = {
        strategy: 'blue-green',
        environments: ['staging', 'production'],
        healthChecks: ['http://localhost:3000/health'],
        rollbackOnFailure: true,
        approvalRequired: true
      };

      const context: PipelineContext = {
        commit: 'deploy123',
        branch: 'main',
        author: 'testuser',
        message: 'Deploy to production',
        timestamp: new Date(),
        environment: 'production'
      };

      const result = await ciIntegration.executeDeployment(deploymentConfig, context);

      expect(result.success).toBe(true);
      expect(result.strategy).toBe('blue-green');
      expect(result.environments).toContain('staging');
      expect(result.environments).toContain('production');
    });

    test('should handle deployment failures with rollback', async () => {
      let callCount = 0;
      mockChildProcess.exec.mockImplementation((command, options, callback) => {
        callCount++;
        if (callCount === 1) {
          // First call (deployment) fails
          callback(new Error('Deployment failed'), { stdout: '', stderr: 'Deploy error' });
        } else {
          // Second call (rollback) succeeds
          callback(null, { stdout: 'rollback success', stderr: '' });
        }
      });

      const deploymentConfig: DeploymentConfig = {
        strategy: 'rolling',
        environments: ['production'],
        healthChecks: ['http://localhost:3000/health'],
        rollbackOnFailure: true,
        approvalRequired: false
      };

      const context: PipelineContext = {
        commit: 'fail123',
        branch: 'main',
        author: 'testuser',
        message: 'Failed deployment',
        timestamp: new Date(),
        environment: 'production'
      };

      const result = await ciIntegration.executeDeployment(deploymentConfig, context);

      expect(result.success).toBe(false);
      expect(result.rolledBack).toBe(true);
      expect(callCount).toBe(2); // Deploy + rollback
    });

    test('should perform health checks after deployment', async () => {
      mockChildProcess.exec.mockImplementation((command, options, callback) => {
        callback(null, { stdout: 'success', stderr: '' });
      });

      // Mock HTTP request for health check
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ status: 'healthy' })
      });

      const deploymentConfig: DeploymentConfig = {
        strategy: 'canary',
        environments: ['production'],
        healthChecks: ['http://localhost:3000/health', 'http://localhost:3000/ready'],
        rollbackOnFailure: true,
        approvalRequired: false
      };

      const context: PipelineContext = {
        commit: 'health123',
        branch: 'main',
        author: 'testuser',
        message: 'Health check test',
        timestamp: new Date(),
        environment: 'production'
      };

      const result = await ciIntegration.executeDeployment(deploymentConfig, context);

      expect(result.success).toBe(true);
      expect(result.healthChecks).toHaveLength(2);
      expect(result.healthChecks[0].passed).toBe(true);
      expect(result.healthChecks[1].passed).toBe(true);
    });
  });

  describe('Security Integration', () => {
    test('should run security scans', async () => {
      mockChildProcess.exec.mockImplementation((command, options, callback) => {
        if (command.includes('audit')) {
          const mockResults = JSON.stringify({
            vulnerabilities: {
              high: 0,
              medium: 2,
              low: 5
            },
            dependencies: 150
          });
          callback(null, { stdout: mockResults, stderr: '' });
        } else {
          callback(null, { stdout: 'scan complete', stderr: '' });
        }
      });

      const securityResult = await ciIntegration.runSecurityScan();

      expect(securityResult.success).toBe(true);
      expect(securityResult.vulnerabilities.high).toBe(0);
      expect(securityResult.vulnerabilities.medium).toBe(2);
      expect(securityResult.vulnerabilities.low).toBe(5);
    });

    test('should fail on critical security issues', async () => {
      mockChildProcess.exec.mockImplementation((command, options, callback) => {
        const mockResults = JSON.stringify({
          vulnerabilities: {
            critical: 1,
            high: 3,
            medium: 5,
            low: 10
          },
          dependencies: 200
        });
        callback(null, { stdout: mockResults, stderr: '' });
      });

      const securityResult = await ciIntegration.runSecurityScan();

      expect(securityResult.success).toBe(false);
      expect(securityResult.blockers).toContain('critical vulnerabilities');
    });
  });

  describe('Notification System', () => {
    test('should send success notifications', async () => {
      const mockNotificationSender = jest.fn().mockResolvedValue(true);
      (ciIntegration as any).sendNotification = mockNotificationSender;

      const context: PipelineContext = {
        commit: 'success123',
        branch: 'main',
        author: 'testuser',
        message: 'Successful build',
        timestamp: new Date(),
        environment: 'production'
      };

      const result = {
        success: true,
        stages: [],
        duration: 300000,
        commit: 'success123'
      };

      await ciIntegration.sendPipelineNotifications(context, result);

      expect(mockNotificationSender).toHaveBeenCalledWith(
        'onSuccess',
        expect.objectContaining({
          type: 'success',
          message: expect.stringContaining('Pipeline completed successfully')
        })
      );
    });

    test('should send failure notifications', async () => {
      const mockNotificationSender = jest.fn().mockResolvedValue(true);
      (ciIntegration as any).sendNotification = mockNotificationSender;

      const context: PipelineContext = {
        commit: 'fail123',
        branch: 'feature-branch',
        author: 'developer',
        message: 'Failed build',
        timestamp: new Date(),
        environment: 'development'
      };

      const result = {
        success: false,
        stages: [{
          name: 'test',
          success: false,
          error: 'Tests failed'
        }],
        duration: 180000,
        commit: 'fail123'
      };

      await ciIntegration.sendPipelineNotifications(context, result);

      expect(mockNotificationSender).toHaveBeenCalledWith(
        'onFailure',
        expect.objectContaining({
          type: 'failure',
          message: expect.stringContaining('Pipeline failed')
        })
      );
    });

    test('should handle notification failures gracefully', async () => {
      const mockNotificationSender = jest.fn().mockRejectedValue(new Error('Notification failed'));
      (ciIntegration as any).sendNotification = mockNotificationSender;

      const context: PipelineContext = {
        commit: 'notify123',
        branch: 'main',
        author: 'testuser',
        message: 'Notification test',
        timestamp: new Date(),
        environment: 'production'
      };

      const result = {
        success: true,
        stages: [],
        duration: 300000,
        commit: 'notify123'
      };

      // Should not throw error
      await expect(ciIntegration.sendPipelineNotifications(context, result)).resolves.not.toThrow();
    });
  });

  describe('Provider-Specific Integration', () => {
    test('should generate GitHub Actions workflow', () => {
      const workflow = ciIntegration.generateWorkflow('github-actions');

      expect(workflow).toContain('name:');
      expect(workflow).toContain('on:');
      expect(workflow).toContain('jobs:');
      expect(workflow).toContain('runs-on: ubuntu-latest');
      expect(workflow).toContain('npm ci');
      expect(workflow).toContain('npm run build');
      expect(workflow).toContain('npm run test');
    });

    test('should generate GitLab CI configuration', () => {
      const gitlabConfig = { ...mockConfig, provider: 'gitlab-ci' as CIProvider };
      const gitlabCI = new CIIntegration(gitlabConfig);

      const workflow = gitlabCI.generateWorkflow('gitlab-ci');

      expect(workflow).toContain('stages:');
      expect(workflow).toContain('build:');
      expect(workflow).toContain('test:');
      expect(workflow).toContain('script:');
    });

    test('should generate Jenkins pipeline', () => {
      const jenkinsConfig = { ...mockConfig, provider: 'jenkins' as CIProvider };
      const jenkinsCI = new CIIntegration(jenkinsConfig);

      const workflow = jenkinsCI.generateWorkflow('jenkins');

      expect(workflow).toContain('pipeline');
      expect(workflow).toContain('agent');
      expect(workflow).toContain('stages');
      expect(workflow).toContain('steps');
    });
  });

  describe('Performance and Optimization', () => {
    test('should handle large pipelines efficiently', async () => {
      const largeConfig = {
        ...mockConfig,
        pipeline: {
          ...mockConfig.pipeline,
          stages: Array.from({ length: 50 }, (_, i) => ({
            name: `stage-${i}`,
            type: 'test' as const,
            commands: [`echo "Stage ${i}"`],
            timeout: 60000
          }))
        }
      };

      const largeCI = new CIIntegration(largeConfig);

      mockChildProcess.exec.mockImplementation((command, options, callback) => {
        callback(null, { stdout: 'success', stderr: '' });
      });

      const context: PipelineContext = {
        commit: 'large123',
        branch: 'main',
        author: 'testuser',
        message: 'Large pipeline test',
        timestamp: new Date(),
        environment: 'test'
      };

      const startTime = Date.now();
      const result = await largeCI.executePipeline(context);
      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(result.stages).toHaveLength(50);
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
    });

    test('should cache build dependencies', async () => {
      const cacheKey = ciIntegration.generateCacheKey({
        files: ['package.json', 'package-lock.json'],
        branch: 'main',
        nodeVersion: '18.x'
      });

      expect(cacheKey).toBeDefined();
      expect(typeof cacheKey).toBe('string');
      expect(cacheKey.length).toBeGreaterThan(10);
    });
  });

  describe('Error Handling and Recovery', () => {
    test('should recover from transient failures', async () => {
      let callCount = 0;
      mockChildProcess.exec.mockImplementation((command, options, callback) => {
        callCount++;
        if (callCount <= 2) {
          callback(new Error('Transient error'), { stdout: '', stderr: 'Network error' });
        } else {
          callback(null, { stdout: 'success', stderr: '' });
        }
      });

      const resilientConfig = {
        ...mockConfig,
        pipeline: {
          ...mockConfig.pipeline,
          stages: [{
            name: 'resilient-stage',
            type: 'build' as const,
            commands: ['npm install'],
            timeout: 300000,
            retries: 3
          }]
        }
      };

      const resilientCI = new CIIntegration(resilientConfig);

      const context: PipelineContext = {
        commit: 'resilient123',
        branch: 'main',
        author: 'testuser',
        message: 'Resilient test',
        timestamp: new Date(),
        environment: 'test'
      };

      const result = await resilientCI.executePipeline(context);

      expect(result.success).toBe(true);
      expect(callCount).toBe(3); // Failed twice, succeeded on third try
    });

    test('should handle configuration errors gracefully', () => {
      const invalidConfig = {
        ...mockConfig,
        pipeline: {
          ...mockConfig.pipeline,
          stages: [] // Empty stages
        }
      };

      expect(() => new CIIntegration(invalidConfig)).toThrow('Pipeline must have at least one stage');
    });
  });
});