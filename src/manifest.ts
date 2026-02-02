import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest({
  manifest_version: 3,
  name: 'Stockbit Personal Screener',
  description: 'Personal stock screener extension for Stockbit',
  version: '0.0.1',
  icons: {
    '16': 'src/assets/icons/icon16.png',
    '48': 'src/assets/icons/icon48.png',
    '128': 'src/assets/icons/icon128.png',
  },
  action: {
    default_popup: 'src/popup/index.html',
    default_icon: {
      '16': 'src/assets/icons/icon16.png',
      '48': 'src/assets/icons/icon48.png',
      '128': 'src/assets/icons/icon128.png',
    },
  },
  permissions: ['storage', 'activeTab'],
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/index.ts'],
    },
  ],
})
