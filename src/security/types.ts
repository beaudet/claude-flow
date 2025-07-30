/**
 * Type definitions for the Enterprise Security System
 */

export type SignatureAlgorithm = 'RSA-2048' | 'RSA-3072' | 'RSA-4096' | 'ECDSA-P256' | 'ECDSA-P384' | 'ECDSA-P521';
export type HashAlgorithm = 'SHA-256' | 'SHA-384' | 'SHA-512' | 'BLAKE2b' | 'BLAKE2s';
export type Environment = 'development' | 'staging' | 'production';
export type SecurityRole = 'admin' | 'signer' | 'verifier' | 'auditor';

export interface SecurityConfig {
  environment: Environment;
  signatureAlgorithm: SignatureAlgorithm;
  hashAlgorithm: HashAlgorithm;
  keySize: number;
  certificateChainValidation: boolean;
  timestampingEnabled: boolean;
  auditLogging: boolean;
  complianceMode: boolean;
  hsm?: HSMConfig;
}

export interface HSMConfig {
  enabled: boolean;
  provider: string;
  tokenLabel: string;
  pin?: string;
  keyId: string;
}

export interface KeyPair {
  publicKey: string;
  privateKey: string;
  algorithm: SignatureAlgorithm;
  keySize: number;
  createdAt: Date;
  expiresAt?: Date;
  fingerprint: string;
}

export interface Certificate {
  id: string;
  publicKey: string;
  issuer: string;
  subject: string;
  validFrom: Date;
  validTo: Date;
  algorithm: SignatureAlgorithm;
  fingerprint: string;
  serialNumber: string;
  revoked: boolean;
  revokedAt?: Date;
  revokedReason?: string;
}

export interface SignatureMetadata {
  algorithm: SignatureAlgorithm;
  hashAlgorithm: HashAlgorithm;
  signature: string;
  publicKeyFingerprint: string;
  timestamp: Date;
  nonce: string;
  certificateChain?: string[];
  timestampAuthority?: string;
}

export interface ArtifactManifest {
  name: string;
  version: string;
  buildId: string;
  artifacts: ArtifactEntry[];
  signatures: SignatureMetadata[];
  createdAt: Date;
  environment: Environment;
  buildMetadata: Record<string, unknown>;
}

export interface ArtifactEntry {
  path: string;
  hash: string;
  hashAlgorithm: HashAlgorithm;
  size: number;
  mimeType?: string;
  permissions?: string;
  owner?: string;
  group?: string;
}

export interface VerificationResult {
  valid: boolean;
  artifact: string;
  signature: SignatureMetadata;
  errors: string[];
  warnings: string[];
  timestamp: Date;
  verifiedBy: string;
  certificateChainValid?: boolean;
  timestampValid?: boolean;
}

export interface AuditLogEntry {
  id: string;
  timestamp: Date;
  action: 'sign' | 'verify' | 'key-generate' | 'key-rotate' | 'certificate-revoke';
  actor: string;
  resource: string;
  result: 'success' | 'failure' | 'warning';
  details: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  sessionId?: string;
}

export interface ComplianceReport {
  reportId: string;
  generatedAt: Date;
  period: {
    from: Date;
    to: Date;
  };
  standard: ComplianceStandard;
  status: 'compliant' | 'non-compliant' | 'partial';
  findings: ComplianceFinding[];
  recommendations: string[];
  artifacts: {
    total: number;
    signed: number;
    verified: number;
    failed: number;
  };
}

export interface ComplianceFinding {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: string;
  description: string;
  requirement: string;
  remediation: string;
  artifacts?: string[];
}

export type ComplianceStandard = 'SOX' | 'SOC2' | 'ISO27001' | 'NIST' | 'GDPR';

export interface KeyRotationSchedule {
  keyId: string;
  currentExpiry: Date;
  nextRotation: Date;
  rotationFrequency: number; // days
  autoRotate: boolean;
  notificationThreshold: number; // days before expiry
}

export interface BuildIntegrationConfig {
  preSignHooks: string[];
  postSignHooks: string[];
  verificationHooks: string[];
  signOnBuild: boolean;
  signOnPublish: boolean;
  requireVerification: boolean;
  failOnVerificationError: boolean;
}

export interface SecurityMetrics {
  signaturesGenerated: number;
  verificationsPerformed: number;
  verificationFailures: number;
  keysRotated: number;
  certificatesRevoked: number;
  auditEvents: number;
  complianceScore: number;
}

export interface TimestampResponse {
  timestamp: Date;
  nonce: string;
  authority: string;
  signature: string;
  certificateChain: string[];
}

export interface RevocationList {
  issuer: string;
  thisUpdate: Date;
  nextUpdate: Date;
  revokedCertificates: RevokedCertificate[];
  signature: string;
}

export interface RevokedCertificate {
  serialNumber: string;
  revocationDate: Date;
  reason: RevocationReason;
}

export type RevocationReason = 
  | 'unspecified'
  | 'keyCompromise'
  | 'caCompromise'
  | 'affiliationChanged'
  | 'superseded'
  | 'cessationOfOperation'
  | 'certificateHold'
  | 'removeFromCRL'
  | 'privilegeWithdrawn'
  | 'aaCompromise';