/**
 * Compliance Reporter - SOX/SOC2 compliance reporting and monitoring
 * Generates comprehensive compliance reports for enterprise auditing
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { EventEmitter } from 'events';
import type {
  ComplianceReport,
  ComplianceFinding,
  ComplianceStandard,
  SecurityConfig,
  AuditLogEntry
} from './types.js';
import { SecurityAuditLogger } from './security-audit-logger.js';
import { COMPLIANCE_REQUIREMENTS } from './constants.js';

interface ComplianceRule {
  id: string;
  standard: ComplianceStandard;
  controlId: string;
  title: string;
  description: string;
  category: 'access-control' | 'audit-logging' | 'data-protection' | 'incident-response' | 'risk-management';
  severity: 'critical' | 'high' | 'medium' | 'low';
  testProcedure: string;
  expectedEvidence: string[];
  automatedCheck?: (logs: AuditLogEntry[]) => Promise<ComplianceFinding | null>;
}

interface ComplianceEvidence {
  ruleId: string;
  collectedAt: Date;
  evidenceType: 'audit-log' | 'configuration' | 'process-documentation' | 'system-output';
  evidence: any;
  verified: boolean;
  verifiedBy?: string;
  verifiedAt?: Date;
}

export class ComplianceReporter extends EventEmitter {
  private config: SecurityConfig;
  private auditLogger: SecurityAuditLogger;
  private complianceRules: Map<string, ComplianceRule> = new Map();
  private evidence: Map<string, ComplianceEvidence[]> = new Map();
  private reportDirectory: string;

  constructor(
    config: SecurityConfig,
    auditLogger: SecurityAuditLogger,
    reportDirectory: string = './reports/compliance'
  ) {
    super();
    this.config = config;
    this.auditLogger = auditLogger;
    this.reportDirectory = reportDirectory;
  }

  /**
   * Initialize compliance reporter
   */
  async initialize(): Promise<void> {
    // Create report directory
    await fs.mkdir(this.reportDirectory, { recursive: true });
    
    // Load compliance rules
    await this.loadComplianceRules();
    
    // Set up automated evidence collection
    this.startEvidenceCollection();

    this.emit('initialized');
  }

  /**
   * Generate comprehensive compliance report
   */
  async generateComplianceReport(
    standard: ComplianceStandard,
    period: { from: Date; to: Date }
  ): Promise<ComplianceReport> {
    const reportId = `${standard.toLowerCase()}-${Date.now()}`;
    const findings: ComplianceFinding[] = [];
    
    // Get applicable rules for this standard
    const applicableRules = Array.from(this.complianceRules.values())
      .filter(rule => rule.standard === standard);

    // Get audit logs for the period
    const auditLogs = await this.auditLogger.queryLogs({
      startDate: period.from,
      endDate: period.to
    });

    // Execute compliance checks
    for (const rule of applicableRules) {
      try {
        const finding = await this.executeComplianceCheck(rule, auditLogs, period);
        if (finding) {
          findings.push(finding);
        }
      } catch (error) {
        findings.push({
          severity: 'high',
          category: 'system-error',
          description: `Failed to execute compliance check for ${rule.controlId}`,
          requirement: rule.title,
          remediation: 'Review system logs and fix compliance check execution',
          artifacts: []
        });
      }
    }

    // Calculate overall status
    const criticalFindings = findings.filter(f => f.severity === 'critical');
    const highFindings = findings.filter(f => f.severity === 'high');
    const status = criticalFindings.length > 0 ? 'non-compliant' : 
                   highFindings.length > 0 ? 'partial' : 'compliant';

    // Generate recommendations
    const recommendations = this.generateComplianceRecommendations(standard, findings);

    // Calculate artifact statistics
    const artifactStats = await this.calculateArtifactStatistics(auditLogs);

    const report: ComplianceReport = {
      reportId,
      generatedAt: new Date(),
      period,
      standard,
      status,
      findings,
      recommendations,
      artifacts: artifactStats
    };

    // Save report
    await this.saveComplianceReport(report);

    // Log report generation
    await this.auditLogger.log({
      action: 'compliance_report_generated',
      actor: 'system',
      resource: 'compliance-report',
      result: 'success',
      details: {
        reportId,
        standard,
        period,
        status,
        findingsCount: findings.length
      }
    });

    this.emit('report-generated', report);
    return report;
  }

  /**
   * Generate SOX compliance report
   */
  async generateSOXReport(period: { from: Date; to: Date }): Promise<ComplianceReport> {
    const report = await this.generateComplianceReport('SOX', period);
    
    // Add SOX-specific enhancements
    await this.enhanceSOXReport(report);
    
    return report;
  }

  /**
   * Generate SOC2 compliance report
   */
  async generateSOC2Report(period: { from: Date; to: Date }): Promise<ComplianceReport> {
    const report = await this.generateComplianceReport('SOC2', period);
    
    // Add SOC2-specific enhancements
    await this.enhanceSOC2Report(report);
    
    return report;
  }

  /**
   * Continuous compliance monitoring
   */
  async startContinuousMonitoring(
    standards: ComplianceStandard[],
    intervalMs: number = 24 * 60 * 60 * 1000 // Daily
  ): Promise<() => void> {
    let isRunning = true;

    const monitor = async () => {
      if (!isRunning) return;

      try {
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const today = new Date();

        for (const standard of standards) {
          const report = await this.generateComplianceReport(standard, {
            from: yesterday,
            to: today
          });

          // Check for critical violations
          const criticalFindings = report.findings.filter(f => f.severity === 'critical');
          if (criticalFindings.length > 0) {
            this.emit('critical-violation', {
              standard,
              findings: criticalFindings,
              report
            });
          }
        }
      } catch (error) {
        this.emit('monitoring-error', { error, standards });
      }

      if (isRunning) {
        setTimeout(monitor, intervalMs);
      }
    };

    // Start monitoring
    setTimeout(monitor, intervalMs);

    // Return stop function
    return () => {
      isRunning = false;
    };
  }

  /**
   * Export compliance report in various formats
   */
  async exportReport(
    reportId: string,
    format: 'json' | 'pdf' | 'html' | 'csv' = 'json'
  ): Promise<string> {
    const report = await this.loadComplianceReport(reportId);
    if (!report) {
      throw new Error(`Report not found: ${reportId}`);
    }

    const outputPath = path.join(
      this.reportDirectory,
      'exports',
      `${reportId}.${format}`
    );

    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    switch (format) {
      case 'json':
        await fs.writeFile(outputPath, JSON.stringify(report, null, 2));
        break;
      case 'html':
        const html = await this.generateHTMLReport(report);
        await fs.writeFile(outputPath, html);
        break;
      case 'csv':
        const csv = await this.generateCSVReport(report);
        await fs.writeFile(outputPath, csv);
        break;
      case 'pdf':
        // PDF generation would require additional libraries
        throw new Error('PDF export not yet implemented');
      default:
        throw new Error(`Unsupported format: ${format}`);
    }

    return outputPath;
  }

  // Private helper methods
  private async loadComplianceRules(): Promise<void> {
    // SOX compliance rules
    const soxRules: Omit<ComplianceRule, 'id'>[] = [
      {
        standard: 'SOX',
        controlId: 'SOX-404-1',
        title: 'Financial Reporting Controls',
        description: 'All changes to financial reporting systems must be logged and auditable',
        category: 'audit-logging',
        severity: 'critical',
        testProcedure: 'Review audit logs for all financial system access and modifications',
        expectedEvidence: ['audit-logs', 'access-records', 'change-logs'],
        automatedCheck: async (logs) => {
          const financialOperations = logs.filter(log => 
            log.resource.includes('financial') || 
            log.details?.system === 'financial'
          );
          
          if (financialOperations.length === 0) {
            return {
              severity: 'medium',
              category: 'audit-logging',
              description: 'No financial system operations found in audit logs',
              requirement: 'Financial operations must be audited',
              remediation: 'Ensure all financial operations are properly logged',
              artifacts: []
            };
          }
          
          return null; // No violation found
        }
      },
      {
        standard: 'SOX',
        controlId: 'SOX-404-2',
        title: 'Segregation of Duties',
        description: 'Critical financial functions must have appropriate segregation of duties',
        category: 'access-control',
        severity: 'critical',
        testProcedure: 'Verify that no single user can both initiate and approve financial transactions',
        expectedEvidence: ['user-permissions', 'role-assignments', 'approval-workflows'],
        automatedCheck: async (logs) => {
          // Check for users performing both initiation and approval actions
          const userActions = new Map<string, Set<string>>();
          
          for (const log of logs) {
            if (!userActions.has(log.actor)) {
              userActions.set(log.actor, new Set());
            }
            userActions.get(log.actor)!.add(log.action);
          }
          
          const violations: string[] = [];
          for (const [user, actions] of userActions) {
            if (actions.has('financial_initiate') && actions.has('financial_approve')) {
              violations.push(user);
            }
          }
          
          if (violations.length > 0) {
            return {
              severity: 'critical',
              category: 'access-control',
              description: `Users with conflicting financial permissions: ${violations.join(', ')}`,
              requirement: 'Segregation of duties for financial operations',
              remediation: 'Remove conflicting permissions from identified users',
              artifacts: violations
            };
          }
          
          return null;
        }
      }
    ];

    // SOC2 compliance rules
    const soc2Rules: Omit<ComplianceRule, 'id'>[] = [
      {
        standard: 'SOC2',
        controlId: 'CC1.1',
        title: 'Control Environment - Integrity and Ethical Values',
        description: 'Security policies and procedures must be documented and enforced',
        category: 'risk-management',
        severity: 'high',
        testProcedure: 'Review security policies and evidence of enforcement',
        expectedEvidence: ['security-policies', 'policy-violations', 'training-records']
      },
      {
        standard: 'SOC2',
        controlId: 'CC6.1',
        title: 'Logical and Physical Access Controls',
        description: 'Access to systems and data must be restricted to authorized personnel',
        category: 'access-control',
        severity: 'high',
        testProcedure: 'Review access control logs and user provisioning processes',
        expectedEvidence: ['access-logs', 'user-accounts', 'permission-changes'],
        automatedCheck: async (logs) => {
          const accessViolations = logs.filter(log => 
            log.result === 'failure' && 
            log.action.includes('access')
          );
          
          if (accessViolations.length > logs.length * 0.05) { // More than 5% failures
            return {
              severity: 'high',
              category: 'access-control',
              description: `High access failure rate: ${accessViolations.length}/${logs.length} (${((accessViolations.length/logs.length)*100).toFixed(1)}%)`,
              requirement: 'Effective access controls',
              remediation: 'Investigate and reduce access control failures',
              artifacts: accessViolations.map(v => v.id)
            };
          }
          
          return null;
        }
      },
      {
        standard: 'SOC2',
        controlId: 'CC6.8',
        title: 'Data Transmission and Disposal',
        description: 'Data must be protected during transmission and properly disposed of',
        category: 'data-protection',
        severity: 'medium',
        testProcedure: 'Review encryption usage and data disposal procedures',
        expectedEvidence: ['encryption-logs', 'disposal-records', 'transmission-logs']
      }
    ];

    // Load all rules
    const allRules = [...soxRules, ...soc2Rules];
    for (const rule of allRules) {
      const ruleId = `${rule.standard}-${rule.controlId}`;
      this.complianceRules.set(ruleId, { id: ruleId, ...rule });
    }
  }

  private async executeComplianceCheck(
    rule: ComplianceRule,
    logs: AuditLogEntry[],
    period: { from: Date; to: Date }
  ): Promise<ComplianceFinding | null> {
    // Execute automated check if available
    if (rule.automatedCheck) {
      return await rule.automatedCheck(logs);
    }

    // For rules without automated checks, look for evidence
    const evidence = this.evidence.get(rule.id) || [];
    const recentEvidence = evidence.filter(e => 
      e.collectedAt >= period.from && e.collectedAt <= period.to
    );

    // If no evidence found, create a finding
    if (recentEvidence.length === 0) {
      return {
        severity: rule.severity,
        category: rule.category,
        description: `No evidence found for compliance requirement: ${rule.title}`,
        requirement: rule.description,
        remediation: `Collect evidence for ${rule.controlId}: ${rule.expectedEvidence.join(', ')}`,
        artifacts: []
      };
    }

    // Check if evidence is verified
    const unverifiedEvidence = recentEvidence.filter(e => !e.verified);
    if (unverifiedEvidence.length > 0) {
      return {
        severity: 'medium',
        category: rule.category,
        description: `Unverified evidence for ${rule.controlId}`,
        requirement: rule.description,
        remediation: 'Verify collected compliance evidence',
        artifacts: unverifiedEvidence.map(e => e.ruleId)
      };
    }

    return null; // No findings
  }

  private generateComplianceRecommendations(
    standard: ComplianceStandard,
    findings: ComplianceFinding[]
  ): string[] {
    const recommendations: string[] = [];

    const criticalFindings = findings.filter(f => f.severity === 'critical');
    const highFindings = findings.filter(f => f.severity === 'high');

    if (criticalFindings.length > 0) {
      recommendations.push(
        `Address ${criticalFindings.length} critical compliance violations immediately`,
        'Conduct emergency review of security controls and processes'
      );
    }

    if (highFindings.length > 0) {
      recommendations.push(
        `Resolve ${highFindings.length} high-priority compliance issues within 30 days`,
        'Implement additional monitoring for identified control weaknesses'
      );
    }

    // Standard-specific recommendations
    if (standard === 'SOX') {
      recommendations.push(
        'Ensure all financial system changes are properly documented and approved',
        'Implement automated controls where possible to reduce manual oversight burden',
        'Conduct quarterly access reviews for all financial system users'
      );
    } else if (standard === 'SOC2') {
      recommendations.push(
        'Review and update information security policies annually',
        'Implement continuous monitoring for access control violations',
        'Ensure all security incidents are properly documented and resolved'
      );
    }

    if (findings.length === 0) {
      recommendations.push(
        'Maintain current compliance posture through regular monitoring',
        'Consider implementing additional preventive controls',
        'Document compliance processes for future audits'
      );
    }

    return recommendations;
  }

  private async calculateArtifactStatistics(logs: AuditLogEntry[]): Promise<{
    total: number;
    signed: number;
    verified: number;
    failed: number;
  }> {
    const signatureActions = logs.filter(log => log.action.includes('sign'));
    const verificationActions = logs.filter(log => log.action.includes('verify'));
    const failedActions = logs.filter(log => log.result === 'failure');

    return {
      total: logs.length,
      signed: signatureActions.length,
      verified: verificationActions.length,
      failed: failedActions.length
    };
  }

  private async enhanceSOXReport(report: ComplianceReport): Promise<void> {
    // Add SOX-specific enhancements
    const requirements = COMPLIANCE_REQUIREMENTS.SOX;
    
    // Check audit retention compliance
    const auditRetentionDays = (Date.now() - report.period.from.getTime()) / (1000 * 60 * 60 * 24);
    if (auditRetentionDays > requirements.auditRetention) {
      report.findings.push({
        severity: 'high',
        category: 'audit-logging',
        description: `Audit logs may not meet SOX retention requirements (${Math.floor(auditRetentionDays)} days vs ${requirements.auditRetention} required)`,
        requirement: 'SOX audit log retention',
        remediation: 'Ensure audit logs are retained for required period',
        artifacts: []
      });
    }
  }

  private async enhanceSOC2Report(report: ComplianceReport): Promise<void> {
    // Add SOC2-specific enhancements
    const requirements = COMPLIANCE_REQUIREMENTS.SOC2;
    
    // Additional SOC2 trust service criteria checks would go here
  }

  private startEvidenceCollection(): void {
    // Set up automated evidence collection
    this.auditLogger.on('log-entry', (logEntry: AuditLogEntry) => {
      // Collect evidence based on log entries
      this.collectEvidenceFromAuditLog(logEntry);
    });
  }

  private async collectEvidenceFromAuditLog(logEntry: AuditLogEntry): Promise<void> {
    // Map audit log entries to compliance evidence
    const relevantRules = Array.from(this.complianceRules.values()).filter(rule =>
      rule.category === 'audit-logging' || 
      (rule.category === 'access-control' && logEntry.action.includes('access'))
    );

    for (const rule of relevantRules) {
      const evidence: ComplianceEvidence = {
        ruleId: rule.id,
        collectedAt: new Date(),
        evidenceType: 'audit-log',
        evidence: logEntry,
        verified: false
      };

      if (!this.evidence.has(rule.id)) {
        this.evidence.set(rule.id, []);
      }
      this.evidence.get(rule.id)!.push(evidence);
    }
  }

  private async saveComplianceReport(report: ComplianceReport): Promise<void> {
    const reportPath = path.join(this.reportDirectory, `${report.reportId}.json`);
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  }

  private async loadComplianceReport(reportId: string): Promise<ComplianceReport | null> {
    try {
      const reportPath = path.join(this.reportDirectory, `${reportId}.json`);
      const data = await fs.readFile(reportPath, 'utf8');
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  private async generateHTMLReport(report: ComplianceReport): Promise<string> {
    const statusColor = report.status === 'compliant' ? 'green' : 
                       report.status === 'partial' ? 'orange' : 'red';

    return `
<!DOCTYPE html>
<html>
<head>
    <title>Compliance Report - ${report.standard}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .header { border-bottom: 2px solid #333; padding-bottom: 20px; }
        .status { font-size: 18px; font-weight: bold; color: ${statusColor}; }
        .section { margin: 30px 0; }
        .finding { background: #f5f5f5; padding: 15px; margin: 10px 0; border-left: 4px solid #333; }
        .critical { border-left-color: red; }
        .high { border-left-color: orange; }
        .medium { border-left-color: yellow; }
        .low { border-left-color: green; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Compliance Report: ${report.standard}</h1>
        <p>Report ID: ${report.reportId}</p>
        <p>Generated: ${report.generatedAt.toISOString()}</p>
        <p>Period: ${report.period.from.toISOString()} to ${report.period.to.toISOString()}</p>
        <p class="status">Status: ${report.status.toUpperCase()}</p>
    </div>

    <div class="section">
        <h2>Summary</h2>
        <table>
            <tr><th>Total Findings</th><td>${report.findings.length}</td></tr>
            <tr><th>Critical</th><td>${report.findings.filter(f => f.severity === 'critical').length}</td></tr>
            <tr><th>High</th><td>${report.findings.filter(f => f.severity === 'high').length}</td></tr>
            <tr><th>Medium</th><td>${report.findings.filter(f => f.severity === 'medium').length}</td></tr>
            <tr><th>Low</th><td>${report.findings.filter(f => f.severity === 'low').length}</td></tr>
        </table>
    </div>

    <div class="section">
        <h2>Findings</h2>
        ${report.findings.map(finding => `
            <div class="finding ${finding.severity}">
                <h3>${finding.requirement}</h3>
                <p><strong>Severity:</strong> ${finding.severity}</p>
                <p><strong>Category:</strong> ${finding.category}</p>
                <p><strong>Description:</strong> ${finding.description}</p>
                <p><strong>Remediation:</strong> ${finding.remediation}</p>
            </div>
        `).join('')}
    </div>

    <div class="section">
        <h2>Recommendations</h2>
        <ul>
            ${report.recommendations.map(rec => `<li>${rec}</li>`).join('')}
        </ul>
    </div>
</body>
</html>`;
  }

  private async generateCSVReport(report: ComplianceReport): Promise<string> {
    const headers = ['Severity', 'Category', 'Requirement', 'Description', 'Remediation'];
    const csvLines = [headers.join(',')];

    for (const finding of report.findings) {
      const values = [
        finding.severity,
        finding.category,
        `"${finding.requirement.replace(/"/g, '""')}"`,
        `"${finding.description.replace(/"/g, '""')}"`,
        `"${finding.remediation.replace(/"/g, '""')}"`
      ];
      csvLines.push(values.join(','));
    }

    return csvLines.join('\n');
  }
}