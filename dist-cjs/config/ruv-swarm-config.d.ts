/**
 * ruv-swarm configuration management for Claude Code integration
 *
 * This module handles configuration settings for ruv-swarm integration,
 * including topology preferences, agent limits, and coordination patterns.
 */
import type { ILogger } from '../core/logger.js';
/**
 * ruv-swarm integration configuration
 */
export interface RuvSwarmConfig {
    swarm: {
        defaultTopology: 'mesh' | 'hierarchical' | 'ring' | 'star';
        maxAgents: number;
        defaultStrategy: 'balanced' | 'specialized' | 'adaptive';
        autoInit: boolean;
        enableHooks: boolean;
    };
    agents: {
        defaultCapabilities: string[];
        spawnTimeout: number;
        heartbeatInterval: number;
        maxRetries: number;
    };
    tasks: {
        defaultStrategy: 'parallel' | 'sequential' | 'adaptive';
        defaultPriority: 'low' | 'medium' | 'high' | 'critical';
        timeout: number;
        enableMonitoring: boolean;
    };
    memory: {
        enablePersistence: boolean;
        compressionLevel: number;
        ttl: number;
        maxSize: number;
    };
    neural: {
        enableTraining: boolean;
        patterns: string[];
        learningRate: number;
        trainingIterations: number;
    };
    monitoring: {
        enableMetrics: boolean;
        metricsInterval: number;
        enableAlerts: boolean;
        alertThresholds: {
            cpu: number;
            memory: number;
            taskFailureRate: number;
        };
    };
    integration: {
        enableMCPTools: boolean;
        enableCLICommands: boolean;
        enableHooks: boolean;
        workingDirectory?: string;
        sessionTimeout: number;
    };
}
/**
 * Default ruv-swarm configuration
 */
export declare const defaultRuvSwarmConfig: RuvSwarmConfig;
/**
 * ruv-swarm configuration manager
 */
export declare class RuvSwarmConfigManager {
    private logger;
    private config;
    private configPath;
    constructor(logger: ILogger, configPath?: string);
    /**
     * Load configuration from file or use defaults
     */
    private loadConfig;
    /**
     * Save configuration to file
     */
    saveConfig(): void;
    /**
     * Get current configuration
     */
    getConfig(): RuvSwarmConfig;
    /**
     * Update configuration
     */
    updateConfig(updates: Partial<RuvSwarmConfig>): void;
    /**
     * Reset configuration to defaults
     */
    resetConfig(): void;
    /**
     * Get specific configuration section
     */
    getSwarmConfig(): {
        defaultTopology: "mesh" | "hierarchical" | "ring" | "star";
        maxAgents: number;
        defaultStrategy: "balanced" | "specialized" | "adaptive";
        autoInit: boolean;
        enableHooks: boolean;
    };
    getAgentsConfig(): {
        defaultCapabilities: string[];
        spawnTimeout: number;
        heartbeatInterval: number;
        maxRetries: number;
    };
    getTasksConfig(): {
        defaultStrategy: "parallel" | "sequential" | "adaptive";
        defaultPriority: "low" | "medium" | "high" | "critical";
        timeout: number;
        enableMonitoring: boolean;
    };
    getMemoryConfig(): {
        enablePersistence: boolean;
        compressionLevel: number;
        ttl: number;
        maxSize: number;
    };
    getNeuralConfig(): {
        enableTraining: boolean;
        patterns: string[];
        learningRate: number;
        trainingIterations: number;
    };
    getMonitoringConfig(): {
        enableMetrics: boolean;
        metricsInterval: number;
        enableAlerts: boolean;
        alertThresholds: {
            cpu: number;
            memory: number;
            taskFailureRate: number;
        };
    };
    getIntegrationConfig(): {
        enableMCPTools: boolean;
        enableCLICommands: boolean;
        enableHooks: boolean;
        workingDirectory?: string;
        sessionTimeout: number;
    };
    /**
     * Update specific configuration section
     */
    updateSwarmConfig(updates: Partial<RuvSwarmConfig['swarm']>): void;
    updateAgentsConfig(updates: Partial<RuvSwarmConfig['agents']>): void;
    updateTasksConfig(updates: Partial<RuvSwarmConfig['tasks']>): void;
    updateMemoryConfig(updates: Partial<RuvSwarmConfig['memory']>): void;
    updateNeuralConfig(updates: Partial<RuvSwarmConfig['neural']>): void;
    updateMonitoringConfig(updates: Partial<RuvSwarmConfig['monitoring']>): void;
    updateIntegrationConfig(updates: Partial<RuvSwarmConfig['integration']>): void;
    /**
     * Validate configuration
     */
    validateConfig(): {
        valid: boolean;
        errors: string[];
    };
    /**
     * Get configuration as command-line arguments for ruv-swarm
     */
    getCommandArgs(): string[];
}
export declare function getRuvSwarmConfigManager(logger: ILogger, configPath?: string): RuvSwarmConfigManager;
declare const _default: {
    RuvSwarmConfigManager: typeof RuvSwarmConfigManager;
    getRuvSwarmConfigManager: typeof getRuvSwarmConfigManager;
    defaultRuvSwarmConfig: RuvSwarmConfig;
};
export default _default;
//# sourceMappingURL=ruv-swarm-config.d.ts.map