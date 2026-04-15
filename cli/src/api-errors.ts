import type { ApiErrorCode, ApiErrorDetails } from './types.js'

export class ApiRequestError extends Error {
    readonly code?: ApiErrorCode | string
    readonly status?: number
    readonly requestId?: string
    readonly details?: ApiErrorDetails
    readonly fallbackMessage?: string

    constructor(options: {
        code?: ApiErrorCode | string
        status?: number
        requestId?: string
        details?: ApiErrorDetails
        fallbackMessage?: string
    }) {
        super(options.code || options.fallbackMessage || 'API request failed')
        this.name = 'ApiRequestError'
        this.code = options.code
        this.status = options.status
        this.requestId = options.requestId
        this.details = options.details
        this.fallbackMessage = options.fallbackMessage
    }
}

export function isApiRequestError(error: unknown): error is ApiRequestError {
    return error instanceof ApiRequestError
}

/**
 * CLI 专用：获取错误消息（无需 dict）
 */
export function getErrorMessage(error: unknown): string {
    if (isApiRequestError(error)) {
        if (error.fallbackMessage?.trim()) {
            return error.fallbackMessage
        }
        if (error.code) {
            return `Error: ${error.code}`
        }
        return `Error: ${error.status || 'unknown'}`
    }

    if (error instanceof Error && error.message.trim()) {
        return error.message
    }

    return 'Unknown error'
}