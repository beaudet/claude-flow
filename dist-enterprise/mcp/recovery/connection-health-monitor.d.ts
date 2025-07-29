/**
 * Connection Health Monitor for MCP
 * Monitors connection health and triggers recovery when needed
 */
import { EventEmitter } from 'node:events';
import type { ILogger } from '../../core/logger.js';
import type { MCPClient } from '../client.js';
export interface HealthStatus {
    healthy: boolean;
    lastHeartbeat: Date;
    missedHeartbeats: number;
    latency: number;
    connectionState: 'connected' | 'disconnected' | 'reconnecting';
    error?: string;
}
export interface HealthMonitorConfig {
    heartbeatInterval: number;
    heartbeatTimeout: number;
    maxMissedHeartbeats: number;
    enableAutoRecovery: boolean;
}
export declare class ConnectionHealthMonitor extends EventEmitter {
    private client;
    private logger;
    private heartbeatTimer?;
    private timeoutTimer?;
    private lastHeartbeat;
    private missedHeartbeats;
    private currentLatency;
    private isMonitoring;
    private healthStatus;
    private readonly defaultConfig;
    constructor(client: MCPClient, logger: ILogger, config?: Partial<HealthMonitorConfig>);
    private config;
    /**
     * Start health monitoring
     */
    start(): Promise<void>;
    /**
     * Stop health monitoring
     */
    stop(): Promise<void>;
    /**
     * Get current health status
     */
    getHealthStatus(): HealthStatus;
    /**
     * Check connection health immediately
     */
    checkHealth(): Promise<HealthStatus>;
    /**
     * Force a health check
     */
    forceCheck(): Promise<void>;
    private scheduleHeartbeat;
    private performHeartbeat;
    private sendHeartbeat;
    private setHeartbeatTimeout;
    private clearHeartbeatTimeout;
    private handleHeartbeatTimeout;
    private handleHeartbeatFailure;
    private updateHealthStatus;
    private generateSessionId;
    /**
     * Reset monitor state
     */
    reset(): void;
}
//# sourceMappingURL=connection-health-monitor.d.ts.map