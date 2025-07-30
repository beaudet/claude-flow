/**
 * Security Integration Test Suite
 * End-to-end tests for complete security workflows
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { EnterpriseSecurityManager } from '../enterprise-security-manager.js';
import { DEFAULT_SECURITY_CONFIG, PRODUCTION_SECURITY_CONFIG } from '../constants.js';
import type { SecurityConfig, Environment } from '../types.js';

describe('Security Integration Tests', () => {
  let securityManager: EnterpriseSecurityManager;
  let testDir: string;
  let keyStoreDir: string;

  beforeEach(async () => {
    // Create temporary directories
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'security-integration-'));
    keyStoreDir = path.join(testDir, 'keys');
    
    // Initialize security manager
    const config: SecurityConfig = {
      ...DEFAULT_SECURITY_CONFIG,
      environment: 'development'
    };
    
    securityManager = new EnterpriseSecurityManager(config, keyStoreDir);
    await securityManager.initialize();
  });

  afterEach(async () => {
    // Cleanup
    await securityManager.shutdown();
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Complete Signing Workflow', () => {
    it('should complete full artifact signing workflow', async () => {
      // 1. Add user with signing permissions
      await securityManager.addUser('test-signer', ['signer'], ['development']);
      
      // 2. Authenticate user
      const authResult = await securityManager.authenticateUser(
        'test-signer',
        { token: 'test-token' },
        ['artifact:sign']
      );
      
      expect(authResult.authenticated).toBe(true);
      expect(authResult.permissions).toContain('artifact:sign');

      // 3. Generate signing key
      const keyResult = await securityManager.keyManager.generateManagedKey({
        purpose: ['signing'],
        owner: 'test-signer',
        autoRotate: false,
        backup: true
      });

      expect(keyResult.keyId).toBeTruthy();
      expect(keyResult.backupIds).toBeDefined();

      // 4. Create test artifacts
      const artifactDir = path.join(testDir, 'artifacts');
      await fs.mkdir(artifactDir, { recursive: true });
      await fs.writeFile(path.join(artifactDir, 'app.js'), 'console.log("Hello World");');
      await fs.writeFile(path.join(artifactDir, 'package.json'), '{"name": "test-app", "version": "1.0.0"}');

      // 5. Create artifact manifest
      const manifest = await securityManager.integrityManager.createArtifactManifest(
        artifactDir,
        'test-app',
        '1.0.0',
        'build-123'
      );

      expect(manifest.artifacts).toHaveLength(2);

      // 6. Sign artifacts
      const appJsData = await fs.readFile(path.join(artifactDir, 'app.js'));
      const signature = await securityManager.signatureManager.signData(
        appJsData,
        keyResult.keyId,
        { includeTimestamp: true }
      );

      expect(signature.signature).toBeTruthy();
      expect(signature.timestampAuthority).toBeTruthy();

      // 7. Verify signature
      const isValid = await securityManager.signatureManager.verifySignature(
        appJsData,
        signature
      );

      expect(isValid).toBe(true);

      // 8. Verify artifact integrity
      const verificationResults = await securityManager.integrityManager.verifyArtifactIntegrity(
        artifactDir,
        manifest
      );

      expect(verificationResults.every(r => r.valid)).toBe(true);

      // 9. Check security metrics
      const metrics = await securityManager.getSecurityMetrics();
      expect(metrics.signaturesGenerated).toBeGreaterThanOrEqual(1);
    });

    it('should handle signing workflow with key rotation', async () => {
      // Generate initial key
      const keyResult = await securityManager.keyManager.generateManagedKey({
        purpose: ['signing'],
        owner: 'test-user',
        autoRotate: true,
        rotationFrequencyDays: 1 // Very short for testing
      });

      const originalKeyId = keyResult.keyId;

      // Sign some data with original key
      const testData = 'Test data for rotation';
      const originalSignature = await securityManager.signatureManager.signData(
        testData,
        originalKeyId
      );

      expect(originalSignature).toBeTruthy();

      // Rotate the key
      const rotationResult = await securityManager.keyManager.rotateKey(originalKeyId, {
        transitionPeriodDays: 1
      });

      expect(rotationResult.newKeyId).not.toBe(originalKeyId);
      expect(rotationResult.oldKeyId).toBe(originalKeyId);

      // Sign with new key
      const newSignature = await securityManager.signatureManager.signData(
        testData,
        rotationResult.newKeyId
      );

      expect(newSignature).toBeTruthy();
      expect(newSignature.signature).not.toBe(originalSignature.signature);

      // Both signatures should be valid
      const originalValid = await securityManager.signatureManager.verifySignature(
        testData,
        originalSignature
      );
      const newValid = await securityManager.signatureManager.verifySignature(
        testData,
        newSignature
      );

      expect(originalValid).toBe(true);
      expect(newValid).toBe(true);
    });
  });

  describe('Build Pipeline Integration', () => {
    it('should integrate with build pipeline workflow', async () => {
      // Create mock project structure
      const projectDir = path.join(testDir, 'project');
      const srcDir = path.join(projectDir, 'src');
      const distDir = path.join(projectDir, 'dist');
      
      await fs.mkdir(srcDir, { recursive: true });
      await fs.mkdir(distDir, { recursive: true });
      
      // Create source files
      await fs.writeFile(path.join(srcDir, 'index.js'), 'console.log("App started");');
      await fs.writeFile(path.join(srcDir, 'utils.js'), 'export const helper = () => "help";');
      await fs.writeFile(path.join(projectDir, 'package.json'), JSON.stringify({
        name: 'test-app',
        version: '1.0.0',
        scripts: {
          build: 'echo "Building..." && cp -r src/* dist/'
        }
      }, null, 2));

      // Create build artifacts (simulated)
      await fs.writeFile(path.join(distDir, 'index.js'), 'console.log("App started");');
      await fs.writeFile(path.join(distDir, 'utils.js'), 'export const helper = () => "help";');

      // Initialize build integration
      await securityManager.buildIntegrator.integrateWithNPM(projectDir);

      // Check that package.json was updated
      const packageJson = JSON.parse(await fs.readFile(path.join(projectDir, 'package.json'), 'utf8'));
      expect(packageJson.scripts['build:secure']).toBeTruthy();
      expect(packageJson.scripts['build:sign']).toBeTruthy();
      expect(packageJson.scripts['build:verify']).toBeTruthy();
      expect(packageJson.security).toBeTruthy();

      // Create build context
      const buildContext = {
        buildId: 'build-456',
        projectName: 'test-app',
        version: '1.0.0',
        environment: 'development',
        buildDir: projectDir,
        outputDir: distDir,
        artifacts: ['index.js', 'utils.js'],
        metadata: {}
      };

      // Generate signing key for build
      const keyResult = await securityManager.keyManager.generateManagedKey({
        purpose: ['build-signing'],
        owner: 'build-system'
      });

      // Add signing policy
      securityManager.buildIntegrator.addSigningPolicy({
        name: 'Development Build Policy',
        enabled: true,
        condition: 'environment === "development"',
        keyId: keyResult.keyId,
        artifacts: ['**/*.js'],
        excludePatterns: [],
        timestamping: true,
        manifestGeneration: true
      });

      // Execute secure build (simplified - would normally run actual build commands)
      const buildResult = await securityManager.buildIntegrator.executeBuild(buildContext);

      expect(buildResult.buildId).toBe('build-456');
      expect(buildResult.artifacts).toBeTruthy();
      expect(buildResult.signatures).toBeDefined();
      expect(buildResult.verificationResults).toBeDefined();
      expect(buildResult.buildLog.length).toBeGreaterThan(0);
    });
  });

  describe('Compliance and Audit Workflow', () => {
    it('should generate compliance reports with audit trail', async () => {
      // Perform various security operations to generate audit logs
      
      // 1. User management operations
      await securityManager.addUser('test-auditor', ['auditor'], ['development', 'production']);
      await securityManager.addUser('test-admin', ['admin'], ['development', 'staging', 'production']);

      // 2. Key management operations
      const signingKey = await securityManager.keyManager.generateManagedKey({
        purpose: ['signing'],
        owner: 'test-admin',
        backup: true
      });

      const encryptionKey = await securityManager.keyManager.generateManagedKey({
        purpose: ['encryption'],
        owner: 'test-admin',
        backup: true
      });

      // 3. Signing operations
      const testData = 'Important business data';
      const signature = await securityManager.signatureManager.signData(
        testData,
        signingKey.keyId
      );

      // 4. Verification operations
      const isValid = await securityManager.signatureManager.verifySignature(
        testData,
        signature
      );

      expect(isValid).toBe(true);

      // 5. Generate compliance report
      const period = {
        from: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
        to: new Date()
      };

      const complianceReport = await securityManager.complianceReporter.generateSOC2Report(period);

      expect(complianceReport.standard).toBe('SOC2');
      expect(complianceReport.period).toEqual(period);
      expect(complianceReport.findings).toBeDefined();
      expect(complianceReport.recommendations).toBeDefined();
      expect(complianceReport.artifacts.total).toBeGreaterThan(0);

      // 6. Generate security report
      const securityReport = await securityManager.generateSecurityReport({
        period,
        includeCompliance: true,
        includeAuditLogs: true,
        includeMetrics: true,
        standards: ['SOC2']
      });

      expect(securityReport.reportId).toBeTruthy();
      expect(securityReport.metrics).toBeDefined();
      expect(securityReport.compliance).toBeDefined();
      expect(securityReport.auditSummary).toBeDefined();
      expect(securityReport.recommendations).toBeDefined();
      expect(securityReport.recommendations.length).toBeGreaterThan(0);

      // 7. Export audit logs
      const auditExportPath = await securityManager.auditLogger.exportLogs(
        { startDate: period.from, endDate: period.to },
        'json'
      );

      expect(auditExportPath).toBeTruthy();
      
      // Verify export file exists and contains data
      const exportData = await fs.readFile(auditExportPath, 'utf8');
      const auditLogs = JSON.parse(exportData);
      expect(Array.isArray(auditLogs)).toBe(true);
      expect(auditLogs.length).toBeGreaterThan(0);
    });
  });

  describe('Multi-Environment Security', () => {
    it('should handle different security configurations per environment', async () => {
      // Test development environment (default)
      expect(securityManager.config.environment).toBe('development');
      expect(securityManager.config.signatureAlgorithm).toBe('ECDSA-P256');
      expect(securityManager.config.complianceMode).toBe(false);

      // Create production security manager
      const prodConfig: SecurityConfig = {
        ...PRODUCTION_SECURITY_CONFIG,
        environment: 'production'
      };

      const prodSecurityManager = new EnterpriseSecurityManager(
        prodConfig,
        path.join(testDir, 'prod-keys')
      );
      
      await prodSecurityManager.initialize();

      try {
        expect(prodSecurityManager.config.environment).toBe('production');
        expect(prodSecurityManager.config.signatureAlgorithm).toBe('RSA-4096');
        expect(prodSecurityManager.config.complianceMode).toBe(true);
        expect(prodSecurityManager.config.hashAlgorithm).toBe('SHA-512');

        // Generate keys in both environments
        const devKey = await securityManager.keyManager.generateManagedKey({
          purpose: ['testing'],
          owner: 'dev-user'
        });

        const prodKey = await prodSecurityManager.keyManager.generateManagedKey({
          purpose: ['production'],
          owner: 'prod-user'
        });

        expect(devKey.metadata.algorithm).toBe('ECDSA-P256');
        expect(prodKey.metadata.algorithm).toBe('RSA-4096');

        // Test cross-environment key usage restrictions
        expect(securityManager.hasPermission('dev-user', 'production:access')).toBe(false);
        
        await prodSecurityManager.addUser('prod-user', ['signer'], ['production']);
        expect(prodSecurityManager.hasPermission('prod-user', 'artifact:sign', 'production')).toBe(true);
        expect(prodSecurityManager.hasPermission('prod-user', 'artifact:sign', 'development')).toBe(false);

      } finally {
        await prodSecurityManager.shutdown();
      }
    });
  });

  describe('Security Policy Enforcement', () => {
    it('should enforce security policies across operations', async () => {
      // Create a strict security policy
      const policyId = await securityManager.createSecurityPolicy({
        name: 'Strict Development Policy',
        description: 'Enforces minimum security requirements for development',
        rules: {
          minKeySize: 2048,
          requiredAlgorithms: ['RSA-2048', 'RSA-4096'],
          mandatoryTimestamping: true,
          auditRetention: 90,
          multiFactorAuth: false
        },
        environments: ['development'],
        enforcement: 'blocking'
      });

      expect(policyId).toBeTruthy();

      // Test key generation compliance
      const compliantKey = await securityManager.keyManager.generateManagedKey({
        algorithm: 'RSA-2048', // Compliant with policy
        purpose: ['signing'],
        owner: 'test-user'
      });

      expect(compliantKey.keyPair.algorithm).toBe('RSA-2048');
      expect(compliantKey.keyPair.keySize).toBe(2048);

      // Test signing with timestamping requirement
      const testData = 'Policy test data';
      const signature = await securityManager.signatureManager.signData(
        testData,
        compliantKey.keyId,
        { includeTimestamp: true }
      );

      expect(signature.timestampAuthority).toBeTruthy();

      // Verify audit logging is working
      const auditLogs = await securityManager.auditLogger.queryLogs({
        startDate: new Date(Date.now() - 60000), // Last minute
        endDate: new Date()
      });

      expect(auditLogs.length).toBeGreaterThan(0);
      
      const policyCreationLog = auditLogs.find(log => 
        log.action === 'security_policy_created'
      );
      expect(policyCreationLog).toBeTruthy();
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle system errors gracefully and maintain audit trail', async () => {
      // Test invalid key operations
      await expect(
        securityManager.signatureManager.signData('test', 'nonexistent-key')
      ).rejects.toThrow('Key not found');

      // Test invalid user operations
      const authResult = await securityManager.authenticateUser(
        'nonexistent-user',
        { token: 'invalid' }
      );
      
      expect(authResult.authenticated).toBe(false);

      // Test key backup and recovery
      const originalKey = await securityManager.keyManager.generateManagedKey({
        purpose: ['testing'],
        owner: 'test-user',
        backup: true
      });

      expect(originalKey.backupIds).toBeDefined();
      expect(originalKey.backupIds!.length).toBeGreaterThan(0);

      // Simulate key recovery scenario
      const backupId = originalKey.backupIds![0];
      
      // Recovery should work with proper credentials
      const recoveredKey = await securityManager.keyManager.recoverKeyFromBackup(
        backupId,
        { passphrase: 'test-passphrase' }
      );

      expect(recoveredKey.keyId).toBe(originalKey.keyId);
      expect(recoveredKey.keyPair.publicKey).toBe(originalKey.keyPair.publicKey);

      // Verify all error operations were logged
      const errorLogs = await securityManager.auditLogger.queryLogs({
        results: ['failure'],
        startDate: new Date(Date.now() - 60000)
      });

      expect(errorLogs.length).toBeGreaterThan(0);
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle multiple concurrent operations efficiently', async () => {
      const concurrentOperations = 10;
      const operations: Promise<any>[] = [];

      // Generate multiple keys concurrently
      for (let i = 0; i < concurrentOperations; i++) {
        operations.push(
          securityManager.keyManager.generateManagedKey({
            purpose: [`test-${i}`],
            owner: `user-${i}`
          })
        );
      }

      const startTime = Date.now();
      const results = await Promise.all(operations);
      const endTime = Date.now();

      expect(results).toHaveLength(concurrentOperations);
      expect(results.every(r => r.keyId)).toBe(true);
      
      // Should complete within reasonable time (adjusted for CI environments)
      expect(endTime - startTime).toBeLessThan(30000); // 30 seconds

      // Test concurrent signing operations
      const signingOperations: Promise<any>[] = [];
      const testData = 'Concurrent test data';

      for (let i = 0; i < concurrentOperations; i++) {
        signingOperations.push(
          securityManager.signatureManager.signData(testData, results[i].keyId)
        );
      }

      const signatures = await Promise.all(signingOperations);
      expect(signatures).toHaveLength(concurrentOperations);
      expect(signatures.every(s => s.signature)).toBe(true);

      // Verify all signatures
      const verificationOperations: Promise<boolean>[] = [];
      for (let i = 0; i < concurrentOperations; i++) {
        verificationOperations.push(
          securityManager.signatureManager.verifySignature(testData, signatures[i])
        );
      }

      const verificationResults = await Promise.all(verificationOperations);
      expect(verificationResults.every(r => r === true)).toBe(true);
    }, 60000); // Increase timeout for performance test
  });
});