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

export function formatManilaCalendarDate(value: string) {
  return new Intl.DateTimeFormat('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Manila',
  }).format(new Date(value))
}
