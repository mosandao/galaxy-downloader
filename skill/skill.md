---
name: media-downloader
description: "多平台媒体下载工具。支持 Bilibili、抖音、Instagram、小红书、TikTok、X 等平台的视频、音频、图文下载。内置解析器，无需外部服务。Use when user asks to download video, audio, or images from social media platforms, or mentions 下载视频/下载音频/下载图片."
license: MIT-0
compatibility: "适用于 Claude Code、Cursor、Copilot 等支持 Agent Skills 的工具。需要 Node.js 18+。"
metadata:
  author: galaxy-downloader
  version: "1.0.0"
  language: zh-CN
  category: media-tools
  tags: "download, video, audio, bilibili, douyin, tiktok, instagram, xiaohongshu, 媒体下载"
---

# 媒体下载器 (Media Downloader)

从各大社交平台下载视频、音频、图文内容。内置解析器，无需外部服务依赖。

## 快速参考

| 场景 | 操作 |
|------|------|
| 用户提供视频链接 | 自动识别平台 → 下载视频 |
| 用户请求下载音频 | 解析链接 → 提取/下载音频 |
| 用户请求下载图片 | 解析链接 → 打包下载图片 |
| 用户想查看视频信息 | 使用 `parse` 子命令查看元数据 |
| 多P视频下载 | 使用 `--part` 指定分P |
| 查看下载历史 | 使用 `history` 子命令 |

---

## SQLite 存储

所有下载和转录记录自动保存到 SQLite 数据库（`data/galaxy.db`）。

**数据表结构**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | INTEGER | 自增主键 |
| `platform` | TEXT | 平台: bilibili, douyin, tiktok 等 |
| `username` | TEXT | 用户名/作者 |
| `title` | TEXT | 视频/音频标题 |
| `video_url` | TEXT | 原始视频链接 |
| `media_path` | TEXT | 下载文件路径（视频或音频） |
| `transcript_text` | TEXT | 转录文本内容（完整文本） |
| `published_at` | TEXT | 视频发表时间 |
| `downloaded_at` | TEXT | 下载时间（自动记录） |

**查询命令**：

```bash
# 查看最近 20 条记录
node cli/dist/index.js history

# 按标题搜索
node cli/dist/index.js history "关键词"

# 按平台筛选
node cli/dist/index.js history --platform douyin

# 指定显示条数
node cli/dist/index.js history -n 50
```

**自动记录流程**：
- **下载前** → 按视频 URL 和标题查询数据库，已下载过则跳过并显示文件路径
- **下载完成** → 自动插入数据库，记录平台、用户名、标题、视频链接、文件路径、发布时间
- **转录完成** → 自动将识别出的完整文本内容存入数据库对应记录的 `transcript_text` 字段

---

## 支持平台

| 平台 | 视频 | 音频 | 图文 | 多P | 状态 |
|------|:----:|:----:|:----:|:----:|:----:|
| Bilibili | ✓ | ✓ | - | ✓ | **可用** |
| 抖音 | ✓ | ✓(提取) | ✓ | - | **可用** |
| TikTok | ✓ | ✓(提取) | - | - | 已实现 |
| 小红书 | ✓ | ✓(提取) | ✓ | - | 已实现 |
| X/Twitter | ✓ | ✓(提取) | - | - | 已实现 |
| Instagram | ✓ | ✓(提取) | ✓ | - | 已实现 |
| YouTube | ✓ | ✓ | - | - | 待实现 |
| 微博 | ✓ | ✓(提取) | - | - | 待实现 |

**注意**: TikTok、小红书、X、Instagram 等海外平台由于反爬限制，可能需要特殊网络环境才能正常工作。

---

## 命令格式

### CLI 路径

CLI 工具位于项目 `cli/dist/index.js`：

```bash
# 实际调用方式
node cli/dist/index.js "<url>"
```

### 基本用法

```bash
# 下载视频（默认）
node cli/dist/index.js <url>

# 下载音频
node cli/dist/index.js <url> --type audio

# 下载图片
node cli/dist/index.js <url> --type images

# 查看信息（不下载）
node cli/dist/index.js parse <url>

# 指定输出目录
node cli/dist/index.js <url> --output ./my-downloads

# JSON 输出（便于程序处理）
node cli/dist/index.js <url> --json
```

### 多P视频处理

```bash
# 下载特定分P
node cli/dist/index.js <bilibili-url> --part 2
```

### 查看支持的平台

```bash
node cli/dist/index.js platforms
```

---

## Claude 使用指南

### 识别下载请求

当用户说以下内容时，触发此 Skill：

- "下载这个视频"
- "帮我下载 Bilibili 的..."
- "提取这个视频的音频"
- "保存这些图片"
- "下载抖音视频"
- "get video from [URL]"

### 执行步骤

1. **确认 URL**：提取用户提供的链接
2. **确定下载类型**：
   - 默认下载视频
   - 如果用户说"音频"、"音乐"、"MP3"，下载音频
   - 如果用户说"图片"、"图文"，下载图片
3. **调用命令**：
   ```bash
   node cli/dist/index.js "<url>" --type <type> --output ./downloads
   ```
4. **报告结果**：
   - 成功：显示下载文件路径
   - 失败：显示错误信息和建议

### 示例对话

**用户**: 帮我下载这个 Bilibili 视频 https://www.bilibili.com/video/BV123456

**Claude**:
```
我来帮你下载这个视频。

[执行] node cli/dist/index.js "https://www.bilibili.com/video/BV123456" --type video

[结果]
标题: 《视频标题》
平台: Bilibili
时长: 10:30
下载完成: ./downloads/视频标题.mp4 (125 MB)
```

---

## 输出格式

### 文本输出

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
标题: 《视频标题》
平台: Bilibili
时长: 10:30
类型: 单P视频

下载选项:
  ✓ 视频
  ✓ 音频

简介: 视频描述内容...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### JSON 输出 (--json)

```json
{
  "success": true,
  "files": [
    {
      "type": "video",
      "path": "./downloads/视频标题.mp4",
      "size": 125829120
    }
  ]
}
```

---

## 错误处理

| 错误类型 | 说明 | 建议 |
|----------|------|------|
| UNSUPPORTED_PLATFORM | 不支持的平台 | 提示用户更换平台 |
| PARSE_FAILED | 无法解析链接 | 检查链接格式是否正确 |
| UPSTREAM_ERROR | 上游请求失败 | 可能是反爬限制，稍后再试 |
| NETWORK_ERROR | 网络连接失败 | 检查网络连接 |

---

## 依赖要求

1. **Node.js**: 18+ (支持原生 fetch)
2. **FFmpeg** (可选): 音频提取功能需要

---

### 文件命名规则

**所有输出文件（视频、音频、转录文本）必须使用视频的实际标题作为文件名**，禁止使用 `P1`、`P2`、`video_1` 等通用命名。

```bash
# 正确示例
./downloads/剧情不是编出来的_是人物关系推导出来的.mp4
./downloads/剧情不是编出来的_是人物关系推导出来的.m4a
./transcripts/剧情不是编出来的_是人物关系推导出来的.txt

# 错误示例
./downloads/用户视频合集 (27 个)-P1.mp4
./downloads/P1.m4a
./transcripts/P1.txt
```

下载完成后，如文件使用了通用命名，需要用 `mv` 重命名为视频标题。

### 工作流：下载与转录并行

下载、音频提取、音频转录是**独立且可并行**的任务。根据用户需求灵活启动，不必等全部下载完再统一处理。

**流水线策略**（适用于批量下载+转录场景）：

1. 下载第 1 个视频 → 下载完成后**立即**提取音频 → 提取完成后**立即** transcribe
2. 在第 1 个视频转录的同时，继续下载第 2、3、4、5 个视频
3. 每个视频下载完成后立即开始提取音频并转录

```
时间线:
下载 P1 ──→ 提取音频 ──→ transcribe
    ↓(下载完P1后)
下载 P2 ──→ 提取音频 ──→ transcribe
    ↓(下载完P2后)
下载 P3 ...
```

**按需启动**：
- 用户只要求下载 → 只执行下载
- 用户要求下载+转录 → 使用流水线策略，下载第一个后立即开始转录
- 用户只要求转录已有文件 → 只执行 transcribe

### 抖音用户主页批量下载

抖音用户主页（`douyin.com/user/...`）由于 JS 混淆和反爬签名机制，**必须使用 `--browser` 参数**：

```bash
# 下载用户主页的特定分P（必须间隔 3 秒）
sleep 3 && node cli/dist/index.js "<user-url>" --type video --part 1 --output ./downloads --browser
sleep 3 && node cli/dist/index.js "<user-url>" --type video --part 2 --output ./downloads --browser
```

**重要**：连续使用 `--browser` 下载时，每次之间必须间隔至少 **3 秒**（`sleep 3`），否则 puppeteer 浏览器会断开导致 "Navigation failed because browser has disconnected!" 错误。

### 音频提取与转录

**音频提取**（从 MP4 视频提取 M4A 音频）：

```bash
ffmpeg -i video.mp4 -vn -acodec aac -y audio.m4a
```

**音频转录**（使用 Whisper 模型，文本自动存入数据库）：

```bash
# 转录为文本（input 是位置参数，不能用 --input）
node cli/dist/index.js transcribe ./downloads --outdir ./transcripts --format txt
```

转录完成后，识别出的完整文本内容会自动存入 SQLite 数据库中对应记录的 `transcript_text` 字段。通过 `history` 命令可以查看哪些视频已完成转录。

支持的转录参数：
- `<input>` — 音频文件或目录（**位置参数**，不是 `--input`）
- `--outdir` — 输出目录（**不是** `--output`）
- `-m` — 模型路径（默认 `~/.omlx/models/whisper-large-v3-turbo`）
- `-l` — 语言代码（默认 `zh`）
- `-f` — 输出格式：txt, srt, vtt, json（默认 `txt`）

---

## 注意事项

1. **版权提醒**: 下载内容仅供个人使用，请尊重版权
2. **平台限制**: 某些内容可能有地域或版权限制
3. **大文件**: 视频文件可能很大，注意磁盘空间
4. **网络**: 海外平台（TikTok、Instagram、X）可能需要特殊网络环境
5. **抖音浏览器模式**: 用户主页下载必须加 `--browser`，连续下载需间隔 3 秒
