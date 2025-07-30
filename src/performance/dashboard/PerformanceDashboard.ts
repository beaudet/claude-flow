/**
 * Performance Dashboard Components with Visualization
 * Real-time performance metrics visualization and monitoring dashboard
 */

import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import {
  PerformanceMetrics,
  PerformanceReport,
  AlertHistory,
  BundleAnalysisResult,
  MemoryLeakReport,
  RegressionTestResult,
  PerformanceConfig,
  TrendAnalysis
} from '../types.js';

export interface DashboardConfig {
  port: number;
  host: string;
  enableAuth: boolean;
  authToken?: string;
  updateInterval: number;
  retentionPeriod: number;
  enableRealtime: boolean;
  staticAssets: {
    enabled: boolean;
    path: string;
  };
}

export interface DashboardData {
  timestamp: number;
  metrics: PerformanceMetrics;
  alerts: AlertHistory[];
  bundleAnalysis?: BundleAnalysisResult;
  memoryReport?: MemoryLeakReport;
  regressionResults?: RegressionTestResult[];
  trends: TrendAnalysis[];
  summary: DashboardSummary;
}

export interface DashboardSummary {
  status: 'healthy' | 'warning' | 'critical';
  activeAlerts: number;
  criticalAlerts: number;
  performanceScore: number;
  memoryUsage: number;
  cpuUsage: number;
  bundleSize: number;
  lastUpdate: number;
  uptime: number;
}

export interface ChartDataPoint {
  timestamp: number;
  value: number;
  label?: string;
  category?: string;
}

export interface ChartConfig {
  type: 'line' | 'area' | 'bar' | 'pie' | 'gauge';
  title: string;
  yAxisLabel?: string;
  xAxisLabel?: string;
  colors?: string[];
  animations?: boolean;
  realtime?: boolean;
  maxDataPoints?: number;
}

export class PerformanceDashboard extends EventEmitter {
  private server: any = null;
  private wsServer: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();
  private config: DashboardConfig;
  private performanceConfig: PerformanceConfig;
  private dashboardData: DashboardData;
  private dataHistory: DashboardData[] = [];
  private updateTimer: NodeJS.Timeout | null = null;
  private startTime: number = Date.now();

  constructor(
    config: Partial<DashboardConfig> = {},
    performanceConfig: Partial<PerformanceConfig> = {}
  ) {
    super();

    this.config = {
      port: 3001,
      host: 'localhost',
      enableAuth: false,
      updateInterval: 5000, // 5 seconds
      retentionPeriod: 86400000, // 24 hours
      enableRealtime: true,
      staticAssets: {
        enabled: true,
        path: path.join(__dirname, 'static')
      },
      ...config
    };

    this.performanceConfig = {
      enabled: true,
      baseline: {
        autoUpdate: false,
        retentionDays: 30,
        comparisonWindow: 7
      },
      thresholds: {
        memoryUsage: 500 * 1024 * 1024,
        cpuUsage: 80,
        responseTime: 5000,
        bundleSize: 10 * 1024 * 1024,
        regressionPercent: 10
      },
      alerts: {
        enabled: true,
        channels: [],
        debounceMs: 30000,
        aggregationWindow: 300000
      },
      monitoring: {
        interval: 5000,
        retentionDays: 7,
        batchSize: 100,
        enableProfiling: false
      },
      bundleAnalysis: {
        enabled: true,
        trackDependencies: true,
        analyzeTreeshaking: true,
        findDuplicates: true,
        detectUnusedCode: true
      },
      ...performanceConfig
    };

    this.dashboardData = this.createInitialData();
  }

  /**
   * Start the dashboard server
   */
  async start(): Promise<void> {
    try {
      // Create HTTP server
      this.server = createServer((req, res) => {
        this.handleHttpRequest(req, res);
      });

      // Setup WebSocket server for real-time updates
      if (this.config.enableRealtime) {
        this.wsServer = new WebSocketServer({ server: this.server });
        this.setupWebSocketHandlers();
      }

      // Start server
      await new Promise<void>((resolve, reject) => {
        this.server.listen(this.config.port, this.config.host, () => {
          console.log(`Performance Dashboard started on http://${this.config.host}:${this.config.port}`);
          resolve();
        });
        
        this.server.on('error', reject);
      });

      // Start data updates
      this.startDataUpdates();

      this.emit('started', {
        host: this.config.host,
        port: this.config.port,
        realtime: this.config.enableRealtime
      });

    } catch (error) {
      this.emit('error', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Stop the dashboard server
   */
  async stop(): Promise<void> {
    // Stop data updates
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }

    // Close WebSocket connections
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.close();
      }
    });
    this.clients.clear();

    // Close servers
    if (this.wsServer) {
      this.wsServer.close();
      this.wsServer = null;
    }

    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server.close(() => resolve());
      });
      this.server = null;
    }

    this.emit('stopped');
  }

  /**
   * Update dashboard with new performance data
   */
  updateData(data: Partial<DashboardData>): void {
    this.dashboardData = {
      ...this.dashboardData,
      ...data,
      timestamp: Date.now()
    };

    // Update summary
    this.dashboardData.summary = this.calculateSummary();

    // Store in history
    this.dataHistory.push({ ...this.dashboardData });

    // Clean up old data
    const cutoff = Date.now() - this.config.retentionPeriod;
    this.dataHistory = this.dataHistory.filter(d => d.timestamp > cutoff);

    // Broadcast to WebSocket clients
    this.broadcastUpdate();

    this.emit('dataUpdated', this.dashboardData);
  }

  /**
   * Get current dashboard data
   */
  getCurrentData(): DashboardData {
    return { ...this.dashboardData };
  }

  /**
   * Get historical data for charts
   */
  getHistoricalData(metric: string, timeRange: number = 3600000): ChartDataPoint[] {
    const cutoff = Date.now() - timeRange;
    const filteredData = this.dataHistory.filter(d => d.timestamp > cutoff);

    return filteredData.map(data => ({
      timestamp: data.timestamp,
      value: this.extractMetricValue(data, metric),
      label: new Date(data.timestamp).toLocaleTimeString()
    })).filter(point => point.value !== null);
  }

  /**
   * Get performance trends
   */
  getTrends(timeRange: number = 3600000): TrendAnalysis[] {
    const data = this.getHistoricalData('metrics.memoryUsage.heapUsed', timeRange);
    if (data.length < 10) return [];

    // Calculate trends for various metrics
    const metrics = [
      'metrics.memoryUsage.heapUsed',
      'metrics.cpuUsage.utilizationPercent',
      'metrics.duration'
    ];

    return metrics.map(metric => {
      const points = this.getHistoricalData(metric, timeRange);
      if (points.length < 5) return null;

      const trend = this.calculateTrend(points);
      return {
        metric: metric.split('.').pop() || metric,
        period: timeRange,
        direction: trend.slope > 0 ? 'up' : trend.slope < 0 ? 'down' : 'stable',
        rate: Math.abs(trend.slope),
        confidence: trend.confidence,
        forecast: this.forecastValue(points, 300000), // 5 minutes ahead
        seasonality: false // Would need more sophisticated analysis
      };
    }).filter(trend => trend !== null) as TrendAnalysis[];
  }

  private async handleHttpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const pathname = url.pathname;

    // Authentication check
    if (this.config.enableAuth && !this.isAuthenticated(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    try {
      // API endpoints
      if (pathname.startsWith('/api/')) {
        await this.handleApiRequest(pathname, req, res);
        return;
      }

      // Static files
      if (this.config.staticAssets.enabled) {
        await this.handleStaticFile(pathname, res);
        return;
      }

      // Default dashboard HTML
      await this.serveDashboardHTML(res);

    } catch (error) {
      console.error('HTTP request error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  }

  private async handleApiRequest(pathname: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    switch (pathname) {
      case '/api/dashboard':
        res.writeHead(200);
        res.end(JSON.stringify(this.dashboardData));
        break;

      case '/api/metrics/current':
        res.writeHead(200);
        res.end(JSON.stringify(this.dashboardData.metrics));
        break;

      case '/api/metrics/history':
        const timeRange = parseInt(new URL(req.url || '/', `http://${req.headers.host}`).searchParams.get('range') || '3600000');
        const metric = new URL(req.url || '/', `http://${req.headers.host}`).searchParams.get('metric') || 'metrics.memoryUsage.heapUsed';
        const historyData = this.getHistoricalData(metric, timeRange);
        res.writeHead(200);
        res.end(JSON.stringify(historyData));
        break;

      case '/api/alerts':
        res.writeHead(200);
        res.end(JSON.stringify(this.dashboardData.alerts));
        break;

      case '/api/trends':
        const trendRange = parseInt(new URL(req.url || '/', `http://${req.headers.host}`).searchParams.get('range') || '3600000');
        const trends = this.getTrends(trendRange);
        res.writeHead(200);
        res.end(JSON.stringify(trends));
        break;

      case '/api/bundle':
        res.writeHead(200);
        res.end(JSON.stringify(this.dashboardData.bundleAnalysis || {}));
        break;

      case '/api/memory':
        res.writeHead(200);
        res.end(JSON.stringify(this.dashboardData.memoryReport || {}));
        break;

      default:
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));
    }
  }

  private async handleStaticFile(pathname: string, res: ServerResponse): Promise<void> {
    const filePath = path.join(this.config.staticAssets.path, pathname === '/' ? 'index.html' : pathname);
    
    try {
      const content = await fs.readFile(filePath);
      const ext = path.extname(filePath);
      const contentType = this.getContentType(ext);
      
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    } catch (error) {
      if (pathname === '/') {
        await this.serveDashboardHTML(res);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    }
  }

  private async serveDashboardHTML(res: ServerResponse): Promise<void> {
    const html = this.generateDashboardHTML();
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  }

  private generateDashboardHTML(): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Performance Dashboard - Claude Flow</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f5f7fa;
            color: #2d3748;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 1rem 2rem;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .header h1 { font-size: 1.5rem; font-weight: 600; }
        .header .status {
            display: flex;
            gap: 1rem;
            margin-top: 0.5rem;
            font-size: 0.9rem;
        }
        .status-item {
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        .status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #48bb78;
        }
        .status-dot.warning { background: #ed8936; }
        .status-dot.critical { background: #f56565; }
        .main {
            padding: 2rem;
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 1.5rem;
            max-width: 1400px;
            margin: 0 auto;
        }
        .card {
            background: white;
            border-radius: 8px;
            padding: 1.5rem;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            border: 1px solid #e2e8f0;
        }
        .card h2 {
            font-size: 1.1rem;
            font-weight: 600;
            margin-bottom: 1rem;
            color: #2d3748;
        }
        .metric-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 1rem;
        }
        .metric {
            text-align: center;
            padding: 1rem;
            background: #f7fafc;
            border-radius: 6px;
        }
        .metric-value {
            font-size: 1.8rem;
            font-weight: 700;
            color: #2b6cb0;
            margin-bottom: 0.25rem;
        }
        .metric-label {
            font-size: 0.8rem;
            color: #718096;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }
        .chart-container {
            position: relative;
            height: 300px;
            margin-top: 1rem;
        }
        .alert-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0.75rem;
            background: #fed7d7;
            border-left: 4px solid #f56565;
            border-radius: 4px;
            margin-bottom: 0.5rem;
        }
        .alert-item.warning {
            background: #feebc8;
            border-left-color: #ed8936;
        }
        .alert-item.info {
            background: #bee3f8;
            border-left-color: #3182ce;
        }
        .alert-severity {
            font-size: 0.75rem;
            padding: 0.25rem 0.5rem;
            border-radius: 12px;
            font-weight: 600;
            text-transform: uppercase;
        }
        .alert-severity.critical {
            background: #f56565;
            color: white;
        }
        .alert-severity.warning {
            background: #ed8936;
            color: white;
        }
        .alert-severity.info {
            background: #3182ce;
            color: white;
        }
        .loading {
            display: flex;
            justify-content: center;
            align-items: center;
            height: 200px;
            color: #718096;
        }
        .connection-status {
            position: fixed;
            top: 1rem;
            right: 1rem;
            padding: 0.5rem 1rem;
            border-radius: 20px;
            font-size: 0.8rem;
            font-weight: 600;
            z-index: 1000;
        }
        .connection-status.connected {
            background: #48bb78;
            color: white;
        }
        .connection-status.disconnected {
            background: #f56565;
            color: white;
        }
        @media (max-width: 768px) {
            .main {
                grid-template-columns: 1fr;
                padding: 1rem;
            }
            .header {
                padding: 1rem;
            }
            .header .status {
                flex-direction: column;
                gap: 0.5rem;
            }
        }
    </style>
</head>
<body>
    <div class="connection-status" id="connectionStatus">Connecting...</div>
    
    <div class="header">
        <h1>Performance Dashboard</h1>
        <div class="status">
            <div class="status-item">
                <div class="status-dot" id="systemStatus"></div>
                <span id="systemStatusText">Loading...</span>
            </div>
            <div class="status-item">
                <span>Performance Score: <strong id="performanceScore">--</strong></span>
            </div>
            <div class="status-item">
                <span>Active Alerts: <strong id="activeAlerts">--</strong></span>
            </div>
            <div class="status-item">
                <span>Uptime: <strong id="uptime">--</strong></span>
            </div>
        </div>
    </div>

    <div class="main">
        <!-- Key Metrics -->
        <div class="card">
            <h2>📊 Key Metrics</h2>
            <div class="metric-grid">
                <div class="metric">
                    <div class="metric-value" id="memoryUsage">--</div>
                    <div class="metric-label">Memory (MB)</div>
                </div>
                <div class="metric">
                    <div class="metric-value" id="cpuUsage">--</div>
                    <div class="metric-label">CPU (%)</div>
                </div>
                <div class="metric">
                    <div class="metric-value" id="bundleSize">--</div>
                    <div class="metric-label">Bundle (MB)</div>
                </div>
                <div class="metric">
                    <div class="metric-value" id="responseTime">--</div>
                    <div class="metric-label">Response (ms)</div>
                </div>
            </div>
        </div>

        <!-- Memory Usage Chart -->
        <div class="card">
            <h2>🧠 Memory Usage</h2>
            <div class="chart-container">
                <canvas id="memoryChart"></canvas>
            </div>
        </div>

        <!-- CPU Usage Chart -->
        <div class="card">
            <h2>⚡ CPU Usage</h2>
            <div class="chart-container">
                <canvas id="cpuChart"></canvas>
            </div>
        </div>

        <!-- Active Alerts -->
        <div class="card">
            <h2>🚨 Active Alerts</h2>
            <div id="alertsList">
                <div class="loading">Loading alerts...</div>
            </div>
        </div>

        <!-- Performance Trends -->
        <div class="card">
            <h2>📈 Performance Trends</h2>
            <div id="trendsList">
                <div class="loading">Loading trends...</div>
            </div>
        </div>

        <!-- Bundle Analysis -->
        <div class="card">
            <h2>📦 Bundle Analysis</h2>
            <div id="bundleAnalysis">
                <div class="loading">Loading bundle data...</div>
            </div>
        </div>
    </div>

    <script>
        class PerformanceDashboard {
            constructor() {
                this.ws = null;
                this.charts = {};
                this.data = null;
                
                this.init();
            }

            init() {
                this.connectWebSocket();
                this.initCharts();
                this.loadInitialData();
                
                // Refresh data every 30 seconds if WebSocket is not available
                setInterval(() => {
                    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                        this.loadInitialData();
                    }
                }, 30000);
            }

            connectWebSocket() {
                if (!${this.config.enableRealtime}) return;
                
                const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                const wsUrl = \`\${protocol}//\${window.location.host}\`;
                
                try {
                    this.ws = new WebSocket(wsUrl);
                    
                    this.ws.onopen = () => {
                        console.log('WebSocket connected');
                        this.updateConnectionStatus('connected');
                    };
                    
                    this.ws.onmessage = (event) => {
                        const data = JSON.parse(event.data);
                        this.updateDashboard(data);
                    };
                    
                    this.ws.onclose = () => {
                        console.log('WebSocket disconnected');
                        this.updateConnectionStatus('disconnected');
                        
                        // Reconnect after 5 seconds
                        setTimeout(() => this.connectWebSocket(), 5000);
                    };
                    
                    this.ws.onerror = (error) => {
                        console.error('WebSocket error:', error);
                        this.updateConnectionStatus('disconnected');
                    };
                } catch (error) {
                    console.error('Failed to connect WebSocket:', error);
                    this.updateConnectionStatus('disconnected');
                }
            }

            async loadInitialData() {
                try {
                    const response = await fetch('/api/dashboard');
                    const data = await response.json();
                    this.updateDashboard(data);
                } catch (error) {
                    console.error('Failed to load dashboard data:', error);
                }
            }

            initCharts() {
                // Memory chart
                const memoryCtx = document.getElementById('memoryChart').getContext('2d');
                this.charts.memory = new Chart(memoryCtx, {
                    type: 'line',
                    data: {
                        labels: [],
                        datasets: [{
                            label: 'Heap Used (MB)',
                            data: [],
                            borderColor: '#3182ce',
                            backgroundColor: 'rgba(49, 130, 206, 0.1)',
                            fill: true,
                            tension: 0.4
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            y: {
                                beginAtZero: true,
                                title: {
                                    display: true,
                                    text: 'Memory (MB)'
                                }
                            }
                        },
                        plugins: {
                            legend: {
                                display: false
                            }
                        }
                    }
                });

                // CPU chart
                const cpuCtx = document.getElementById('cpuChart').getContext('2d');
                this.charts.cpu = new Chart(cpuCtx, {
                    type: 'line',
                    data: {
                        labels: [],
                        datasets: [{
                            label: 'CPU Usage (%)',
                            data: [],
                            borderColor: '#ed8936',
                            backgroundColor: 'rgba(237, 137, 54, 0.1)',
                            fill: true,
                            tension: 0.4
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            y: {
                                beginAtZero: true,
                                max: 100,
                                title: {
                                    display: true,
                                    text: 'CPU Usage (%)'
                                }
                            }
                        },
                        plugins: {
                            legend: {
                                display: false
                            }
                        }
                    }
                });
            }

            async updateCharts() {
                try {
                    // Update memory chart
                    const memoryResponse = await fetch('/api/metrics/history?metric=metrics.memoryUsage.heapUsed&range=1800000');
                    const memoryData = await memoryResponse.json();
                    
                    this.charts.memory.data.labels = memoryData.map(p => p.label);
                    this.charts.memory.data.datasets[0].data = memoryData.map(p => (p.value / 1024 / 1024).toFixed(1));
                    this.charts.memory.update('none');

                    // Update CPU chart
                    const cpuResponse = await fetch('/api/metrics/history?metric=metrics.cpuUsage.utilizationPercent&range=1800000');
                    const cpuData = await cpuResponse.json();
                    
                    this.charts.cpu.data.labels = cpuData.map(p => p.label);
                    this.charts.cpu.data.datasets[0].data = cpuData.map(p => p.value.toFixed(1));
                    this.charts.cpu.update('none');
                } catch (error) {
                    console.error('Failed to update charts:', error);
                }
            }

            updateDashboard(data) {
                this.data = data;
                
                // Update header status
                const summary = data.summary || {};
                const statusDot = document.getElementById('systemStatus');
                const statusText = document.getElementById('systemStatusText');
                
                statusDot.className = 'status-dot ' + (summary.status || 'warning');
                statusText.textContent = (summary.status || 'Unknown').toUpperCase();
                
                document.getElementById('performanceScore').textContent = 
                    summary.performanceScore ? summary.performanceScore.toFixed(1) + '%' : '--';
                document.getElementById('activeAlerts').textContent = summary.activeAlerts || 0;
                document.getElementById('uptime').textContent = this.formatUptime(summary.uptime || 0);

                // Update key metrics
                const metrics = data.metrics || {};
                document.getElementById('memoryUsage').textContent = 
                    metrics.memoryUsage ? (metrics.memoryUsage.heapUsed / 1024 / 1024).toFixed(1) : '--';
                document.getElementById('cpuUsage').textContent = 
                    metrics.cpuUsage ? metrics.cpuUsage.utilizationPercent.toFixed(1) : '--';
                document.getElementById('bundleSize').textContent = 
                    summary.bundleSize ? (summary.bundleSize / 1024 / 1024).toFixed(1) : '--';
                document.getElementById('responseTime').textContent = 
                    metrics.duration ? metrics.duration.toFixed(0) : '--';

                // Update alerts
                this.updateAlerts(data.alerts || []);
                
                // Update trends
                this.updateTrends(data.trends || []);
                
                // Update bundle analysis
                this.updateBundleAnalysis(data.bundleAnalysis);
                
                // Update charts
                this.updateCharts();
            }

            updateAlerts(alerts) {
                const alertsList = document.getElementById('alertsList');
                
                if (alerts.length === 0) {
                    alertsList.innerHTML = '<div style="text-align: center; color: #48bb78; padding: 2rem;">✅ No active alerts</div>';
                    return;
                }

                alertsList.innerHTML = alerts.slice(0, 5).map(alert => \`
                    <div class="alert-item \${alert.severity}">
                        <div>
                            <div style="font-weight: 600; margin-bottom: 0.25rem;">\${alert.message}</div>
                            <div style="font-size: 0.8rem; color: #718096;">
                                \${new Date(alert.timestamp).toLocaleString()}
                            </div>
                        </div>
                        <div class="alert-severity \${alert.severity}">\${alert.severity}</div>
                    </div>
                \`).join('');
            }

            updateTrends(trends) {
                const trendsList = document.getElementById('trendsList');
                
                if (trends.length === 0) {
                    trendsList.innerHTML = '<div class="loading">No trend data available</div>';
                    return;
                }

                trendsList.innerHTML = trends.map(trend => \`
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem; background: #f7fafc; border-radius: 6px; margin-bottom: 0.5rem;">
                        <div>
                            <div style="font-weight: 600;">\${trend.metric}</div>
                            <div style="font-size: 0.8rem; color: #718096;">
                                \${trend.direction} trend • \${(trend.confidence * 100).toFixed(0)}% confidence
                            </div>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-size: 1.2rem;">
                                \${trend.direction === 'up' ? '📈' : trend.direction === 'down' ? '📉' : '➡️'}
                            </div>
                        </div>
                    </div>
                \`).join('');
            }

            updateBundleAnalysis(bundleData) {
                const bundleAnalysis = document.getElementById('bundleAnalysis');
                
                if (!bundleData) {
                    bundleAnalysis.innerHTML = '<div class="loading">Bundle analysis not available</div>';
                    return;
                }

                bundleAnalysis.innerHTML = \`
                    <div class="metric-grid">
                        <div class="metric">
                            <div class="metric-value">\${(bundleData.totalSize / 1024 / 1024).toFixed(1)}</div>
                            <div class="metric-label">Total Size (MB)</div>
                        </div>
                        <div class="metric">
                            <div class="metric-value">\${(bundleData.gzippedSize / 1024 / 1024).toFixed(1)}</div>
                            <div class="metric-label">Gzipped (MB)</div>
                        </div>
                        <div class="metric">
                            <div class="metric-value">\${bundleData.metrics?.modules?.length || 0}</div>
                            <div class="metric-label">Modules</div>
                        </div>
                        <div class="metric">
                            <div class="metric-value">\${bundleData.metrics?.duplicateModules?.length || 0}</div>
                            <div class="metric-label">Duplicates</div>
                        </div>
                    </div>
                \`;
            }

            updateConnectionStatus(status) {
                const statusEl = document.getElementById('connectionStatus');
                statusEl.className = 'connection-status ' + status;
                statusEl.textContent = status === 'connected' ? '🟢 Connected' : '🔴 Disconnected';
            }

            formatUptime(uptime) {
                const seconds = Math.floor(uptime / 1000);
                const minutes = Math.floor(seconds / 60);
                const hours = Math.floor(minutes / 60);
                const days = Math.floor(hours / 24);
                
                if (days > 0) return \`\${days}d \${hours % 24}h\`;
                if (hours > 0) return \`\${hours}h \${minutes % 60}m\`;
                if (minutes > 0) return \`\${minutes}m \${seconds % 60}s\`;
                return \`\${seconds}s\`;
            }
        }

        // Initialize dashboard when page loads
        document.addEventListener('DOMContentLoaded', () => {
            new PerformanceDashboard();
        });
    </script>
</body>
</html>
    `;
  }

  private setupWebSocketHandlers(): void {
    if (!this.wsServer) return;

    this.wsServer.on('connection', (ws: WebSocket) => {
      console.log('WebSocket client connected');
      this.clients.add(ws);

      // Send current data to new client
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(this.dashboardData));
      }

      ws.on('close', () => {
        console.log('WebSocket client disconnected');
        this.clients.delete(ws);
      });

      ws.on('error', (error) => {
        console.error('WebSocket client error:', error);
        this.clients.delete(ws);
      });
    });
  }

  private startDataUpdates(): void {
    this.updateTimer = setInterval(() => {
      // Update summary
      this.dashboardData.summary = this.calculateSummary();
      this.dashboardData.timestamp = Date.now();

      // Broadcast to clients
      this.broadcastUpdate();
    }, this.config.updateInterval);
  }

  private broadcastUpdate(): void {
    if (!this.config.enableRealtime || this.clients.size === 0) return;

    const message = JSON.stringify(this.dashboardData);
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(message);
        } catch (error) {
          console.error('Failed to send WebSocket message:', error);
          this.clients.delete(client);
        }
      } else {
        this.clients.delete(client);
      }
    });
  }

  private calculateSummary(): DashboardSummary {
    const activeAlerts = this.dashboardData.alerts.filter(a => a.status === 'active').length;
    const criticalAlerts = this.dashboardData.alerts.filter(a => 
      a.status === 'active' && a.severity === 'critical'
    ).length;

    let status: DashboardSummary['status'] = 'healthy';
    if (criticalAlerts > 0) {
      status = 'critical';
    } else if (activeAlerts > 0) {
      status = 'warning';
    }

    let performanceScore = 100;
    if (this.dashboardData.metrics) {
      // Deduct points for high resource usage
      const memoryUsage = this.dashboardData.metrics.memoryUsage?.heapUsed || 0;
      const cpuUsage = this.dashboardData.metrics.cpuUsage?.utilizationPercent || 0;
      
      if (memoryUsage > this.performanceConfig.thresholds.memoryUsage) {
        performanceScore -= 20;
      }
      if (cpuUsage > this.performanceConfig.thresholds.cpuUsage) {
        performanceScore -= 15;
      }
    }

    // Deduct points for alerts
    performanceScore -= criticalAlerts * 25;
    performanceScore -= (activeAlerts - criticalAlerts) * 10;

    return {
      status,
      activeAlerts,
      criticalAlerts,
      performanceScore: Math.max(0, performanceScore),
      memoryUsage: this.dashboardData.metrics?.memoryUsage?.heapUsed || 0,
      cpuUsage: this.dashboardData.metrics?.cpuUsage?.utilizationPercent || 0,
      bundleSize: this.dashboardData.bundleAnalysis?.totalSize || 0,
      lastUpdate: Date.now(),
      uptime: Date.now() - this.startTime
    };
  }

  private createInitialData(): DashboardData {
    return {
      timestamp: Date.now(),
      metrics: {
        timestamp: Date.now(),
        duration: 0,
        memoryUsage: {
          heapUsed: 0,
          heapTotal: 0,
          external: 0,
          rss: 0,
          arrayBuffers: 0
        },
        cpuUsage: {
          user: 0,
          system: 0,
          total: 0,
          cores: [],
          loadAverage: [0, 0, 0],
          utilizationPercent: 0
        },
        networkIO: {
          bytesIn: 0,
          bytesOut: 0,
          packetsIn: 0,
          packetsOut: 0,
          connectionsActive: 0
        },
        diskIO: {
          bytesRead: 0,
          bytesWritten: 0,
          operationsRead: 0,
          operationsWrite: 0,
          queueLength: 0
        }
      },
      alerts: [],
      trends: [],
      summary: {
        status: 'healthy',
        activeAlerts: 0,
        criticalAlerts: 0,
        performanceScore: 100,
        memoryUsage: 0,
        cpuUsage: 0,
        bundleSize: 0,
        lastUpdate: Date.now(),
        uptime: 0
      }
    };
  }

  private extractMetricValue(data: DashboardData, metric: string): number {
    const parts = metric.split('.');
    let value: any = data;
    
    for (const part of parts) {
      value = value?.[part];
      if (value === undefined) return 0;
    }
    
    return typeof value === 'number' ? value : 0;
  }

  private calculateTrend(points: ChartDataPoint[]): { slope: number; confidence: number } {
    if (points.length < 2) return { slope: 0, confidence: 0 };

    const n = points.length;
    const sumX = points.reduce((sum, p, i) => sum + i, 0);
    const sumY = points.reduce((sum, p) => sum + p.value, 0);
    const sumXY = points.reduce((sum, p, i) => sum + i * p.value, 0);
    const sumXX = points.reduce((sum, p, i) => sum + i * i, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    
    // Calculate R-squared for confidence
    const meanY = sumY / n;
    const ssRes = points.reduce((sum, p, i) => {
      const predicted = slope * i + (sumY - slope * sumX) / n;
      return sum + Math.pow(p.value - predicted, 2);
    }, 0);
    const ssTot = points.reduce((sum, p) => sum + Math.pow(p.value - meanY, 2), 0);
    
    const confidence = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);

    return { slope, confidence };
  }

  private forecastValue(points: ChartDataPoint[], aheadMs: number): number {
    const trend = this.calculateTrend(points);
    if (points.length === 0) return 0;
    
    const lastPoint = points[points.length - 1];
    const timeSteps = aheadMs / (points.length > 1 ? 
      (points[points.length - 1].timestamp - points[0].timestamp) / (points.length - 1) : 
      5000
    );
    
    return lastPoint.value + trend.slope * timeSteps;
  }

  private isAuthenticated(req: IncomingMessage): boolean {
    if (!this.config.enableAuth || !this.config.authToken) return true;
    
    const authHeader = req.headers.authorization;
    if (!authHeader) return false;
    
    const token = authHeader.split(' ')[1];
    return token === this.config.authToken;
  }

  private getContentType(ext: string): string {
    const types: Record<string, string> = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon'
    };
    
    return types[ext] || 'text/plain';
  }
}