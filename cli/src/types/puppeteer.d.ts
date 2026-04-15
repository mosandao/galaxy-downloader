declare module 'puppeteer-extra' {
    import puppeteer from 'puppeteer-core'
    export default puppeteer
    export function use(plugin: any): void
}

declare module 'puppeteer-extra-plugin-stealth' {
    export default function stealthPlugin(): any
}