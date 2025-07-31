#!/usr/bin/env node

/**
 * Comprehensive Test Harness for Claude-Flow
 * 
 * This is a robust, safe testing environment designed to systematically
 * test claude-flow functionality with detailed logging and error handling.
 * Designed to be "eyes" for blind accessibility testing.
 */

import { spawn, exec } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const execAsync = promisify(exec);

/**
 * Test execution logger with comprehensive output capture
 */
class TestLogger {
  constructor() {
    this.logDir = path.join(projectRoot, 'test-results');
    this.sessionId = Date.now().toString();
    this.sessionDir = path.join(this.logDir, `session-${this.sessionId}`);
    this.testCount = 0;
    this.passCount = 0;
    this.failCount = 0;
    this.issues = [];
    
    this.setupLogging();
  }

  async setupLogging() {
    await fs.ensureDir(this.sessionDir);
    
    this.logFile = path.join(this.sessionDir, 'test-session.log');
    this.issuesFile = path.join(this.sessionDir, 'issues.json');
    this.summaryFile = path.join(this.sessionDir, 'summary.json');
    
    await this.log('='.repeat(80));
    await this.log(`CLAUDE-FLOW COMPREHENSIVE TEST SESSION STARTED`);
    await this.log(`Session ID: ${this.sessionId}`);
    await this.log(`Timestamp: ${new Date().toISOString()}`);
    await this.log(`Project Root: ${projectRoot}`);
    await this.log('='.repeat(80));
  }

  async log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level}] ${message}`;
    
    console.log(logEntry);
    
    if (this.logFile) {
      await fs.appendFile(this.logFile, logEntry + '\n');
    }
  }

  async logTest(testName, status, details = {}) {
    this.testCount++;
    
    if (status === 'PASS') {
      this.passCount++;
      await this.log(`✅ TEST PASSED: ${testName}`, 'PASS');
    } else {
      this.failCount++;
      await this.log(`❌ TEST FAILED: ${testName}`, 'FAIL');
      
      this.issues.push({
        testName,
        timestamp: new Date().toISOString(),
        details,
        sessionId: this.sessionId
      });
    }
    
    if (details.output) {
      await this.log(`   Output: ${details.output.substring(0, 200)}...`, 'OUTPUT');
    }
    
    if (details.error) {
      await this.log(`   Error: ${details.error}`, 'ERROR');
    }
  }

  async logSection(sectionName) {
    await this.log('');
    await this.log('─'.repeat(60));
    await this.log(`📋 TESTING SECTION: ${sectionName}`);
    await this.log('─'.repeat(60));
  }

  async saveSummary() {
    const summary = {
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      totalTests: this.testCount,
      passed: this.passCount,
      failed: this.failCount,
      successRate: this.testCount > 0 ? (this.passCount / this.testCount * 100).toFixed(2) + '%' : '0%',
      issuesCount: this.issues.length,
      sessionDir: this.sessionDir
    };
    
    await fs.writeJson(this.summaryFile, summary, { spaces: 2 });
    await fs.writeJson(this.issuesFile, this.issues, { spaces: 2 });
    
    return summary;
  }
}

/**
 * Safe command execution with comprehensive error handling
 */
class SafeExecutor {
  constructor(logger) {
    this.logger = logger;
    this.timeout = 30000; // 30 seconds default timeout
  }

  async executeCommand(command, args = [], options = {}) {
    const testName = `Command: ${command} ${args.join(' ')}`;
    
    try {
      await this.logger.log(`🚀 Executing: ${command} ${args.join(' ')}`);
      
      const result = await this.spawnWithTimeout(command, args, {
        timeout: options.timeout || this.timeout,
        cwd: options.cwd || projectRoot,
        env: { 
          ...process.env, 
          ...options.env,
          // Ensure safe environment
          CLAUDE_FLOW_ENV: 'test',
          CLAUDE_FLOW_SAFE_MODE: 'true'
        }
      });
      
      await this.logger.logTest(testName, 'PASS', {
        output: result.stdout,
        exitCode: result.code
      });
      
      return result;
      
    } catch (error) {
      await this.logger.logTest(testName, 'FAIL', {
        error: error.message,
        stderr: error.stderr,
        exitCode: error.code
      });
      
      return {
        success: false,
        error: error.message,
        stderr: error.stderr,
        code: error.code
      };
    }
  }

  spawnWithTimeout(command, args, options = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: options.cwd || projectRoot,
        env: options.env || process.env,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';
      let timeoutId;

      if (options.timeout) {
        timeoutId = setTimeout(() => {
          child.kill('SIGTERM');
          reject(new Error(`Command timed out after ${options.timeout}ms`));
        }, options.timeout);
      }

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (timeoutId) clearTimeout(timeoutId);
        
        if (code === 0) {
          resolve({
            success: true,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            code
          });
        } else {
          reject({
            message: `Command failed with exit code ${code}`,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            code
          });
        }
      });

      child.on('error', (error) => {
        if (timeoutId) clearTimeout(timeoutId);
        reject({
          message: error.message,
          code: -1
        });
      });
    });
  }

  async testFileExists(filePath, description) {
    const testName = `File Exists: ${description}`;
    
    try {
      const exists = await fs.pathExists(filePath);
      const stats = exists ? await fs.stat(filePath) : null;
      
      await this.logger.logTest(testName, exists ? 'PASS' : 'FAIL', {
        path: filePath,
        exists,
        size: stats ? stats.size : 0,
        type: stats ? (stats.isDirectory() ? 'directory' : 'file') : 'none'
      });
      
      return exists;
    } catch (error) {
      await this.logger.logTest(testName, 'FAIL', {
        path: filePath,
        error: error.message
      });
      return false;
    }
  }
}

/**
 * Claude-Flow Feature Discovery
 */
class FeatureDiscovery {
  constructor(logger, executor) {
    this.logger = logger;
    this.executor = executor;
    this.features = {
      cliCommands: [],
      scriptCommands: [],
      workflows: [],
      agents: [],
      configurations: []
    };
  }

  async discoverCLICommands() {
    await this.logger.logSection('CLI Command Discovery');
    
    // Test if the main CLI exists and works
    const mainCLI = path.join(projectRoot, 'dist', 'cli', 'main.js');
    
    if (await this.executor.testFileExists(mainCLI, 'Main CLI file')) {
      // Try to get help/version info
      const helpResult = await this.executor.executeCommand('node', [mainCLI, '--help']);
      const versionResult = await this.executor.executeCommand('node', [mainCLI, '--version']);
      
      this.features.cliCommands.push({
        name: 'main',
        path: mainCLI,
        helpAvailable: helpResult.success,
        versionAvailable: versionResult.success
      });
    }
    
    // Test NPX execution
    const npxResult = await this.executor.executeCommand('npx', ['tsx', 'src/cli/main.ts', '--help']);
    if (npxResult.success) {
      this.features.cliCommands.push({
        name: 'npx-tsx',
        command: 'npx tsx src/cli/main.ts',
        working: true
      });
    }
  }

  async discoverPackageScripts() {
    await this.logger.logSection('Package Scripts Discovery');
    
    const packageJson = path.join(projectRoot, 'package.json');
    if (await this.executor.testFileExists(packageJson, 'package.json')) {
      const pkg = await fs.readJson(packageJson);
      
      if (pkg.scripts) {
        for (const [name, command] of Object.entries(pkg.scripts)) {
          this.features.scriptCommands.push({
            name,
            command,
            category: this.categorizeScript(name)
          });
          
          await this.logger.log(`📜 Found script: ${name} -> ${command}`);
        }
      }
    }
  }

  categorizeScript(scriptName) {
    if (scriptName.includes('test')) return 'testing';
    if (scriptName.includes('build')) return 'build';
    if (scriptName.includes('dev')) return 'development';
    if (scriptName.includes('lint')) return 'quality';
    if (scriptName.includes('security')) return 'security';
    return 'other';
  }

  async discoverAgents() {
    await this.logger.logSection('Agent System Discovery');
    
    // Look for agent-related files
    const agentDirs = [
      'src/agents',
      'src/swarm', 
      'src/hive-mind',
      'src/services'
    ];
    
    for (const dir of agentDirs) {
      const fullPath = path.join(projectRoot, dir);
      if (await this.executor.testFileExists(fullPath, `Agent directory: ${dir}`)) {
        const files = await fs.readdir(fullPath).catch(() => []);
        this.features.agents.push({
          directory: dir,
          fileCount: files.length,
          files: files.slice(0, 10) // First 10 files
        });
      }
    }
  }

  async generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        cliCommands: this.features.cliCommands.length,  
        scriptCommands: this.features.scriptCommands.length,
        workflows: this.features.workflows.length,
        agents: this.features.agents.length
      },
      details: this.features
    };
    
    const reportFile = path.join(projectRoot, 'test-results', `session-${this.logger.sessionId}`, 'features.json');
    await fs.writeJson(reportFile, report, { spaces: 2 });
    
    return report;
  }
}

/**
 * Main Test Orchestrator
 */
class TestOrchestrator {
  constructor() {
    this.logger = new TestLogger();
    this.executor = new SafeExecutor(this.logger);
    this.discovery = new FeatureDiscovery(this.logger, this.executor);
  }

  async runComprehensiveTests() {
    await this.logger.logSection('COMPREHENSIVE CLAUDE-FLOW TESTING');
    
    try {
      // Phase 1: Environment Setup
      await this.testEnvironmentSetup();
      
      // Phase 2: Feature Discovery  
      await this.discovery.discoverCLICommands();
      await this.discovery.discoverPackageScripts();
      await this.discovery.discoverAgents();
      
      // Phase 3: Basic Functionality Tests
      await this.testBasicFunctionality();
      
      // Phase 4: Generate Reports
      const featuresReport = await this.discovery.generateReport();
      const summary = await this.logger.saveSummary();
      
      await this.logger.logSection('TEST SESSION COMPLETE');
      await this.logger.log(`📊 Total Tests: ${summary.totalTests}`);
      await this.logger.log(`✅ Passed: ${summary.passed}`);
      await this.logger.log(`❌ Failed: ${summary.failed}`);
      await this.logger.log(`📈 Success Rate: ${summary.successRate}`);
      await this.logger.log(`🔍 Features Discovered: ${Object.keys(featuresReport.details).length} categories`);
      await this.logger.log(`📁 Results saved to: ${summary.sessionDir}`);
      
      return {
        summary,
        featuresReport,
        issues: this.logger.issues
      };
      
    } catch (error) {
      await this.logger.log(`💥 CRITICAL ERROR: ${error.message}`, 'CRITICAL');
      throw error;
    }
  }

  async testEnvironmentSetup() {
    await this.logger.logSection('Environment Setup Tests');
    
    // Test basic file structure
    const criticalFiles = [
      { path: 'package.json', desc: 'Package configuration' },
      { path: 'src', desc: 'Source directory' },
      { path: 'src/cli', desc: 'CLI directory' },
      { path: 'src/cli/main.ts', desc: 'Main CLI entry point' }
    ];
    
    for (const file of criticalFiles) {
      await this.executor.testFileExists(
        path.join(projectRoot, file.path), 
        file.desc
      );
    }
    
    // Test Node.js version
    await this.executor.executeCommand('node', ['--version']);
    await this.executor.executeCommand('npm', ['--version']);
  }

  async testBasicFunctionality() {
    await this.logger.logSection('Basic Functionality Tests');
    
    // Test build process
    await this.executor.executeCommand('npm', ['run', 'build'], { timeout: 60000 });
    
    // Test basic CLI help
    await this.executor.executeCommand('npx', ['tsx', 'src/cli/main.ts', '--help']);
    
    // Test version command
    await this.executor.executeCommand('npx', ['tsx', 'src/cli/main.ts', '--version']);
  }
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const orchestrator = new TestOrchestrator();
  
  orchestrator.runComprehensiveTests()
    .then((results) => {
      console.log('\n🎉 Testing completed successfully!');
      console.log(`📁 Results: ${results.summary.sessionDir}`);
      process.exit(results.summary.failed > 0 ? 1 : 0);
    })
    .catch((error) => {
      console.error('💥 Testing failed:', error.message);
      process.exit(1);
    });
}

export { TestOrchestrator, TestLogger, SafeExecutor, FeatureDiscovery };