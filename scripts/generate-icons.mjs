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

// ── Tauri desktop icons ──
const tauriIconDir = join(__dirname, '..', 'src-tauri', 'icons')
if (!existsSync(tauriIconDir)) mkdirSync(tauriIconDir, { recursive: true })

// Generate PNG icons for Tauri
const tauriPngSizes = [32, 128, 256]
for (const size of tauriPngSizes) {
  const name = size === 128 ? '128x128.png' : `${size}x${size}.png`
  const buf = await sharp(svg).resize(size, size).png().toBuffer()
  writeFileSync(join(tauriIconDir, name), buf)
  console.log('wrote', `src-tauri/icons/${name}`, buf.length, 'bytes')
}

// 128x128@2x = 256x256
const buf128x2 = await sharp(svg).resize(256, 256).png().toBuffer()
writeFileSync(join(tauriIconDir, '128x128@2x.png'), buf128x2)
console.log('wrote', 'src-tauri/icons/128x128@2x.png', buf128x2.length, 'bytes')

// icon.png (used as fallback on some platforms)
const iconPng = await sharp(svg).resize(512, 512).png().toBuffer()
writeFileSync(join(tauriIconDir, 'icon.png'), iconPng)
console.log('wrote', 'src-tauri/icons/icon.png', iconPng.length, 'bytes')

// ── Generate valid icon.ico (Windows) ──
// ICO format wraps PNG images in a simple container header.
function createIco(pngBuffers) {
  const headerSize = 6
  const entrySize = 16
  const count = pngBuffers.length
  let offset = headerSize + entrySize * count

  const header = Buffer.alloc(headerSize)
  header.writeUInt16LE(0, 0)      // reserved
  header.writeUInt16LE(1, 2)      // type: 1 = icon
  header.writeUInt16LE(count, 4)  // count

  // ICO layout: header → entries (contiguous) → image data (contiguous)
  const chunks = [header]

  for (let i = 0; i < count; i++) {
    const png = pngBuffers[i]
    // PNG IHDR: sig(8) + chunkLen(4) + 'IHDR'(4) + width(4) + height(4)
    const w = png.readUInt32BE(16)
    const h = png.readUInt32BE(20)

    const entry = Buffer.alloc(entrySize)
    entry.writeUInt8(w === 256 ? 0 : w, 0)  // width (0 = 256)
    entry.writeUInt8(h === 256 ? 0 : h, 1)  // height (0 = 256)
    entry.writeUInt8(0, 2)                   // color palette count
    entry.writeUInt8(0, 3)                   // reserved
    entry.writeUInt16LE(1, 4)                // color planes
    entry.writeUInt16LE(32, 6)               // bits per pixel
    entry.writeUInt32LE(png.length, 8)       // image data size
    entry.writeUInt32LE(offset, 12)          // offset from start of file

    chunks.push(entry)
    offset += png.length
  }

  // Append all PNG data after all entries
  for (const png of pngBuffers) {
    chunks.push(png)
  }

  return Buffer.concat(chunks)
}

// Generate ICO with multiple sizes for best compatibility
const icoSizes = [32, 64, 128, 256]
const icoPngs = await Promise.all(
  icoSizes.map((size) => sharp(svg).resize(size, size).png().toBuffer())
)
const ico = createIco(icoPngs)
writeFileSync(join(tauriIconDir, 'icon.ico'), ico)
console.log('wrote', 'src-tauri/icons/icon.ico', ico.length, 'bytes')

// ── Generate icon.icns (macOS) ──
// icns format: header + icon entries containing raw PNG data for each resolution.
function createIcns(pngEntries) {
  // Each pngEntry: { type: 'ic07'|'ic08'|..., data: Buffer }
  const entryOverhead = 8  // type(4) + size(4)
  const contentSize = pngEntries.reduce((sum, e) => sum + entryOverhead + e.data.length, 0)
  const totalSize = 8 + contentSize  // magic(4) + totalSize(4) + entries

  const header = Buffer.alloc(8)
  header.write('icns', 0, 4, 'ascii')
  header.writeUInt32BE(totalSize, 4)

  const chunks = [header]
  for (const { type, data } of pngEntries) {
    const entry = Buffer.alloc(entryOverhead)
    entry.write(type, 0, 4, 'ascii')
    entry.writeUInt32BE(entryOverhead + data.length, 4)
    chunks.push(entry, data)
  }
  return Buffer.concat(chunks)
}

const icnsSizes = [
  { type: 'ic07', size: 128 },  // 128x128
  { type: 'ic08', size: 256 },  // 256x256
  { type: 'ic09', size: 512 },  // 512x512
]
const icnsPngs = await Promise.all(
  icnsSizes.map(({ type, size }) =>
    sharp(svg).resize(size, size).png().toBuffer().then((data) => ({ type, data }))
  )
)
const icns = createIcns(icnsPngs)
writeFileSync(join(tauriIconDir, 'icon.icns'), icns)
console.log('wrote', 'src-tauri/icons/icon.icns', icns.length, 'bytes')
