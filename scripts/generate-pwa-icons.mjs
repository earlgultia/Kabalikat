import { mkdir, writeFile } from 'node:fs/promises'
import { Buffer } from 'node:buffer'
import { deflateSync } from 'node:zlib'
import { URL } from 'node:url'

const iconDir = new URL('../public/icons/', import.meta.url)
await mkdir(iconDir, { recursive: true })

function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type)
  const chunk = Buffer.alloc(12 + data.length)
  chunk.writeUInt32BE(data.length, 0)
  typeBytes.copy(chunk, 4)
  data.copy(chunk, 8)
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length)
  return chunk
}

function insideRoundRect(x, y, left, top, right, bottom, radius) {
  const cx = Math.max(left + radius, Math.min(x, right - radius))
  const cy = Math.max(top + radius, Math.min(y, bottom - radius))
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2
}

function pixelColor(x, y, safeArea) {
  const scale = safeArea ? 0.76 : 1
  const px = (x - 0.5) / scale + 0.5
  const py = (y - 0.5) / scale + 0.5
  if (!safeArea && !insideRoundRect(x, y, 0, 0, 1, 1, 0.22)) return [0, 0, 0, 0]

  let color = [13, 71, 60, 255]
  if ((px - 0.5) ** 2 + (py - 0.5) ** 2 < 0.205 ** 2) color = [20, 91, 75, 255]

  const headLeft = (px - 0.37) ** 2 + (py - 0.39) ** 2 < 0.073 ** 2
  const headRight = (px - 0.63) ** 2 + (py - 0.39) ** 2 < 0.073 ** 2
  const shoulderLeft = ((px - 0.37) / 0.18) ** 2 + ((py - 0.61) / 0.135) ** 2 < 1
  const shoulderRight = ((px - 0.63) / 0.18) ** 2 + ((py - 0.61) / 0.135) ** 2 < 1
  if (headLeft || headRight || shoulderLeft || shoulderRight) color = [255, 254, 250, 255]

  const hx = (px - 0.5) / 0.105
  const hy = (0.535 - py) / 0.105
  const heart = (hx * hx + hy * hy - 1) ** 3 - hx * hx * hy ** 3 <= 0
  if (heart) color = [240, 195, 106, 255]
  return color
}

function makePng(size, safeArea = false) {
  const supersample = 3
  const data = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y += 1) {
    const rowOffset = y * (size * 4 + 1)
    data[rowOffset] = 0
    for (let x = 0; x < size; x += 1) {
      const sums = [0, 0, 0, 0]
      for (let sy = 0; sy < supersample; sy += 1) for (let sx = 0; sx < supersample; sx += 1) {
        const color = pixelColor((x + (sx + 0.5) / supersample) / size, (y + (sy + 0.5) / supersample) / size, safeArea)
        for (let channel = 0; channel < 4; channel += 1) sums[channel] += color[channel]
      }
      const pixelOffset = rowOffset + 1 + x * 4
      for (let channel = 0; channel < 4; channel += 1) data[pixelOffset + channel] = Math.round(sums[channel] / (supersample * supersample))
    }
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8
  header[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(data, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

for (const [name, size, safeArea] of [
  ['kabalikat-192.png', 192, false],
  ['kabalikat-512.png', 512, false],
  ['kabalikat-maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, false],
]) {
  await writeFile(new URL(name, iconDir), makePng(size, safeArea))
}
