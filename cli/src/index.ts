#!/usr/bin/env node

import { Command } from 'commander'
import { parseCommand } from './commands/parse.js'
import { downloadCommand } from './commands/download.js'
import { getApiBaseUrl } from './api/client.js'
import { normalizePlatform, getPlatformDisplayName } from './platforms.js'

const program = new Command()

program
    .name('galaxy-downloader')
    .description('多平台媒体下载工具 - 支持 Bilibili、抖音、Instagram、小红书、TikTok、X 等平台')
    .version('1.0.0')

// 主命令：下载
program
    .argument('<url>', '媒体链接')
    .option('-t, --type <type>', '下载类型: video, audio, images, auto (默认: auto)', 'auto')
    .option('-o, --output <dir>', '输出目录 (默认: ./downloads)', './downloads')
    .option('-p, --part <num>', '多P视频指定分P下载')
    .option('--browser', '使用浏览器模式（用于抖音用户主页批量下载）')
    .option('--json', '输出 JSON 格式结果')
    .option('--api-base <url>', '上游 API 地址')
    .action(async (url: string, options) => {
        // 设置自定义 API 地址
        if (options.apiBase) {
            process.env.GALAXY_API_BASE_URL = options.apiBase
        }

        // 设置浏览器模式
        if (options.browser) {
            process.env.GALAXY_BROWSER_MODE = 'true'
        }

        const result = await downloadCommand({
            url,
            type: options.type as 'video' | 'audio' | 'images' | 'auto',
            output: options.output,
            part: options.part ? parseInt(options.part, 10) : undefined,
            browser: options.browser,
            json: options.json,
        })

        if (options.json) {
            console.log(JSON.stringify(result, null, 2))
        }

        process.exit(result.success ? 0 : 1)
    })

// 子命令：仅解析信息
program
    .command('parse')
    .argument('<url>', '媒体链接')
    .description('解析媒体信息（不下载）')
    .option('--browser [flag]', '使用浏览器模式（用于抖音用户主页）', 'false')
    .option('--api-base <url>', '上游 API 地址')
    .action(async (url: string, options: any) => {
        if (options.apiBase) {
            process.env.GALAXY_API_BASE_URL = options.apiBase
        }

        if (options.browser) {
            process.env.GALAXY_BROWSER_MODE = 'true'
        }

        const result = await parseCommand({ url, browser: options.browser })
        process.exit(result.success ? 0 : 1)
    })

// 子命令：显示支持的平台
program
    .command('platforms')
    .description('显示支持的平台列表')
    .action(() => {
        console.log('\n支持的平台:')
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

        const platforms = [
            { name: 'Bilibili', url: 'bilibili.com, b23.tv', support: '视频、音频、多P' },
            { name: '抖音', url: 'douyin.com, v.douyin.com', support: '视频、图文、音频提取' },
            { name: 'Instagram', url: 'instagram.com', support: 'Reels、帖子、图文' },
            { name: '小红书', url: 'xiaohongshu.com, xhslink.com', support: '视频、图文笔记' },
            { name: 'TikTok', url: 'tiktok.com', support: '视频、音频提取' },
            { name: 'X/Twitter', url: 'x.com, twitter.com', support: '视频、音频提取' },
            { name: 'YouTube', url: 'youtube.com', support: '视频、音频' },
            { name: '微博', url: 'weibo.com', support: '视频、音频提取' },
            { name: '微信公众号', url: 'mp.weixin.qq.com', support: '文章内嵌视频' },
            { name: 'Niconico', url: 'nicovideo.jp', support: '视频' },
            { name: 'Threads', url: 'threads.net', support: '视频、音频提取' },
            { name: 'Telegram', url: 't.me', support: '视频' },
        ]

        platforms.forEach(p => {
            console.log(`\n  ${p.name}`)
            console.log(`    URL: ${p.url}`)
            console.log(`    支持: ${p.support}`)
        })

        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
    })

// 子命令：显示配置信息
program
    .command('config')
    .description('显示当前配置')
    .action(() => {
        console.log('\n当前配置:')
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        console.log(`API 地址: ${getApiBaseUrl()}`)
        console.log(`环境变量: GALAXY_API_BASE_URL=${process.env.GALAXY_API_BASE_URL || '(未设置)'}`)
        console.log('\n设置方法:')
        console.log('  export GALAXY_API_BASE_URL=http://your-api-server:8080')
        console.log('  或使用 --api-base 参数')
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
    })

program.parse()