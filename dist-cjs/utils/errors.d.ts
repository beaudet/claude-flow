/**
 * Custom error types for Claude-Flow
 */
/**
 * Base error class for all Claude-Flow errors
 */
export declare class ClaudeFlowError extends Error {
    readonly code: string;
    readonly details?: unknown | undefined;
    constructor(message: string, code: string, details?: unknown | undefined);
    toJSON(): {
        name: string;
        message: string;
        code: string;
        details: unknown;
        stack: string | undefined;
    };
}
/**
 * Terminal-related errors
 */
export declare class TerminalError extends ClaudeFlowError {
    constructor(message: string, details?: unknown);
}
export declare class TerminalSpawnError extends TerminalError {
    readonly code = "TERMINAL_SPAWN_ERROR";
    constructor(message: string, details?: unknown);
}
export declare class TerminalCommandError extends TerminalError {
    readonly code = "TERMINAL_COMMAND_ERROR";
    constructor(message: string, details?: unknown);
}
/**
 * Memory-related errors
 */
export declare class MemoryError extends ClaudeFlowError {
    constructor(message: string, details?: unknown);
}
export declare class MemoryBackendError extends MemoryError {
    readonly code = "MEMORY_BACKEND_ERROR";
    constructor(message: string, details?: unknown);
}
export declare class MemoryConflictError extends MemoryError {
    readonly code = "MEMORY_CONFLICT_ERROR";
    constructor(message: string, details?: unknown);
}
/**
 * Coordination-related errors
 */
export declare class CoordinationError extends ClaudeFlowError {
    constructor(message: string, details?: unknown);
}
export declare class DeadlockError extends CoordinationError {
    readonly agents: string[];
    readonly resources: string[];
    readonly code = "DEADLOCK_ERROR";
    constructor(message: string, agents: string[], resources: string[]);
}
export declare class ResourceLockError extends CoordinationError {
    readonly code = "RESOURCE_LOCK_ERROR";
    constructor(message: string, details?: unknown);
}
/**
 * MCP-related errors
 */
export declare class MCPError extends ClaudeFlowError {
    constructor(message: string, details?: unknown);
}
export declare class MCPTransportError extends MCPError {
    readonly code = "MCP_TRANSPORT_ERROR";
    constructor(message: string, details?: unknown);
}
export declare class MCPMethodNotFoundError extends MCPError {
    readonly code = "MCP_METHOD_NOT_FOUND";
    constructor(method: string);
}
/**
 * Configuration errors
 */
export declare class ConfigError extends ClaudeFlowError {
    constructor(message: string, details?: unknown);
}
export declare class ValidationError extends ConfigError {
    readonly code = "VALIDATION_ERROR";
    constructor(message: string, details?: unknown);
}
/**
 * Task-related errors
 */
export declare class TaskError extends ClaudeFlowError {
    constructor(message: string, details?: unknown);
}
export declare class TaskTimeoutError extends TaskError {
    readonly code = "TASK_TIMEOUT_ERROR";
    constructor(taskId: string, timeout: number);
}
export declare class TaskDependencyError extends TaskError {
    readonly code = "TASK_DEPENDENCY_ERROR";
    constructor(taskId: string, dependencies: string[]);
}
/**
 * System errors
 */
export declare class SystemError extends ClaudeFlowError {
    constructor(message: string, details?: unknown);
}
export declare class InitializationError extends SystemError {
    readonly code = "INITIALIZATION_ERROR";
    constructor(componentOrMessage: string, details?: unknown);
}
export declare class ShutdownError extends SystemError {
    readonly code = "SHUTDOWN_ERROR";
    constructor(message: string, details?: unknown);
}
/**
 * Error utilities
 */
export declare function isClaudeFlowError(error: unknown): error is ClaudeFlowError;
export declare function formatError(error: unknown): string;
export declare function getErrorDetails(error: unknown): unknown;
//# sourceMappingURL=errors.d.ts.map