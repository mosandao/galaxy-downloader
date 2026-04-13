import { describe, expect, it } from 'vitest';

import { getPlatformSupportItems } from '../src/components/downloader/platform-support';

const dict = {
    guide: {
        platformSupport: {
            bilibili: { name: 'Bilibili', summary: 'video' },
            bilibiliTv: { name: 'Bilibili TV', summary: 'tv' },
            douyin: { name: 'Douyin', summary: 'video' },
            youtube: { name: 'YouTube', summary: 'video' },
            telegram: { name: 'Telegram', summary: 'channel' },
            threads: { name: 'Threads', summary: 'post' },
            wechat: { name: 'WeChat', summary: 'article' },
            niconico: { name: 'Niconico', summary: 'video' },
            weibo: { name: 'Weibo', summary: 'post' },
            xiaohongshu: { name: 'Xiaohongshu', summary: 'note' },
            tiktok: { name: 'TikTok', summary: 'video' },
            instagram: { name: 'Instagram', summary: 'post' },
            x: { name: 'X', summary: 'post' },
            comingSoon: 'Coming soon',
        },
    },
} as const;

describe('getPlatformSupportItems', () => {
    it('hides youtube from the platform support list', () => {
        const items = getPlatformSupportItems(dict);

        expect(items.map((item) => item.key)).not.toContain('youtube');
    });
});
