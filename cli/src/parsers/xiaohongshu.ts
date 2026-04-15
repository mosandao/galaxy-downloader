/**
 * 小红书平台解析器
 *
 * 支持格式:
 * - https://www.xiaohongshu.com/explore/xxx
 * - https://www.xiaohongshu.com/discovery/xxx
 * - https://xhslink.com/xxx (短链接)
 */

import type { PlatformParser, ParseContext, ParserResult } from './index.js'
import type { CanonicalPlatform, UnifiedParseResult } from '../types.js'

export const xiaohongshuParser: PlatformParser = {
    name: 'xiaohongshu',
    patterns: [
        /xiaohongshu\.com\/explore\/([a-zA-Z0-9]+)/,
        /xiaohongshu\.com\/discovery\/([a-zA-Z0-9]+)/,
        /xhslink\.com\/([a-zA-Z0-9]+)/,
    ],

    async parse(ctx: ParseContext): Promise<ParserResult> {
        const { url } = ctx

        // 1. 提取笔记 ID
        const noteId = extractXhsNoteId(url)
        if (!noteId) {
            return {
                success: false,
                error: '无法从链接中提取笔记 ID',
                code: 'PARSE_FAILED',
            }
        }

        console.log(`[小红书] 笔记 ID: ${noteId}`)

        // 2. 获取笔记详情
        try {
            const noteInfo = await fetchXhsNoteInfo(noteId, url)

            // 3. 构造返回结果
            const result: NonNullable<UnifiedParseResult['data']> = {
                title: noteInfo.title,
                desc: noteInfo.desc,
                cover: noteInfo.cover,
                platform: 'xiaohongshu',
                url: url,
                duration: noteInfo.duration,
                downloadVideoUrl: noteInfo.videoUrl,
                downloadAudioUrl: null,
                originDownloadVideoUrl: noteInfo.videoUrl,
                originDownloadAudioUrl: null,
                mediaActions: {
                    video: 'direct-download',
                    audio: 'extract-audio',
                },
                noteType: noteInfo.isVideo ? 'video' : 'image',
                images: noteInfo.images,
            }

            return {
                success: true,
                data: result,
            }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : '获取笔记信息失败',
                code: 'UPSTREAM_ERROR',
            }
        }
    },
}

/**
 * 从 URL 中提取小红书笔记 ID
 */
function extractXhsNoteId(url: string): string | null {
    // 尝试多种匹配模式
    for (const pattern of xiaohongshuParser.patterns) {
        const match = url.match(pattern)
        if (match && match[1]) {
            return match[1]
        }
    }

    // 尝试从 URL path 中提取
    try {
        const urlObj = new URL(url)
        const pathname = urlObj.pathname

        // /explore/xxx 格式
        const exploreMatch = pathname.match(/\/explore\/([a-zA-Z0-9]+)/)
        if (exploreMatch) return exploreMatch[1]

        // /discovery/xxx 格式
        const discoveryMatch = pathname.match(/\/discovery\/([a-zA-Z0-9]+)/)
        if (discoveryMatch) return discoveryMatch[1]
    } catch {
        // URL 解析失败
    }

    return null
}

/**
 * 小红书笔记信息
 */
interface XhsNoteInfo {
    title: string
    desc: string
    cover: string
    videoUrl: string | null
    duration: number
    isVideo: boolean
    images?: string[]
}

/**
 * 获取小红书笔记详情
 */
async function fetchXhsNoteInfo(noteId: string, originalUrl: string): Promise<XhsNoteInfo> {
    // 方法 1: 页面解析
    console.log(`[小红书] 尝试页面解析...`)
    try {
        const result = await tryPageParse(noteId, originalUrl)
        if (result) return result
    } catch (e) {
        console.log(`[小红书] 页面解析失败: ${e instanceof Error ? e.message : 'unknown'}`)
    }

    // 方法 2: API 解析
    console.log(`[小红书] 尝试 API 解析...`)
    try {
        const result = await tryApiParse(noteId)
        if (result) return result
    } catch (e) {
        console.log(`[小红书] API 解析失败`)
    }

    throw new Error('无法获取笔记信息。小红书可能有反爬限制，请稍后再试')
}

/**
 * 方法 1: 页面解析
 */
async function tryPageParse(noteId: string, originalUrl: string): Promise<XhsNoteInfo | null> {
    const pageUrl = originalUrl.includes('xiaohongshu.com')
        ? originalUrl
        : `https://www.xiaohongshu.com/explore/${noteId}`

    console.log(`[小红书] 页面 URL: ${pageUrl}`)

    const response = await fetch(pageUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9',
            'Referer': 'https://www.xiaohongshu.com/',
        },
        signal: AbortSignal.timeout(15000),
    })

    console.log(`[小红书] 页面响应: ${response.status}`)

    if (!response.ok) return null

    const html = await response.text()
    console.log(`[小红书] HTML 长度: ${html.length}`)

    // 从 HTML 中提取标题
    const titleMatch = html.match(/<title>([^<]+)<\/title>/)
    const title = titleMatch ? titleMatch[1].replace(' - 小红书', '').trim() : '小红书笔记'

    // 尝试从 __NEXT_DATA__ 中提取（小红书也使用 Next.js）
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.+?)<\/script>/s)
    if (nextDataMatch) {
        try {
            const jsonStr = nextDataMatch[1]
            const nextData = JSON.parse(jsonStr)

            // 查找笔记数据
            const props = nextData?.props?.initialState?.noteDetailMap?.[noteId]?.note
            if (props) {
                const isVideo = props.type === 'video'
                const videoUrl = isVideo
                    ? (props.video?.media?.stream?.h264?.[0]?.masterUrl || props.video?.media?.stream?.h264?.[0]?.backupUrls?.[0])
                    : null

                const images = !isVideo
                    ? props.imageList?.map((img: any) => img.infoList?.[0]?.url).filter(Boolean)
                    : undefined

                return {
                    title: props.title || title,
                    desc: props.desc || '',
                    cover: props.imageList?.[0]?.infoList?.[0]?.url || props.video?.cover?.urlList?.[0] || '',
                    videoUrl: videoUrl || null,
                    duration: props.video?.media?.duration || 0,
                    isVideo,
                    images,
                }
            }
        } catch (e) {
            console.log(`[小红书] __NEXT_DATA__ 解析失败`)
        }
    }

    // 尝试直接从 HTML 中搜索视频 URL
    // 小红书视频 URL 格式: sns-video-bd.xhscdn.com 或 xhscdn.com
    const videoMatch = html.match(/xhscdn\.com[^"']*\.mp4[^"']*/)
    if (videoMatch) {
        const videoUrl = 'https://' + videoMatch[0].replace(/\\u002F/g, '/')
        console.log(`[小红书] 找到视频 URL: ${videoUrl.slice(0, 50)}...`)

        const coverMatch = html.match(/xhscdn\.com[^"']*(?:cover|thumbnail)[^"']*/)
        const cover = coverMatch ? 'https://' + coverMatch[0].replace(/\\u002F/g, '/') : ''

        const descMatch = html.match(/"desc"\s*:\s*"([^"]+)"/)
        const desc = descMatch ? descMatch[1] : title

        return {
            title: desc || title,
            desc: desc || '',
            cover,
            videoUrl,
            duration: 0,
            isVideo: true,
        }
    }

    // 检查是否有图片
    const imageMatches = html.match(/xhscdn\.com[^"']*(?:\/images\/|\/large\/)[^"']*/g)
    if (imageMatches && imageMatches.length > 0) {
        const images = imageMatches.map(m => 'https://' + m.replace(/\\u002F/g, '/'))

        return {
            title,
            desc: title,
            cover: images[0],
            videoUrl: null,
            duration: 0,
            isVideo: false,
            images,
        }
    }

    console.log(`[小红书] 页面未找到媒体链接`)
    return null
}

/**
 * 方法 2: API 解析
 */
async function tryApiParse(noteId: string): Promise<XhsNoteInfo | null> {
    // 小红书的 Web API 需要签名，但可以尝试一些公开端点
    const apiUrl = `https://edith.xiaohongshu.com/api/sns/web/v1/feed?source_type=explore&note_id=${noteId}`

    const response = await fetch(apiUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json',
            'Accept-Language': 'zh-CN,zh;q=0.9',
            'Referer': 'https://www.xiaohongshu.com/',
            'Origin': 'https://www.xiaohongshu.com',
        },
        signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) return null

    try {
        const data = await response.json() as any

        if (data.data?.notes?.[0]?.displayNote) {
            const note = data.data.notes[0].displayNote
            const isVideo = note.type === 'video'

            const videoUrl = isVideo
                ? (note.video?.media?.stream?.h264?.[0]?.masterUrl || note.video?.media?.stream?.h264?.[0]?.backupUrls?.[0])
                : null

            const images = !isVideo
                ? note.imageList?.map((img: any) => img.infoList?.[0]?.url).filter(Boolean)
                : undefined

            return {
                title: note.title || '小红书笔记',
                desc: note.desc || '',
                cover: note.imageList?.[0]?.infoList?.[0]?.url || note.video?.cover?.urlList?.[0] || '',
                videoUrl: videoUrl || null,
                duration: note.video?.media?.duration || 0,
                isVideo,
                images,
            }
        }
    } catch {
        return null
    }

    return null
}