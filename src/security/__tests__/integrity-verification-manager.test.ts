/**
 * Integrity Verification Manager Test Suite
 * Tests for file integrity verification and tamper detection
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { IntegrityVerificationManager } from '../integrity-verification-manager.js';
import { DEFAULT_SECURITY_CONFIG } from '../constants.js';
import type { SecurityConfig, HashAlgorithm } from '../types.js';

describe('IntegrityVerificationManager', () => {
  let integrityManager: IntegrityVerificationManager;
  let config: SecurityConfig;
  let testDir: string;

  beforeEach(async () => {
    config = { ...DEFAULT_SECURITY_CONFIG };
    integrityManager = new IntegrityVerificationManager(config);
    
    // Create temporary test directory
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'integrity-test-'));
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Hash Generation', () => {
    it('should generate SHA-256 hash correctly', async () => {
      const testFile = path.join(testDir, 'test.txt');
      await fs.writeFile(testFile, 'Hello, world!');
      
      const hash = await integrityManager.generateFileHash(testFile, 'SHA-256');
      
      expect(hash).toBe('315f5bdb76d078c43b8ac0064e4a0164612b1fce77c869345bfc94c75894edd3');
    });

    it('should generate SHA-512 hash correctly', async () => {
      const testFile = path.join(testDir, 'test.txt');
      await fs.writeFile(testFile, 'Hello, world!');
      
      const hash = await integrityManager.generateFileHash(testFile, 'SHA-512');
      
      expect(hash).toHaveLength(128); // SHA-512 produces 64-byte hash (128 hex chars)
    });

    it('should generate different hashes for different content', async () => {
      const testFile1 = path.join(testDir, 'test1.txt');
      const testFile2 = path.join(testDir, 'test2.txt');
      
      await fs.writeFile(testFile1, 'Hello, world!');
      await fs.writeFile(testFile2, 'Goodbye, world!');
      
      const hash1 = await integrityManager.generateFileHash(testFile1);
      const hash2 = await integrityManager.generateFileHash(testFile2);
      
      expect(hash1).not.toBe(hash2);
    });

    it('should generate same hash for identical content', async () => {
      const testFile1 = path.join(testDir, 'test1.txt');
      const testFile2 = path.join(testDir, 'test2.txt');
      
      const content = 'Identical content';
      await fs.writeFile(testFile1, content);
      await fs.writeFile(testFile2, content);
      
      const hash1 = await integrityManager.generateFileHash(testFile1);
      const hash2 = await integrityManager.generateFileHash(testFile2);
      
      expect(hash1).toBe(hash2);
    });

    it('should handle binary files correctly', async () => {
      const testFile = path.join(testDir, 'binary.bin');
      const binaryData = Buffer.from([0, 1, 2, 3, 255, 254, 253]);
      
      await fs.writeFile(testFile, binaryData);
      
      const hash = await integrityManager.generateFileHash(testFile);
      
      expect(hash).toBeTruthy();
      expect(hash).toHaveLength(64); // SHA-256 hex length
    });

    it('should reject non-existent files', async () => {
      const nonExistentFile = path.join(testDir, 'nonexistent.txt');
      
      await expect(integrityManager.generateFileHash(nonExistentFile))
        .rejects.toThrow();
    });
  });

  describe('Batch Hash Generation', () => {
    it('should generate hashes for multiple files', async () => {
      const files = ['file1.txt', 'file2.txt', 'file3.txt'];
      const filePaths: string[] = [];
      
      for (let i = 0; i < files.length; i++) {
        const filePath = path.join(testDir, files[i]);
        await fs.writeFile(filePath, `Content of file ${i + 1}`);
        filePaths.push(filePath);
      }
      
      const hashes = await integrityManager.generateBatchHashes(filePaths);
      
      expect(hashes.size).toBe(3);
      for (const filePath of filePaths) {
        expect(hashes.has(filePath)).toBe(true);
        expect(hashes.get(filePath)).toBeTruthy();
      }
    });

    it('should handle empty file list', async () => {
      const hashes = await integrityManager.generateBatchHashes([]);
      
      expect(hashes.size).toBe(0);
    });

    it('should handle mix of existing and non-existing files', async () => {
      const existingFile = path.join(testDir, 'existing.txt');
      await fs.writeFile(existingFile, 'I exist');
      
      const nonExistentFile = path.join(testDir, 'nonexistent.txt');
      
      await expect(integrityManager.generateBatchHashes([existingFile, nonExistentFile]))
        .rejects.toThrow();
    });
  });

  describe('Artifact Manifest Creation', () => {
    beforeEach(async () => {
      // Create test file structure
      await fs.mkdir(path.join(testDir, 'src'), { recursive: true });
      await fs.mkdir(path.join(testDir, 'dist'), { recursive: true });
      
      await fs.writeFile(path.join(testDir, 'README.md'), '# Test Project');
      await fs.writeFile(path.join(testDir, 'package.json'), '{"name": "test"}');
      await fs.writeFile(path.join(testDir, 'src', 'index.js'), 'console.log("hello");');
      await fs.writeFile(path.join(testDir, 'dist', 'bundle.js'), 'console.log("bundled");');
    });

    it('should create artifact manifest with all files', async () => {
      const manifest = await integrityManager.createArtifactManifest(
        testDir,
        'test-project',
        '1.0.0',
        'build-123'
      );
      
      expect(manifest.name).toBe('test-project');
      expect(manifest.version).toBe('1.0.0');
      expect(manifest.buildId).toBe('build-123');
      expect(manifest.artifacts).toHaveLength(4);
      expect(manifest.environment).toBe(config.environment);
      expect(manifest.createdAt).toBeInstanceOf(Date);
    });

    it('should respect include patterns', async () => {
      const manifest = await integrityManager.createArtifactManifest(
        testDir,
        'test-project',
        '1.0.0',
        'build-123',
        { includePatterns: ['*.md', 'src/**'] }
      );
      
      expect(manifest.artifacts).toHaveLength(2); // README.md and src/index.js
      expect(manifest.artifacts.some(a => a.path === 'README.md')).toBe(true);
      expect(manifest.artifacts.some(a => a.path === 'src/index.js')).toBe(true);
    });

    it('should respect exclude patterns', async () => {
      const manifest = await integrityManager.createArtifactManifest(
        testDir,
        'test-project',
        '1.0.0',
        'build-123',
        { excludePatterns: ['dist/**'] }
      );
      
      expect(manifest.artifacts).toHaveLength(3); // All except dist/bundle.js
      expect(manifest.artifacts.some(a => a.path === 'dist/bundle.js')).toBe(false);
    });

    it('should include multiple hash algorithms when specified', async () => {
      const manifest = await integrityManager.createArtifactManifest(
        testDir,
        'test-project',
        '1.0.0',
        'build-123',
        { algorithms: ['SHA-256', 'SHA-512'] }
      );
      
      // Should have artifacts for each file * number of algorithms
      expect(manifest.artifacts.length).toBe(4 * 2); // 4 files * 2 algorithms
      
      const sha256Artifacts = manifest.artifacts.filter(a => a.hashAlgorithm === 'SHA-256');
      const sha512Artifacts = manifest.artifacts.filter(a => a.hashAlgorithm === 'SHA-512');
      
      expect(sha256Artifacts).toHaveLength(4);
      expect(sha512Artifacts).toHaveLength(4);
    });

    it('should include file metadata', async () => {
      const manifest = await integrityManager.createArtifactManifest(
        testDir,
        'test-project',
        '1.0.0',
        'build-123'
      );
      
      const readmeArtifact = manifest.artifacts.find(a => a.path === 'README.md');
      expect(readmeArtifact).toBeDefined();
      expect(readmeArtifact!.size).toBeGreaterThan(0);
      expect(readmeArtifact!.mimeType).toBe('text/markdown');
      expect(readmeArtifact!.permissions).toBeTruthy();
    });
  });

  describe('Integrity Verification', () => {
    let originalManifest: any;

    beforeEach(async () => {
      // Create test files
      await fs.writeFile(path.join(testDir, 'file1.txt'), 'Original content 1');
      await fs.writeFile(path.join(testDir, 'file2.txt'), 'Original content 2');
      
      // Create baseline manifest
      originalManifest = await integrityManager.createArtifactManifest(
        testDir,
        'test-project',
        '1.0.0',
        'build-123'
      );
    });

    it('should verify intact files successfully', async () => {
      const results = await integrityManager.verifyArtifactIntegrity(testDir, originalManifest);
      
      expect(results).toHaveLength(2);
      expect(results.every(r => r.valid)).toBe(true);
      expect(results.every(r => r.errors.length === 0)).toBe(true);
    });

    it('should detect modified files', async () => {
      // Modify one file
      await fs.writeFile(path.join(testDir, 'file1.txt'), 'Modified content 1');
      
      const results = await integrityManager.verifyArtifactIntegrity(testDir, originalManifest);
      
      const file1Result = results.find(r => r.artifact === 'file1.txt');
      const file2Result = results.find(r => r.artifact === 'file2.txt');
      
      expect(file1Result?.valid).toBe(false);
      expect(file1Result?.errors).toContain(expect.stringMatching(/Hash mismatch/));
      expect(file2Result?.valid).toBe(true);
    });

    it('should detect deleted files', async () => {
      // Delete one file
      await fs.unlink(path.join(testDir, 'file1.txt'));
      
      const results = await integrityManager.verifyArtifactIntegrity(testDir, originalManifest);
      
      const file1Result = results.find(r => r.artifact === 'file1.txt');
      
      expect(file1Result?.valid).toBe(false);
      expect(file1Result?.errors).toContain(expect.stringMatching(/File not found/));
    });

    it('should detect size changes', async () => {
      // Change file size
      await fs.writeFile(path.join(testDir, 'file1.txt'), 'Much longer content than original');
      
      const results = await integrityManager.verifyArtifactIntegrity(testDir, originalManifest);
      
      const file1Result = results.find(r => r.artifact === 'file1.txt');
      
      expect(file1Result?.valid).toBe(false);
      expect(file1Result?.errors).toContain(expect.stringMatching(/File size mismatch/));
    });
  });

  describe('Tamper Detection', () => {
    let baselineManifest: any;

    beforeEach(async () => {
      // Create initial files
      await fs.writeFile(path.join(testDir, 'original1.txt'), 'Original 1');
      await fs.writeFile(path.join(testDir, 'original2.txt'), 'Original 2');
      
      baselineManifest = await integrityManager.createArtifactManifest(
        testDir,
        'test-project',
        '1.0.0',
        'build-123'
      );
    });

    it('should detect no changes when files are intact', async () => {
      const result = await integrityManager.detectTampering(testDir, baselineManifest);
      
      expect(result.tamperedFiles).toHaveLength(0);
      expect(result.newFiles).toHaveLength(0);
      expect(result.deletedFiles).toHaveLength(0);
      expect(result.modifiedFiles).toHaveLength(0);
      expect(result.summary.totalChecked).toBe(2);
    });

    it('should detect new files', async () => {
      await fs.writeFile(path.join(testDir, 'new-file.txt'), 'New content');
      
      const result = await integrityManager.detectTampering(testDir, baselineManifest);
      
      expect(result.newFiles).toContain('new-file.txt');
      expect(result.summary.new).toBe(1);
    });

    it('should detect deleted files', async () => {
      await fs.unlink(path.join(testDir, 'original1.txt'));
      
      const result = await integrityManager.detectTampering(testDir, baselineManifest);
      
      expect(result.deletedFiles).toContain('original1.txt');
      expect(result.summary.deleted).toBe(1);
    });

    it('should detect modified files', async () => {
      await fs.writeFile(path.join(testDir, 'original1.txt'), 'Modified content');
      
      const result = await integrityManager.detectTampering(testDir, baselineManifest);
      
      expect(result.modifiedFiles).toContain('original1.txt');
      expect(result.tamperedFiles).toContain('original1.txt');
      expect(result.summary.modified).toBe(1);
      expect(result.summary.tampered).toBe(1);
    });

    it('should detect multiple types of changes', async () => {
      // Modify existing file
      await fs.writeFile(path.join(testDir, 'original1.txt'), 'Modified');
      // Delete existing file
      await fs.unlink(path.join(testDir, 'original2.txt'));
      // Add new file
      await fs.writeFile(path.join(testDir, 'new.txt'), 'New');
      
      const result = await integrityManager.detectTampering(testDir, baselineManifest);
      
      expect(result.modifiedFiles).toContain('original1.txt');
      expect(result.deletedFiles).toContain('original2.txt');
      expect(result.newFiles).toContain('new.txt');
      expect(result.summary.modified).toBe(1);
      expect(result.summary.deleted).toBe(1);
      expect(result.summary.new).toBe(1);
    });
  });

  describe('Integrity Score Calculation', () => {
    it('should return perfect score for all valid results', async () => {
      const results = [
        { valid: true, errors: [], warnings: [] },
        { valid: true, errors: [], warnings: [] },
        { valid: true, errors: [], warnings: [] }
      ] as any[];
      
      const score = integrityManager.calculateIntegrityScore(results);
      
      expect(score.score).toBe(100);
      expect(score.passed).toBe(3);
      expect(score.failed).toBe(0);
      expect(score.warnings).toBe(0);
    });

    it('should calculate partial score for mixed results', async () => {
      const results = [
        { valid: true, errors: [], warnings: [] },
        { valid: false, errors: ['Hash mismatch'], warnings: [] },
        { valid: true, errors: [], warnings: ['Permission mismatch'] }
      ] as any[];
      
      const score = integrityManager.calculateIntegrityScore(results);
      
      expect(score.score).toBeCloseTo(66.67, 1);
      expect(score.passed).toBe(2);
      expect(score.failed).toBe(1);
      expect(score.warnings).toBe(1);
    });

    it('should return zero score for all failed results', async () => {
      const results = [
        { valid: false, errors: ['Error 1'], warnings: [] },
        { valid: false, errors: ['Error 2'], warnings: [] }
      ] as any[];
      
      const score = integrityManager.calculateIntegrityScore(results);
      
      expect(score.score).toBe(0);
      expect(score.passed).toBe(0);
      expect(score.failed).toBe(2);
    });

    it('should handle empty results', async () => {
      const score = integrityManager.calculateIntegrityScore([]);
      
      expect(score.score).toBe(0);
      expect(score.passed).toBe(0);
      expect(score.failed).toBe(0);
    });
  });

  describe('Manifest Persistence', () => {
    it('should save and load manifest correctly', async () => {
      await fs.writeFile(path.join(testDir, 'test.txt'), 'Test content');
      
      const originalManifest = await integrityManager.createArtifactManifest(
        testDir,
        'test-project',
        '1.0.0',
        'build-123'
      );
      
      const manifestPath = path.join(testDir, 'manifest.json');
      await integrityManager.saveManifest(originalManifest, manifestPath);
      
      const loadedManifest = await integrityManager.loadManifest(manifestPath);
      
      expect(loadedManifest.name).toBe(originalManifest.name);
      expect(loadedManifest.version).toBe(originalManifest.version);
      expect(loadedManifest.buildId).toBe(originalManifest.buildId);
      expect(loadedManifest.artifacts).toHaveLength(originalManifest.artifacts.length);
    });
  });

  describe('Checksum File Generation', () => {
    let manifest: any;

    beforeEach(async () => {
      await fs.writeFile(path.join(testDir, 'file1.txt'), 'Content 1');
      await fs.writeFile(path.join(testDir, 'file2.txt'), 'Content 2');
      
      manifest = await integrityManager.createArtifactManifest(
        testDir,
        'test-project',
        '1.0.0',
        'build-123'
      );
    });

    it('should generate SHA256 checksum file', async () => {
      const checksumPath = path.join(testDir, 'checksums.sha256');
      
      await integrityManager.generateChecksumFile(manifest, checksumPath, 'sha256sum');
      
      const checksumContent = await fs.readFile(checksumPath, 'utf8');
      const lines = checksumContent.trim().split('\n');
      
      expect(lines).toHaveLength(2);
      lines.forEach(line => {
        expect(line).toMatch(/^[a-f0-9]{64}  .+$/); // SHA256 hash + filename
      });
    });

    it('should generate custom format checksum file', async () => {
      const checksumPath = path.join(testDir, 'checksums.custom');
      
      await integrityManager.generateChecksumFile(manifest, checksumPath, 'custom');
      
      const checksumContent = await fs.readFile(checksumPath, 'utf8');
      
      expect(checksumContent).toContain('# Artifact Integrity Manifest');
      expect(checksumContent).toContain('# Name: test-project');
      expect(checksumContent).toContain('# Version: 1.0.0');
      expect(checksumContent).toContain('# Build ID: build-123');
    });
  });

  describe('Hash Algorithm Support', () => {
    const algorithms: HashAlgorithm[] = ['SHA-256', 'SHA-384', 'SHA-512'];

    algorithms.forEach(algorithm => {
      it(`should support ${algorithm} algorithm`, async () => {
        const testFile = path.join(testDir, 'test.txt');
        await fs.writeFile(testFile, 'Test content');
        
        const hash = await integrityManager.generateFileHash(testFile, algorithm);
        
        expect(hash).toBeTruthy();
        expect(typeof hash).toBe('string');
        expect(hash).toMatch(/^[a-f0-9]+$/);
        
        // Verify hash lengths
        const expectedLengths = {
          'SHA-256': 64,
          'SHA-384': 96,
          'SHA-512': 128
        };
        
        expect(hash).toHaveLength(expectedLengths[algorithm]);
      });
    });
  });

  describe('Performance and Edge Cases', () => {
    it('should handle large files efficiently', async () => {
      const largeFile = path.join(testDir, 'large.txt');
      const largeContent = 'A'.repeat(1024 * 1024); // 1MB
      
      await fs.writeFile(largeFile, largeContent);
      
      const startTime = Date.now();
      const hash = await integrityManager.generateFileHash(largeFile);
      const endTime = Date.now();
      
      expect(hash).toBeTruthy();
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    }, 10000);

    it('should handle empty files', async () => {
      const emptyFile = path.join(testDir, 'empty.txt');
      await fs.writeFile(emptyFile, '');
      
      const hash = await integrityManager.generateFileHash(emptyFile);
      
      expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'); // SHA-256 of empty string
    });

    it('should handle files with special characters in names', async () => {
      const specialFile = path.join(testDir, 'file with spaces & symbols!.txt');
      await fs.writeFile(specialFile, 'Special content');
      
      const hash = await integrityManager.generateFileHash(specialFile);
      
      expect(hash).toBeTruthy();
    });

    it('should handle deeply nested directories', async () => {
      const deepDir = path.join(testDir, 'a', 'b', 'c', 'd', 'e');
      await fs.mkdir(deepDir, { recursive: true });
      await fs.writeFile(path.join(deepDir, 'deep.txt'), 'Deep content');
      
      const manifest = await integrityManager.createArtifactManifest(
        testDir,
        'test-project',
        '1.0.0',
        'build-123'
      );
      
      expect(manifest.artifacts.some(a => a.path.includes('a/b/c/d/e/deep.txt'))).toBe(true);
    });
  });
});