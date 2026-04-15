/**
 * 无头浏览器解析模块
 *
 * 使用 Puppeteer + Stealth 插件解析抖音用户主页
 * 需要安装可选依赖：puppeteer-core, puppeteer-extra, puppeteer-extra-plugin-stealth
 */

import type { ParserResult } from './index.js'

// 可选依赖的类型声明（动态导入时使用 any）
type PuppeteerExtra = any
type PuppeteerCore = any

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
 * 使用浏览器解析抖音用户主页
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

    console.log('[浏览器] 启动无头浏览器...')

    try {
        // 动态导入（处理可选依赖）
        const puppeteerExtra: PuppeteerExtra = await import('puppeteer-extra')
        const StealthPlugin = await import('puppeteer-extra-plugin-stealth')

        // 应用 stealth 插件
        puppeteerExtra.default.use(StealthPlugin.default())

        // 启动浏览器
        const browser = await puppeteerExtra.default.launch({
            headless: 'new', // Chrome 109+ 的新无头模式
            args: [
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
                '--disable-setuid-sandbox',
            ],
        })

        const page = await browser.newPage()

        // 设置 viewport 和用户代理
        await page.setViewport({ width: 1920, height: 1080 })
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')

        console.log('[浏览器] 访问用户主页...')

        // 访问用户主页
        await page.goto(url, {
            waitUntil: 'networkidle2',
            timeout: 30000,
        })

        // 等待页面加载（使用 setTimeout 替代已弃用的 waitForTimeout）
        await new Promise(resolve => setTimeout(resolve, 3000))

        // 尝试等待视频元素
        try {
            await page.waitForSelector('[class*="video"]', { timeout: 10000 })
        } catch {
            // 可能页面结构不同，继续尝试提取
        }

        console.log('[浏览器] 提取视频列表...')

        // 提取视频 ID
        const videoIds = await page.evaluate(() => {
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

            // 方法 3: 从页面 JS 数据提取
            const scripts = document.querySelectorAll('script')
            scripts.forEach(script => {
                const content = script.textContent || ''
                const matches = content.matchAll(/modal_id["']?\s*[:=]\s*["']?(\d{15,20})["']?/g)
                for (const match of matches) {
                    if (match[1]) ids.push(match[1])
                }
            })

            // 去重
            return Array.from(new Set(ids))
        })

        await browser.close()

        console.log(`[浏览器] 找到 ${videoIds.length} 个视频`)

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