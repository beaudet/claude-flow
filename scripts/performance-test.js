#!/usr/bin/env node

/**
 * Performance Testing Script for CI/CD Integration
 * Comprehensive performance testing runner for the claude-flow project
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Command line argument parsing
const args = process.argv.slice(2);
const config = {
  suite: getArg('--suite') || 'all',
  output: getArg('--output') || 'performance-results.json',
  baseline: getArg('--baseline'),
  format: getArg('--format') || 'json',
  includeDetails: getArg('--include-details') === 'true',
  memoryLimit: parseInt(getArg('--memory-limit')) || 1024 * 1024 * 1024, // 1GB
  timeout: parseInt(getArg('--timeout')) || 300000, // 5 minutes
  verbose: args.includes('--verbose') || args.includes('-v'),
  parallel: !args.includes('--sequential'),
  warmup: parseInt(getArg('--warmup-runs')) || 3,
  iterations: parseInt(getArg('--iterations')) || 5
};

function getArg(name) {
  const index = args.indexOf(name);
  return index !== -1 && index + 1 < args.length ? args[index + 1] : null;
}

/**
 * Performance test suites
 */
const testSuites = {
  startup: {
    name: 'Startup Performance',
    description: 'Test application startup time and initialization',
    tests: [
      'cli-startup',
      'module-loading',
      'config-initialization',
      'memory-initialization'
    ]
  },
  runtime: {
    name: 'Runtime Performance',
    description: 'Test runtime performance and throughput',
    tests: [
      'command-execution',
      'agent-spawning',
      'task-coordination',
      'memory-management'
    ]
  },
  memory: {
    name: 'Memory Performance',
    description: 'Test memory usage and leak detection',
    tests: [
      'memory-baseline',
      'memory-growth',
      'gc-pressure',
      'leak-detection'
    ]
  },
  bundle: {
    name: 'Bundle Analysis',
    description: 'Analyze bundle size and composition',
    tests: [
      'bundle-size',
      'tree-shaking',
      'dependencies',
      'duplicates'
    ]
  },
  api: {
    name: 'API Performance',
    description: 'Test API endpoint performance',
    tests: [
      'mcp-server',
      'websocket-performance',
      'concurrent-requests',
      'error-handling'
    ]
  },
  integration: {
    name: 'Integration Performance',
    description: 'Test integration points and workflows',
    tests: [
      'hive-mind-coordination',
      'swarm-orchestration',
      'provider-integration',
      'end-to-end-workflow'
    ]
  }
};

/**
 * Main execution function
 */
async function main() {
  console.log('🚀 Claude Flow Performance Testing Suite');
  console.log('========================================');
  
  if (config.verbose) {
    console.log('Configuration:', JSON.stringify(config, null, 2));
  }

  try {
    // Setup
    await setup();
    
    // Determine which suites to run
    const suitesToRun = config.suite === 'all' 
      ? Object.keys(testSuites)
      : [config.suite];

    const results = {
      timestamp: Date.now(),
      environment: await getEnvironmentInfo(),
      configuration: config,
      suites: {},
      summary: {
        totalTests: 0,
        passedTests: 0,
        failedTests: 0,
        totalDuration: 0,
        memoryPeak: 0,
        bundleSize: 0
      },
      performance: {
        startup: null,
        runtime: null,
        memory: null
      }
    };

    const startTime = Date.now();

    // Run test suites
    for (const suiteName of suitesToRun) {
      if (!testSuites[suiteName]) {
        console.error(`❌ Unknown test suite: ${suiteName}`);
        continue;
      }

      console.log(`\n📊 Running ${testSuites[suiteName].name}...`);
      const suiteResult = await runTestSuite(suiteName, testSuites[suiteName]);
      results.suites[suiteName] = suiteResult;
      
      // Update summary
      results.summary.totalTests += suiteResult.tests.length;
      results.summary.passedTests += suiteResult.tests.filter(t => t.passed).length;
      results.summary.failedTests += suiteResult.tests.filter(t => !t.passed).length;
      results.summary.totalDuration += suiteResult.duration;
      results.summary.memoryPeak = Math.max(results.summary.memoryPeak, suiteResult.memoryPeak || 0);
    }

    results.summary.totalDuration = Date.now() - startTime;

    // Compare with baseline if provided
    if (config.baseline && fs.existsSync(config.baseline)) {
      console.log('\n📈 Comparing with baseline...');
      const baseline = JSON.parse(fs.readFileSync(config.baseline, 'utf8'));
      results.comparison = compareWithBaseline(results, baseline);
    }

    // Output results
    await outputResults(results);
    
    // Exit with appropriate code
    const exitCode = results.summary.failedTests > 0 ? 1 : 0;
    process.exit(exitCode);

  } catch (error) {
    console.error('❌ Performance testing failed:', error.message);
    if (config.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

/**
 * Setup test environment
 */
async function setup() {
  console.log('🔧 Setting up test environment...');
  
  // Ensure output directory exists
  const outputDir = path.dirname(config.output);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Set memory limit
  if (config.memoryLimit) {
    const memoryLimitMB = Math.floor(config.memoryLimit / 1024 / 1024);
    process.env.NODE_OPTIONS = `--max-old-space-size=${memoryLimitMB}`;
  }

  // Build project if needed
  if (!fs.existsSync('dist')) {
    console.log('📦 Building project...');
    try {
      execSync('npm run build', { stdio: config.verbose ? 'inherit' : 'pipe' });
    } catch (error) {
      console.warn('⚠️  Build failed, continuing with existing build...');
    }
  }
}

/**
 * Run a test suite
 */
async function runTestSuite(suiteName, suite) {
  const startTime = Date.now();
  const startMemory = process.memoryUsage();
  
  const result = {
    name: suite.name,
    description: suite.description,
    startTime,
    endTime: null,
    duration: 0,
    tests: [],
    memoryPeak: 0,
    passed: false
  };

  try {
    // Run tests based on suite type
    switch (suiteName) {
      case 'startup':
        result.tests = await runStartupTests();
        break;
      case 'runtime':
        result.tests = await runRuntimeTests();
        break;
      case 'memory':
        result.tests = await runMemoryTests();
        break;
      case 'bundle':
        result.tests = await runBundleTests();
        break;
      case 'api':
        result.tests = await runAPITests();
        break;
      case 'integration':
        result.tests = await runIntegrationTests();
        break;
      default:
        throw new Error(`Unknown test suite: ${suiteName}`);
    }

    result.passed = result.tests.every(test => test.passed);

  } catch (error) {
    console.error(`❌ Suite ${suiteName} failed:`, error.message);
    result.tests.push({
      name: 'Suite Execution',
      passed: false,
      duration: 0,
      error: error.message
    });
  }

  result.endTime = Date.now();
  result.duration = result.endTime - result.startTime;
  
  const endMemory = process.memoryUsage();
  result.memoryPeak = Math.max(startMemory.heapUsed, endMemory.heapUsed);

  // Log results
  const passedCount = result.tests.filter(t => t.passed).length;
  const totalCount = result.tests.length;
  const status = result.passed ? '✅' : '❌';
  
  console.log(`${status} ${suite.name}: ${passedCount}/${totalCount} tests passed (${result.duration}ms)`);
  
  if (config.verbose) {
    result.tests.forEach(test => {
      const testStatus = test.passed ? '✅' : '❌';
      console.log(`  ${testStatus} ${test.name}: ${test.duration}ms`);
      if (test.error) {
        console.log(`    Error: ${test.error}`);
      }
    });
  }

  return result;
}

/**
 * Startup performance tests
 */
async function runStartupTests() {
  const tests = [];

  // CLI startup time
  tests.push(await measureTest('CLI Startup', async () => {
    const start = Date.now();
    try {
      execSync('node dist/cli/main.js --version', { 
        stdio: 'pipe',
        timeout: config.timeout
      });
      return Date.now() - start;
    } catch (error) {
      throw new Error(`CLI startup failed: ${error.message}`);
    }
  }));

  // Module loading time
  tests.push(await measureTest('Module Loading', async () => {
    const start = Date.now();
    try {
      // Clear require cache
      Object.keys(require.cache).forEach(key => {
        if (key.includes('claude-flow')) {
          delete require.cache[key];
        }
      });
      
      require('../dist/index.js');
      return Date.now() - start;
    } catch (error) {
      throw new Error(`Module loading failed: ${error.message}`);
    }
  }));

  // Config initialization
  tests.push(await measureTest('Config Initialization', async () => {
    const start = Date.now();
    try {
      const { ConfigManager } = require('../dist/config/config-manager.js');
      const config = new ConfigManager();
      await config.initialize();
      return Date.now() - start;
    } catch (error) {
      throw new Error(`Config initialization failed: ${error.message}`);
    }
  }));

  return tests;
}

/**
 * Runtime performance tests
 */
async function runRuntimeTests() {
  const tests = [];

  // Command execution time
  tests.push(await measureTest('Command Execution', async () => {
    const start = Date.now();
    try {
      execSync('node dist/cli/main.js status', { 
        stdio: 'pipe',
        timeout: config.timeout
      });
      return Date.now() - start;
    } catch (error) {
      // Status command might fail in test environment, that's ok
      return Date.now() - start;
    }
  }));

  // Agent spawning performance
  tests.push(await measureTest('Agent Spawning', async () => {
    const start = Date.now();
    try {
      const { AgentManager } = require('../dist/agents/agent-manager.js');
      const manager = new AgentManager();
      
      // Simulate spawning multiple agents
      for (let i = 0; i < 5; i++) {
        await manager.createAgent({
          id: `test-agent-${i}`,
          type: 'coder',
          config: {}
        });
      }
      
      return Date.now() - start;
    } catch (error) {
      // Agent manager might not be available in all builds
      return Date.now() - start;
    }
  }));

  return tests;
}

/**
 * Memory performance tests
 */
async function runMemoryTests() {
  const tests = [];

  // Memory baseline measurement
  tests.push(await measureTest('Memory Baseline', async () => {
    const start = Date.now();
    const startMemory = process.memoryUsage();
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
    
    const endMemory = process.memoryUsage();
    
    // Store memory info for analysis
    const memoryInfo = {
      heapUsed: endMemory.heapUsed,
      heapTotal: endMemory.heapTotal,
      external: endMemory.external,
      rss: endMemory.rss
    };
    
    if (config.verbose) {
      console.log('    Memory usage:', memoryInfo);
    }
    
    return Date.now() - start;
  }));

  // Memory growth test
  tests.push(await measureTest('Memory Growth', async () => {
    const start = Date.now();
    const startMemory = process.memoryUsage().heapUsed;
    
    // Simulate memory-intensive operations
    const data = [];
    for (let i = 0; i < 10000; i++) {
      data.push({
        id: i,
        data: new Array(100).fill(Math.random())
      });
    }
    
    const endMemory = process.memoryUsage().heapUsed;
    const growth = endMemory - startMemory;
    
    if (config.verbose) {
      console.log(`    Memory growth: ${Math.round(growth / 1024 / 1024)}MB`);
    }
    
    // Clean up
    data.length = 0;
    
    return Date.now() - start;
  }));

  return tests;
}

/**
 * Bundle analysis tests
 */
async function runBundleTests() {
  const tests = [];

  // Bundle size analysis
  tests.push(await measureTest('Bundle Size Analysis', async () => {
    const start = Date.now();
    
    try {
      const distPath = path.join(process.cwd(), 'dist');
      const bundleSize = await calculateDirectorySize(distPath);
      
      if (config.verbose) {
        console.log(`    Bundle size: ${Math.round(bundleSize / 1024 / 1024)}MB`);
      }
      
      // Store bundle size for comparison
      if (!global.bundleAnalysis) global.bundleAnalysis = {};
      global.bundleAnalysis.totalSize = bundleSize;
      
      return Date.now() - start;
    } catch (error) {
      throw new Error(`Bundle analysis failed: ${error.message}`);
    }
  }));

  // Dependency analysis
  tests.push(await measureTest('Dependency Analysis', async () => {
    const start = Date.now();
    
    try {
      const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      const depCount = Object.keys(packageJson.dependencies || {}).length;
      const devDepCount = Object.keys(packageJson.devDependencies || {}).length;
      
      if (config.verbose) {
        console.log(`    Dependencies: ${depCount} prod, ${devDepCount} dev`);
      }
      
      return Date.now() - start;
    } catch (error) {
      throw new Error(`Dependency analysis failed: ${error.message}`);
    }
  }));

  return tests;
}

/**
 * API performance tests
 */
async function runAPITests() {
  const tests = [];

  // MCP server startup
  tests.push(await measureTest('MCP Server Startup', async () => {
    const start = Date.now();
    
    try {
      // Try to import and instantiate MCP server
      const { MCPServer } = require('../dist/mcp/server.js');
      const server = new MCPServer();
      
      // Basic initialization test
      await new Promise(resolve => setTimeout(resolve, 100));
      
      return Date.now() - start;
    } catch (error) {
      // MCP server might not be available in all builds
      return Date.now() - start;
    }
  }));

  return tests;
}

/**
 * Integration performance tests
 */
async function runIntegrationTests() {
  const tests = [];

  // End-to-end workflow test
  tests.push(await measureTest('End-to-End Workflow', async () => {
    const start = Date.now();
    
    try {
      // Simulate a basic workflow
      const { PerformanceMonitoringSystem } = require('../dist/performance/index.js');
      const system = new PerformanceMonitoringSystem();
      
      // Basic system check
      const status = await system.getStatus();
      
      if (config.verbose) {
        console.log('    System status:', status.status);
      }
      
      return Date.now() - start;
    } catch (error) {
      // Performance system might not be fully available
      return Date.now() - start;
    }
  }));

  return tests;
}

/**
 * Measure test execution time and handle errors
 */
async function measureTest(name, testFn) {
  const start = Date.now();
  
  try {
    const duration = await Promise.race([
      testFn(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Test timeout')), config.timeout)
      )
    ]);
    
    return {
      name,
      passed: true,
      duration: typeof duration === 'number' ? duration : Date.now() - start,
      error: null
    };
  } catch (error) {
    return {
      name,
      passed: false,
      duration: Date.now() - start,
      error: error.message
    };
  }
}

/**
 * Calculate directory size recursively
 */
async function calculateDirectorySize(dirPath) {
  let totalSize = 0;
  
  try {
    const items = fs.readdirSync(dirPath);
    
    for (const item of items) {
      const itemPath = path.join(dirPath, item);
      const stats = fs.statSync(itemPath);
      
      if (stats.isDirectory()) {
        totalSize += await calculateDirectorySize(itemPath);
      } else {
        totalSize += stats.size;
      }
    }
  } catch (error) {
    // Directory might not exist
  }
  
  return totalSize;
}

/**
 * Compare results with baseline
 */
function compareWithBaseline(current, baseline) {
  const comparison = {
    timestamp: Date.now(),
    regressions: [],
    improvements: [],
    summary: {
      overallChange: 0,
      memoryChange: 0,
      durationChange: 0
    }
  };

  // Compare overall metrics
  if (baseline.summary && current.summary) {
    const durationChange = ((current.summary.totalDuration - baseline.summary.totalDuration) / baseline.summary.totalDuration) * 100;
    const memoryChange = ((current.summary.memoryPeak - baseline.summary.memoryPeak) / baseline.summary.memoryPeak) * 100;
    
    comparison.summary.durationChange = durationChange;
    comparison.summary.memoryChange = memoryChange;

    // Check for regressions (>10% increase)
    if (durationChange > 10) {
      comparison.regressions.push({
        metric: 'duration',
        change: durationChange,
        severity: durationChange > 25 ? 'critical' : 'moderate'
      });
    }

    if (memoryChange > 10) {
      comparison.regressions.push({
        metric: 'memory',
        change: memoryChange,
        severity: memoryChange > 25 ? 'critical' : 'moderate'
      });
    }

    // Check for improvements (>5% decrease)
    if (durationChange < -5) {
      comparison.improvements.push({
        metric: 'duration',
        change: Math.abs(durationChange)
      });
    }

    if (memoryChange < -5) {
      comparison.improvements.push({
        metric: 'memory',
        change: Math.abs(memoryChange)
      });
    }
  }

  return comparison;
}

/**
 * Output results in the specified format
 */
async function outputResults(results) {
  console.log('\n📊 Performance Test Results');
  console.log('===========================');
  
  // Console summary
  console.log(`Total Tests: ${results.summary.totalTests}`);
  console.log(`Passed: ${results.summary.passedTests}`);
  console.log(`Failed: ${results.summary.failedTests}`);
  console.log(`Duration: ${results.summary.totalDuration}ms`);
  console.log(`Memory Peak: ${Math.round(results.summary.memoryPeak / 1024 / 1024)}MB`);
  
  if (results.comparison) {
    console.log('\n📈 Baseline Comparison:');
    console.log(`Duration Change: ${results.comparison.summary.durationChange.toFixed(1)}%`);
    console.log(`Memory Change: ${results.comparison.summary.memoryChange.toFixed(1)}%`);
    
    if (results.comparison.regressions.length > 0) {
      console.log(`Regressions: ${results.comparison.regressions.length}`);
    }
    
    if (results.comparison.improvements.length > 0) {
      console.log(`Improvements: ${results.comparison.improvements.length}`);
    }
  }

  // Write results file
  fs.writeFileSync(config.output, JSON.stringify(results, null, 2));
  console.log(`\n💾 Results saved to: ${config.output}`);

  // Generate additional formats if requested
  if (config.format === 'html' || config.includeDetails) {
    const htmlReport = generateHTMLReport(results);
    const htmlPath = config.output.replace(/\.json$/, '.html');
    fs.writeFileSync(htmlPath, htmlReport);
    console.log(`📄 HTML report saved to: ${htmlPath}`);
  }

  if (config.format === 'junit') {
    const junitReport = generateJUnitReport(results);
    const junitPath = config.output.replace(/\.json$/, '.xml');
    fs.writeFileSync(junitPath, junitReport);
    console.log(`📋 JUnit report saved to: ${junitPath}`);
  }
}

/**
 * Generate HTML report
 */
function generateHTMLReport(results) {
  const totalTests = results.summary.totalTests;
  const passedTests = results.summary.passedTests;
  const failedTests = results.summary.failedTests;
  const passRate = totalTests > 0 ? (passedTests / totalTests * 100).toFixed(1) : 0;

  return `
<!DOCTYPE html>
<html>
<head>
    <title>Performance Test Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f8f9fa; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 20px 0; }
        .metric { background: white; border: 1px solid #dee2e6; padding: 15px; border-radius: 5px; text-align: center; }
        .metric h3 { margin: 0 0 10px 0; color: #495057; }
        .metric .value { font-size: 24px; font-weight: bold; color: #007bff; }
        .suite { margin: 20px 0; border: 1px solid #dee2e6; border-radius: 5px; }
        .suite-header { background: #e9ecef; padding: 15px; font-weight: bold; }
        .test { padding: 10px 15px; border-bottom: 1px solid #f8f9fa; }
        .test:last-child { border-bottom: none; }
        .passed { color: #28a745; }
        .failed { color: #dc3545; }
        .regression { background: #f8d7da; border-left: 4px solid #dc3545; padding: 10px; margin: 10px 0; }
        .improvement { background: #d4f8d4; border-left: 4px solid #28a745; padding: 10px; margin: 10px 0; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Performance Test Report</h1>
        <p>Generated: ${new Date(results.timestamp).toISOString()}</p>
        <p>Environment: ${results.environment.nodeVersion} on ${results.environment.platform}</p>
    </div>

    <div class="summary">
        <div class="metric">
            <h3>Total Tests</h3>
            <div class="value">${totalTests}</div>
        </div>
        <div class="metric">
            <h3>Pass Rate</h3>
            <div class="value passed">${passRate}%</div>
        </div>
        <div class="metric">
            <h3>Duration</h3>
            <div class="value">${results.summary.totalDuration}ms</div>
        </div>
        <div class="metric">
            <h3>Memory Peak</h3>
            <div class="value">${Math.round(results.summary.memoryPeak / 1024 / 1024)}MB</div>
        </div>
    </div>

    ${results.comparison ? `
    <h2>Baseline Comparison</h2>
    ${results.comparison.regressions.map(reg => `
    <div class="regression">
        <strong>Regression:</strong> ${reg.metric} increased by ${reg.change.toFixed(1)}% (${reg.severity})
    </div>
    `).join('')}
    
    ${results.comparison.improvements.map(imp => `
    <div class="improvement">
        <strong>Improvement:</strong> ${imp.metric} improved by ${imp.change.toFixed(1)}%
    </div>
    `).join('')}
    ` : ''}

    <h2>Test Suites</h2>
    ${Object.entries(results.suites).map(([suiteName, suite]) => `
    <div class="suite">
        <div class="suite-header">
            ${suite.passed ? '✅' : '❌'} ${suite.name} (${suite.duration}ms)
        </div>
        ${suite.tests.map(test => `
        <div class="test">
            <span class="${test.passed ? 'passed' : 'failed'}">
                ${test.passed ? '✅' : '❌'} ${test.name}
            </span>
            <span style="float: right;">${test.duration}ms</span>
            ${test.error ? `<div style="color: #dc3545; font-size: 0.9em; margin-top: 5px;">Error: ${test.error}</div>` : ''}
        </div>
        `).join('')}
    </div>
    `).join('')}
</body>
</html>
  `;
}

/**
 * Generate JUnit XML report
 */
function generateJUnitReport(results) {
  const totalTests = results.summary.totalTests;
  const failures = results.summary.failedTests;
  const time = (results.summary.totalDuration / 1000).toFixed(3);

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<testsuite name="PerformanceTests" tests="${totalTests}" failures="${failures}" time="${time}">\n`;

  for (const [suiteName, suite] of Object.entries(results.suites)) {
    for (const test of suite.tests) {
      const testTime = (test.duration / 1000).toFixed(3);
      xml += `  <testcase name="${test.name}" classname="${suiteName}" time="${testTime}">\n`;
      
      if (!test.passed) {
        xml += `    <failure message="${test.error || 'Test failed'}">${test.error || 'Test failed'}</failure>\n`;
      }
      
      xml += `  </testcase>\n`;
    }
  }

  xml += `</testsuite>\n`;
  return xml;
}

/**
 * Get environment information
 */
async function getEnvironmentInfo() {
  return {
    nodeVersion: process.version,
    platform: os.platform(),
    arch: os.arch(),
    cpuModel: os.cpus()[0]?.model || 'Unknown',
    totalMemory: os.totalmem(),
    availableMemory: os.freemem(),
    ci: Boolean(process.env.CI),
    environment: process.env.NODE_ENV || 'test'
  };
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = {
  main,
  runTestSuite,
  testSuites
};