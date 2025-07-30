/**
 * ML-Based Performance Prediction Engine
 * Inspired by Claude Usage Monitor's P90 analysis and burn rate calculations
 * Enhanced with enterprise-grade prediction algorithms
 */

export interface PerformanceSample {
  timestamp: Date;
  executionTime: number;
  memoryUsage: number;
  cpuUsage: number;
  agentCount: number;
  taskComplexity: number;
  systemLoad: number;
}

export interface PredictionConfig {
  analysisWindow: {
    hours: number;              // Historical data window (default: 192 hours / 8 days)
    minSamples: number;         // Minimum samples required for prediction
  };
  confidence: {
    level: number;              // Confidence level (default: 95%)
    threshold: number;          // Prediction threshold (default: 90th percentile)
  };
  regression: {
    enableTrendAnalysis: boolean;
    polynomialDegree: number;   // For polynomial regression
    seasonalityDetection: boolean;
  };
  thresholds: {
    performanceDegradation: number;  // % threshold for degradation alert
    memoryLeakDetection: number;     // Growth rate threshold for memory leaks
    responseTimeRegression: number;  // % threshold for response time regression
  };
}

export interface PerformancePrediction {
  metric: string;
  predictedValue: number;
  confidence: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  regressionDetected: boolean;
  timeToThreshold?: number;    // Time in milliseconds until threshold breach
  recommendations: string[];
}

export interface BurnRateAnalysis {
  currentRate: number;         // Current consumption rate per hour
  averageRate: number;         // Average rate over analysis window
  predictedExhaustion?: Date;  // When resources will be exhausted
  confidence: number;
  volatility: number;          // Rate variance indicator
}

export interface PerformanceForecast {
  timestamp: Date;
  predictions: PerformancePrediction[];
  burnRateAnalysis: BurnRateAnalysis;
  systemHealthScore: number;   // 0-100 overall health score
  alertLevel: 'normal' | 'warning' | 'critical';
  regressionRisk: number;      // 0-100 risk score for performance regression
}

export class MLPerformancePredictor {
  private samples: PerformanceSample[] = [];
  private config: PredictionConfig;
  private readonly maxSamples: number;

  constructor(config: Partial<PredictionConfig> = {}) {
    this.config = {
      analysisWindow: {
        hours: config.analysisWindow?.hours || 192, // 8 days
        minSamples: config.analysisWindow?.minSamples || 50,
      },
      confidence: {
        level: config.confidence?.level || 95,
        threshold: config.confidence?.threshold || 90,
      },
      regression: {
        enableTrendAnalysis: config.regression?.enableTrendAnalysis ?? true,
        polynomialDegree: config.regression?.polynomialDegree || 2,
        seasonalityDetection: config.regression?.seasonalityDetection ?? true,
      },
      thresholds: {
        performanceDegradation: config.thresholds?.performanceDegradation || 15,
        memoryLeakDetection: config.thresholds?.memoryLeakDetection || 5,
        responseTimeRegression: config.thresholds?.responseTimeRegression || 20,
      },
    };

    // Calculate max samples based on analysis window (assuming 1 sample per minute)
    this.maxSamples = this.config.analysisWindow.hours * 60;
  }

  /**
   * Add a new performance sample to the dataset
   */
  addSample(sample: PerformanceSample): void {
    this.samples.push(sample);

    // Maintain rolling window
    if (this.samples.length > this.maxSamples) {
      this.samples = this.samples.slice(-this.maxSamples);
    }

    // Remove samples outside analysis window
    const cutoffTime = new Date(Date.now() - this.config.analysisWindow.hours * 3600000);
    this.samples = this.samples.filter(s => s.timestamp >= cutoffTime);
  }

  /**
   * Generate comprehensive performance forecast
   */
  generateForecast(): PerformanceForecast {
    if (this.samples.length < this.config.analysisWindow.minSamples) {
      return this.createEmptyForecast('Insufficient data for prediction');
    }

    const predictions = this.generatePredictions();
    const burnRateAnalysis = this.analyzeBurnRate();
    const systemHealthScore = this.calculateSystemHealthScore();
    const regressionRisk = this.calculateRegressionRisk();
    const alertLevel = this.determineAlertLevel(predictions, systemHealthScore, regressionRisk);

    return {
      timestamp: new Date(),
      predictions,
      burnRateAnalysis,
      systemHealthScore,
      alertLevel,
      regressionRisk,
    };
  }

  /**
   * Generate predictions for key performance metrics
   */
  private generatePredictions(): PerformancePrediction[] {
    const predictions: PerformancePrediction[] = [];

    // Execution Time Prediction
    predictions.push(this.predictMetric(
      'executionTime',
      this.samples.map(s => s.executionTime),
      'Response time regression detected'
    ));

    // Memory Usage Prediction
    predictions.push(this.predictMetric(
      'memoryUsage',
      this.samples.map(s => s.memoryUsage),
      'Memory leak detected'
    ));

    // CPU Usage Prediction
    predictions.push(this.predictMetric(
      'cpuUsage',
      this.samples.map(s => s.cpuUsage),
      'CPU usage trending upward'
    ));

    // System Load Prediction
    predictions.push(this.predictMetric(
      'systemLoad',
      this.samples.map(s => s.systemLoad),
      'System load increasing'
    ));

    return predictions;
  }

  /**
   * Predict individual metric using P90 analysis and trend detection
   */
  private predictMetric(metricName: string, values: number[], alertMessage: string): PerformancePrediction {
    if (values.length === 0) {
      return {
        metric: metricName,
        predictedValue: 0,
        confidence: 0,
        trend: 'stable',
        regressionDetected: false,
        recommendations: ['Insufficient data for prediction'],
      };
    }

    // Calculate P90 value (90th percentile)
    const sortedValues = values.slice().sort((a, b) => a - b);
    const p90Index = Math.floor(sortedValues.length * (this.config.confidence.threshold / 100));
    const p90Value = sortedValues[p90Index] || sortedValues[sortedValues.length - 1];

    // Trend analysis
    const trend = this.analyzeTrend(values);
    const recentAvg = this.calculateRecentAverage(values, 24); // Last 24 samples
    const historicalAvg = this.calculateAverage(values);

    // Regression detection
    const regressionDetected = this.detectRegression(recentAvg, historicalAvg, metricName);

    // Predict next value using linear regression
    const predictedValue = this.predictNextValue(values);

    // Generate recommendations
    const recommendations = this.generateRecommendations(metricName, trend, regressionDetected, predictedValue, p90Value);

    // Calculate time to threshold breach
    const timeToThreshold = this.calculateTimeToThreshold(values, p90Value, trend);

    return {
      metric: metricName,
      predictedValue,
      confidence: this.calculateConfidence(values),
      trend,
      regressionDetected,
      timeToThreshold,
      recommendations,
    };
  }

  /**
   * Analyze burn rate for resource consumption
   */
  private analyzeBurnRate(): BurnRateAnalysis {
    if (this.samples.length < 2) {
      return {
        currentRate: 0,
        averageRate: 0,
        confidence: 0,
        volatility: 0,
      };
    }

    // Calculate hourly burn rates for different metrics
    const memoryRates = this.calculateHourlyRates(this.samples.map(s => s.memoryUsage));
    const cpuRates = this.calculateHourlyRates(this.samples.map(s => s.cpuUsage));

    const currentRate = memoryRates[memoryRates.length - 1] || 0;
    const averageRate = this.calculateAverage(memoryRates);
    const volatility = this.calculateStandardDeviation(memoryRates) / Math.max(averageRate, 1);

    // Predict resource exhaustion
    const predictedExhaustion = this.predictResourceExhaustion(memoryRates);

    return {
      currentRate,
      averageRate,
      predictedExhaustion,
      confidence: this.calculateConfidence(memoryRates),
      volatility,
    };
  }

  /**
   * Calculate hourly rates of change
   */
  private calculateHourlyRates(values: number[]): number[] {
    const rates: number[] = [];
    
    for (let i = 1; i < values.length; i++) {
      const timeDiff = (this.samples[i].timestamp.getTime() - this.samples[i - 1].timestamp.getTime()) / (1000 * 3600); // hours
      const valueDiff = values[i] - values[i - 1];
      
      if (timeDiff > 0) {
        rates.push(valueDiff / timeDiff);
      }
    }

    return rates;
  }

  /**
   * Analyze trend using linear regression
   */
  private analyzeTrend(values: number[]): 'increasing' | 'decreasing' | 'stable' {
    if (values.length < 3) return 'stable';

    const n = values.length;
    const xValues = Array.from({ length: n }, (_, i) => i);
    
    // Calculate linear regression slope
    const xMean = (n - 1) / 2;
    const yMean = this.calculateAverage(values);
    
    let numerator = 0;
    let denominator = 0;
    
    for (let i = 0; i < n; i++) {
      numerator += (xValues[i] - xMean) * (values[i] - yMean);
      denominator += (xValues[i] - xMean) ** 2;
    }
    
    const slope = denominator === 0 ? 0 : numerator / denominator;
    const threshold = Math.abs(yMean) * 0.01; // 1% threshold
    
    if (slope > threshold) return 'increasing';
    if (slope < -threshold) return 'decreasing';
    return 'stable';
  }

  /**
   * Detect performance regression
   */
  private detectRegression(recentAvg: number, historicalAvg: number, metricName: string): boolean {
    const changePercent = ((recentAvg - historicalAvg) / Math.max(historicalAvg, 1)) * 100;
    
    switch (metricName) {
      case 'executionTime':
        return changePercent > this.config.thresholds.responseTimeRegression;
      case 'memoryUsage':
        return changePercent > this.config.thresholds.memoryLeakDetection;
      case 'cpuUsage':
      case 'systemLoad':
        return changePercent > this.config.thresholds.performanceDegradation;
      default:
        return changePercent > this.config.thresholds.performanceDegradation;
    }
  }

  /**
   * Predict next value using linear regression
   */
  private predictNextValue(values: number[]): number {
    if (values.length < 2) return values[0] || 0;

    const n = values.length;
    const xValues = Array.from({ length: n }, (_, i) => i);
    
    // Linear regression
    const xMean = (n - 1) / 2;
    const yMean = this.calculateAverage(values);
    
    let numerator = 0;
    let denominator = 0;
    
    for (let i = 0; i < n; i++) {
      numerator += (xValues[i] - xMean) * (values[i] - yMean);
      denominator += (xValues[i] - xMean) ** 2;
    }
    
    const slope = denominator === 0 ? 0 : numerator / denominator;
    const intercept = yMean - slope * xMean;
    
    // Predict next value (x = n)
    return slope * n + intercept;
  }

  /**
   * Calculate confidence level for predictions
   */
  private calculateConfidence(values: number[]): number {
    if (values.length < this.config.analysisWindow.minSamples) {
      return (values.length / this.config.analysisWindow.minSamples) * 100;
    }

    // Calculate R-squared for confidence
    const mean = this.calculateAverage(values);
    const variance = values.reduce((sum, val) => sum + (val - mean) ** 2, 0) / values.length;
    const stdDev = Math.sqrt(variance);
    
    // Higher confidence for lower variance relative to mean
    const coefficientOfVariation = stdDev / Math.max(Math.abs(mean), 1);
    return Math.max(0, Math.min(100, (1 - coefficientOfVariation) * 100));
  }

  /**
   * Calculate time until threshold breach
   */
  private calculateTimeToThreshold(values: number[], threshold: number, trend: string): number | undefined {
    if (trend === 'stable' || values.length < 2) return undefined;

    const currentValue = values[values.length - 1];
    const rate = this.calculateHourlyRates(values);
    const avgRate = this.calculateAverage(rate);

    if (avgRate <= 0 && trend === 'increasing') return undefined;
    if (avgRate >= 0 && trend === 'decreasing') return undefined;

    const timeHours = Math.abs((threshold - currentValue) / avgRate);
    return timeHours * 3600000; // Convert to milliseconds
  }

  /**
   * Generate recommendations based on predictions
   */
  private generateRecommendations(
    metricName: string,
    trend: string,
    regressionDetected: boolean,
    predictedValue: number,
    threshold: number
  ): string[] {
    const recommendations: string[] = [];

    if (regressionDetected) {
      switch (metricName) {
        case 'executionTime':
          recommendations.push('Consider optimizing algorithms or reducing computational complexity');
          recommendations.push('Review recent code changes for performance bottlenecks');
          break;
        case 'memoryUsage':
          recommendations.push('Investigate potential memory leaks in agent lifecycle management');
          recommendations.push('Consider implementing memory pooling or garbage collection optimization');
          break;
        case 'cpuUsage':
          recommendations.push('Consider scaling horizontally or optimizing CPU-intensive operations');
          recommendations.push('Review agent coordination efficiency');
          break;
        case 'systemLoad':
          recommendations.push('Consider load balancing or infrastructure scaling');
          break;
      }
    }

    if (predictedValue > threshold) {
      recommendations.push(`Predicted ${metricName} will exceed threshold soon`);
      recommendations.push('Consider proactive scaling or optimization measures');
    }

    if (trend === 'increasing') {
      recommendations.push(`${metricName} is trending upward - monitor closely`);
    }

    return recommendations.length > 0 ? recommendations : ['Performance metrics within normal range'];
  }

  /**
   * Calculate system health score
   */
  private calculateSystemHealthScore(): number {
    if (this.samples.length === 0) return 50; // Neutral score

    const latest = this.samples[this.samples.length - 1];
    const historical = this.samples.slice(0, -1);

    if (historical.length === 0) return 75; // Good score for single sample

    // Calculate health factors
    const executionTimeHealth = this.calculateMetricHealth(latest.executionTime, historical.map(s => s.executionTime));
    const memoryHealth = this.calculateMetricHealth(latest.memoryUsage, historical.map(s => s.memoryUsage));
    const cpuHealth = this.calculateMetricHealth(latest.cpuUsage, historical.map(s => s.cpuUsage));
    const systemLoadHealth = this.calculateMetricHealth(latest.systemLoad, historical.map(s => s.systemLoad));

    // Weighted average (execution time and memory are more important)
    return Math.round(
      (executionTimeHealth * 0.3) +
      (memoryHealth * 0.3) +
      (cpuHealth * 0.2) +
      (systemLoadHealth * 0.2)
    );
  }

  /**
   * Calculate health score for individual metric
   */
  private calculateMetricHealth(current: number, historical: number[]): number {
    if (historical.length === 0) return 75;

    const mean = this.calculateAverage(historical);
    const stdDev = this.calculateStandardDeviation(historical);
    
    // Z-score calculation
    const zScore = stdDev === 0 ? 0 : (current - mean) / stdDev;
    
    // Convert z-score to health score (lower z-score = better health for performance metrics)
    const healthScore = Math.max(0, Math.min(100, 100 - Math.abs(zScore) * 20));
    
    return healthScore;
  }

  /**
   * Calculate regression risk score
   */
  private calculateRegressionRisk(): number {
    if (this.samples.length < this.config.analysisWindow.minSamples) return 25; // Low risk due to insufficient data

    const recentSamples = this.samples.slice(-24); // Last 24 samples
    const historicalSamples = this.samples.slice(0, -24);

    if (historicalSamples.length === 0) return 25;

    // Calculate risk factors
    const executionTimeRisk = this.calculateMetricRegressionRisk(
      recentSamples.map(s => s.executionTime),
      historicalSamples.map(s => s.executionTime)
    );
    const memoryRisk = this.calculateMetricRegressionRisk(
      recentSamples.map(s => s.memoryUsage),
      historicalSamples.map(s => s.memoryUsage)
    );

    return Math.round((executionTimeRisk + memoryRisk) / 2);
  }

  /**
   * Calculate regression risk for individual metric
   */
  private calculateMetricRegressionRisk(recent: number[], historical: number[]): number {
    const recentAvg = this.calculateAverage(recent);
    const historicalAvg = this.calculateAverage(historical);
    
    const changePercent = ((recentAvg - historicalAvg) / Math.max(historicalAvg, 1)) * 100;
    
    // Convert change percentage to risk score
    return Math.max(0, Math.min(100, Math.abs(changePercent) * 5));
  }

  /**
   * Determine alert level based on predictions and health score
   */
  private determineAlertLevel(
    predictions: PerformancePrediction[],
    healthScore: number,
    regressionRisk: number
  ): 'normal' | 'warning' | 'critical' {
    const criticalRegressions = predictions.filter(p => p.regressionDetected).length;
    
    if (healthScore < 30 || regressionRisk > 80 || criticalRegressions > 2) {
      return 'critical';
    }
    
    if (healthScore < 60 || regressionRisk > 50 || criticalRegressions > 0) {
      return 'warning';
    }
    
    return 'normal';
  }

  /**
   * Utility functions
   */
  private calculateAverage(values: number[]): number {
    return values.length > 0 ? values.reduce((sum, val) => sum + val, 0) / values.length : 0;
  }

  private calculateRecentAverage(values: number[], count: number): number {
    const recent = values.slice(-count);
    return this.calculateAverage(recent);
  }

  private calculateStandardDeviation(values: number[]): number {
    if (values.length <= 1) return 0;
    
    const mean = this.calculateAverage(values);
    const variance = values.reduce((sum, val) => sum + (val - mean) ** 2, 0) / (values.length - 1);
    return Math.sqrt(variance);
  }

  private predictResourceExhaustion(rates: number[]): Date | undefined {
    if (rates.length === 0) return undefined;

    const avgRate = this.calculateAverage(rates);
    if (avgRate <= 0) return undefined;

    // Assume 100% is exhaustion point (this would be configurable based on metric)
    const currentUsage = this.samples[this.samples.length - 1]?.memoryUsage || 0;
    const maxUsage = currentUsage * 2; // Simplified assumption
    
    const hoursToExhaustion = (maxUsage - currentUsage) / avgRate;
    
    if (hoursToExhaustion <= 0 || hoursToExhaustion > 24 * 7) return undefined; // Don't predict beyond 1 week
    
    return new Date(Date.now() + hoursToExhaustion * 3600000);
  }

  private createEmptyForecast(reason: string): PerformanceForecast {
    return {
      timestamp: new Date(),
      predictions: [{
        metric: 'system',
        predictedValue: 0,
        confidence: 0,
        trend: 'stable',
        regressionDetected: false,
        recommendations: [reason],
      }],
      burnRateAnalysis: {
        currentRate: 0,
        averageRate: 0,
        confidence: 0,
        volatility: 0,
      },
      systemHealthScore: 50,
      alertLevel: 'normal',
      regressionRisk: 25,
    };
  }

  /**
   * Get current prediction statistics
   */
  getStatistics(): {
    sampleCount: number;
    analysisWindow: number;
    oldestSample?: Date;
    newestSample?: Date;
    config: PredictionConfig;
  } {
    return {
      sampleCount: this.samples.length,
      analysisWindow: this.config.analysisWindow.hours,
      oldestSample: this.samples[0]?.timestamp,
      newestSample: this.samples[this.samples.length - 1]?.timestamp,
      config: this.config,
    };
  }

  /**
   * Clear all samples (useful for testing or reset)
   */
  clearSamples(): void {
    this.samples = [];
  }
}