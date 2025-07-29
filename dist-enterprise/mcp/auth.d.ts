/**
 * Authentication and authorization for MCP
 */
import type { MCPAuthConfig, MCPSession } from '../utils/types.js';
import type { ILogger } from '../core/logger.js';
export interface IAuthManager {
    authenticate(credentials: unknown): Promise<AuthResult>;
    authorize(session: MCPSession, permission: string): boolean;
    validateToken(token: string): Promise<TokenValidation>;
    generateToken(userId: string, permissions: string[]): Promise<string>;
    revokeToken(token: string): Promise<void>;
}
export interface AuthResult {
    success: boolean;
    user?: string;
    permissions?: string[];
    token?: string;
    error?: string;
}
export interface TokenValidation {
    valid: boolean;
    user?: string;
    permissions?: string[];
    expiresAt?: Date;
    error?: string;
}
/**
 * Authentication manager implementation
 */
export declare class AuthManager implements IAuthManager {
    private config;
    private logger;
    private revokedTokens;
    private tokenStore;
    constructor(config: MCPAuthConfig, logger: ILogger);
    authenticate(credentials: unknown): Promise<AuthResult>;
    authorize(session: MCPSession, permission: string): boolean;
    validateToken(token: string): Promise<TokenValidation>;
    generateToken(userId: string, permissions: string[]): Promise<string>;
    revokeToken(token: string): Promise<void>;
    private authenticateToken;
    private authenticateBasic;
    private authenticateOAuth;
    private extractToken;
    private extractBasicAuth;
    private verifyPassword;
    private hashPassword;
    private timingSafeEqual;
    private createSecureToken;
    private cleanupExpiredTokens;
}
/**
 * Permission constants for common operations
 */
export declare const Permissions: {
    readonly SYSTEM_INFO: "system.info";
    readonly SYSTEM_HEALTH: "system.health";
    readonly SYSTEM_METRICS: "system.metrics";
    readonly TOOLS_LIST: "tools.list";
    readonly TOOLS_INVOKE: "tools.invoke";
    readonly TOOLS_DESCRIBE: "tools.describe";
    readonly AGENTS_LIST: "agents.list";
    readonly AGENTS_SPAWN: "agents.spawn";
    readonly AGENTS_TERMINATE: "agents.terminate";
    readonly AGENTS_INFO: "agents.info";
    readonly TASKS_LIST: "tasks.list";
    readonly TASKS_CREATE: "tasks.create";
    readonly TASKS_CANCEL: "tasks.cancel";
    readonly TASKS_STATUS: "tasks.status";
    readonly MEMORY_READ: "memory.read";
    readonly MEMORY_WRITE: "memory.write";
    readonly MEMORY_QUERY: "memory.query";
    readonly MEMORY_DELETE: "memory.delete";
    readonly ADMIN_CONFIG: "admin.config";
    readonly ADMIN_LOGS: "admin.logs";
    readonly ADMIN_SESSIONS: "admin.sessions";
    readonly ALL: "*";
};
export type Permission = (typeof Permissions)[keyof typeof Permissions];
//# sourceMappingURL=auth.d.ts.map