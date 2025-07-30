/**
 * Comprehensive tests for Bundle Analyzer
 * Tests bundle size monitoring and analysis functionality
 */

import { jest } from '@jest/globals';
import { promises as fs } from 'fs';
import * as path from 'path';
import { BundleAnalyzer } from '../bundle/BundleAnalyzer.js';
import { 
  BundleAnalysisConfig, 
  BundleAnalysisResult, 
  BundleSizeChange,
  DependencyAnalysis 
} from '../types.js';

// Mock file system operations
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    readdir: jest.fn(),
    stat: jest.fn(),
    access: jest.fn()
  }
}));

jest.mock('../../monitoring/real-time-monitor.js');

describe('BundleAnalyzer', () => {
  let analyzer: BundleAnalyzer;
  let mockConfig: BundleAnalysisConfig;
  const mockFs = fs as jest.Mocked<typeof fs>;

  beforeEach(() => {
    mockConfig = {
      buildDir: './dist',
      packageJsonPath: './package.json',
      thresholds: {
        maxBundleSize: 5 * 1024 * 1024, // 5MB
        maxChunkSize: 1 * 1024 * 1024,  // 1MB
        maxAssetSize: 500 * 1024,       // 500KB
        sizeIncreaseThreshold: 10       // 10%
      },
      excludePatterns: ['*.map', '*.test.*'],
      includeAssets: ['*.js', '*.css', '*.png', '*.jpg', '*.svg'],
      enableTreeShaking: true,
      enableCompression: true
    };

    analyzer = new BundleAnalyzer(mockConfig);
    
    // Setup default mocks
    mockFs.readFile.mockResolvedValue('{}');
    mockFs.readdir.mockResolvedValue([]);
    mockFs.stat.mockResolvedValue({ size: 1024, isFile: () => true } as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Bundle Analysis', () => {
    test('should analyze bundle sizes correctly', async () => {
      // Mock build directory structure
      mockFs.readdir.mockResolvedValueOnce([
        'main.js',
        'vendor.js',
        'styles.css',
        'main.js.map' // Should be excluded
      ] as any);

      mockFs.stat
        .mockResolvedValueOnce({ size: 1024 * 512, isFile: () => true } as any) // main.js - 512KB
        .mockResolvedValueOnce({ size: 1024 * 1024 * 2, isFile: () => true } as any) // vendor.js - 2MB
        .mockResolvedValueOnce({ size: 1024 * 64, isFile: () => true } as any); // styles.css - 64KB

      const result = await analyzer.analyzeBundle();

      expect(result).toBeDefined();
      expect(result.totalSize).toBe(1024 * 512 + 1024 * 1024 * 2 + 1024 * 64);
      expect(result.files).toHaveLength(3); // Excludes .map file
      expect(result.files.find(f => f.name === 'main.js')?.size).toBe(1024 * 512);
      expect(result.files.find(f => f.name === 'vendor.js')?.size).toBe(1024 * 1024 * 2);
      expect(result.files.find(f => f.name === 'styles.css')?.size).toBe(1024 * 64);
    });

    test('should detect bundle size threshold violations', async () => {
      // Mock large bundle
      mockFs.readdir.mockResolvedValueOnce(['large-bundle.js'] as any);
      mockFs.stat.mockResolvedValueOnce({ 
        size: mockConfig.thresholds!.maxBundleSize! + 1024, // Exceeds threshold
        isFile: () => true 
      } as any);

      const result = await analyzer.analyzeBundle();

      expect(result.violations).toBeDefined();
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0].type).toBe('bundle-size');
      expect(result.violations[0].severity).toBe('error');
    });

    test('should handle nested directory structures', async () => {
      // Mock nested build structure
      mockFs.readdir
        .mockResolvedValueOnce(['js', 'css', 'assets'] as any)
        .mockResolvedValueOnce(['main.js', 'chunk1.js'] as any) // js directory
        .mockResolvedValueOnce(['styles.css'] as any) // css directory
        .mockResolvedValueOnce(['logo.png'] as any); // assets directory

      mockFs.stat
        .mockResolvedValueOnce({ isFile: () => false, isDirectory: () => true } as any) // js dir
        .mockResolvedValueOnce({ isFile: () => false, isDirectory: () => true } as any) // css dir
        .mockResolvedValueOnce({ isFile: () => false, isDirectory: () => true } as any) // assets dir
        .mockResolvedValueOnce({ size: 1024 * 100, isFile: () => true } as any) // main.js
        .mockResolvedValueOnce({ size: 1024 * 50, isFile: () => true } as any) // chunk1.js
        .mockResolvedValueOnce({ size: 1024 * 20, isFile: () => true } as any) // styles.css
        .mockResolvedValueOnce({ size: 1024 * 5, isFile: () => true } as any); // logo.png

      const result = await analyzer.analyzeBundle();

      expect(result.files).toHaveLength(4);
      expect(result.totalSize).toBe(1024 * (100 + 50 + 20 + 5));
    });
  });

  describe('Dependency Analysis', () => {
    test('should analyze package.json dependencies', async () => {
      const mockPackageJson = {
        dependencies: {
          'react': '^18.2.0',
          'lodash': '^4.17.21'
        },
        devDependencies: {
          'typescript': '^5.0.0',
          'jest': '^29.0.0'
        }
      };

      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(mockPackageJson));

      const dependencies = await analyzer.analyzeDependencies();

      expect(dependencies).toBeDefined();
      expect(dependencies.production).toHaveLength(2);
      expect(dependencies.development).toHaveLength(2);
      expect(dependencies.production.find(d => d.name === 'react')).toBeDefined();
      expect(dependencies.development.find(d => d.name === 'typescript')).toBeDefined();
    });

    test('should detect duplicate dependencies', async () => {
      // Mock node_modules structure with duplicates
      const mockDependencies = {
        production: [
          { name: 'lodash', version: '4.17.21', size: 1024 * 100 },
          { name: 'lodash', version: '4.17.20', size: 1024 * 98 } // Duplicate with different version
        ],
        development: []
      };

      jest.spyOn(analyzer as any, 'analyzeDependencies').mockResolvedValueOnce(mockDependencies);

      const duplicates = await analyzer.findDuplicateDependencies();

      expect(duplicates).toHaveLength(1);
      expect(duplicates[0].name).toBe('lodash');
      expect(duplicates[0].versions).toHaveLength(2);
    });

    test('should calculate dependency size impact', async () => {
      const mockPackageJson = {
        dependencies: {
          'react': '^18.2.0',
          'moment': '^2.29.0' // Known large dependency
        }
      };

      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(mockPackageJson));

      const sizeAnalysis = await analyzer.analyzeDependencySizes();

      expect(sizeAnalysis).toBeDefined();
      expect(sizeAnalysis.totalSize).toBeGreaterThan(0);
      expect(sizeAnalysis.largestDependencies).toBeDefined();
      expect(Array.isArray(sizeAnalysis.largestDependencies)).toBe(true);
    });
  });

  describe('Tree Shaking Analysis', () => {
    test('should detect unused exports', async () => {
      const mockBuildStats = {
        modules: [
          {
            name: './src/utils.js',
            size: 1024,
            exports: ['function1', 'function2', 'unusedFunction'],
            usedExports: ['function1', 'function2']
          }
        ]
      };

      jest.spyOn(analyzer as any, 'getBuildStats').mockResolvedValueOnce(mockBuildStats);

      const treeShakingResult = await analyzer.analyzeTreeShaking();

      expect(treeShakingResult).toBeDefined();
      expect(treeShakingResult.unusedCode).toBeDefined();
      expect(treeShakingResult.potentialSavings).toBeGreaterThan(0);
    });

    test('should calculate tree shaking effectiveness', async () => {
      const mockStats = {
        totalExports: 100,
        usedExports: 75,
        unusedExports: 25
      };

      jest.spyOn(analyzer as any, 'getTreeShakingStats').mockResolvedValueOnce(mockStats);

      const effectiveness = await analyzer.calculateTreeShakingEffectiveness();

      expect(effectiveness).toBe(75); // 75% effectiveness
    });
  });

  describe('Bundle Comparison', () => {
    test('should compare bundles and detect size changes', async () => {
      const previousResult: BundleAnalysisResult = {
        timestamp: new Date('2024-01-01'),
        totalSize: 1024 * 1024, // 1MB
        files: [
          { name: 'main.js', size: 1024 * 500, path: 'dist/main.js', type: 'js' },
          { name: 'vendor.js', size: 1024 * 500, path: 'dist/vendor.js', type: 'js' }
        ],
        chunks: [],
        assets: [],
        dependencies: { production: [], development: [] },
        violations: [],
        metadata: {}
      };

      const currentResult: BundleAnalysisResult = {
        timestamp: new Date('2024-01-02'),
        totalSize: 1024 * 1024 * 1.2, // 1.2MB (20% increase)
        files: [
          { name: 'main.js', size: 1024 * 600, path: 'dist/main.js', type: 'js' }, // Increased
          { name: 'vendor.js', size: 1024 * 600, path: 'dist/vendor.js', type: 'js' } // Increased
        ],
        chunks: [],
        assets: [],
        dependencies: { production: [], development: [] },
        violations: [],
        metadata: {}
      };

      const comparison = analyzer.compareWithPrevious(currentResult, previousResult);

      expect(comparison).toBeDefined();
      expect(comparison.totalSizeChange.absolute).toBe(1024 * 1024 * 0.2);
      expect(comparison.totalSizeChange.percentage).toBe(20);
      expect(comparison.fileChanges).toHaveLength(2);
      expect(comparison.hasSignificantChange).toBe(true); // Above 10% threshold
    });

    test('should not flag minor size changes as significant', async () => {
      const previousResult: BundleAnalysisResult = {
        timestamp: new Date('2024-01-01'),
        totalSize: 1024 * 1024,
        files: [
          { name: 'main.js', size: 1024 * 500, path: 'dist/main.js', type: 'js' }
        ],
        chunks: [],
        assets: [],
        dependencies: { production: [], development: [] },
        violations: [],
        metadata: {}
      };

      const currentResult: BundleAnalysisResult = {
        timestamp: new Date('2024-01-02'),
        totalSize: 1024 * 1024 * 1.05, // 5% increase (below threshold)
        files: [
          { name: 'main.js', size: 1024 * 525, path: 'dist/main.js', type: 'js' }
        ],
        chunks: [],
        assets: [],
        dependencies: { production: [], development: [] },
        violations: [],
        metadata: {}
      };

      const comparison = analyzer.compareWithPrevious(currentResult, previousResult);

      expect(comparison.hasSignificantChange).toBe(false);
    });
  });

  describe('Report Generation', () => {
    test('should generate comprehensive analysis report', async () => {
      const mockResult: BundleAnalysisResult = {
        timestamp: new Date(),
        totalSize: 1024 * 1024 * 3,
        files: [
          { name: 'main.js', size: 1024 * 1024, path: 'dist/main.js', type: 'js' },
          { name: 'vendor.js', size: 1024 * 1024 * 2, path: 'dist/vendor.js', type: 'js' }
        ],
        chunks: [],
        assets: [],
        dependencies: { production: [], development: [] },
        violations: [
          {
            type: 'bundle-size',
            message: 'Bundle size exceeds threshold',
            severity: 'warning',
            file: 'vendor.js',
            actual: 1024 * 1024 * 2,
            expected: 1024 * 1024
          }
        ],
        metadata: {}
      };

      const report = analyzer.generateReport(mockResult);

      expect(report).toBeDefined();
      expect(report).toContain('Bundle Analysis Report');
      expect(report).toContain('Total Size: 3.00 MB');
      expect(report).toContain('main.js');
      expect(report).toContain('vendor.js');
      expect(report).toContain('Violations');
    });

    test('should generate HTML report when requested', async () => {
      const mockResult: BundleAnalysisResult = {
        timestamp: new Date(),
        totalSize: 1024 * 500,
        files: [
          { name: 'main.js', size: 1024 * 500, path: 'dist/main.js', type: 'js' }
        ],
        chunks: [],
        assets: [],
        dependencies: { production: [], development: [] },
        violations: [],
        metadata: {}
      };

      const htmlReport = analyzer.generateHTMLReport(mockResult);

      expect(htmlReport).toBeDefined();
      expect(htmlReport).toContain('<html>');
      expect(htmlReport).toContain('<title>Bundle Analysis Report</title>');
      expect(htmlReport).toContain('main.js');
    });
  });

  describe('Error Handling', () => {
    test('should handle missing build directory gracefully', async () => {
      mockFs.readdir.mockRejectedValueOnce(new Error('ENOENT: no such file or directory'));

      const result = await analyzer.analyzeBundle();

      expect(result.files).toHaveLength(0);
      expect(result.totalSize).toBe(0);
      expect(result.violations.some(v => v.type === 'build-error')).toBe(true);
    });

    test('should handle corrupted package.json', async () => {
      mockFs.readFile.mockResolvedValueOnce('invalid json {');

      const dependencies = await analyzer.analyzeDependencies();

      expect(dependencies.production).toHaveLength(0);
      expect(dependencies.development).toHaveLength(0);
    });

    test('should handle permission errors', async () => {
      mockFs.stat.mockRejectedValueOnce(new Error('EACCES: permission denied'));

      const result = await analyzer.analyzeBundle();

      expect(result.violations.some(v => v.message.includes('permission'))).toBe(true);
    });
  });

  describe('Configuration Validation', () => {
    test('should validate analysis configuration', () => {
      const invalidConfig = {
        ...mockConfig,
        thresholds: {
          maxBundleSize: -1 // Invalid negative value
        }
      };

      expect(() => new BundleAnalyzer(invalidConfig)).toThrow();
    });

    test('should use default configuration when not provided', () => {
      const minimalConfig: Partial<BundleAnalysisConfig> = {
        buildDir: './dist'
      };

      const analyzerWithDefaults = new BundleAnalyzer(minimalConfig as BundleAnalysisConfig);

      expect(analyzerWithDefaults).toBeDefined();
    });
  });

  describe('Performance Optimization', () => {
    test('should efficiently handle large number of files', async () => {
      // Mock large number of files
      const manyFiles = Array.from({ length: 1000 }, (_, i) => `file${i}.js`);
      mockFs.readdir.mockResolvedValueOnce(manyFiles as any);
      
      // Mock stat calls for all files
      for (let i = 0; i < 1000; i++) {
        mockFs.stat.mockResolvedValueOnce({ size: 1024, isFile: () => true } as any);
      }

      const startTime = Date.now();
      const result = await analyzer.analyzeBundle();
      const endTime = Date.now();

      expect(result.files).toHaveLength(1000);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    });

    test('should cache analysis results when appropriate', async () => {
      mockFs.readdir.mockResolvedValue(['main.js'] as any);
      mockFs.stat.mockResolvedValue({ size: 1024, isFile: () => true } as any);

      // First analysis
      const result1 = await analyzer.analyzeBundle();
      
      // Second analysis (should use cache if files haven't changed)
      const result2 = await analyzer.analyzeBundle();

      expect(result1.totalSize).toBe(result2.totalSize);
      expect(mockFs.readdir).toHaveBeenCalledTimes(2); // Called for each analysis
    });
  });
});