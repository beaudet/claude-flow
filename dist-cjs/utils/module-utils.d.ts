/**
 * Universal module utilities for ESM/CJS compatibility
 * Provides consistent behavior across module systems
 */
/**
 * Get current file path in both ESM and CJS environments
 */
export declare function getCurrentFilePath(importMetaUrl?: string): string;
/**
 * Get current directory path in both ESM and CJS environments
 */
export declare function getCurrentDirPath(importMetaUrl?: string): string;
/**
 * Get project root path relative to current file
 */
export declare function getProjectRoot(importMetaUrl?: string): string;
/**
 * Check if running as main module in both ESM and CJS
 */
export declare function isMainModule(importMetaUrl?: string): boolean;
/**
 * Create cross-compatible dirname and filename variables
 */
export declare function createCompatDirname(importMetaUrl?: string): {
    __dirname: string;
    __filename: string;
};
//# sourceMappingURL=module-utils.d.ts.map