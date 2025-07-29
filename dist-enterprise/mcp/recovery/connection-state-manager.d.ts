/**
 * Connection State Manager for MCP
 * Persists connection state across disconnections
 */
import type { ILogger } from '../../core/logger.js';
import type { MCPRequest, MCPConfig } from '../../utils/types.js';
export interface ConnectionState {
    sessionId: string;
    lastConnected: Date;
    lastDisconnected?: Date;
    pendingRequests: MCPRequest[];
    configuration: MCPConfig;
    metadata: Record<string, unknown>;
}
export interface ConnectionEvent {
    timestamp: Date;
    type: 'connect' | 'disconnect' | 'reconnect' | 'error';
    sessionId: string;
    details?: Record<string, unknown>;
    error?: string;
}
export interface ConnectionMetrics {
    totalConnections: number;
    totalDisconnections: number;
    totalReconnections: number;
    averageSessionDuration: number;
    averageReconnectionTime: number;
    lastConnectionDuration?: number;
    connectionHistory: ConnectionEvent[];
}
export interface StateManagerConfig {
    enablePersistence: boolean;
    stateDirectory: string;
    maxHistorySize: number;
    persistenceInterval: number;
}
export declare class ConnectionStateManager {
    private logger;
    private currentState?;
    private connectionHistory;
    private metrics;
    private persistenceTimer?;
    private statePath;
    private metricsPath;
    private readonly defaultConfig;
    constructor(logger: ILogger, config?: Partial<StateManagerConfig>);
    private config;
    /**
     * Initialize the state manager
     */
    private initialize;
    /**
     * Save current connection state
     */
    saveState(state: ConnectionState): void;
    /**
     * Restore previous connection state
     */
    restoreState(): ConnectionState | null;
    /**
     * Record a connection event
     */
    recordEvent(event: Omit<ConnectionEvent, 'timestamp'>): void;
    /**
     * Get connection metrics
     */
    getMetrics(): ConnectionMetrics;
    /**
     * Clear a specific session state
     */
    clearSession(sessionId: string): void;
    /**
     * Add a pending request
     */
    addPendingRequest(request: MCPRequest): void;
    /**
     * Remove a pending request
     */
    removePendingRequest(requestId: string): void;
    /**
     * Get pending requests
     */
    getPendingRequests(): MCPRequest[];
    /**
     * Update session metadata
     */
    updateMetadata(metadata: Record<string, unknown>): void;
    /**
     * Calculate session duration
     */
    getSessionDuration(sessionId: string): number | null;
    /**
     * Get reconnection time for a session
     */
    getReconnectionTime(sessionId: string): number | null;
    private updateMetrics;
    private loadState;
    private loadMetrics;
    private persistState;
    private startPersistenceTimer;
    /**
     * Cleanup resources
     */
    cleanup(): Promise<void>;
}
//# sourceMappingURL=connection-state-manager.d.ts.map