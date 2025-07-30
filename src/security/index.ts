/**
 * Enterprise-Grade Build Artifact Integrity Verification and Signing System
 * 
 * This module provides comprehensive security features for build artifact management:
 * - Digital signature generation and verification (RSA/ECDSA)
 * - Multi-algorithm integrity verification
 * - Enterprise key management and rotation
 * - Build pipeline integration
 * - Audit logging and compliance reporting
 */

export { DigitalSignatureManager } from './digital-signature-manager.js';
export { IntegrityVerificationManager } from './integrity-verification-manager.js';
export { KeyManagementSystem } from './key-management-system.js';
export { BuildPipelineIntegrator } from './build-pipeline-integrator.js';
export { SecurityAuditLogger } from './security-audit-logger.js';
export { ComplianceReporter } from './compliance-reporter.js';
export { SecurityCLI } from './security-cli.js';
export { EnterpriseSecurityManager } from './enterprise-security-manager.js';

// Type exports
export type {
  SignatureAlgorithm,
  HashAlgorithm,
  SecurityConfig,
  ArtifactManifest,
  SignatureMetadata,
  VerificationResult,
  AuditLogEntry,
  ComplianceReport,
  KeyRotationSchedule,
  HSMConfig
} from './types.js';

// Constants
export {
  SUPPORTED_SIGNATURE_ALGORITHMS,
  SUPPORTED_HASH_ALGORITHMS,
  DEFAULT_SECURITY_CONFIG,
  COMPLIANCE_STANDARDS
} from './constants.js';