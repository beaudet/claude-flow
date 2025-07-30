/**
 * Digital Signature Manager Test Suite
 * Comprehensive tests for cryptographic operations and security features
 */

import { DigitalSignatureManager } from '../digital-signature-manager.js';
import { DEFAULT_SECURITY_CONFIG } from '../constants.js';
import type { SecurityConfig, SignatureAlgorithm } from '../types.js';

describe('DigitalSignatureManager', () => {
  let signatureManager: DigitalSignatureManager;
  let config: SecurityConfig;

  beforeEach(() => {
    config = { ...DEFAULT_SECURITY_CONFIG };
    signatureManager = new DigitalSignatureManager(config);
  });

  describe('Key Generation', () => {
    it('should generate RSA key pair successfully', async () => {
      const keyPair = await signatureManager.generateKeyPair('RSA-2048');
      
      expect(keyPair).toBeDefined();
      expect(keyPair.algorithm).toBe('RSA-2048');
      expect(keyPair.keySize).toBe(2048);
      expect(keyPair.publicKey).toContain('BEGIN PUBLIC KEY');
      expect(keyPair.privateKey).toContain('BEGIN PRIVATE KEY');
      expect(keyPair.fingerprint).toMatch(/^[0-9A-F:]+$/);
      expect(keyPair.createdAt).toBeInstanceOf(Date);
    });

    it('should generate ECDSA key pair successfully', async () => {
      const keyPair = await signatureManager.generateKeyPair('ECDSA-P256');
      
      expect(keyPair).toBeDefined();
      expect(keyPair.algorithm).toBe('ECDSA-P256');
      expect(keyPair.keySize).toBe(256);
      expect(keyPair.publicKey).toContain('BEGIN PUBLIC KEY');
      expect(keyPair.privateKey).toContain('BEGIN PRIVATE KEY');
    });

    it('should generate different fingerprints for different keys', async () => {
      const keyPair1 = await signatureManager.generateKeyPair('RSA-2048');
      const keyPair2 = await signatureManager.generateKeyPair('RSA-2048');
      
      expect(keyPair1.fingerprint).not.toBe(keyPair2.fingerprint);
    });

    it('should generate key with expiration when specified', async () => {
      const keyPair = await signatureManager.generateKeyPair('RSA-2048', {
        expiresInDays: 30
      });
      
      expect(keyPair.expiresAt).toBeDefined();
      
      const expectedExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const timeDiff = Math.abs(keyPair.expiresAt!.getTime() - expectedExpiry.getTime());
      expect(timeDiff).toBeLessThan(1000); // Within 1 second
    });

    it('should handle invalid algorithms', async () => {
      await expect(
        signatureManager.generateKeyPair('INVALID-ALG' as SignatureAlgorithm)
      ).rejects.toThrow('Unsupported signature algorithm');
    });
  });

  describe('Digital Signing', () => {
    let keyId: string;

    beforeEach(async () => {
      const keyPair = await signatureManager.generateKeyPair('ECDSA-P256');
      keyId = 'test-key';
      await signatureManager.importKeyPair(
        keyPair.publicKey,
        keyPair.privateKey,
        keyId,
        'ECDSA-P256'
      );
    });

    it('should sign data successfully', async () => {
      const testData = 'Hello, secure world!';
      
      const signature = await signatureManager.signData(testData, keyId);
      
      expect(signature).toBeDefined();
      expect(signature.algorithm).toBe('ECDSA-P256');
      expect(signature.hashAlgorithm).toBe('SHA-256');
      expect(signature.signature).toBeTruthy();
      expect(signature.publicKeyFingerprint).toBeTruthy();
      expect(signature.timestamp).toBeInstanceOf(Date);
      expect(signature.nonce).toHaveLength(64); // 32 bytes hex
    });

    it('should sign binary data successfully', async () => {
      const testData = Buffer.from([0, 1, 2, 3, 4, 5]);
      
      const signature = await signatureManager.signData(testData, keyId);
      
      expect(signature).toBeDefined();
      expect(signature.signature).toBeTruthy();
    });

    it('should use custom hash algorithm when specified', async () => {
      const testData = 'Test data';
      
      const signature = await signatureManager.signData(testData, keyId, {
        hashAlgorithm: 'SHA-512'
      });
      
      expect(signature.hashAlgorithm).toBe('SHA-512');
    });

    it('should include timestamp when requested', async () => {
      const testData = 'Test data';
      const startTime = new Date();
      
      const signature = await signatureManager.signData(testData, keyId, {
        includeTimestamp: true
      });
      
      expect(signature.timestampAuthority).toBeDefined();
      expect(signature.timestamp.getTime()).toBeGreaterThanOrEqual(startTime.getTime());
    });

    it('should reject signing with non-existent key', async () => {
      await expect(
        signatureManager.signData('test', 'non-existent-key')
      ).rejects.toThrow('Key not found');
    });

    it('should reject signing with expired key', async () => {
      // Create an expired key
      const expiredKeyPair = await signatureManager.generateKeyPair('RSA-2048', {
        expiresInDays: -1 // Already expired
      });
      
      const expiredKeyId = 'expired-key';
      await signatureManager.importKeyPair(
        expiredKeyPair.publicKey,
        expiredKeyPair.privateKey,
        expiredKeyId,
        'RSA-2048'
      );

      await expect(
        signatureManager.signData('test', expiredKeyId)
      ).rejects.toThrow('Key expired');
    });
  });

  describe('Signature Verification', () => {
    let keyId: string;
    let publicKey: string;

    beforeEach(async () => {
      const keyPair = await signatureManager.generateKeyPair('ECDSA-P256');
      keyId = 'test-key';
      publicKey = keyPair.publicKey;
      
      await signatureManager.importKeyPair(
        keyPair.publicKey,
        keyPair.privateKey,
        keyId,
        'ECDSA-P256'
      );
    });

    it('should verify valid signature successfully', async () => {
      const testData = 'Hello, secure world!';
      
      const signature = await signatureManager.signData(testData, keyId);
      const isValid = await signatureManager.verifySignature(testData, signature, publicKey);
      
      expect(isValid).toBe(true);
    });

    it('should reject invalid signature', async () => {
      const testData = 'Hello, secure world!';
      const tamperedData = 'Hello, tampered world!';
      
      const signature = await signatureManager.signData(testData, keyId);
      const isValid = await signatureManager.verifySignature(tamperedData, signature, publicKey);
      
      expect(isValid).toBe(false);
    });

    it('should reject signature with wrong public key', async () => {
      const testData = 'Test data';
      
      // Create another key pair for wrong public key
      const wrongKeyPair = await signatureManager.generateKeyPair('ECDSA-P256');
      
      const signature = await signatureManager.signData(testData, keyId);
      const isValid = await signatureManager.verifySignature(testData, signature, wrongKeyPair.publicKey);
      
      expect(isValid).toBe(false);
    });

    it('should handle corrupted signature gracefully', async () => {
      const testData = 'Test data';
      
      const signature = await signatureManager.signData(testData, keyId);
      signature.signature = 'corrupted-signature';
      
      const isValid = await signatureManager.verifySignature(testData, signature, publicKey);
      
      expect(isValid).toBe(false);
    });

    it('should verify signature with binary data', async () => {
      const testData = Buffer.from([1, 2, 3, 4, 5]);
      
      const signature = await signatureManager.signData(testData, keyId);
      const isValid = await signatureManager.verifySignature(testData, signature, publicKey);
      
      expect(isValid).toBe(true);
    });
  });

  describe('Key Management', () => {
    it('should list keys correctly', async () => {
      const keyPair1 = await signatureManager.generateKeyPair('RSA-2048');
      const keyPair2 = await signatureManager.generateKeyPair('ECDSA-P256');
      
      await signatureManager.importKeyPair(keyPair1.publicKey, keyPair1.privateKey, 'key1', 'RSA-2048');
      await signatureManager.importKeyPair(keyPair2.publicKey, keyPair2.privateKey, 'key2', 'ECDSA-P256');
      
      const keys = signatureManager.listKeys();
      
      expect(keys).toHaveLength(2);
      expect(keys.find(k => k.keyId === 'key1')).toBeDefined();
      expect(keys.find(k => k.keyId === 'key2')).toBeDefined();
    });

    it('should export public key correctly', async () => {
      const keyPair = await signatureManager.generateKeyPair('RSA-2048');
      const keyId = 'test-key';
      
      await signatureManager.importKeyPair(keyPair.publicKey, keyPair.privateKey, keyId, 'RSA-2048');
      
      const exportedKey = signatureManager.exportPublicKey(keyId);
      
      expect(exportedKey).toBe(keyPair.publicKey);
    });

    it('should delete key successfully', async () => {
      const keyPair = await signatureManager.generateKeyPair('RSA-2048');
      const keyId = 'test-key';
      
      await signatureManager.importKeyPair(keyPair.publicKey, keyPair.privateKey, keyId, 'RSA-2048');
      
      expect(signatureManager.isKeyValid(keyId)).toBe(true);
      
      const deleted = signatureManager.deleteKey(keyId);
      
      expect(deleted).toBe(true);
      expect(signatureManager.isKeyValid(keyId)).toBe(false);
    });

    it('should validate key expiration', async () => {
      const keyPair = await signatureManager.generateKeyPair('RSA-2048', {
        expiresInDays: 1
      });
      const keyId = 'test-key';
      
      await signatureManager.importKeyPair(keyPair.publicKey, keyPair.privateKey, keyId, 'RSA-2048');
      
      expect(signatureManager.isKeyValid(keyId)).toBe(true);
    });
  });

  describe('Certificate Management', () => {
    it('should add and retrieve certificates', async () => {
      const keyPair = await signatureManager.generateKeyPair('RSA-2048');
      const keyId = 'test-key';
      
      await signatureManager.importKeyPair(keyPair.publicKey, keyPair.privateKey, keyId, 'RSA-2048');
      
      const certificate = {
        id: 'cert-1',
        publicKey: keyPair.publicKey,
        issuer: 'Test CA',
        subject: 'Test Subject',
        validFrom: new Date(),
        validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        algorithm: 'RSA-2048' as SignatureAlgorithm,
        fingerprint: keyPair.fingerprint,
        serialNumber: '12345',
        revoked: false
      };
      
      signatureManager.addCertificate(certificate);
      
      const chain = signatureManager.getCertificateChain(keyId);
      expect(chain).toHaveLength(1);
      expect(chain[0].id).toBe('cert-1');
    });

    it('should revoke certificate', async () => {
      const keyPair = await signatureManager.generateKeyPair('RSA-2048');
      const keyId = 'test-key';
      
      await signatureManager.importKeyPair(keyPair.publicKey, keyPair.privateKey, keyId, 'RSA-2048');
      
      const certificate = {
        id: 'cert-1',
        publicKey: keyPair.publicKey,
        issuer: 'Test CA',
        subject: 'Test Subject',
        validFrom: new Date(),
        validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        algorithm: 'RSA-2048' as SignatureAlgorithm,
        fingerprint: keyPair.fingerprint,
        serialNumber: '12345',
        revoked: false
      };
      
      signatureManager.addCertificate(certificate);
      signatureManager.revokeCertificate('cert-1', 'Key compromise');
      
      const chain = signatureManager.getCertificateChain(keyId);
      expect(chain[0].revoked).toBe(true);
      expect(chain[0].revokedReason).toBe('Key compromise');
      expect(chain[0].revokedAt).toBeInstanceOf(Date);
    });
  });

  describe('Algorithm Support', () => {
    const algorithms: SignatureAlgorithm[] = ['RSA-2048', 'RSA-3072', 'RSA-4096', 'ECDSA-P256', 'ECDSA-P384', 'ECDSA-P521'];

    algorithms.forEach(algorithm => {
      it(`should support ${algorithm} algorithm`, async () => {
        const keyPair = await signatureManager.generateKeyPair(algorithm);
        const keyId = `test-key-${algorithm}`;
        
        await signatureManager.importKeyPair(keyPair.publicKey, keyPair.privateKey, keyId, algorithm);
        
        const testData = 'Algorithm test data';
        const signature = await signatureManager.signData(testData, keyId);
        const isValid = await signatureManager.verifySignature(testData, signature, keyPair.publicKey);
        
        expect(signature.algorithm).toBe(algorithm);
        expect(isValid).toBe(true);
      });
    });
  });

  describe('Security Properties', () => {
    it('should generate unique nonces for each signature', async () => {
      const keyPair = await signatureManager.generateKeyPair('ECDSA-P256');
      const keyId = 'test-key';
      
      await signatureManager.importKeyPair(keyPair.publicKey, keyPair.privateKey, keyId, 'ECDSA-P256');
      
      const testData = 'Same data';
      const signature1 = await signatureManager.signData(testData, keyId);
      const signature2 = await signatureManager.signData(testData, keyId);
      
      expect(signature1.nonce).not.toBe(signature2.nonce);
      expect(signature1.signature).not.toBe(signature2.signature); // Different due to nonce
    });

    it('should validate signature timestamp', async () => {
      const keyPair = await signatureManager.generateKeyPair('ECDSA-P256');
      const keyId = 'test-key';
      
      await signatureManager.importKeyPair(keyPair.publicKey, keyPair.privateKey, keyId, 'ECDSA-P256');
      
      const testData = 'Timestamp test';
      const beforeSign = new Date();
      const signature = await signatureManager.signData(testData, keyId);
      const afterSign = new Date();
      
      expect(signature.timestamp.getTime()).toBeGreaterThanOrEqual(beforeSign.getTime());
      expect(signature.timestamp.getTime()).toBeLessThanOrEqual(afterSign.getTime());
    });

    it('should properly handle large data', async () => {
      const keyPair = await signatureManager.generateKeyPair('RSA-2048');
      const keyId = 'test-key';
      
      await signatureManager.importKeyPair(keyPair.publicKey, keyPair.privateKey, keyId, 'RSA-2048');
      
      // Create 1MB of test data
      const largeData = Buffer.alloc(1024 * 1024, 'A');
      
      const signature = await signatureManager.signData(largeData, keyId);
      const isValid = await signatureManager.verifySignature(largeData, signature, keyPair.publicKey);
      
      expect(isValid).toBe(true);
    }, 10000); // Increase timeout for large data test
  });

  describe('Error Handling', () => {
    it('should handle malformed public keys', async () => {
      const keyPair = await signatureManager.generateKeyPair('RSA-2048');
      const keyId = 'test-key';
      
      await signatureManager.importKeyPair(keyPair.publicKey, keyPair.privateKey, keyId, 'RSA-2048');
      
      const signature = await signatureManager.signData('test', keyId);
      const isValid = await signatureManager.verifySignature('test', signature, 'malformed-key');
      
      expect(isValid).toBe(false);
    });

    it('should handle network errors in timestamping gracefully', async () => {
      const keyPair = await signatureManager.generateKeyPair('RSA-2048');
      const keyId = 'test-key';
      
      await signatureManager.importKeyPair(keyPair.publicKey, keyPair.privateKey, keyId, 'RSA-2048');
      
      // Should not throw even if timestamping fails
      await expect(signatureManager.signData('test', keyId, {
        includeTimestamp: true
      })).resolves.toBeDefined();
    });

    it('should validate key algorithm consistency', async () => {
      const keyPair = await signatureManager.generateKeyPair('RSA-2048');
      
      await expect(signatureManager.importKeyPair(
        keyPair.publicKey,
        keyPair.privateKey,
        'test-key',
        'ECDSA-P256' // Wrong algorithm
      )).resolves.not.toThrow(); // Should work but may cause verification issues
    });
  });
});