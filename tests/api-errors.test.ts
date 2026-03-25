import assert from 'node:assert/strict'
import test from 'node:test'

import {ApiRequestError, resolveApiErrorMessage} from '../src/lib/api-errors.ts'

const dict = {
    errors: {
        downloadError: 'Generic error',
        api: {
            BAD_REQUEST: 'Bad request message',
            INVALID_JSON: 'INVALID_JSON',
            UNSUPPORTED_PLATFORM: 'UNSUPPORTED_PLATFORM',
            PLATFORM_MISMATCH: 'PLATFORM_MISMATCH',
            INVALID_DOWNLOAD_TYPE: 'INVALID_DOWNLOAD_TYPE',
            INVALID_QUALITY: 'INVALID_QUALITY',
            NOT_FOUND: 'NOT_FOUND',
            DOWNLOAD_URL_NOT_FOUND: 'DOWNLOAD_URL_NOT_FOUND',
            RATE_LIMITED: 'RATE_LIMITED',
            UPSTREAM_ERROR: 'UPSTREAM_ERROR',
            SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
            INTERNAL_ERROR: 'INTERNAL_ERROR',
            FEEDBACK_SUBMIT_FAILED: 'FEEDBACK_SUBMIT_FAILED',
            MEDIA_PROCESSOR_INIT_FAILED: 'MEDIA_PROCESSOR_INIT_FAILED',
            PARSE_FAILED: 'PARSE_FAILED',
        },
    },
} as const

test('uses localized message when api error code is known', () => {
    const error = new ApiRequestError({code: 'BAD_REQUEST'})
    assert.equal(resolveApiErrorMessage(error, dict as never), 'Bad request message')
})

test('falls back to backend message when api code is missing', () => {
    const error = new ApiRequestError({fallbackMessage: 'Backend message'})
    assert.equal(resolveApiErrorMessage(error, dict as never), 'Backend message')
})

test('falls back to generic message when error payload is empty', () => {
    const error = new ApiRequestError({})
    assert.equal(resolveApiErrorMessage(error, dict as never), 'Generic error')
})
