# Puppeteer 无头浏览器方案研究

## 依赖分析

### 包大小

| 组件 | 大小 |
|------|------|
| puppeteer | ~3 MB (npm) |
| Chromium (bundled) | ~170-280 MB |
| puppeteer-core | ~2 MB (不含 Chromium) |

### 轻量方案

```bash
# 使用 puppeteer-core + 本地已安装的 Chrome
npm install puppeteer-core
```

```typescript
import puppeteer from 'puppeteer-core'

// 使用系统 Chrome
const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new', // Chrome 109+ 新模式
})
```

## 抖音反爬分析

### _$jsvmprt 混淆

抖音使用 JavaScript 虚拟机混淆，特点：
- VM 字节码执行，难以静态分析
- 需要完整 JS 运行环境才能解密
- 无头浏览器可以处理（会执行 JS）

### 检测向量

| 检测方法 | Puppeteer 是否被检测 |
|----------|----------------------|
| `navigator.webdriver` | ✓ 可被 stealth 插件绕过 |
| Chrome DevTools Protocol | ✓ 需要特殊处理 |
| Canvas fingerprint | ✓ 可能被检测 |
| WebGL fingerprint | ✓ 可能被检测 |
| User interaction | ✓ 需要模拟 |

### 解决方案

```bash
# 安装 stealth 插件
npm install puppeteer-extra puppeteer-extra-plugin-stealth
```

```typescript
import puppeteer from 'puppeteer-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'

puppeteer.use(StealthPlugin())

const browser = await puppeteer.launch({
    headless: 'new',
    args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
    ],
})
```

## 代码示例

```typescript
import puppeteer from 'puppeteer-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'

puppeteer.use(StealthPlugin())

async function fetchDouyinUserVideos(userUrl: string): Promise<string[]> {
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--disable-blink-features=AutomationControlled'],
    })

    const page = await browser.newPage()

    // 设置 viewport 和用户代理
    await page.setViewport({ width: 1920, height: 1080 })
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')

    // 访问用户主页
    await page.goto(userUrl, { waitUntil: 'networkidle2' })

    // 等待视频列表加载
    await page.waitForSelector('[class*="video"]', { timeout: 10000 })

    // 提取视频 ID
    const videoIds = await page.evaluate(() => {
        const ids: string[] = []
        // 从页面 DOM 中提取
        document.querySelectorAll('a[href*="/video/"]').forEach(el => {
            const href = el.getAttribute('href') || ''
            const match = href.match(/video\/(\d+)/)
            if (match) ids.push(match[1])
        })
        return ids
    })

    await browser.close()
    return videoIds
}
```

## 优缺点

### 优点

1. ✓ 可以执行 JS，绕过 _$jsvmprt 混淆
2. ✓ stealth 插件可绕过大部分检测
3. ✓ `headless: 'new'` 模式更接近真实浏览器
4. ✓ 可以处理动态加载内容

### 缺点

1. ✗ Chromium 体积大（170-280 MB）
2. ✗ 启动慢（2-5 秒）
3. ✗ 内存占用高（100-200 MB/实例）
4. ✗ 可能仍需要处理验证码/登录
5. ✗ stealth 插件不是 100% 有效

## 推荐方案

**方案 A：puppeteer-core + 本地 Chrome**

适合有 Chrome 的用户，减少依赖体积。

```json
{
    "dependencies": {
        "puppeteer-core": "^22.0.0",
        "puppeteer-extra": "^2.1.6",
        "puppeteer-extra-plugin-stealth": "^2.11.2"
    },
    "optionalDependencies": {
        "puppeteer": "^22.0.0"  // 备用：下载 Chromium
    }
}
```

**方案 B：按需启动**

仅在用户主页模式时启动浏览器，普通视频用 fetch。

```typescript
// 检测是否是用户主页
if (url.includes('showSubTab') || url.includes('/user/')) {
    console.log('[提示] 用户主页需要无头浏览器，启动中...')
    return await parseWithBrowser(url)
}
```

## 风险提示

1. 抖音可能升级检测机制
2. 需要定期更新 stealth 插件
3. 验证码/登录问题无法自动解决
4. 部分用户主页可能需要登录才能查看