/**
 * Circuit breaker pattern for fault tolerance
 */
import type { ILogger } from '../core/logger.js';
import type { IEventBus } from '../core/event-bus.js';
export interface CircuitBreakerConfig {
    failureThreshold: number;
    successThreshold: number;
    timeout: number;
    halfOpenLimit: number;
}
export declare enum CircuitState {
    CLOSED = "closed",
    OPEN = "open",
    HALF_OPEN = "half-open"
}
export interface CircuitBreakerMetrics {
    state: CircuitState;
    failures: number;
    successes: number;
    lastFailureTime?: Date;
    lastSuccessTime?: Date;
    totalRequests: number;
    rejectedRequests: number;
    halfOpenRequests: number;
}
/**
 * Circuit breaker for protecting against cascading failures
 */
export declare class CircuitBreaker {
    private name;
    private config;
    private logger;
    private eventBus?;
    private state;
    private failures;
    private successes;
    private lastFailureTime?;
    private lastSuccessTime?;
    private nextAttempt?;
    private halfOpenRequests;
    private totalRequests;
    private rejectedRequests;
    constructor(name: string, config: CircuitBreakerConfig, logger: ILogger, eventBus?: IEventBus | undefined);
    /**
     * Execute a function with circuit breaker protection
     */
    execute<T>(fn: () => Promise<T>): Promise<T>;
    /**
     * Check if execution is allowed
     */
    private canExecute;
    /**
     * Handle successful execution
     */
    private onSuccess;
    /**
     * Handle failed execution
     */
    private onFailure;
    /**
     * Transition to a new state
     */
    private transitionTo;
    /**
     * Force the circuit to a specific state
     */
    forceState(state: CircuitState): void;
    /**
     * Get current state
     */
    getState(): CircuitState;
    /**
     * Get circuit breaker metrics
     */
    getMetrics(): CircuitBreakerMetrics;
    /**
     * Reset the circuit breaker
     */
    reset(): void;
    /**
     * Log state change with consistent format
     */
    private logStateChange;
}
/**
 * Manager for multiple circuit breakers
 */
export declare class CircuitBreakerManager {
    private defaultConfig;
    private logger;
    private eventBus?;
    private breakers;
    constructor(defaultConfig: CircuitBreakerConfig, logger: ILogger, eventBus?: IEventBus | undefined);
    /**
     * Get or create a circuit breaker
     */
    getBreaker(name: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker;
    /**
     * Execute with circuit breaker
     */
    execute<T>(name: string, fn: () => Promise<T>, config?: Partial<CircuitBreakerConfig>): Promise<T>;
    /**
     * Get all circuit breakers
     */
    getAllBreakers(): Map<string, CircuitBreaker>;
    /**
     * Get metrics for all breakers
     */
    getAllMetrics(): Record<string, CircuitBreakerMetrics>;
    /**
     * Reset a specific breaker
     */
    resetBreaker(name: string): void;
    /**
     * Reset all breakers
     */
    resetAll(): void;
    /**
     * Force a breaker to a specific state
     */
    forceState(name: string, state: CircuitState): void;
}
//# sourceMappingURL=circuit-breaker.d.ts.map