'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { Globe, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAppLocale } from '@/i18n/client'
import { getLocaleLabel } from '@/lib/i18n/locale-meta'

const LanguageSwitcher = dynamic(
    () => import('@/components/language-switcher').then((m) => m.LanguageSwitcher),
    { ssr: false }
)

interface DeferredLanguageSwitcherProps {
    compact?: boolean
}

export function DeferredLanguageSwitcher({
    compact = false,
}: DeferredLanguageSwitcherProps) {
    const currentLocale = useAppLocale()
    const [mounted, setMounted] = useState(false)

    if (mounted) {
        return (
            <LanguageSwitcher
                compact={compact}
                defaultOpen
            />
        )
    }

    return (
        <Button
            variant="ghost"
            size="sm"
            onClick={() => setMounted(true)}
            className={cn(
                'flex items-center gap-2 text-sm',
                compact && 'h-9 max-w-[8rem] gap-1.5 px-2.5'
            )}
            aria-label={getLocaleLabel(currentLocale)}
        >
            <Globe className="h-4 w-4" />
            {compact ? (
                <span className="max-w-[5.5rem] truncate">{getLocaleLabel(currentLocale)}</span>
            ) : (
                <>
                    <span>{getLocaleLabel(currentLocale)}</span>
                    <ChevronDown className="h-4 w-4" />
                </>
            )}
        </Button>
    )
}
