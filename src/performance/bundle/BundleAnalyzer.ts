/**
 * Bundle Size Analysis and Monitoring System
 * Comprehensive bundle analysis, size tracking, and optimization recommendations
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { execSync } from 'child_process';
import { EventEmitter } from 'events';
import { createHash } from 'crypto';
import { gzipSync } from 'zlib';
import {
  BundleSizeMetrics,
  ModuleSizeInfo,
  DependencySizeInfo,
  AssetSizeInfo,
  DuplicateModuleInfo,
  UnusedCodeInfo,
  BundleAnalysisOptions,
  PerformanceAlert,
  PerformanceConfig
} from '../types.js';

export interface BundleAnalysisResult {
  timestamp: number;
  totalSize: number;
  gzippedSize: number;
  metrics: BundleSizeMetrics;
  changes: BundleChange[];
  recommendations: BundleRecommendation[];
  alerts: PerformanceAlert[];
}

export interface BundleChange {
  type: 'added' | 'removed' | 'modified' | 'renamed';
  file: string;
  sizeBefore?: number;
  sizeAfter?: number;
  impact: 'low' | 'medium' | 'high' | 'critical';
}

export interface BundleRecommendation {
  type: 'treeshaking' | 'code_splitting' | 'compression' | 'dependencies' | 'assets';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  potentialSavings: number;
  effort: 'low' | 'medium' | 'high';
  implementation: string[];
}

export interface BundleConfiguration {
  entryPoints: string[];
  outputDir: string;
  includePatterns: string[];
  excludePatterns: string[];
  dependencyAnalysis: boolean;
  assetAnalysis: boolean;
  treeshakingAnalysis: boolean;
  compressionAnalysis: boolean;
  historicalComparison: boolean;
  thresholds: {
    totalSize: number;
    gzippedSize: number;
    chunkSize: number;
    duplicateThreshold: number;
    unusedCodeThreshold: number;
  };
}

export class BundleAnalyzer extends EventEmitter {
  private config: BundleConfiguration;
  private history: BundleAnalysisResult[] = [];
  private performanceConfig: PerformanceConfig;
  private packageJsonCache: Map<string, any> = new Map();

  constructor(
    config: Partial<BundleConfiguration> = {},
    performanceConfig?: PerformanceConfig
  ) {
    super();
    
    this.config = {
      entryPoints: ['src/index.ts', 'src/cli/main.ts'],
      outputDir: 'dist',
      includePatterns: ['**/*.js', '**/*.ts', '**/*.json'],
      excludePatterns: ['**/node_modules/**', '**/test/**', '**/*.test.*', '**/*.spec.*'],
      dependencyAnalysis: true,
      assetAnalysis: true,
      treeshakingAnalysis: true,
      compressionAnalysis: true,
      historicalComparison: true,
      thresholds: {
        totalSize: 10 * 1024 * 1024, // 10MB
        gzippedSize: 3 * 1024 * 1024, // 3MB
        chunkSize: 500 * 1024, // 500KB
        duplicateThreshold: 2,
        unusedCodeThreshold: 0.1 // 10%
      },
      ...config
    };

    this.performanceConfig = performanceConfig || {} as PerformanceConfig;
  }

  /**
   * Analyze bundle size and composition
   */
  async analyzeBundles(options: BundleAnalysisOptions = {}): Promise<BundleAnalysisResult> {
    this.emit('analysisStarted');
    const startTime = Date.now();

    try {
      // Collect all files and their sizes
      const modules = await this.collectModules();
      const dependencies = await this.analyzeDependencies();
      const assets = await this.analyzeAssets();
      
      // Analyze bundle composition
      const duplicateModules = await this.findDuplicateModules(modules);
      const unusedCode = await this.findUnusedCode(modules);
      const treeshakingEfficiency = await this.calculateTreeshakingEfficiency(modules, dependencies);

      // Calculate total sizes
      const totalSize = modules.reduce((sum, m) => sum + m.size, 0);
      const gzippedSize = await this.calculateGzippedSize(modules);

      // Create metrics object
      const metrics: BundleSizeMetrics = {
        totalSize,
        gzippedSize,
        modules,
        dependencies,
        assets,
        treeshakingEfficiency,
        duplicateModules,
        unusedCode
      };

      // Compare with previous analysis
      const changes = this.history.length > 0 
        ? this.compareWithPrevious(metrics)
        : [];

      // Generate recommendations
      const recommendations = this.generateRecommendations(metrics, changes);

      // Generate alerts if thresholds exceeded
      const alerts = this.generateAlerts(metrics, changes);

      const result: BundleAnalysisResult = {
        timestamp: startTime,
        totalSize,
        gzippedSize,
        metrics,
        changes,
        recommendations,
        alerts
      };

      // Store in history
      this.history.push(result);
      if (this.history.length > 100) {
        this.history = this.history.slice(-50); // Keep last 50 analyses
      }

      this.emit('analysisCompleted', {
        duration: Date.now() - startTime,
        totalSize,
        gzippedSize,
        changeCount: changes.length
      });

      return result;

    } catch (error) {
      this.emit('analysisError', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Monitor bundle size continuously
   */
  async startMonitoring(intervalMs: number = 300000): Promise<void> { // 5 minutes default
    this.emit('monitoringStarted', { interval: intervalMs });

    const monitor = async () => {
      try {
        const result = await this.analyzeBundles();
        
        // Check for alerts
        if (result.alerts.length > 0) {
          this.emit('alertsGenerated', { alerts: result.alerts });
        }

        // Schedule next analysis
        setTimeout(monitor, intervalMs);
      } catch (error) {
        console.error('Bundle monitoring error:', error);
        setTimeout(monitor, intervalMs * 2); // Back off on error
      }
    };

    // Start monitoring
    setTimeout(monitor, 1000); // Start after 1 second
  }

  /**
   * Compare current bundle with a specific version
   */
  async compareWithVersion(version: string, gitRef?: string): Promise<BundleChange[]> {
    let tempDir: string | null = null;
    
    try {
      // If git ref provided, checkout that version
      if (gitRef) {
        tempDir = await this.createTempCheckout(gitRef);
      }

      // Analyze the comparison version
      const originalConfig = { ...this.config };
      if (tempDir) {
        this.config.entryPoints = this.config.entryPoints.map(ep => 
          path.join(tempDir!, path.relative(process.cwd(), ep))
        );
      }

      const comparisonResult = await this.analyzeBundles();
      this.config = originalConfig; // Restore config

      // Analyze current version
      const currentResult = await this.analyzeBundles();

      // Compare results
      return this.compareResults(comparisonResult.metrics, currentResult.metrics);

    } finally {
      // Clean up temp directory
      if (tempDir) {
        await fs.rmdir(tempDir, { recursive: true }).catch(() => {});
      }
    }
  }

  /**
   * Generate bundle size report
   */
  async generateReport(format: 'json' | 'html' | 'markdown' = 'json'): Promise<string> {
    const latestResult = this.history[this.history.length - 1];
    if (!latestResult) {
      throw new Error('No bundle analysis results available');
    }

    switch (format) {
      case 'html':
        return this.generateHTMLReport(latestResult);
      case 'markdown':
        return this.generateMarkdownReport(latestResult);
      default:
        return JSON.stringify(latestResult, null, 2);
    }
  }

  private async collectModules(): Promise<ModuleSizeInfo[]> {
    const modules: ModuleSizeInfo[] = [];
    
    for (const entryPoint of this.config.entryPoints) {
      try {
        const entryModule = await this.analyzeModule(entryPoint, 'entry');
        modules.push(entryModule);
        
        // Recursively analyze dependencies
        const dependencies = await this.findModuleDependencies(entryPoint);
        for (const dep of dependencies) {
          const depModule = await this.analyzeModule(dep, 'dependency');
          modules.push(depModule);
        }
      } catch (error) {
        console.warn(`Failed to analyze module ${entryPoint}:`, error);
      }
    }

    return modules;
  }

  private async analyzeModule(filePath: string, type: ModuleSizeInfo['type']): Promise<ModuleSizeInfo> {
    try {
      const stats = await fs.stat(filePath);
      const content = await fs.readFile(filePath, 'utf-8');
      const gzippedContent = gzipSync(Buffer.from(content));
      
      // Analyze imports and exports
      const imports = this.extractImports(content);
      const exports = this.extractExports(content);

      return {
        name: path.basename(filePath),
        size: stats.size,
        gzippedSize: gzippedContent.length,
        path: filePath,
        type,
        imports,
        exports
      };
    } catch (error) {
      throw new Error(`Failed to analyze module ${filePath}: ${error}`);
    }
  }

  private async findModuleDependencies(filePath: string): Promise<string[]> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const imports = this.extractImports(content);
      const dependencies: string[] = [];

      for (const importPath of imports) {
        if (importPath.startsWith('.') || importPath.startsWith('/')) {
          // Resolve relative imports
          try {
            const resolvedPath = path.resolve(path.dirname(filePath), importPath);
            const extensions = ['.ts', '.js', '.tsx', '.jsx', '.json'];
            
            for (const ext of extensions) {
              const fullPath = resolvedPath + ext;
              try {
                await fs.access(fullPath);
                dependencies.push(fullPath);
                break;
              } catch {
                // Try next extension
              }
            }
          } catch {
            // Ignore resolution failures
          }
        }
      }

      return dependencies;
    } catch (error) {
      return [];
    }
  }

  private extractImports(content: string): string[] {
    const imports: string[] = [];
    
    // Match ES6 imports
    const es6ImportRegex = /import\s+(?:{[^}]*}|\*\s+as\s+\w+|\w+)?\s*from\s+['"`]([^'"`]+)['"`]/g;
    let match;
    while ((match = es6ImportRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }

    // Match CommonJS requires
    const cjsRequireRegex = /require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
    while ((match = cjsRequireRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }

    return imports;
  }

  private extractExports(content: string): string[] {
    const exports: string[] = [];
    
    // Match named exports
    const namedExportRegex = /export\s+(?:const|let|var|function|class|interface|type|enum)\s+(\w+)/g;
    let match;
    while ((match = namedExportRegex.exec(content)) !== null) {
      exports.push(match[1]);
    }

    // Match export declarations
    const exportDeclRegex = /export\s*{\s*([^}]+)\s*}/g;
    while ((match = exportDeclRegex.exec(content)) !== null) {
      const exportNames = match[1].split(',').map(name => name.trim().split(' as ')[0]);
      exports.push(...exportNames);
    }

    return exports;
  }

  private async analyzeDependencies(): Promise<DependencySizeInfo[]> {
    if (!this.config.dependencyAnalysis) {
      return [];
    }

    const dependencies: DependencySizeInfo[] = [];
    
    try {
      // Read package.json
      const packageJsonPath = path.join(process.cwd(), 'package.json');
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
      
      // Analyze production dependencies
      for (const [name, version] of Object.entries(packageJson.dependencies || {})) {
        const depInfo = await this.analyzeDependency(name, version as string, 'production');
        if (depInfo) dependencies.push(depInfo);
      }

      // Analyze dev dependencies
      for (const [name, version] of Object.entries(packageJson.devDependencies || {})) {
        const depInfo = await this.analyzeDependency(name, version as string, 'development');
        if (depInfo) dependencies.push(depInfo);
      }

    } catch (error) {
      console.warn('Failed to analyze dependencies:', error);
    }

    return dependencies;
  }

  private async analyzeDependency(
    name: string, 
    version: string, 
    type: DependencySizeInfo['type']
  ): Promise<DependencySizeInfo | null> {
    try {
      const nodeModulesPath = path.join(process.cwd(), 'node_modules', name);
      const packageJsonPath = path.join(nodeModulesPath, 'package.json');
      
      // Get package info
      let packageInfo;
      if (this.packageJsonCache.has(name)) {
        packageInfo = this.packageJsonCache.get(name);
      } else {
        packageInfo = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
        this.packageJsonCache.set(name, packageInfo);
      }

      // Calculate package size
      const size = await this.calculateDirectorySize(nodeModulesPath);
      const gzippedSize = Math.floor(size * 0.3); // Rough estimate

      return {
        name,
        version,
        size,
        gzippedSize,
        type,
        treeshakable: !packageInfo.sideEffects,
        sideEffects: Boolean(packageInfo.sideEffects)
      };
    } catch (error) {
      return null;
    }
  }

  private async calculateDirectorySize(dirPath: string): Promise<number> {
    let totalSize = 0;
    
    try {
      const items = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const item of items) {
        const itemPath = path.join(dirPath, item.name);
        
        if (item.isDirectory()) {
          totalSize += await this.calculateDirectorySize(itemPath);
        } else {
          const stats = await fs.stat(itemPath);
          totalSize += stats.size;
        }
      }
    } catch (error) {
      // Directory might not exist or be accessible
    }

    return totalSize;
  }

  private async analyzeAssets(): Promise<AssetSizeInfo[]> {
    if (!this.config.assetAnalysis) {
      return [];
    }

    const assets: AssetSizeInfo[] = [];
    const assetExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.woff', '.woff2', '.ttf', '.eot'];
    
    // Find asset files
    const findAssets = async (dir: string): Promise<void> => {
      try {
        const items = await fs.readdir(dir, { withFileTypes: true });
        
        for (const item of items) {
          const itemPath = path.join(dir, item.name);
          
          if (item.isDirectory() && !this.isExcluded(itemPath)) {
            await findAssets(itemPath);
          } else if (item.isFile()) {
            const ext = path.extname(item.name).toLowerCase();
            if (assetExtensions.includes(ext)) {
              const stats = await fs.stat(itemPath);
              const type = this.getAssetType(ext);
              
              assets.push({
                name: item.name,
                size: stats.size,
                type,
              });
            }
          }
        }
      } catch (error) {
        // Directory might not exist
      }
    };

    await findAssets(process.cwd());
    return assets;
  }

  private getAssetType(extension: string): AssetSizeInfo['type'] {
    const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.svg'];
    const fontExts = ['.woff', '.woff2', '.ttf', '.eot'];
    
    if (imageExts.includes(extension)) return 'image';
    if (fontExts.includes(extension)) return 'font';
    if (extension === '.css') return 'stylesheet';
    if (extension === '.js') return 'javascript';
    return 'other';
  }

  private isExcluded(filePath: string): boolean {
    const relativePath = path.relative(process.cwd(), filePath);
    return this.config.excludePatterns.some(pattern => 
      relativePath.includes(pattern.replace('**/', '').replace('/**', ''))
    );
  }

  private async findDuplicateModules(modules: ModuleSizeInfo[]): Promise<DuplicateModuleInfo[]> {
    const duplicates: DuplicateModuleInfo[] = [];
    const modulesByName = new Map<string, ModuleSizeInfo[]>();
    
    // Group modules by name
    for (const module of modules) {
      const name = module.name;
      if (!modulesByName.has(name)) {
        modulesByName.set(name, []);
      }
      modulesByName.get(name)!.push(module);
    }

    // Find duplicates
    for (const [name, moduleList] of modulesByName) {
      if (moduleList.length >= this.config.thresholds.duplicateThreshold) {
        const totalSize = moduleList.reduce((sum, m) => sum + m.size, 0);
        duplicates.push({
          module: name,
          occurrences: moduleList.length,
          totalSize,
          paths: moduleList.map(m => m.path)
        });
      }
    }

    return duplicates;
  }

  private async findUnusedCode(modules: ModuleSizeInfo[]): Promise<UnusedCodeInfo[]> {
    // This is a simplified implementation
    // In a real scenario, you'd use tools like webpack-bundle-analyzer or similar
    const unusedCode: UnusedCodeInfo[] = [];
    
    // For each module, check if its exports are used by other modules
    for (const module of modules) {
      const unusedExports = [];
      
      for (const exportName of module.exports) {
        const isUsed = modules.some(otherModule => 
          otherModule !== module && 
          otherModule.imports.some(imp => imp.includes(exportName))
        );
        
        if (!isUsed) {
          unusedExports.push(exportName);
        }
      }
      
      if (unusedExports.length > 0) {
        const estimatedSize = Math.floor(module.size * (unusedExports.length / Math.max(module.exports.length, 1)));
        
        unusedCode.push({
          file: module.path,
          functions: unusedExports,
          classes: [],
          variables: [],
          estimatedSize
        });
      }
    }

    return unusedCode;
  }

  private async calculateTreeshakingEfficiency(
    modules: ModuleSizeInfo[], 
    dependencies: DependencySizeInfo[]
  ): Promise<number> {
    const treeshakableDeps = dependencies.filter(d => d.treeshakable);
    const nonTreeshakableDeps = dependencies.filter(d => !d.treeshakable);
    
    if (dependencies.length === 0) return 1;
    
    const treeshakableSize = treeshakableDeps.reduce((sum, d) => sum + d.size, 0);
    const totalDepSize = dependencies.reduce((sum, d) => sum + d.size, 0);
    
    return treeshakableSize / totalDepSize;
  }

  private async calculateGzippedSize(modules: ModuleSizeInfo[]): Promise<number> {
    return modules.reduce((sum, m) => sum + m.gzippedSize, 0);
  }

  private compareWithPrevious(currentMetrics: BundleSizeMetrics): BundleChange[] {
    const previousResult = this.history[this.history.length - 1];
    if (!previousResult) return [];

    return this.compareResults(previousResult.metrics, currentMetrics);
  }

  private compareResults(baseline: BundleSizeMetrics, current: BundleSizeMetrics): BundleChange[] {
    const changes: BundleChange[] = [];
    
    // Compare total sizes
    const sizeChange = current.totalSize - baseline.totalSize;
    const sizeChangePercent = (sizeChange / baseline.totalSize) * 100;
    
    if (Math.abs(sizeChangePercent) > 5) { // 5% threshold
      changes.push({
        type: 'modified',
        file: 'Total Bundle Size',
        sizeBefore: baseline.totalSize,
        sizeAfter: current.totalSize,
        impact: this.classifyImpact(Math.abs(sizeChangePercent))
      });
    }

    // Compare individual modules
    const baselineModules = new Map(baseline.modules.map(m => [m.path, m]));
    const currentModules = new Map(current.modules.map(m => [m.path, m]));

    // Find added modules
    for (const [path, module] of currentModules) {
      if (!baselineModules.has(path)) {
        changes.push({
          type: 'added',
          file: path,
          sizeAfter: module.size,
          impact: this.classifyImpact((module.size / current.totalSize) * 100)
        });
      }
    }

    // Find removed modules
    for (const [path, module] of baselineModules) {
      if (!currentModules.has(path)) {
        changes.push({
          type: 'removed',
          file: path,
          sizeBefore: module.size,
          impact: this.classifyImpact((module.size / baseline.totalSize) * 100)
        });
      }
    }

    // Find modified modules
    for (const [path, currentModule] of currentModules) {
      const baselineModule = baselineModules.get(path);
      if (baselineModule && currentModule.size !== baselineModule.size) {
        const changePercent = Math.abs((currentModule.size - baselineModule.size) / baselineModule.size) * 100;
        if (changePercent > 10) { // 10% threshold for individual modules
          changes.push({
            type: 'modified',
            file: path,
            sizeBefore: baselineModule.size,
            sizeAfter: currentModule.size,
            impact: this.classifyImpact(changePercent)
          });
        }
      }
    }

    return changes;
  }

  private classifyImpact(changePercent: number): BundleChange['impact'] {
    if (changePercent < 5) return 'low';
    if (changePercent < 15) return 'medium';
    if (changePercent < 30) return 'high';
    return 'critical';
  }

  private generateRecommendations(
    metrics: BundleSizeMetrics, 
    changes: BundleChange[]
  ): BundleRecommendation[] {
    const recommendations: BundleRecommendation[] = [];

    // Bundle size recommendations
    if (metrics.totalSize > this.config.thresholds.totalSize) {
      recommendations.push({
        type: 'code_splitting',
        priority: 'high',
        title: 'Implement Code Splitting',
        description: 'Bundle size exceeds threshold. Consider implementing code splitting to reduce initial load.',
        potentialSavings: metrics.totalSize * 0.3,
        effort: 'medium',
        implementation: [
          'Use dynamic imports for non-critical code',
          'Implement route-based code splitting',
          'Split vendor bundles from application code'
        ]
      });
    }

    // Tree shaking recommendations
    if (metrics.treeshakingEfficiency < 0.7) {
      recommendations.push({
        type: 'treeshaking',
        priority: 'medium',
        title: 'Improve Tree Shaking',
        description: 'Low tree shaking efficiency detected. Consider optimizing imports and dependencies.',
        potentialSavings: metrics.totalSize * (0.7 - metrics.treeshakingEfficiency),
        effort: 'low',
        implementation: [
          'Use named imports instead of default imports',
          'Remove unused dependencies',
          'Configure bundler for better tree shaking'
        ]
      });
    }

    // Duplicate code recommendations
    if (metrics.duplicateModules.length > 0) {
      const duplicateSize = metrics.duplicateModules.reduce((sum, d) => sum + d.totalSize, 0);
      recommendations.push({
        type: 'dependencies',
        priority: 'medium',
        title: 'Remove Duplicate Code',
        description: `${metrics.duplicateModules.length} duplicate modules found.`,
        potentialSavings: duplicateSize * 0.5,
        effort: 'medium',
        implementation: [
          'Deduplicate common modules',
          'Use module federation or similar techniques',
          'Review dependency versions for conflicts'
        ]
      });
    }

    // Asset optimization recommendations
    const largeAssets = metrics.assets.filter(a => a.size > 100 * 1024); // 100KB threshold
    if (largeAssets.length > 0) {
      recommendations.push({
        type: 'assets',
        priority: 'low',
        title: 'Optimize Assets',
        description: `${largeAssets.length} large assets found that could be optimized.`,
        potentialSavings: largeAssets.reduce((sum, a) => sum + a.size * 0.4, 0),
        effort: 'low',
        implementation: [
          'Compress images using modern formats',
          'Optimize font loading and subsetting',
          'Implement lazy loading for non-critical assets'
        ]
      });
    }

    return recommendations;
  }

  private generateAlerts(metrics: BundleSizeMetrics, changes: BundleChange[]): PerformanceAlert[] {
    const alerts: PerformanceAlert[] = [];
    const timestamp = Date.now();

    // Size threshold alerts
    if (metrics.totalSize > this.config.thresholds.totalSize) {
      alerts.push({
        id: `bundle-size-${timestamp}`,
        timestamp,
        type: 'threshold',
        severity: 'warning',
        title: 'Bundle Size Threshold Exceeded',
        description: `Bundle size ${this.formatBytes(metrics.totalSize)} exceeds threshold ${this.formatBytes(this.config.thresholds.totalSize)}`,
        metrics: {} as any, // Would contain relevant metrics
        issue: {
          type: 'bundle_bloat',
          severity: 'warning',
          message: 'Bundle size exceeds configured threshold',
          metric: 'totalSize',
          current: metrics.totalSize,
          threshold: this.config.thresholds.totalSize,
          impact: 'medium'
        },
        environment: {} as any // Would contain environment info
      });
    }

    // Significant size increases
    const criticalChanges = changes.filter(c => c.impact === 'critical');
    if (criticalChanges.length > 0) {
      alerts.push({
        id: `bundle-regression-${timestamp}`,
        timestamp,
        type: 'regression',
        severity: 'error',
        title: 'Critical Bundle Size Regression',
        description: `${criticalChanges.length} critical bundle size changes detected`,
        metrics: {} as any,
        issue: {
          type: 'regression',
          severity: 'error',
          message: 'Critical bundle size regression detected',
          metric: 'bundleSize',
          current: metrics.totalSize,
          impact: 'critical'
        },
        environment: {} as any
      });
    }

    return alerts;
  }

  private async createTempCheckout(gitRef: string): Promise<string> {
    const tempDir = path.join(process.cwd(), '.tmp', `bundle-analysis-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    
    // Clone to temp directory
    execSync(`git clone . ${tempDir}`, { cwd: process.cwd() });
    execSync(`git checkout ${gitRef}`, { cwd: tempDir });
    
    return tempDir;
  }

  private generateHTMLReport(result: BundleAnalysisResult): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>Bundle Analysis Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .metric { background: #f5f5f5; padding: 10px; margin: 10px 0; border-radius: 5px; }
        .alert { background: #ffebee; border-left: 4px solid #f44336; padding: 10px; margin: 10px 0; }
        .recommendation { background: #e8f5e8; border-left: 4px solid #4caf50; padding: 10px; margin: 10px 0; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
    </style>
</head>
<body>
    <h1>Bundle Analysis Report</h1>
    <div class="metric">
        <h3>Bundle Size Metrics</h3>
        <p><strong>Total Size:</strong> ${this.formatBytes(result.totalSize)}</p>
        <p><strong>Gzipped Size:</strong> ${this.formatBytes(result.gzippedSize)}</p>
        <p><strong>Modules:</strong> ${result.metrics.modules.length}</p>
        <p><strong>Dependencies:</strong> ${result.metrics.dependencies.length}</p>
    </div>
    
    ${result.alerts.length > 0 ? `
    <h3>Alerts</h3>
    ${result.alerts.map(alert => `
    <div class="alert">
        <strong>${alert.title}</strong><br>
        ${alert.description}
    </div>
    `).join('')}
    ` : ''}
    
    ${result.recommendations.length > 0 ? `
    <h3>Recommendations</h3>
    ${result.recommendations.map(rec => `
    <div class="recommendation">
        <strong>${rec.title}</strong><br>
        ${rec.description}<br>
        <small>Potential Savings: ${this.formatBytes(rec.potentialSavings)} | Effort: ${rec.effort}</small>
    </div>
    `).join('')}
    ` : ''}
    
    <h3>Module Details</h3>
    <table>
        <tr><th>Module</th><th>Size</th><th>Gzipped</th><th>Type</th></tr>
        ${result.metrics.modules.map(module => `
        <tr>
            <td>${module.name}</td>
            <td>${this.formatBytes(module.size)}</td>
            <td>${this.formatBytes(module.gzippedSize)}</td>
            <td>${module.type}</td>
        </tr>
        `).join('')}
    </table>
</body>
</html>
    `;
  }

  private generateMarkdownReport(result: BundleAnalysisResult): string {
    return `
# Bundle Analysis Report

Generated: ${new Date(result.timestamp).toISOString()}

## Summary

- **Total Size:** ${this.formatBytes(result.totalSize)}
- **Gzipped Size:** ${this.formatBytes(result.gzippedSize)}
- **Modules:** ${result.metrics.modules.length}
- **Dependencies:** ${result.metrics.dependencies.length}

${result.alerts.length > 0 ? `
## Alerts

${result.alerts.map(alert => `
### ${alert.title}
**Severity:** ${alert.severity}
**Description:** ${alert.description}
`).join('')}
` : ''}

${result.recommendations.length > 0 ? `
## Recommendations

${result.recommendations.map(rec => `
### ${rec.title}
**Priority:** ${rec.priority}
**Description:** ${rec.description}
**Potential Savings:** ${this.formatBytes(rec.potentialSavings)}
**Effort:** ${rec.effort}

Implementation:
${rec.implementation.map(impl => `- ${impl}`).join('\n')}
`).join('')}
` : ''}

## Module Details

| Module | Size | Gzipped | Type |
|--------|------|---------|------|
${result.metrics.modules.map(module => 
  `| ${module.name} | ${this.formatBytes(module.size)} | ${this.formatBytes(module.gzippedSize)} | ${module.type} |`
).join('\n')}
    `;
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}