// ========================================
// LOGGER - Vehicle Monitoring
// ========================================
// Standardized logging utility for consistent error handling

import { LOG_LEVEL } from './constants.js';

// Log levels
const isDevelopment = typeof window !== 'undefined' && window.location.hostname === 'localhost';

/**
 * Log critical errors that require immediate attention
 * @param {string} message - Error message
 * @param {Error|object} error - Error object or additional data
 * @param {string} context - Context where error occurred (optional)
 */
export function logError(message, error = null, context = null) {
    const prefix = context ? `[${context}]` : '';
    console.error(`❌ ${prefix} ${message}`, error || '');
}

/**
 * Log warnings for recoverable issues
 * @param {string} message - Warning message
 * @param {object} data - Additional data (optional)
 * @param {string} context - Context where warning occurred (optional)
 */
export function logWarn(message, data = null, context = null) {
    const prefix = context ? `[${context}]` : '';
    console.warn(`⚠️ ${prefix} ${message}`, data || '');
}

/**
 * Log debug information (only in development)
 * @param {string} message - Debug message
 * @param {object} data - Additional data (optional)
 * @param {string} context - Context where debug occurred (optional)
 */
export function logDebug(message, data = null, context = null) {
    if (isDevelopment) {
        const prefix = context ? `[${context}]` : '';
        console.debug(`🔍 ${prefix} ${message}`, data || '');
    }
}

/**
 * Log general information
 * @param {string} message - Info message
 * @param {object} data - Additional data (optional)
 * @param {string} context - Context where info occurred (optional)
 */
export function logInfo(message, data = null, context = null) {
    const prefix = context ? `[${context}]` : '';
    console.log(`ℹ️ ${prefix} ${message}`, data || '');
}

/**
 * Log success messages
 * @param {string} message - Success message
 * @param {object} data - Additional data (optional)
 * @param {string} context - Context where success occurred (optional)
 */
export function logSuccess(message, data = null, context = null) {
    const prefix = context ? `[${context}]` : '';
    console.log(`✅ ${prefix} ${message}`, data || '');
}
