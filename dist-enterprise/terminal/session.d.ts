/**
 * Terminal session management
 */
import type { Terminal } from './adapters/base.js';
import type { AgentProfile } from '../utils/types.js';
import type { ILogger } from '../core/logger.js';
/**
 * Terminal session wrapper
 */
export declare class TerminalSession {
    readonly terminal: Terminal;
    readonly profile: AgentProfile;
    private commandTimeout;
    private logger;
    readonly id: string;
    readonly startTime: Date;
    private initialized;
    private commandHistory;
    private lastCommandTime?;
    private outputListeners;
    constructor(terminal: Terminal, profile: AgentProfile, commandTimeout: number, logger: ILogger);
    get lastActivity(): Date;
    initialize(): Promise<void>;
    executeCommand(command: string): Promise<string>;
    cleanup(): Promise<void>;
    isHealthy(): boolean;
    getCommandHistory(): string[];
    private setupEnvironment;
    private runInitializationCommands;
    private runCleanupCommands;
    private performHealthCheck;
    /**
     * Stream terminal output
     */
    streamOutput(callback: (output: string) => void): () => void;
    /**
     * Notify output listeners
     */
    private notifyOutputListeners;
}
//# sourceMappingURL=session.d.ts.map