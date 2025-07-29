/**
 * Utility for proper error handling in TypeScript
 */
import { getErrorMessage as getErrorMsg, getErrorStack as getErrorStk, isError as isErr } from './type-guards.js';
export declare class AppError extends Error {
    code?: string | undefined;
    statusCode?: number | undefined;
    constructor(message: string, code?: string | undefined, statusCode?: number | undefined);
}
export declare const isError: typeof isErr;
export declare const getErrorMessage: typeof getErrorMsg;
export declare const getErrorStack: typeof getErrorStk;
export declare function handleError(error: unknown, context?: string): never;
//# sourceMappingURL=error-handler.d.ts.map