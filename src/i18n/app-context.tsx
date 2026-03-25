'use client'

import {createContext, useContext} from 'react'
import type {Locale} from '@/lib/i18n/config'
import type {Dictionary} from '@/lib/i18n/types'

type AppI18nContextValue = {
    locale: Locale
    dictionary: Dictionary
}

const AppI18nContext = createContext<AppI18nContextValue | null>(null)

interface AppI18nProviderProps {
    locale: Locale
    dictionary: Dictionary
    children: React.ReactNode
}

export function AppI18nProvider({
    locale,
    dictionary,
    children,
}: AppI18nProviderProps) {
    return (
        <AppI18nContext.Provider value={{locale, dictionary}}>
            {children}
        </AppI18nContext.Provider>
    )
}

export function useAppI18nContext(): AppI18nContextValue {
    const context = useContext(AppI18nContext)

    if (!context) {
        throw new Error('No app intl context found. AppI18nProvider must wrap client components that use i18n hooks.')
    }

    return context
}
