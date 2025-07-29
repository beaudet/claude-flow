"use strict";
/**
 * Multi-LLM Provider Types and Interfaces
 * Unified type system for all LLM providers
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProviderUnavailableError = exports.ModelNotFoundError = exports.AuthenticationError = exports.RateLimitError = exports.LLMProviderError = void 0;
exports.isLLMResponse = isLLMResponse;
exports.isLLMStreamEvent = isLLMStreamEvent;
exports.isLLMProviderError = isLLMProviderError;
exports.isRateLimitError = isRateLimitError;
// ===== ERROR HANDLING =====
class LLMProviderError extends Error {
    constructor(message, code, provider, statusCode, retryable = true, details) {
        super(message);
        this.code = code;
        this.provider = provider;
        this.statusCode = statusCode;
        this.retryable = retryable;
        this.details = details;
        this.name = 'LLMProviderError';
    }
}
exports.LLMProviderError = LLMProviderError;
class RateLimitError extends LLMProviderError {
    constructor(message, provider, retryAfter, details) {
        super(message, 'RATE_LIMIT', provider, 429, true, details);
        this.retryAfter = retryAfter;
        this.name = 'RateLimitError';
    }
}
exports.RateLimitError = RateLimitError;
class AuthenticationError extends LLMProviderError {
    constructor(message, provider, details) {
        super(message, 'AUTHENTICATION', provider, 401, false, details);
        this.name = 'AuthenticationError';
    }
}
exports.AuthenticationError = AuthenticationError;
class ModelNotFoundError extends LLMProviderError {
    constructor(model, provider, details) {
        super(`Model ${model} not found`, 'MODEL_NOT_FOUND', provider, 404, false, details);
        this.name = 'ModelNotFoundError';
    }
}
exports.ModelNotFoundError = ModelNotFoundError;
class ProviderUnavailableError extends LLMProviderError {
    constructor(provider, details) {
        super(`Provider ${provider} is unavailable`, 'PROVIDER_UNAVAILABLE', provider, 503, true, details);
        this.name = 'ProviderUnavailableError';
    }
}
exports.ProviderUnavailableError = ProviderUnavailableError;
// ===== TYPE GUARDS =====
function isLLMResponse(obj) {
    return obj && typeof obj.id === 'string' && typeof obj.content === 'string';
}
function isLLMStreamEvent(obj) {
    return obj && typeof obj.type === 'string';
}
function isLLMProviderError(error) {
    return error instanceof LLMProviderError;
}
function isRateLimitError(error) {
    return error instanceof RateLimitError;
}
//# sourceMappingURL=types.js.map