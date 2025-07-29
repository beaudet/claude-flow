/**
 * ruv-swarm MCP tools wrapper for Claude Code integration
 *
 * This module provides MCP tools that integrate with the external ruv-swarm
 * package to enable advanced swarm coordination and neural capabilities.
 */
import type { MCPTool, MCPContext } from '../utils/types.js';
import type { ILogger } from '../core/logger.js';
export interface RuvSwarmToolContext extends MCPContext {
    workingDirectory?: string;
    swarmId?: string;
    sessionId: string;
}
/**
 * Interface for ruv-swarm command responses
 */
interface RuvSwarmResponse {
    success: boolean;
    data?: any;
    error?: string;
    metadata?: {
        timestamp: number;
        swarmId?: string;
        sessionId?: string;
        performance?: any;
    };
}
/**
 * Create ruv-swarm MCP tools for Claude Code integration
 *
 * These tools provide access to the full ruv-swarm functionality including:
 * - Swarm initialization and management
 * - Neural agent coordination
 * - Memory and persistence
 * - Performance monitoring
 * - Task orchestration
 */
export declare function createRuvSwarmTools(logger: ILogger): MCPTool[];
/**
 * Check if ruv-swarm is available in the current environment
 */
export declare function isRuvSwarmAvailable(logger?: ILogger): Promise<boolean>;
/**
 * Get ruv-swarm configuration and capabilities
 */
export declare function getRuvSwarmCapabilities(logger?: ILogger): Promise<any>;
/**
 * Initialize ruv-swarm with claude-code-flow integration
 */
export declare function initializeRuvSwarmIntegration(workingDirectory: string, logger?: ILogger): Promise<RuvSwarmResponse>;
declare const _default: {
    createRuvSwarmTools: typeof createRuvSwarmTools;
    isRuvSwarmAvailable: typeof isRuvSwarmAvailable;
    getRuvSwarmCapabilities: typeof getRuvSwarmCapabilities;
    initializeRuvSwarmIntegration: typeof initializeRuvSwarmIntegration;
};
export default _default;
//# sourceMappingURL=ruv-swarm-tools.d.ts.map