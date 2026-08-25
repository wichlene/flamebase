import { parseJson } from './safeJson'

// Single upload path for every media upload in the app (post media, comment
// photos, avatars, banners, AI-chat attachments).
//
// Why it exists: uploads used to POST the file to our own /api/upload route,
// which runs as a Vercel serverless function — and Vercel caps a function's
// request body at 4.5 MB at the platform edge. Anything larger was rejected
// before our code ran, with a plain-text "Request Entity Too Large" body that
// the callers fed straight into res.json(), producing
// `Unexpected token 'R', "Request En"... is not valid JSON`. Meanwhile the
// client, the route and all five translations promised a 50 MB limit.
//
// So: send the file straight from the browser to Pinata and keep our function
// out of the data path entirely. The server only mints a short-lived,
// upload-scoped credential (/api/upload/sign) — the long-lived PINATA_JWT
// never reaches the browser.

const PINATA_PIN_URL = 'https://api.pinata.cloud/pinning/pinFileToIPFS'

// Sanity ceiling only — the real constraint now is Pinata storage, not a
// request-body limit. Kept generous so a few minutes of phone video fits.
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024

export function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  if (n >= 1024) return `${Math.round(n / 1024)} KB`
  return `${n} B`
}

export type MediaFileProblem = 'missing' | 'too-large' | 'bad-type'

// Returns a problem CODE rather than a message so callers that have the i18n
// `t()` helper can localise it (the app ships 5 locales and already has an
// errFileTooLarge string); mediaProblemMessage() covers callers that don't.
export function checkMediaFile(file: File): MediaFileProblem | null {
  if (!file) return 'missing'
  if (file.size > MAX_UPLOAD_BYTES) return 'too-large'
  if (!/^(image|video)\//.test(file.type)) return 'bad-type'
  return null
}

export function mediaProblemMessage(problem: MediaFileProblem, file?: File): string {
  if (problem === 'missing') return 'No file selected'
  if (problem === 'bad-type') return 'Only image or video files are allowed'
  const actual = file ? ` (${formatBytes(file.size)})` : ''
  return `File too large${actual}. Maximum is ${formatBytes(MAX_UPLOAD_BYTES)}.`
}

type SignedUpload = { jwt: string }

async function getUploadCredential(): Promise<string | null> {
  try {
    const res = await fetch('/api/upload/sign', { method: 'POST' })
    const text = await res.text()
    const data = parseJson<SignedUpload>(text)
    if (!res.ok || !data?.jwt) return null
    return data.jwt
  } catch {
    return null
  }
}

// XMLHttpRequest rather than fetch: fetch gives no upload-progress events, and
// the whole point of lifting the size limit is that a user can now send a
// multi-minute video — staring at a frozen button for a minute is not an
// acceptable version of "it works".
function xhrUpload(
  url: string,
  form: FormData,
  headers: Record<string, string>,
  onProgress?: (pct: number) => void,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v))
    if (onProgress && xhr.upload) {
      xhr.upload.onprogress = e => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
      }
    }
    xhr.onload = () => resolve({ status: xhr.status, body: xhr.responseText })
    xhr.onerror = () => reject(new Error('Network error during upload'))
    xhr.onabort = () => reject(new Error('Upload cancelled'))
    xhr.ontimeout = () => reject(new Error('Upload timed out'))
    xhr.send(form)
  })
}

/**
 * Upload a media file and return its IPFS hash.
 * Throws an Error with a human-readable message on failure — never a
 * JSON-parse SyntaxError.
 */
export async function uploadMedia(file: File, onProgress?: (pct: number) => void): Promise<string> {
  const invalid = checkMediaFile(file)
  if (invalid) throw new Error(mediaProblemMessage(invalid, file))

  const jwt = await getUploadCredential()

  // Preferred path: browser -> Pinata, no size ceiling from our own hosting.
  if (jwt) {
    const form = new FormData()
    form.append('file', file)
    form.append('pinataMetadata', JSON.stringify({ name: file.name }))
    form.append('pinataOptions', JSON.stringify({ cidVersion: 1 }))

    const { status, body } = await xhrUpload(
      PINATA_PIN_URL, form, { Authorization: `Bearer ${jwt}` }, onProgress,
    )
    const data = parseJson<{ IpfsHash?: string; error?: unknown }>(body)
    if (status >= 200 && status < 300 && data?.IpfsHash) return data.IpfsHash

    // Fall through to the proxy below rather than failing outright — if
    // Pinata's direct-upload contract ever shifts, small uploads should keep
    // working instead of the whole feature going dark.
    console.error('Direct Pinata upload failed', status, body.slice(0, 300))
  }

  // Fallback: our own route. Works, but is subject to the 4.5 MB platform cap,
  // so tell the user plainly when that's what stopped them instead of letting
  // a plain-text 413 masquerade as a broken JSON response.
  const form = new FormData()
  form.append('file', file)
  const { status, body } = await xhrUpload('/api/upload', form, {}, onProgress)
  const data = parseJson<{ ipfsHash?: string; error?: string }>(body)
  if (status >= 200 && status < 300 && data?.ipfsHash) return data.ipfsHash

  if (status === 413 || /request entity too large/i.test(body)) {
    throw new Error(`File too large to upload right now (${formatBytes(file.size)}). Try a smaller file.`)
  }
  throw new Error(data?.error || `Upload failed (${status || 'no response'})`)
}
