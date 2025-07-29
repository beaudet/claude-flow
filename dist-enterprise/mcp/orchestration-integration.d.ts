/**
 * MCP Integration with Claude-Flow Orchestration System
 * Provides seamless integration between MCP servers and the broader orchestration components
 */
import { EventEmitter } from 'node:events';
import type { ILogger } from '../core/logger.js';
import { MCPConfig } from '../utils/types.js';
import { IMCPServer } from './server.js';
import { MCPLifecycleManager } from './lifecycle-manager.js';
import { MCPPerformanceMonitor } from './performance-monitor.js';
import { MCPProtocolManager } from './protocol-manager.js';
export interface OrchestrationComponents {
    orchestrator?: any;
    swarmCoordinator?: any;
    agentManager?: any;
    resourceManager?: any;
    memoryManager?: any;
    messageBus?: any;
    monitor?: any;
    eventBus?: any;
    terminalManager?: any;
}
export interface MCPOrchestrationConfig {
    enabledIntegrations: {
        orchestrator: boolean;
        swarm: boolean;
        agents: boolean;
        resources: boolean;
        memory: boolean;
        monitoring: boolean;
        terminals: boolean;
    };
    autoStart: boolean;
    healthCheckInterval: number;
    reconnectAttempts: number;
    reconnectDelay: number;
    enableMetrics: boolean;
    enableAlerts: boolean;
}
export interface IntegrationStatus {
    component: string;
    enabled: boolean;
    connected: boolean;
    healthy: boolean;
    lastCheck: Date;
    error?: string;
    metrics?: Record<string, number>;
}
/**
 * MCP Orchestration Integration Manager
 * Manages the integration between MCP servers and orchestration components
 */
export declare class MCPOrchestrationIntegration extends EventEmitter {
    private mcpConfig;
    private orchestrationConfig;
    private components;
    private logger;
    private server?;
    private lifecycleManager?;
    private performanceMonitor?;
    private protocolManager?;
    private integrationStatus;
    private healthCheckTimer?;
    private reconnectTimers;
    private readonly defaultConfig;
    constructor(mcpConfig: MCPConfig, orchestrationConfig: MCPOrchestrationConfig, components: OrchestrationComponents, logger: ILogger);
    /**
     * Start the MCP orchestration integration
     */
    start(): Promise<void>;
    /**
     * Stop the MCP orchestration integration
     */
    stop(): Promise<void>;
    /**
     * Get integration status for all components
     */
    getIntegrationStatus(): IntegrationStatus[];
    /**
     * Get status for a specific component
     */
    getComponentStatus(component: string): IntegrationStatus | undefined;
    /**
     * Get MCP server instance
     */
    getServer(): IMCPServer | undefined;
    /**
     * Get lifecycle manager
     */
    getLifecycleManager(): MCPLifecycleManager | undefined;
    /**
     * Get performance monitor
     */
    getPerformanceMonitor(): MCPPerformanceMonitor | undefined;
    /**
     * Get protocol manager
     */
    getProtocolManager(): MCPProtocolManager | undefined;
    /**
     * Force reconnection to a component
     */
    reconnectComponent(component: string): Promise<void>;
    /**
     * Enable/disable component integration
     */
    setComponentEnabled(component: string, enabled: boolean): Promise<void>;
    private initializeIntegration;
    private setupLifecycleHandlers;
    private setupPerformanceMonitoring;
    private registerOrchestrationTools;
    private registerOrchestratorTools;
    private registerSwarmTools;
    private registerAgentTools;
    private registerResourceTools;
    private registerMemoryTools;
    private registerMonitoringTools;
    private registerTerminalTools;
    private setupComponentIntegrations;
    private connectComponent;
    private disconnectComponent;
    private scheduleReconnect;
    private startHealthMonitoring;
    private stopHealthMonitoring;
    private performHealthChecks;
    private checkComponentHealth;
    private getComponentInstance;
    private connectOrchestrator;
    private connectSwarmCoordinator;
    private connectAgentManager;
    private connectResourceManager;
    private connectMemoryManager;
    private connectMonitor;
    private connectTerminalManager;
}
//# sourceMappingURL=orchestration-integration.d.ts.map