/**
 * Performance Regression Testing and Bundle Size Monitoring System
 * Core type definitions for the comprehensive performance monitoring system
 */

export interface PerformanceMetrics {
  timestamp: number;
  duration: number;
  memoryUsage: MemoryMetrics;
  cpuUsage: CPUMetrics;
  networkIO: NetworkMetrics;
  diskIO: DiskMetrics;
  bundleSize?: BundleSizeMetrics;
  customMetrics?: Record<string, number>;
}

export interface MemoryMetrics {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
  arrayBuffers: number;
  peak?: number;
  growthRate?: number;
  leakIndicators?: MemoryLeakIndicator[];
}

export interface MemoryLeakIndicator {
  type: 'heap_growth' | 'external_growth' | 'handle_leak' | 'listener_leak';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  value: number;
  threshold: number;
  trend?: 'increasing' | 'stable' | 'decreasing';
}

export interface CPUMetrics {
  user: number;
  system: number;
  total: number;
  cores: number[];
  loadAverage: number[];
  utilizationPercent: number;
}

export interface NetworkMetrics {
  bytesIn: number;
  bytesOut: number;
  packetsIn: number;
  packetsOut: number;
  connectionsActive: number;
  latency?: number;
  throughput?: number;
}

export interface DiskMetrics {
  bytesRead: number;
  bytesWritten: number;
  operationsRead: number;
  operationsWrite: number;
  queueLength: number;
}

export interface BundleSizeMetrics {
  totalSize: number;
  gzippedSize: number;
  modules: ModuleSizeInfo[];
  dependencies: DependencySizeInfo[];
  assets: AssetSizeInfo[];
  treeshakingEfficiency: number;
  duplicateModules: DuplicateModuleInfo[];
  unusedCode: UnusedCodeInfo[];
}

export interface ModuleSizeInfo {
  name: string;
  size: number;
  gzippedSize: number;
  path: string;
  type: 'entry' | 'chunk' | 'dependency' | 'asset';
  imports: string[];
  exports: string[];
}

export interface DependencySizeInfo {
  name: string;
  version: string;
  size: number;
  gzippedSize: number;
  type: 'production' | 'development' | 'peer' | 'optional';
  treeshakable: boolean;
  sideEffects: boolean;
}

export interface AssetSizeInfo {
  name: string;
  size: number;
  optimizedSize?: number;
  type: 'image' | 'font' | 'stylesheet' | 'javascript' | 'other';
  compressionRatio?: number;
}

export interface DuplicateModuleInfo {
  module: string;
  occurrences: number;
  totalSize: number;
  paths: string[];
}

export interface UnusedCodeInfo {
  file: string;
  functions: string[];
  classes: string[];
  variables: string[];
  estimatedSize: number;
}

export interface PerformanceBaseline {
  id: string;
  name: string;
  version: string;
  timestamp: number;
  metrics: PerformanceMetrics;
  environment: EnvironmentInfo;
  commit?: string;
  branch?: string;
  tags?: string[];
}

export interface EnvironmentInfo {
  nodeVersion: string;
  platform: string;
  arch: string;
  cpuModel: string;
  totalMemory: number;
  availableMemory: number;
  osVersion: string;
  ci?: boolean;
  environment?: 'development' | 'staging' | 'production' | 'test';
}

export interface PerformanceTest {
  id: string;
  name: string;
  description: string;
  category: 'startup' | 'runtime' | 'memory' | 'bundle' | 'api' | 'integration';
  priority: 'low' | 'medium' | 'high' | 'critical';
  timeout: number;
  warmupIterations?: number;
  testIterations?: number;
  setup?: () => Promise<void>;
  teardown?: () => Promise<void>;
  execute: () => Promise<PerformanceMetrics>;
  validate?: (metrics: PerformanceMetrics, baseline?: PerformanceMetrics) => ValidationResult;
}

export interface ValidationResult {
  passed: boolean;
  score: number;
  issues: PerformanceIssue[];
  recommendations: string[];
}

export interface PerformanceIssue {
  type: 'regression' | 'memory_leak' | 'bundle_bloat' | 'slow_operation' | 'resource_exhaustion';
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  metric: string;
  current: number;
  baseline?: number;
  threshold?: number;
  impact: 'low' | 'medium' | 'high' | 'critical';
  suggestion?: string;
}

export interface PerformanceAlert {
  id: string;
  timestamp: number;
  type: 'regression' | 'threshold' | 'anomaly' | 'trend';
  severity: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  description: string;
  metrics: PerformanceMetrics;
  baseline?: PerformanceMetrics;
  issue: PerformanceIssue;
  environment: EnvironmentInfo;
  actions?: AlertAction[];
}

export interface AlertAction {
  type: 'ignore' | 'investigate' | 'rollback' | 'scale' | 'notify';
  description: string;
  automated: boolean;
  handler?: () => Promise<void>;
}

export interface PerformanceConfig {
  enabled: boolean;
  baseline: {
    autoUpdate: boolean;
    retentionDays: number;
    comparisonWindow: number;
  };
  thresholds: {
    memoryUsage: number;
    cpuUsage: number;
    responseTime: number;
    bundleSize: number;
    regressionPercent: number;
  };
  alerts: {
    enabled: boolean;
    channels: AlertChannel[];
    debounceMs: number;
    aggregationWindow: number;
  };
  monitoring: {
    interval: number;
    retentionDays: number;
    batchSize: number;
    enableProfiling: boolean;
  };
  bundleAnalysis: {
    enabled: boolean;
    trackDependencies: boolean;
    analyzeTreeshaking: boolean;
    findDuplicates: boolean;
    detectUnusedCode: boolean;
  };
}

export interface AlertChannel {
  type: 'email' | 'slack' | 'webhook' | 'file' | 'console';
  config: Record<string, any>;
  enabled: boolean;
  filter?: (alert: PerformanceAlert) => boolean;
}

export interface PerformanceReport {
  id: string;
  timestamp: number;
  period: {
    start: number;
    end: number;
  };
  summary: PerformanceSummary;
  tests: TestResult[];
  regressions: RegressionAnalysis[];
  trends: TrendAnalysis[];
  recommendations: string[];
  environment: EnvironmentInfo;
}

export interface PerformanceSummary {
  totalTests: number;
  passedTests: number;
  failedTests: number;
  averagePerformance: number;
  performanceChange: number;
  criticalIssues: number;
  bundleSizeChange: number;
  memoryLeaks: number;
}

export interface TestResult {
  test: PerformanceTest;
  metrics: PerformanceMetrics;
  baseline?: PerformanceMetrics;
  validation: ValidationResult;
  duration: number;
  status: 'passed' | 'failed' | 'skipped' | 'timeout';
  error?: string;
}

export interface RegressionAnalysis {
  metric: string;
  current: number;
  baseline: number;
  change: number;
  changePercent: number;
  significance: 'negligible' | 'minor' | 'moderate' | 'major' | 'critical';
  trend: 'improving' | 'stable' | 'degrading';
  cause?: string;
}

export interface TrendAnalysis {
  metric: string;
  period: number;
  direction: 'up' | 'down' | 'stable';
  rate: number;
  confidence: number;
  forecast?: number;
  seasonality?: boolean;
}

export interface PerformanceGate {
  name: string;
  enabled: boolean;
  blocking: boolean;
  conditions: GateCondition[];
  timeout: number;
}

export interface GateCondition {
  metric: keyof PerformanceMetrics;
  operator: 'lt' | 'le' | 'gt' | 'ge' | 'eq' | 'ne';
  value: number;
  baseline?: boolean;
  tolerance?: number;
}

export interface BundleAnalysisOptions {
  outputPath?: string;
  analyzeDependencies?: boolean;
  findDuplicates?: boolean;
  trackAssets?: boolean;
  generateReport?: boolean;
  compareWith?: string;
  threshold?: {
    totalSize?: number;
    gzippedSize?: number;
    chunkSize?: number;
  };
}

export interface MemoryProfileOptions {
  duration?: number;
  interval?: number;
  heapSnapshot?: boolean;
  trackAllocations?: boolean;
  detectLeaks?: boolean;
  generateReport?: boolean;
}

export interface ProfilingSession {
  id: string;
  startTime: number;
  endTime?: number;
  type: 'cpu' | 'memory' | 'bundle' | 'network';
  status: 'active' | 'completed' | 'failed' | 'cancelled';
  options: Record<string, any>;
  results?: ProfilingResults;
}

export interface ProfilingResults {
  sessionId: string;
  duration: number;
  samplingRate: number;
  totalSamples: number;
  hotspots: Hotspot[];
  callTree?: CallTreeNode;
  timeline?: TimelineEvent[];
  summary: ProfilingSummary;
}

export interface Hotspot {
  function: string;
  file: string;
  line: number;
  column: number;
  selfTime: number;
  totalTime: number;
  hitCount: number;
  percentage: number;
}

export interface CallTreeNode {
  function: string;
  file: string;
  line: number;
  selfTime: number;
  totalTime: number;
  children: CallTreeNode[];
}

export interface TimelineEvent {
  timestamp: number;
  type: string;
  duration: number;
  details: Record<string, any>;
}

export interface ProfilingSummary {
  totalTime: number;
  idleTime: number;
  gcTime: number;
  compilationTime: number;
  topFunctions: string[];
  memoryPeaks: number[];
  recommendations: string[];
}