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
    const title = dict.termsPage.metaTitle
    const description = dict.termsPage.metaDescription
    const url = buildLocaleUrl(locale, "/terms")

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
            images: ["/og/terms.png"],
        },
        twitter: {
            card: "summary_large_image",
            title,
            description,
            images: ["/og/terms.png"],
        },
        alternates: {
            canonical: url,
            languages: buildLanguageAlternates("/terms"),
        },
    }
}

export default async function TermsPage({
    params,
}: {
    params: Promise<{ locale: Locale }>
}) {
    const { locale } = await params
    const dict = await getMessages({ locale }) as Dictionary
    const copy = dict.termsPage

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
                    <Link className="underline" href={`/${locale}/privacy`}>{dict.common.privacy}</Link>
                    {' · '}
                    <Link className="underline" href={`/${locale}/contact`}>{dict.common.contact}</Link>
                </p>
            </div>
            <PageStructuredData
                locale={locale}
                pageTitle={copy.title}
                pageDescription={copy.intro}
                path="/terms"
                breadcrumbs={[
                    { name: dict.common.home, path: "" },
                    { name: copy.title, path: "/terms" },
                ]}
            />
        </main>
    )
}
