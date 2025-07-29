/**
 * ruv-swarm integration helper for Claude Code configuration
 *
 * This module bridges the main claude-flow configuration with
 * ruv-swarm specific settings and provides utility functions
 * for seamless integration.
 */
import { ConfigManager } from './config-manager.js';
import { RuvSwarmConfigManager } from './ruv-swarm-config.js';
/**
 * Integration manager that synchronizes configurations
 */
export declare class RuvSwarmIntegration {
    private configManager;
    private ruvSwarmManager;
    constructor(configManager: ConfigManager, ruvSwarmManager: RuvSwarmConfigManager);
    /**
     * Synchronize main config with ruv-swarm config
     */
    syncConfiguration(): void;
    /**
     * Get unified command arguments for ruv-swarm CLI
     */
    getUnifiedCommandArgs(): string[];
    /**
     * Initialize ruv-swarm integration
     */
    initialize(): Promise<{
        success: boolean;
        message: string;
    }>;
    /**
     * Validate main configuration for ruv-swarm compatibility
     */
    private validateMainConfig;
    /**
     * Get current integration status
     */
    getStatus(): {
        enabled: boolean;
        mainConfig: any;
        ruvSwarmConfig: any;
        synchronized: boolean;
    };
    /**
     * Check if configurations are synchronized
     */
    private isConfigurationSynchronized;
    /**
     * Update configuration and sync
     */
    updateConfiguration(updates: {
        main?: Partial<Parameters<ConfigManager['setRuvSwarmConfig']>[0]>;
        ruvSwarm?: Partial<Parameters<RuvSwarmConfigManager['updateConfig']>[0]>;
    }): void;
}
export declare function getRuvSwarmIntegration(): RuvSwarmIntegration;
/**
 * Initialize ruv-swarm integration with claude-flow
 */
export declare function initializeRuvSwarmIntegration(): Promise<{
    success: boolean;
    message: string;
}>;
/**
 * Helper functions for CLI commands
 */
export declare class RuvSwarmConfigHelpers {
    /**
     * Quick setup for development environment
     */
    static setupDevelopmentConfig(): void;
    /**
     * Quick setup for research environment
     */
    static setupResearchConfig(): void;
    /**
     * Quick setup for production environment
     */
    static setupProductionConfig(): void;
    /**
     * Get configuration for specific use case
     */
    static getConfigForUseCase(useCase: 'development' | 'research' | 'production'): any;
}
declare const _default: {
    RuvSwarmIntegration: typeof RuvSwarmIntegration;
    getRuvSwarmIntegration: typeof getRuvSwarmIntegration;
    initializeRuvSwarmIntegration: typeof initializeRuvSwarmIntegration;
    RuvSwarmConfigHelpers: typeof RuvSwarmConfigHelpers;
};
export default _default;
//# sourceMappingURL=ruv-swarm-integration.d.ts.map