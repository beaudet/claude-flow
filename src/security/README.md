# Enterprise Security System for Claude Flow

## Overview

This comprehensive enterprise-grade security system provides build artifact integrity verification and digital signing capabilities for the Claude Flow project. It addresses critical security gaps with production-ready code that follows security best practices and integrates with existing enterprise CI/CD pipelines.

## Features

### 🔐 Digital Signature System
- **Multi-Algorithm Support**: RSA (2048/3072/4096-bit) and ECDSA (P-256/P-384/P-521)
- **Key Management**: Complete lifecycle management with rotation and backup
- **Certificate Chain Validation**: X.509 certificate support with revocation checking
- **Timestamping**: RFC 3161 timestamping for non-repudiation

### 🛡️ Integrity Verification
- **Multiple Hash Algorithms**: SHA-256, SHA-384, SHA-512, BLAKE2b, BLAKE2s
- **File Integrity Monitoring**: Real-time tamper detection and alerts
- **Batch Processing**: Efficient verification of large artifact sets
- **Manifest Generation**: Comprehensive artifact manifests with metadata

### 🔑 Enterprise Key Management
- **Distributed Key Generation**: Secure multi-party key generation
- **Automated Rotation**: Policy-driven key rotation with transition periods
- **Backup & Recovery**: Multiple backup methods with Shamir's Secret Sharing
- **HSM Integration**: Hardware Security Module support preparation

### 🏗️ Build Pipeline Integration
- **NPM Integration**: Seamless integration with Node.js build processes
- **CI/CD Support**: GitHub Actions, GitLab CI, Jenkins, Azure DevOps
- **Automated Signing**: Policy-based artifact signing during builds
- **Verification Gates**: Build failure on integrity violations

### 📊 Compliance & Auditing
- **SOX Compliance**: Sarbanes-Oxley financial controls compliance
- **SOC2 Reporting**: Service Organization Control 2 audit reports
- **Audit Logging**: Comprehensive tamper-resistant audit trails
- **Retention Policies**: Configurable log retention for compliance

### 👥 Enterprise Features
- **Multi-Environment**: Development, staging, production configurations
- **Role-Based Access**: Admin, signer, verifier, auditor roles
- **Policy Engine**: Flexible security policy enforcement
- **Metrics & Monitoring**: Real-time security metrics and alerting

## Quick Start

### Installation

```bash
npm install claude-flow
```

### Initialize Security System

```bash
# Initialize with default development settings
npx claude-flow security init

# Initialize for production environment
npx claude-flow security init --environment production
```

### Generate Signing Keys

```bash
# Generate ECDSA key for development
npx claude-flow security key generate --algorithm ECDSA-P256 --purpose signing --owner developer

# Generate RSA key for production with auto-rotation
npx claude-flow security key generate --algorithm RSA-4096 --purpose signing --owner production --auto-rotate --backup
```

### Sign Build Artifacts

```bash
# Sign a single file
npx claude-flow security sign file ./dist/app.js --key signing-key-id

# Sign all build artifacts
npx claude-flow security sign artifacts --directory ./dist --key signing-key-id --manifest
```

### Verify Signatures

```bash
# Verify a single file
npx claude-flow security verify file ./dist/app.js --signature ./dist/app.js.sig

# Verify all artifacts against manifest
npx claude-flow security verify artifacts --directory ./dist --manifest ./dist/artifact-manifest.json
```

### Build Integration

```bash
# Integrate with NPM build scripts
npx claude-flow security build integrate --npm

# Generate CI/CD configuration
npx claude-flow security build integrate --ci github --output .github/workflows/secure-build.yml
```

## Architecture

### Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                Enterprise Security Manager                   │
├─────────────────────────────────────────────────────────────┤
│  User Auth & Permissions  │  Policy Engine  │  Metrics     │
└─────────────────────────────────────────────────────────────┘
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────────┐
│ Digital         │ │ Integrity       │ │ Key Management      │
│ Signature       │ │ Verification    │ │ System              │
│ Manager         │ │ Manager         │ │                     │
└─────────────────┘ └─────────────────┘ └─────────────────────┘
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────────┐
│ Build Pipeline  │ │ Security Audit  │ │ Compliance          │
│ Integrator      │ │ Logger          │ │ Reporter            │
└─────────────────┘ └─────────────────┘ └─────────────────────┘
```

### Security Flow

1. **Key Generation**: Generate cryptographic keys with metadata
2. **Artifact Creation**: Build process creates artifacts
3. **Manifest Generation**: Create integrity manifest with hashes
4. **Digital Signing**: Sign artifacts with managed keys
5. **Verification**: Verify signatures and integrity
6. **Audit Logging**: Log all security operations
7. **Compliance Reporting**: Generate regulatory reports

## Configuration

### Security Configuration

```json
{
  "environment": "production",
  "signatureAlgorithm": "RSA-4096",
  "hashAlgorithm": "SHA-512",
  "keySize": 4096,
  "certificateChainValidation": true,
  "timestampingEnabled": true,
  "auditLogging": true,
  "complianceMode": true,
  "hsm": {
    "enabled": false,
    "provider": "pkcs11",
    "tokenLabel": "production-token"
  }
}
```

### Build Integration Configuration

```json
{
  "preSignHooks": ["npm run test", "npm run lint"],
  "postSignHooks": ["npm run security-scan"],
  "verificationHooks": ["npm run integrity-check"],
  "signOnBuild": true,
  "signOnPublish": true,
  "requireVerification": true,
  "failOnVerificationError": true
}
```

### Signing Policy

```json
{
  "name": "Production Signing Policy",
  "enabled": true,
  "condition": "environment === 'production'",
  "keyId": "production-signing-key",
  "artifacts": ["**/*.js", "**/*.json", "**/*.wasm"],
  "excludePatterns": ["**/*.test.*", "**/*.spec.*"],
  "timestamping": true,
  "manifestGeneration": true
}
```

## API Reference

### EnterpriseSecurityManager

```typescript
import { EnterpriseSecurityManager } from 'claude-flow/security';

const securityManager = new EnterpriseSecurityManager(config);
await securityManager.initialize();

// User management
await securityManager.addUser('user-id', ['signer'], ['production']);
const auth = await securityManager.authenticateUser('user-id', credentials);

// Security operations
const metrics = await securityManager.getSecurityMetrics();
const report = await securityManager.generateSecurityReport(options);
```

### DigitalSignatureManager

```typescript
import { DigitalSignatureManager } from 'claude-flow/security';

const signatureManager = new DigitalSignatureManager(config);

// Key operations
const keyPair = await signatureManager.generateKeyPair('RSA-4096');
await signatureManager.importKeyPair(publicKey, privateKey, keyId, algorithm);

// Signing operations
const signature = await signatureManager.signData(data, keyId, options);
const isValid = await signatureManager.verifySignature(data, signature, publicKey);
```

### IntegrityVerificationManager

```typescript
import { IntegrityVerificationManager } from 'claude-flow/security';

const integrityManager = new IntegrityVerificationManager(config);

// Hash operations
const hash = await integrityManager.generateFileHash(filePath, 'SHA-256');
const hashes = await integrityManager.generateBatchHashes(filePaths);

// Manifest operations
const manifest = await integrityManager.createArtifactManifest(
  directory, name, version, buildId, options
);
const results = await integrityManager.verifyArtifactIntegrity(directory, manifest);
```

### KeyManagementSystem

```typescript
import { KeyManagementSystem } from 'claude-flow/security';

const keyManager = new KeyManagementSystem(config, keyStorePath);
await keyManager.initialize();

// Key lifecycle
const key = await keyManager.generateManagedKey(options);
const rotation = await keyManager.rotateKey(keyId, options);
const backup = await keyManager.createKeyBackup(keyId, options);
const recovered = await keyManager.recoverKeyFromBackup(backupId, credentials);
```

## Security Best Practices

### Key Management
- Use RSA-4096 or ECDSA-P384+ for production
- Enable automatic key rotation (annually for production)
- Create multiple backup copies with different encryption methods
- Store backups in separate secure locations
- Implement key escrow for critical business keys

### Build Integration
- Sign all production artifacts
- Verify signatures before deployment
- Use separate keys for different environments
- Implement staging verification gates
- Maintain signing ceremony documentation

### Compliance
- Enable audit logging in all environments
- Retain logs according to regulatory requirements (7 years for SOX)
- Implement log integrity protection
- Regular compliance report generation
- Document all security procedures and policies

### Operational Security
- Use hardware security modules (HSMs) for production keys
- Implement multi-person key ceremonies
- Regular security assessments and penetration testing
- Incident response procedures for key compromise
- Staff security training and awareness

## CI/CD Integration Examples

### GitHub Actions

```yaml
name: Secure Build and Deploy

on:
  push:
    branches: [main]

jobs:
  secure-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Initialize Security System
        run: npx claude-flow security init --environment production
        env:
          SIGNING_KEY_ID: ${{ secrets.SIGNING_KEY_ID }}
          SIGNING_PASSPHRASE: ${{ secrets.SIGNING_PASSPHRASE }}
          
      - name: Secure Build
        run: npm run build:secure
        
      - name: Generate Security Report
        run: npx claude-flow security compliance report --standard SOC2
        
      - name: Upload Signed Artifacts
        uses: actions/upload-artifact@v3
        with:
          name: signed-artifacts
          path: |
            dist/
            *.sig
            artifact-manifest.json
```

### Jenkins Pipeline

```groovy
pipeline {
    agent any
    
    environment {
        NODE_VERSION = '18'
        SIGNING_KEY_ID = credentials('signing-key-id')
        SIGNING_PASSPHRASE = credentials('signing-passphrase')
    }
    
    stages {
        stage('Setup') {
            steps {
                sh 'npm ci'
                sh 'npx claude-flow security init --environment production'
            }
        }
        
        stage('Secure Build') {
            steps {
                sh 'npm run build:secure'
            }
        }
        
        stage('Security Verification') {
            steps {
                sh 'npx claude-flow security verify artifacts --directory dist'
                sh 'npx claude-flow security compliance report --standard SOX'
            }
        }
        
        stage('Archive Artifacts') {
            steps {
                archiveArtifacts artifacts: 'dist/**, *.sig, artifact-manifest.json'
            }
        }
    }
}
```

## Troubleshooting

### Common Issues

#### Key Generation Failures
```bash
# Check key store permissions
ls -la ~/.claude-flow/security/keys/

# Verify configuration
npx claude-flow security status

# Generate with verbose logging
npx claude-flow security key generate --verbose
```

#### Signature Verification Failures
```bash
# Check signature file integrity
npx claude-flow security verify file ./app.js --signature ./app.js.sig --verbose

# Verify public key matches
npx claude-flow security key list

# Check file modifications
npx claude-flow security check --integrity
```

#### Build Integration Issues
```bash
# Check NPM script integration
cat package.json | grep security

# Verify build configuration
npx claude-flow security build status

# Test individual components
npx claude-flow security build integrate --npm --dry-run
```

### Error Codes

- `SEC001`: Invalid signature
- `SEC002`: Expired certificate
- `SEC003`: Revoked certificate
- `SEC004`: Invalid certificate chain
- `SEC005`: Weak algorithm
- `SEC006`: Tampered artifact
- `SEC007`: Missing timestamp
- `SEC008`: Invalid timestamp
- `SEC009`: Key not found
- `SEC010`: Insufficient permissions
- `SEC011`: Compliance violation
- `SEC012`: HSM error

## Support and Contributing

### Documentation
- [API Reference](./docs/api-reference.md)
- [Security Procedures](./docs/security-procedures.md)
- [Compliance Guide](./docs/compliance-guide.md)
- [Deployment Guide](./docs/deployment-guide.md)

### Getting Help
- GitHub Issues: Report bugs and feature requests
- Security Issues: security@claude-flow.com (GPG encrypted)
- Documentation: docs@claude-flow.com

### Contributing
1. Fork the repository
2. Create a feature branch
3. Add comprehensive tests
4. Update documentation
5. Submit a pull request

All security-related contributions require:
- Security impact assessment
- Threat model updates
- Penetration testing results
- Compliance verification

## License

MIT License - see [LICENSE](../../../LICENSE) file for details.

## Security Notice

This software handles cryptographic keys and sensitive security operations. Always:
- Keep software updated
- Follow security best practices
- Conduct regular security audits
- Report security vulnerabilities responsibly

For security vulnerabilities, please email security@claude-flow.com with GPG encryption using our public key.