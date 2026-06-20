/**
 * 连接 Edge，从已加载的页面 DOM 中提取视频列表
 */
const keyword = '大时代风云';

async function main() {
    const pptr = await import('puppeteer-extra');
    const stealth = await import('puppeteer-extra-plugin-stealth');
    pptr.default.use(stealth.default());

    const browser = await pptr.default.connect({ browserURL: 'http://127.0.0.1:9222' });
    const pages = await browser.pages();

    // 找到抖音用户页面
    let page = null;
    for (const p of pages) {
        const url = p.url();
        if (url.includes('douyin.com/user/')) {
            page = p;
            console.log('[找到页面] ' + url.slice(0, 80));
            break;
        }
    }

    if (!page) {
        console.log('未找到抖音用户页面，请确保已在 Edge 中打开用户主页');
        await browser.disconnect();
        return;
    }

    // 从 DOM 提取视频信息
    const videos = await page.evaluate(() => {
        const results = [];
        const links = document.querySelectorAll('a[href*="/video/"]');
        const seen = new Set();

        for (const a of links) {
            const href = a.getAttribute('href') || '';
            const match = href.match(/video\/(\d+)/);
            if (!match) continue;
            const id = match[1];
            if (seen.has(id)) continue;
            seen.add(id);

            // 尝试找到标题（通常在附近元素中）
            let title = a.getAttribute('title') || a.getAttribute('aria-label') || '';
            if (!title) {
                // 向上或向下查找文字
                const parent = a.closest('li, div[class*="item"], div[class*="card"]');
                if (parent) {
                    title = parent.textContent?.trim() || '';
                } else {
                    title = a.textContent?.trim() || '';
                }
            }

            results.push({ id, title });
        }

        return results;
    });

    console.log('[DOM提取] ' + videos.length + ' 个视频链接');

    // 筛选大时代风云
    const matched = videos.filter(v => v.title && v.title.includes(keyword));
    console.log('[匹配"' + keyword + '"] ' + matched.length + ' 个\n');

    if (matched.length === 0) {
        console.log('未找到匹配视频。前20个标题:');
        videos.slice(0, 20).forEach((v, i) => {
            console.log('  ' + (i + 1) + '. [' + v.id + '] ' + v.title.slice(0, 100));
        });
    } else {
        // 按标题中的集数排序
        const cnNums = { '一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10,
            '十一':11,'十二':12,'十三':13,'十四':14,'十五':15,'十六':16,'十七':17,'十八':18,'十九':19,'二十':20,
            '二十一':21,'二十二':22,'二十三':23,'二十四':24,'二十五':25 };
        matched.sort((a, b) => {
            const na = (a.title.match(/第([一二三四五六七八九十百千]+)集/) || [])[1] || '';
            const nb = (b.title.match(/第([一二三四五六七八九十百千]+)集/) || [])[1] || '';
            return (cnNums[na] || 999) - (cnNums[nb] || 999);
        });

        console.log('大时代风云 系列:');
        matched.forEach((v, i) => {
            const ep = v.title.match(/第([一二三四五六七八九十百千]+)集/);
            const label = ep ? '第' + ep[1] + '集' : '特别篇';
            console.log('  ' + (i + 1) + '. [' + v.id + '] ' + label);
            console.log('     ' + v.title.slice(0, 120));
        });

        // 检测缺失
        const foundEps = new Set();
        matched.forEach(v => {
            const ep = v.title.match(/第([一二三四五六七八九十百千]+)集/);
            if (ep) foundEps.add(ep[1]);
        });
        const cnList = ['一','二','三','四','五','六','七','八','九','十',
            '十一','十二','十三','十四','十五','十六','十七','十八','十九','二十',
            '二十一','二十二','二十三','二十四','二十五'];
        const missing = cnList.filter(cn => !foundEps.has(cn));
        if (missing.length > 0) {
            console.log('\n⚠️  缺失: ' + missing.map(c => '第' + c + '集').join(', '));
        }

        console.log('\n[JSON]');
        console.log(JSON.stringify(matched, null, 2));

        // 新增的视频（之前没下载的）
        const downloaded = new Set([
            '7649974411151445294', '7648565449218608426', '7647368439710895402',
            '7647015067376045355', '7646631263780015423', '7646252170668477746',
            '7644770937778343208', '7643670021440392458', '7642181725388295475',
            '7641813491568971059', '7641439511452437810', '7641041208118103334',
            '7640698790508301604', '7651826666838314278',
        ]);
        const needDownload = matched.filter(v => !downloaded.has(v.id));
        if (needDownload.length > 0) {
            console.log('\n[新增待下载]');
            needDownload.forEach(v => console.log(v.id));
        }
    }

    await browser.disconnect();
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
