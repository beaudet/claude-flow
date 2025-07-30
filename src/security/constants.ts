/**
 * Security system constants and default configurations
 */

import type { 
  SignatureAlgorithm, 
  HashAlgorithm, 
  SecurityConfig, 
  ComplianceStandard 
} from './types.js';

export const SUPPORTED_SIGNATURE_ALGORITHMS: SignatureAlgorithm[] = [
  'RSA-2048',
  'RSA-3072',
  'RSA-4096',
  'ECDSA-P256',
  'ECDSA-P384',
  'ECDSA-P521'
];

export const SUPPORTED_HASH_ALGORITHMS: HashAlgorithm[] = [
  'SHA-256',
  'SHA-384',
  'SHA-512',
  'BLAKE2b',
  'BLAKE2s'
];

export const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  environment: 'development',
  signatureAlgorithm: 'ECDSA-P256',
  hashAlgorithm: 'SHA-256',
  keySize: 256,
  certificateChainValidation: true,
  timestampingEnabled: true,
  auditLogging: true,
  complianceMode: false
};

export const PRODUCTION_SECURITY_CONFIG: SecurityConfig = {
  environment: 'production',
  signatureAlgorithm: 'RSA-4096',
  hashAlgorithm: 'SHA-512',
  keySize: 4096,
  certificateChainValidation: true,
  timestampingEnabled: true,
  auditLogging: true,
  complianceMode: true
};

export const COMPLIANCE_STANDARDS: ComplianceStandard[] = [
  'SOX',
  'SOC2',
  'ISO27001',
  'NIST',
  'GDPR'
];

export const KEY_SIZES: Record<SignatureAlgorithm, number> = {
  'RSA-2048': 2048,
  'RSA-3072': 3072,
  'RSA-4096': 4096,
  'ECDSA-P256': 256,
  'ECDSA-P384': 384,
  'ECDSA-P521': 521
};

export const ALGORITHM_OIDS: Record<SignatureAlgorithm, string> = {
  'RSA-2048': '1.2.840.113549.1.1.11',
  'RSA-3072': '1.2.840.113549.1.1.11',
  'RSA-4096': '1.2.840.113549.1.1.11',
  'ECDSA-P256': '1.2.840.10045.4.3.2',
  'ECDSA-P384': '1.2.840.10045.4.3.3',
  'ECDSA-P521': '1.2.840.10045.4.3.4'
};

export const HASH_OIDS: Record<HashAlgorithm, string> = {
  'SHA-256': '2.16.840.1.101.3.4.2.1',
  'SHA-384': '2.16.840.1.101.3.4.2.2',
  'SHA-512': '2.16.840.1.101.3.4.2.3',
  'BLAKE2b': '1.3.6.1.4.1.1722.12.2.1.16',
  'BLAKE2s': '1.3.6.1.4.1.1722.12.2.1.8'
};

export const CERTIFICATE_VALIDITY_PERIODS = {
  development: 90, // days
  staging: 365,    // days
  production: 1095 // days (3 years)
};

export const KEY_ROTATION_SCHEDULES = {
  development: 30,  // days
  staging: 90,      // days
  production: 365   // days
};

export const AUDIT_RETENTION_PERIODS = {
  development: 30,  // days
  staging: 90,      // days
  production: 2555  // days (7 years for SOX compliance)
};

export const TIMESTAMP_AUTHORITIES = [
  'http://timestamp.digicert.com',
  'http://timestamp.sectigo.com',
  'http://timestamp.globalsign.com',
  'http://tsa.startssl.com/rfc3161'
];

export const SECURITY_HEADERS = {
  'X-Security-Framework': 'claude-flow-security',
  'X-Signature-Version': '1.0',
  'X-Compliance-Mode': 'enabled'
};

export const ERROR_CODES = {
  INVALID_SIGNATURE: 'SEC001',
  EXPIRED_CERTIFICATE: 'SEC002',
  REVOKED_CERTIFICATE: 'SEC003',
  INVALID_CERTIFICATE_CHAIN: 'SEC004',
  WEAK_ALGORITHM: 'SEC005',
  TAMPERED_ARTIFACT: 'SEC006',
  MISSING_TIMESTAMP: 'SEC007',
  INVALID_TIMESTAMP: 'SEC008',
  KEY_NOT_FOUND: 'SEC009',
  INSUFFICIENT_PERMISSIONS: 'SEC010',
  COMPLIANCE_VIOLATION: 'SEC011',
  HSM_ERROR: 'SEC012'
};

export const COMPLIANCE_REQUIREMENTS = {
  SOX: {
    auditRetention: 2555, // 7 years
    requiresTimestamps: true,
    requiresCertificateValidation: true,
    minimumKeySize: 2048,
    approvedAlgorithms: ['RSA-2048', 'RSA-3072', 'RSA-4096', 'ECDSA-P384', 'ECDSA-P521']
  },
  SOC2: {
    auditRetention: 1095, // 3 years
    requiresTimestamps: true,
    requiresCertificateValidation: true,
    minimumKeySize: 2048,
    approvedAlgorithms: ['RSA-2048', 'RSA-3072', 'RSA-4096', 'ECDSA-P256', 'ECDSA-P384', 'ECDSA-P521']
  },
  ISO27001: {
    auditRetention: 1825, // 5 years
    requiresTimestamps: true,
    requiresCertificateValidation: true,
    minimumKeySize: 2048,
    approvedAlgorithms: ['RSA-2048', 'RSA-3072', 'RSA-4096', 'ECDSA-P256', 'ECDSA-P384', 'ECDSA-P521']
  },
  NIST: {
    auditRetention: 1095, // 3 years
    requiresTimestamps: true,
    requiresCertificateValidation: true,
    minimumKeySize: 2048,
    approvedAlgorithms: ['RSA-3072', 'RSA-4096', 'ECDSA-P256', 'ECDSA-P384', 'ECDSA-P521']
  },
  GDPR: {
    auditRetention: 365, // 1 year (unless required longer by other regulations)
    requiresTimestamps: false,
    requiresCertificateValidation: false,
    minimumKeySize: 2048,
    approvedAlgorithms: ['RSA-2048', 'RSA-3072', 'RSA-4096', 'ECDSA-P256', 'ECDSA-P384', 'ECDSA-P521']
  }
};