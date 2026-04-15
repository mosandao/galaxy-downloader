/**
 * TikTok 平台解析器
 *
 * 支持格式:
 * - https://www.tiktok.com/@username/video/xxx
 * - https://vm.tiktok.com/xxx (短链接)
 * - https://m.tiktok.com/v/xxx.html
 */

import type { PlatformParser, ParseContext, ParserResult } from './index.js'
import type { CanonicalPlatform, UnifiedParseResult } from '../types.js'

export const tiktokParser: PlatformParser = {
    name: 'tiktok',
    patterns: [
        /tiktok\.com\/@[\w.-]+\/video\/(\d+)/,
        /tiktok\.com\/v\/(\d+)/,
        /tiktok\.com\/t\/(\d+)/,
        /vm\.tiktok\.com\/(\w+)/,
        /m\.tiktok\.com\/v\/(\d+)/,
    ],

    async parse(ctx: ParseContext): Promise<ParserResult> {
        const { url } = ctx

        // 1. 提取视频 ID
        const videoId = extractTiktokVideoId(url)
        if (!videoId) {
            return {
                success: false,
                error: '无法从链接中提取视频 ID',
                code: 'PARSE_FAILED',
            }
        }

        console.log(`[TikTok] 视频 ID: ${videoId}`)

        // 2. 获取视频详情
        try {
            const videoInfo = await fetchTiktokVideoInfo(videoId, url)

            // 3. 构造返回结果
            const result: NonNullable<UnifiedParseResult['data']> = {
                title: videoInfo.title,
                desc: videoInfo.desc,
                cover: videoInfo.cover,
                platform: 'tiktok',
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
                noteType: 'video',
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
 * 从 URL 中提取 TikTok 视频 ID
 */
function extractTiktokVideoId(url: string): string | null {
    // 尝试多种匹配模式
    for (const pattern of tiktokParser.patterns) {
        const match = url.match(pattern)
        if (match && match[1]) {
            return match[1]
        }
    }

    // 尝试从 URL path 中提取
    try {
        const urlObj = new URL(url)
        const pathname = urlObj.pathname

        // /@username/video/xxx 格式
        const userVideoMatch = pathname.match(/\/@[\w.-]+\/video\/(\d+)/)
        if (userVideoMatch) return userVideoMatch[1]

        // /v/xxx 格式
        const vMatch = pathname.match(/\/v\/(\d+)/)
        if (vMatch) return vMatch[1]

        // /t/xxx 格式
        const tMatch = pathname.match(/\/t\/(\d+)/)
        if (tMatch) return tMatch[1]
    } catch {
        // URL 解析失败
    }

    return null
}

/**
 * TikTok 视频信息
 */
interface TiktokVideoInfo {
    title: string
    desc: string
    cover: string
    videoUrl: string | null
    duration: number
}

/**
 * 获取 TikTok 视频详情（多方法尝试）
 */
async function fetchTiktokVideoInfo(videoId: string, originalUrl: string): Promise<TiktokVideoInfo> {
    // 方法 1: TikTok 官方分享页面解析
    console.log(`[TikTok] 尝试分享页面...`)
    try {
        const result = await trySharePage(videoId, originalUrl)
        if (result) return result
    } catch (e) {
        console.log(`[TikTok] 分享页面失败: ${e instanceof Error ? e.message : 'unknown'}`)
    }

    // 方法 2: TikTok 移动端 API
    console.log(`[TikTok] 尝试移动端 API...`)
    try {
        const result = await tryMobileApi(videoId)
        if (result) return result
    } catch (e) {
        console.log(`[TikTok] 移动端 API 失败`)
    }

    throw new Error('无法获取视频信息。TikTok 可能有反爬限制，请稍后再试')
}

/**
 * 方法 1: 分享页面解析
 */
async function trySharePage(videoId: string, originalUrl: string): Promise<TiktokVideoInfo | null> {
    // 使用原始 URL 或构造分享 URL
    const shareUrl = originalUrl.includes('tiktok.com/@')
        ? originalUrl
        : `https://www.tiktok.com/@user/video/${videoId}`

    console.log(`[TikTok] 分享页面 URL: ${shareUrl}`)

    const response = await fetch(shareUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': 'https://www.tiktok.com/',
        },
        signal: AbortSignal.timeout(15000),
    })

    console.log(`[TikTok] 分享页面响应: ${response.status}`)

    if (!response.ok) return null

    const html = await response.text()
    console.log(`[TikTok] HTML 长度: ${html.length}`)

    // 从 HTML 中提取标题
    const titleMatch = html.match(/<title>([^<]+)<\/title>/)
    const title = titleMatch ? titleMatch[1].replace(' | TikTok', '').trim() : 'TikTok Video'

    // 从 __NEXT_DATA__ 或 SIGI_STATE 中提取视频信息
    // TikTok 使用 Next.js，数据在 __NEXT_DATA__ 中
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.+?)<\/script>/)
    if (nextDataMatch) {
        try {
            const jsonStr = nextDataMatch[1]
            const nextData = JSON.parse(jsonStr)

            const props = nextData?.props?.pageProps?.videoData?.itemInfo?.itemStruct
            if (props) {
                // 获取无水印视频 URL
                const playAddr = props?.video?.playAddr
                const videoUrl = playAddr || props?.video?.downloadAddr

                return {
                    title: props?.desc || title,
                    desc: props?.desc || '',
                    cover: props?.video?.cover || props?.video?.dynamicCover || '',
                    videoUrl: videoUrl || null,
                    duration: props?.video?.duration || 0,
                }
            }
        } catch (e) {
            console.log(`[TikTok] __NEXT_DATA__ 解析失败`)
        }
    }

    // 尝试从 SIGI_STATE 中提取
    const sigiMatch = html.match(/<script id="SIGI_STATE" type="application\/json">(.+?)<\/script>/)
    if (sigiMatch) {
        try {
            // SIGI_STATE 可能包含特殊字符需要处理
            const jsonStr = sigiMatch[1].replace(/\\"/g, '"')
            const sigiData = JSON.parse(jsonStr)

            const itemModule = sigiData?.ItemModule?.[videoId]
            if (itemModule) {
                const videoUrl = itemModule?.video?.playAddr || itemModule?.video?.downloadAddr

                return {
                    title: itemModule?.desc || title,
                    desc: itemModule?.desc || '',
                    cover: itemModule?.video?.cover || '',
                    videoUrl: videoUrl || null,
                    duration: itemModule?.video?.duration || 0,
                }
            }
        } catch (e) {
            console.log(`[TikTok] SIGI_STATE 解析失败`)
        }
    }

    // 尝试直接从 HTML 中搜索视频 URL
    const playAddrMatch = html.match(/playAddr["']?\s*:\s*["']([^"']+)["']/)
    if (playAddrMatch) {
        const videoUrl = playAddrMatch[1].replace(/\\u002F/g, '/')
        console.log(`[TikTok] 找到视频 URL: ${videoUrl.slice(0, 50)}...`)

        const coverMatch = html.match(/cover["']?\s*:\s*["']([^"']+)["']/)
        const cover = coverMatch ? coverMatch[1].replace(/\\u002F/g, '/') : ''

        const descMatch = html.match(/"desc"\s*:\s*"([^"]+)"/)
        const desc = descMatch ? descMatch[1] : title

        return {
            title: desc || title,
            desc: desc || '',
            cover,
            videoUrl,
            duration: 0,
        }
    }

    // 尝试从 v16-web.tiktok.com CDN 搜索
    const cdnMatch = html.match(/v16[-\w]*\.tiktokcdn\.com[^"']+/)
    if (cdnMatch) {
        const videoUrl = 'https://' + cdnMatch[0].replace(/\\u002F/g, '/')
        console.log(`[TikTok] 通过 CDN 匹配找到 URL`)

        return {
            title,
            desc: title,
            cover: '',
            videoUrl,
            duration: 0,
        }
    }

    console.log(`[TikTok] 分享页面未找到视频链接`)
    return null
}

/**
 * 方法 2: 移动端 API
 */
async function tryMobileApi(videoId: string): Promise<TiktokVideoInfo | null> {
    // TikTok 的移动端 API
    const apiUrl = `https://api22-normal-c-useast2a.tiktokv.com/aweme/v1/feed/?aweme_id=${videoId}&aid=1988`

    const response = await fetch(apiUrl, {
        headers: {
            'User-Agent': 'com.zhiliaoapp.musically/2022600030 (Linux; U; Android 10; en_US; Pixel 4; Build/QQ3A.200805.001; Cronet/58.0.2991.0)',
            'Accept': 'application/json',
            'Accept-Language': 'en-US',
        },
        signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) return null

    try {
        const data = await response.json() as any

        if (data.aweme_list && data.aweme_list.length > 0) {
            const item = data.aweme_list[0]
            const videoUrl = item.video?.play_addr?.url_list?.[0] || item.video?.download_addr?.url_list?.[0]

            return {
                title: item.desc || 'TikTok Video',
                desc: item.desc || '',
                cover: item.video?.cover?.url_list?.[0] || '',
                videoUrl: videoUrl || null,
                duration: item.video?.duration || 0,
            }
        }
    } catch {
        return null
    }

    return null
}