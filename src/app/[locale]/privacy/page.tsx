import type { Metadata } from "next"
import Link from "next/link"
import { getMessages } from "next-intl/server"
import { PageStructuredData } from "@/components/page-structured-data"
import type { Locale } from "@/lib/i18n/config"
import type { Dictionary } from "@/lib/i18n/types"
import {
    buildLanguageAlternates,
    buildLocaleUrl,
    buildOpenGraphLocaleAlternates,
    localeToOpenGraphLocale,
} from "@/lib/seo"

export async function generateMetadata({
    params,
}: {
    params: Promise<{ locale: Locale }>
}): Promise<Metadata> {
    const { locale } = await params
    const dict = await getMessages({ locale }) as Dictionary
    const title = dict.privacyPage.metaTitle
    const description = dict.privacyPage.metaDescription
    const url = buildLocaleUrl(locale, "/privacy")

    return {
        title,
        description,
        openGraph: {
            title,
            description,
            url,
            siteName: dict.metadata.siteName,
            locale: localeToOpenGraphLocale(locale),
            alternateLocale: buildOpenGraphLocaleAlternates(locale),
            type: "website",
            images: ["/og/privacy.png"],
        },
        twitter: {
            card: "summary_large_image",
            title,
            description,
            images: ["/og/privacy.png"],
        },
        alternates: {
            canonical: url,
            languages: buildLanguageAlternates("/privacy"),
        },
    }
}

export default async function PrivacyPage({
    params,
}: {
    params: Promise<{ locale: Locale }>
}) {
    const { locale } = await params
    const dict = await getMessages({ locale }) as Dictionary
    const copy = dict.privacyPage

    return (
        <main className="min-h-screen bg-background">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 md:px-8 py-10 space-y-6">
                <h1 className="text-3xl font-semibold tracking-tight">{copy.title}</h1>
                <p className="text-sm text-muted-foreground leading-6">{copy.intro}</p>
                <ul className="space-y-2 text-sm text-muted-foreground leading-6">
                    {copy.points.map((point) => (
                        <li key={point} className="rounded-md border bg-card p-4">
                            {point}
                        </li>
                    ))}
                </ul>
                <p className="text-xs text-muted-foreground">{copy.updated}</p>
                <p className="text-sm text-muted-foreground">
                    {dict.common.relatedPages}
                    {": "}
                    <Link className="underline" href={`/${locale}/terms`}>{dict.common.terms}</Link>
                    {' · '}
                    <Link className="underline" href={`/${locale}/contact`}>{dict.common.contact}</Link>
                </p>
            </div>
            <PageStructuredData
                locale={locale}
                pageTitle={copy.title}
                pageDescription={copy.intro}
                path="/privacy"
                breadcrumbs={[
                    { name: dict.common.home, path: "" },
                    { name: copy.title, path: "/privacy" },
                ]}
            />
        </main>
    )
}
