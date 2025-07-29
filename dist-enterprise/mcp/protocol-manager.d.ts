/**
 * MCP Protocol Version Management and Compatibility Checking
 */
import type { MCPProtocolVersion, MCPCapabilities, MCPInitializeParams } from '../utils/types.js';
import type { ILogger } from '../core/logger.js';
export interface ProtocolVersionInfo {
    version: MCPProtocolVersion;
    name: string;
    releaseDate: Date;
    deprecated?: boolean;
    deprecationDate?: Date;
    supportedFeatures: string[];
    breakingChanges?: string[];
    migrationGuide?: string;
}
export interface CompatibilityResult {
    compatible: boolean;
    warnings: string[];
    errors: string[];
    recommendedVersion?: MCPProtocolVersion;
    missingFeatures?: string[];
    deprecatedFeatures?: string[];
}
export interface NegotiationResult {
    agreedVersion: MCPProtocolVersion;
    agreedCapabilities: MCPCapabilities;
    clientCapabilities: MCPCapabilities;
    serverCapabilities: MCPCapabilities;
    warnings: string[];
    limitations: string[];
}
/**
 * MCP Protocol Manager
 * Handles protocol version negotiation, compatibility checking, and feature management
 */
export declare class MCPProtocolManager {
    private logger;
    private supportedVersions;
    private currentVersion;
    private serverCapabilities;
    private readonly knownVersions;
    constructor(logger: ILogger, preferredVersion?: MCPProtocolVersion, serverCapabilities?: MCPCapabilities);
    /**
     * Negotiate protocol version and capabilities with client
     */
    negotiateProtocol(clientParams: MCPInitializeParams): Promise<NegotiationResult>;
    /**
     * Check compatibility between client and server versions
     */
    checkCompatibility(clientVersion: MCPProtocolVersion): CompatibilityResult;
    /**
     * Get information about a specific protocol version
     */
    getVersionInfo(version: MCPProtocolVersion): ProtocolVersionInfo | undefined;
    /**
     * Check if a version is supported
     */
    isVersionSupported(version: MCPProtocolVersion): boolean;
    /**
     * Get the latest supported version
     */
    getLatestSupportedVersion(): MCPProtocolVersion;
    /**
     * Get all supported version strings
     */
    getSupportedVersionStrings(): string[];
    /**
     * Get current server capabilities
     */
    getServerCapabilities(): MCPCapabilities;
    /**
     * Update server capabilities
     */
    updateServerCapabilities(capabilities: Partial<MCPCapabilities>): void;
    /**
     * Check if a feature is supported in a specific version
     */
    isFeatureSupported(version: MCPProtocolVersion, feature: string): boolean;
    private versionToString;
    private compareVersions;
    private getDefaultCapabilities;
    private negotiateCapabilities;
    private negotiateLogLevel;
    private filterCapabilitiesByVersion;
    private getMissingFeatures;
    private getDeprecatedFeatures;
}
//# sourceMappingURL=protocol-manager.d.ts.map