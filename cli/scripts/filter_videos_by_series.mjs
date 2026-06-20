/**
 * 独立浏览器实例 + 更强页面内 API 分页调用
 */
const userUrl = process.argv[2];
const keyword = process.argv[3];

if (!userUrl || !keyword) {
    console.error('用法: node scripts/filter_videos_by_series.mjs "<user_url>" "<series_keyword>"');
    process.exit(1);
}

async function main() {
    const puppeteerExtra = await import('puppeteer-extra');
    const StealthPlugin = await import('puppeteer-extra-plugin-stealth');
    puppeteerExtra.default.use(StealthPlugin.default());

    const browser = await puppeteerExtra.default.launch({
        headless: 'new',
        args: [
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
        ],
        protocolTimeout: 120000,
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    const videoMap = new Map();
    let apiTemplateUrl = null;
    let lastCursor = 0;
    let hasMoreData = true;
    let pageLoadCount = 0;

    // 拦截 API 响应
    page.on('response', async (response) => {
        const url = response.url();
        if (url.includes('/aweme/post')) {
            try {
                const data = await response.json();
                if (data?.aweme_list) {
                    let newVideos = 0;
                    for (const item of data.aweme_list) {
                        if (item.aweme_id && !videoMap.has(item.aweme_id)) {
                            videoMap.set(item.aweme_id, {
                                id: item.aweme_id,
                                desc: item.desc || '',
                                cover: item.video?.cover?.url_list?.[0] || '',
                                duration: item.video?.duration || 0,
                                createTime: item.create_time || 0,
                            });
                            newVideos++;
                        }
                    }
                    hasMoreData = data.has_more === 1 || data.has_more === true;
                    const cursor = data.cursor || data.max_cursor || 0;
                    if (cursor > lastCursor) lastCursor = cursor;
                    if (!apiTemplateUrl) apiTemplateUrl = url;
                    pageLoadCount++;
                    console.log(`[响应#${pageLoadCount}] +${newVideos} 个, 总计 ${videoMap.size}, cursor=${cursor}, has_more=${hasMoreData}`);
                }
            } catch {}
        }
    });

    console.log(`[访问] ${userUrl}`);
    await page.goto(userUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 8000));
    console.log(`[初始] ${videoMap.size} 个视频, has_more=${hasMoreData}`);

    // 直接用 fetch 在页面上下文中分页调用 API
    // 这比滚动更可靠，因为 fetch 会带 cookies
    for (let p = 1; p <= 50 && hasMoreData; p++) {
        if (!apiTemplateUrl || !lastCursor) break;

        const nextUrl = apiTemplateUrl.replace(/cursor=\d+/, `cursor=${lastCursor}`);

        try {
            const result = await page.evaluate(async (urlToFetch) => {
                try {
                    const resp = await fetch(urlToFetch, {
                        credentials: 'include',
                        headers: { 'Accept': 'application/json' },
                    });
                    if (!resp.ok) return { ok: false, status: resp.status };
                    const data = await resp.json();
                    return {
                        ok: true,
                        list: (data.aweme_list || []).map(item => ({
                            id: item.aweme_id,
                            desc: item.desc || '',
                            cover: item.video?.cover?.url_list?.[0] || '',
                            duration: item.video?.duration || 0,
                            createTime: item.create_time || 0,
                        })),
                        cursor: data.cursor || data.max_cursor || 0,
                        hasMore: data.has_more === 1 || data.has_more === true,
                    };
                } catch (e) {
                    return { ok: false, error: String(e) };
                }
            }, nextUrl);

            if (result.ok && result.list.length > 0) {
                let added = 0;
                for (const item of result.list) {
                    if (item.id && !videoMap.has(item.id)) {
                        videoMap.set(item.id, item);
                        added++;
                    }
                }
                lastCursor = result.cursor;
                hasMoreData = result.hasMore && result.list.length > 0;
                console.log(`[分页 ${p}] +${added} 个, 总计 ${videoMap.size}, cursor=${lastCursor}, has_more=${hasMoreData}`);
            } else {
                console.log(`[分页 ${p}] 无数据 (status=${result.status}, error=${result.error})`);
                break;
            }
        } catch (e) {
            console.log(`[分页 ${p}] 异常: ${e.message}`);
            break;
        }

        await new Promise(r => setTimeout(r, 2000));
    }

    await browser.close();

    const allVideos = Array.from(videoMap.values());
    console.log(`\n[总计] ${allVideos.length} 个视频`);

    const matched = allVideos.filter(v => v.desc.includes(keyword));
    console.log(`[匹配] "${keyword}": ${matched.length} 个`);

    if (matched.length === 0) {
        console.log(`\n全部标题:`);
        allVideos.forEach((v, i) => console.log(`  ${i + 1}. [${v.id}] ${v.desc.slice(0, 80)}`));
        return;
    }

    // 按中文数字排序
    matched.sort((a, b) => {
        const cnNums = { '一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10,
            '十一':11,'十二':12,'十三':13,'十四':14,'十五':15,'十六':16,'十七':17,'十八':18,'十九':19,'二十':20,
            '二十一':21,'二十二':22,'二十三':23,'二十四':24,'二十五':25,'二十六':26,'二十七':27,'二十八':28,'二十九':29,'三十':30,
            '三十一':31,'三十二':32,'三十三':33,'三十四':34,'三十五':35,'三十六':36,'三十七':37,'三十八':38,'三十九':39,'四十':40 };
        const na = (a.desc.match(/第([一二三四五六七八九十百千]+)集/) || [])[1] || '';
        const nb = (b.desc.match(/第([一二三四五六七八九十百千]+)集/) || [])[1] || '';
        return (cnNums[na] || 999) - (cnNums[nb] || 999);
    });

    console.log(`\n匹配视频 (按集数排序):`);
    matched.forEach((v, i) => {
        console.log(`  ${i + 1}. [${v.id}] ${v.desc.slice(0, 100)}`);
    });

    console.log(`\n[JSON]`);
    console.log(JSON.stringify(matched, null, 2));

    console.log(`\n[下载用ID列表]`);
    console.log(matched.map(v => v.id).join('\n'));
}

main().catch(err => {
    console.error('错误:', err.message);
    process.exit(1);
});
