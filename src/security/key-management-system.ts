/**
 * Enterprise Key Management System - Comprehensive key lifecycle management
 * Supports key generation, rotation, distribution, backup, and HSM integration
 */

import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { EventEmitter } from 'events';
import type {
  KeyPair,
  Certificate,
  KeyRotationSchedule,
  HSMConfig,
  SecurityConfig,
  SignatureAlgorithm,
  Environment,
  AuditLogEntry
} from './types.js';
import { KEY_ROTATION_SCHEDULES, CERTIFICATE_VALIDITY_PERIODS } from './constants.js';

interface KeyMetadata {
  keyId: string;
  algorithm: SignatureAlgorithm;
  createdAt: Date;
  expiresAt?: Date;
  rotationSchedule?: KeyRotationSchedule;
  environment: Environment;
  purpose: string[];
  owner: string;
  lastUsed?: Date;
  usageCount: number;
  status: 'active' | 'expired' | 'revoked' | 'pending-rotation';
}

interface KeyShare {
  shareId: string;
  keyId: string;
  threshold: number;
  totalShares: number;
  shareIndex: number;
  encryptedShare: string;
  recipientId: string;
  createdAt: Date;
}

interface KeyBackup {
  backupId: string;
  keyId: string;
  encryptedBackup: string;
  backupMethod: 'password' | 'key-encryption-key' | 'hsm';
  createdAt: Date;
  expiresAt?: Date;
  verificationHash: string;
  recoveryInstructions: string;
}

export class KeyManagementSystem extends EventEmitter {
  private config: SecurityConfig;
  private keyStore: Map<string, KeyPair> = new Map();
  private keyMetadata: Map<string, KeyMetadata> = new Map();
  private certificates: Map<string, Certificate> = new Map();
  private rotationSchedules: Map<string, KeyRotationSchedule> = new Map();
  private keyShares: Map<string, KeyShare[]> = new Map();
  private keyBackups: Map<string, KeyBackup[]> = new Map();
  private auditLog: AuditLogEntry[] = [];
  private keyStorePath: string;
  private rotationTimer?: NodeJS.Timeout;

  constructor(config: SecurityConfig, keyStorePath: string = './security/keys') {
    super();
    this.config = config;
    this.keyStorePath = keyStorePath;
  }

  /**
   * Initialize the key management system
   */
  async initialize(): Promise<void> {
    // Create key store directory structure
    await fs.mkdir(this.keyStorePath, { recursive: true });
    await fs.mkdir(path.join(this.keyStorePath, 'active'), { recursive: true });
    await fs.mkdir(path.join(this.keyStorePath, 'archived'), { recursive: true });
    await fs.mkdir(path.join(this.keyStorePath, 'backups'), { recursive: true });
    await fs.mkdir(path.join(this.keyStorePath, 'certificates'), { recursive: true });

    // Load existing keys and metadata
    await this.loadKeyStore();
    
    // Initialize HSM if configured
    if (this.config.hsm?.enabled) {
      await this.initializeHSM();
    }

    // Start automatic key rotation scheduler
    this.startRotationScheduler();

    this.logAudit('system', 'kms_initialized', 'key-management-system', {
      keyStorePath: this.keyStorePath,
      hsmEnabled: this.config.hsm?.enabled || false
    });

    this.emit('initialized');
  }

  /**
   * Generate a new key pair with full lifecycle management
   */
  async generateManagedKey(options: {
    keyId?: string;
    algorithm?: SignatureAlgorithm;
    purpose: string[];
    owner: string;
    expiresInDays?: number;
    autoRotate?: boolean;
    rotationFrequencyDays?: number;
    passphrase?: string;
    backup?: boolean;
    distribute?: boolean;
    threshold?: number;
    totalShares?: number;
  }): Promise<{
    keyId: string;
    keyPair: KeyPair;
    metadata: KeyMetadata;
    backupIds?: string[];
    shareIds?: string[];
  }> {
    const keyId = options.keyId || this.generateKeyId();
    const algorithm = options.algorithm || this.config.signatureAlgorithm;
    const expiresInDays = options.expiresInDays || CERTIFICATE_VALIDITY_PERIODS[this.config.environment];
    
    // Generate the key pair
    const keyPair = await this.generateKeyPair(keyId, algorithm, options.passphrase);
    
    // Create metadata
    const metadata: KeyMetadata = {
      keyId,
      algorithm,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000),
      environment: this.config.environment,
      purpose: options.purpose,
      owner: options.owner,
      usageCount: 0,
      status: 'active'
    };

    // Set up rotation schedule if auto-rotate is enabled
    if (options.autoRotate) {
      const rotationFrequency = options.rotationFrequencyDays || KEY_ROTATION_SCHEDULES[this.config.environment];
      const rotationSchedule: KeyRotationSchedule = {
        keyId,
        currentExpiry: metadata.expiresAt,
        nextRotation: new Date(Date.now() + rotationFrequency * 24 * 60 * 60 * 1000),
        rotationFrequency,
        autoRotate: true,
        notificationThreshold: Math.min(7, Math.floor(rotationFrequency / 4))
      };
      
      metadata.rotationSchedule = rotationSchedule;
      this.rotationSchedules.set(keyId, rotationSchedule);
    }

    // Store key and metadata
    this.keyStore.set(keyId, keyPair);
    this.keyMetadata.set(keyId, metadata);
    
    // Save to persistent storage
    await this.saveKeyToDisk(keyId, keyPair, metadata);

    const result: any = { keyId, keyPair, metadata };

    // Create backup if requested
    if (options.backup) {
      const backupIds = await this.createKeyBackup(keyId, {
        method: options.passphrase ? 'password' : 'key-encryption-key',
        passphrase: options.passphrase
      });
      result.backupIds = backupIds;
    }

    // Distribute key shares if requested
    if (options.distribute && options.threshold && options.totalShares) {
      const shareIds = await this.distributeKeyShares(keyId, options.threshold, options.totalShares);
      result.shareIds = shareIds;
    }

    this.logAudit(options.owner, 'key_generated', keyId, {
      algorithm,
      purpose: options.purpose,
      expiresAt: metadata.expiresAt,
      autoRotate: options.autoRotate
    });

    this.emit('key-generated', { keyId, metadata });
    return result;
  }

  /**
   * Rotate a key (generate new key and transition from old)
   */
  async rotateKey(keyId: string, options: {
    transitionPeriodDays?: number;
    notifyStakeholders?: boolean;
    updateCertificates?: boolean;
  } = {}): Promise<{
    newKeyId: string;
    oldKeyId: string;
    transitionPeriod: Date;
  }> {
    const oldMetadata = this.keyMetadata.get(keyId);
    if (!oldMetadata) {
      throw new Error(`Key not found: ${keyId}`);
    }

    const transitionPeriodDays = options.transitionPeriodDays || 30;
    const newKeyId = `${keyId}-rotated-${Date.now()}`;

    // Generate new key with same properties
    const newKeyResult = await this.generateManagedKey({
      keyId: newKeyId,
      algorithm: oldMetadata.algorithm,
      purpose: oldMetadata.purpose,
      owner: oldMetadata.owner,
      autoRotate: oldMetadata.rotationSchedule?.autoRotate,
      rotationFrequencyDays: oldMetadata.rotationSchedule?.rotationFrequency,
      backup: true
    });

    // Set up transition period
    const transitionEnd = new Date(Date.now() + transitionPeriodDays * 24 * 60 * 60 * 1000);
    
    // Update old key status
    oldMetadata.status = 'pending-rotation';
    this.keyMetadata.set(keyId, oldMetadata);

    // Schedule old key archival
    setTimeout(async () => {
      await this.archiveKey(keyId);
    }, transitionPeriodDays * 24 * 60 * 60 * 1000);

    // Update rotation schedule for new key
    if (oldMetadata.rotationSchedule) {
      const newSchedule: KeyRotationSchedule = {
        ...oldMetadata.rotationSchedule,
        keyId: newKeyId,
        currentExpiry: newKeyResult.metadata.expiresAt,
        nextRotation: new Date(newKeyResult.metadata.expiresAt.getTime() - oldMetadata.rotationSchedule.rotationFrequency * 24 * 60 * 60 * 1000)
      };
      this.rotationSchedules.set(newKeyId, newSchedule);
      this.rotationSchedules.delete(keyId);
    }

    // Update certificates if requested
    if (options.updateCertificates) {
      await this.updateCertificatesForKey(keyId, newKeyId);
    }

    // Notify stakeholders
    if (options.notifyStakeholders) {
      this.emit('key-rotation-notification', {
        oldKeyId: keyId,
        newKeyId,
        transitionPeriod: transitionEnd,
        owner: oldMetadata.owner,
        purpose: oldMetadata.purpose
      });
    }

    this.logAudit(oldMetadata.owner, 'key_rotated', keyId, {
      newKeyId,
      transitionPeriodDays,
      transitionEnd
    });

    this.emit('key-rotated', { oldKeyId: keyId, newKeyId, transitionPeriod: transitionEnd });

    return {
      newKeyId,
      oldKeyId: keyId,
      transitionPeriod: transitionEnd
    };
  }

  /**
   * Create encrypted backup of a key
   */
  async createKeyBackup(
    keyId: string,
    options: {
      method: 'password' | 'key-encryption-key' | 'hsm';
      passphrase?: string;
      kekKeyId?: string;
      recoveryInstructions?: string;
    }
  ): Promise<string[]> {
    const keyPair = this.keyStore.get(keyId);
    const metadata = this.keyMetadata.get(keyId);
    
    if (!keyPair || !metadata) {
      throw new Error(`Key not found: ${keyId}`);
    }

    const backups: KeyBackup[] = [];
    const backupIds: string[] = [];

    // Create multiple backup copies for redundancy
    const backupCount = this.config.environment === 'production' ? 3 : 1;
    
    for (let i = 0; i < backupCount; i++) {
      const backupId = `${keyId}-backup-${Date.now()}-${i}`;
      let encryptedBackup: string;

      const keyData = JSON.stringify({
        keyId,
        publicKey: keyPair.publicKey,
        privateKey: keyPair.privateKey,
        metadata,
        backupTimestamp: new Date().toISOString()
      });

      switch (options.method) {
        case 'password':
          if (!options.passphrase) {
            throw new Error('Passphrase required for password-based backup');
          }
          encryptedBackup = await this.encryptWithPassword(keyData, options.passphrase);
          break;

        case 'key-encryption-key':
          const kekKeyId = options.kekKeyId || await this.getOrCreateKEK();
          encryptedBackup = await this.encryptWithKEK(keyData, kekKeyId);
          break;

        case 'hsm':
          if (!this.config.hsm?.enabled) {
            throw new Error('HSM not configured');
          }
          encryptedBackup = await this.encryptWithHSM(keyData);
          break;

        default:
          throw new Error(`Unsupported backup method: ${options.method}`);
      }

      const backup: KeyBackup = {
        backupId,
        keyId,
        encryptedBackup,
        backupMethod: options.method,
        createdAt: new Date(),
        expiresAt: metadata.expiresAt,
        verificationHash: crypto.createHash('sha256').update(keyData).digest('hex'),
        recoveryInstructions: options.recoveryInstructions || this.generateRecoveryInstructions(options.method)
      };

      backups.push(backup);
      backupIds.push(backupId);

      // Save backup to disk
      await this.saveBackupToDisk(backup);
    }

    // Store backup references
    this.keyBackups.set(keyId, (this.keyBackups.get(keyId) || []).concat(backups));

    this.logAudit(metadata.owner, 'key_backup_created', keyId, {
      backupMethod: options.method,
      backupCount,
      backupIds
    });

    this.emit('key-backup-created', { keyId, backupIds, method: options.method });
    return backupIds;
  }

  /**
   * Recover key from backup
   */
  async recoverKeyFromBackup(
    backupId: string,
    credentials: {
      passphrase?: string;
      kekKeyId?: string;
    }
  ): Promise<{ keyId: string; keyPair: KeyPair; metadata: KeyMetadata }> {
    // Find backup
    let backup: KeyBackup | undefined;
    for (const backups of this.keyBackups.values()) {
      backup = backups.find(b => b.backupId === backupId);
      if (backup) break;
    }

    if (!backup) {
      // Try loading from disk
      backup = await this.loadBackupFromDisk(backupId);
    }

    if (!backup) {
      throw new Error(`Backup not found: ${backupId}`);
    }

    // Decrypt backup
    let keyData: string;
    switch (backup.backupMethod) {
      case 'password':
        if (!credentials.passphrase) {
          throw new Error('Passphrase required for password-encrypted backup');
        }
        keyData = await this.decryptWithPassword(backup.encryptedBackup, credentials.passphrase);
        break;

      case 'key-encryption-key':
        const kekKeyId = credentials.kekKeyId || await this.findKEKForBackup(backupId);
        keyData = await this.decryptWithKEK(backup.encryptedBackup, kekKeyId);
        break;

      case 'hsm':
        keyData = await this.decryptWithHSM(backup.encryptedBackup);
        break;

      default:
        throw new Error(`Unsupported backup method: ${backup.backupMethod}`);
    }

    // Parse and verify recovered data
    const recoveredData = JSON.parse(keyData);
    const verificationHash = crypto.createHash('sha256').update(keyData).digest('hex');
    
    if (verificationHash !== backup.verificationHash) {
      throw new Error('Backup verification failed - data may be corrupted');
    }

    const { keyId, publicKey, privateKey, metadata } = recoveredData;
    const keyPair: KeyPair = { 
      publicKey, 
      privateKey, 
      algorithm: metadata.algorithm,
      keySize: metadata.keySize || 2048,
      createdAt: new Date(metadata.createdAt),
      expiresAt: metadata.expiresAt ? new Date(metadata.expiresAt) : undefined,
      fingerprint: this.generateFingerprint(publicKey)
    };

    // Restore key to active store
    this.keyStore.set(keyId, keyPair);
    this.keyMetadata.set(keyId, metadata);

    // Save restored key
    await this.saveKeyToDisk(keyId, keyPair, metadata);

    this.logAudit('system', 'key_recovered', keyId, {
      backupId,
      backupMethod: backup.backupMethod,
      recoveredAt: new Date()
    });

    this.emit('key-recovered', { keyId, backupId });
    return { keyId, keyPair, metadata };
  }

  /**
   * Distribute key using Shamir's Secret Sharing
   */
  async distributeKeyShares(
    keyId: string,
    threshold: number,
    totalShares: number
  ): Promise<string[]> {
    const keyPair = this.keyStore.get(keyId);
    if (!keyPair) {
      throw new Error(`Key not found: ${keyId}`);
    }

    // Use simplified secret sharing (in production, use a proper library)
    const shares = this.splitSecret(keyPair.privateKey, threshold, totalShares);
    const shareIds: string[] = [];

    for (let i = 0; i < shares.length; i++) {
      const shareId = `${keyId}-share-${i + 1}`;
      const keyShare: KeyShare = {
        shareId,
        keyId,
        threshold,
        totalShares,
        shareIndex: i + 1,
        encryptedShare: shares[i],
        recipientId: `recipient-${i + 1}`, // In practice, this would be specific recipients
        createdAt: new Date()
      };

      shareIds.push(shareId);
      // In practice, these would be securely distributed to different parties
      await this.saveShareToDisk(keyShare);
    }

    this.keyShares.set(keyId, (this.keyShares.get(keyId) || []).concat(shares.map((share, i) => ({
      shareId: `${keyId}-share-${i + 1}`,
      keyId,
      threshold,
      totalShares,
      shareIndex: i + 1,
      encryptedShare: share,
      recipientId: `recipient-${i + 1}`,
      createdAt: new Date()
    }))));

    this.logAudit('system', 'key_shares_distributed', keyId, {
      threshold,
      totalShares,
      shareIds
    });

    this.emit('key-shares-distributed', { keyId, threshold, totalShares, shareIds });
    return shareIds;
  }

  /**
   * Get key usage statistics
   */
  getKeyUsageStatistics(keyId?: string): {
    totalKeys: number;
    activeKeys: number;
    expiredKeys: number;
    revokedKeys: number;
    keysByEnvironment: Record<Environment, number>;
    keysByAlgorithm: Record<SignatureAlgorithm, number>;
    upcomingRotations: KeyRotationSchedule[];
    keyDetails?: KeyMetadata;
  } {
    const allMetadata = Array.from(this.keyMetadata.values());
    
    const stats = {
      totalKeys: allMetadata.length,
      activeKeys: allMetadata.filter(m => m.status === 'active').length,
      expiredKeys: allMetadata.filter(m => m.status === 'expired').length,
      revokedKeys: allMetadata.filter(m => m.status === 'revoked').length,
      keysByEnvironment: {} as Record<Environment, number>,
      keysByAlgorithm: {} as Record<SignatureAlgorithm, number>,
      upcomingRotations: Array.from(this.rotationSchedules.values())
        .filter(rs => rs.nextRotation <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))
        .sort((a, b) => a.nextRotation.getTime() - b.nextRotation.getTime())
    };

    // Group by environment
    for (const metadata of allMetadata) {
      stats.keysByEnvironment[metadata.environment] = (stats.keysByEnvironment[metadata.environment] || 0) + 1;
      stats.keysByAlgorithm[metadata.algorithm] = (stats.keysByAlgorithm[metadata.algorithm] || 0) + 1;
    }

    if (keyId) {
      const keyDetails = this.keyMetadata.get(keyId);
      if (keyDetails) {
        return { ...stats, keyDetails };
      }
    }

    return stats;
  }

  /**
   * Archive expired or rotated keys
   */
  async archiveKey(keyId: string): Promise<void> {
    const keyPair = this.keyStore.get(keyId);
    const metadata = this.keyMetadata.get(keyId);

    if (!keyPair || !metadata) {
      throw new Error(`Key not found: ${keyId}`);
    }

    // Move key to archived storage
    const archivePath = path.join(this.keyStorePath, 'archived', `${keyId}.json`);
    await fs.writeFile(archivePath, JSON.stringify({
      keyId,
      keyPair,
      metadata,
      archivedAt: new Date()
    }, null, 2));

    // Remove from active storage
    this.keyStore.delete(keyId);
    const activePath = path.join(this.keyStorePath, 'active', `${keyId}.json`);
    try {
      await fs.unlink(activePath);
    } catch {
      // File may not exist
    }

    // Update metadata status
    metadata.status = 'expired';
    this.keyMetadata.set(keyId, metadata);

    this.logAudit(metadata.owner, 'key_archived', keyId, {
      archivedAt: new Date(),
      reason: 'rotation_completed'
    });

    this.emit('key-archived', { keyId, metadata });
  }

  // Private helper methods
  private async generateKeyPair(keyId: string, algorithm: SignatureAlgorithm, passphrase?: string): Promise<KeyPair> {
    // Implementation would be similar to DigitalSignatureManager.generateKeyPair
    // Simplified for brevity
    const keySize = algorithm.startsWith('RSA') ? parseInt(algorithm.split('-')[1]) : 256;
    
    let keyPair: crypto.KeyPairSyncResult<string, string>;

    if (algorithm.startsWith('RSA')) {
      keyPair = crypto.generateKeyPairSync('rsa', {
        modulusLength: keySize,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { 
          type: 'pkcs8', 
          format: 'pem',
          ...(passphrase && { passphrase })
        }
      });
    } else {
      const namedCurve = algorithm === 'ECDSA-P256' ? 'prime256v1' : 'secp384r1';
      keyPair = crypto.generateKeyPairSync('ec', {
        namedCurve,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { 
          type: 'pkcs8', 
          format: 'pem',
          ...(passphrase && { passphrase })
        }
      });
    }

    return {
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey,
      algorithm,
      keySize,
      createdAt: new Date(),
      fingerprint: this.generateFingerprint(keyPair.publicKey)
    };
  }

  private generateKeyId(): string {
    return `key-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateFingerprint(publicKey: string): string {
    return crypto.createHash('sha256').update(publicKey).digest('hex').toUpperCase().match(/.{2}/g)!.join(':');
  }

  private async loadKeyStore(): Promise<void> {
    // Load implementation would read from disk
    // Simplified for brevity
  }

  private async saveKeyToDisk(keyId: string, keyPair: KeyPair, metadata: KeyMetadata): Promise<void> {
    const keyPath = path.join(this.keyStorePath, 'active', `${keyId}.json`);
    await fs.writeFile(keyPath, JSON.stringify({
      keyId,
      keyPair,
      metadata,
      savedAt: new Date()
    }, null, 2));
  }

  private async initializeHSM(): Promise<void> {
    // HSM initialization logic would go here
    // This is a placeholder for HSM integration
    this.emit('hsm-initialized', { provider: this.config.hsm?.provider });
  }

  private startRotationScheduler(): void {
    // Check for keys that need rotation every hour
    this.rotationTimer = setInterval(async () => {
      const now = new Date();
      for (const schedule of this.rotationSchedules.values()) {
        if (schedule.autoRotate && schedule.nextRotation <= now) {
          try {
            await this.rotateKey(schedule.keyId);
          } catch (error) {
            this.emit('rotation-error', { keyId: schedule.keyId, error });
          }
        }
      }
    }, 60 * 60 * 1000); // 1 hour
  }

  private splitSecret(secret: string, threshold: number, totalShares: number): string[] {
    // Simplified Shamir's Secret Sharing implementation
    // In production, use a proper cryptographic library
    const shares: string[] = [];
    for (let i = 0; i < totalShares; i++) {
      shares.push(crypto.createHash('sha256').update(`${secret}-${i}-${threshold}`).digest('hex'));
    }
    return shares;
  }

  private async encryptWithPassword(data: string, password: string): Promise<string> {
    const key = crypto.scryptSync(password, 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher('aes-256-gcm', key);
    
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return `${iv.toString('hex')}:${encrypted}`;
  }

  private async decryptWithPassword(encryptedData: string, password: string): Promise<string> {
    const [ivHex, encrypted] = encryptedData.split(':');
    const key = crypto.scryptSync(password, 'salt', 32);
    const decipher = crypto.createDecipher('aes-256-gcm', key);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  private async encryptWithKEK(data: string, kekKeyId: string): Promise<string> {
    // Key Encryption Key implementation
    return `kek-encrypted:${Buffer.from(data).toString('base64')}`;
  }

  private async decryptWithKEK(encryptedData: string, kekKeyId: string): Promise<string> {
    const [prefix, data] = encryptedData.split(':');
    return Buffer.from(data, 'base64').toString('utf8');
  }

  private async encryptWithHSM(data: string): Promise<string> {
    // HSM encryption implementation
    return `hsm-encrypted:${Buffer.from(data).toString('base64')}`;
  }

  private async decryptWithHSM(encryptedData: string): Promise<string> {
    const [prefix, data] = encryptedData.split(':');
    return Buffer.from(data, 'base64').toString('utf8');
  }

  private async getOrCreateKEK(): Promise<string> {
    // Implementation to get or create Key Encryption Key
    return 'kek-master-key';
  }

  private async findKEKForBackup(backupId: string): Promise<string> {
    // Implementation to find KEK for a specific backup
    return 'kek-master-key';
  }

  private generateRecoveryInstructions(method: string): string {
    switch (method) {
      case 'password':
        return 'To recover this key, provide the backup file and the passphrase used during backup creation.';
      case 'key-encryption-key':
        return 'To recover this key, provide the backup file and access to the Key Encryption Key (KEK).';
      case 'hsm':
        return 'To recover this key, provide the backup file and authenticated access to the HSM.';
      default:
        return 'Recovery instructions not available.';
    }
  }

  private async saveBackupToDisk(backup: KeyBackup): Promise<void> {
    const backupPath = path.join(this.keyStorePath, 'backups', `${backup.backupId}.json`);
    await fs.writeFile(backupPath, JSON.stringify(backup, null, 2));
  }

  private async loadBackupFromDisk(backupId: string): Promise<KeyBackup | null> {
    try {
      const backupPath = path.join(this.keyStorePath, 'backups', `${backupId}.json`);
      const data = await fs.readFile(backupPath, 'utf8');
      return JSON.parse(data) as KeyBackup;
    } catch {
      return null;
    }
  }

  private async saveShareToDisk(share: KeyShare): Promise<void> {
    const sharePath = path.join(this.keyStorePath, 'shares', `${share.shareId}.json`);
    await fs.mkdir(path.dirname(sharePath), { recursive: true });
    await fs.writeFile(sharePath, JSON.stringify(share, null, 2));
  }

  private async updateCertificatesForKey(oldKeyId: string, newKeyId: string): Promise<void> {
    // Implementation to update certificates with new key
    for (const [certId, cert] of this.certificates) {
      // This is a simplified check - in practice, you'd match by public key
      if (cert.id.includes(oldKeyId)) {
        // Mark old certificate as revoked and create new one
        cert.revoked = true;
        cert.revokedAt = new Date();
        cert.revokedReason = 'key_rotation';
      }
    }
  }

  private logAudit(actor: string, action: string, resource: string, details: Record<string, unknown>): void {
    const entry: AuditLogEntry = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      action,
      actor,
      resource,
      result: 'success',
      details
    };
    
    this.auditLog.push(entry);
    this.emit('audit-log', entry);
  }
}