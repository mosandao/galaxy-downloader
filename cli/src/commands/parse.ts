import { parseMediaUrl } from '../api/client.js'
import { detectPlatform } from '../parsers/index.js'
import { normalizePlatform, getPlatformDisplayName } from '../platforms.js'
import { formatDuration } from '../utils/format.js'
import { getErrorMessage } from '../api-errors.js'
import type { CanonicalPlatform } from '../types.js'

export interface ParseOptions {
    url: string
    browser?: boolean
}

export interface ParseResult {
    success: boolean
    title?: string
    platform?: CanonicalPlatform
    duration?: number
    isMultiPart?: boolean
    pages?: number
    noteType?: 'video' | 'image' | 'audio'
    imagesCount?: number
    hasVideo?: boolean
    hasAudio?: boolean
    error?: string
}

/**
 * 解析并显示媒体信息
 */
export async function parseCommand(options: ParseOptions): Promise<ParseResult> {
    const { url, browser } = options

    if (!url.trim()) {
        return {
            success: false,
            error: 'URL 不能为空',
        }
    }

    // 设置浏览器模式
    if (browser) {
        process.env.GALAXY_BROWSER_MODE = 'true'
    }

    console.log(`\n[解析] 正在解析: ${url}`)

    try {
        const data = await parseMediaUrl(url)
        const platform = normalizePlatform(data.platform)

        const result: ParseResult = {
            success: true,
            title: data.title,
            platform,
            duration: data.duration,
            isMultiPart: data.isMultiPart,
            pages: data.pages?.length,
            noteType: data.noteType,
            imagesCount: data.images?.length,
            hasVideo: !!data.downloadVideoUrl || !!data.originDownloadVideoUrl,
            hasAudio: !!data.downloadAudioUrl || !!data.originDownloadAudioUrl,
        }

        // 显示结果
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        console.log(`标题: ${data.title}`)
        console.log(`平台: ${getPlatformDisplayName(platform)}`)

        if (data.duration) {
            console.log(`时长: ${formatDuration(data.duration)}`)
        }

        if (data.isMultiPart && data.pages?.length) {
            console.log(`类型: 多P视频 (${data.pages.length} 个分P)`)
            console.log('\n分P列表:')
            data.pages.forEach((page) => {
                console.log(`  P${page.page}: ${page.part} (${formatDuration(page.duration)})`)
            })
        } else if (data.noteType === 'image' && data.images?.length) {
            console.log(`类型: 图文笔记 (${data.images.length} 张图片)`)
        } else if (data.noteType === 'audio') {
            console.log(`类型: 纯音频`)
        } else {
            console.log(`类型: 单P视频`)
        }

        console.log('\n下载选项:')
        if (result.hasVideo) {
            console.log(`  ✓ 视频`)
        }
        if (result.hasAudio) {
            console.log(`  ✓ 音频（需提取）`)
        }
        if (result.imagesCount) {
            console.log(`  ✓ 图片 (${result.imagesCount} 张)`)
        }

        if (data.desc) {
            console.log(`\n简介: ${data.desc.slice(0, 100)}${data.desc.length > 100 ? '...' : ''}`)
        }

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

        return result
    } catch (error) {
        const message = getErrorMessage(error)
        console.error(`\n[错误] ${message}\n`)
        return {
            success: false,
            error: message,
        }
    }
}