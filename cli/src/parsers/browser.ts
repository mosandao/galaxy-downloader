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
    apiInfo: ApiInfo = { lastApiUrl: null, lastCursor: null, hasMoreData: false }
): Promise<string[]> {
    let allIds: Set<string> = new Set()
    let noNewDataCount = 0
    let scrollCount = 0
    const maxNoNewData = 10 // 连续10次无新数据则停止

    // 使用传入的 API 信息
    let lastApiUrl = apiInfo.lastApiUrl
    let lastCursor = apiInfo.lastCursor
    let hasMoreData = apiInfo.hasMoreData

    console.log('[浏览器] 开始滚动加载视频...')

    // 获取页面结构信息，寻找正确的滚动容器
    const scrollInfo = await page.evaluate(() => {
        // 查找可能的滚动容器
        const containers: Array<{
            selector: string
            className: string
            height: number
            clientHeight: number
            scrollTop: number
        }> = []

        // 遍历所有元素，找到真正可滚动的容器
        document.querySelectorAll('*').forEach(el => {
            const style = window.getComputedStyle(el)
            const overflowY = style.overflowY
            const overflow = style.overflow

            // 检查是否是可滚动容器
            if ((overflowY === 'auto' || overflowY === 'scroll' ||
                 overflow === 'auto' || overflow === 'scroll') &&
                el.scrollHeight > el.clientHeight + 100) {
                // 只保留高度差较大的容器
                const className = el.className || ''
                containers.push({
                    selector: el.id ? `#${el.id}` : (className ? `.${className.split(' ')[0]}` : el.tagName),
                    className: className.split(' ')[0] || '',
                    height: el.scrollHeight,
                    clientHeight: el.clientHeight,
                    scrollTop: el.scrollTop
                })
            }
        })

        // 检查视频列表区域
        const videoItems = document.querySelectorAll('a[href*="/video/"]')
        const totalVideos = videoItems.length

        // 查找视频列表容器
        const videoListContainer = document.querySelector('[class*="video-list"], [class*="VideoList"], [class*="user-video"]')

        return {
            containers: containers.slice(0, 5), // 最多返回5个容器
            totalVideos,
            bodyHeight: document.body.scrollHeight,
            windowScrollY: window.scrollY,
            videoListContainer: videoListContainer ? videoListContainer.className : null
        }
    })

    console.log(`[浏览器] 页面结构: ${JSON.stringify(scrollInfo)}`)
    console.log(`[浏览器] 当前视频数: ${scrollInfo.totalVideos}`)

    // 选择最合适的滚动容器
    // 优先选择高度差最大的容器，通常是真正的视频列表区域
    let targetContainer: string | null = null
    if (scrollInfo.containers.length > 0) {
        // 优先选择 IHrj7RhK 或类似的视频列表容器（通常是第一个）
        // 而不是 parent-route-container（通常是整体路由容器）
        const videoContainer = scrollInfo.containers.find((c: { className: string }) =>
            c.className.includes('RhK') || c.className.includes('video') || c.className.includes('scroll')
        )

        if (videoContainer) {
            targetContainer = videoContainer.selector
            console.log(`[浏览器] 选择视频容器: ${targetContainer} (高度差: ${videoContainer.height - videoContainer.clientHeight})`)
        } else {
            // 按高度差排序，选择最大的
            const sortedContainers = scrollInfo.containers.sort((a: { height: number; clientHeight: number }, b: { height: number; clientHeight: number }) =>
                (b.height - b.clientHeight) - (a.height - a.clientHeight)
            )
            targetContainer = sortedContainers[0].selector
            console.log(`[浏览器] 选择滚动容器: ${targetContainer} (高度差: ${sortedContainers[0].height - sortedContainers[0].clientHeight})`)
        }
    }

    // 首先尝试点击"加载更多"按钮
    try {
        const loadMoreButton = await page.$('[class*="load-more"], [class*="more"], button:contains("更多"), [class*="LoadMore"]')
        if (loadMoreButton) {
            console.log('[浏览器] 发现"加载更多"按钮，尝试点击...')
            await loadMoreButton.click()
            await new Promise(resolve => setTimeout(resolve, 3000))
        }
    } catch {
        // 无加载更多按钮
    }

    while (scrollCount < maxScrolls && allIds.size < maxVideos) {
        // 获取当前视频数量
        const currentCount = allIds.size

        // 策略1: 使用 scrollIntoView 让最后一个视频进入视图
        // 这通常能触发 IntersectionObserver 的懒加载
        if (scrollCount % 2 === 0) {
            console.log('[浏览器] 滚动到最后一个视频...')

            // 使用 puppeteer 的 hover 功能
            try {
                const lastVideoHandle = await page.$$('a[href*="/video/"]')
                if (lastVideoHandle.length > 0) {
                    const lastElement = lastVideoHandle[lastVideoHandle.length - 1]
                    await lastElement.hover()
                    await new Promise(resolve => setTimeout(resolve, 1000))
                }
            } catch (e) {
                // hover 失败，继续其他策略
            }

            // 执行页面内滚动和事件触发
            await page.evaluate(() => {
                const videoLinks = document.querySelectorAll('a[href*="/video/"]')
                if (videoLinks.length > 0) {
                    const lastVideo = videoLinks[videoLinks.length - 1]
                    lastVideo.scrollIntoView({ behavior: 'smooth', block: 'end' })

                    // 触发 wheel 事件
                    const wheelEvent = new WheelEvent('wheel', {
                        deltaY: 500,
                        bubbles: true,
                        view: window
                    })
                    lastVideo.dispatchEvent(wheelEvent)
                }

                // 滚动容器
                const scrollContainer = document.querySelector('.IHrj7RhK')
                if (scrollContainer) {
                    scrollContainer.scrollTop = scrollContainer.scrollHeight
                    scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }))
                }
            })
            await new Promise(resolve => setTimeout(resolve, 4000))
        }

        // 策略2: 滚动容器
        if (targetContainer) {
            // 模拟真实的鼠标滚轮事件在容器上
            await page.evaluate((containerSelector: string) => {
                const container = document.querySelector(containerSelector)
                if (container) {
                    // 创建 wheel 事件模拟真实滚动
                    const wheelEvent = new WheelEvent('wheel', {
                        deltaY: 800,
                        deltaMode: WheelEvent.DOM_DELTA_PIXEL,
                        bubbles: true,
                        cancelable: true
                    })
                    container.dispatchEvent(wheelEvent)

                    // 同时设置 scrollTop
                    container.scrollTop = container.scrollTop + 800
                }
            }, targetContainer)

            await new Promise(resolve => setTimeout(resolve, 500))

            // 再滚动一次到更底部
            await page.evaluate((containerSelector: string) => {
                const container = document.querySelector(containerSelector)
                if (container) {
                    container.scrollTop = container.scrollHeight * 0.5
                }
            }, targetContainer)
        } else {
            // 滚动整个窗口
            await page.evaluate(() => {
                // 模拟滚轮事件
                const wheelEvent = new WheelEvent('wheel', {
                    deltaY: 500,
                    deltaMode: WheelEvent.DOM_DELTA_PIXEL,
                    bubbles: true
                })
                window.dispatchEvent(wheelEvent)

                window.scrollBy(0, 500)
            })
        }

        // 等待数据加载（增加等待时间）
        await new Promise(resolve => setTimeout(resolve, 2500))

        // 每3次滚动后，执行一次大滚动到底部
        if (scrollCount % 3 === 2) {
            console.log('[浏览器] 执行大滚动到底部...')
            if (targetContainer) {
                await page.evaluate((containerSelector: string) => {
                    const container = document.querySelector(containerSelector)
                    if (container) {
                        container.scrollTop = container.scrollHeight
                    }
                }, targetContainer)
            } else {
                await page.evaluate(() => {
                    window.scrollTo(0, document.body.scrollHeight)
                })
            }
            await new Promise(resolve => setTimeout(resolve, 4000))
        }

        // 策略4: 使用键盘滚动（Page Down / End）
        // 每隔几次尝试用键盘触发滚动
        if (scrollCount % 4 === 0) {
            console.log('[浏览器] 尝试键盘滚动...')
            // 先聚焦到页面
            await page.focus('body')
            // 按多次 Page Down
            for (let i = 0; i < 3; i++) {
                await page.keyboard.press('PageDown')
                await new Promise(resolve => setTimeout(resolve, 500))
            }
            // 按 End 键滚动到底部
            await page.keyboard.press('End')
            await new Promise(resolve => setTimeout(resolve, 2000))
        }

        // 策略5: 模拟鼠标移动到视频区域触发加载
        if (scrollCount % 5 === 1) {
            console.log('[浏览器] 尝试鼠标移动触发...')
            // 移动鼠标到页面底部区域
            await page.mouse.move(960, 800)
            await new Promise(resolve => setTimeout(resolve, 500))
            // 使用 evaluate 来模拟 wheel 事件
            await page.evaluate(() => {
                const wheelEvent = new WheelEvent('wheel', {
                    deltaY: 800,
                    bubbles: true
                })
                document.dispatchEvent(wheelEvent)
            })
            await new Promise(resolve => setTimeout(resolve, 1500))
        }

        // 策略6: 直接调用 API 获取更多视频（当滚动无法触发时）
        // 使用 captured cursor 和 API URL 模式直接调用分页 API
        if (scrollCount % 3 === 1 && currentCount > 0 && lastCursor && lastApiUrl) {
            console.log('[浏览器] 尝试直接调用分页 API...')
            console.log(`[浏览器] 使用 cursor: ${lastCursor}`)
            console.log(`[浏览器] 原始 API URL: ${lastApiUrl.slice(0, 150)}...`)
            try {
                // 在页面上下文中直接调用 API，保留原始 URL 的域名和参数
                const apiCallResult = await page.evaluate(async (cursor: string, originalUrl: string) => {
                    try {
                        // 使用 XHR 或 fetch 来获取更多数据
                        // 重要：使用原始 URL 的域名，不要修改

                        // 方法1: 尝试直接使用原始 URL 但替换 cursor
                        // 保留所有其他参数包括 a_bogus
                        const cursorMatch = originalUrl.match(/cursor=(\d+)/)
                        const originalCursor = cursorMatch ? cursorMatch[1] : '0'
                        const nextUrl = originalUrl.replace(`cursor=${originalCursor}`, `cursor=${cursor}`)

                        console.log(`[页面] 构造的 URL: ${nextUrl.slice(0, 100)}...`)

                        // 使用 XMLHttpRequest 代替 fetch，可能更容易携带 cookies
                        const xhr = new XMLHttpRequest()
                        xhr.open('GET', nextUrl, false) // 同步请求
                        xhr.setRequestHeader('Accept', 'application/json')
                        xhr.withCredentials = true
                        xhr.send()

                        console.log(`[页面] XHR 状态: ${xhr.status}`)
                        if (xhr.status === 200) {
                            const text = xhr.responseText
                            console.log(`[页面] XHR 响应长度: ${text.length}`)
                            if (text.length > 0) {
                                try {
                                    const data = JSON.parse(text)
                                    console.log(`[页面] aweme_list 长度: ${data?.aweme_list?.length || 0}`)
                                    if (data?.aweme_list && data.aweme_list.length > 0) {
                                        return {
                                            success: true,
                                            videos: data.aweme_list.map((item: any) => ({
                                                id: item.aweme_id,
                                                desc: item.desc?.slice(0, 30)
                                            })),
                                            cursor: data.cursor,
                                            hasMore: data.has_more
                                        }
                                    }
                                    return { success: false, reason: 'no aweme_list', dataKeys: Object.keys(data) }
                                } catch (parseError) {
                                    return { success: false, reason: 'JSON parse failed', textPreview: text.slice(0, 100) }
                                }
                            }
                        }
                        return { success: false, reason: 'XHR failed', status: xhr.status }
                    } catch (e) {
                        return { success: false, reason: String(e) }
                    }
                }, lastCursor, lastApiUrl)

                console.log(`[浏览器] API 调用结果: ${JSON.stringify(apiCallResult).slice(0, 200)}`)

                if (apiCallResult && apiCallResult.success && apiCallResult.videos && apiCallResult.videos.length > 0) {
                    console.log(`[浏览器] 直接 API 获取到 ${apiCallResult.videos.length} 个新视频`)
                    // 更新 cursor 和 has_more
                    if (apiCallResult.cursor) {
                        lastCursor = apiCallResult.cursor
                        hasMoreData = apiCallResult.hasMore === 1 || apiCallResult.hasMore === true
                        console.log(`[浏览器] 更新 cursor: ${lastCursor}, hasMore: ${hasMoreData}`)
                    }
                    // 添加新视频 ID
                    for (const video of apiCallResult.videos) {
                        if (video.id) allIds.add(video.id)
                    }
                } else {
                    console.log(`[浏览器] 直接 API 未获取到新视频: ${JSON.stringify(apiCallResult)}`)
                }
            } catch (e) {
                console.log(`[浏览器] 直接 API 葵略失败: ${e}`)
            }
            await new Promise(resolve => setTimeout(resolve, 2000))
        }

        // 提取当前页面的视频 ID
        const newIds = await page.evaluate(() => {
            const ids: string[] = []

            // 方法 1: 从链接提取
            document.querySelectorAll('a[href*="/video/"]').forEach(el => {
                const href = el.getAttribute('href') || ''
                const match = href.match(/video\/(\d+)/)
                if (match && match[1]) ids.push(match[1])
            })

            // 方法 2: 从 modal_id 属性提取
            document.querySelectorAll('[data-modal_id], [modal_id]').forEach(el => {
                const modalId = el.getAttribute('data-modal_id') || el.getAttribute('modal_id')
                if (modalId) ids.push(modalId)
            })

            // 方法 3: 从 URL 参数提取
            document.querySelectorAll('a[href*="modal_id="]').forEach(el => {
                const href = el.getAttribute('href') || ''
                const match = href.match(/modal_id=(\d+)/)
                if (match && match[1]) ids.push(match[1])
            })

            // 方法 4: 从视频卡片元素提取
            document.querySelectorAll('[class*="video-item"], [class*="VideoItem"]').forEach(el => {
                // 尝试从 data 属性提取
                const dataId = el.getAttribute('data-id') || el.getAttribute('data-aweme-id')
                if (dataId) ids.push(dataId)

                // 从内部链接提取
                el.querySelectorAll('a[href*="/video/"]').forEach(a => {
                    const href = a.getAttribute('href') || ''
                    const match = href.match(/video\/(\d+)/)
                    if (match && match[1]) ids.push(match[1])
                })
            })

            return Array.from(new Set(ids))
        })

        // 添加到集合
        newIds.forEach((id: string) => allIds.add(id))

        const newCount = allIds.size
        scrollCount++

        // 显示进度
        console.log(`[浏览器] 已加载 ${newCount} 个视频 (滚动 ${scrollCount} 次)`)

        // 检测是否有新数据
        if (newCount === currentCount) {
            noNewDataCount++
            console.log(`[浏览器] 无新数据 (${noNewDataCount}/${maxNoNewData})`)

            if (noNewDataCount >= maxNoNewData) {
                console.log('[浏览器] 连续多次无新数据，停止滚动')
                break
            }

            // 尝试更长的等待
            await new Promise(resolve => setTimeout(resolve, 2000))
        } else {
            noNewDataCount = 0 // 重置计数
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

    // 检查是否启用调试模式（显示浏览器）或连接到现有 Chrome
    const debugMode = process.env.GALAXY_BROWSER_DEBUG === 'true'
    const chromeDebugUrl = process.env.GALAXY_CHROME_DEBUG_URL || 'http://127.0.0.1:9222'

    // 检查是否有可连接的 Chrome 实例
    let connectToExisting = false
    if (debugMode) {
        try {
            const response = await fetch(`${chromeDebugUrl}/json/version`)
            if (response.ok) {
                connectToExisting = true
                console.log(`[浏览器] 连接到现有 Chrome 实例: ${chromeDebugUrl}`)
            }
        } catch {
            console.log(`[浏览器] 未找到现有 Chrome 实例，将启动新浏览器`)
        }
    }

    if (!connectToExisting) {
        console.log(`[浏览器] 启动${debugMode ? '调试' : '无头'}浏览器...`)
    }

    // 用于捕获 API 请求
    const apiRequests: Array<{ url: string; method: string }> = []

    try {
        // 动态导入（处理可选依赖）
        const puppeteerExtra: PuppeteerExtra = await import('puppeteer-extra')
        const StealthPlugin = await import('puppeteer-extra-plugin-stealth')

        // 应用 stealth 插件
        puppeteerExtra.default.use(StealthPlugin.default())

        // 启动浏览器
        let browser: any
        if (connectToExisting) {
            // 连接到现有 Chrome 实例
            browser = await puppeteerExtra.default.connect({
                browserURL: chromeDebugUrl,
            })
        } else {
            browser = await puppeteerExtra.default.launch({
                headless: debugMode ? false : 'new', // Chrome 109+ 的新无头模式
                args: [
                    '--disable-blink-features=AutomationControlled',
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-web-security', // 禁用安全限制
                    '--disable-features=IsolateOrigins,site-per-process', // 禁用站点隔离
                ],
            })
        }

        const page = await browser.newPage()

        // 设置请求拦截，捕获 API 请求
        await page.setRequestInterception(true)
        page.on('request', (request: any) => {
            const url = request.url()
            // 捕获包含 post 相关的请求（用户主页视频列表 API）
            if (url.includes('/post') || url.includes('/aweme') || url.includes('user/post')) {
                console.log(`[浏览器] API 请求: ${url.slice(0, 100)}...`)
                apiRequests.push({ url, method: request.method() })
            }
            request.continue()
        })

        // 监听响应，捕获 API URL 和 cursor 参数
        let lastApiUrl: string | null = null
        let lastCursor: string | null = null
        let hasMoreData: boolean = false
        let userId: string | null = null // 用户 ID

        // 用于直接从 API 响应收集视频 ID
        const collectedVideoIds: Set<string> = new Set()

        page.on('response', async (response: any) => {
            const url = response.url()
            if (url.includes('/aweme/post')) {
                console.log(`[浏览器] API 响应完整 URL: ${url.slice(0, 150)}...`)
                lastApiUrl = url
                try {
                    const data = await response.json()
                    if (data?.aweme_list) {
                        console.log(`[浏览器] 响应包含 ${data.aweme_list.length} 个视频`)

                        // 直接从 API 响应收集视频 ID
                        for (const item of data.aweme_list) {
                            if (item.aweme_id) {
                                collectedVideoIds.add(item.aweme_id)
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

        // 设置 viewport 和用户代理
        await page.setViewport({ width: 1920, height: 1080 })
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')

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

        // 如果连接到现有浏览器，等待用户手动滚动并使用已收集的视频 ID
        let videoIds: string[]
        if (connectToExisting) {
            console.log('[浏览器] 等待 API 响应收集视频...')
            console.log('[浏览器] 提示：请在浏览器中滚动页面加载更多视频')

            // 等待一段时间让 API 响应被收集
            // 每 5 秒检查一次，直到收集到足够的视频或达到最大等待时间
            const maxWaitTime = 120000 // 最多等待 2 分钟
            const checkInterval = 5000 // 每 5 秒检查一次
            let waitedTime = 0
            let lastCount = collectedVideoIds.size

            while (waitedTime < maxWaitTime) {
                await new Promise(resolve => setTimeout(resolve, checkInterval))
                waitedTime += checkInterval

                const currentCount = collectedVideoIds.size
                console.log(`[浏览器] 已收集 ${currentCount} 个视频 ID (${waitedTime / 1000}s)`)

                // 如果连续两次检查数量没有变化，且数量大于 0，认为加载完成
                if (currentCount === lastCount && currentCount > 0) {
                    console.log('[浏览器] 视频收集完成，无新数据')
                    break
                }
                lastCount = currentCount

                // 如果收集到了超过 250 个视频，可以提前结束
                if (currentCount >= 250) {
                    console.log('[浏览器] 已收集足够的视频')
                    break
                }
            }

            videoIds = Array.from(collectedVideoIds)
        } else {
            // 启动新浏览器时，使用自动滚动
            videoIds = await autoScrollAndGetVideos(page, 500, 50, {
                lastApiUrl,
                lastCursor,
                hasMoreData
            })
        }

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
                    part: `视频 ${i + 1}`,
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