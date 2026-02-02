# Stockbit Personal Screener

Chrome Extension boilerplate menggunakan Vue 3 + Tailwind CSS + TypeScript.

## Tech Stack

- **Vue 3** - Composition API
- **Tailwind CSS** - Utility-first CSS framework
- **Vite** - Fast build tool
- **TypeScript** - Type safety
- **CRXJS** - Chrome extension Vite plugin

## Struktur Project

```
/
├── src/
│   ├── popup/              # Popup UI extension
│   │   ├── App.vue
│   │   ├── main.ts
│   │   └── index.html
│   ├── background/         # Background service worker
│   │   └── index.ts
│   ├── content/            # Content script
│   │   └── index.ts
│   ├── components/         # Shared Vue components
│   ├── assets/
│   │   ├── icons/          # Extension icons
│   │   └── styles/         # CSS styles
│   ├── manifest.ts         # Chrome extension manifest v3
│   └── vite-env.d.ts
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
├── tsconfig.json
└── package.json
```

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Development mode

```bash
npm run dev
```

### 3. Build for production

```bash
npm run build
```

### 4. Load extension di Chrome

1. Buka `chrome://extensions/`
2. Aktifkan **Developer mode**
3. Klik **Load unpacked**
4. Pilih folder `dist/`

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Development dengan hot reload |
| `npm run build` | Build production ke `dist/` |
| `npm run preview` | Preview build result |

## Features

- ✅ Manifest V3
- ✅ Popup dengan Vue 3 + Tailwind CSS
- ✅ Background service worker
- ✅ Content script
- ✅ Hot reload untuk development
- ✅ TypeScript support
