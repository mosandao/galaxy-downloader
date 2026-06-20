/**
 * Edge 自动滚动 — 使用 defaultViewport: null 保持浏览器原生外观
 */
const userUrl = 'https://www.douyin.com/user/MS4wLjABAAAAsKpwbcE1ySXsNEY0BmQT2dLRuZXEkbeY_yHwgC6-nAakktNEEGfAv-FMZeGdT3MV';
const keyword = '大时代风云';

async function main() {
    const pptr = await import('puppeteer-core');
    const browser = await pptr.default.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
    const page = await browser.newPage();

    const videoMap = new Map();

    page.on('response', async (resp) => {
        const url = resp.url();
        if (url.includes('/aweme/post')) {
            try {
                const data = await resp.json();
                if (data?.aweme_list) {
                    for (const item of data.aweme_list) {
                        if (item.aweme_id && !videoMap.has(item.aweme_id)) {
                            videoMap.set(item.aweme_id, { id: item.aweme_id, desc: item.desc || '', createTime: item.create_time || 0 });
                        }
                    }
                    console.log('[API] +' + data.aweme_list.length + ' total=' + videoMap.size + ' more=' + (data.has_more ? 1 : 0));
                }
            } catch (e) {}
        }
    });

    console.log('[打开] ' + userUrl);
    await page.goto(userUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 5000));
    console.log('[初始] ' + videoMap.size + ' 个');

    let last = videoMap.size, nc = 0;
    for (let i = 0; i < 300 && nc < 20; i++) {
        try { await page.evaluate(() => window.scrollBy(0, 400)); } catch (e) {}
        await new Promise(r => setTimeout(r, 1000));
        try { await page.evaluate(() => window.scrollBy(0, 400)); } catch (e) {}
        await new Promise(r => setTimeout(r, 1000));
        if (i % 8 === 0) {
            try { await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); } catch (e) {}
            await new Promise(r => setTimeout(r, 2000));
        }
        const cur = videoMap.size;
        if (cur > last) { console.log('[滚动' + (i+1) + '] total=' + cur); last = cur; nc = 0; }
        else { nc++; }
    }

    console.log('[完成] total=' + videoMap.size);
    await browser.disconnect();

    const matched = Array.from(videoMap.values()).filter(v => v.desc && v.desc.includes(keyword));
    matched.sort((a, b) => a.createTime - b.createTime);
    console.log('\n[' + keyword + '] ' + matched.length + ' 集');
    matched.forEach((v, i) => console.log('  ' + (i+1) + '. [' + v.id + '] ' + (v.desc||'').slice(0, 60)));
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
