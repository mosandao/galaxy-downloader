/**
 * 抖音平台解析器
 *
 * 支持格式:
 * - https://www.douyin.com/video/xxx
 * - https://v.douyin.com/xxx (短链接)
 * - https://www.douyin.com/user/xxx?modal_id=xxx (用户主页中的视频)
 */

import type { PlatformParser, ParseContext, ParserResult } from './index.js'
import type { CanonicalPlatform, UnifiedParseResult } from '../types.js'

export const douyinParser: PlatformParser = {
    name: 'douyin',
    patterns: [
        /douyin\.com\/video\/(\d+)/,
        /douyin\.com\/note\/(\d+)/,
        /modal_id=(\d+)/,
        /aweme_id=(\d+)/,
    ],

    async parse(ctx: ParseContext): Promise<ParserResult> {
        const { url } = ctx

        // 1. 提取视频 ID
        const videoId = extractDouyinVideoId(url)
        if (!videoId) {
            return {
                success: false,
                error: '无法从链接中提取视频 ID',
                code: 'PARSE_FAILED',
            }
        }

        console.log(`[抖音] 视频 ID: ${videoId}`)

        // 2. 获取视频详情
        try {
            const videoInfo = await fetchDouyinVideoInfo(videoId)

            // 3. 构造返回结果
            const result: NonNullable<UnifiedParseResult['data']> = {
                title: videoInfo.title,
                desc: videoInfo.desc,
                cover: videoInfo.cover,
                platform: 'douyin',
                url: url,
                duration: videoInfo.duration,
                downloadVideoUrl: videoInfo.videoUrl,
                downloadAudioUrl: null,
                originDownloadVideoUrl: videoInfo.videoUrl,
                originDownloadAudioUrl: null,
                mediaActions: {
                    video: 'direct-download',
                    audio: 'extract-audio',
                },
                noteType: videoInfo.isImage ? 'image' : 'video',
                images: videoInfo.images,
            }

            return {
                success: true,
                data: result,
            }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : '获取视频信息失败',
                code: 'UPSTREAM_ERROR',
            }
        }
    },
}

/**
 * 从 URL 中提取抖音视频 ID
 */
function extractDouyinVideoId(url: string): string | null {
    // 尝试多种匹配模式
    for (const pattern of douyinParser.patterns) {
        const match = url.match(pattern)
        if (match && match[1]) {
            return match[1]
        }
    }

    // 尝试从 URL path 中提取
    try {
        const urlObj = new URL(url)
        const pathname = urlObj.pathname

        // /video/xxx 格式
        const videoMatch = pathname.match(/\/video\/(\d+)/)
        if (videoMatch) return videoMatch[1]

        // /note/xxx 格式（图文）
        const noteMatch = pathname.match(/\/note\/(\d+)/)
        if (noteMatch) return noteMatch[1]
    } catch {
        // URL 解析失败
    }

    return null
}

/**
 * 抖音视频信息
 */
interface DouyinVideoInfo {
    title: string
    desc: string
    cover: string
    videoUrl: string | null
    duration: number
    isImage: boolean
    images?: string[]
}

/**
 * 获取抖音视频详情（多方法尝试）
 */
async function fetchDouyinVideoInfo(videoId: string): Promise<DouyinVideoInfo> {
    // 方法 1: 移动端 API（较容易访问）
    console.log(`[抖音] 尝试移动端 API...`)
    try {
        const result = await tryMobileApi(videoId)
        if (result) return result
    } catch (e) {
        console.log(`[抖音] 移动端 API 失败`)
    }

    // 方法 2: 分享页面解析
    console.log(`[抖音] 尝试分享页面...`)
    try {
        const result = await trySharePage(videoId)
        if (result) return result
    } catch (e) {
        console.log(`[抖音] 分享页面失败`)
    }

    // 方法 3: Web API（需要签名）
    console.log(`[抖音] 尝试 Web API...`)
    try {
        const result = await tryWebApi(videoId)
        if (result) return result
    } catch (e) {
        console.log(`[抖音] Web API 失败`)
    }

    throw new Error('无法获取视频信息。抖音可能有反爬限制，请稍后再试或使用网页版下载')
}

/**
 * 方法 1: 移动端 API
 */
async function tryMobileApi(videoId: string): Promise<DouyinVideoInfo | null> {
    // iesdouyin 是抖音的移动端接口
    const apiUrl = `https://www.iesdouyin.com/web/api/v2/aweme/iteminfo/?item_ids=${videoId}&count=1`

    const response = await fetch(apiUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
            'Accept': 'application/json',
            'Referer': 'https://www.douyin.com/',
        },
        signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) return null

    try {
        const data = await response.json() as any

        if (data.item_list && data.item_list.length > 0) {
            const item = data.item_list[0]
            const videoUrls = item.video?.play_addr?.url_list || []

            return {
                title: item.desc || '抖音视频',
                desc: item.desc || '',
                cover: item.video?.cover?.url_list?.[0] || '',
                videoUrl: videoUrls.length > 0 ? videoUrls[0] : null,
                duration: item.video?.duration || 0,
                isImage: item.is_image === true,
                images: item.images?.map((img: any) => img.url_list?.[0]).filter(Boolean),
            }
        }
    } catch {
        return null
    }

    return null
}

/**
 * 方法 2: 分享页面解析
 */
async function trySharePage(videoId: string): Promise<DouyinVideoInfo | null> {
    const shareUrl = `https://www.douyin.com/share/video/${videoId}`

    console.log(`[抖音] 分享页面 URL: ${shareUrl}`)

    const response = await fetch(shareUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9',
        },
        signal: AbortSignal.timeout(15000),
    })

    console.log(`[抖音] 分享页面响应: ${response.status}`)

    if (!response.ok) return null

    const html = await response.text()
    console.log(`[抖音] HTML 长度: ${html.length}`)

    // 从 HTML 中提取标题
    const titleMatch = html.match(/<title>([^<]+)<\/title>/)
    const title = titleMatch ? titleMatch[1].replace(' - 抖音', '').trim() : '抖音视频'

    // 直接从 HTML 中搜索 video play_addr url_list
    // 使用更宽松的正则匹配
    const playAddrMatch = html.match(/play_addr[^}]*url_list[^[]*\[["']([^"']+)["']/)
    if (playAddrMatch) {
        const videoUrl = playAddrMatch[1].replace(/\\u002F/g, '/')
        console.log(`[抖音] 找到视频 URL: ${videoUrl.slice(0, 50)}...`)

        // 查找封面
        const coverMatch = html.match(/cover[^}]*url_list[^[]*\[["']([^"']+)["']/)
        const cover = coverMatch ? coverMatch[1].replace(/\\u002F/g, '/') : ''

        // 查找描述
        const descMatch = html.match(/"desc":"([^"]+)"/)
        const desc = descMatch ? descMatch[1] : title

        return {
            title: desc || title,
            desc: desc || '',
            cover,
            videoUrl,
            duration: 0,
            isImage: false,
        }
    }

    // 尝试另一种匹配方式
    const videoMatch = html.match(/aweme\.snssdk\.com[^"']+/)
    if (videoMatch) {
        const videoUrl = 'https://' + videoMatch[0].replace(/\\u002F/g, '/')
        console.log(`[抖音] 通过 aweme.snssdk 匹配找到 URL`)

        return {
            title,
            desc: title,
            cover: '',
            videoUrl,
            duration: 0,
            isImage: false,
        }
    }

    console.log(`[抖音] 分享页面未找到视频链接`)

    // 尝试从 _ROUTER_DATA 中提取（备用）
    const routerMatch = html.match(/window\._ROUTER_DATA\s*=\s*(\{.+?\})\s*<\/script>/s)
    if (routerMatch) {
        try {
            const jsonStr = routerMatch[1].replace(/\\u002F/g, '/')
            const routerData = JSON.parse(jsonStr)

            const loaderData = routerData?.loaderData || {}
            for (const key of Object.keys(loaderData)) {
                const data = loaderData[key]
                if (data?.awemeDetail || data?.aweme_detail) {
                    const detail = data.awemeDetail || data.aweme_detail
                    const videoUrls = detail?.video?.playAddr?.urlList || detail?.video?.play_addr?.url_list || []

                    return {
                        title: detail?.desc || title,
                        desc: detail?.desc || '',
                        cover: detail?.video?.cover?.urlList?.[0] || detail?.video?.cover?.url_list?.[0] || '',
                        videoUrl: videoUrls.length > 0 ? videoUrls[0] : null,
                        duration: detail?.video?.duration || 0,
                        isImage: detail?.isImage === true || detail?.is_image === true,
                        images: (detail?.images || []).map((img: any) => img?.urlList?.[0] || img?.url_list?.[0]).filter(Boolean),
                    }
                }
            }
        } catch {
            // JSON 解析失败
        }
    }

    return null
}

/**
 * 方法 3: Web API（需要签名，通常会被拦截）
 */
async function tryWebApi(videoId: string): Promise<DouyinVideoInfo | null> {
    const apiUrl = `https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${videoId}&aid=638378&device_platform=web`

    const response = await fetch(apiUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://www.douyin.com/',
            'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) return null

    try {
        const data = await response.json() as any

        if (data.aweme_detail) {
            const detail = data.aweme_detail
            const videoUrls = detail.video?.play_addr?.url_list || []

            return {
                title: detail.desc || '抖音视频',
                desc: detail.desc || '',
                cover: detail.video?.cover?.url_list?.[0] || '',
                videoUrl: videoUrls.length > 0 ? videoUrls[0] : null,
                duration: detail.video?.duration || 0,
                isImage: detail.is_image === true,
                images: detail.images?.map((img: any) => img.url_list?.[0]).filter(Boolean),
            }
        }
    } catch {
        return null
    }

    return null
}

/**
 * 方法 4: 使用公开解析服务（备用）
 * 注意：这些服务可能不稳定，仅作为最后备选
 */
async function tryPublicParser(videoId: string): Promise<DouyinVideoInfo | null> {
    // 常用的公开抖音解析服务
    const publicApis = [
        // 这些是一些常见的公开解析服务，可能需要根据实际情况调整
        // 由于服务可能变化，这里只做基础尝试
    ]

    // 暂时跳过公开服务，避免依赖不稳定的外部服务
    return null
}