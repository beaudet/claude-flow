"use strict";
/**
 * SQLite Wrapper with Windows Fallback Support
 * Provides graceful fallback when better-sqlite3 fails to load
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSQLiteAvailable = isSQLiteAvailable;
exports.getSQLiteDatabase = getSQLiteDatabase;
exports.getLoadError = getLoadError;
exports.createDatabase = createDatabase;
exports.isWindows = isWindows;
exports.getStorageRecommendations = getStorageRecommendations;
const module_1 = require("module");
const path_1 = __importDefault(require("path"));
const url_1 = require("url");
const __filename = (0, url_1.fileURLToPath)(import.meta.url);
const __dirname = path_1.default.dirname(__filename);
let Database = null;
let sqliteAvailable = false;
let loadError = null;
/**
 * Try to load better-sqlite3 with comprehensive error handling
 */
function tryLoadSQLite() {
    try {
        // Try ES module import
        const module = Promise.resolve().then(() => __importStar(require('better-sqlite3')));
        return module.then(m => {
            Database = m.default;
            sqliteAvailable = true;
            return true;
        }).catch(err => {
            loadError = err;
            return false;
        });
    }
    catch (err) {
        // Fallback to CommonJS require
        try {
            const require = (0, module_1.createRequire)(import.meta.url);
            Database = require('better-sqlite3');
            sqliteAvailable = true;
            return Promise.resolve(true);
        }
        catch (requireErr) {
            loadError = requireErr;
            // Check for specific Windows errors
            if (requireErr.message.includes('was compiled against a different Node.js version') ||
                requireErr.message.includes('Could not locate the bindings file') ||
                requireErr.message.includes('The specified module could not be found') ||
                requireErr.code === 'MODULE_NOT_FOUND') {
                console.warn(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                     Windows SQLite Installation Issue                         ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  The native SQLite module failed to load. This is common on Windows when    ║
║  using 'npx' or when node-gyp build tools are not available.               ║
║                                                                              ║
║  Claude Flow will continue with in-memory storage (non-persistent).         ║
║                                                                              ║
║  To enable persistent storage on Windows:                                    ║
║                                                                              ║
║  Option 1 - Install Windows Build Tools:                                    ║
║  > npm install --global windows-build-tools                                 ║
║  > npm install claude-flow@alpha                                           ║
║                                                                              ║
║  Option 2 - Use Pre-built Binaries:                                        ║
║  > npm config set python python3                                           ║
║  > npm install claude-flow@alpha --build-from-source=false                 ║
║                                                                              ║
║  Option 3 - Use WSL (Windows Subsystem for Linux):                         ║
║  Install WSL and run Claude Flow inside a Linux environment                 ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
`);
            }
            return Promise.resolve(false);
        }
    }
}
/**
 * Check if SQLite is available
 */
async function isSQLiteAvailable() {
    if (sqliteAvailable !== null) {
        return sqliteAvailable;
    }
    await tryLoadSQLite();
    return sqliteAvailable;
}
/**
 * Get SQLite Database constructor or null
 */
async function getSQLiteDatabase() {
    if (!sqliteAvailable && loadError === null) {
        await tryLoadSQLite();
    }
    return Database;
}
/**
 * Get the load error if any
 */
function getLoadError() {
    return loadError;
}
/**
 * Create a SQLite database instance with fallback
 */
async function createDatabase(dbPath) {
    const DB = await getSQLiteDatabase();
    if (!DB) {
        throw new Error('SQLite is not available. Use fallback storage instead.');
    }
    try {
        return new DB(dbPath);
    }
    catch (err) {
        // Additional Windows-specific error handling
        if (err.message.includes('EPERM') || err.message.includes('access denied')) {
            throw new Error(`Cannot create database at ${dbPath}. Permission denied. Try using a different directory or running with administrator privileges.`);
        }
        throw err;
    }
}
/**
 * Check if running on Windows
 */
function isWindows() {
    return process.platform === 'win32';
}
/**
 * Get platform-specific storage recommendations
 */
function getStorageRecommendations() {
    if (isWindows()) {
        return {
            recommended: 'in-memory',
            reason: 'Windows native module compatibility',
            alternatives: [
                'Install Windows build tools for SQLite support',
                'Use WSL (Windows Subsystem for Linux)',
                'Use Docker container with Linux'
            ]
        };
    }
    return {
        recommended: 'sqlite',
        reason: 'Best performance and persistence',
        alternatives: ['in-memory for testing']
    };
}
// Pre-load SQLite on module import
tryLoadSQLite().catch(() => {
    // Silently handle initial load failure
});
exports.default = {
    isSQLiteAvailable,
    getSQLiteDatabase,
    getLoadError,
    createDatabase,
    isWindows,
    getStorageRecommendations
};
//# sourceMappingURL=sqlite-wrapper.js.map