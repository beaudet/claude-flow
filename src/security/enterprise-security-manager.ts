/**
 * Enterprise Security Manager - Main orchestrator for all security operations
 * Coordinates all security components and provides unified enterprise interface
 */

import { EventEmitter } from 'events';
import type {
  SecurityConfig,
  Environment,
  SecurityRole,
  AuditLogEntry,
  SecurityMetrics,
  ComplianceReport,
  ComplianceStandard
} from './types.js';
import { DigitalSignatureManager } from './digital-signature-manager.js';
import { IntegrityVerificationManager } from './integrity-verification-manager.js';
import { KeyManagementSystem } from './key-management-system.js';
import { BuildPipelineIntegrator } from './build-pipeline-integrator.js';
import { SecurityAuditLogger } from './security-audit-logger.js';
import { ComplianceReporter } from './compliance-reporter.js';
import { DEFAULT_SECURITY_CONFIG } from './constants.js';

interface UserPermissions {
  userId: string;
  roles: SecurityRole[];
  permissions: string[];
  environment: Environment[];
  lastLogin?: Date;
  sessionExpiry?: Date;
}

interface SecurityPolicy {
  id: string;
  name: string;
  description: string;
  rules: {
    minKeySize: number;
    requiredAlgorithms: string[];
    mandatoryTimestamping: boolean;
    auditRetention: number;
    multiFactorAuth: boolean;
  };
  environments: Environment[];
  enforcement: 'advisory' | 'warning' | 'blocking';
}

export class EnterpriseSecurityManager extends EventEmitter {
  public readonly config: SecurityConfig;
  public readonly signatureManager: DigitalSignatureManager;
  public readonly integrityManager: IntegrityVerificationManager;
  public readonly keyManager: KeyManagementSystem;
  public readonly buildIntegrator: BuildPipelineIntegrator;
  public readonly auditLogger: SecurityAuditLogger;
  public readonly complianceReporter: ComplianceReporter;

  private userPermissions: Map<string, UserPermissions> = new Map();
  private securityPolicies: Map<string, SecurityPolicy> = new Map();
  private activeUsers: Map<string, Date> = new Map();
  private securityMetrics: SecurityMetrics;
  private initialized: boolean = false;

  constructor(config: SecurityConfig = DEFAULT_SECURITY_CONFIG, keyStorePath?: string) {
    super();
    this.config = config;
    
    // Initialize core components
    this.signatureManager = new DigitalSignatureManager(config);
    this.integrityManager = new IntegrityVerificationManager(config);
    this.keyManager = new KeyManagementSystem(config, keyStorePath);
    this.auditLogger = new SecurityAuditLogger(config);
    this.complianceReporter = new ComplianceReporter(config, this.auditLogger);
    
    // Initialize build integrator with dependencies
    this.buildIntegrator = new BuildPipelineIntegrator(
      config,
      {
        preSignHooks: [],
        postSignHooks: [],
        verificationHooks: [],
        signOnBuild: false,
        signOnPublish: false,
        requireVerification: false,
        failOnVerificationError: true
      },
      this.signatureManager,
      this.integrityManager
    );

    // Initialize metrics
    this.securityMetrics = this.initializeMetrics();
    
    // Set up event listeners for component coordination
    this.setupEventListeners();
  }

  /**
   * Initialize the entire enterprise security system
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Initialize components in dependency order
      await this.auditLogger.initialize();
      await this.keyManager.initialize();
      await this.buildIntegrator.initialize();
      await this.complianceReporter.initialize();

      // Load security policies and user permissions
      await this.loadSecurityPolicies();
      await this.loadUserPermissions();

      // Set up default security policies if none exist
      if (this.securityPolicies.size === 0) {
        await this.createDefaultSecurityPolicies();
      }

      // Start periodic tasks
      this.startPeriodicTasks();

      this.initialized = true;

      await this.auditLogger.log({
        action: 'enterprise_security_initialized',
        actor: 'system',
        resource: 'enterprise-security-manager',
        result: 'success',
        details: {
          environment: this.config.environment,
          componentsInitialized: [
            'signature-manager',
            'integrity-manager', 
            'key-manager',
            'build-integrator',
            'audit-logger',
            'compliance-reporter'
          ]
        }
      });

      this.emit('initialized');

    } catch (error) {
      await this.auditLogger.log({
        action: 'enterprise_security_initialization_failed',
        actor: 'system',
        resource: 'enterprise-security-manager',
        result: 'failure',
        details: {
          error: error instanceof Error ? error.message : String(error)
        }
      });

      this.emit('initialization-failed', error);
      throw error;
    }
  }

  /**
   * Authenticate user and check permissions
   */
  async authenticateUser(
    userId: string,
    credentials: { password?: string; token?: string; mfa?: string },
    requiredPermissions: string[] = []
  ): Promise<{
    authenticated: boolean;
    sessionToken?: string;
    permissions: string[];
    expires: Date;
  }> {
    const userPermissions = this.userPermissions.get(userId);
    
    if (!userPermissions) {
      await this.auditLogger.log({
        action: 'authentication_failed',
        actor: userId,
        resource: 'user-authentication',
        result: 'failure',
        details: { reason: 'user_not_found' }
      });
      
      return { authenticated: false, permissions: [], expires: new Date() };
    }

    // Simple authentication (in production, integrate with enterprise auth)
    const authenticated = true; // Placeholder authentication logic

    if (!authenticated) {
      await this.auditLogger.log({
        action: 'authentication_failed',
        actor: userId,
        resource: 'user-authentication',
        result: 'failure',
        details: { reason: 'invalid_credentials' }
      });
      
      return { authenticated: false, permissions: [], expires: new Date() };
    }

    // Check required permissions
    const hasPermissions = requiredPermissions.every(permission =>
      userPermissions.permissions.includes(permission)
    );

    if (!hasPermissions) {
      await this.auditLogger.log({
        action: 'authorization_failed',
        actor: userId,
        resource: 'permission-check',
        result: 'failure',
        details: { 
          requiredPermissions,
          userPermissions: userPermissions.permissions
        }
      });
      
      return { authenticated: false, permissions: userPermissions.permissions, expires: new Date() };
    }

    // Generate session
    const sessionToken = this.generateSessionToken();
    const expires = new Date(Date.now() + 8 * 60 * 60 * 1000); // 8 hours
    
    userPermissions.lastLogin = new Date();
    userPermissions.sessionExpiry = expires;
    this.activeUsers.set(userId, new Date());

    await this.auditLogger.log({
      action: 'user_authenticated',
      actor: userId,
      resource: 'user-authentication',
      result: 'success',
      details: { 
        roles: userPermissions.roles,
        sessionExpiry: expires
      }
    });

    return {
      authenticated: true,
      sessionToken,
      permissions: userPermissions.permissions,
      expires
    };
  }

  /**
   * Check if user has specific permission
   */
  hasPermission(userId: string, permission: string, environment?: Environment): boolean {
    const userPermissions = this.userPermissions.get(userId);
    if (!userPermissions) return false;

    // Check environment access
    if (environment && !userPermissions.environment.includes(environment)) {
      return false;
    }

    // Check specific permission
    return userPermissions.permissions.includes(permission) ||
           userPermissions.permissions.includes('*'); // Admin wildcard
  }

  /**
   * Add user with roles and permissions
   */
  async addUser(
    userId: string,
    roles: SecurityRole[],
    environments: Environment[] = ['development']
  ): Promise<void> {
    const permissions = this.calculatePermissionsFromRoles(roles);
    
    const userPermissions: UserPermissions = {
      userId,
      roles,
      permissions,
      environment: environments
    };

    this.userPermissions.set(userId, userPermissions);
    
    await this.auditLogger.log({
      action: 'user_added',
      actor: 'system',
      resource: 'user-management',
      result: 'success',
      details: { userId, roles, environments, permissions }
    });

    this.emit('user-added', { userId, roles, environments });
  }

  /**
   * Update user permissions
   */
  async updateUserPermissions(
    userId: string,
    updates: Partial<Pick<UserPermissions, 'roles' | 'environment'>>
  ): Promise<void> {
    const userPermissions = this.userPermissions.get(userId);
    if (!userPermissions) {
      throw new Error(`User not found: ${userId}`);
    }

    if (updates.roles) {
      userPermissions.roles = updates.roles;
      userPermissions.permissions = this.calculatePermissionsFromRoles(updates.roles);
    }

    if (updates.environment) {
      userPermissions.environment = updates.environment;
    }

    await this.auditLogger.log({
      action: 'user_permissions_updated',
      actor: 'system',
      resource: 'user-management',
      result: 'success',
      details: { userId, updates }
    });

    this.emit('user-updated', { userId, updates });
  }

  /**
   * Create security policy
   */
  async createSecurityPolicy(policy: Omit<SecurityPolicy, 'id'>): Promise<string> {
    const policyId = `policy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const fullPolicy: SecurityPolicy = { id: policyId, ...policy };
    
    this.securityPolicies.set(policyId, fullPolicy);

    await this.auditLogger.log({
      action: 'security_policy_created',
      actor: 'system',
      resource: 'security-policy',
      result: 'success',
      details: { policyId, policyName: policy.name, environments: policy.environments }
    });

    this.emit('policy-created', fullPolicy);
    return policyId;
  }

  /**
   * Get security metrics
   */
  async getSecurityMetrics(period?: { from: Date; to: Date }): Promise<SecurityMetrics> {
    // Update metrics from components
    const keyStats = this.keyManager.getKeyUsageStatistics();
    
    this.securityMetrics = {
      ...this.securityMetrics,
      signaturesGenerated: this.getSignatureCount(),
      verificationsPerformed: this.getVerificationCount(),
      keysRotated: keyStats.totalKeys - keyStats.activeKeys,
      complianceScore: await this.calculateComplianceScore()
    };

    return this.securityMetrics;
  }

  /**
   * Generate comprehensive security report
   */
  async generateSecurityReport(options: {
    period: { from: Date; to: Date };
    includeCompliance?: boolean;
    includeAuditLogs?: boolean;
    includeMetrics?: boolean;
    standards?: ComplianceStandard[];
  }): Promise<{
    reportId: string;
    generatedAt: Date;
    period: { from: Date; to: Date };
    metrics?: SecurityMetrics;
    compliance?: ComplianceReport[];
    auditSummary?: {
      totalEntries: number;
      criticalEvents: number;
      failedOperations: number;
    };
    recommendations: string[];
  }> {
    const reportId = `security-report-${Date.now()}`;
    
    const report: any = {
      reportId,
      generatedAt: new Date(),
      period: options.period,
      recommendations: []
    };

    // Include metrics if requested
    if (options.includeMetrics) {
      report.metrics = await this.getSecurityMetrics(options.period);
    }

    // Include compliance reports if requested
    if (options.includeCompliance && options.standards) {
      report.compliance = [];
      for (const standard of options.standards) {
        const complianceReport = await this.complianceReporter.generateComplianceReport(
          standard,
          options.period
        );
        report.compliance.push(complianceReport);
      }
    }

    // Include audit summary if requested
    if (options.includeAuditLogs) {
      const auditLogs = await this.auditLogger.queryLogs({
        startDate: options.period.from,
        endDate: options.period.to
      });

      report.auditSummary = {
        totalEntries: auditLogs.length,
        criticalEvents: auditLogs.filter(log => log.logLevel === 'critical').length,
        failedOperations: auditLogs.filter(log => log.result === 'failure').length
      };
    }

    // Generate recommendations
    report.recommendations = await this.generateSecurityRecommendations(report);

    await this.auditLogger.log({
      action: 'security_report_generated',
      actor: 'system',
      resource: 'security-report',
      result: 'success',
      details: { reportId, period: options.period }
    });

    return report;
  }

  /**
   * Shutdown the security manager
   */
  async shutdown(): Promise<void> {
    await this.auditLogger.log({
      action: 'enterprise_security_shutdown',
      actor: 'system',
      resource: 'enterprise-security-manager',
      result: 'success',
      details: { shutdownTime: new Date() }
    });

    // Shutdown components
    await this.auditLogger.shutdown();
    
    // Clear periodic tasks
    this.removeAllListeners();
    
    this.emit('shutdown');
  }

  // Private helper methods
  private initializeMetrics(): SecurityMetrics {
    return {
      signaturesGenerated: 0,
      verificationsPerformed: 0,
      verificationFailures: 0,
      keysRotated: 0,
      certificatesRevoked: 0,
      auditEvents: 0,
      complianceScore: 0
    };
  }

  private setupEventListeners(): void {
    // Listen to key management events
    this.keyManager.on('key-generated', () => {
      this.securityMetrics.signaturesGenerated++;
    });

    this.keyManager.on('key-rotated', () => {
      this.securityMetrics.keysRotated++;
    });

    // Listen to audit events
    this.auditLogger.on('log-entry', () => {
      this.securityMetrics.auditEvents++;
    });

    // Listen to build pipeline events
    this.buildIntegrator.on('build-completed', (event) => {
      this.securityMetrics.signaturesGenerated += event.signatures.length;
      this.securityMetrics.verificationsPerformed += event.verificationResults.length;
      this.securityMetrics.verificationFailures += event.verificationResults.filter(r => !r.valid).length;
    });
  }

  private async loadSecurityPolicies(): Promise<void> {
    // Load from persistent storage (simplified)
    // In production, this would load from database or configuration files
  }

  private async loadUserPermissions(): Promise<void> {
    // Load from persistent storage (simplified)
    // In production, this would integrate with enterprise identity systems
  }

  private async createDefaultSecurityPolicies(): Promise<void> {
    const defaultPolicies = [
      {
        name: 'Production Security Policy',
        description: 'Strict security requirements for production environment',
        rules: {
          minKeySize: 2048,
          requiredAlgorithms: ['RSA-2048', 'RSA-4096', 'ECDSA-P256'],
          mandatoryTimestamping: true,
          auditRetention: 2555, // 7 years for SOX
          multiFactorAuth: true
        },
        environments: ['production' as Environment],
        enforcement: 'blocking' as const
      },
      {
        name: 'Development Security Policy',
        description: 'Relaxed security requirements for development',
        rules: {
          minKeySize: 1024,
          requiredAlgorithms: ['RSA-2048', 'ECDSA-P256'],
          mandatoryTimestamping: false,
          auditRetention: 30,
          multiFactorAuth: false
        },
        environments: ['development' as Environment],
        enforcement: 'warning' as const
      }
    ];

    for (const policy of defaultPolicies) {
      await this.createSecurityPolicy(policy);
    }
  }

  private calculatePermissionsFromRoles(roles: SecurityRole[]): string[] {
    const permissions: string[] = [];
    
    for (const role of roles) {
      switch (role) {
        case 'admin':
          permissions.push('*'); // All permissions
          break;
        case 'signer':
          permissions.push('key:generate', 'artifact:sign', 'key:rotate');
          break;
        case 'verifier':
          permissions.push('artifact:verify', 'integrity:check');
          break;
        case 'auditor':
          permissions.push('audit:read', 'compliance:report', 'metrics:view');
          break;
      }
    }

    return [...new Set(permissions)]; // Remove duplicates
  }

  private generateSessionToken(): string {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 16)}`;
  }

  private startPeriodicTasks(): void {
    // Update metrics every 5 minutes
    setInterval(async () => {
      try {
        await this.getSecurityMetrics();
      } catch (error) {
        this.emit('metrics-update-error', error);
      }
    }, 5 * 60 * 1000);

    // Clean up expired sessions every hour
    setInterval(() => {
      const now = new Date();
      for (const [userId, userPermissions] of this.userPermissions) {
        if (userPermissions.sessionExpiry && userPermissions.sessionExpiry < now) {
          this.activeUsers.delete(userId);
        }
      }
    }, 60 * 60 * 1000);
  }

  private getSignatureCount(): number {
    // This would query actual signature operations
    return this.securityMetrics.signaturesGenerated;
  }

  private getVerificationCount(): number {
    // This would query actual verification operations
    return this.securityMetrics.verificationsPerformed;
  }

  private async calculateComplianceScore(): Promise<number> {
    // This would calculate overall compliance score based on various factors
    const keyStats = this.keyManager.getKeyUsageStatistics();
    const expiredKeysPenalty = keyStats.expiredKeys * 10;
    const rotationScore = keyStats.upcomingRotations.length === 0 ? 100 : 80;
    
    return Math.max(0, rotationScore - expiredKeysPenalty);
  }

  private async generateSecurityRecommendations(report: any): Promise<string[]> {
    const recommendations: string[] = [];

    if (report.metrics) {
      if (report.metrics.verificationFailures > 0) {
        recommendations.push('Investigate verification failures to ensure artifact integrity');
      }

      if (report.metrics.complianceScore < 80) {
        recommendations.push('Improve compliance score by addressing key rotation and policy violations');
      }
    }

    if (report.auditSummary) {
      if (report.auditSummary.criticalEvents > 0) {
        recommendations.push('Review critical security events for potential threats');
      }

      if (report.auditSummary.failedOperations > report.auditSummary.totalEntries * 0.05) {
        recommendations.push('High failure rate detected - review system stability');
      }
    }

    // Add general security recommendations
    recommendations.push(
      'Regularly rotate signing keys according to policy',
      'Monitor audit logs for suspicious activity',
      'Keep security policies updated with industry best practices',
      'Conduct periodic security training for development teams'
    );

    return recommendations;
  }
}