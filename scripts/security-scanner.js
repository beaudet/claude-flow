#!/usr/bin/env node

/**
 * Enterprise Security Scanner
 * Implements comprehensive security scanning with vulnerability detection
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import path from 'path';

const ENTERPRISE_SECURITY_GATES = {
  MAX_HIGH_VULNERABILITIES: 0,
  MAX_MEDIUM_VULNERABILITIES: 5,
  MAX_LOW_VULNERABILITIES: 20,
  MAX_SECRETS_DETECTED: 0,
  BLOCKED_DEPENDENCIES: [
    // Known vulnerable packages
    'event-stream@3.3.6', // Malicious code injection
    'eslint-scope@3.7.2', // Malicious code
    'flatmap-stream@0.1.1' // Part of event-stream attack
  ],
};

const SECURITY_PATTERNS = [
  // API Keys and secrets
  { name: 'API Keys', pattern: /(?:api[_-]?key|apikey)\s*[=:]\s*['"`]([^'"`\s]+)['"`]/gi, severity: 'high' },
  { name: 'AWS Keys', pattern: /AKIA[0-9A-Z]{16}/g, severity: 'high' },
  { name: 'Private Keys', pattern: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/g, severity: 'high' },
  { name: 'Database URLs', pattern: /(?:mongodb|mysql|postgres|redis):\/\/[^\s'"]+/gi, severity: 'medium' },
  { name: 'JWT Tokens', pattern: /eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*/g, severity: 'medium' },
  { name: 'Generic Secrets', pattern: /(?:password|secret|token|key)\s*[=:]\s*['"`]([^'"`\s]{8,})['"`]/gi, severity: 'medium' },
  { name: 'Hardcoded IPs', pattern: /(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)/g, severity: 'low' },
  // Security anti-patterns
  { name: 'eval() usage', pattern: /\beval\s*\(/g, severity: 'high' },
  { name: 'innerHTML usage', pattern: /\.innerHTML\s*=/g, severity: 'medium' },
  { name: 'document.write usage', pattern: /document\.write\s*\(/g, severity: 'medium' },
];

class EnterpriseSecurityScanner {
  constructor() {
    this.results = {
      dependencies: null,
      secrets: null,
      patterns: null,
      files: null,
    };
    this.findings = {
      high: [],
      medium: [],
      low: [],
      info: [],
    };
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = {
      info: '🔒',
      success: '✅',
      warning: '⚠️',
      error: '❌',
      progress: '🔄',
      security: '🛡️',
    }[type];
    
    console.log(`${prefix} [${timestamp}] ${message}`);
  }

  async scanDependencyVulnerabilities() {
    this.log('Scanning dependency vulnerabilities...', 'progress');
    
    try {
      // Run npm audit with JSON output
      const auditOutput = execSync('npm audit --json', { 
        encoding: 'utf8',
        stdio: 'pipe',
        maxBuffer: 1024 * 1024 * 10 // 10MB buffer
      });
      
      const auditData = JSON.parse(auditOutput);
      this.results.dependencies = { success: true, data: auditData };
      
      this.log(`Found ${auditData.metadata?.vulnerabilities?.total || 0} total vulnerabilities`, 'info');
      
      return this.processDependencyVulnerabilities(auditData);
    } catch (error) {
      // npm audit exits with non-zero code when vulnerabilities are found
      try {
        const auditData = JSON.parse(error.stdout || '{}');
        this.results.dependencies = { success: true, data: auditData };
        return this.processDependencyVulnerabilities(auditData);
      } catch (parseError) {
        this.results.dependencies = { 
          success: false, 
          error: error.message,
          stdout: error.stdout || '',
          stderr: error.stderr || '',
        };
        
        this.log('Dependency vulnerability scan failed', 'warning');
        return { high: 0, medium: 0, low: 0 };
      }
    }
  }

  processDependencyVulnerabilities(auditData) {
    const vulnerabilities = auditData.vulnerabilities || {};
    const counts = { high: 0, medium: 0, low: 0, info: 0 };
    
    for (const [packageName, vulnData] of Object.entries(vulnerabilities)) {
      const severity = vulnData.severity;
      const via = Array.isArray(vulnData.via) ? vulnData.via : [vulnData.via];
      
      via.forEach(vulnerability => {
        if (typeof vulnerability === 'object' && vulnerability.title) {
          const finding = {
            type: 'dependency-vulnerability',
            severity: severity,
            package: packageName,
            title: vulnerability.title,
            url: vulnerability.url,
            range: vulnData.range,
          };
          
          this.findings[severity]?.push(finding) || this.findings.info.push(finding);
          counts[severity] = (counts[severity] || 0) + 1;
        }
      });
    }
    
    return counts;
  }

  async scanForSecrets() {
    this.log('Scanning for hardcoded secrets and sensitive data...', 'progress');
    
    const secretFindings = [];
    const filesToScan = await this.getFilesToScan();
    
    for (const filePath of filesToScan) {
      try {
        const content = readFileSync(filePath, 'utf8');
        const fileFindings = this.scanFileForSecrets(filePath, content);
        secretFindings.push(...fileFindings);
      } catch (error) {
        this.log(`Error scanning ${filePath}: ${error.message}`, 'warning');
      }
    }
    
    this.results.secrets = { success: true, findings: secretFindings };
    
    // Categorize secret findings by severity
    secretFindings.forEach(finding => {
      this.findings[finding.severity].push(finding);
    });
    
    this.log(`Found ${secretFindings.length} potential secrets/patterns`, 'info');
    return secretFindings.length;
  }

  async getFilesToScan() {
    try {
      // Get all tracked files, excluding binaries and dependencies
      const gitFiles = execSync('git ls-files', { encoding: 'utf8' })
        .split('\n')
        .filter(file => file && 
          !file.includes('node_modules') &&
          !file.includes('dist') &&
          !file.includes('.git') &&
          !file.match(/\.(png|jpg|jpeg|gif|ico|pdf|zip|tar|gz|exe|bin)$/i) &&
          (file.endsWith('.ts') || file.endsWith('.js') || file.endsWith('.json') || 
           file.endsWith('.md') || file.endsWith('.yml') || file.endsWith('.yaml'))
        );
      
      return gitFiles;
    } catch (error) {
      this.log('Could not get git files, scanning src directory', 'warning');
      
      // Fallback to scanning src directory
      const srcFiles = execSync('find src -type f \\( -name "*.ts" -o -name "*.js" \\)', { encoding: 'utf8' })
        .split('\n')
        .filter(file => file);
      
      return srcFiles;
    }
  }

  scanFileForSecrets(filePath, content) {
    const findings = [];
    const lines = content.split('\n');
    
    SECURITY_PATTERNS.forEach(pattern => {
      let match;
      const regex = new RegExp(pattern.pattern.source, pattern.pattern.flags);
      
      lines.forEach((line, lineNumber) => {
        while ((match = regex.exec(line)) !== null) {
          // Skip false positives
          if (this.isFalsePositive(line, match[0], pattern.name)) {
            continue;
          }
          
          findings.push({
            type: 'secret-pattern',
            severity: pattern.severity,
            file: filePath,
            line: lineNumber + 1,
            pattern: pattern.name,
            match: match[0],
            context: line.trim(),
          });
        }
      });
    });
    
    return findings;
  }

  isFalsePositive(line, match, patternName) {
    // Skip comments and documentation
    if (line.trim().startsWith('//') || line.trim().startsWith('*') || line.trim().startsWith('#')) {
      return true;
    }
    
    // Skip test files with dummy data
    if (line.includes('test') || line.includes('example') || line.includes('demo')) {
      return true;
    }
    
    // Skip environment variable references
    if (line.includes('process.env') || line.includes('${}') || line.includes('${')) {
      return true;
    }
    
    // Skip placeholder values
    const placeholders = ['your-api-key', 'your-secret', 'example', 'dummy', 'test', 'placeholder'];
    if (placeholders.some(placeholder => match.toLowerCase().includes(placeholder))) {
      return true;
    }
    
    return false;
  }

  async checkBlockedDependencies() {
    this.log('Checking for blocked/malicious dependencies...', 'progress');
    
    if (!existsSync('package-lock.json')) {
      this.log('No package-lock.json found, skipping dependency check', 'warning');
      return [];
    }
    
    const lockFile = JSON.parse(readFileSync('package-lock.json', 'utf8'));
    const blockedFindings = [];
    
    // Check dependencies in lock file
    const dependencies = lockFile.dependencies || {};
    
    for (const [packageName, packageData] of Object.entries(dependencies)) {
      const version = packageData.version;
      const packageSpec = `${packageName}@${version}`;
      
      if (ENTERPRISE_SECURITY_GATES.BLOCKED_DEPENDENCIES.includes(packageSpec)) {
        blockedFindings.push({
          type: 'blocked-dependency',
          severity: 'high',
          package: packageName,
          version: version,
          reason: 'Known malicious package',
        });
      }
    }
    
    blockedFindings.forEach(finding => {
      this.findings.high.push(finding);
    });
    
    return blockedFindings;
  }

  async enforceSecurityGates() {
    this.log('Enforcing enterprise security quality gates...', 'progress');
    
    const violations = [];
    
    // Count findings by severity
    const counts = {
      high: this.findings.high.length,
      medium: this.findings.medium.length,
      low: this.findings.low.length,
    };
    
    // High vulnerability gate
    if (counts.high > ENTERPRISE_SECURITY_GATES.MAX_HIGH_VULNERABILITIES) {
      violations.push(`${counts.high} high-severity security issues exceed maximum of ${ENTERPRISE_SECURITY_GATES.MAX_HIGH_VULNERABILITIES}`);
    }
    
    // Medium vulnerability gate
    if (counts.medium > ENTERPRISE_SECURITY_GATES.MAX_MEDIUM_VULNERABILITIES) {
      violations.push(`${counts.medium} medium-severity security issues exceed maximum of ${ENTERPRISE_SECURITY_GATES.MAX_MEDIUM_VULNERABILITIES}`);
    }
    
    // Low vulnerability gate
    if (counts.low > ENTERPRISE_SECURITY_GATES.MAX_LOW_VULNERABILITIES) {
      violations.push(`${counts.low} low-severity security issues exceed maximum of ${ENTERPRISE_SECURITY_GATES.MAX_LOW_VULNERABILITIES}`);
    }

    if (violations.length > 0) {
      this.log(`❌ Security quality gates failed:`, 'error');
      violations.forEach(violation => this.log(`  - ${violation}`, 'error'));
      return false;
    }

    this.log('✅ All security quality gates passed!', 'success');
    return true;
  }

  async generateSecurityReport() {
    this.log('Generating enterprise security report...', 'progress');
    
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        high: this.findings.high.length,
        medium: this.findings.medium.length,
        low: this.findings.low.length,
        total: this.findings.high.length + this.findings.medium.length + this.findings.low.length,
      },
      findings: this.findings,
      gates: ENTERPRISE_SECURITY_GATES,
      recommendations: this.generateSecurityRecommendations(),
    };

    // Write detailed report
    writeFileSync('security/enterprise-security-report.json', JSON.stringify(report, null, 2));
    
    // Generate markdown report
    const markdownReport = this.generateMarkdownSecurityReport(report);
    writeFileSync('security/enterprise-security-report.md', markdownReport);
    
    this.log('Security reports generated:', 'success');
    this.log('  - security/enterprise-security-report.json', 'info');
    this.log('  - security/enterprise-security-report.md', 'info');
    
    return report;
  }

  generateSecurityRecommendations() {
    const recommendations = [];
    
    if (this.findings.high.length > 0) {
      recommendations.push('⚠️ CRITICAL: Address all high-severity security issues immediately');
      recommendations.push('Run `npm audit fix` to automatically fix dependency vulnerabilities');
    }
    
    if (this.findings.medium.length > 0) {
      recommendations.push('Review and address medium-severity security issues');
    }
    
    // Secret-specific recommendations
    const secretFindings = [...this.findings.high, ...this.findings.medium, ...this.findings.low]
      .filter(f => f.type === 'secret-pattern');
    
    if (secretFindings.length > 0) {
      recommendations.push('Remove all hardcoded secrets and use environment variables');
      recommendations.push('Consider using a secrets management service (AWS Secrets Manager, HashiCorp Vault)');
      recommendations.push('Add pre-commit hooks to prevent secrets from being committed');
    }
    
    recommendations.push('Keep dependencies up to date with regular security patches');
    recommendations.push('Enable automated security scanning in CI/CD pipeline');
    recommendations.push('Review and follow OWASP security best practices');
    
    return recommendations;
  }

  generateMarkdownSecurityReport(report) {
    return `# Enterprise Security Report

**Generated:** ${report.timestamp}
**Status:** ${report.summary.total === 0 ? 'SECURE' : 'ISSUES FOUND'}

## Security Summary

| Severity | Count | Status |
|----------|-------|--------|
| **High** | ${report.summary.high} | ${report.summary.high <= ENTERPRISE_SECURITY_GATES.MAX_HIGH_VULNERABILITIES ? '✅' : '❌'} |
| **Medium** | ${report.summary.medium} | ${report.summary.medium <= ENTERPRISE_SECURITY_GATES.MAX_MEDIUM_VULNERABILITIES ? '✅' : '❌'} |  
| **Low** | ${report.summary.low} | ${report.summary.low <= ENTERPRISE_SECURITY_GATES.MAX_LOW_VULNERABILITIES ? '✅' : '❌'} |
| **Total** | ${report.summary.total} | - |

## Enterprise Security Gates

- **Maximum High Vulnerabilities:** ${ENTERPRISE_SECURITY_GATES.MAX_HIGH_VULNERABILITIES}
- **Maximum Medium Vulnerabilities:** ${ENTERPRISE_SECURITY_GATES.MAX_MEDIUM_VULNERABILITIES}
- **Maximum Low Vulnerabilities:** ${ENTERPRISE_SECURITY_GATES.MAX_LOW_VULNERABILITIES}
- **Maximum Secrets Detected:** ${ENTERPRISE_SECURITY_GATES.MAX_SECRETS_DETECTED}

## Security Findings

### High Severity Issues
${report.findings.high.length > 0 ? report.findings.high.map(f => `- **${f.type}**: ${f.title || f.pattern || f.reason} ${f.file ? `(${f.file}:${f.line})` : ''}`).join('\n') : 'None found ✅'}

### Medium Severity Issues  
${report.findings.medium.length > 0 ? report.findings.medium.map(f => `- **${f.type}**: ${f.title || f.pattern || f.reason} ${f.file ? `(${f.file}:${f.line})` : ''}`).join('\n') : 'None found ✅'}

### Low Severity Issues
${report.findings.low.length > 5 ? `${report.findings.low.slice(0, 5).map(f => `- **${f.type}**: ${f.title || f.pattern || f.reason} ${f.file ? `(${f.file}:${f.line})` : ''}`).join('\n')}\n... and ${report.findings.low.length - 5} more (see JSON report for details)` : report.findings.low.map(f => `- **${f.type}**: ${f.title || f.pattern || f.reason} ${f.file ? `(${f.file}:${f.line})` : ''}`).join('\n') || 'None found ✅'}

## Recommendations

${report.recommendations.map(rec => `- ${rec}`).join('\n')}

## Next Steps

1. Review detailed findings in \`security/enterprise-security-report.json\`
2. Address high-severity issues immediately
3. Plan remediation for medium and low severity issues
4. Implement automated security scanning in CI/CD
5. Regular security reviews and dependency updates

---

*Generated by Enterprise Security Scanner*
`;
  }

  async run() {
    this.log('🚀 Starting Enterprise Security Scan', 'security');
    this.log(`Security Gates: Max ${ENTERPRISE_SECURITY_GATES.MAX_HIGH_VULNERABILITIES} high, ${ENTERPRISE_SECURITY_GATES.MAX_MEDIUM_VULNERABILITIES} medium, ${ENTERPRISE_SECURITY_GATES.MAX_LOW_VULNERABILITIES} low severity issues`, 'info');
    
    // Create security directory if it doesn't exist
    try {
      execSync('mkdir -p security', { stdio: 'pipe' });
    } catch (error) {
      // Directory might already exist
    }
    
    // Scan dependency vulnerabilities
    await this.scanDependencyVulnerabilities();
    
    // Scan for secrets and patterns
    await this.scanForSecrets();
    
    // Check blocked dependencies
    await this.checkBlockedDependencies();
    
    // Enforce security gates
    const gatesPassed = await this.enforceSecurityGates();
    
    // Generate comprehensive report
    const report = await this.generateSecurityReport();
    
    this.log('', 'info');
    this.log('🛡️ ENTERPRISE SECURITY REPORT', 'security');
    this.log('==============================', 'info');
    this.log(`High Severity: ${report.summary.high}`, report.summary.high === 0 ? 'success' : 'error');
    this.log(`Medium Severity: ${report.summary.medium}`, report.summary.medium <= ENTERPRISE_SECURITY_GATES.MAX_MEDIUM_VULNERABILITIES ? 'success' : 'warning');
    this.log(`Low Severity: ${report.summary.low}`, report.summary.low <= ENTERPRISE_SECURITY_GATES.MAX_LOW_VULNERABILITIES ? 'success' : 'warning');
    this.log(`Total Issues: ${report.summary.total}`, 'info');
    this.log('', 'info');
    
    if (gatesPassed) {
      this.log('🎉 ENTERPRISE SECURITY GATES PASSED', 'success');
      this.log('✅ Security scan meets enterprise standards', 'success');
    } else {
      this.log('💥 ENTERPRISE SECURITY GATES FAILED', 'error');
      this.log('❌ Security issues exceed enterprise thresholds', 'error');
    }
    
    return gatesPassed;
  }
}

// Run security scan if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const scanner = new EnterpriseSecurityScanner();
  
  scanner.run()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Security scan crashed:', error);
      process.exit(1);
    });
}

export { EnterpriseSecurityScanner, ENTERPRISE_SECURITY_GATES };