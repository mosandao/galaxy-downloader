import type {Dictionary} from '@/lib/i18n/types'
import type {ApiErrorCode, ApiErrorDetails} from '@/lib/types'

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
        super(options.code || options.fallbackMessage || '')
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

export function resolveApiErrorMessage(error: unknown, dict: Dictionary): string {
    return resolveApiErrorMessageWithFallback(error, dict, dict.errors.downloadError)
}

export function resolveApiErrorMessageWithFallback(
    error: unknown,
    dict: Dictionary,
    fallbackMessage: string
): string {
    if (isApiRequestError(error)) {
        const {code, fallbackMessage} = error

        if (code && code in dict.errors.api) {
            return dict.errors.api[code as keyof typeof dict.errors.api]
        }

        if (fallbackMessage?.trim()) {
            return fallbackMessage
        }
    }

    if (error instanceof Error && error.message.trim()) {
        return error.message
    }

    return fallbackMessage
}
