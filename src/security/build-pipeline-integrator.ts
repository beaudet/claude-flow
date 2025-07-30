/**
 * Build Pipeline Integrator - NPM and CI/CD integration for automated signing
 * Provides hooks for build processes, automated artifact signing, and verification
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import type {
  BuildIntegrationConfig,
  ArtifactManifest,
  SecurityConfig,
  SignatureMetadata,
  VerificationResult
} from './types.js';
import { DigitalSignatureManager } from './digital-signature-manager.js';
import { IntegrityVerificationManager } from './integrity-verification-manager.js';

interface BuildContext {
  buildId: string;
  projectName: string;
  version: string;
  environment: string;
  buildDir: string;
  outputDir: string;
  artifacts: string[];
  metadata: Record<string, unknown>;
}

interface BuildHook {
  id: string;
  name: string;
  script: string;
  stage: 'pre-build' | 'post-build' | 'pre-sign' | 'post-sign' | 'pre-verify' | 'post-verify';
  condition?: string;
  timeout?: number;
  failOnError: boolean;
  environment?: string[];
}

interface SigningPolicy {
  id: string;
  name: string;
  enabled: boolean;
  condition: string;
  keyId: string;
  artifacts: string[];
  excludePatterns: string[];
  signatureAlgorithm?: string;
  hashAlgorithm?: string;
  timestamping: boolean;
  manifestGeneration: boolean;
}

export class BuildPipelineIntegrator extends EventEmitter {
  private config: SecurityConfig;
  private buildConfig: BuildIntegrationConfig;
  private signatureManager: DigitalSignatureManager;
  private integrityManager: IntegrityVerificationManager;
  private hooks: Map<string, BuildHook> = new Map();
  private signingPolicies: Map<string, SigningPolicy> = new Map();
  private buildContexts: Map<string, BuildContext> = new Map();

  constructor(
    config: SecurityConfig,
    buildConfig: BuildIntegrationConfig,
    signatureManager: DigitalSignatureManager,
    integrityManager: IntegrityVerificationManager
  ) {
    super();
    this.config = config;
    this.buildConfig = buildConfig;
    this.signatureManager = signatureManager;
    this.integrityManager = integrityManager;
  }

  /**
   * Initialize build pipeline integration
   */
  async initialize(): Promise<void> {
    // Load existing hooks and policies
    await this.loadBuildConfiguration();
    
    // Set up default hooks if none exist
    if (this.hooks.size === 0) {
      await this.createDefaultHooks();
    }

    // Set up default signing policies
    if (this.signingPolicies.size === 0) {
      await this.createDefaultSigningPolicies();
    }

    this.emit('initialized');
  }

  /**
   * Integrate with NPM build scripts
   */
  async integrateWithNPM(projectDir: string): Promise<void> {
    const packageJsonPath = path.join(projectDir, 'package.json');
    
    // Read existing package.json
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
    
    // Add security scripts
    packageJson.scripts = packageJson.scripts || {};
    
    // Backup original build script
    if (packageJson.scripts.build && !packageJson.scripts['build:original']) {
      packageJson.scripts['build:original'] = packageJson.scripts.build;
    }

    // Add security-enhanced build scripts
    packageJson.scripts['build:secure'] = 'claude-flow security build --sign --verify';
    packageJson.scripts['build:sign'] = 'claude-flow security sign-artifacts';
    packageJson.scripts['build:verify'] = 'claude-flow security verify-artifacts';
    packageJson.scripts['security:check'] = 'claude-flow security check';
    
    // Replace build script with secure version
    if (this.buildConfig.signOnBuild) {
      packageJson.scripts.build = 'npm run build:secure';
    }

    // Add prepack hook for signing on publish
    if (this.buildConfig.signOnPublish) {
      packageJson.scripts.prepack = packageJson.scripts.prepack 
        ? `${packageJson.scripts.prepack} && npm run build:sign`
        : 'npm run build:sign';
    }

    // Add postinstall verification
    if (this.buildConfig.requireVerification) {
      packageJson.scripts.postinstall = packageJson.scripts.postinstall
        ? `${packageJson.scripts.postinstall} && npm run build:verify`
        : 'npm run build:verify';
    }

    // Add security configuration section
    packageJson.security = {
      enabled: true,
      config: this.config,
      buildIntegration: this.buildConfig,
      lastUpdated: new Date().toISOString()
    };

    // Write updated package.json
    await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));

    this.emit('npm-integration-complete', { projectDir, packageJson });
  }

  /**
   * Execute build with security integration
   */
  async executeBuild(buildContext: BuildContext): Promise<{
    buildId: string;
    artifacts: ArtifactManifest;
    signatures: SignatureMetadata[];
    verificationResults: VerificationResult[];
    buildLog: string[];
  }> {
    const buildLog: string[] = [];
    this.buildContexts.set(buildContext.buildId, buildContext);

    try {
      buildLog.push(`Starting secure build: ${buildContext.buildId}`);
      
      // Execute pre-build hooks
      await this.executeHooks('pre-build', buildContext, buildLog);

      // Execute main build
      const buildResult = await this.runBuildCommand(buildContext, buildLog);
      if (!buildResult.success) {
        throw new Error(`Build failed: ${buildResult.error}`);
      }

      // Generate artifact manifest
      const artifacts = await this.integrityManager.createArtifactManifest(
        buildContext.outputDir,
        buildContext.projectName,
        buildContext.version,
        buildContext.buildId,
        {
          includePatterns: ['**/*'],
          excludePatterns: ['node_modules/**', '.git/**', '**/*.log', '**/*.tmp']
        }
      );

      // Execute post-build hooks
      await this.executeHooks('post-build', buildContext, buildLog);

      // Sign artifacts if configured
      let signatures: SignatureMetadata[] = [];
      if (this.buildConfig.signOnBuild) {
        signatures = await this.signArtifacts(buildContext, artifacts, buildLog);
      }

      // Verify artifacts if configured
      let verificationResults: VerificationResult[] = [];
      if (this.buildConfig.requireVerification) {
        verificationResults = await this.verifyArtifacts(buildContext, artifacts, buildLog);
        
        if (this.buildConfig.failOnVerificationError) {
          const failures = verificationResults.filter(r => !r.valid);
          if (failures.length > 0) {
            throw new Error(`Verification failed for ${failures.length} artifacts`);
          }
        }
      }

      buildLog.push(`Build completed successfully: ${buildContext.buildId}`);
      
      this.emit('build-completed', {
        buildId: buildContext.buildId,
        artifacts,
        signatures,
        verificationResults
      });

      return {
        buildId: buildContext.buildId,
        artifacts,
        signatures,
        verificationResults,
        buildLog
      };

    } catch (error) {
      buildLog.push(`Build failed: ${error instanceof Error ? error.message : String(error)}`);
      this.emit('build-failed', { buildId: buildContext.buildId, error, buildLog });
      throw error;
    } finally {
      this.buildContexts.delete(buildContext.buildId);
    }
  }

  /**
   * Sign artifacts according to signing policies
   */
  async signArtifacts(
    buildContext: BuildContext,
    manifest: ArtifactManifest,
    buildLog: string[]
  ): Promise<SignatureMetadata[]> {
    const signatures: SignatureMetadata[] = [];
    
    // Execute pre-sign hooks
    await this.executeHooks('pre-sign', buildContext, buildLog);

    // Apply signing policies
    for (const policy of this.signingPolicies.values()) {
      if (!policy.enabled) continue;
      
      // Check if policy applies to this build
      if (!this.evaluateCondition(policy.condition, buildContext)) {
        continue;
      }

      buildLog.push(`Applying signing policy: ${policy.name}`);

      // Filter artifacts based on policy
      const applicableArtifacts = this.filterArtifacts(manifest.artifacts, policy);
      
      for (const artifact of applicableArtifacts) {
        try {
          const artifactPath = path.join(buildContext.outputDir, artifact.path);
          const artifactData = await fs.readFile(artifactPath);

          // Sign the artifact
          const signature = await this.signatureManager.signData(
            artifactData,
            policy.keyId,
            {
              hashAlgorithm: policy.hashAlgorithm as any,
              includeTimestamp: policy.timestamping
            }
          );

          signatures.push(signature);
          buildLog.push(`Signed artifact: ${artifact.path}`);

          // Save signature file
          const signaturePath = `${artifactPath}.sig`;
          await fs.writeFile(signaturePath, JSON.stringify(signature, null, 2));

        } catch (error) {
          const errorMsg = `Failed to sign ${artifact.path}: ${error instanceof Error ? error.message : String(error)}`;
          buildLog.push(errorMsg);
          this.emit('signing-error', { artifact: artifact.path, error, buildContext });
          throw new Error(errorMsg);
        }
      }
    }

    // Update manifest with signatures
    manifest.signatures = signatures;

    if (this.shouldGenerateManifest()) {
      const manifestPath = path.join(buildContext.outputDir, 'artifact-manifest.json');
      await this.integrityManager.saveManifest(manifest, manifestPath);
      buildLog.push('Generated artifact manifest');
    }

    // Execute post-sign hooks
    await this.executeHooks('post-sign', buildContext, buildLog);

    return signatures;
  }

  /**
   * Verify artifacts integrity and signatures
   */
  async verifyArtifacts(
    buildContext: BuildContext,
    manifest: ArtifactManifest,
    buildLog: string[]
  ): Promise<VerificationResult[]> {
    // Execute pre-verify hooks
    await this.executeHooks('pre-verify', buildContext, buildLog);

    buildLog.push('Starting artifact verification');

    // Verify integrity
    const integrityResults = await this.integrityManager.verifyArtifactIntegrity(
      buildContext.outputDir,
      manifest
    );

    // Verify signatures
    const signatureResults: VerificationResult[] = [];
    for (const signature of manifest.signatures) {
      try {
        // Find corresponding artifact
        const artifact = manifest.artifacts.find(a => 
          signature.publicKeyFingerprint // This is simplified - in practice, match by content hash
        );
        
        if (artifact) {
          const artifactPath = path.join(buildContext.outputDir, artifact.path);
          const artifactData = await fs.readFile(artifactPath);
          
          const isValid = await this.signatureManager.verifySignature(
            artifactData,
            signature
          );

          signatureResults.push({
            valid: isValid,
            artifact: artifact.path,
            signature,
            errors: isValid ? [] : ['Signature verification failed'],
            warnings: [],
            timestamp: new Date(),
            verifiedBy: 'build-pipeline-integrator'
          });
        }
      } catch (error) {
        signatureResults.push({
          valid: false,
          artifact: 'unknown',
          signature,
          errors: [`Verification error: ${error instanceof Error ? error.message : String(error)}`],
          warnings: [],
          timestamp: new Date(),
          verifiedBy: 'build-pipeline-integrator'
        });
      }
    }

    const allResults = [...integrityResults, ...signatureResults];
    const failedCount = allResults.filter(r => !r.valid).length;
    
    buildLog.push(
      `Verification completed: ${allResults.length - failedCount}/${allResults.length} passed`
    );

    if (failedCount > 0) {
      buildLog.push(`WARNING: ${failedCount} verification failures detected`);
    }

    // Execute post-verify hooks
    await this.executeHooks('post-verify', buildContext, buildLog);

    return allResults;
  }

  /**
   * Add build hook
   */
  addBuildHook(hook: Omit<BuildHook, 'id'>): string {
    const hookId = `hook-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const fullHook: BuildHook = { id: hookId, ...hook };
    this.hooks.set(hookId, fullHook);
    this.emit('hook-added', fullHook);
    return hookId;
  }

  /**
   * Add signing policy
   */
  addSigningPolicy(policy: Omit<SigningPolicy, 'id'>): string {
    const policyId = `policy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const fullPolicy: SigningPolicy = { id: policyId, ...policy };
    this.signingPolicies.set(policyId, fullPolicy);
    this.emit('policy-added', fullPolicy);
    return policyId;
  }

  /**
   * Generate CI/CD configuration templates
   */
  generateCIConfig(platform: 'github' | 'gitlab' | 'jenkins' | 'azure'): string {
    switch (platform) {
      case 'github':
        return this.generateGitHubWorkflow();
      case 'gitlab':
        return this.generateGitLabCI();
      case 'jenkins':
        return this.generateJenkinsfile();
      case 'azure':
        return this.generateAzurePipeline();
      default:
        throw new Error(`Unsupported CI platform: ${platform}`);
    }
  }

  // Private helper methods
  private async loadBuildConfiguration(): Promise<void> {
    // Load hooks and policies from configuration files
    // This is a simplified implementation
  }

  private async createDefaultHooks(): Promise<void> {
    const defaultHooks: Omit<BuildHook, 'id'>[] = [
      {
        name: 'Pre-build Security Check',
        script: 'claude-flow security check --pre-build',
        stage: 'pre-build',
        failOnError: false,
        timeout: 30000
      },
      {
        name: 'Post-build Artifact Scan',
        script: 'claude-flow security scan-artifacts',
        stage: 'post-build',
        failOnError: true,
        timeout: 60000
      },
      {
        name: 'Pre-sign Validation',
        script: 'claude-flow security validate-signing-keys',
        stage: 'pre-sign',
        failOnError: true,
        timeout: 15000
      }
    ];

    for (const hook of defaultHooks) {
      this.addBuildHook(hook);
    }
  }

  private async createDefaultSigningPolicies(): Promise<void> {
    const defaultPolicies: Omit<SigningPolicy, 'id'>[] = [
      {
        name: 'Production Build Signing',
        enabled: true,
        condition: 'environment === "production"',
        keyId: 'production-signing-key',
        artifacts: ['**/*.js', '**/*.ts', '**/*.json'],
        excludePatterns: ['**/*.test.*', '**/*.spec.*'],
        timestamping: true,
        manifestGeneration: true
      },
      {
        name: 'Release Package Signing',
        enabled: true,
        condition: 'version.includes("-") === false', // Only release versions
        keyId: 'release-signing-key',
        artifacts: ['package.json', 'dist/**/*'],
        excludePatterns: [],
        timestamping: true,
        manifestGeneration: true
      }
    ];

    for (const policy of defaultPolicies) {
      this.addSigningPolicy(policy);
    }
  }

  private async executeHooks(
    stage: BuildHook['stage'],
    context: BuildContext,
    buildLog: string[]
  ): Promise<void> {
    const applicableHooks = Array.from(this.hooks.values())
      .filter(hook => hook.stage === stage)
      .filter(hook => !hook.environment || hook.environment.includes(context.environment));

    for (const hook of applicableHooks) {
      if (hook.condition && !this.evaluateCondition(hook.condition, context)) {
        continue;
      }

      buildLog.push(`Executing hook: ${hook.name}`);
      
      try {
        const result = await this.executeScript(hook.script, context, hook.timeout);
        if (!result.success && hook.failOnError) {
          throw new Error(`Hook failed: ${hook.name} - ${result.error}`);
        }
        buildLog.push(`Hook completed: ${hook.name}`);
      } catch (error) {
        const errorMsg = `Hook error: ${hook.name} - ${error instanceof Error ? error.message : String(error)}`;
        buildLog.push(errorMsg);
        
        if (hook.failOnError) {
          throw new Error(errorMsg);
        }
      }
    }
  }

  private async runBuildCommand(context: BuildContext, buildLog: string[]): Promise<{
    success: boolean;
    error?: string;
  }> {
    return new Promise((resolve) => {
      const buildCommand = 'npm run build:original';
      const child = spawn('npm', ['run', 'build:original'], {
        cwd: context.buildDir,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
        buildLog.push(`[BUILD] ${data.toString().trim()}`);
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
        buildLog.push(`[BUILD ERROR] ${data.toString().trim()}`);
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true });
        } else {
          resolve({ success: false, error: stderr || `Process exited with code ${code}` });
        }
      });

      child.on('error', (error) => {
        resolve({ success: false, error: error.message });
      });
    });
  }

  private async executeScript(
    script: string,
    context: BuildContext,
    timeout: number = 30000
  ): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      const child = spawn('sh', ['-c', script], {
        cwd: context.buildDir,
        env: {
          ...process.env,
          BUILD_ID: context.buildId,
          PROJECT_NAME: context.projectName,
          VERSION: context.version,
          ENVIRONMENT: context.environment,
          BUILD_DIR: context.buildDir,
          OUTPUT_DIR: context.outputDir
        },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let completed = false;
      const timer = setTimeout(() => {
        if (!completed) {
          child.kill();
          resolve({ success: false, error: 'Script execution timeout' });
        }
      }, timeout);

      child.on('close', (code) => {
        completed = true;
        clearTimeout(timer);
        resolve({ success: code === 0, error: code !== 0 ? `Script exited with code ${code}` : undefined });
      });

      child.on('error', (error) => {
        completed = true;
        clearTimeout(timer);
        resolve({ success: false, error: error.message });
      });
    });
  }

  private evaluateCondition(condition: string, context: BuildContext): boolean {
    try {
      // Simple condition evaluation (in production, use a proper expression evaluator)
      const evalContext = {
        environment: context.environment,
        version: context.version,
        projectName: context.projectName,
        buildId: context.buildId
      };

      // Replace variables in condition
      let evaluableCondition = condition;
      for (const [key, value] of Object.entries(evalContext)) {
        evaluableCondition = evaluableCondition.replace(
          new RegExp(`\\b${key}\\b`, 'g'),
          JSON.stringify(value)
        );
      }

      // Use Function constructor for safer evaluation than eval
      const func = new Function('return ' + evaluableCondition);
      return func();
    } catch {
      return false;
    }
  }

  private filterArtifacts(artifacts: any[], policy: SigningPolicy): any[] {
    return artifacts.filter(artifact => {
      // Check include patterns
      const included = policy.artifacts.some(pattern => 
        this.matchesGlob(artifact.path, pattern)
      );
      
      if (!included) return false;

      // Check exclude patterns
      const excluded = policy.excludePatterns.some(pattern =>
        this.matchesGlob(artifact.path, pattern)
      );

      return !excluded;
    });
  }

  private matchesGlob(filePath: string, pattern: string): boolean {
    // Simplified glob matching
    const regexPattern = pattern
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '[^/]');
    
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(filePath);
  }

  private shouldGenerateManifest(): boolean {
    return Array.from(this.signingPolicies.values())
      .some(policy => policy.enabled && policy.manifestGeneration);
  }

  private generateGitHubWorkflow(): string {
    return `name: Secure Build with Artifact Signing

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  secure-build:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Initialize Security System
      run: npx claude-flow security init
      env:
        SECURITY_KEY_ID: \${{ secrets.SIGNING_KEY_ID }}
        SECURITY_PASSPHRASE: \${{ secrets.SIGNING_PASSPHRASE }}
    
    - name: Secure Build
      run: npm run build:secure
      env:
        NODE_ENV: production
        BUILD_ID: \${{ github.run_id }}
        VERSION: \${{ github.sha }}
    
    - name: Upload Artifacts
      uses: actions/upload-artifact@v3
      with:
        name: signed-build-artifacts
        path: |
          dist/
          *.sig
          artifact-manifest.json
    
    - name: Security Report
      run: npx claude-flow security report
      if: always()`;
  }

  private generateGitLabCI(): string {
    return `stages:
  - build
  - sign
  - verify
  - deploy

variables:
  NODE_VERSION: "18"

secure_build:
  stage: build
  image: node:\${NODE_VERSION}
  before_script:
    - npm ci
    - npx claude-flow security init
  script:
    - npm run build:secure
  artifacts:
    paths:
      - dist/
      - "*.sig"
      - artifact-manifest.json
    expire_in: 1 week
  environment:
    name: production
  only:
    - main
    - tags`;
  }

  private generateJenkinsfile(): string {
    return `pipeline {
    agent any
    
    environment {
        NODE_VERSION = '18'
        BUILD_ID = "\${env.BUILD_ID}"
    }
    
    stages {
        stage('Setup') {
            steps {
                sh 'npm ci'
                sh 'npx claude-flow security init'
            }
        }
        
        stage('Secure Build') {
            steps {
                sh 'npm run build:secure'
            }
            post {
                success {
                    archiveArtifacts artifacts: 'dist/**, *.sig, artifact-manifest.json'
                }
            }
        }
        
        stage('Security Report') {
            steps {
                sh 'npx claude-flow security report'
            }
            post {
                always {
                    publishHTML([
                        allowMissing: false,
                        alwaysLinkToLastBuild: true,
                        keepAll: true,
                        reportDir: 'security-reports',
                        reportFiles: 'security-report.html',
                        reportName: 'Security Report'
                    ])
                }
            }
        }
    }
}`;
  }

  private generateAzurePipeline(): string {
    return `trigger:
- main
- develop

pool:
  vmImage: 'ubuntu-latest'

variables:
  nodeVersion: '18.x'

steps:
- task: NodeTool@0
  inputs:
    versionSpec: '\$(nodeVersion)'
  displayName: 'Install Node.js'

- script: |
    npm ci
    npx claude-flow security init
  displayName: 'Install dependencies and initialize security'

- script: npm run build:secure
  displayName: 'Secure build with signing'
  env:
    BUILD_ID: \$(Build.BuildId)
    VERSION: \$(Build.SourceVersion)

- task: PublishBuildArtifacts@1
  inputs:
    pathToPublish: 'dist'
    artifactName: 'signed-build-artifacts'
  displayName: 'Publish signed artifacts'

- script: npx claude-flow security report
  displayName: 'Generate security report'
  condition: always()`;
  }
}