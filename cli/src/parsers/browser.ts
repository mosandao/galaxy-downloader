/**
 * 无头浏览器解析模块
 *
 * 使用 Puppeteer + Stealth 插件解析抖音用户主页
 * 需要安装可选依赖：puppeteer-core, puppeteer-extra, puppeteer-extra-plugin-stealth
 *
 * 支持无限滚动分页加载，获取全部视频
 */

import type { ParserResult } from './index.js'

// 可选依赖的类型声明（动态导入时使用 any）
type PuppeteerExtra = any
type PuppeteerPage = any

/**
 * 检查 Puppeteer 是否可用
 */
export async function isPuppeteerAvailable(): Promise<boolean> {
    try {
        await import('puppeteer-core')
        return true
    } catch {
        return false
    }
}

/**
 * 自动滚动页面加载全部视频
 *
 * @param page Puppeteer 页面对象
 * @param maxVideos 最大视频数量限制（防止无限循环）
 * @param maxScrolls 最大滚动次数限制
 * @param apiInfo API 信息（用于直接调用分页 API）
 * @returns 全部视频 ID 数组
 */
interface ApiInfo {
    lastApiUrl: string | null
    lastCursor: string | null
    hasMoreData: boolean
}

async function autoScrollAndGetVideos(
    page: PuppeteerPage,
    maxVideos: number = 500,
    maxScrolls: number = 100,
    _apiInfo?: ApiInfo
): Promise<string[]> {
    let allIds: Set<string> = new Set()
    let noNewDataCount = 0
    let scrollCount = 0
    const maxNoNewData = 15

    console.log('[浏览器] 开始自动滚动加载视频...')

    // 使用 CDP Input.dispatchMouseEvent 发送真实 OS 级鼠标滚轮事件
    // 这是唯一能触发抖音懒加载的方式（page.evaluate 注入的事件 isTrusted=false 无法触发）
    const cdp = await page.target().createCDPSession()

    const collectIds = async () => {
        try {
            const newIds = await page.evaluate(() => {
                const ids: string[] = []
                document.querySelectorAll('a[href*="/video/"]').forEach(el => {
                    const href = el.getAttribute('href') || ''
                    const match = href.match(/video\/(\d+)/)
                    if (match && match[1]) ids.push(match[1])
                })
                return Array.from(new Set(ids))
            })
            for (const id of newIds) allIds.add(id)
        } catch (e) { /* ignore */ }
    }

    await collectIds()
    console.log(`[浏览器] 初始有 ${allIds.size} 个视频`)

    // 从视口获取鼠标坐标，避免硬编码
    const viewport = page.viewport() || { width: 1280, height: 800 }
    const cx = Math.floor(viewport.width / 2)
    const cy = Math.floor(viewport.height / 2)

    while (scrollCount < maxScrolls && allIds.size < maxVideos) {
        const currentCount = allIds.size

        try {
            await cdp.send('Input.dispatchMouseEvent', {
                type: 'mouseWheel', x: cx, y: cy, deltaX: 0, deltaY: 800
            })
        } catch (e) {}

        await new Promise(resolve => setTimeout(resolve, 2000))

        if (scrollCount % 5 === 0) {
            try {
                await cdp.send('Input.dispatchMouseEvent', {
                    type: 'mouseWheel', x: cx, y: cy, deltaX: 0, deltaY: 2000
                })
            } catch (e) {}
            await new Promise(resolve => setTimeout(resolve, 2000))
        }

        scrollCount++
        await collectIds()
        const newCount = allIds.size

        if (newCount > currentCount) {
            console.log(`[浏览器] 已加载 ${newCount} 个视频 (滚动 ${scrollCount} 次)`)
            noNewDataCount = 0
        } else {
            // 检查是否出现"暂时没有更多了"（最可靠的停止信号）
            noNewDataCount++
            try {
                const noMore = await page.evaluate(() => {
                    const body = document.body.innerText || ''
                    return body.includes('暂时没有更多了') || body.includes('没有更多了')
                })
                if (noMore) {
                    console.log('[浏览器] 页面显示"暂时没有更多了"，停止滚动')
                    break
                }
            } catch (e) {}

            if (noNewDataCount % 5 === 0) {
                console.log(`[浏览器] 无新数据 (${noNewDataCount}/${maxNoNewData})，当前 ${newCount} 个视频`)
            }
            if (noNewDataCount >= maxNoNewData) {
                console.log('[浏览器] 连续多次无新数据，停止滚动')
                break
            }
        }
    }

    if (scrollCount >= maxScrolls) {
        console.log(`[浏览器] 达到最大滚动次数限制 (${maxScrolls})`)
    }
    if (allIds.size >= maxVideos) {
        console.log(`[浏览器] 达到最大视频数量限制 (${maxVideos})`)
    }

    return Array.from(allIds)
}

/**
 * 使用浏览器解析抖音用户主页（支持无限滚动）
 */
export async function parseDouyinUserHomepageWithBrowser(url: string): Promise<ParserResult> {
    // 检查依赖是否可用
    if (!await isPuppeteerAvailable()) {
        return {
            success: false,
            error: '浏览器模式需要安装 Puppeteer。\n请运行：npm install puppeteer-core puppeteer-extra puppeteer-extra-plugin-stealth',
            code: 'DEPENDENCY_MISSING',
        }
    }

    // 优先连接用户已有的 Edge/Chrome（端口 9222），连不上才启动新浏览器
    const chromeDebugUrl = process.env.GALAXY_CHROME_DEBUG_URL || 'http://127.0.0.1:9222'

    let connectToExisting = false
    try {
        const response = await fetch(`${chromeDebugUrl}/json/version`)
        if (response.ok) {
            connectToExisting = true
            console.log(`[浏览器] 连接到已有浏览器: ${chromeDebugUrl}`)
        }
    } catch {
        console.log('[浏览器] 未找到已有浏览器，将启动 Edge')
    }

    if (!connectToExisting) {
        console.log('[浏览器] 启动 Edge...')
    }

    try {
        // 使用 puppeteer-core 直连，不用 stealth 插件（stealth 会破坏页面布局）
        const puppeteer = await import('puppeteer-core')
        const fs = await import('fs')

        // 自动检测 Chrome/Edge 可执行文件路径
        function findBrowserExecutable(): string | null {
            const candidates = [
                '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
                '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
                'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
                'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
                '/usr/bin/google-chrome',
                '/usr/bin/chromium-browser',
            ]
            for (const path of candidates) {
                if (fs.existsSync(path)) return path
            }
            return null
        }

        // 启动浏览器
        let browser: any
        if (connectToExisting) {
            // 连接到现有 Chrome/Edge 实例
            browser = await puppeteer.default.connect({
                browserURL: chromeDebugUrl,
                defaultViewport: null, // 不强制覆写视口
            })
        } else {
            const execPath = findBrowserExecutable()
            if (!execPath) {
                return {
                    success: false,
                    error: '未找到 Chrome 或 Edge 浏览器。请安装 Chrome 或 Edge，或使用 debug 模式连接到已有浏览器。',
                    code: 'DEPENDENCY_MISSING',
                }
            }
            console.log(`[浏览器] 使用: ${execPath}`)
            // 注意：headless 模式下抖音会拦截 API 响应，必须使用可见窗口
            browser = await puppeteer.default.launch({
                headless: false, // 必须可见，否则 API 被拦截
                executablePath: execPath,
                defaultViewport: null,
                args: [
                    '--disable-blink-features=AutomationControlled',
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-web-security',
                    '--disable-features=IsolateOrigins,site-per-process',
                    '--window-size=1440,900',
                ],
            })
        }

        const page = await browser.newPage()


        // 监听响应，捕获 API URL 和 cursor 参数
        let lastApiUrl: string | null = null
        let lastCursor: string | null = null
        let hasMoreData: boolean = false
        let userId: string | null = null // 用户 ID

        // 用于直接从 API 响应收集视频 ID 和描述
        const collectedVideoIds: Set<string> = new Set()
        const videoDescMap: Map<string, string> = new Map()

        page.on('response', async (response: any) => {
            const url = response.url()
            if (url.includes('/aweme/post')) {
                console.log(`[浏览器] API 响应完整 URL: ${url.slice(0, 150)}...`)
                lastApiUrl = url
                try {
                    const data = await response.json()
                    if (data?.aweme_list) {
                        console.log(`[浏览器] 响应包含 ${data.aweme_list.length} 个视频`)

                        // 直接从 API 响应收集视频 ID 和描述（统一转字符串避免类型不匹配）
                        for (const item of data.aweme_list) {
                            if (item.aweme_id) {
                                const id = String(item.aweme_id)
                                collectedVideoIds.add(id)
                                if (item.desc) videoDescMap.set(id, item.desc)
                            }
                        }
                        console.log(`[浏览器] 已收集 ${collectedVideoIds.size} 个视频 ID`)

                        // 输出 cursor 参数（用于分页）
                        if (data.cursor || data.max_cursor || data.next_cursor) {
                            lastCursor = data.cursor || data.max_cursor || data.next_cursor
                            console.log(`[浏览器] 分页 cursor: ${lastCursor}`)
                        }
                        // has_more 参数
                        hasMoreData = data.has_more === 1 || data.has_more === true
                        console.log(`[浏览器] has_more: ${hasMoreData}`)
                        // 提取用户 ID（如果有的话）
                        if (data.aweme_list[0]?.author_user_id) {
                            userId = data.aweme_list[0].author_user_id
                        }
                        // 检查 URL 中是否包含 a_bogus 参数（签名参数）
                        const aBogusMatch = url.match(/a_bogus=([^&]+)/)
                        if (aBogusMatch) {
                            console.log(`[浏览器] 发现 a_bogus 签名参数: ${aBogusMatch[1].slice(0, 20)}...`)
                        }
                    }
                } catch {
                    // 非 JSON 响应
                }
            }
        })

        console.log('[浏览器] 访问用户主页...')

        // 访问用户主页
        await page.goto(url, {
            waitUntil: 'networkidle2',
            timeout: 30000,
        })

        // 等待页面初始加载
        await new Promise(resolve => setTimeout(resolve, 3000))

        // 尝试等待视频元素
        try {
            await page.waitForSelector('[class*="video"]', { timeout: 10000 })
        } catch {
            // 可能页面结构不同，继续尝试提取
        }

        // 自动滚动加载全部视频
        await autoScrollAndGetVideos(page, 500, 50)

        // 以 API 响应中收集到的视频为准（有标题描述），DOM 仅用于触发滚动
        const videoIds = Array.from(collectedVideoIds)

        // 如果连接到现有浏览器，只断开连接；否则关闭浏览器
        if (connectToExisting) {
            console.log('[浏览器] 断开连接（保留现有浏览器）')
            await browser.disconnect()
        } else {
            await browser.close()
        }

        console.log(`[浏览器] 总计找到 ${videoIds.length} 个视频`)

        // 添加说明：如果视频数量少于预期，说明分页被反爬机制阻止
        if (videoIds.length < 50 && hasMoreData) {
            console.log(`[浏览器] ⚠️  注意: 抖音使用了反爬签名机制，无法加载更多视频`)
            console.log(`[浏览器] 建议: 在浏览器中手动滚动页面，或使用其他工具获取完整列表`)
        }

        if (videoIds.length === 0) {
            return {
                success: false,
                error: '未找到视频，可能用户主页为空或需要登录',
                code: 'PARSE_FAILED',
            }
        }

        // 返回结果
        return {
            success: true,
            data: {
                title: `用户视频合集 (${videoIds.length} 个)`,
                desc: `共 ${videoIds.length} 个视频`,
                cover: '',
                platform: 'douyin',
                url: url,
                duration: 0,
                downloadVideoUrl: null,
                downloadAudioUrl: null,
                originDownloadVideoUrl: null,
                originDownloadAudioUrl: null,
                mediaActions: {
                    video: 'direct-download',
                    audio: 'extract-audio',
                },
                noteType: 'video',
                isMultiPart: true,
                pages: videoIds.map((id: string, i: number) => ({
                    page: i + 1,
                    cid: id,
                    part: videoDescMap.get(id) || `视频 ${i + 1}`,
                    duration: 0,
                    downloadVideoUrl: `https://www.douyin.com/video/${id}`,
                    downloadAudioUrl: null,
                })),
            },
        }
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : '浏览器解析失败',
            code: 'UPSTREAM_ERROR',
        }
    }
}