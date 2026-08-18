import { parseLevel, serializeLevel } from '../core/level.js'
import type { LevelData } from '../core/types.js'

/**
 * Level codes: JSON -> deflate-raw -> base64url, behind a versioned prefix.
 *
 * deflate-raw rather than gzip because it saves the 18-byte header and trailer,
 * which matters when the whole budget is about 1350 bytes. The codec is written
 * INTO the prefix so a future decoder never has to guess.
 *
 * The code goes in the URL's hash fragment, never the query string: fragments
 * are never sent to a server, so proxy and CDN request-line limits do not apply
 * and the whole thing works on a static host.
 */
export const CODE_PREFIX_DEFLATE = 'FOX1D.'
export const CODE_PREFIX_GZIP = 'FOX1G.'

/** Practical ceiling for a shareable URL. Beyond this, clipboard only. */
export const URL_CODE_LIMIT = 2000
export const URL_CODE_WARN = 1500

function toBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
  const bin = atob(b64 + pad)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const blob = new Blob([data as BlobPart])
  // CompressionStream is typed as TransformStream<BufferSource, Uint8Array>,
  // which TypeScript will not unify with a Uint8Array source even though it
  // accepts one at runtime.
  const pair = stream as unknown as ReadableWritablePair<Uint8Array, Uint8Array>
  const piped = blob.stream().pipeThrough(pair)
  const buf = await new Response(piped).arrayBuffer()
  return new Uint8Array(buf)
}

function hasCompressionStreams(): boolean {
  return typeof globalThis.CompressionStream === 'function'
}

export async function encodeLevelCode(level: LevelData): Promise<string> {
  const json = serializeLevel(level)
  const bytes = new TextEncoder().encode(json)
  if (!hasCompressionStreams()) {
    // Uncompressed fallback keeps sharing working on ancient WebKit rather
    // than failing outright; it just produces a longer code.
    return CODE_PREFIX_DEFLATE + toBase64Url(bytes)
  }
  const packed = await pipe(bytes, new CompressionStream('deflate-raw'))
  return CODE_PREFIX_DEFLATE + toBase64Url(packed)
}

export async function decodeLevelCode(code: string): Promise<LevelData> {
  const trimmed = extractCode(code)
  let payload: string
  let gzip = false
  if (trimmed.startsWith(CODE_PREFIX_DEFLATE)) payload = trimmed.slice(CODE_PREFIX_DEFLATE.length)
  else if (trimmed.startsWith(CODE_PREFIX_GZIP)) {
    payload = trimmed.slice(CODE_PREFIX_GZIP.length)
    gzip = true
  } else throw new Error('level.err.notALevel')

  const bytes = fromBase64Url(payload)
  let json: string
  try {
    if (!hasCompressionStreams()) {
      json = new TextDecoder().decode(bytes)
    } else {
      const raw = await pipe(bytes, new DecompressionStream(gzip ? 'gzip' : 'deflate-raw'))
      json = new TextDecoder().decode(raw)
    }
  } catch {
    // Either it was never compressed, or the payload is corrupt. Try plain.
    json = new TextDecoder().decode(bytes)
  }
  return parseLevel(json)
}

/** Accepts a bare code, a full share URL, or a pasted line with whitespace. */
export function extractCode(input: string): string {
  const s = input.trim()
  const hash = s.indexOf('#l=')
  if (hash >= 0) return s.slice(hash + 3).trim()
  return s.replace(/\s+/g, '')
}

export function shareUrl(code: string): string {
  const base = `${location.origin}${location.pathname}`
  return `${base}#l=${code}`
}

/** A level code present in the current URL, if any. */
export function codeFromLocation(): string | null {
  const h = location.hash
  if (!h.startsWith('#l=')) return null
  return h.slice(3)
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Clipboard API needs a secure context and a user gesture; fall back to
    // the old selection trick so the feature still works over plain http.
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch {
      return false
    }
  }
}

export function downloadLevel(level: LevelData, json: string): void {
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const slug = (level.meta.title || 'level').toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '-').slice(0, 40)
  a.href = url
  a.download = `${slug || 'level'}.fox.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
