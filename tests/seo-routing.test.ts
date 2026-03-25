import assert from 'node:assert/strict'
import test from 'node:test'

import {
    isBotUserAgent,
    resolveLocaleForRequest,
    resolveLocaleFromAcceptLanguage,
} from '../src/lib/seo-routing.ts'

const locales = ['zh', 'zh-tw', 'en', 'ja'] as const
const defaultLocale = 'en'

test('detects bot user agents', () => {
    assert.equal(isBotUserAgent('Mozilla/5.0 Googlebot/2.1'), true)
    assert.equal(isBotUserAgent('Mozilla/5.0 AppleWebKit Safari'), false)
})

test('returns locale from pathname when locale prefix exists', () => {
    const locale = resolveLocaleForRequest({
        pathname: '/en/contact',
        userAgent: 'Mozilla/5.0',
        cookieLocale: 'zh',
        acceptLanguages: ['zh-CN'],
        locales,
        defaultLocale,
    })
    assert.equal(locale, 'en')
})

test('uses cookie locale for normal users when no locale prefix', () => {
    const locale = resolveLocaleForRequest({
        pathname: '/contact',
        userAgent: 'Mozilla/5.0',
        cookieLocale: 'zh-tw',
        acceptLanguages: ['en-US'],
        locales,
        defaultLocale,
    })
    assert.equal(locale, 'zh-tw')
})

test('bots ignore cookie locale and use accept-language', () => {
    const locale = resolveLocaleForRequest({
        pathname: '/contact',
        userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        cookieLocale: 'zh',
        acceptLanguages: ['en-US', 'en'],
        locales,
        defaultLocale,
    })
    assert.equal(locale, 'en')
})

test('accept-language mapping supports zh-Hant fallback to zh-tw', () => {
    assert.equal(resolveLocaleFromAcceptLanguage(['zh-Hant', 'en-US'], locales, defaultLocale), 'zh-tw')
})

test('accept-language mapping supports ja fallback to ja', () => {
    assert.equal(resolveLocaleFromAcceptLanguage(['ja-JP', 'en-US'], locales, defaultLocale), 'ja')
})

test('falls back to default locale for unsupported accept-language', () => {
    assert.equal(resolveLocaleFromAcceptLanguage(['fr-FR'], locales, defaultLocale), 'en')
})
