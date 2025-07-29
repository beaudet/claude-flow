/**
 * Claude-Flow specific MCP tools
 */
import type { MCPTool, MCPContext } from '../utils/types.js';
import type { ILogger } from '../core/logger.js';
export interface ClaudeFlowToolContext extends MCPContext {
    orchestrator?: any;
}
/**
 * Create all Claude-Flow specific MCP tools
 */
export declare function createClaudeFlowTools(logger: ILogger): MCPTool[];
//# sourceMappingURL=claude-flow-tools.d.ts.map