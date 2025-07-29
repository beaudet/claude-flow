/**
 * Node.js-compatible Configuration management for Claude-Flow
 */
export interface Config {
    orchestrator: {
        maxConcurrentAgents: number;
        taskQueueSize: number;
        healthCheckInterval: number;
        shutdownTimeout: number;
    };
    terminal: {
        type: 'auto' | 'vscode' | 'native';
        poolSize: number;
        recycleAfter: number;
        healthCheckInterval: number;
        commandTimeout: number;
    };
    memory: {
        backend: 'sqlite' | 'markdown' | 'hybrid';
        cacheSizeMB: number;
        syncInterval: number;
        conflictResolution: 'crdt' | 'timestamp' | 'manual';
        retentionDays: number;
    };
    coordination: {
        maxRetries: number;
        retryDelay: number;
        deadlockDetection: boolean;
        resourceTimeout: number;
        messageTimeout: number;
    };
    mcp: {
        transport: 'stdio' | 'http' | 'websocket';
        port: number;
        tlsEnabled: boolean;
    };
    logging: {
        level: 'debug' | 'info' | 'warn' | 'error';
        format: 'json' | 'text';
        destination: 'console' | 'file';
    };
    ruvSwarm: {
        enabled: boolean;
        defaultTopology: 'mesh' | 'hierarchical' | 'ring' | 'star';
        maxAgents: number;
        defaultStrategy: 'balanced' | 'specialized' | 'adaptive';
        autoInit: boolean;
        enableHooks: boolean;
        enablePersistence: boolean;
        enableNeuralTraining: boolean;
        configPath?: string;
    };
    claude?: {
        apiKey?: string;
        model?: 'claude-3-opus-20240229' | 'claude-3-sonnet-20240229' | 'claude-3-haiku-20240307' | 'claude-2.1' | 'claude-2.0' | 'claude-instant-1.2';
        temperature?: number;
        maxTokens?: number;
        topP?: number;
        topK?: number;
        systemPrompt?: string;
        timeout?: number;
        retryAttempts?: number;
        retryDelay?: number;
    };
}
/**
 * Configuration validation error
 */
export declare class ConfigError extends Error {
    constructor(message: string);
}
/**
 * Configuration manager for Node.js
 */
export declare class ConfigManager {
    private static instance;
    private config;
    private configPath?;
    private userConfigDir;
    private constructor();
    /**
     * Gets the singleton instance
     */
    static getInstance(): ConfigManager;
    /**
     * Initialize configuration from file or create default
     */
    init(configPath?: string): Promise<void>;
    /**
     * Creates a default configuration file
     */
    createDefaultConfig(configPath: string): Promise<void>;
    /**
     * Loads configuration from file
     */
    load(configPath?: string): Promise<Config>;
    /**
     * Shows current configuration
     */
    show(): Config;
    /**
     * Gets a configuration value by path
     */
    get(path: string): any;
    /**
     * Sets a configuration value by path
     */
    set(path: string, value: any): void;
    /**
     * Saves current configuration to file
     */
    save(configPath?: string): Promise<void>;
    /**
     * Validates the configuration
     */
    validate(config: Config): void;
    /**
     * Loads configuration from environment variables
     */
    private loadFromEnv;
    /**
     * Deep clone helper
     */
    private deepClone;
    /**
     * Get ruv-swarm specific configuration
     */
    getRuvSwarmConfig(): {
        enabled: boolean;
        defaultTopology: "mesh" | "hierarchical" | "ring" | "star";
        maxAgents: number;
        defaultStrategy: "balanced" | "specialized" | "adaptive";
        autoInit: boolean;
        enableHooks: boolean;
        enablePersistence: boolean;
        enableNeuralTraining: boolean;
        configPath?: string;
    };
    /**
     * Get available configuration templates
     */
    getAvailableTemplates(): string[];
    /**
     * Create a configuration template
     */
    createTemplate(name: string, config: any): void;
    /**
     * Get format parsers
     */
    getFormatParsers(): Record<string, any>;
    /**
     * Validate configuration file
     */
    validateFile(path: string): boolean;
    /**
     * Get path history
     */
    getPathHistory(): any[];
    /**
     * Get change history
     */
    getChangeHistory(): any[];
    /**
     * Backup configuration
     */
    backup(path: string): Promise<void>;
    /**
     * Restore configuration from backup
     */
    restore(path: string): Promise<void>;
    /**
     * Update ruv-swarm configuration
     */
    setRuvSwarmConfig(updates: Partial<Config['ruvSwarm']>): void;
    /**
     * Check if ruv-swarm is enabled
     */
    isRuvSwarmEnabled(): boolean;
    /**
     * Generate ruv-swarm command arguments from configuration
     */
    getRuvSwarmArgs(): string[];
    /**
     * Get Claude API configuration
     */
    getClaudeConfig(): {
        apiKey?: string;
        model?: "claude-3-opus-20240229" | "claude-3-sonnet-20240229" | "claude-3-haiku-20240307" | "claude-2.1" | "claude-2.0" | "claude-instant-1.2";
        temperature?: number;
        maxTokens?: number;
        topP?: number;
        topK?: number;
        systemPrompt?: string;
        timeout?: number;
        retryAttempts?: number;
        retryDelay?: number;
    };
    /**
     * Update Claude API configuration
     */
    setClaudeConfig(updates: Partial<Config['claude']>): void;
    /**
     * Check if Claude API is configured
     */
    isClaudeAPIConfigured(): boolean;
    /**
     * Deep merge helper
     */
    private deepMerge;
}
export declare const configManager: ConfigManager;
//# sourceMappingURL=config-manager.d.ts.map