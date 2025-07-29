export interface SparcMode {
    name: string;
    description: string;
    tools?: string[];
    usagePattern?: string;
    bestPractices?: string[];
    integrationCapabilities?: string[];
    instructions?: string;
    systemPrompt?: string;
}
export declare function loadSparcModes(): Promise<SparcMode[]>;
//# sourceMappingURL=sparc-modes.d.ts.map