# 无头浏览器方案研究总结

## 问题背景

抖音用户主页使用 `_$jsvmprt` JavaScript 虚拟机混淆技术，纯 `fetch` 无法获取视频列表数据。

## 方案对比

| 方案 | 依赖大小 | 启动速度 | 可行性 | 稳定性 |
|------|----------|----------|--------|--------|
| Puppeteer + Chromium | 170-280 MB | 2-5s | ✓ 高 | 中 |
| Puppeteer-core + 本地 Chrome | 3 MB | 1-2s | ✓ 高 | 中 |
| Playwright | 200+ MB | 2-3s | ✓ 高 | 中 |
| 手动 Cookie | 0 | 0s | ✗ 低 | 低 |
| 第三方 API | 0 | 0s | ✗ 低 | 低 |
| 手动操作 | 0 | 0s | ✓ 高 | 高 |

## 推荐方案

### 方案一：可选的浏览器模式（推荐）

**设计思路**：
- 默认使用 fetch（轻量、快速）
- 仅在用户主页时提示需要浏览器
- 用户可选择安装 Puppeteer 并使用 `--browser` 参数

**实现要点**：

```typescript
// 检测用户主页
if (url.includes('/user/') && !url.includes('modal_id')) {
    if (options.browser) {
        return await parseWithPuppeteer(url)
    }
    return {
        success: false,
        error: '抖音用户主页需要浏览器环境。使用 --browser 参数（需安装 puppeteer）',
        hint: 'npm install puppeteer-core puppeteer-extra puppeteer-extra-plugin-stealth'
    }
}
```

**依赖配置**：

```json
{
    "dependencies": {
        "puppeteer-core": "^22.0.0"
    },
    "optionalDependencies": {
        "puppeteer-extra": "^2.1.6",
        "puppeteer-extra-plugin-stealth": "^2.11.2"
    }
}
```

### 方案二：手动操作提示（最简单）

保持当前行为，提供清晰的错误提示：

```
抖音用户主页使用了 JS 混淆技术，需要浏览器环境。

建议：
1. 打开抖音网页版 https://www.douyin.com
2. 进入用户主页
3. 点击每个视频，复制视频链接
4. 使用单个视频链接下载：
   node cli/dist/index.js "https://www.douyin.com/video/xxx"
```

## 技术风险

1. **检测升级**：抖音可能更新检测机制
2. **Stealth 失效**：puppeteer-extra-plugin-stealth 需要定期更新
3. **验证码**：大量请求可能触发验证码
4. **登录要求**：部分用户主页需要登录

## 最终建议

**短期**：保持方案二（手动操作提示），这是最稳定的方案

**长期**：如果用户需求强烈，可添加可选的浏览器模式（方案一）

---

**结论**：无头浏览器技术上可行，但增加了复杂性和维护成本。建议优先保持轻量级 CLI，将用户主页批量下载作为高级可选功能。