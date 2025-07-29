/**
 * Session manager for MCP connections
 */
import { MCPSession, MCPInitializeParams, MCPConfig } from '../utils/types.js';
import type { ILogger } from '../core/logger.js';
export interface ISessionManager {
    createSession(transport: 'stdio' | 'http' | 'websocket'): MCPSession;
    getSession(id: string): MCPSession | undefined;
    initializeSession(sessionId: string, params: MCPInitializeParams): void;
    authenticateSession(sessionId: string, credentials: unknown): boolean;
    updateActivity(sessionId: string): void;
    removeSession(sessionId: string): void;
    getActiveSessions(): MCPSession[];
    cleanupExpiredSessions(): void;
    getSessionMetrics(): {
        total: number;
        active: number;
        authenticated: number;
        expired: number;
    };
}
/**
 * Session manager implementation
 */
export declare class SessionManager implements ISessionManager {
    private config;
    private logger;
    private sessions;
    private authConfig;
    private sessionTimeout;
    private maxSessions;
    private cleanupInterval?;
    constructor(config: MCPConfig, logger: ILogger);
    createSession(transport: 'stdio' | 'http' | 'websocket'): MCPSession;
    getSession(id: string): MCPSession | undefined;
    initializeSession(sessionId: string, params: MCPInitializeParams): void;
    authenticateSession(sessionId: string, credentials: unknown): boolean;
    updateActivity(sessionId: string): void;
    removeSession(sessionId: string): void;
    getActiveSessions(): MCPSession[];
    cleanupExpiredSessions(): void;
    getSessionMetrics(): {
        total: number;
        active: number;
        authenticated: number;
        expired: number;
    };
    destroy(): void;
    private generateSessionId;
    private isSessionExpired;
    private validateProtocolVersion;
    private authenticateToken;
    private authenticateBasic;
    private authenticateOAuth;
    private extractToken;
    private extractBasicAuth;
    private extractAuthData;
    private hashPassword;
}
//# sourceMappingURL=session-manager.d.ts.map