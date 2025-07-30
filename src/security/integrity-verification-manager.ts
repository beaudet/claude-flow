/**
 * Integrity Verification Manager - Multi-algorithm file integrity verification
 * Supports SHA-256, SHA-512, BLAKE2 and provides tamper detection
 */

import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createReadStream } from 'fs';
import type {
  HashAlgorithm,
  ArtifactEntry,
  ArtifactManifest,
  VerificationResult,
  SecurityConfig
} from './types.js';

export class IntegrityVerificationManager {
  private config: SecurityConfig;
  private manifestCache: Map<string, ArtifactManifest> = new Map();

  constructor(config: SecurityConfig) {
    this.config = config;
  }

  /**
   * Generate hash for a single file
   */
  async generateFileHash(
    filePath: string,
    algorithm: HashAlgorithm = this.config.hashAlgorithm
  ): Promise<string> {
    const normalizedAlgorithm = this.normalizeHashAlgorithm(algorithm);
    
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash(normalizedAlgorithm);
      const stream = createReadStream(filePath);

      stream.on('error', reject);
      stream.on('data', chunk => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
    });
  }

  /**
   * Generate hashes for multiple files concurrently
   */
  async generateBatchHashes(
    filePaths: string[],
    algorithm: HashAlgorithm = this.config.hashAlgorithm
  ): Promise<Map<string, string>> {
    const hashPromises = filePaths.map(async (filePath) => {
      const hash = await this.generateFileHash(filePath, algorithm);
      return [filePath, hash] as [string, string];
    });

    const results = await Promise.all(hashPromises);
    return new Map(results);
  }

  /**
   * Create artifact manifest for a directory
   */
  async createArtifactManifest(
    directory: string,
    name: string,
    version: string,
    buildId: string,
    options: {
      includePatterns?: string[];
      excludePatterns?: string[];
      algorithms?: HashAlgorithm[];
      followSymlinks?: boolean;
    } = {}
  ): Promise<ArtifactManifest> {
    const {
      includePatterns = ['**/*'],
      excludePatterns = ['node_modules/**', '.git/**', '**/*.log'],
      algorithms = [this.config.hashAlgorithm],
      followSymlinks = false
    } = options;

    const files = await this.collectFiles(directory, includePatterns, excludePatterns, followSymlinks);
    const artifacts: ArtifactEntry[] = [];

    // Process files in parallel batches to avoid overwhelming the system
    const batchSize = 50;
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (file) => {
          const artifacts: ArtifactEntry[] = [];
          
          for (const algorithm of algorithms) {
            const filePath = path.join(directory, file);
            const stats = await fs.stat(filePath);
            const hash = await this.generateFileHash(filePath, algorithm);
            
            artifacts.push({
              path: file,
              hash,
              hashAlgorithm: algorithm,
              size: stats.size,
              mimeType: await this.getMimeType(filePath),
              permissions: stats.mode.toString(8),
              owner: stats.uid.toString(),
              group: stats.gid.toString()
            });
          }
          
          return artifacts;
        })
      );
      
      artifacts.push(...batchResults.flat());
    }

    const manifest: ArtifactManifest = {
      name,
      version,
      buildId,
      artifacts,
      signatures: [],
      createdAt: new Date(),
      environment: this.config.environment,
      buildMetadata: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        workingDirectory: directory,
        algorithms,
        totalFiles: files.length,
        totalSize: artifacts.reduce((sum, a) => sum + a.size, 0)
      }
    };

    this.manifestCache.set(buildId, manifest);
    return manifest;
  }

  /**
   * Verify artifact integrity against manifest
   */
  async verifyArtifactIntegrity(
    directory: string,
    manifest: ArtifactManifest
  ): Promise<VerificationResult[]> {
    const results: VerificationResult[] = [];
    const groupedArtifacts = this.groupArtifactsByPath(manifest.artifacts);

    for (const [artifactPath, artifactEntries] of groupedArtifacts) {
      const filePath = path.join(directory, artifactPath);
      
      try {
        // Check if file exists
        const stats = await fs.stat(filePath);
        
        for (const artifact of artifactEntries) {
          const result: VerificationResult = {
            valid: true,
            artifact: artifactPath,
            signature: manifest.signatures[0], // Use first signature for metadata
            errors: [],
            warnings: [],
            timestamp: new Date(),
            verifiedBy: 'integrity-verification-manager'
          };

          // Verify file size
          if (stats.size !== artifact.size) {
            result.valid = false;
            result.errors.push(`File size mismatch: expected ${artifact.size}, got ${stats.size}`);
          }

          // Verify hash
          try {
            const currentHash = await this.generateFileHash(filePath, artifact.hashAlgorithm);
            if (currentHash !== artifact.hash) {
              result.valid = false;
              result.errors.push(`Hash mismatch for ${artifact.hashAlgorithm}: expected ${artifact.hash}, got ${currentHash}`);
            }
          } catch (error) {
            result.valid = false;
            result.errors.push(`Failed to calculate hash: ${error instanceof Error ? error.message : String(error)}`);
          }

          // Check permissions if available
          if (artifact.permissions && stats.mode.toString(8) !== artifact.permissions) {
            result.warnings.push(`Permission mismatch: expected ${artifact.permissions}, got ${stats.mode.toString(8)}`);
          }

          results.push(result);
        }
      } catch (error) {
        // File doesn't exist or can't be accessed
        const result: VerificationResult = {
          valid: false,
          artifact: artifactPath,
          signature: manifest.signatures[0],
          errors: [`File not found or inaccessible: ${error instanceof Error ? error.message : String(error)}`],
          warnings: [],
          timestamp: new Date(),
          verifiedBy: 'integrity-verification-manager'
        };
        results.push(result);
      }
    }

    return results;
  }

  /**
   * Detect tampered files by comparing with baseline
   */
  async detectTampering(
    directory: string,
    baselineManifest: ArtifactManifest,
    options: {
      reportNewFiles?: boolean;
      reportDeletedFiles?: boolean;
      reportModifiedFiles?: boolean;
    } = {}
  ): Promise<{
    tamperedFiles: string[];
    newFiles: string[];
    deletedFiles: string[];
    modifiedFiles: string[];
    summary: {
      totalChecked: number;
      tampered: number;
      new: number;
      deleted: number;
      modified: number;
    };
  }> {
    const {
      reportNewFiles = true,
      reportDeletedFiles = true,
      reportModifiedFiles = true
    } = options;

    // Create current manifest
    const currentManifest = await this.createArtifactManifest(
      directory,
      baselineManifest.name,
      baselineManifest.version,
      `${baselineManifest.buildId}-current`,
      {
        algorithms: Array.from(new Set(baselineManifest.artifacts.map(a => a.hashAlgorithm)))
      }
    );

    const baselineFiles = new Set(baselineManifest.artifacts.map(a => a.path));
    const currentFiles = new Set(currentManifest.artifacts.map(a => a.path));
    const baselineHashes = new Map(baselineManifest.artifacts.map(a => [`${a.path}:${a.hashAlgorithm}`, a.hash]));
    const currentHashes = new Map(currentManifest.artifacts.map(a => [`${a.path}:${a.hashAlgorithm}`, a.hash]));

    const tamperedFiles: string[] = [];
    const newFiles: string[] = [];
    const deletedFiles: string[] = [];
    const modifiedFiles: string[] = [];

    // Find new files
    if (reportNewFiles) {
      for (const file of currentFiles) {
        if (!baselineFiles.has(file)) {
          newFiles.push(file);
        }
      }
    }

    // Find deleted files
    if (reportDeletedFiles) {
      for (const file of baselineFiles) {
        if (!currentFiles.has(file)) {
          deletedFiles.push(file);
        }
      }
    }

    // Find modified/tampered files
    if (reportModifiedFiles) {
      for (const file of baselineFiles) {
        if (currentFiles.has(file)) {
          // Check all hash algorithms for this file
          const fileAlgorithms = Array.from(new Set(baselineManifest.artifacts
            .filter(a => a.path === file)
            .map(a => a.hashAlgorithm)
          ));

          let isModified = false;
          for (const algorithm of fileAlgorithms) {
            const baselineKey = `${file}:${algorithm}`;
            const currentKey = `${file}:${algorithm}`;
            
            if (baselineHashes.has(baselineKey) && currentHashes.has(currentKey)) {
              if (baselineHashes.get(baselineKey) !== currentHashes.get(currentKey)) {
                isModified = true;
                break;
              }
            }
          }

          if (isModified) {
            modifiedFiles.push(file);
            tamperedFiles.push(file);
          }
        }
      }
    }

    return {
      tamperedFiles,
      newFiles,
      deletedFiles,
      modifiedFiles,
      summary: {
        totalChecked: baselineFiles.size,
        tampered: tamperedFiles.length,
        new: newFiles.length,
        deleted: deletedFiles.length,
        modified: modifiedFiles.length
      }
    };
  }

  /**
   * Continuous monitoring of file integrity
   */
  async startIntegrityMonitoring(
    directory: string,
    manifest: ArtifactManifest,
    intervalMs: number = 60000,
    callback: (results: VerificationResult[]) => void
  ): Promise<() => void> {
    let isRunning = true;

    const monitor = async () => {
      if (!isRunning) return;

      try {
        const results = await this.verifyArtifactIntegrity(directory, manifest);
        callback(results);
      } catch (error) {
        console.error('Integrity monitoring error:', error);
      }

      if (isRunning) {
        setTimeout(monitor, intervalMs);
      }
    };

    // Start monitoring
    setTimeout(monitor, intervalMs);

    // Return stop function
    return () => {
      isRunning = false;
    };
  }

  /**
   * Calculate integrity score for a set of verification results
   */
  calculateIntegrityScore(results: VerificationResult[]): {
    score: number;
    passed: number;
    failed: number;
    warnings: number;
    details: {
      filesChecked: number;
      integrityViolations: number;
      securityIssues: number;
    };
  } {
    const passed = results.filter(r => r.valid).length;
    const failed = results.filter(r => !r.valid).length;
    const warnings = results.reduce((sum, r) => sum + r.warnings.length, 0);
    
    const score = results.length > 0 ? (passed / results.length) * 100 : 0;
    
    const integrityViolations = results.filter(r => 
      r.errors.some(e => e.includes('Hash mismatch') || e.includes('size mismatch'))
    ).length;
    
    const securityIssues = results.filter(r => 
      r.errors.some(e => e.includes('Permission') || e.includes('access'))
    ).length;

    return {
      score,
      passed,
      failed,
      warnings,
      details: {
        filesChecked: results.length,
        integrityViolations,
        securityIssues
      }
    };
  }

  /**
   * Export manifest to file
   */
  async saveManifest(manifest: ArtifactManifest, filePath: string): Promise<void> {
    const manifestData = JSON.stringify(manifest, null, 2);
    await fs.writeFile(filePath, manifestData, 'utf8');
  }

  /**
   * Load manifest from file
   */
  async loadManifest(filePath: string): Promise<ArtifactManifest> {
    const manifestData = await fs.readFile(filePath, 'utf8');
    const manifest = JSON.parse(manifestData) as ArtifactManifest;
    this.manifestCache.set(manifest.buildId, manifest);
    return manifest;
  }

  /**
   * Generate checksum file in multiple formats
   */
  async generateChecksumFile(
    manifest: ArtifactManifest,
    outputPath: string,
    format: 'md5sum' | 'sha256sum' | 'sha512sum' | 'custom' = 'custom'
  ): Promise<void> {
    let content = '';

    switch (format) {
      case 'md5sum':
      case 'sha256sum':
      case 'sha512sum':
        // Standard Unix checksum format
        const algorithm = format.replace('sum', '').toUpperCase() as HashAlgorithm;
        const relevantArtifacts = manifest.artifacts.filter(a => 
          a.hashAlgorithm.toLowerCase().includes(algorithm.toLowerCase().replace('-', ''))
        );
        
        for (const artifact of relevantArtifacts) {
          content += `${artifact.hash}  ${artifact.path}\n`;
        }
        break;

      case 'custom':
        // Custom format with additional metadata
        content = `# Artifact Integrity Manifest\n`;
        content += `# Name: ${manifest.name}\n`;
        content += `# Version: ${manifest.version}\n`;
        content += `# Build ID: ${manifest.buildId}\n`;
        content += `# Created: ${manifest.createdAt.toISOString()}\n`;
        content += `# Environment: ${manifest.environment}\n`;
        content += `#\n`;
        content += `# Format: hash:algorithm  size  path  permissions\n`;
        
        for (const artifact of manifest.artifacts) {
          content += `${artifact.hash}:${artifact.hashAlgorithm}  ${artifact.size}  ${artifact.path}  ${artifact.permissions || 'unknown'}\n`;
        }
        break;
    }

    await fs.writeFile(outputPath, content, 'utf8');
  }

  // Private helper methods
  private normalizeHashAlgorithm(algorithm: HashAlgorithm): string {
    const mapping: Record<HashAlgorithm, string> = {
      'SHA-256': 'sha256',
      'SHA-384': 'sha384',
      'SHA-512': 'sha512',
      'BLAKE2b': 'blake2b512',
      'BLAKE2s': 'blake2s256'
    };
    
    return mapping[algorithm] || 'sha256';
  }

  private async collectFiles(
    directory: string,
    includePatterns: string[],
    excludePatterns: string[],
    followSymlinks: boolean
  ): Promise<string[]> {
    const files: string[] = [];
    
    const walkDir = async (dir: string, basePath: string = '') => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.join(basePath, entry.name);
        
        if (entry.isDirectory()) {
          if (!this.matchesPatterns(relativePath, excludePatterns)) {
            await walkDir(fullPath, relativePath);
          }
        } else if (entry.isFile() || (entry.isSymbolicLink() && followSymlinks)) {
          if (this.matchesPatterns(relativePath, includePatterns) &&
              !this.matchesPatterns(relativePath, excludePatterns)) {
            files.push(relativePath);
          }
        }
      }
    };
    
    await walkDir(directory);
    return files.sort();
  }

  private matchesPatterns(filePath: string, patterns: string[]): boolean {
    // Simple glob pattern matching (simplified implementation)
    for (const pattern of patterns) {
      if (pattern === '**/*') {
        return true;
      }
      
      // Convert glob pattern to regex
      const regexPattern = pattern
        .replace(/\*\*/g, '.*')
        .replace(/\*/g, '[^/]*')
        .replace(/\?/g, '[^/]');
      
      const regex = new RegExp(`^${regexPattern}$`);
      if (regex.test(filePath)) {
        return true;
      }
    }
    
    return false;
  }

  private groupArtifactsByPath(artifacts: ArtifactEntry[]): Map<string, ArtifactEntry[]> {
    const grouped = new Map<string, ArtifactEntry[]>();
    
    for (const artifact of artifacts) {
      if (!grouped.has(artifact.path)) {
        grouped.set(artifact.path, []);
      }
      grouped.get(artifact.path)!.push(artifact);
    }
    
    return grouped;
  }

  private async getMimeType(filePath: string): Promise<string> {
    // Simplified MIME type detection based on file extension
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.js': 'application/javascript',
      '.ts': 'application/typescript',
      '.json': 'application/json',
      '.html': 'text/html',
      '.css': 'text/css',
      '.md': 'text/markdown',
      '.txt': 'text/plain',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.zip': 'application/zip',
      '.tar': 'application/x-tar',
      '.gz': 'application/gzip'
    };
    
    return mimeTypes[ext] || 'application/octet-stream';
  }
}