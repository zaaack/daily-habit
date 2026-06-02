import sharp from 'sharp'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '..', 'public')
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

const svg = readFileSync(join(outDir, 'favicon.svg'))

const sizes = [
  { name: 'pwa-192x192.png', size: 192 },
  { name: 'pwa-512x512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'maskable-512x512.png', size: 512, padding: 0.1 },
]

for (const { name, size, padding = 0 } of sizes) {
  let buf = svg
  if (padding > 0) {
    const inner = await sharp(svg).resize(Math.round(size * (1 - padding * 2))).toBuffer()
    buf = await sharp({
      create: { width: size, height: size, channels: 4, background: { r: 2, g: 6, b: 23, alpha: 1 } },
    }).composite([{ input: inner, gravity: 'center' }]).png().toBuffer()
  } else {
    buf = await sharp(svg).resize(size, size).png().toBuffer()
  }
  writeFileSync(join(outDir, name), buf)
  console.log('wrote', name, buf.length, 'bytes')
}
