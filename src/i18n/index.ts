import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import zhCN from './locales/zh-CN.json'
import enUS from './locales/en-US.json'

function detectLanguage(): string {
  try {
    const lang = navigator.language
    if (lang.startsWith('zh')) return 'zh-CN'
    return 'en-US'
  } catch {
    return 'zh-CN'
  }
}

const lang = detectLanguage()

void i18n.use(initReactI18next).init({
  resources: {
    'zh-CN': { translation: zhCN },
    'en-US': { translation: enUS },
  },
  lng: lang,
  fallbackLng: 'zh-CN',
  interpolation: {
    escapeValue: false,
  },
})

document.documentElement.lang = lang

i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng
})

export default i18n
