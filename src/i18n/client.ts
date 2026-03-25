'use client'

import {useAppI18nContext} from './app-context'
import type {Locale} from '@/lib/i18n/config'
import type {Dictionary} from '@/lib/i18n/types'
export {AppI18nProvider} from './app-context'

export function useDictionary(): Dictionary {
    return useAppI18nContext().dictionary
}

export function useAppLocale(): Locale {
    return useAppI18nContext().locale
}
