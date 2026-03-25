/**
 * API Configuration
 */

/**
 * API Endpoints
 * These paths are relative to the app itself and are proxied by a route handler.
 */
export const API_ENDPOINTS = {
    // 统一接口
    unified: {
        parse: '/v1/parse',
        download: '/v1/download',
    },
} as const;
