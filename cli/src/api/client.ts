import type { ApiErrorCode, ApiErrorDetails, UnifiedParseResult, UnifiedApiResponse } from '../types.js'
import { ApiRequestError } from '../api-errors.js'
import { parseUrl, detectPlatform } from '../parsers/index.js'

// 默认本地开发地址（备用）
const DEFAULT_API_BASE_URL = 'http://localhost:8080'

/**
 * 获取 API 基础 URL（用于备用外部服务）
 */
export function getApiBaseUrl(): string {
    const envUrl = process.env.GALAXY_API_BASE_URL?.trim() || process.env.API_BASE_URL?.trim()
    return envUrl || DEFAULT_API_BASE_URL
}

/**
 * 检测服务是否可用
 */
export async function checkServiceAvailable(url: string): Promise<boolean> {
    try {
        const response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(3000) })
        return response.ok || response.status < 500
    } catch {
        return false
    }
}

/**
 * 解析媒体 URL（使用内置解析器）
 */
export async function parseMediaUrl(videoUrl: string, useBuiltin: boolean = true): Promise<NonNullable<UnifiedParseResult['data']>> {
    // 优先使用内置解析器
    if (useBuiltin) {
        const platform = detectPlatform(videoUrl)
        console.log(`[解析] 平台: ${platform}`)

        if (platform !== 'unknown') {
            const result = await parseUrl(videoUrl)

            if (result.success && result.data) {
                return result.data
            }

            // 内置解析失败，提示错误
            throw new ApiRequestError({
                code: result.code,
                fallbackMessage: result.error || '解析失败',
            })
        }
    }

    // 如果内置解析不支持，尝试外部服务
    const apiBaseUrl = getApiBaseUrl()
    if (await checkServiceAvailable(apiBaseUrl)) {
        return await parseViaExternalService(videoUrl, apiBaseUrl)
    }

    throw new ApiRequestError({
        code: 'UNSUPPORTED_PLATFORM',
        fallbackMessage: '无法解析此链接，请确认链接有效或配置外部解析服务',
    })
}

/**
 * 通过外部服务解析（备用）
 */
async function parseViaExternalService(videoUrl: string, baseUrl: string): Promise<NonNullable<UnifiedParseResult['data']>> {
    const params = new URLSearchParams({ url: videoUrl })
    const url = `${baseUrl}/api/parse?${params.toString()}`

    const response = await fetch(url, { cache: 'no-store' })

    let payload: UnifiedApiResponse<NonNullable<UnifiedParseResult['data']>> | null = null
    try {
        payload = await response.json()
    } catch {
        throw new ApiRequestError({
            status: response.status,
            fallbackMessage: `HTTP ${response.status}: ${response.statusText}`,
        })
    }

    if (!response.ok || !payload?.success || !payload.data) {
        throw new ApiRequestError({
            code: payload?.code,
            status: payload?.status ?? response.status,
            requestId: payload?.requestId,
            details: payload?.details,
            fallbackMessage: payload?.error || payload?.message,
        })
    }

    return payload.data
}

/**
 * 自动选择解析方式
 */
export async function resolveApiBaseUrl(autoStartProxy: boolean = false): Promise<string> {
    // 对于内置解析，返回标记
    return 'builtin'
}