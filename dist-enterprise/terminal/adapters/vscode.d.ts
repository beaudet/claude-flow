/**
 * VSCode terminal adapter implementation
 */
import type { ITerminalAdapter, Terminal } from './base.js';
import type { ILogger } from '../../core/logger.js';
/**
 * VSCode terminal adapter
 */
export declare class VSCodeAdapter implements ITerminalAdapter {
    private logger;
    private terminals;
    private vscodeApi?;
    private shellType;
    private terminalCloseListener?;
    constructor(logger: ILogger);
    initialize(): Promise<void>;
    shutdown(): Promise<void>;
    createTerminal(): Promise<Terminal>;
    destroyTerminal(terminal: Terminal): Promise<void>;
    private isVSCodeExtensionContext;
    private detectShell;
}
//# sourceMappingURL=vscode.d.ts.map