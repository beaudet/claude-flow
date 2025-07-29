/**
 * Terminal manager interface and implementation
 */
import type { AgentProfile, AgentSession, TerminalConfig } from '../utils/types.js';
import type { IEventBus } from '../core/event-bus.js';
import type { ILogger } from '../core/logger.js';
import { TerminalSession } from './session.js';
export interface ITerminalManager {
    initialize(): Promise<void>;
    shutdown(): Promise<void>;
    spawnTerminal(profile: AgentProfile): Promise<string>;
    terminateTerminal(terminalId: string): Promise<void>;
    executeCommand(terminalId: string, command: string): Promise<string>;
    getHealthStatus(): Promise<{
        healthy: boolean;
        error?: string;
        metrics?: Record<string, number>;
    }>;
    performMaintenance(): Promise<void>;
}
/**
 * Terminal manager implementation
 */
export declare class TerminalManager implements ITerminalManager {
    private config;
    private eventBus;
    private logger;
    private adapter;
    private pool;
    private sessions;
    private initialized;
    constructor(config: TerminalConfig, eventBus: IEventBus, logger: ILogger);
    initialize(): Promise<void>;
    shutdown(): Promise<void>;
    spawnTerminal(profile: AgentProfile): Promise<string>;
    terminateTerminal(terminalId: string): Promise<void>;
    executeCommand(terminalId: string, command: string): Promise<string>;
    getHealthStatus(): Promise<{
        healthy: boolean;
        error?: string;
        metrics?: Record<string, number>;
    }>;
    performMaintenance(): Promise<void>;
    /**
     * Get all active sessions
     */
    getActiveSessions(): AgentSession[];
    /**
     * Get session by ID
     */
    getSession(sessionId: string): TerminalSession | undefined;
    /**
     * Stream terminal output
     */
    streamOutput(terminalId: string, callback: (output: string) => void): Promise<() => void>;
    private createAdapter;
    private isVSCodeEnvironment;
}
//# sourceMappingURL=manager.d.ts.map