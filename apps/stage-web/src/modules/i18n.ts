import messages from '@proj-sakura/i18n/locales'

import { createI18n } from 'vue-i18n'

function getLocale() {
  return 'en'
}

export const i18n = createI18n({
  legacy: false,
  locale: getLocale(),
  fallbackLocale: 'en',
  messages: messages as any,
})

