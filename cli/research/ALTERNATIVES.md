# 替代方案研究

## 1. 第三方解析服务

### 公开 API

| 服务 | 状态 | 说明 |
|------|------|------|
| 抖音官方 API | 需签名 | 需要设备签名参数 |
| iesdouyin.com | 可能失效 | 移动端接口，反爬严格 |
| 第三方解析站 | 不稳定 | 多数需要付费或有水印 |

### 搜索结果

通过搜索发现：
- 大多数"抖音解析"网站已失效或收费
- 免费解析服务通常有水印、限速
- 不建议依赖第三方不稳定服务

## 2. 移动端 API

### 已知端点

```
# 用户主页作品列表（需要登录）
https://www.iesdouyin.com/web/api/v2/user/posts/?user_id=xxx&count=20

# 用户信息
https://www.iesdouyin.com/web/api/v2/user/info/?user_id=xxx
```

**限制**：
- 需要有效的 Cookie/Token
- 有签名参数要求
- 反爬检测严格

## 3. Cookie/Token 方案

### 从浏览器提取

用户可以手动从浏览器提取 Cookie：

1. 登录抖音网页版
2. 打开开发者工具 (F12)
3. 找到 Cookie 中的 `ttwid`、`sid_tt` 等
4. 复制到 CLI 配置

### 配置方式

```bash
# 设置 Cookie
export DOUYIN_COOKIE="ttwid=xxx; sid_tt=xxx"

# 使用
node dist/index.js "https://www.douyin.com/user/xxx?showSubTab=video"
```

### 实现思路

```typescript
// 在请求中添加用户提供的 Cookie
const headers = {
    'Cookie': process.env.DOUYIN_COOKIE || '',
    'User-Agent': '...',
}

const response = await fetch(url, { headers })
```

**效果**：
- 可能绕过部分检测
- 但仍可能被 JS 混淆阻止（数据不直接返回在 HTML）

## 4. 数据源分析

### 抖音用户主页数据来源

通过分析抖音网页版：

1. **HTML 初始渲染**：使用 _$jsvmprt 混淆，需要 JS 执行
2. **AJAX 请求**：需要签名参数
3. **JSON 嵌入**：需要 JS 解析

**结论**：纯 fetch 无法获取用户主页视频列表，必须：
- 使用无头浏览器执行 JS
- 或有有效的签名生成算法（复杂）

## 5. 推荐方案对比

| 方案 | 可行性 | 复杂度 | 稳定性 |
|------|--------|--------|--------|
| 无头浏览器 | 高 | 中 | 中（可能被检测）|
| 手动 Cookie | 低 | 低 | 低（仍被混淆阻止）|
| 第三方 API | 低 | 低 | 低（不稳定）|
| 手动操作 | 高 | 无 | 高 |

## 6. 最终建议

### 短期方案

1. **提示用户手动操作**：
   ```
   抖音用户主页需要登录/浏览器环境
   建议：
   1. 打开抖音网页版
   2. 进入用户主页
   3. 点击每个视频，复制单个视频链接
   4. 使用单个视频链接下载
   ```

2. **保持单个视频解析能力**：
   - fetch + HTML 解析对单个视频有效
   - 这是主要使用场景

### 长期方案

1. **可选的浏览器模式**：
   - 作为可选功能（需要额外安装 Puppeteer）
   - 命令参数 `--browser` 启用
   - 仅在用户主页时提示使用

2. **持续关注**：
   - 抖音 API/反爬变化
   - 新的解析方法

## 参考资料

- [Puppeteer Stealth](https://github.com/berstend/puppeteer-extra/tree/master/packages/puppeteer-extra-plugin-stealth)
- [Headless Browser Detection Methods](https://bot.sannysoft.com/)
- [Browser Fingerprinting](https://fingerprintjs.com/)