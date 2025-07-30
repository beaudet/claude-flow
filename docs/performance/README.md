# Performance Regression Testing and Bundle Size Monitoring System

A comprehensive performance monitoring solution for the claude-flow project that provides continuous performance monitoring, automated alerts, and CI/CD integration.

## 🚀 Features

### Core Performance Testing
- **Automated Performance Benchmarks** - Comprehensive benchmarking for key system components
- **Memory Usage Monitoring** - Real-time memory monitoring with leak detection
- **Response Time Tracking** - API endpoints and CLI command performance tracking
- **Throughput Testing** - High-concurrency scenario testing
- **Baseline Comparison** - Performance regression detection with configurable thresholds

### Bundle Size Monitoring
- **JavaScript Bundle Analysis** - Track bundle sizes across builds
- **Dependency Size Monitoring** - Monitor dependency size changes
- **Tree-shaking Analysis** - Effectiveness analysis and optimization recommendations
- **Code Splitting Tracking** - Optimization tracking for better performance
- **Asset Optimization** - Monitor images, fonts, and other assets

### Automated Alert System
- **Configurable Thresholds** - Performance regression limits with percentage thresholds
- **Multi-channel Notifications** - Slack, email, webhook, file, and console alerts
- **Memory Leak Detection** - Automated reporting with trend analysis
- **Historical Trend Analysis** - Performance trends and forecasting
- **Escalation Rules** - Automatic escalation based on severity and time

### CI/CD Integration
- **GitHub Actions Workflows** - Automated performance testing in CI/CD
- **Multi-Provider Support** - GitHub, GitLab, Jenkins, Azure DevOps
- **Performance Gates** - Build-blocking gates for critical performance issues
- **Pull Request Reports** - Automated performance impact analysis
- **Security Integration** - Integration with existing security and testing systems

### Performance Dashboard
- **Real-time Visualization** - Live performance metrics with charts
- **Historical Performance Trends** - Long-term performance analysis
- **Bundle Evolution Tracking** - Bundle size changes over time
- **Alert Management** - View and manage active performance alerts
- **Cross-environment Comparison** - Compare performance across environments

### Enterprise Features
- **Multi-environment Monitoring** - Development, staging, production monitoring
- **SLA Monitoring** - Performance SLA compliance tracking
- **Custom Metrics and KPIs** - Business-specific performance indicators
- **Integration with Monitoring Infrastructure** - Existing monitoring system integration
- **Performance Budgets** - Budget enforcement and compliance reporting

## 📦 Installation

```bash
# Install dependencies
npm install

# Build the project
npm run build
```

## 🔧 Quick Start

### Basic Performance Testing

```typescript
import { PerformanceMonitoringSystem } from './src/performance';

// Initialize the performance monitoring system
const monitor = new PerformanceMonitoringSystem({
  thresholds: {
    memoryUsage: 500 * 1024 * 1024, // 500MB
    cpuUsage: 80, // 80%
    responseTime: 5000, // 5 seconds
    bundleSize: 10 * 1024 * 1024, // 10MB
    regressionPercent: 10 // 10%
  },
  dashboard: {
    enabled: true,
    port: 3001,
    host: 'localhost'
  }
});

// Start monitoring
await monitor.start();

// Register a performance test
monitor.registerTest({
  id: 'api-response-time',
  name: 'API Response Time Test',
  description: 'Test API endpoint response times',
  category: 'api',
  priority: 'high',
  timeout: 30000,
  execute: async () => {
    const start = Date.now();
    // Your test logic here
    const response = await fetch('/api/test');
    return {
      timestamp: start,
      duration: Date.now() - start,
      memoryUsage: process.memoryUsage(),
      // ... other metrics
    };
  }
});

// Run all tests
const results = await monitor.runTests();
console.log('Performance test results:', results);
```

### Bundle Analysis

```typescript
import { BundleAnalyzer } from './src/performance/bundle/BundleAnalyzer';

const analyzer = new BundleAnalyzer({
  entryPoints: ['src/index.ts', 'src/cli/main.ts'],
  outputDir: 'dist',
  thresholds: {
    totalSize: 10 * 1024 * 1024, // 10MB
    gzippedSize: 3 * 1024 * 1024, // 3MB
    chunkSize: 500 * 1024 // 500KB
  }
});

// Analyze current bundle
const analysis = await analyzer.analyzeBundles();
console.log('Bundle analysis:', analysis);

// Compare with previous version
const comparison = await analyzer.compareWithVersion('1.0.0', 'main');
console.log('Bundle comparison:', comparison);

// Generate report
const report = await analyzer.generateReport('html');
console.log('HTML report generated');
```

### Memory Leak Detection

```typescript
import { MemoryLeakDetector } from './src/performance/memory/MemoryLeakDetector';

const detector = new MemoryLeakDetector();

// Start continuous monitoring
detector.startMonitoring(5000); // 5 second intervals

// Detect leaks after some time
setTimeout(async () => {
  const report = await detector.detectLeaks();
  
  if (report.leaks.length > 0) {
    console.log('Memory leaks detected:', report.leaks);
    console.log('Recommendations:', report.recommendations);
  }
}, 60000); // After 1 minute
```

## 🏗️ CI/CD Integration

### GitHub Actions

The system includes a comprehensive GitHub Actions workflow for automated performance testing:

```yaml
# .github/workflows/performance-testing.yml
name: Performance Testing and Regression Detection

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main, develop ]
  schedule:
    - cron: '0 2 * * *' # Daily at 2 AM UTC

jobs:
  performance-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Run Performance Tests
        run: |
          npm ci
          npm run build
          npm run test:performance
```

### Manual Testing

```bash
# Run all performance tests
npm run test:performance

# Run specific test suite
npm run test:performance -- --suite=memory

# Generate detailed report
npm run test:performance -- --format=html --include-details=true

# Compare with baseline
npm run test:performance -- --baseline=baseline-results.json
```

### Using the CLI Script

```bash
# Run performance tests with the CLI script
./scripts/performance-test.js --suite=all --output=results.json --verbose

# Available options:
# --suite: startup|runtime|memory|bundle|api|integration|all
# --output: Output file path
# --baseline: Baseline file for comparison
# --format: json|html|junit
# --include-details: Include detailed test information
# --memory-limit: Memory limit in bytes
# --timeout: Test timeout in milliseconds
# --verbose: Verbose output
```

## 📊 Dashboard

The performance dashboard provides real-time visualization of performance metrics:

- **URL**: http://localhost:3001 (configurable)
- **Features**:
  - Real-time performance metrics
  - Historical trends and charts
  - Active alerts and notifications
  - Bundle analysis visualization
  - Memory usage tracking
  - Cross-environment comparison

### Dashboard Configuration

```typescript
const dashboard = new PerformanceDashboard({
  port: 3001,
  host: 'localhost',
  enableAuth: true,
  authToken: 'your-secret-token',
  enableRealtime: true,
  updateInterval: 5000,
  retentionPeriod: 86400000 // 24 hours
});

await dashboard.start();
```

## 🚨 Alert Configuration

### Basic Alert Setup

```typescript
import { AlertSystem } from './src/performance/alerts/AlertSystem';

const alerts = new AlertSystem({
  alerts: {
    enabled: true,
    channels: [
      {
        type: 'slack',
        config: {
          webhookUrl: 'https://hooks.slack.com/...',
          channel: '#performance-alerts'
        },
        enabled: true
      },
      {
        type: 'email',
        config: {
          recipients: ['team@company.com'],
          smtp: {
            host: 'smtp.company.com',
            port: 587,
            secure: false,
            auth: {
              user: 'alerts@company.com',
              pass: 'password'
            }
          }
        },
        enabled: true
      }
    ]
  }
});

// Register custom alert rule
alerts.registerRule({
  id: 'high-memory-usage',
  name: 'High Memory Usage',
  description: 'Alert when memory usage exceeds threshold',
  enabled: true,
  conditions: [{
    metric: 'memoryUsage.heapUsed',
    operator: 'gt',
    value: 500 * 1024 * 1024, // 500MB
    duration: 30000 // 30 seconds
  }],
  actions: [{
    type: 'slack',
    config: {},
    enabled: true,
    condition: 'always'
  }],
  severity: 'warning',
  cooldownMs: 300000 // 5 minutes
});
```

## 🏢 Enterprise Features

### Multi-Environment Monitoring

```typescript
import { MultiEnvironmentMonitor } from './src/performance/enterprise/MultiEnvironmentMonitor';

const monitor = new MultiEnvironmentMonitor();

// Register environments
await monitor.registerEnvironment({
  name: 'production',
  type: 'production',
  endpoint: 'https://api.production.com',
  monitoring: {
    enabled: true,
    interval: 30000, // 30 seconds
    retentionDays: 30,
    metrics: ['responseTime', 'memoryUsage', 'cpuUsage']
  },
  sla: {
    availability: { target: 99.9, measurement: 'uptime' },
    performance: {
      responseTime: { p50: 200, p95: 500, p99: 1000 },
      throughput: { min: 100 },
      errorRate: { max: 0.1 }
    },
    resources: {
      memory: { max: 1024 * 1024 * 1024, sustained: 800 * 1024 * 1024 },
      cpu: { max: 80, sustained: 60 }
    }
  }
});

// Start monitoring all environments
await monitor.startMonitoring();

// Compare environments
const comparison = await monitor.compareEnvironments(['staging', 'production']);
console.log('Environment comparison:', comparison);

// Get SLA compliance report
const compliance = await monitor.getSLAComplianceReport('production');
console.log('SLA compliance:', compliance);
```

## 🔧 Configuration

### Performance Configuration

```typescript
interface PerformanceConfig {
  enabled: boolean;
  baseline: {
    autoUpdate: boolean;
    retentionDays: number;
    comparisonWindow: number;
  };
  thresholds: {
    memoryUsage: number;    // bytes
    cpuUsage: number;       // percentage
    responseTime: number;   // milliseconds
    bundleSize: number;     // bytes
    regressionPercent: number; // percentage
  };
  alerts: {
    enabled: boolean;
    channels: AlertChannel[];
    debounceMs: number;
    aggregationWindow: number;
  };
  monitoring: {
    interval: number;       // milliseconds
    retentionDays: number;
    batchSize: number;
    enableProfiling: boolean;
  };
  bundleAnalysis: {
    enabled: boolean;
    trackDependencies: boolean;
    analyzeTreeshaking: boolean;
    findDuplicates: boolean;
    detectUnusedCode: boolean;
  };
}
```

### Alert Channels

```typescript
// Slack
{
  type: 'slack',
  config: {
    webhookUrl: 'https://hooks.slack.com/services/...',
    channel: '#alerts',
    username: 'Performance Bot',
    iconEmoji: ':warning:'
  },
  enabled: true
}

// Email
{
  type: 'email',
  config: {
    recipients: ['team@company.com'],
    subject: 'Performance Alert',
    smtp: {
      host: 'smtp.company.com',
      port: 587,
      secure: false,
      auth: { user: 'alerts@company.com', pass: 'password' }
    }
  },
  enabled: true
}

// Webhook
{
  type: 'webhook',
  config: {
    url: 'https://api.company.com/alerts',
    method: 'POST',
    headers: { 'Authorization': 'Bearer token' }
  },
  enabled: true
}

// File
{
  type: 'file',
  config: {
    path: '/var/log/performance-alerts.log',
    format: 'json'
  },
  enabled: true
}
```

## 📈 Performance Metrics

### Collected Metrics

The system automatically collects the following metrics:

#### System Metrics
- **Memory Usage**: Heap used, heap total, RSS, external memory
- **CPU Usage**: User time, system time, utilization percentage
- **Network I/O**: Bytes in/out, packets in/out, active connections
- **Disk I/O**: Bytes read/written, operations, queue length

#### Application Metrics
- **Response Times**: API endpoint response times, percentiles (p50, p95, p99)
- **Throughput**: Requests per second, operations per second
- **Error Rates**: HTTP errors, application errors, timeout rates
- **Bundle Metrics**: Total size, gzipped size, module count, dependency count

#### Custom Metrics
- **Business Metrics**: Custom KPIs and business-specific measurements
- **Feature Metrics**: Feature-specific performance measurements
- **User Experience**: Page load times, interaction latencies

### Metric Storage and Retention

- **Time-series Database**: Efficient storage of historical performance data
- **Configurable Retention**: Automatic cleanup of old data based on configured retention periods
- **Data Aggregation**: Automatic aggregation of high-frequency data for long-term storage
- **Export Capabilities**: Export metrics for external analysis and reporting

## 🧪 Testing

### Running Tests

```bash
# Run all performance tests
npm run test:performance

# Run specific test categories
npm run test:performance -- --suite=memory
npm run test:performance -- --suite=bundle
npm run test:performance -- --suite=api

# Run with baseline comparison
npm run test:performance -- --baseline=baseline.json

# Generate detailed reports
npm run test:performance -- --format=html --include-details=true
```

### Creating Custom Tests

```typescript
import { PerformanceTest } from './src/performance/types';

const customTest: PerformanceTest = {
  id: 'custom-api-test',
  name: 'Custom API Performance Test',
  description: 'Test custom API endpoint performance',
  category: 'api',
  priority: 'high',
  timeout: 30000,
  warmupIterations: 3,
  testIterations: 10,
  
  setup: async () => {
    // Setup test environment
    console.log('Setting up custom test...');
  },
  
  execute: async () => {
    const startTime = Date.now();
    const startMemory = process.memoryUsage();
    
    // Your test logic here
    const response = await performCustomOperation();
    
    const endTime = Date.now();
    const endMemory = process.memoryUsage();
    
    return {
      timestamp: startTime,
      duration: endTime - startTime,
      memoryUsage: {
        heapUsed: endMemory.heapUsed,
        heapTotal: endMemory.heapTotal,
        external: endMemory.external,
        rss: endMemory.rss,
        arrayBuffers: endMemory.arrayBuffers
      },
      cpuUsage: process.cpuUsage(),
      networkIO: { bytesIn: 0, bytesOut: 0, packetsIn: 0, packetsOut: 0, connectionsActive: 0 },
      diskIO: { bytesRead: 0, bytesWritten: 0, operationsRead: 0, operationsWrite: 0, queueLength: 0 }
    };
  },
  
  teardown: async () => {
    // Cleanup after test
    console.log('Cleaning up custom test...');
  },
  
  validate: (metrics, baseline) => {
    const issues = [];
    const recommendations = [];
    
    // Custom validation logic
    if (metrics.duration > 5000) {
      issues.push({
        type: 'slow_operation',
        severity: 'warning',
        message: 'Operation took longer than expected',
        metric: 'duration',
        current: metrics.duration,
        impact: 'medium'
      });
    }
    
    if (baseline && metrics.duration > baseline.duration * 1.1) {
      issues.push({
        type: 'regression',
        severity: 'error',
        message: 'Performance regression detected',
        metric: 'duration',
        current: metrics.duration,
        baseline: baseline.duration,
        impact: 'high'
      });
      recommendations.push('Investigate recent changes that might cause performance degradation');
    }
    
    return {
      passed: issues.filter(i => i.severity === 'error').length === 0,
      score: Math.max(0, 100 - issues.length * 10),
      issues,
      recommendations
    };
  }
};

// Register the custom test
monitor.registerTest(customTest);
```

## 🔍 Troubleshooting

### Common Issues

#### High Memory Usage
```bash
# Check memory usage patterns
npm run test:performance -- --suite=memory --verbose

# Generate memory leak report
node -e "
const { MemoryLeakDetector } = require('./dist/performance/memory/MemoryLeakDetector');
const detector = new MemoryLeakDetector();
detector.startMonitoring(1000);
setTimeout(async () => {
  const report = await detector.detectLeaks();
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}, 30000);
"
```

#### Bundle Size Issues
```bash
# Analyze bundle composition
npm run test:performance -- --suite=bundle --verbose

# Generate bundle analysis report
node -e "
const { BundleAnalyzer } = require('./dist/performance/bundle/BundleAnalyzer');
const analyzer = new BundleAnalyzer();
analyzer.analyzeBundles().then(result => {
  console.log('Bundle analysis:', result);
  process.exit(0);
});
"
```

#### Performance Regressions
```bash
# Compare with baseline
npm run test:performance -- --baseline=previous-results.json --verbose

# Run regression analysis
node -e "
const { RegressionTestFramework } = require('./dist/performance/regression/RegressionTestFramework');
const framework = new RegressionTestFramework();
framework.detectRegressions(7, 0.05).then(regressions => {
  console.log('Detected regressions:', regressions);
  process.exit(0);
});
"
```

### Debug Mode

Enable debug mode for detailed logging:

```bash
# Set debug environment variable
DEBUG=performance:* npm run test:performance

# Or use verbose flag
npm run test:performance -- --verbose
```

### Log Analysis

Performance logs are stored in:
- `logs/performance.log` - General performance logs
- `logs/alerts.log` - Alert system logs
- `logs/memory.log` - Memory monitoring logs
- `logs/bundle.log` - Bundle analysis logs

## 📚 API Reference

### PerformanceMonitoringSystem

Main class for orchestrating performance monitoring:

```typescript
class PerformanceMonitoringSystem {
  constructor(config: Partial<PerformanceSystemConfig>)
  
  // Start/stop monitoring
  async start(): Promise<void>
  async stop(): Promise<void>
  
  // Test management
  registerTest(test: PerformanceTest): void
  async runTests(): Promise<TestResults>
  
  // Status and reporting
  async getStatus(): Promise<PerformanceSystemStatus>
  async generateReport(format?: 'json' | 'html' | 'markdown'): Promise<string>
  
  // Baseline management
  async createBaseline(name: string, version: string, tags?: string[]): Promise<void>
  
  // CI/CD integration
  async executeCIPipeline(): Promise<CIPipelineResult>
}
```

### BundleAnalyzer

Bundle size analysis and monitoring:

```typescript
class BundleAnalyzer {
  constructor(config?: Partial<BundleConfiguration>, performanceConfig?: PerformanceConfig)
  
  // Analysis methods
  async analyzeBundles(options?: BundleAnalysisOptions): Promise<BundleAnalysisResult>
  async compareWithVersion(version: string, gitRef?: string): Promise<BundleChange[]>
  async startMonitoring(intervalMs?: number): Promise<void>
  
  // Reporting
  async generateReport(format?: 'json' | 'html' | 'markdown'): Promise<string>
}
```

### MemoryLeakDetector

Memory monitoring and leak detection:

```typescript
class MemoryLeakDetector {
  constructor(config?: Partial<PerformanceConfig>)
  
  // Monitoring
  startMonitoring(intervalMs?: number): void
  stopMonitoring(): void
  async takeSnapshot(): Promise<MemorySnapshot>
  
  // Analysis
  async detectLeaks(): Promise<MemoryLeakReport>
  analyzeTrends(windowSize?: number): MemoryTrend[]
  
  // Profiling
  async startProfiling(options?: MemoryProfileOptions): Promise<string>
  async stopProfiling(sessionId: string): Promise<ProfilingResults | null>
}
```

### AlertSystem

Alert management and notifications:

```typescript
class AlertSystem {
  constructor(config?: Partial<PerformanceConfig>)
  
  // Rule management
  registerRule(rule: AlertRule): void
  unregisterRule(ruleId: string): boolean
  
  // Channel management
  registerChannel(channel: AlertChannel): void
  
  // Alert processing
  async processMetrics(metrics: PerformanceMetrics, baseline?: PerformanceBaseline): Promise<PerformanceAlert[]>
  
  // Alert management
  async acknowledgeAlert(alertId: string, user: string, note?: string): Promise<boolean>
  async resolveAlert(alertId: string, reason?: string): Promise<boolean>
  
  // Status
  getAlertSummary(): AlertSummary
  getActiveAlerts(): AlertHistory[]
  getAlertHistory(limit?: number): AlertHistory[]
}
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/performance-enhancement`
3. Add tests for your changes
4. Run the performance test suite: `npm run test:performance`
5. Commit your changes: `git commit -am 'Add performance enhancement'`
6. Push to the branch: `git push origin feature/performance-enhancement`
7. Create a Pull Request

### Development Setup

```bash
# Clone the repository
git clone https://github.com/ruvnet/claude-code-flow.git
cd claude-code-flow

# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Run performance tests
npm run test:performance

# Start development dashboard
npm run dev:dashboard
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Documentation**: [Performance Monitoring Guide](./docs/performance/)
- **Issues**: [GitHub Issues](https://github.com/ruvnet/claude-code-flow/issues)
- **Discussions**: [GitHub Discussions](https://github.com/ruvnet/claude-code-flow/discussions)
- **Wiki**: [Performance Best Practices](https://github.com/ruvnet/claude-code-flow/wiki)

## 🔮 Roadmap

### Upcoming Features

- **Machine Learning Predictions** - Predictive performance analysis using ML models
- **Distributed Tracing** - End-to-end request tracing across services
- **Advanced Visualization** - Interactive performance dashboards with drill-down capabilities
- **Performance Budget Automation** - Automatic performance budget enforcement
- **Cloud Provider Integration** - Native integration with AWS CloudWatch, Google Cloud Monitoring, Azure Monitor
- **Performance Testing as Code** - Infrastructure as code for performance testing
- **Real User Monitoring (RUM)** - Client-side performance monitoring
- **Synthetic Transaction Monitoring** - Automated user journey performance testing

### Version History

- **v2.0.0** - Complete performance monitoring system with enterprise features
- **v1.5.0** - Bundle analysis and CI/CD integration
- **v1.0.0** - Basic performance benchmarking and alerting

---

Built with ❤️ by the Claude Flow team. Performance monitoring made simple, powerful, and enterprise-ready.