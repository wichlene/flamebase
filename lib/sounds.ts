// Tiny synthesized sound effects via Web Audio API.
// No audio files, no bundle bloat. Off by default, respects localStorage.

let ctx: AudioContext | null = null
let enabled = false

if (typeof window !== 'undefined') {
  enabled = localStorage.getItem('flamebase_sound') === '1'
}

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  // Some browsers suspend AudioContext until a user gesture; resume on demand.
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

export function isSoundEnabled(): boolean { return enabled }
export function setSoundEnabled(on: boolean) {
  enabled = on
  if (typeof window !== 'undefined') {
    localStorage.setItem('flamebase_sound', on ? '1' : '0')
  }
}

// Play a single tone. `freq` Hz, `duration` seconds, `type` waveform.
function tone(freq: number, duration: number, type: OscillatorType = 'sine', gainPeak = 0.15, attack = 0.005) {
  const c = getCtx()
  if (!c) return
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, c.currentTime)
  gain.gain.setValueAtTime(0, c.currentTime)
  gain.gain.linearRampToValueAtTime(gainPeak, c.currentTime + attack)
  gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + duration)
  osc.connect(gain).connect(c.destination)
  osc.start()
  osc.stop(c.currentTime + duration + 0.02)
}

// Play a quick frequency sweep — useful for whoosh / success feels.
function sweep(from: number, to: number, duration: number, type: OscillatorType = 'sine', gainPeak = 0.15) {
  const c = getCtx()
  if (!c) return
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(from, c.currentTime)
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), c.currentTime + duration)
  gain.gain.setValueAtTime(0, c.currentTime)
  gain.gain.linearRampToValueAtTime(gainPeak, c.currentTime + 0.005)
  gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + duration)
  osc.connect(gain).connect(c.destination)
  osc.start()
  osc.stop(c.currentTime + duration + 0.02)
}

export const SFX = {
  // Soft pop for likes
  like() {
    if (!enabled) return
    sweep(520, 880, 0.12, 'sine', 0.18)
  },
  // Coin-y chime for tips
  tip() {
    if (!enabled) return
    tone(880, 0.09, 'triangle', 0.18)
    setTimeout(() => tone(1318, 0.18, 'triangle', 0.16), 70)
  },
  // Confirmation whoosh for post submitted
  post() {
    if (!enabled) return
    sweep(220, 740, 0.22, 'sawtooth', 0.10)
  },
  // Notification ding (new like/tip/dm arrived)
  notify() {
    if (!enabled) return
    tone(987, 0.08, 'sine', 0.14)
    setTimeout(() => tone(1318, 0.14, 'sine', 0.12), 80)
  },
  // Soft error blip
  error() {
    if (!enabled) return
    tone(180, 0.18, 'square', 0.10)
  },
  // Tiny tick for clicks / toggles
  click() {
    if (!enabled) return
    tone(1200, 0.03, 'square', 0.06)
  },
}
