import sharp from 'sharp'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicDir = join(__dirname, '..', 'public')
if (!existsSync(publicDir)) mkdirSync(publicDir, { recursive: true })

const svg = readFileSync(join(publicDir, 'favicon.svg'))
const foregroundSvg = readFileSync(join(publicDir, 'ic_launcher_foreground.svg'))

// ── PWA / web icons ──
const webSizes = [
  { name: 'pwa-192x192.png', size: 192 },
  { name: 'pwa-512x512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'maskable-512x512.png', size: 512, padding: 0.1 },
]

for (const { name, size, padding = 0 } of webSizes) {
  let buf
  if (padding > 0) {
    const inner = await sharp(svg).resize(Math.round(size * (1 - padding * 2))).toBuffer()
    buf = await sharp({
      create: { width: size, height: size, channels: 4, background: { r: 2, g: 6, b: 23, alpha: 1 } },
    }).composite([{ input: inner, gravity: 'center' }]).png().toBuffer()
  } else {
    buf = await sharp(svg).resize(size, size).png().toBuffer()
  }
  writeFileSync(join(publicDir, name), buf)
  console.log('wrote', name, buf.length, 'bytes')
}

// ── Android launcher icons ──
const androidRes = join(__dirname, '..', 'android', 'app', 'src', 'main', 'res')
const densities = [
  { dir: 'mipmap-mdpi', size: 48 },
  { dir: 'mipmap-hdpi', size: 72 },
  { dir: 'mipmap-xhdpi', size: 96 },
  { dir: 'mipmap-xxhdpi', size: 144 },
  { dir: 'mipmap-xxxhdpi', size: 192 },
]

for (const { dir, size } of densities) {
  const out = join(androidRes, dir)
  if (!existsSync(out)) mkdirSync(out, { recursive: true })

  // full launcher icon (green bg + white check)
  const full = await sharp(svg).resize(size, size).png().toBuffer()
  writeFileSync(join(out, 'ic_launcher.png'), full)
  writeFileSync(join(out, 'ic_launcher_round.png'), full)
  console.log('wrote', `${dir}/ic_launcher.png`, full.length, 'bytes')

  // foreground (transparent bg, padded for safe zone)
  const padScale = 0.85
  const fgInner = await sharp(foregroundSvg).resize(Math.round(size * padScale)).toBuffer()
  const fg = await sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite([{ input: fgInner, gravity: 'center' }]).png().toBuffer()
  writeFileSync(join(out, 'ic_launcher_foreground.png'), fg)
  console.log('wrote', `${dir}/ic_launcher_foreground.png`, fg.length, 'bytes')
}
