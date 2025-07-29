import type { ITerminalAdapter, Terminal } from './base.js';
import type { ILogger } from '../../core/logger.js';
/**
 * Native terminal adapter
 */
export declare class NativeAdapter implements ITerminalAdapter {
    private logger;
    private terminals;
    private shell;
    constructor(logger: ILogger);
    initialize(): Promise<void>;
    shutdown(): Promise<void>;
    createTerminal(): Promise<Terminal>;
    destroyTerminal(terminal: Terminal): Promise<void>;
    private detectShell;
    private isShellSupported;
    private getTestCommand;
}
//# sourceMappingURL=native.d.ts.map