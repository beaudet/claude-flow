/**
 * Universal module utilities for ESM/CJS compatibility
 * Provides consistent behavior across module systems
 */
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
/**
 * Get current file path in both ESM and CJS environments
 */
export function getCurrentFilePath(importMetaUrl) {
    // Check if we're in CJS environment first
    if (typeof __filename !== 'undefined') {
        // CJS environment
        return __filename;
    }
    else if (typeof importMetaUrl === 'string') {
        // ESM environment
        return fileURLToPath(importMetaUrl);
    }
    else {
        // Fallback - try to construct from module system
        try {
            // This will work in CJS
            return eval('__filename');
        }
        catch {
            throw new Error('Unable to determine current file path in current module system');
        }
    }
}
/**
 * Get current directory path in both ESM and CJS environments
 */
export function getCurrentDirPath(importMetaUrl) {
    return dirname(getCurrentFilePath(importMetaUrl));
}
/**
 * Get project root path relative to current file
 */
export function getProjectRoot(importMetaUrl) {
    const currentPath = getCurrentFilePath(importMetaUrl);
    // Find project root by looking for src directory
    const srcIndex = currentPath.indexOf('/src/');
    if (srcIndex !== -1) {
        return currentPath.substring(0, srcIndex);
    }
    // Fallback: assume we're in a standard project structure
    return resolve(getCurrentDirPath(importMetaUrl), '../..');
}
/**
 * Check if running as main module in both ESM and CJS
 */
export function isMainModule(importMetaUrl) {
    // Check CJS first
    try {
        if (typeof require !== 'undefined') {
            const req = eval('require');
            if (req.main) {
                return req.main === eval('module');
            }
        }
    }
    catch {
        // Ignore CJS check errors
    }
    // ESM environment
    if (typeof importMetaUrl === 'string') {
        return importMetaUrl === `file://${process.argv[1]}`;
    }
    return false;
}
/**
 * Create cross-compatible dirname and filename variables
 */
export function createCompatDirname(importMetaUrl) {
    // For CJS, return the actual global variables if available
    try {
        if (typeof __filename !== 'undefined' && typeof __dirname !== 'undefined') {
            return { __filename, __dirname };
        }
    }
    catch {
        // Ignore if globals not available
    }
    // For ESM or when CJS globals not available
    const filename = getCurrentFilePath(importMetaUrl);
    return {
        __filename: filename,
        __dirname: dirname(filename),
    };
}
//# sourceMappingURL=module-utils.js.map