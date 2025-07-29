#!/usr/bin/env node

/**
 * Enterprise Test Coverage Enforcement
 * Implements comprehensive coverage reporting with quality gates
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import path from 'path';

const ENTERPRISE_COVERAGE_GATES = {
  MIN_TOTAL_COVERAGE: 90,
  MIN_FUNCTION_COVERAGE: 85,
  MIN_LINE_COVERAGE: 90,
  MIN_BRANCH_COVERAGE: 80,
  MIN_STATEMENT_COVERAGE: 90,
  CRITICAL_FILES_MIN_COVERAGE: 95, // Core modules must have higher coverage
};

const CRITICAL_FILE_PATTERNS = [
  'src/core/**/*.ts',
  'src/api/**/*.ts',
  'src/mcp/**/*.ts',
  'src/providers/**/*.ts',
  'src/utils/**/*.ts',
];

class TestCoverageEnforcer {
  constructor() {
    this.results = {
      coverage: null,
      critical: null,
      enforcement: null,
    };
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = {
      info: '📊',
      success: '✅',
      warning: '⚠️',
      error: '❌',
      progress: '🔄',
    }[type];
    
    console.log(`${prefix} [${timestamp}] ${message}`);
  }

  async runCoverageAnalysis() {
    this.log('Running comprehensive test coverage analysis...', 'progress');
    
    try {
      // Run Jest with coverage
      const coverageOutput = execSync('npm run test:coverage', { 
        encoding: 'utf8',
        stdio: 'pipe',
        maxBuffer: 1024 * 1024 * 50 // 50MB buffer for large coverage reports
      });
      
      this.results.coverage = { success: true, output: coverageOutput };
      this.log('Coverage analysis completed', 'success');
      return true;
    } catch (error) {
      this.results.coverage = { 
        success: false, 
        error: error.message,
        stdout: error.stdout || '',
        stderr: error.stderr || '',
      };
      
      this.log('Coverage analysis failed - continuing with available data', 'warning');
      return false;
    }
  }

  async parseCoverageResults() {
    this.log('Parsing coverage results...', 'progress');
    
    const coveragePath = 'coverage/coverage-final.json';
    if (!existsSync(coveragePath)) {
      this.log('Coverage file not found, attempting to find alternative formats', 'warning');
      return this.findAlternativeCoverageData();
    }

    try {
      const coverageData = JSON.parse(readFileSync(coveragePath, 'utf8'));
      const summary = this.calculateCoverageSummary(coverageData);
      
      this.log(`Total Coverage: ${summary.total.pct}%`, 'info');
      this.log(`Lines: ${summary.lines.pct}%`, 'info');
      this.log(`Functions: ${summary.functions.pct}%`, 'info');
      this.log(`Branches: ${summary.branches.pct}%`, 'info');
      this.log(`Statements: ${summary.statements.pct}%`, 'info');
      
      return summary;
    } catch (error) {
      this.log(`Error parsing coverage data: ${error.message}`, 'error');
      return null;
    }
  }

  calculateCoverageSummary(coverageData) {
    let totalLines = 0, coveredLines = 0;
    let totalFunctions = 0, coveredFunctions = 0;
    let totalBranches = 0, coveredBranches = 0;
    let totalStatements = 0, coveredStatements = 0;

    const criticalFiles = {};
    const fileResults = {};

    for (const [filePath, fileData] of Object.entries(coverageData)) {
      if (filePath.includes('node_modules') || filePath.includes('dist')) continue;
      
      const lines = fileData.l || {};
      const functions = fileData.f || {};
      const branches = fileData.b || {};
      const statements = fileData.s || {};

      // Lines coverage
      const fileTotalLines = Object.keys(lines).length;
      const fileCoveredLines = Object.values(lines).filter(hits => hits > 0).length;
      
      // Functions coverage
      const fileTotalFunctions = Object.keys(functions).length;
      const fileCoveredFunctions = Object.values(functions).filter(hits => hits > 0).length;
      
      // Branches coverage
      const fileTotalBranches = Object.keys(branches).length;
      const fileCoveredBranches = Object.values(branches).filter(branch => 
        Array.isArray(branch) ? branch.some(hits => hits > 0) : branch > 0
      ).length;
      
      // Statements coverage
      const fileTotalStatements = Object.keys(statements).length;
      const fileCoveredStatements = Object.values(statements).filter(hits => hits > 0).length;

      totalLines += fileTotalLines;
      coveredLines += fileCoveredLines;
      totalFunctions += fileTotalFunctions;
      coveredFunctions += fileCoveredFunctions;
      totalBranches += fileTotalBranches;
      coveredBranches += fileCoveredBranches;
      totalStatements += fileTotalStatements;
      coveredStatements += fileCoveredStatements;

      // Calculate file-specific coverage
      const fileLineCoverage = fileTotalLines ? (fileCoveredLines / fileTotalLines) * 100 : 100;
      const fileFunctionCoverage = fileTotalFunctions ? (fileCoveredFunctions / fileTotalFunctions) * 100 : 100;
      const fileBranchCoverage = fileTotalBranches ? (fileCoveredBranches / fileTotalBranches) * 100 : 100;
      const fileStatementCoverage = fileTotalStatements ? (fileCoveredStatements / fileTotalStatements) * 100 : 100;

      fileResults[filePath] = {
        lines: { pct: Math.round(fileLineCoverage * 100) / 100, covered: fileCoveredLines, total: fileTotalLines },
        functions: { pct: Math.round(fileFunctionCoverage * 100) / 100, covered: fileCoveredFunctions, total: fileTotalFunctions },
        branches: { pct: Math.round(fileBranchCoverage * 100) / 100, covered: fileCoveredBranches, total: fileTotalBranches },
        statements: { pct: Math.round(fileStatementCoverage * 100) / 100, covered: fileCoveredStatements, total: fileTotalStatements },
      };

      // Check if this is a critical file
      if (this.isCriticalFile(filePath)) {
        criticalFiles[filePath] = fileResults[filePath];
      }
    }

    const summary = {
      total: {
        pct: Math.round(((coveredLines + coveredFunctions + coveredBranches + coveredStatements) / 
               (totalLines + totalFunctions + totalBranches + totalStatements)) * 10000) / 100
      },
      lines: { 
        pct: totalLines ? Math.round((coveredLines / totalLines) * 10000) / 100 : 100,
        covered: coveredLines,
        total: totalLines
      },
      functions: { 
        pct: totalFunctions ? Math.round((coveredFunctions / totalFunctions) * 10000) / 100 : 100,
        covered: coveredFunctions,
        total: totalFunctions
      },
      branches: { 
        pct: totalBranches ? Math.round((coveredBranches / totalBranches) * 10000) / 100 : 100,
        covered: coveredBranches,
        total: totalBranches
      },
      statements: { 
        pct: totalStatements ? Math.round((coveredStatements / totalStatements) * 10000) / 100 : 100,
        covered: coveredStatements,
        total: totalStatements
      },
      files: fileResults,
      critical: criticalFiles,
    };

    return summary;
  }

  isCriticalFile(filePath) {
    return CRITICAL_FILE_PATTERNS.some(pattern => {
      const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));
      return regex.test(filePath);
    });
  }

  findAlternativeCoverageData() {
    this.log('Searching for alternative coverage formats...', 'progress');
    
    // Check for lcov.info
    if (existsSync('coverage/lcov.info')) {
      return this.parseLcovFile('coverage/lcov.info');
    }
    
    // Check for clover.xml
    if (existsSync('coverage/clover.xml')) {
      return this.parseCloverFile('coverage/clover.xml');
    }
    
    // Generate basic coverage report from test output
    return this.generateBasicCoverageFromTestOutput();
  }

  generateBasicCoverageFromTestOutput() {
    this.log('Generating basic coverage report from available data', 'info');
    
    return {
      total: { pct: 0 },
      lines: { pct: 0, covered: 0, total: 0 },
      functions: { pct: 0, covered: 0, total: 0 },
      branches: { pct: 0, covered: 0, total: 0 },
      statements: { pct: 0, covered: 0, total: 0 },
      files: {},
      critical: {},
    };
  }

  async enforceCoverageGates(summary) {
    this.log('Enforcing enterprise coverage quality gates...', 'progress');
    
    if (!summary) {
      this.log('No coverage data available for enforcement', 'warning');
      return false;
    }

    const violations = [];
    
    // Total coverage gate
    if (summary.total.pct < ENTERPRISE_COVERAGE_GATES.MIN_TOTAL_COVERAGE) {
      violations.push(`Total coverage ${summary.total.pct}% below minimum ${ENTERPRISE_COVERAGE_GATES.MIN_TOTAL_COVERAGE}%`);
    }
    
    // Line coverage gate
    if (summary.lines.pct < ENTERPRISE_COVERAGE_GATES.MIN_LINE_COVERAGE) {
      violations.push(`Line coverage ${summary.lines.pct}% below minimum ${ENTERPRISE_COVERAGE_GATES.MIN_LINE_COVERAGE}%`);
    }
    
    // Function coverage gate
    if (summary.functions.pct < ENTERPRISE_COVERAGE_GATES.MIN_FUNCTION_COVERAGE) {
      violations.push(`Function coverage ${summary.functions.pct}% below minimum ${ENTERPRISE_COVERAGE_GATES.MIN_FUNCTION_COVERAGE}%`);
    }
    
    // Branch coverage gate
    if (summary.branches.pct < ENTERPRISE_COVERAGE_GATES.MIN_BRANCH_COVERAGE) {
      violations.push(`Branch coverage ${summary.branches.pct}% below minimum ${ENTERPRISE_COVERAGE_GATES.MIN_BRANCH_COVERAGE}%`);
    }
    
    // Statement coverage gate
    if (summary.statements.pct < ENTERPRISE_COVERAGE_GATES.MIN_STATEMENT_COVERAGE) {
      violations.push(`Statement coverage ${summary.statements.pct}% below minimum ${ENTERPRISE_COVERAGE_GATES.MIN_STATEMENT_COVERAGE}%`);
    }

    // Critical files coverage
    const criticalViolations = this.checkCriticalFilesCoverage(summary.critical);
    violations.push(...criticalViolations);

    if (violations.length > 0) {
      this.log(`❌ Coverage quality gates failed:`, 'error');
      violations.forEach(violation => this.log(`  - ${violation}`, 'error'));
      return false;
    }

    this.log('✅ All coverage quality gates passed!', 'success');
    return true;
  }

  checkCriticalFilesCoverage(criticalFiles) {
    const violations = [];
    
    for (const [filePath, coverage] of Object.entries(criticalFiles)) {
      if (coverage.lines.pct < ENTERPRISE_COVERAGE_GATES.CRITICAL_FILES_MIN_COVERAGE) {
        violations.push(`Critical file ${filePath} has ${coverage.lines.pct}% line coverage, below required ${ENTERPRISE_COVERAGE_GATES.CRITICAL_FILES_MIN_COVERAGE}%`);
      }
    }
    
    return violations;
  }

  async generateCoverageReport(summary) {
    this.log('Generating enterprise coverage report...', 'progress');
    
    const report = {
      timestamp: new Date().toISOString(),
      summary: summary,
      gates: ENTERPRISE_COVERAGE_GATES,
      status: summary ? 'completed' : 'failed',
      recommendations: this.generateRecommendations(summary),
    };

    // Write detailed report
    writeFileSync('coverage/enterprise-coverage-report.json', JSON.stringify(report, null, 2));
    
    // Generate markdown report
    const markdownReport = this.generateMarkdownReport(report);
    writeFileSync('coverage/enterprise-coverage-report.md', markdownReport);
    
    this.log('Coverage reports generated:', 'success');
    this.log('  - coverage/enterprise-coverage-report.json', 'info');
    this.log('  - coverage/enterprise-coverage-report.md', 'info');
    
    return report;
  }

  generateRecommendations(summary) {
    if (!summary) return ['Fix test configuration to generate coverage data'];
    
    const recommendations = [];
    
    if (summary.lines.pct < ENTERPRISE_COVERAGE_GATES.MIN_LINE_COVERAGE) {
      recommendations.push('Add more unit tests to increase line coverage');
    }
    
    if (summary.functions.pct < ENTERPRISE_COVERAGE_GATES.MIN_FUNCTION_COVERAGE) {
      recommendations.push('Write tests for uncovered functions, especially public APIs');
    }
    
    if (summary.branches.pct < ENTERPRISE_COVERAGE_GATES.MIN_BRANCH_COVERAGE) {
      recommendations.push('Add tests for conditional logic branches and error handling paths');
    }
    
    // Find files with low coverage
    const lowCoverageFiles = Object.entries(summary.files || {})
      .filter(([_, coverage]) => coverage.lines.pct < 70)
      .sort(([_, a], [__, b]) => a.lines.pct - b.lines.pct)
      .slice(0, 5);
    
    if (lowCoverageFiles.length > 0) {
      recommendations.push('Focus on improving coverage for these files:');
      lowCoverageFiles.forEach(([file, coverage]) => {
        recommendations.push(`  - ${file}: ${coverage.lines.pct}% line coverage`);
      });
    }
    
    return recommendations;
  }

  generateMarkdownReport(report) {
    return `# Enterprise Test Coverage Report

**Generated:** ${report.timestamp}
**Status:** ${report.status.toUpperCase()}

## Coverage Summary

| Metric | Coverage | Status |
|--------|----------|--------|
| **Total** | ${report.summary?.total?.pct || 0}% | ${(report.summary?.total?.pct || 0) >= ENTERPRISE_COVERAGE_GATES.MIN_TOTAL_COVERAGE ? '✅' : '❌'} |
| **Lines** | ${report.summary?.lines?.pct || 0}% | ${(report.summary?.lines?.pct || 0) >= ENTERPRISE_COVERAGE_GATES.MIN_LINE_COVERAGE ? '✅' : '❌'} |
| **Functions** | ${report.summary?.functions?.pct || 0}% | ${(report.summary?.functions?.pct || 0) >= ENTERPRISE_COVERAGE_GATES.MIN_FUNCTION_COVERAGE ? '✅' : '❌'} |
| **Branches** | ${report.summary?.branches?.pct || 0}% | ${(report.summary?.branches?.pct || 0) >= ENTERPRISE_COVERAGE_GATES.MIN_BRANCH_COVERAGE ? '✅' : '❌'} |
| **Statements** | ${report.summary?.statements?.pct || 0}% | ${(report.summary?.statements?.pct || 0) >= ENTERPRISE_COVERAGE_GATES.MIN_STATEMENT_COVERAGE ? '✅' : '❌'} |

## Enterprise Quality Gates

- **Minimum Total Coverage:** ${ENTERPRISE_COVERAGE_GATES.MIN_TOTAL_COVERAGE}%
- **Minimum Line Coverage:** ${ENTERPRISE_COVERAGE_GATES.MIN_LINE_COVERAGE}%
- **Minimum Function Coverage:** ${ENTERPRISE_COVERAGE_GATES.MIN_FUNCTION_COVERAGE}%
- **Minimum Branch Coverage:** ${ENTERPRISE_COVERAGE_GATES.MIN_BRANCH_COVERAGE}%
- **Critical Files Coverage:** ${ENTERPRISE_COVERAGE_GATES.CRITICAL_FILES_MIN_COVERAGE}%

## Recommendations

${report.recommendations.map(rec => `- ${rec}`).join('\n')}

## Next Steps

1. Review coverage report details in \`coverage/enterprise-coverage-report.json\`
2. Focus on files with coverage below enterprise standards
3. Add comprehensive tests for critical business logic
4. Ensure all new code includes adequate test coverage
5. Run \`npm run test:coverage\` regularly during development

---

*Generated by Enterprise Test Coverage Enforcer*
`;
  }

  async run() {
    this.log('🚀 Starting Enterprise Test Coverage Enforcement', 'info');
    this.log(`Quality Gates: Min ${ENTERPRISE_COVERAGE_GATES.MIN_TOTAL_COVERAGE}% coverage, Critical files ${ENTERPRISE_COVERAGE_GATES.CRITICAL_FILES_MIN_COVERAGE}%`, 'info');
    
    // Run coverage analysis
    await this.runCoverageAnalysis();
    
    // Parse results
    const summary = await this.parseCoverageResults();
    
    // Enforce quality gates
    const gatesPassed = await this.enforceCoverageGates(summary);
    
    // Generate comprehensive report
    const report = await this.generateCoverageReport(summary);
    
    this.log('', 'info');
    this.log('📊 ENTERPRISE COVERAGE REPORT', 'info');
    this.log('============================', 'info');
    
    if (summary) {
      this.log(`Total Coverage: ${summary.total.pct}%`, summary.total.pct >= ENTERPRISE_COVERAGE_GATES.MIN_TOTAL_COVERAGE ? 'success' : 'error');
      this.log(`Lines: ${summary.lines.pct}% (${summary.lines.covered}/${summary.lines.total})`, 'info');
      this.log(`Functions: ${summary.functions.pct}% (${summary.functions.covered}/${summary.functions.total})`, 'info');
      this.log(`Branches: ${summary.branches.pct}% (${summary.branches.covered}/${summary.branches.total})`, 'info');
      this.log(`Statements: ${summary.statements.pct}% (${summary.statements.covered}/${summary.statements.total})`, 'info');
    }
    
    this.log('', 'info');
    
    if (gatesPassed) {
      this.log('🎉 ENTERPRISE COVERAGE GATES PASSED', 'success');
      this.log('✅ Code coverage meets enterprise standards', 'success');
    } else {
      this.log('💥 ENTERPRISE COVERAGE GATES FAILED', 'error');
      this.log('❌ Code coverage below enterprise standards', 'error');
    }
    
    return gatesPassed;
  }
}

// Run coverage enforcement if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const enforcer = new TestCoverageEnforcer();
  
  enforcer.run()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Coverage enforcement crashed:', error);
      process.exit(1);
    });
}

export { TestCoverageEnforcer, ENTERPRISE_COVERAGE_GATES };