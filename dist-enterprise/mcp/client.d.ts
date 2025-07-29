/**
 * MCP Client for Model Context Protocol
 */
import { EventEmitter } from 'node:events';
import type { ITransport } from './transports/base.js';
import type { MCPConfig } from '../utils/types.js';
import { type RecoveryConfig } from './recovery/index.js';
export interface MCPClientConfig {
    transport: ITransport;
    timeout?: number;
    enableRecovery?: boolean;
    recoveryConfig?: RecoveryConfig;
    mcpConfig?: MCPConfig;
}
export declare class MCPClient extends EventEmitter {
    private transport;
    private timeout;
    private connected;
    private recoveryManager?;
    private pendingRequests;
    constructor(config: MCPClientConfig);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    request(method: string, params?: unknown): Promise<unknown>;
    notify(method: string, params?: unknown): Promise<void>;
    isConnected(): boolean;
    /**
     * Get recovery status if recovery is enabled
     */
    getRecoveryStatus(): import("./recovery/recovery-manager.js").RecoveryStatus | undefined;
    /**
     * Force a recovery attempt
     */
    forceRecovery(): Promise<boolean>;
    private setupRecoveryHandlers;
    /**
     * Cleanup resources
     */
    cleanup(): Promise<void>;
}
//# sourceMappingURL=client.d.ts.map