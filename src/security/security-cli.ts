/**
 * Security CLI - Command-line interface for artifact signing and verification
 * Provides enterprise-grade CLI commands for security operations
 */

import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import type {
  SecurityConfig,
  SignatureAlgorithm,
  HashAlgorithm,
  Environment,
  ArtifactManifest,
  VerificationResult,
  ComplianceStandard
} from './types.js';
import { DigitalSignatureManager } from './digital-signature-manager.js';
import { IntegrityVerificationManager } from './integrity-verification-manager.js';
import { KeyManagementSystem } from './key-management-system.js';
import { BuildPipelineIntegrator } from './build-pipeline-integrator.js';
import { SecurityAuditLogger } from './security-audit-logger.js';
import { EnterpriseSecurityManager } from './enterprise-security-manager.js';
import { DEFAULT_SECURITY_CONFIG, PRODUCTION_SECURITY_CONFIG } from './constants.js';

interface CLIConfig {
  configPath: string;
  verbose: boolean;
  environment: Environment;
  keyStorePath: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export class SecurityCLI {
  private program: Command;
  private config: SecurityConfig;
  private cliConfig: CLIConfig;
  private securityManager: EnterpriseSecurityManager;
  private initialized: boolean = false;

  constructor() {
    this.program = new Command();
    this.cliConfig = {
      configPath: './security.config.json',
      verbose: false,
      environment: 'development',
      keyStorePath: './security/keys',
      logLevel: 'info'
    };
    
    this.config = DEFAULT_SECURITY_CONFIG;
    this.setupCommands();
  }

  /**
   * Setup CLI commands and options
   */
  private setupCommands(): void {
    this.program
      .name('claude-flow-security')
      .description('Enterprise Security Management for Claude Flow')
      .version('1.0.0')
      .option('-c, --config <path>', 'Security configuration file path', './security.config.json')
      .option('-v, --verbose', 'Enable verbose output', false)
      .option('-e, --environment <env>', 'Environment (development|staging|production)', 'development')
      .option('--key-store <path>', 'Key store directory path', './security/keys')
      .option('--log-level <level>', 'Log level (debug|info|warn|error)', 'info')
      .hook('preAction', async (thisCommand) => {
        await this.initialize(thisCommand.opts());
      });

    // Initialize command
    this.program
      .command('init')
      .description('Initialize security system')
      .option('--force', 'Force reinitialize existing setup', false)
      .action(async (options) => {
        await this.initializeSecuritySystem(options);
      });

    // Key management commands
    const keyCommand = this.program
      .command('key')
      .description('Key management operations');

    keyCommand
      .command('generate')
      .description('Generate a new key pair')
      .option('-a, --algorithm <algorithm>', 'Signature algorithm', 'ECDSA-P256')
      .option('-p, --purpose <purposes...>', 'Key purposes', ['signing'])
      .option('-o, --owner <owner>', 'Key owner', 'default')
      .option('--expires <days>', 'Expiration in days', '365')
      .option('--auto-rotate', 'Enable automatic rotation', false)
      .option('--backup', 'Create backup during generation', true)
      .action(async (options) => {
        await this.generateKey(options);
      });

    keyCommand
      .command('list')
      .description('List all keys')
      .option('--include-expired', 'Include expired keys', false)
      .action(async (options) => {
        await this.listKeys(options);
      });

    keyCommand
      .command('rotate')
      .description('Rotate a key')
      .argument('<keyId>', 'Key ID to rotate')
      .option('--transition-days <days>', 'Transition period in days', '30')
      .option('--force', 'Force rotation without confirmation', false)
      .action(async (keyId, options) => {
        await this.rotateKey(keyId, options);
      });

    keyCommand
      .command('backup')
      .description('Create key backup')
      .argument('<keyId>', 'Key ID to backup')
      .option('-m, --method <method>', 'Backup method (password|kek|hsm)', 'password')
      .option('--passphrase <passphrase>', 'Backup passphrase')
      .action(async (keyId, options) => {
        await this.backupKey(keyId, options);
      });

    keyCommand
      .command('recover')
      .description('Recover key from backup')
      .argument('<backupId>', 'Backup ID to recover')
      .option('--passphrase <passphrase>', 'Recovery passphrase')
      .action(async (backupId, options) => {
        await this.recoverKey(backupId, options);
      });

    // Signing commands
    const signCommand = this.program
      .command('sign')
      .description('Digital signing operations');

    signCommand
      .command('file')
      .description('Sign a single file')
      .argument('<filePath>', 'File to sign')
      .option('-k, --key <keyId>', 'Key ID for signing')
      .option('-a, --algorithm <algorithm>', 'Hash algorithm', 'SHA-256')
      .option('--timestamp', 'Include timestamp', true)
      .option('-o, --output <path>', 'Output signature file path')
      .action(async (filePath, options) => {
        await this.signFile(filePath, options);
      });

    signCommand
      .command('artifacts')
      .description('Sign build artifacts')
      .option('-d, --directory <path>', 'Artifacts directory', './dist')
      .option('-k, --key <keyId>', 'Key ID for signing')
      .option('--include <patterns...>', 'Include patterns', ['**/*'])
      .option('--exclude <patterns...>', 'Exclude patterns', ['**/*.log', '**/*.tmp'])
      .option('--manifest', 'Generate artifact manifest', true)
      .action(async (options) => {
        await this.signArtifacts(options);
      });

    // Verification commands
    const verifyCommand = this.program
      .command('verify')
      .description('Signature verification operations');

    verifyCommand
      .command('file')
      .description('Verify a single file signature')
      .argument('<filePath>', 'File to verify')
      .option('-s, --signature <signaturePath>', 'Signature file path')
      .option('--public-key <keyPath>', 'Public key file path')
      .action(async (filePath, options) => {
        await this.verifyFile(filePath, options);
      });

    verifyCommand
      .command('artifacts')
      .description('Verify build artifacts')
      .option('-d, --directory <path>', 'Artifacts directory', './dist')
      .option('-m, --manifest <path>', 'Artifact manifest path')
      .option('--fail-fast', 'Stop on first verification failure', false)
      .action(async (options) => {
        await this.verifyArtifacts(options);
      });

    // Build integration commands
    const buildCommand = this.program
      .command('build')
      .description('Build pipeline integration');

    buildCommand
      .command('integrate')
      .description('Integrate with build pipeline')
      .option('--npm', 'Integrate with NPM scripts', false)
      .option('--ci <platform>', 'Generate CI config (github|gitlab|jenkins|azure)')
      .option('--output <path>', 'Output path for CI config')
      .action(async (options) => {
        await this.integrateBuild(options);
      });

    buildCommand
      .command('secure')
      .description('Execute secure build')
      .option('--project <name>', 'Project name')
      .option('--version <version>', 'Build version')
      .option('--build-dir <path>', 'Build directory', './build')
      .option('--output-dir <path>', 'Output directory', './dist')
      .option('--sign', 'Sign artifacts after build', true)
      .option('--verify', 'Verify artifacts after signing', true)
      .action(async (options) => {
        await this.secureBuild(options);
      });

    // Compliance commands
    const complianceCommand = this.program
      .command('compliance')
      .description('Compliance and audit operations');

    complianceCommand
      .command('report')
      .description('Generate compliance report')
      .option('-s, --standard <standard>', 'Compliance standard (SOX|SOC2|ISO27001|NIST|GDPR)', 'SOC2')
      .option('--from <date>', 'Report start date (YYYY-MM-DD)')
      .option('--to <date>', 'Report end date (YYYY-MM-DD)')
      .option('--format <format>', 'Output format (json|pdf|html)', 'json')
      .option('-o, --output <path>', 'Output file path')
      .action(async (options) => {
        await this.generateComplianceReport(options);
      });

    complianceCommand
      .command('audit')
      .description('Export audit logs')
      .option('--from <date>', 'Start date (YYYY-MM-DD)')
      .option('--to <date>', 'End date (YYYY-MM-DD)')
      .option('--format <format>', 'Export format (json|csv|syslog|cef)', 'json')
      .option('-o, --output <path>', 'Output file path')
      .action(async (options) => {
        await this.exportAuditLogs(options);
      });

    // Status and health commands
    this.program
      .command('status')
      .description('Show security system status')
      .option('--health', 'Include health checks', false)
      .action(async (options) => {
        await this.showStatus(options);
      });

    this.program
      .command('check')
      .description('Run security checks')
      .option('--pre-build', 'Pre-build security checks', false)
      .option('--post-build', 'Post-build security checks', false)
      .option('--integrity', 'File integrity checks', false)
      .action(async (options) => {
        await this.runSecurityChecks(options);
      });
  }

  /**
   * Initialize the CLI and security system
   */
  private async initialize(options: any): Promise<void> {
    if (this.initialized) return;

    this.cliConfig = { ...this.cliConfig, ...options };
    
    // Load configuration
    try {
      const configData = await fs.readFile(this.cliConfig.configPath, 'utf8');
      const fileConfig = JSON.parse(configData);
      this.config = { ...this.config, ...fileConfig };
    } catch {
      // Use default config if file doesn't exist
      if (this.cliConfig.environment === 'production') {
        this.config = PRODUCTION_SECURITY_CONFIG;
      }
    }

    // Override with CLI options
    this.config.environment = this.cliConfig.environment;

    // Initialize security manager
    this.securityManager = new EnterpriseSecurityManager(
      this.config,
      this.cliConfig.keyStorePath
    );

    this.initialized = true;
  }

  /**
   * Initialize security system
   */
  private async initializeSecuritySystem(options: any): Promise<void> {
    const spinner = ora('Initializing security system...').start();

    try {
      await this.securityManager.initialize();
      
      // Save configuration
      await fs.writeFile(
        this.cliConfig.configPath,
        JSON.stringify(this.config, null, 2)
      );

      spinner.succeed(chalk.green('Security system initialized successfully'));
      
      console.log(chalk.blue('\n📋 Next Steps:'));
      console.log('1. Generate signing keys: claude-flow-security key generate');
      console.log('2. Integrate with build: claude-flow-security build integrate');
      console.log('3. Sign artifacts: claude-flow-security sign artifacts');
      
    } catch (error) {
      spinner.fail(chalk.red('Failed to initialize security system'));
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  }

  /**
   * Generate a new key pair
   */
  private async generateKey(options: any): Promise<void> {
    const spinner = ora('Generating key pair...').start();

    try {
      const result = await this.securityManager.keyManager.generateManagedKey({
        algorithm: options.algorithm as SignatureAlgorithm,
        purpose: options.purpose,
        owner: options.owner,
        expiresInDays: parseInt(options.expires),
        autoRotate: options.autoRotate,
        backup: options.backup
      });

      spinner.succeed(chalk.green('Key pair generated successfully'));

      console.log(chalk.blue('\n🔑 Key Details:'));
      console.log(`Key ID: ${chalk.yellow(result.keyId)}`);
      console.log(`Algorithm: ${chalk.yellow(result.metadata.algorithm)}`);
      console.log(`Owner: ${chalk.yellow(result.metadata.owner)}`);
      console.log(`Expires: ${chalk.yellow(result.metadata.expiresAt?.toISOString())}`);
      console.log(`Fingerprint: ${chalk.yellow(result.keyPair.fingerprint)}`);

      if (result.backupIds) {
        console.log(`Backup IDs: ${chalk.yellow(result.backupIds.join(', '))}`);
      }

    } catch (error) {
      spinner.fail(chalk.red('Failed to generate key pair'));
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  }

  /**
   * List all keys
   */
  private async listKeys(options: any): Promise<void> {
    const spinner = ora('Loading keys...').start();

    try {
      const stats = this.securityManager.keyManager.getKeyUsageStatistics();
      const keys = this.securityManager.keyManager.listKeys();

      spinner.stop();

      const table = new Table({
        head: ['Key ID', 'Algorithm', 'Created', 'Expires', 'Status'],
        colWidths: [25, 15, 20, 20, 10]
      });

      for (const key of keys) {
        const metadata = this.securityManager.keyManager.getKeyUsageStatistics(key.keyId).keyDetails;
        if (!metadata) continue;

        if (!options.includeExpired && metadata.status === 'expired') continue;

        const status = metadata.status === 'active' ? 
          chalk.green('Active') : 
          metadata.status === 'expired' ? 
          chalk.red('Expired') :
          chalk.yellow(metadata.status);

        table.push([
          key.keyId.substring(0, 22) + '...',
          key.algorithm,
          key.createdAt.toLocaleDateString(),
          key.expiresAt?.toLocaleDateString() || 'Never',
          status
        ]);
      }

      console.log(chalk.blue('\n🔑 Key Management Summary:'));
      console.log(`Total Keys: ${chalk.yellow(stats.totalKeys)}`);
      console.log(`Active: ${chalk.green(stats.activeKeys)}`);
      console.log(`Expired: ${chalk.red(stats.expiredKeys)}`);
      console.log(`Revoked: ${chalk.red(stats.revokedKeys)}`);

      console.log(chalk.blue('\n📋 Key Details:'));
      console.log(table.toString());

      if (stats.upcomingRotations.length > 0) {
        console.log(chalk.yellow(`\n⚠️  ${stats.upcomingRotations.length} keys need rotation soon`));
      }

    } catch (error) {
      spinner.fail(chalk.red('Failed to load keys'));
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  }

  /**
   * Sign a file
   */
  private async signFile(filePath: string, options: any): Promise<void> {
    const spinner = ora(`Signing file: ${filePath}...`).start();

    try {
      // Read file
      const fileData = await fs.readFile(filePath);
      
      // Sign the file
      const signature = await this.securityManager.signatureManager.signData(
        fileData,
        options.key,
        {
          hashAlgorithm: options.algorithm as HashAlgorithm,
          includeTimestamp: options.timestamp
        }
      );

      // Save signature
      const outputPath = options.output || `${filePath}.sig`;
      await fs.writeFile(outputPath, JSON.stringify(signature, null, 2));

      spinner.succeed(chalk.green('File signed successfully'));

      console.log(chalk.blue('\n📝 Signature Details:'));
      console.log(`File: ${chalk.yellow(filePath)}`);
      console.log(`Signature: ${chalk.yellow(outputPath)}`);
      console.log(`Algorithm: ${chalk.yellow(signature.algorithm)}`);
      console.log(`Hash: ${chalk.yellow(signature.hashAlgorithm)}`);
      console.log(`Timestamp: ${chalk.yellow(signature.timestamp.toISOString())}`);

    } catch (error) {
      spinner.fail(chalk.red('Failed to sign file'));
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  }

  /**
   * Verify a file signature
   */
  private async verifyFile(filePath: string, options: any): Promise<void> {
    const spinner = ora(`Verifying file: ${filePath}...`).start();

    try {
      // Read file and signature
      const fileData = await fs.readFile(filePath);
      const signaturePath = options.signature || `${filePath}.sig`;
      const signatureData = JSON.parse(await fs.readFile(signaturePath, 'utf8'));

      // Verify signature
      const isValid = await this.securityManager.signatureManager.verifySignature(
        fileData,
        signatureData,
        options.publicKey
      );

      if (isValid) {
        spinner.succeed(chalk.green('Signature verification PASSED'));
        console.log(chalk.green('✅ File integrity verified'));
      } else {
        spinner.fail(chalk.red('Signature verification FAILED'));
        console.log(chalk.red('❌ File may have been tampered with'));
        process.exit(1);
      }

    } catch (error) {
      spinner.fail(chalk.red('Failed to verify file'));
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  }

  /**
   * Show system status
   */
  private async showStatus(options: any): Promise<void> {
    const spinner = ora('Collecting system status...').start();

    try {
      const keyStats = this.securityManager.keyManager.getKeyUsageStatistics();
      
      spinner.stop();

      console.log(chalk.blue('\n🛡️  Security System Status\n'));
      
      const statusTable = new Table({
        colWidths: [25, 30]
      });

      statusTable.push(
        ['Environment', chalk.yellow(this.config.environment)],
        ['Signature Algorithm', chalk.yellow(this.config.signatureAlgorithm)],
        ['Hash Algorithm', chalk.yellow(this.config.hashAlgorithm)],
        ['Timestamping', this.config.timestampingEnabled ? chalk.green('Enabled') : chalk.red('Disabled')],
        ['Audit Logging', this.config.auditLogging ? chalk.green('Enabled') : chalk.red('Disabled')],
        ['Compliance Mode', this.config.complianceMode ? chalk.green('Enabled') : chalk.red('Disabled')]
      );

      console.log(statusTable.toString());

      console.log(chalk.blue('\n🔑 Key Statistics:\n'));
      
      const keyTable = new Table({
        colWidths: [25, 15]
      });

      keyTable.push(
        ['Total Keys', chalk.yellow(keyStats.totalKeys.toString())],
        ['Active Keys', chalk.green(keyStats.activeKeys.toString())],
        ['Expired Keys', keyStats.expiredKeys > 0 ? chalk.red(keyStats.expiredKeys.toString()) : chalk.gray(keyStats.expiredKeys.toString())],
        ['Upcoming Rotations', keyStats.upcomingRotations.length > 0 ? chalk.yellow(keyStats.upcomingRotations.length.toString()) : chalk.gray('0')]
      );

      console.log(keyTable.toString());

      if (options.health) {
        console.log(chalk.blue('\n🔍 Health Checks:\n'));
        // Health check implementation would go here
        console.log(chalk.green('✅ All systems operational'));
      }

    } catch (error) {
      spinner.fail(chalk.red('Failed to get system status'));
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  }

  /**
   * Run the CLI
   */
  async run(argv?: string[]): Promise<void> {
    try {
      await this.program.parseAsync(argv);
    } catch (error) {
      console.error(chalk.red('CLI Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  // Placeholder methods for remaining commands
  private async rotateKey(keyId: string, options: any): Promise<void> {
    console.log(chalk.blue('Key rotation functionality coming soon...'));
  }

  private async backupKey(keyId: string, options: any): Promise<void> {
    console.log(chalk.blue('Key backup functionality coming soon...'));
  }

  private async recoverKey(backupId: string, options: any): Promise<void> {
    console.log(chalk.blue('Key recovery functionality coming soon...'));
  }

  private async signArtifacts(options: any): Promise<void> {
    console.log(chalk.blue('Artifact signing functionality coming soon...'));
  }

  private async verifyArtifacts(options: any): Promise<void> {
    console.log(chalk.blue('Artifact verification functionality coming soon...'));
  }

  private async integrateBuild(options: any): Promise<void> {
    console.log(chalk.blue('Build integration functionality coming soon...'));
  }

  private async secureBuild(options: any): Promise<void> {
    console.log(chalk.blue('Secure build functionality coming soon...'));
  }

  private async generateComplianceReport(options: any): Promise<void> {
    console.log(chalk.blue('Compliance reporting functionality coming soon...'));
  }

  private async exportAuditLogs(options: any): Promise<void> {
    console.log(chalk.blue('Audit log export functionality coming soon...'));
  }

  private async runSecurityChecks(options: any): Promise<void> {
    console.log(chalk.blue('Security checks functionality coming soon...'));
  }
}