/**
 * Terminal pool management
 */
import type { Terminal, ITerminalAdapter } from './adapters/base.js';
import type { ILogger } from '../core/logger.js';
/**
 * Terminal pool for efficient resource management
 */
export declare class TerminalPool {
    private maxSize;
    private recycleAfter;
    private adapter;
    private logger;
    private terminals;
    private availableQueue;
    private initializationPromise?;
    constructor(maxSize: number, recycleAfter: number, adapter: ITerminalAdapter, logger: ILogger);
    initialize(): Promise<void>;
    private doInitialize;
    shutdown(): Promise<void>;
    acquire(): Promise<Terminal>;
    release(terminal: Terminal): Promise<void>;
    getHealthStatus(): Promise<{
        healthy: boolean;
        size: number;
        available: number;
        recycled: number;
    }>;
    performMaintenance(): Promise<void>;
    private createPooledTerminal;
}
//# sourceMappingURL=pool.d.ts.map