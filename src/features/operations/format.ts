export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' }).format(new Date(value))
}

export function formatManilaMeetingTime(value: string) {
  return new Intl.DateTimeFormat('en-PH', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila',
  }).format(new Date(value))
}

export function formatManilaDate(value: string) {
  return new Intl.DateTimeFormat('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Manila',
  }).format(new Date(`${value}T00:00:00+08:00`))
}

export function getManilaDateInputValue(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(value)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

export function getManilaDateBoundary(value: string, dayOffset = 0) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00+08:00`)
  if (Number.isNaN(date.getTime()) || getManilaDateInputValue(date) !== value) return null
  date.setUTCDate(date.getUTCDate() + dayOffset)
  return date.toISOString()
}

export function formatManilaCalendarDate(value: string) {
  return new Intl.DateTimeFormat('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Manila',
  }).format(new Date(value))
}
