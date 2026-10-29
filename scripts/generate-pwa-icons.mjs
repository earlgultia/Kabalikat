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

function smoothPath(start, curves, steps = 10) {
  const points = [start]
  let [x0, y0] = start
  for (const [x1, y1, x2, y2, x3, y3] of curves) {
    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps
      const inverse = 1 - t
      points.push([
        inverse ** 3 * x0 + 3 * inverse ** 2 * t * x1 + 3 * inverse * t ** 2 * x2 + t ** 3 * x3,
        inverse ** 3 * y0 + 3 * inverse ** 2 * t * y1 + 3 * inverse * t ** 2 * y2 + t ** 3 * y3,
      ])
    }
    x0 = x3
    y0 = y3
  }
  return points
}

const heartHandshakeStrokes = [
  {
    // Smooth, slightly strengthened version of the HeartHandshake mark used on the landing page.
    points: smoothPath([19.3, 13.8], [
      [21.1, 12.2, 22, 10.5, 22, 8.5], [22, 5.5, 19.7, 3, 16.5, 3],
      [14.7, 3, 13.3, 3.7, 12, 5], [10.7, 3.7, 9.3, 3, 7.5, 3],
      [4.3, 3, 2, 5.5, 2, 8.5], [2, 10.5, 2.9, 12.2, 4.7, 13.8],
      [6.3, 15.6, 9.3, 18.6, 12, 21], [14.7, 18.6, 17.7, 15.6, 19.3, 13.8],
    ]),
    color: [255, 254, 250, 255],
    width: 0.72,
  },
  {
    points: smoothPath([12, 5], [
      [10.9, 6.1, 9.8, 7.3, 9.04, 7.96], [7.9, 9.1, 8.2, 10.4, 9.04, 11.04],
      [9.9, 11.8, 11, 11.8, 12.04, 11.11], [12.9, 10.3, 13.5, 9.7, 14.11, 9.21],
      [15.2, 8.3, 16.8, 8.3, 18.1, 9.2], [19, 9.9, 20.2, 11, 21.06, 11.86],
    ]),
    color: [240, 195, 106, 255],
    width: 0.78,
  },
  { points: [[18, 15], [16, 13]], color: [255, 254, 250, 255], width: 0.7 },
  { points: [[15, 18], [13, 16]], color: [255, 254, 250, 255], width: 0.7 },
]

function makePng(size, safeArea = false, appleTouch = false) {
  const supersample = 4
  const pixels = Buffer.alloc(size * size * 4)
  const artworkScale = safeArea ? 0.88 : 1
  const artworkWidth = 0.84
  const artworkOffset = (1 - artworkWidth) / 2

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const pointX = (x + 0.5) / size
      const pointY = (y + 0.5) / size
      const baseX = (pointX - 0.5) / artworkScale + 0.5
      const baseY = (pointY - 0.5) / artworkScale + 0.5
      const glow = Math.max(0, 1 - Math.hypot(baseX - 0.5, baseY - 0.5) / 0.76) ** 2 * 0.5
      const offset = (y * size + x) * 4
      const alpha = !safeArea && !appleTouch && !insideRoundRect(pointX, pointY, 0, 0, 1, 1, 0.22) ? 0 : 255
      const dark = [13, 71, 60]
      const light = [31, 100, 80]
      for (let channel = 0; channel < 3; channel += 1) pixels[offset + channel] = Math.round(dark[channel] * (1 - glow) + light[channel] * glow)
      pixels[offset + 3] = alpha
    }
  }

  const toPixel = ([x, y]) => {
    const scalePoint = (value) => 0.5 + (artworkOffset + value / 24 * artworkWidth - 0.5) * artworkScale
    return [scalePoint(x) * size, scalePoint(y) * size]
  }
  for (const stroke of heartHandshakeStrokes) {
    const radius = stroke.width / 24 * artworkWidth * artworkScale * size
    const points = stroke.points.map(toPixel)
    for (let index = 1; index < points.length; index += 1) {
      const [startX, startY] = points[index - 1]
      const [endX, endY] = points[index]
      const left = Math.max(0, Math.floor(Math.min(startX, endX) - radius - 1))
      const right = Math.min(size - 1, Math.ceil(Math.max(startX, endX) + radius + 1))
      const top = Math.max(0, Math.floor(Math.min(startY, endY) - radius - 1))
      const bottom = Math.min(size - 1, Math.ceil(Math.max(startY, endY) + radius + 1))
      for (let y = top; y <= bottom; y += 1) {
        for (let x = left; x <= right; x += 1) {
          let coverage = 0
          for (let sy = 0; sy < supersample; sy += 1) for (let sx = 0; sx < supersample; sx += 1) {
            const sampleX = x + (sx + 0.5) / supersample
            const sampleY = y + (sy + 0.5) / supersample
            if (distanceToSegment(sampleX, sampleY, startX, startY, endX, endY) <= radius) coverage += 1
          }
          if (!coverage) continue
          const amount = coverage / (supersample * supersample)
          const offset = (y * size + x) * 4
          for (let channel = 0; channel < 3; channel += 1) pixels[offset + channel] = Math.round(pixels[offset + channel] * (1 - amount) + stroke.color[channel] * amount)
          pixels[offset + 3] = 255
        }
      }
    }
  }

  const data = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y += 1) pixels.copy(data, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
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
  ['kabalikat-heart-v3-192.png', 192, false],
  ['kabalikat-heart-v3-512.png', 512, false],
  ['kabalikat-heart-v3-maskable-512.png', 512, true],
  ['kabalikat-ios-v2-180.png', 180, false, true],
]) {
  await writeFile(new URL(name, iconDir), makePng(size, safeArea, appleTouch))
}
