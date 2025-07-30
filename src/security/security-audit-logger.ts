/**
 * Security Audit Logger - Comprehensive audit logging for security operations
 * Provides tamper-resistant logging with structured data and compliance features
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { EventEmitter } from 'events';
import type {
  AuditLogEntry,
  SecurityConfig,
  Environment,
  ComplianceStandard
} from './types.js';
import { AUDIT_RETENTION_PERIODS, COMPLIANCE_REQUIREMENTS } from './constants.js';

interface LogRotationConfig {
  maxFileSize: number; // bytes
  maxFiles: number;
  rotationInterval: 'daily' | 'weekly' | 'monthly';
  compressionEnabled: boolean;
}

interface LogEntry extends AuditLogEntry {
  logLevel: 'debug' | 'info' | 'warn' | 'error' | 'critical';
  correlationId?: string;
  parentLogId?: string;
  checksum: string;
  logSequence: number;
}

interface LogFilter {
  startDate?: Date;
  endDate?: Date;
  actions?: string[];
  actors?: string[];
  resources?: string[];
  results?: ('success' | 'failure' | 'warning')[];
  logLevels?: LogEntry['logLevel'][];
  correlationId?: string;
}

interface ComplianceLogConfig {
  standard: ComplianceStandard;
  retentionPeriod: number;
  encryptionRequired: boolean;
  integrityChecksRequired: boolean;
  externalDeliveryRequired: boolean;
  deliveryEndpoints?: string[];
}

export class SecurityAuditLogger extends EventEmitter {
  private config: SecurityConfig;
  private logDirectory: string;
  private rotationConfig: LogRotationConfig;
  private complianceConfigs: Map<ComplianceStandard, ComplianceLogConfig> = new Map();
  private currentLogFile: string;
  private logSequence: number = 0;
  private logBuffer: LogEntry[] = [];
  private bufferFlushInterval: NodeJS.Timeout;
  private rotationTimer: NodeJS.Timeout;
  private integrityKey: string;

  constructor(
    config: SecurityConfig,
    logDirectory: string = './logs/security',
    rotationConfig?: Partial<LogRotationConfig>
  ) {
    super();
    this.config = config;
    this.logDirectory = logDirectory;
    this.rotationConfig = {
      maxFileSize: 100 * 1024 * 1024, // 100MB
      maxFiles: 30,
      rotationInterval: 'daily',
      compressionEnabled: true,
      ...rotationConfig
    };
    
    // Generate integrity key for log checksums
    this.integrityKey = crypto.randomBytes(32).toString('hex');
  }

  /**
   * Initialize the audit logger
   */
  async initialize(): Promise<void> {
    // Create log directory structure
    await fs.mkdir(this.logDirectory, { recursive: true });
    await fs.mkdir(path.join(this.logDirectory, 'archive'), { recursive: true });
    await fs.mkdir(path.join(this.logDirectory, 'compliance'), { recursive: true });

    // Initialize current log file
    this.currentLogFile = await this.createNewLogFile();

    // Load existing log sequence
    await this.loadLogSequence();

    // Set up compliance configurations
    await this.initializeComplianceConfigs();

    // Start buffer flush interval (every 5 seconds)
    this.bufferFlushInterval = setInterval(() => this.flushLogBuffer(), 5000);

    // Start log rotation timer
    this.startRotationTimer();

    // Log initialization
    await this.log({
      action: 'audit_logger_initialized',
      actor: 'system',
      resource: 'audit-logger',
      result: 'success',
      details: {
        logDirectory: this.logDirectory,
        rotationConfig: this.rotationConfig,
        complianceStandards: Array.from(this.complianceConfigs.keys())
      }
    });

    this.emit('initialized');
  }

  /**
   * Log a security audit entry
   */
  async log(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<string> {
    const logEntry: LogEntry = {
      id: this.generateLogId(),
      timestamp: new Date(),
      logLevel: this.determineLogLevel(entry.action, entry.result),
      logSequence: ++this.logSequence,
      checksum: '',
      ...entry
    };

    // Generate checksum for integrity
    logEntry.checksum = this.generateLogChecksum(logEntry);

    // Add to buffer
    this.logBuffer.push(logEntry);

    // Immediate flush for critical entries
    if (logEntry.logLevel === 'critical' || logEntry.result === 'failure') {
      await this.flushLogBuffer();
    }

    // Emit event for real-time monitoring
    this.emit('log-entry', logEntry);

    return logEntry.id;
  }

  /**
   * Log security event with correlation
   */
  async logCorrelated(
    entries: Omit<AuditLogEntry, 'id' | 'timestamp'>[],
    correlationId?: string
  ): Promise<string[]> {
    const corrId = correlationId || this.generateCorrelationId();
    const logIds: string[] = [];

    for (const entry of entries) {
      const logId = await this.log({
        ...entry,
        details: {
          ...entry.details,
          correlationId: corrId
        }
      });
      logIds.push(logId);
    }

    return logIds;
  }

  /**
   * Query audit logs with filtering
   */
  async queryLogs(filter: LogFilter): Promise<LogEntry[]> {
    const results: LogEntry[] = [];
    
    // Get list of log files to search
    const logFiles = await this.getLogFiles(filter.startDate, filter.endDate);

    for (const logFile of logFiles) {
      const entries = await this.readLogFile(logFile);
      const filteredEntries = this.filterLogEntries(entries, filter);
      results.push(...filteredEntries);
    }

    // Sort by timestamp
    return results.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport(
    standard: ComplianceStandard,
    period: { from: Date; to: Date }
  ): Promise<{
    standard: ComplianceStandard;
    period: { from: Date; to: Date };
    totalEntries: number;
    entriesByAction: Record<string, number>;
    entriesByResult: Record<string, number>;
    securityEvents: LogEntry[];
    complianceViolations: LogEntry[];
    integrityVerification: {
      totalChecked: number;
      passed: number;
      failed: number;
      failedEntries: string[];
    };
    recommendations: string[];
  }> {
    const logs = await this.queryLogs({
      startDate: period.from,
      endDate: period.to
    });

    // Verify log integrity
    const integrityResults = await this.verifyLogIntegrity(logs);

    // Categorize entries
    const securityEvents = logs.filter(log => 
      ['key_generated', 'key_rotated', 'signature_created', 'verification_failed'].includes(log.action)
    );

    const complianceViolations = logs.filter(log =>
      log.result === 'failure' && log.logLevel === 'critical'
    );

    // Generate statistics
    const entriesByAction = this.groupBy(logs, 'action');
    const entriesByResult = this.groupBy(logs, 'result');

    // Generate recommendations
    const recommendations = this.generateComplianceRecommendations(
      standard,
      logs,
      complianceViolations
    );

    const report = {
      standard,
      period,
      totalEntries: logs.length,
      entriesByAction,
      entriesByResult,
      securityEvents,
      complianceViolations,
      integrityVerification: integrityResults,
      recommendations
    };

    // Save compliance report
    await this.saveComplianceReport(report);

    // Log report generation
    await this.log({
      action: 'compliance_report_generated',
      actor: 'system',
      resource: 'compliance-report',
      result: 'success',
      details: {
        standard,
        period,
        totalEntries: logs.length,
        reportId: `compliance-${standard}-${Date.now()}`
      }
    });

    return report;
  }

  /**
   * Verify log integrity
   */
  async verifyLogIntegrity(logs?: LogEntry[]): Promise<{
    totalChecked: number;
    passed: number;
    failed: number;
    failedEntries: string[];
  }> {
    const logsToCheck = logs || await this.queryLogs({});
    let passed = 0;
    let failed = 0;
    const failedEntries: string[] = [];

    for (const log of logsToCheck) {
      const expectedChecksum = this.generateLogChecksum({
        ...log,
        checksum: '' // Exclude checksum from checksum calculation
      });

      if (expectedChecksum === log.checksum) {
        passed++;
      } else {
        failed++;
        failedEntries.push(log.id);
      }
    }

    const result = {
      totalChecked: logsToCheck.length,
      passed,
      failed,
      failedEntries
    };

    if (failed > 0) {
      await this.log({
        action: 'integrity_violation_detected',
        actor: 'system',
        resource: 'audit-logs',
        result: 'failure',
        details: {
          integrityCheck: result,
          suspiciousLogIds: failedEntries
        }
      });

      this.emit('integrity-violation', result);
    }

    return result;
  }

  /**
   * Export logs for external systems
   */
  async exportLogs(
    filter: LogFilter,
    format: 'json' | 'csv' | 'syslog' | 'cef' = 'json',
    outputPath?: string
  ): Promise<string> {
    const logs = await this.queryLogs(filter);
    let exportData: string;

    switch (format) {
      case 'json':
        exportData = JSON.stringify(logs, null, 2);
        break;
      case 'csv':
        exportData = this.convertToCSV(logs);
        break;
      case 'syslog':
        exportData = this.convertToSyslog(logs);
        break;
      case 'cef':
        exportData = this.convertToCEF(logs);
        break;
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }

    const exportPath = outputPath || path.join(
      this.logDirectory,
      'exports',
      `audit-export-${Date.now()}.${format}`
    );

    await fs.mkdir(path.dirname(exportPath), { recursive: true });
    await fs.writeFile(exportPath, exportData);

    await this.log({
      action: 'logs_exported',
      actor: 'system',
      resource: 'audit-logs',
      result: 'success',
      details: {
        format,
        exportPath,
        logCount: logs.length,
        filter
      }
    });

    return exportPath;
  }

  /**
   * Archive old logs according to retention policy
   */
  async archiveLogs(): Promise<{
    archivedFiles: string[];
    deletedFiles: string[];
    totalSize: number;
  }> {
    const retentionPeriod = AUDIT_RETENTION_PERIODS[this.config.environment];
    const cutoffDate = new Date(Date.now() - retentionPeriod * 24 * 60 * 60 * 1000);
    
    const allLogFiles = await this.getAllLogFiles();
    const archivedFiles: string[] = [];
    const deletedFiles: string[] = [];
    let totalSize = 0;

    for (const logFile of allLogFiles) {
      const stats = await fs.stat(logFile);
      
      if (stats.mtime < cutoffDate) {
        // Check if this log file is required for compliance
        const isComplianceRequired = await this.isLogRequiredForCompliance(logFile);
        
        if (isComplianceRequired) {
          // Archive instead of delete
          const archivePath = await this.archiveLogFile(logFile);
          archivedFiles.push(archivePath);
          totalSize += stats.size;
        } else {
          // Delete old logs
          await fs.unlink(logFile);
          deletedFiles.push(logFile);
        }
      }
    }

    await this.log({
      action: 'logs_archived',
      actor: 'system',
      resource: 'audit-logs',
      result: 'success',
      details: {
        archivedCount: archivedFiles.length,
        deletedCount: deletedFiles.length,
        totalSizeArchived: totalSize,
        retentionPeriodDays: retentionPeriod
      }
    });

    return { archivedFiles, deletedFiles, totalSize };
  }

  // Private helper methods
  private async createNewLogFile(): Promise<string> {
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `security-audit-${timestamp}-${Date.now()}.log`;
    const filepath = path.join(this.logDirectory, filename);
    
    // Create file with header
    const header = {
      version: '1.0',
      created: new Date(),
      environment: this.config.environment,
      integrityKey: crypto.createHash('sha256').update(this.integrityKey).digest('hex').substring(0, 16)
    };
    
    await fs.writeFile(filepath, JSON.stringify(header) + '\n');
    return filepath;
  }

  private async flushLogBuffer(): Promise<void> {
    if (this.logBuffer.length === 0) return;

    const entries = [...this.logBuffer];
    this.logBuffer = [];

    // Write entries to log file
    const logData = entries.map(entry => JSON.stringify(entry)).join('\n') + '\n';
    
    try {
      await fs.appendFile(this.currentLogFile, logData);
      
      // Check if log rotation is needed
      const stats = await fs.stat(this.currentLogFile);
      if (stats.size >= this.rotationConfig.maxFileSize) {
        await this.rotateLogFile();
      }
    } catch (error) {
      // If write fails, put entries back in buffer
      this.logBuffer.unshift(...entries);
      this.emit('log-write-error', error);
    }
  }

  private async rotateLogFile(): Promise<void> {
    const oldFile = this.currentLogFile;
    this.currentLogFile = await this.createNewLogFile();
    
    // Compress old file if configured
    if (this.rotationConfig.compressionEnabled) {
      await this.compressLogFile(oldFile);
    }

    // Clean up old files
    await this.cleanupOldLogFiles();

    this.emit('log-rotated', { oldFile, newFile: this.currentLogFile });
  }

  private generateLogId(): string {
    return `log-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
  }

  private generateCorrelationId(): string {
    return `corr-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
  }

  private generateLogChecksum(entry: Omit<LogEntry, 'checksum'>): string {
    const data = JSON.stringify(entry, Object.keys(entry).sort());
    return crypto.createHmac('sha256', this.integrityKey).update(data).digest('hex');
  }

  private determineLogLevel(action: string, result: string): LogEntry['logLevel'] {
    if (result === 'failure') {
      if (action.includes('critical') || action.includes('security')) {
        return 'critical';
      }
      return 'error';
    }
    
    if (result === 'warning') {
      return 'warn';
    }
    
    if (action.includes('debug')) {
      return 'debug';
    }
    
    return 'info';
  }

  private async initializeComplianceConfigs(): Promise<void> {
    for (const [standard, requirements] of Object.entries(COMPLIANCE_REQUIREMENTS)) {
      const config: ComplianceLogConfig = {
        standard: standard as ComplianceStandard,
        retentionPeriod: requirements.auditRetention,
        encryptionRequired: this.config.environment === 'production',
        integrityChecksRequired: true,
        externalDeliveryRequired: standard === 'SOX'
      };
      
      this.complianceConfigs.set(standard as ComplianceStandard, config);
    }
  }

  private async loadLogSequence(): Promise<void> {
    try {
      const sequenceFile = path.join(this.logDirectory, '.sequence');
      const data = await fs.readFile(sequenceFile, 'utf8');
      this.logSequence = parseInt(data, 10) || 0;
    } catch {
      this.logSequence = 0;
    }
  }

  private async saveLogSequence(): Promise<void> {
    const sequenceFile = path.join(this.logDirectory, '.sequence');
    await fs.writeFile(sequenceFile, this.logSequence.toString());
  }

  private startRotationTimer(): void {
    const interval = this.rotationConfig.rotationInterval === 'daily' 
      ? 24 * 60 * 60 * 1000
      : this.rotationConfig.rotationInterval === 'weekly'
      ? 7 * 24 * 60 * 60 * 1000
      : 30 * 24 * 60 * 60 * 1000;

    this.rotationTimer = setInterval(() => {
      this.rotateLogFile().catch(error => 
        this.emit('rotation-error', error)
      );
    }, interval);
  }

  private async readLogFile(filePath: string): Promise<LogEntry[]> {
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.split('\n').filter(line => line.trim());
    
    // Skip header line
    const entries: LogEntry[] = [];
    for (let i = 1; i < lines.length; i++) {
      try {
        const entry = JSON.parse(lines[i]) as LogEntry;
        entries.push(entry);
      } catch {
        // Skip malformed entries
      }
    }
    
    return entries;
  }

  private filterLogEntries(entries: LogEntry[], filter: LogFilter): LogEntry[] {
    return entries.filter(entry => {
      if (filter.startDate && entry.timestamp < filter.startDate) return false;
      if (filter.endDate && entry.timestamp > filter.endDate) return false;
      if (filter.actions && !filter.actions.includes(entry.action)) return false;
      if (filter.actors && !filter.actors.includes(entry.actor)) return false;
      if (filter.resources && !filter.resources.includes(entry.resource)) return false;
      if (filter.results && !filter.results.includes(entry.result)) return false;
      if (filter.logLevels && !filter.logLevels.includes(entry.logLevel)) return false;
      if (filter.correlationId && entry.details?.correlationId !== filter.correlationId) return false;
      return true;
    });
  }

  private async getLogFiles(startDate?: Date, endDate?: Date): Promise<string[]> {
    const files = await fs.readdir(this.logDirectory);
    const logFiles = files
      .filter(file => file.startsWith('security-audit-') && file.endsWith('.log'))
      .map(file => path.join(this.logDirectory, file));

    if (!startDate && !endDate) {
      return logFiles;
    }

    // Filter files based on date range (simplified)
    const filteredFiles: string[] = [];
    for (const file of logFiles) {
      const stats = await fs.stat(file);
      if ((!startDate || stats.ctime >= startDate) && (!endDate || stats.ctime <= endDate)) {
        filteredFiles.push(file);
      }
    }

    return filteredFiles;
  }

  private groupBy<T>(array: T[], key: keyof T): Record<string, number> {
    return array.reduce((acc, item) => {
      const groupKey = String(item[key]);
      acc[groupKey] = (acc[groupKey] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  private generateComplianceRecommendations(
    standard: ComplianceStandard,
    logs: LogEntry[],
    violations: LogEntry[]
  ): string[] {
    const recommendations: string[] = [];

    if (violations.length > 0) {
      recommendations.push(
        `Address ${violations.length} compliance violations immediately`,
        'Implement additional monitoring for critical security operations',
        'Review and strengthen access controls for sensitive operations'
      );
    }

    const failureRate = logs.filter(l => l.result === 'failure').length / logs.length;
    if (failureRate > 0.05) {
      recommendations.push(
        'High failure rate detected - review system stability and error handling',
        'Implement automated alerting for recurring failures'
      );
    }

    if (standard === 'SOX') {
      recommendations.push(
        'Ensure all financial system access is properly logged and monitored',
        'Implement separation of duties for critical financial operations'
      );
    }

    return recommendations;
  }

  private async saveComplianceReport(report: any): Promise<void> {
    const reportPath = path.join(
      this.logDirectory,
      'compliance',
      `compliance-${report.standard}-${Date.now()}.json`
    );
    
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  }

  private convertToCSV(logs: LogEntry[]): string {
    const headers = ['timestamp', 'action', 'actor', 'resource', 'result', 'logLevel', 'id'];
    const csvLines = [headers.join(',')];
    
    for (const log of logs) {
      const values = headers.map(header => {
        const value = log[header as keyof LogEntry];
        return typeof value === 'string' ? `"${value.replace(/"/g, '""')}"` : String(value);
      });
      csvLines.push(values.join(','));
    }
    
    return csvLines.join('\n');
  }

  private convertToSyslog(logs: LogEntry[]): string {
    return logs.map(log => {
      const priority = this.getSyslogPriority(log.logLevel);
      const timestamp = log.timestamp.toISOString();
      return `<${priority}>${timestamp} claude-flow security: ${log.action} by ${log.actor} on ${log.resource} - ${log.result}`;
    }).join('\n');
  }

  private convertToCEF(logs: LogEntry[]): string {
    return logs.map(log => {
      return `CEF:0|Claude Flow|Security|1.0|${log.action}|${log.action}|${this.getCEFSeverity(log.logLevel)}|act=${log.action} suser=${log.actor} dst=${log.resource} outcome=${log.result}`;
    }).join('\n');
  }

  private getSyslogPriority(logLevel: LogEntry['logLevel']): number {
    const priorities = {
      debug: 135,
      info: 134,
      warn: 132,
      error: 131,
      critical: 130
    };
    return priorities[logLevel] || 134;
  }

  private getCEFSeverity(logLevel: LogEntry['logLevel']): number {
    const severities = {
      debug: 1,
      info: 3,
      warn: 6,
      error: 8,
      critical: 10
    };
    return severities[logLevel] || 3;
  }

  private async getAllLogFiles(): Promise<string[]> {
    const files = await fs.readdir(this.logDirectory);
    return files
      .filter(file => file.startsWith('security-audit-') && file.endsWith('.log'))
      .map(file => path.join(this.logDirectory, file));
  }

  private async isLogRequiredForCompliance(logFile: string): Promise<boolean> {
    // Check if the log contains compliance-critical entries
    const entries = await this.readLogFile(logFile);
    return entries.some(entry => 
      entry.action.includes('signature') || 
      entry.action.includes('key') ||
      entry.result === 'failure'
    );
  }

  private async archiveLogFile(logFile: string): Promise<string> {
    const archivePath = path.join(
      this.logDirectory,
      'archive',
      path.basename(logFile) + '.gz'
    );
    
    // Simple compression (in production, use proper compression library)
    const content = await fs.readFile(logFile);
    await fs.writeFile(archivePath, content); // Simplified
    await fs.unlink(logFile);
    
    return archivePath;
  }

  private async compressLogFile(logFile: string): Promise<void> {
    // Compression implementation would go here
    // For now, just rename to indicate it's compressed
    const compressedPath = logFile + '.gz';
    await fs.rename(logFile, compressedPath);
  }

  private async cleanupOldLogFiles(): Promise<void> {
    const allFiles = await this.getAllLogFiles();
    if (allFiles.length > this.rotationConfig.maxFiles) {
      // Sort by creation time and remove oldest
      const sortedFiles = await Promise.all(
        allFiles.map(async file => ({
          file,
          stats: await fs.stat(file)
        }))
      );
      
      sortedFiles.sort((a, b) => a.stats.ctime.getTime() - b.stats.ctime.getTime());
      
      // Remove excess files
      const filesToRemove = sortedFiles.slice(0, sortedFiles.length - this.rotationConfig.maxFiles);
      for (const { file } of filesToRemove) {
        await fs.unlink(file);
      }
    }
  }

  /**
   * Cleanup on shutdown
   */
  async shutdown(): Promise<void> {
    if (this.bufferFlushInterval) {
      clearInterval(this.bufferFlushInterval);
    }
    
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
    }
    
    // Flush remaining logs
    await this.flushLogBuffer();
    
    // Save log sequence
    await this.saveLogSequence();
    
    this.emit('shutdown');
  }
}