/**
 * Rich Terminal Performance Monitor
 * Inspired by Claude Code Usage Monitor's beautiful real-time interface
 * Enterprise-grade terminal dashboard with ML predictions and OpenTelemetry integration
 */

import { EventEmitter } from 'events';
import * as readline from 'readline';
import { OpenTelemetryCollector } from '../telemetry/OpenTelemetryCollector.js';
import { MLPerformancePredictor, PerformanceSample, PerformanceForecast } from '../prediction/MLPerformancePredictor.js';

export interface TerminalTheme {
  name: string;
  colors: {
    primary: string;
    secondary: string;
    success: string;
    warning: string;
    error: string;
    info: string;
    background: string;
    text: string;
    muted: string;
    accent: string;
  };
  symbols: {
    success: string;
    warning: string;
    error: string;
    info: string;
    arrow: string;
    bullet: string;
    spinner: string[];
  };
}

export interface TerminalConfig {
  refreshRate: number;           // Refresh rate in Hz (0.1-20)
  theme: 'dark' | 'light' | 'auto' | 'claude';
  showSystemMetrics: boolean;
  showAgentMetrics: boolean;
  showPredictions: boolean;
  showAlerts: boolean;
  compactMode: boolean;
  enableAnimations: boolean;
  autoScroll: boolean;
  maxLogLines: number;
}

export interface DashboardMetrics {
  timestamp: Date;
  system: {
    cpu: number;
    memory: {
      used: number;
      total: number;
      percentage: number;
    };
    disk: {
      used: number;
      total: number;
      percentage: number;
    };
    network: {
      bytesIn: number;
      bytesOut: number;
    };
  };
  agents: {
    active: number;
    total: number;
    avgExecutionTime: number;
    avgMemoryUsage: number;
    taskQueue: number;
    errorRate: number;
  };
  performance: {
    score: number;
    regressionRisk: number;
    alertLevel: 'normal' | 'warning' | 'critical';
    baseline: number;
    current: number;
  };
  hiveMind: {
    coordinationLatency: number;
    taskThroughput: number;
    efficiency: number;
  };
}

export interface LogEntry {
  timestamp: Date;
  level: 'info' | 'warning' | 'error' | 'success';
  source: string;
  message: string;
  details?: any;
}

export class RichTerminalMonitor extends EventEmitter {
  private config: TerminalConfig;
  private theme: TerminalTheme;
  private isRunning = false;
  private refreshInterval: NodeJS.Timeout | null = null;
  private spinnerIndex = 0;
  private startTime = Date.now();
  private frameCount = 0;
  private lastMetrics: DashboardMetrics | null = null;
  private logEntries: LogEntry[] = [];
  private predictor: MLPerformancePredictor;
  private collector: OpenTelemetryCollector;
  private currentForecast: PerformanceForecast | null = null;

  // Terminal control
  private readonly CLEAR_SCREEN = '\x1b[2J\x1b[H';
  private readonly HIDE_CURSOR = '\x1b[?25l';
  private readonly SHOW_CURSOR = '\x1b[?25h';
  private readonly SAVE_CURSOR = '\x1b[s';
  private readonly RESTORE_CURSOR = '\x1b[u';

  constructor(
    config: Partial<TerminalConfig> = {},
    predictor: MLPerformancePredictor,
    collector: OpenTelemetryCollector
  ) {
    super();
    
    this.config = {
      refreshRate: config.refreshRate || 3, // 3Hz = 333ms refresh
      theme: config.theme || 'claude',
      showSystemMetrics: config.showSystemMetrics ?? true,
      showAgentMetrics: config.showAgentMetrics ?? true,
      showPredictions: config.showPredictions ?? true,
      showAlerts: config.showAlerts ?? true,
      compactMode: config.compactMode ?? false,
      enableAnimations: config.enableAnimations ?? true,
      autoScroll: config.autoScroll ?? true,
      maxLogLines: config.maxLogLines || 100,
    };

    this.theme = this.getTheme(this.config.theme);
    this.predictor = predictor;
    this.collector = collector;

    // Setup terminal
    this.setupTerminal();
  }

  /**
   * Start the real-time monitoring dashboard
   */
  async start(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;
    this.startTime = Date.now();
    this.frameCount = 0;

    // Hide cursor and clear screen
    process.stdout.write(this.HIDE_CURSOR + this.CLEAR_SCREEN);

    // Setup graceful shutdown
    this.setupShutdownHandlers();

    // Start refresh loop
    const refreshMs = Math.floor(1000 / this.config.refreshRate);
    this.refreshInterval = setInterval(() => {
      this.render();
    }, refreshMs);

    // Initial render
    this.render();

    this.log('info', 'monitor', 'Rich Terminal Monitor started', {
      refreshRate: this.config.refreshRate,
      theme: this.config.theme,
    });
  }

  /**
   * Stop the monitoring dashboard
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }

    // Show cursor and clear screen
    process.stdout.write(this.SHOW_CURSOR + this.CLEAR_SCREEN);

    this.log('info', 'monitor', 'Rich Terminal Monitor stopped');
  }

  /**
   * Update metrics data
   */
  updateMetrics(metrics: DashboardMetrics): void {
    this.lastMetrics = metrics;

    // Add sample to ML predictor
    const sample: PerformanceSample = {
      timestamp: metrics.timestamp,
      executionTime: metrics.agents.avgExecutionTime,
      memoryUsage: metrics.system.memory.used,
      cpuUsage: metrics.system.cpu,
      agentCount: metrics.agents.active,
      taskComplexity: metrics.agents.taskQueue,
      systemLoad: (metrics.system.cpu + metrics.system.memory.percentage) / 2,
    };

    this.predictor.addSample(sample);

    // Generate new forecast
    this.currentForecast = this.predictor.generateForecast();

    this.emit('metrics-updated', metrics);
  }

  /**
   * Add log entry
   */
  log(level: LogEntry['level'], source: string, message: string, details?: any): void {
    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      source,
      message,
      details,
    };

    this.logEntries.push(entry);

    // Maintain max log lines
    if (this.logEntries.length > this.config.maxLogLines) {
      this.logEntries = this.logEntries.slice(-this.config.maxLogLines);
    }

    this.emit('log-entry', entry);
  }

  /**
   * Main render function
   */
  private render(): void {
    if (!this.isRunning) return;

    this.frameCount++;
    const uptime = Date.now() - this.startTime;

    try {
      // Save cursor position
      process.stdout.write(this.SAVE_CURSOR);

      // Clear and move to top
      process.stdout.write(this.CLEAR_SCREEN);

      let output = '';

      // Header
      output += this.renderHeader(uptime);
      output += '\n';

      // System Overview
      if (this.config.showSystemMetrics && this.lastMetrics) {
        output += this.renderSystemMetrics();
        output += '\n';
      }

      // Agent Performance
      if (this.config.showAgentMetrics && this.lastMetrics) {
        output += this.renderAgentMetrics();
        output += '\n';
      }

      // ML Predictions
      if (this.config.showPredictions && this.currentForecast) {
        output += this.renderPredictions();
        output += '\n';
      }

      // Alerts and Status
      if (this.config.showAlerts) {
        output += this.renderAlerts();
        output += '\n';
      }

      // Recent Logs
      output += this.renderLogs();

      // Footer
      output += this.renderFooter();

      // Write to terminal
      process.stdout.write(output);

      // Update spinner
      if (this.config.enableAnimations) {
        this.spinnerIndex = (this.spinnerIndex + 1) % this.theme.symbols.spinner.length;
      }

    } catch (error) {
      // Fallback error display
      process.stdout.write(this.colorize('error', `Render error: ${error}`));
    }
  }

  /**
   * Render header with title and status
   */
  private renderHeader(uptime: number): string {
    const spinner = this.config.enableAnimations ? this.theme.symbols.spinner[this.spinnerIndex] : '';
    const uptimeStr = this.formatDuration(uptime);
    const fps = this.frameCount / (uptime / 1000);

    const title = this.colorize('primary', '█ Claude Flow Performance Monitor');
    const status = this.isRunning ? this.colorize('success', `${spinner} LIVE`) : this.colorize('error', '● STOPPED');
    const stats = this.colorize('muted', `uptime: ${uptimeStr} │ fps: ${fps.toFixed(1)} │ frame: ${this.frameCount}`);

    const width = process.stdout.columns || 80;
    const padding = Math.max(0, width - this.stripAnsi(title + status + stats).length - 4);

    return `${title} ${' '.repeat(padding)} ${status}\n${stats}`;
  }

  /**
   * Render system metrics section
   */
  private renderSystemMetrics(): string {
    if (!this.lastMetrics) return '';

    const { system } = this.lastMetrics;
    let output = this.colorize('secondary', '┌─ System Performance\n');

    // CPU Usage
    const cpuBar = this.createProgressBar(system.cpu, 100, 20);
    const cpuColor = system.cpu > 80 ? 'error' : system.cpu > 60 ? 'warning' : 'success';
    output += `├─ CPU:    ${this.colorize(cpuColor, cpuBar)} ${system.cpu.toFixed(1)}%\n`;

    // Memory Usage
    const memBar = this.createProgressBar(system.memory.percentage, 100, 20);
    const memColor = system.memory.percentage > 85 ? 'error' : system.memory.percentage > 70 ? 'warning' : 'success';
    const memText = `${this.formatBytes(system.memory.used)}/${this.formatBytes(system.memory.total)}`;
    output += `├─ Memory: ${this.colorize(memColor, memBar)} ${system.memory.percentage.toFixed(1)}% (${memText})\n`;

    // Disk Usage
    const diskBar = this.createProgressBar(system.disk.percentage, 100, 20);
    const diskColor = system.disk.percentage > 90 ? 'error' : system.disk.percentage > 75 ? 'warning' : 'success';
    const diskText = `${this.formatBytes(system.disk.used)}/${this.formatBytes(system.disk.total)}`;
    output += `├─ Disk:   ${this.colorize(diskColor, diskBar)} ${system.disk.percentage.toFixed(1)}% (${diskText})\n`;

    // Network I/O
    const netIn = this.formatBytes(system.network.bytesIn);
    const netOut = this.formatBytes(system.network.bytesOut);
    output += `└─ Network: ${this.colorize('info', '↓')} ${netIn}/s ${this.colorize('accent', '↑')} ${netOut}/s\n`;

    return output;
  }

  /**
   * Render agent metrics section
   */
  private renderAgentMetrics(): string {
    if (!this.lastMetrics) return '';

    const { agents, hiveMind } = this.lastMetrics;
    let output = this.colorize('secondary', '┌─ Agent Performance\n');

    // Active Agents
    output += `├─ Active Agents: ${this.colorize('primary', agents.active.toString())}/${agents.total}\n`;

    // Execution Time
    const execTime = agents.avgExecutionTime.toFixed(0);
    const execColor = agents.avgExecutionTime > 2000 ? 'error' : agents.avgExecutionTime > 1000 ? 'warning' : 'success';
    output += `├─ Avg Execution: ${this.colorize(execColor, `${execTime}ms`)}\n`;

    // Memory Usage
    const memUsage = this.formatBytes(agents.avgMemoryUsage);
    output += `├─ Avg Memory:    ${this.colorize('info', memUsage)}\n`;

    // Task Queue
    const queueColor = agents.taskQueue > 50 ? 'error' : agents.taskQueue > 20 ? 'warning' : 'success';
    output += `├─ Task Queue:    ${this.colorize(queueColor, agents.taskQueue.toString())}\n`;

    // Error Rate
    const errorColor = agents.errorRate > 5 ? 'error' : agents.errorRate > 2 ? 'warning' : 'success';
    output += `├─ Error Rate:    ${this.colorize(errorColor, `${agents.errorRate.toFixed(1)}%`)}\n`;

    // Hive Mind Efficiency
    const effColor = hiveMind.efficiency > 80 ? 'success' : hiveMind.efficiency > 60 ? 'warning' : 'error';
    output += `├─ Coordination:  ${this.colorize(effColor, `${hiveMind.efficiency.toFixed(1)}%`)} (${hiveMind.coordinationLatency}ms)\n`;
    output += `└─ Throughput:    ${this.colorize('accent', `${hiveMind.taskThroughput.toFixed(1)}`)} tasks/sec\n`;

    return output;
  }

  /**
   * Render ML predictions section
   */
  private renderPredictions(): string {
    if (!this.currentForecast) return '';

    const forecast = this.currentForecast;
    let output = this.colorize('secondary', '┌─ ML Performance Predictions\n');

    // System Health Score
    const healthColor = forecast.systemHealthScore > 80 ? 'success' : 
                       forecast.systemHealthScore > 60 ? 'warning' : 'error';
    const healthBar = this.createProgressBar(forecast.systemHealthScore, 100, 15);
    output += `├─ Health Score:  ${this.colorize(healthColor, healthBar)} ${forecast.systemHealthScore}/100\n`;

    // Regression Risk
    const riskColor = forecast.regressionRisk < 30 ? 'success' :
                     forecast.regressionRisk < 60 ? 'warning' : 'error';
    const riskBar = this.createProgressBar(forecast.regressionRisk, 100, 15);
    output += `├─ Regression Risk: ${this.colorize(riskColor, riskBar)} ${forecast.regressionRisk.toFixed(1)}%\n`;

    // Alert Level
    const alertIcon = forecast.alertLevel === 'normal' ? this.theme.symbols.success :
                     forecast.alertLevel === 'warning' ? this.theme.symbols.warning :
                     this.theme.symbols.error;
    const alertColor = forecast.alertLevel === 'normal' ? 'success' :
                      forecast.alertLevel === 'warning' ? 'warning' : 'error';
    output += `├─ Alert Level:   ${this.colorize(alertColor, alertIcon + ' ' + forecast.alertLevel.toUpperCase())}\n`;

    // Burn Rate Analysis
    if (forecast.burnRateAnalysis.predictedExhaustion) {
      const timeToExhaustion = this.formatDuration(
        forecast.burnRateAnalysis.predictedExhaustion.getTime() - Date.now()
      );
      output += `├─ Predicted Exhaustion: ${this.colorize('warning', timeToExhaustion)}\n`;
    }

    // Key Predictions
    const execTimePred = forecast.predictions.find(p => p.metric === 'executionTime');
    if (execTimePred && execTimePred.regressionDetected) {
      output += `├─ ${this.colorize('error', '⚠')} Response time regression detected\n`;
    }

    const memoryPred = forecast.predictions.find(p => p.metric === 'memoryUsage');
    if (memoryPred && memoryPred.trend === 'increasing') {
      output += `├─ ${this.colorize('warning', '↗')} Memory usage trending upward\n`;
    }

    // Confidence
    const avgConfidence = forecast.predictions.reduce((sum, p) => sum + p.confidence, 0) / forecast.predictions.length;
    const confColor = avgConfidence > 80 ? 'success' : avgConfidence > 60 ? 'warning' : 'error';
    output += `└─ Confidence:    ${this.colorize(confColor, `${avgConfidence.toFixed(1)}%`)}\n`;

    return output;
  }

  /**
   * Render alerts section
   */
  private renderAlerts(): string {
    let output = this.colorize('secondary', '┌─ Alerts & Recommendations\n');

    if (this.currentForecast && this.currentForecast.predictions.length > 0) {
      const criticalPredictions = this.currentForecast.predictions.filter(p => p.regressionDetected);
      
      if (criticalPredictions.length > 0) {
        criticalPredictions.slice(0, 3).forEach(pred => {
          const icon = this.theme.symbols.error;
          output += `├─ ${this.colorize('error', icon)} ${pred.metric}: ${pred.recommendations[0] || 'Performance issue detected'}\n`;
        });
      } else {
        output += `├─ ${this.colorize('success', this.theme.symbols.success)} All performance metrics within normal range\n`;
      }
    }

    // Performance recommendations
    if (this.lastMetrics) {
      const recommendations = this.generateRecommendations();
      recommendations.slice(0, 2).forEach(rec => {
        output += `├─ ${this.colorize('info', this.theme.symbols.info)} ${rec}\n`;
      });
    }

    output += `└─ Last updated: ${this.colorize('muted', new Date().toLocaleTimeString())}\n`;

    return output;
  }

  /**
   * Render recent logs
   */
  private renderLogs(): string {
    let output = this.colorize('secondary', '┌─ Recent Activity\n');

    const recentLogs = this.logEntries.slice(-5).reverse();
    
    if (recentLogs.length === 0) {
      output += `├─ ${this.colorize('muted', 'No recent activity')}\n`;
    } else {
      recentLogs.forEach((entry, index) => {
        const icon = entry.level === 'error' ? this.theme.symbols.error :
                    entry.level === 'warning' ? this.theme.symbols.warning :
                    entry.level === 'success' ? this.theme.symbols.success :
                    this.theme.symbols.info;

        const levelColor = entry.level as keyof typeof this.theme.colors;
        const time = entry.timestamp.toLocaleTimeString();
        const prefix = index === recentLogs.length - 1 ? '└─' : '├─';
        
        output += `${prefix} ${this.colorize(levelColor, icon)} [${time}] ${entry.source}: ${entry.message}\n`;
      });
    }

    return output;
  }

  /**
   * Render footer with controls
   */
  private renderFooter(): string {
    const controls = [
      `${this.colorize('accent', 'q')} quit`,
      `${this.colorize('accent', 'r')} refresh`,
      `${this.colorize('accent', 'c')} clear logs`,
      `${this.colorize('accent', 't')} toggle theme`,
    ].join(' │ ');

    return `\n${this.colorize('muted', '─'.repeat(process.stdout.columns || 80))}\n${controls}`;
  }

  /**
   * Create a progress bar
   */
  private createProgressBar(value: number, max: number, width: number): string {
    const percentage = Math.min(100, Math.max(0, (value / max) * 100));
    const filled = Math.round((percentage / 100) * width);
    const empty = width - filled;

    const fillChar = '█';
    const emptyChar = '░';

    return fillChar.repeat(filled) + emptyChar.repeat(empty);
  }

  /**
   * Generate performance recommendations
   */
  private generateRecommendations(): string[] {
    if (!this.lastMetrics) return [];

    const recommendations: string[] = [];
    const { system, agents } = this.lastMetrics;

    if (system.cpu > 80) {
      recommendations.push('High CPU usage detected - consider horizontal scaling');
    }

    if (system.memory.percentage > 85) {
      recommendations.push('Memory usage critical - investigate memory leaks');
    }

    if (agents.errorRate > 5) {
      recommendations.push('High agent error rate - review error logs');
    }

    if (agents.taskQueue > 50) {
      recommendations.push('Task queue backlog - consider adding more agents');
    }

    if (recommendations.length === 0) {
      recommendations.push('System performance optimal');
    }

    return recommendations;
  }

  /**
   * Get theme configuration
   */
  private getTheme(themeName: string): TerminalTheme {
    const themes: Record<string, TerminalTheme> = {
      claude: {
        name: 'Claude',
        colors: {
          primary: '\x1b[38;2;255;140;0m',    // Claude orange
          secondary: '\x1b[38;2;100;100;100m', // Gray
          success: '\x1b[38;2;0;200;0m',       // Green
          warning: '\x1b[38;2;255;165;0m',     // Orange
          error: '\x1b[38;2;255;0;0m',         // Red
          info: '\x1b[38;2;0;150;255m',        // Blue
          background: '\x1b[48;2;20;20;20m',   // Dark
          text: '\x1b[38;2;240;240;240m',      // Light gray
          muted: '\x1b[38;2;120;120;120m',     // Muted gray
          accent: '\x1b[38;2;255;200;100m',    // Light orange
        },
        symbols: {
          success: '✓',
          warning: '⚠',
          error: '✗',
          info: 'ℹ',
          arrow: '→',
          bullet: '•',
          spinner: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
        },
      },
      dark: {
        name: 'Dark',
        colors: {
          primary: '\x1b[96m',     // Cyan
          secondary: '\x1b[37m',   // White
          success: '\x1b[92m',     // Bright green
          warning: '\x1b[93m',     // Bright yellow
          error: '\x1b[91m',       // Bright red
          info: '\x1b[94m',        // Bright blue
          background: '\x1b[40m',  // Black background
          text: '\x1b[97m',        // Bright white
          muted: '\x1b[90m',       // Dark gray
          accent: '\x1b[95m',      // Bright magenta
        },
        symbols: {
          success: '✓',
          warning: '!',
          error: '✗',
          info: 'i',
          arrow: '>',
          bullet: '•',
          spinner: ['|', '/', '-', '\\'],
        },
      },
    };

    return themes[themeName] || themes.claude;
  }

  /**
   * Apply color to text
   */
  private colorize(colorName: keyof TerminalTheme['colors'], text: string): string {
    const color = this.theme.colors[colorName];
    const reset = '\x1b[0m';
    return `${color}${text}${reset}`;
  }

  /**
   * Strip ANSI escape codes
   */
  private stripAnsi(text: string): string {
    return text.replace(/\x1b\[[0-9;]*m/g, '');
  }

  /**
   * Format bytes to human readable
   */
  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)}${units[unitIndex]}`;
  }

  /**
   * Format duration to human readable
   */
  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Setup terminal configuration
   */
  private setupTerminal(): void {
    // Enable raw mode for immediate input
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');

      // Handle keyboard input
      process.stdin.on('data', (key) => {
        const char = key.toString();
        
        switch (char) {
          case 'q':
          case '\u0003': // Ctrl+C
            this.stop();
            process.exit(0);
            break;
          case 'r':
            this.render();
            break;
          case 'c':
            this.logEntries = [];
            break;
          case 't':
            this.toggleTheme();
            break;
        }
      });
    }
  }

  /**
   * Setup graceful shutdown handlers
   */
  private setupShutdownHandlers(): void {
    const shutdown = () => {
      this.stop();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    process.on('exit', () => {
      process.stdout.write(this.SHOW_CURSOR);
    });
  }

  /**
   * Toggle between themes
   */
  private toggleTheme(): void {
    const themes = ['claude', 'dark'];
    const currentIndex = themes.indexOf(this.config.theme);
    const nextIndex = (currentIndex + 1) % themes.length;
    
    this.config.theme = themes[nextIndex] as any;
    this.theme = this.getTheme(this.config.theme);
    
    this.log('info', 'theme', `Switched to ${this.theme.name} theme`);
  }

  /**
   * Get current configuration
   */
  getConfig(): TerminalConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<TerminalConfig>): void {
    this.config = { ...this.config, ...newConfig };

    if (newConfig.theme) {
      this.theme = this.getTheme(newConfig.theme);
    }

    if (newConfig.refreshRate && this.refreshInterval) {
      clearInterval(this.refreshInterval);
      const refreshMs = Math.floor(1000 / newConfig.refreshRate);
      this.refreshInterval = setInterval(() => {
        this.render();
      }, refreshMs);
    }
  }
}