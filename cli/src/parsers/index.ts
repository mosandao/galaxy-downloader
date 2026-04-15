/**
 * 内置平台解析器
 *
 * 解析各平台的媒体链接，获取下载地址
 */

import type { CanonicalPlatform, UnifiedParseResult, MediaActions } from '../types.js'

export interface ParseContext {
    url: string
    platform: CanonicalPlatform
}

export interface ParserResult {
    success: boolean
    data?: NonNullable<UnifiedParseResult['data']>
    error?: string
    code?: string
}

/**
 * 平台解析器接口
 */
export interface PlatformParser {
    name: CanonicalPlatform
    patterns: RegExp[]
    parse(ctx: ParseContext): Promise<ParserResult>
}

/**
 * 从 URL 提取平台类型
 */
export function detectPlatform(url: string): CanonicalPlatform {
    const urlStr = url.toLowerCase()

    if (urlStr.includes('bilibili.com') || urlStr.includes('b23.tv')) {
        return 'bilibili'
    }
    if (urlStr.includes('douyin.com') || urlStr.includes('v.douyin.com')) {
        return 'douyin'
    }
    if (urlStr.includes('tiktok.com') || urlStr.includes('vm.tiktok.com')) {
        return 'tiktok'
    }
    if (urlStr.includes('instagram.com')) {
        return 'instagram'
    }
    if (urlStr.includes('xiaohongshu.com') || urlStr.includes('xhslink.com')) {
        return 'xiaohongshu'
    }
    if (urlStr.includes('x.com') || urlStr.includes('twitter.com')) {
        return 'x'
    }
    if (urlStr.includes('youtube.com') || urlStr.includes('youtu.be')) {
        return 'youtube'
    }
    if (urlStr.includes('weibo.com') || urlStr.includes('weibo.cn')) {
        return 'weibo'
    }
    if (urlStr.includes('weixin.qq.com') || urlStr.includes('mp.weixin.qq.com')) {
        return 'wechat'
    }

    return 'unknown'
}

/**
 * 获取默认媒体操作
 */
export function getDefaultMediaActions(platform: CanonicalPlatform, hasVideo: boolean, hasAudio: boolean): MediaActions {
    const audioExtractPlatforms = ['douyin', 'tiktok', 'instagram', 'x', 'xiaohongshu', 'weibo', 'threads']

    return {
        video: hasVideo ? 'direct-download' : 'hide',
        audio: hasAudio
            ? (audioExtractPlatforms.includes(platform) ? 'extract-audio' : 'direct-download')
            : 'hide',
    }
}

/**
 * 统一解析入口
 */
export async function parseUrl(url: string): Promise<ParserResult> {
    // 1. 检测平台
    const platform = detectPlatform(url)
    if (platform === 'unknown') {
        return {
            success: false,
            error: '不支持的平台',
            code: 'UNSUPPORTED_PLATFORM',
        }
    }

    // 2. 预处理 URL（处理短链接）
    const processedUrl = await resolveShortUrl(url)

    // 3. 获取对应解析器
    const parser = getParser(platform)
    if (!parser) {
        return {
            success: false,
            error: `${platform} 平台解析器尚未实现`,
            code: 'UNSUPPORTED_PLATFORM',
        }
    }

    // 4. 执行解析
    return parser.parse({ url: processedUrl, platform })
}

/**
 * 解析短链接（获取真实 URL）
 */
async function resolveShortUrl(url: string): Promise<string> {
    const shortLinkPatterns = [
        /v\.douyin\.com/,
        /vm\.tiktok\.com/,
        /b23\.tv/,
        /xhslink\.com/,
        /t\.cn/,
    ]

    for (const pattern of shortLinkPatterns) {
        if (pattern.test(url)) {
            try {
                const response = await fetch(url, {
                    method: 'HEAD',
                    redirect: 'follow',
                    signal: AbortSignal.timeout(5000),
                })
                return response.url || url
            } catch {
                // 无法解析短链接，使用原始 URL
                return url
            }
        }
    }

    return url
}

/**
 * 获取平台解析器
 */
function getParser(platform: CanonicalPlatform): PlatformParser | null {
    switch (platform) {
        case 'douyin':
            return douyinParser
        case 'tiktok':
            return tiktokParser
        case 'xiaohongshu':
            return xiaohongshuParser
        case 'x':
            return xParser
        case 'instagram':
            return instagramParser
        case 'bilibili':
            return bilibiliParser
        // 其他平台待实现: youtube, weibo, wechat
        default:
            return null
    }
}

// 导入各平台解析器（按需实现）
import { douyinParser } from './douyin.js'
import { tiktokParser } from './tiktok.js'
import { xiaohongshuParser } from './xiaohongshu.js'
import { xParser } from './x.js'
import { instagramParser } from './instagram.js'
import { bilibiliParser } from './bilibili.js'