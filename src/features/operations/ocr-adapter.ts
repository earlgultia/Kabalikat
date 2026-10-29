export type OcrResult = { text: string; provider: string }

export interface OcrAdapter {
  available: boolean
  provider: string
  extract(file: File): Promise<OcrResult>
}

export const ocrAdapter: OcrAdapter = {
  available: false,
  provider: 'Not configured',
  async extract() {
    throw new Error('OCR is not configured. Add a reviewed server-side OCR provider before processing archive files.')
  },
}
