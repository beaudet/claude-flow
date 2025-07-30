/**
 * Digital Signature Manager - Core cryptographic signature system
 * Supports RSA and ECDSA algorithms with enterprise-grade key management
 */

import * as crypto from 'crypto';
import { promisify } from 'util';
import type {
  SignatureAlgorithm,
  HashAlgorithm,
  KeyPair,
  SignatureMetadata,
  SecurityConfig,
  Certificate,
  TimestampResponse
} from './types.js';
import { KEY_SIZES, ALGORITHM_OIDS, HASH_OIDS } from './constants.js';

const randomBytes = promisify(crypto.randomBytes);

export class DigitalSignatureManager {
  private config: SecurityConfig;
  private keyStore: Map<string, KeyPair> = new Map();
  private certificateStore: Map<string, Certificate> = new Map();

  constructor(config: SecurityConfig) {
    this.config = config;
  }

  /**
   * Generate a new cryptographic key pair
   */
  async generateKeyPair(
    algorithm: SignatureAlgorithm = this.config.signatureAlgorithm,
    options: { 
      keyId?: string; 
      expiresInDays?: number;
      passphrase?: string;
    } = {}
  ): Promise<KeyPair> {
    const keySize = KEY_SIZES[algorithm];
    const keyId = options.keyId || await this.generateKeyId();
    
    let keyPair: crypto.KeyPairSyncResult<string, string>;

    if (algorithm.startsWith('RSA')) {
      keyPair = crypto.generateKeyPairSync('rsa', {
        modulusLength: keySize,
        publicKeyEncoding: {
          type: 'spki',
          format: 'pem'
        },
        privateKeyEncoding: {
          type: 'pkcs8',
          format: 'pem',
          ...(options.passphrase && { passphrase: options.passphrase })
        }
      });
    } else if (algorithm.startsWith('ECDSA')) {
      const namedCurve = this.getECCurve(algorithm);
      keyPair = crypto.generateKeyPairSync('ec', {
        namedCurve,
        publicKeyEncoding: {
          type: 'spki',
          format: 'pem'
        },
        privateKeyEncoding: {
          type: 'pkcs8',
          format: 'pem',
          ...(options.passphrase && { passphrase: options.passphrase })
        }
      });
    } else {
      throw new Error(`Unsupported signature algorithm: ${algorithm}`);
    }

    const fingerprint = this.generateFingerprint(keyPair.publicKey);
    const createdAt = new Date();
    const expiresAt = options.expiresInDays 
      ? new Date(createdAt.getTime() + options.expiresInDays * 24 * 60 * 60 * 1000)
      : undefined;

    const keyPairData: KeyPair = {
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey,
      algorithm,
      keySize,
      createdAt,
      expiresAt,
      fingerprint
    };

    this.keyStore.set(keyId, keyPairData);
    return keyPairData;
  }

  /**
   * Sign data with the specified key
   */
  async signData(
    data: Buffer | string,
    keyId: string,
    options: {
      hashAlgorithm?: HashAlgorithm;
      includeTimestamp?: boolean;
      passphrase?: string;
    } = {}
  ): Promise<SignatureMetadata> {
    const keyPair = this.keyStore.get(keyId);
    if (!keyPair) {
      throw new Error(`Key not found: ${keyId}`);
    }

    if (keyPair.expiresAt && keyPair.expiresAt < new Date()) {
      throw new Error(`Key expired: ${keyId}`);
    }

    const hashAlgorithm = options.hashAlgorithm || this.config.hashAlgorithm;
    const algorithm = this.getSignatureAlgorithm(keyPair.algorithm, hashAlgorithm);
    
    // Generate nonce for replay protection
    const nonce = (await randomBytes(32)).toString('hex');
    
    // Prepare data to sign (data + nonce)
    const dataToSign = Buffer.concat([
      Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8'),
      Buffer.from(nonce, 'hex')
    ]);

    // Create signature
    const sign = crypto.createSign(algorithm);
    sign.update(dataToSign);
    sign.end();

    const signature = sign.sign({
      key: keyPair.privateKey,
      ...(options.passphrase && { passphrase: options.passphrase })
    }, 'base64');

    const metadata: SignatureMetadata = {
      algorithm: keyPair.algorithm,
      hashAlgorithm,
      signature,
      publicKeyFingerprint: keyPair.fingerprint,
      timestamp: new Date(),
      nonce
    };

    // Add timestamp if requested
    if (options.includeTimestamp || this.config.timestampingEnabled) {
      const timestampResponse = await this.getTimestamp(signature);
      metadata.timestampAuthority = timestampResponse.authority;
    }

    return metadata;
  }

  /**
   * Verify a signature
   */
  async verifySignature(
    data: Buffer | string,
    signatureMetadata: SignatureMetadata,
    publicKey?: string
  ): Promise<boolean> {
    try {
      const keyToUse = publicKey || this.getPublicKeyByFingerprint(signatureMetadata.publicKeyFingerprint);
      if (!keyToUse) {
        throw new Error(`Public key not found for fingerprint: ${signatureMetadata.publicKeyFingerprint}`);
      }

      const algorithm = this.getSignatureAlgorithm(
        signatureMetadata.algorithm,
        signatureMetadata.hashAlgorithm
      );

      // Reconstruct signed data (data + nonce)
      const dataToVerify = Buffer.concat([
        Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8'),
        Buffer.from(signatureMetadata.nonce, 'hex')
      ]);

      // Verify signature
      const verify = crypto.createVerify(algorithm);
      verify.update(dataToVerify);
      verify.end();

      return verify.verify(keyToUse, signatureMetadata.signature, 'base64');
    } catch (error) {
      console.error('Signature verification failed:', error);
      return false;
    }
  }

  /**
   * Import an existing key pair
   */
  async importKeyPair(
    publicKey: string,
    privateKey: string,
    keyId: string,
    algorithm: SignatureAlgorithm
  ): Promise<void> {
    const fingerprint = this.generateFingerprint(publicKey);
    const keySize = KEY_SIZES[algorithm];
    
    const keyPairData: KeyPair = {
      publicKey,
      privateKey,
      algorithm,
      keySize,
      createdAt: new Date(),
      fingerprint
    };

    this.keyStore.set(keyId, keyPairData);
  }

  /**
   * Export public key
   */
  exportPublicKey(keyId: string): string | null {
    const keyPair = this.keyStore.get(keyId);
    return keyPair ? keyPair.publicKey : null;
  }

  /**
   * List all keys
   */
  listKeys(): Array<{keyId: string; fingerprint: string; algorithm: SignatureAlgorithm; createdAt: Date; expiresAt?: Date}> {
    const keys: Array<{keyId: string; fingerprint: string; algorithm: SignatureAlgorithm; createdAt: Date; expiresAt?: Date}> = [];
    
    for (const [keyId, keyPair] of this.keyStore.entries()) {
      keys.push({
        keyId,
        fingerprint: keyPair.fingerprint,
        algorithm: keyPair.algorithm,
        createdAt: keyPair.createdAt,
        expiresAt: keyPair.expiresAt
      });
    }
    
    return keys;
  }

  /**
   * Delete a key pair
   */
  deleteKey(keyId: string): boolean {
    return this.keyStore.delete(keyId);
  }

  /**
   * Check if key exists and is valid
   */
  isKeyValid(keyId: string): boolean {
    const keyPair = this.keyStore.get(keyId);
    if (!keyPair) return false;
    
    if (keyPair.expiresAt && keyPair.expiresAt < new Date()) {
      return false;
    }
    
    return true;
  }

  /**
   * Get certificate chain for a key
   */
  getCertificateChain(keyId: string): Certificate[] {
    const keyPair = this.keyStore.get(keyId);
    if (!keyPair) return [];

    const certificates: Certificate[] = [];
    for (const cert of this.certificateStore.values()) {
      if (cert.publicKey === keyPair.publicKey) {
        certificates.push(cert);
      }
    }

    return certificates.sort((a, b) => a.validFrom.getTime() - b.validFrom.getTime());
  }

  /**
   * Add certificate to store
   */
  addCertificate(certificate: Certificate): void {
    this.certificateStore.set(certificate.id, certificate);
  }

  /**
   * Revoke certificate
   */
  revokeCertificate(certificateId: string, reason: string): void {
    const certificate = this.certificateStore.get(certificateId);
    if (certificate) {
      certificate.revoked = true;
      certificate.revokedAt = new Date();
      certificate.revokedReason = reason;
    }
  }

  // Private helper methods
  private async generateKeyId(): Promise<string> {
    const bytes = await randomBytes(16);
    return bytes.toString('hex');
  }

  private generateFingerprint(publicKey: string): string {
    return crypto.createHash('sha256')
      .update(publicKey)
      .digest('hex')
      .toUpperCase()
      .match(/.{2}/g)!
      .join(':');
  }

  private getECCurve(algorithm: SignatureAlgorithm): string {
    switch (algorithm) {
      case 'ECDSA-P256': return 'prime256v1';
      case 'ECDSA-P384': return 'secp384r1';
      case 'ECDSA-P521': return 'secp521r1';
      default: throw new Error(`Unsupported ECDSA algorithm: ${algorithm}`);
    }
  }

  private getSignatureAlgorithm(signatureAlg: SignatureAlgorithm, hashAlg: HashAlgorithm): string {
    if (signatureAlg.startsWith('RSA')) {
      switch (hashAlg) {
        case 'SHA-256': return 'RSA-SHA256';
        case 'SHA-384': return 'RSA-SHA384';
        case 'SHA-512': return 'RSA-SHA512';
        default: throw new Error(`Unsupported hash algorithm for RSA: ${hashAlg}`);
      }
    } else if (signatureAlg.startsWith('ECDSA')) {
      switch (hashAlg) {
        case 'SHA-256': return 'ECDSA-SHA256';
        case 'SHA-384': return 'ECDSA-SHA384';
        case 'SHA-512': return 'ECDSA-SHA512';
        default: throw new Error(`Unsupported hash algorithm for ECDSA: ${hashAlg}`);
      }
    }
    throw new Error(`Unsupported signature algorithm: ${signatureAlg}`);
  }

  private getPublicKeyByFingerprint(fingerprint: string): string | null {
    for (const keyPair of this.keyStore.values()) {
      if (keyPair.fingerprint === fingerprint) {
        return keyPair.publicKey;
      }
    }
    return null;
  }

  private async getTimestamp(signature: string): Promise<TimestampResponse> {
    // This is a simplified implementation
    // In production, this would make an actual request to a timestamp authority
    return {
      timestamp: new Date(),
      nonce: crypto.randomBytes(16).toString('hex'),
      authority: 'local-timestamp-authority',
      signature: crypto.createHash('sha256').update(signature).digest('hex'),
      certificateChain: []
    };
  }
}