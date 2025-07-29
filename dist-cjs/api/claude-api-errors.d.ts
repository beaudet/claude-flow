/**
 * Claude API specific error types with enhanced error handling
 */
import { ClaudeFlowError } from '../utils/errors.js';
/**
 * Base error class for Claude API errors
 */
export declare class ClaudeAPIError extends ClaudeFlowError {
    readonly statusCode?: number | undefined;
    readonly retryable: boolean;
    constructor(message: string, statusCode?: number | undefined, retryable?: boolean, details?: unknown);
}
/**
 * Error for 500 Internal Server Error
 */
export declare class ClaudeInternalServerError extends ClaudeAPIError {
    constructor(message: string, details?: unknown);
}
/**
 * Error for 503 Service Unavailable
 */
export declare class ClaudeServiceUnavailableError extends ClaudeAPIError {
    constructor(message: string, details?: unknown);
}
/**
 * Error for 429 Too Many Requests (Rate Limit)
 */
export declare class ClaudeRateLimitError extends ClaudeAPIError {
    readonly retryAfter?: number | undefined;
    constructor(message: string, retryAfter?: number | undefined, details?: unknown);
}
/**
 * Error for network timeouts
 */
export declare class ClaudeTimeoutError extends ClaudeAPIError {
    readonly timeout: number;
    constructor(message: string, timeout: number, details?: unknown);
}
/**
 * Error for network-related issues
 */
export declare class ClaudeNetworkError extends ClaudeAPIError {
    constructor(message: string, details?: unknown);
}
/**
 * Error for authentication issues
 */
export declare class ClaudeAuthenticationError extends ClaudeAPIError {
    constructor(message: string, details?: unknown);
}
/**
 * Error for invalid requests
 */
export declare class ClaudeValidationError extends ClaudeAPIError {
    constructor(message: string, details?: unknown);
}
/**
 * Health check result
 */
export interface HealthCheckResult {
    healthy: boolean;
    latency?: number;
    error?: string;
    timestamp: Date;
}
/**
 * User-friendly error messages and fallback suggestions
 */
export declare const ERROR_MESSAGES: {
    INTERNAL_SERVER_ERROR: {
        title: string;
        message: string;
        suggestions: string[];
    };
    SERVICE_UNAVAILABLE: {
        title: string;
        message: string;
        suggestions: string[];
    };
    RATE_LIMIT: {
        title: string;
        message: string;
        suggestions: string[];
    };
    TIMEOUT: {
        title: string;
        message: string;
        suggestions: string[];
    };
    NETWORK_ERROR: {
        title: string;
        message: string;
        suggestions: string[];
    };
    AUTHENTICATION: {
        title: string;
        message: string;
        suggestions: string[];
    };
    VALIDATION: {
        title: string;
        message: string;
        suggestions: string[];
    };
};
/**
 * Get user-friendly error information
 */
export declare function getUserFriendlyError(error: ClaudeAPIError): {
    title: string;
    message: string;
    suggestions: string[];
    retryable: boolean;
};
//# sourceMappingURL=claude-api-errors.d.ts.map