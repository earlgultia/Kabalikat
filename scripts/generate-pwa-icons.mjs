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

function distanceToSegment(pointX, pointY, startX, startY, endX, endY) {
  const dx = endX - startX
  const dy = endY - startY
  const lengthSquared = dx * dx + dy * dy
  const t = Math.max(0, Math.min(1, ((pointX - startX) * dx + (pointY - startY) * dy) / lengthSquared))
  return Math.hypot(pointX - (startX + t * dx), pointY - (startY + t * dy))
}

const heartHandshakeStrokes = [
  // Rounded outline of the HeartHandshake mark used on the landing page.
  { points: [[19, 14], [20.2, 12.6], [21.4, 11], [22, 8.5], [21.5, 6.4], [20, 4.5], [18.5, 3.5], [16.5, 3], [14.5, 3.4], [12, 5], [9.5, 3.4], [7.5, 3], [5.5, 3.5], [4, 4.5], [2.5, 6.4], [2, 8.5], [2.6, 11], [4, 12.8], [5, 14], [12, 21], [19, 14]], color: [255, 254, 250, 255], width: 0.85 },
  { points: [[12, 5], [9.04, 7.96], [8.4, 9.5], [9.04, 11.04], [10.5, 11.7], [12.04, 11.11], [14.11, 9.21], [15.4, 8.65], [16.8, 8.65], [18.1, 9.2], [21.06, 11.86]], color: [240, 195, 106, 255], width: 0.95 },
  { points: [[18, 15], [16, 13]], color: [255, 254, 250, 255], width: 0.95 },
  { points: [[15, 18], [13, 16]], color: [255, 254, 250, 255], width: 0.95 },
]

function pixelColor(x, y, safeArea, appleTouch = false) {
  const scale = safeArea ? 0.76 : 1
  const px = (x - 0.5) / scale + 0.5
  const py = (y - 0.5) / scale + 0.5
  if (!safeArea && !appleTouch && !insideRoundRect(x, y, 0, 0, 1, 1, 0.22)) return [0, 0, 0, 0]

  let color = [13, 71, 60, 255]
  if ((px - 0.5) ** 2 + (py - 0.5) ** 2 < 0.205 ** 2) color = [20, 91, 75, 255]

  const iconX = (px - 0.18) / 0.64 * 24
  const iconY = (py - 0.18) / 0.64 * 24
  for (const stroke of heartHandshakeStrokes) {
    for (let index = 1; index < stroke.points.length; index += 1) {
      const [startX, startY] = stroke.points[index - 1]
      const [endX, endY] = stroke.points[index]
      if (distanceToSegment(iconX, iconY, startX, startY, endX, endY) <= stroke.width) color = stroke.color
    }
  }
  return color
}

function makePng(size, safeArea = false, appleTouch = false) {
  const supersample = 3
  const data = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y += 1) {
    const rowOffset = y * (size * 4 + 1)
    data[rowOffset] = 0
    for (let x = 0; x < size; x += 1) {
      const sums = [0, 0, 0, 0]
      for (let sy = 0; sy < supersample; sy += 1) for (let sx = 0; sx < supersample; sx += 1) {
      const color = pixelColor((x + (sx + 0.5) / supersample) / size, (y + (sy + 0.5) / supersample) / size, safeArea, appleTouch)
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

for (const [name, size, safeArea, appleTouch] of [
  ['kabalikat-heart-192.png', 192, false],
  ['kabalikat-heart-512.png', 512, false],
  ['kabalikat-heart-maskable-512.png', 512, true],
  ['kabalikat-ios-180.png', 180, false, true],
]) {
  await writeFile(new URL(name, iconDir), makePng(size, safeArea, appleTouch))
}
