'use client'

import { useEffect, useRef, useState } from 'react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Check, ChevronDown, Laptop, Moon, Sun } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppLocale } from '@/i18n/client'

interface ThemeSwitcherProps {
    compact?: boolean
    fullWidth?: boolean
}

type ThemeOption = 'light' | 'dark' | 'system'

const THEME_LABELS = {
    zh: {
        title: '主题',
        light: '浅色',
        dark: '深色',
        system: '跟随系统',
    },
    'zh-tw': {
        title: '主題',
        light: '淺色',
        dark: '深色',
        system: '跟隨系統',
    },
    en: {
        title: 'Theme',
        light: 'Light',
        dark: 'Dark',
        system: 'System',
    },
    ja: {
        title: 'テーマ',
        light: 'ライト',
        dark: 'ダーク',
        system: 'システム',
    },
} as const

function ThemeIcon({ theme }: { theme: ThemeOption }) {
    if (theme === 'light') return <Sun className="h-4 w-4" />
    if (theme === 'dark') return <Moon className="h-4 w-4" />
    return <Laptop className="h-4 w-4" />
}

export function ThemeSwitcher({ compact = false, fullWidth = false }: ThemeSwitcherProps) {
    const locale = useAppLocale()
    const labels = THEME_LABELS[locale]
    const [mounted, setMounted] = useState(false)
    const [isOpen, setIsOpen] = useState(false)
    const dropdownRef = useRef<HTMLDivElement>(null)
    const { theme, setTheme } = useTheme()
    const currentTheme = (theme ?? 'system') as ThemeOption

    useEffect(() => {
        setMounted(true)
    }, [])

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false)
            }
        }

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside)
            return () => document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [isOpen])

    useEffect(() => {
        function handleEscapeKey(event: KeyboardEvent) {
            if (event.key === 'Escape') {
                setIsOpen(false)
            }
        }

        if (isOpen) {
            document.addEventListener('keydown', handleEscapeKey)
            return () => document.removeEventListener('keydown', handleEscapeKey)
        }
    }, [isOpen])

    const optionLabels: Record<ThemeOption, string> = {
        light: labels.light,
        dark: labels.dark,
        system: labels.system,
    }

    const triggerTheme = mounted ? currentTheme : 'system'
    const triggerLabel = mounted ? optionLabels[currentTheme] : labels.title

    return (
        <div className={cn('relative', fullWidth && 'w-full')} ref={dropdownRef}>
            <Button
                variant="ghost"
                size={compact ? 'icon' : 'sm'}
                onClick={() => setIsOpen((open) => !open)}
                className={cn('flex items-center gap-2 text-sm', compact && 'h-9 w-9 p-0', fullWidth && 'w-full justify-between')}
                aria-label={labels.title}
            >
                <ThemeIcon theme={triggerTheme} />
                {compact ? (
                    <span className="sr-only">{triggerLabel}</span>
                ) : (
                    <>
                        <span>{triggerLabel}</span>
                        <ChevronDown className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-180')} />
                    </>
                )}
            </Button>

            {isOpen && (
                <div className={cn('absolute right-0 top-full mt-1 w-40 rounded-md border border-border bg-background shadow-lg z-50', fullWidth && 'w-full')}>
                    <div className="py-1">
                        {(['light', 'dark', 'system'] as ThemeOption[]).map((option) => (
                            <button
                                key={option}
                                onClick={() => {
                                    setTheme(option)
                                    setIsOpen(false)
                                }}
                                className="w-full px-3 py-2 text-left text-sm hover:bg-muted/50 flex items-center justify-between transition-colors"
                            >
                                <span className="flex items-center gap-2">
                                    <ThemeIcon theme={option} />
                                    <span>{optionLabels[option]}</span>
                                </span>
                                {mounted && option === currentTheme ? (
                                    <Check className="h-4 w-4 text-primary" />
                                ) : null}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
