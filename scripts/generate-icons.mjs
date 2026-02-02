// Script to generate extension icons
// Run with: node scripts/generate-icons.mjs

import sharp from 'sharp'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outputDir = join(__dirname, '..', 'src', 'assets', 'icons')

// Ensure output directory exists
if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true })
}

// SVG icon design
const createSVG = (size) => `
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1e293b"/>
      <stop offset="100%" style="stop-color:#0f172a"/>
    </linearGradient>
    <linearGradient id="arrow" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#14b8a6"/>
      <stop offset="100%" style="stop-color:#10b981"/>
    </linearGradient>
  </defs>
  
  <!-- Background -->
  <rect width="${size}" height="${size}" rx="${size * 0.15}" fill="url(#bg)"/>
  
  <!-- Arrow chart -->
  <g transform="translate(${size * 0.15}, ${size * 0.2})">
    <path 
      d="M0 ${size * 0.5} L${size * 0.25} ${size * 0.35} L${size * 0.45} ${size * 0.45} L${size * 0.7} ${size * 0.1}"
      stroke="url(#arrow)"
      stroke-width="${size * 0.08}"
      stroke-linecap="round"
      stroke-linejoin="round"
      fill="none"
    />
    <!-- Arrow head -->
    <polygon 
      points="${size * 0.55},${size * 0.05} ${size * 0.7},${size * 0.1} ${size * 0.65},${size * 0.25}"
      fill="url(#arrow)"
    />
  </g>
</svg>
`

const sizes = [16, 48, 128]

async function generateIcons() {
    console.log('Generating extension icons...')

    for (const size of sizes) {
        const svg = createSVG(size)
        const outputPath = join(outputDir, `icon${size}.png`)

        await sharp(Buffer.from(svg))
            .png()
            .toFile(outputPath)

        console.log(`✓ Generated icon${size}.png`)
    }

    console.log('Done!')
}

generateIcons().catch(console.error)
