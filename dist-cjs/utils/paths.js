"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getClaudeFlowRoot = getClaudeFlowRoot;
exports.getClaudeFlowBin = getClaudeFlowBin;
exports.resolveProjectPath = resolveProjectPath;
const path_1 = require("path");
const fs_1 = require("fs");
const module_utils_js_1 = require("./module-utils.js");
const { __dirname } = (0, module_utils_js_1.createCompatDirname)();
function getClaudeFlowRoot() {
    // Try multiple strategies to find the root
    const strategies = [
        // Strategy 1: From current file location
        (0, path_1.resolve)(__dirname, '../..'),
        // Strategy 2: From process.cwd()
        process.cwd(),
        // Strategy 3: From npm global location
        (0, path_1.resolve)(process.execPath, '../../lib/node_modules/claude-flow'),
        // Strategy 4: From environment variable
        process.env.CLAUDE_FLOW_ROOT || '',
    ];
    for (const path of strategies) {
        if (path && (0, fs_1.existsSync)((0, path_1.join)(path, 'package.json'))) {
            try {
                const pkgPath = (0, path_1.join)(path, 'package.json');
                const pkgContent = (0, fs_1.readFileSync)(pkgPath, 'utf-8');
                const pkg = JSON.parse(pkgContent);
                if (pkg.name === 'claude-flow') {
                    return path;
                }
            }
            catch {
                // Ignore errors and try next strategy
            }
        }
    }
    // Fallback to current working directory
    return process.cwd();
}
function getClaudeFlowBin() {
    return (0, path_1.join)(getClaudeFlowRoot(), 'bin', 'claude-flow');
}
function resolveProjectPath(relativePath) {
    const root = getClaudeFlowRoot();
    return (0, path_1.resolve)(root, relativePath);
}
//# sourceMappingURL=paths.js.map