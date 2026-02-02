# Task: Buat Boilerplate Chrome Extension dengan Vue 3 + Tailwind CSS

## Objective
Buat struktur project Chrome Extension menggunakan Vue 3 dan Tailwind CSS sebagai boilerplate yang siap dikembangkan.

## Tech Stack
- **Framework**: Vue 3 (Composition API)
- **Styling**: Tailwind CSS
- **Build Tool**: Vite
- **Language**: TypeScript

## Struktur Project yang Dibutuhkan

```
/
├── src/
│   ├── popup/              # Popup UI extension
│   │   ├── App.vue
│   │   ├── main.ts
│   │   └── index.html
│   ├── background/         # Background service worker
│   │   └── index.ts
│   ├── content/            # Content script (inject ke halaman web)
│   │   └── index.ts
│   ├── components/         # Shared Vue components
│   └── assets/             # Static assets (icons, images)
│       └── icons/
│           ├── icon16.png
│           ├── icon48.png
│           └── icon128.png
├── public/
│   └── manifest.json       # Chrome extension manifest v3
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
├── tsconfig.json
├── package.json
└── README.md
```

## Requirements

### 1. manifest.json (Manifest V3)
- Permissions: `storage`, `activeTab`
- Action popup mengarah ke popup/index.html
- Background service worker
- Content scripts (opsional, inject ke semua halaman)

### 2. Vite Configuration
- Multi-page build (popup sebagai entry point)
- Build output ke folder `dist/`
- Copy manifest.json dan assets ke dist saat build
- Hot reload untuk development

### 3. Tailwind CSS Setup
- Konfigurasi untuk scan file `.vue` dan `.ts`
- Include base, components, dan utilities

### 4. Popup UI
- Komponen Vue 3 sederhana dengan Composition API
- Styling menggunakan Tailwind CSS
- Ukuran popup: width 350px, height auto

### 5. Background Script
- Service worker sederhana
- Console log saat extension di-install

### 6. Package.json Scripts
- `dev`: Development mode dengan hot reload
- `build`: Production build
- `preview`: Preview build result

## Output yang Diharapkan
Setelah menjalankan `npm run build`, folder `dist/` harus bisa langsung di-load sebagai unpacked extension di Chrome (`chrome://extensions`).

## Notes
- Gunakan `@crxjs/vite-plugin` atau setup manual untuk Chrome extension development dengan Vite
- Pastikan semua path di manifest.json sesuai dengan output build
