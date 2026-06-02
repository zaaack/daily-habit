import { enUS, zhCN } from 'date-fns/locale'
import type { Locale } from 'date-fns'

const localeMap: Record<string, Locale> = {
  'zh-CN': zhCN,
  'en-US': enUS,
  'zh': zhCN,
  'en': enUS,
}

export function getDateFnsLocale(lang: string): Locale {
  return localeMap[lang] ?? localeMap[lang.slice(0, 2)] ?? enUS
}
