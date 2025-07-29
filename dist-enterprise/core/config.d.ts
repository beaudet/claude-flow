/**
 * Enterprise Configuration Management for Claude-Flow
 * Features: Security masking, change tracking, multi-format support, credential management
 */
import type { Config } from '../utils/types.js';
interface FormatParser {
    parse(content: string): any;
    stringify(obj: any): string;
    extension: string;
}
interface ConfigChange {
    timestamp: string;
    path: string;
    oldValue: any;
    newValue: any;
    user?: string;
    reason?: string;
    source: 'cli' | 'api' | 'file' | 'env';
}
interface SecurityClassification {
    level: 'public' | 'internal' | 'confidential' | 'secret';
    maskPattern?: string;
    encrypted?: boolean;
}
interface ValidationRule {
    type: string;
    required?: boolean;
    min?: number;
    max?: number;
    values?: string[];
    pattern?: RegExp;
    validator?: (value: any, config: Config) => string | null;
    dependencies?: string[];
}
/**
 * Security classifications for configuration paths
 */
declare const SECURITY_CLASSIFICATIONS: Record<string, SecurityClassification>;
/**
 * Sensitive configuration paths that should be masked in output
 */
declare const SENSITIVE_PATHS: string[];
/**
 * Configuration manager
 */
export declare class ConfigManager {
    private static instance;
    private config;
    private configPath?;
    private profiles;
    private currentProfile?;
    private userConfigDir;
    private changeHistory;
    private encryptionKey?;
    private validationRules;
    private formatParsers;
    private constructor();
    /**
     * Gets the singleton instance
     */
    static getInstance(): ConfigManager;
    /**
     * Initialize async components
     */
    init(): Promise<void>;
    /**
     * Initializes encryption for sensitive configuration values
     */
    private initializeEncryption;
    /**
     * Sets up validation rules for configuration paths
     */
    private setupValidationRules;
    /**
     * Loads configuration from various sources
     */
    load(configPath?: string): Promise<Config>;
    /**
     * Gets the current configuration with optional security masking
     */
    get(maskSensitive?: boolean): Config;
    /**
     * Gets configuration with security masking applied
     */
    getSecure(): Config;
    /**
     * Gets all configuration values (alias for get method for backward compatibility)
     */
    getAll(): Promise<Config>;
    /**
     * Updates configuration values with change tracking
     */
    update(updates: Partial<Config>, options?: {
        user?: string;
        reason?: string;
        source?: 'cli' | 'api' | 'file' | 'env';
    }): Config;
    /**
     * Loads default configuration
     */
    loadDefault(): void;
    /**
     * Saves configuration to file with format support
     */
    save(path?: string, format?: string): Promise<void>;
    /**
     * Gets configuration suitable for saving (excludes runtime-only values)
     */
    private getConfigForSaving;
    /**
     * Gets user configuration directory
     */
    private getUserConfigDir;
    /**
     * Creates user config directory if it doesn't exist
     */
    private ensureUserConfigDir;
    /**
     * Loads all profiles from the profiles directory
     */
    loadProfiles(): Promise<void>;
    /**
     * Applies a named profile
     */
    applyProfile(profileName: string): Promise<void>;
    /**
     * Saves current configuration as a profile
     */
    saveProfile(profileName: string, config?: Partial<Config>): Promise<void>;
    /**
     * Deletes a profile
     */
    deleteProfile(profileName: string): Promise<void>;
    /**
     * Lists all available profiles
     */
    listProfiles(): Promise<string[]>;
    /**
     * Gets a specific profile configuration
     */
    getProfile(profileName: string): Promise<Partial<Config> | undefined>;
    /**
     * Gets the current active profile name
     */
    getCurrentProfile(): string | undefined;
    /**
     * Sets a configuration value by path with change tracking and validation
     */
    set(path: string, value: any, options?: {
        user?: string;
        reason?: string;
        source?: 'cli' | 'api' | 'file' | 'env';
    }): void;
    /**
     * Gets a configuration value by path with decryption for sensitive values
     */
    getValue(path: string, decrypt?: boolean): any;
    /**
     * Resets configuration to defaults
     */
    reset(): void;
    /**
     * Gets configuration schema for validation
     */
    getSchema(): any;
    /**
     * Validates a value against schema
     */
    private validateValue;
    /**
     * Gets configuration diff between current and default
     */
    getDiff(): any;
    /**
     * Exports configuration with metadata
     */
    export(): any;
    /**
     * Imports configuration from export
     */
    import(data: any): void;
    /**
     * Loads configuration from file with format detection
     */
    private loadFromFile;
    /**
     * Detects configuration file format
     */
    private detectFormat;
    /**
     * Loads configuration from environment variables
     */
    private loadFromEnv;
    /**
     * Validates configuration with dependency checking
     */
    private validateWithDependencies;
    /**
     * Validates a specific configuration path
     */
    private validatePath;
    /**
     * Gets a value from a configuration object by path
     */
    private getValueByPath;
    /**
     * Legacy validate method for backward compatibility
     */
    private validate;
    /**
     * Masks sensitive values in configuration
     */
    private maskSensitiveValues;
    /**
     * Tracks changes to configuration
     */
    private trackChanges;
    /**
     * Records a configuration change
     */
    private recordChange;
    /**
     * Checks if a path contains sensitive information
     */
    private isSensitivePath;
    /**
     * Encrypts a sensitive value
     */
    private encryptValue;
    /**
     * Decrypts a sensitive value
     */
    private decryptValue;
    /**
     * Checks if a value is encrypted
     */
    private isEncryptedValue;
}
export declare const configManager: ConfigManager;
export declare function loadConfig(path?: string): Promise<Config>;
export type { FormatParser, ConfigChange, SecurityClassification, ValidationRule };
export { SENSITIVE_PATHS, SECURITY_CLASSIFICATIONS };
//# sourceMappingURL=config.d.ts.map