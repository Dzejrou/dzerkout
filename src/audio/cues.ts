/**
 * Web Audio countdown cue module.
 *
 * All tunable constants live at the top of this file — edit freely.
 * Nothing in here imports from the rest of the app; it is deliberately
 * self-contained so it can be called from hooks, tests, or Settings previews.
 */

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Which remaining-second values trigger a cue, in descending order.
 * The last entry is the "final" tone played at the moment the timer crosses zero
 * (i.e. floor(remainingSec) === -1 fires when the phase actually ends).
 * The default values produce three warning beeps during the final seconds, then
 * a final tone immediately after the phase reaches zero.
 */
export const CUE_SECONDS: readonly number[] = [2, 1, 0, -1] as const;

/** The value in CUE_SECONDS that receives the distinct final tone. */
export const FINAL_CUE_SECOND = CUE_SECONDS[CUE_SECONDS.length - 1]; // -1

/** Short beep played for warning cues before the final tone. */
const COUNTDOWN_BEEP = {
  /** Oscillator frequency in Hz.  880 Hz = A5. */
  frequency: 880,
  /** Length of the audible tone in seconds. */
  duration: 0.08,
  /** Peak gain (0–1). */
  volume: 0.25,
  /** Web Audio oscillator waveform type. */
  waveform: "sine" as OscillatorType,
};

/** Distinct final tone played at 0 seconds remaining. */
const FINAL_TONE = {
  /** 1320 Hz = E6 — noticeably higher pitch than the countdown beep. */
  frequency: 1320,
  duration: 0.28,
  volume: 0.35,
  waveform: "sine" as OscillatorType,
};

/** Gap between cues when playing the preview sequence, in milliseconds. */
const PREVIEW_CUE_GAP_MS = 500;

// ── AudioContext (lazy singleton) ─────────────────────────────────────────────

let _ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!_ctx || _ctx.state === "closed") {
    _ctx = new AudioContext();
  }
  // Some browsers/Tauri suspend the context until a user gesture; resume it.
  if (_ctx.state === "suspended") {
    void _ctx.resume();
  }
  return _ctx;
}

// ── Playback ──────────────────────────────────────────────────────────────────

/**
 * Play a single countdown cue beep via Web Audio.
 *
 * @param isFinal  true  → play the distinct final tone (0-second cue)
 *                 false → play the short countdown beep (3/2/1-second cues)
 */
export function playBeep(isFinal: boolean): void {
  try {
    const ctx = getCtx();
    const cfg = isFinal ? FINAL_TONE : COUNTDOWN_BEEP;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = cfg.waveform;
    osc.frequency.value = cfg.frequency;

    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;
    gain.gain.setValueAtTime(cfg.volume, now);
    // Exponential ramp to near-silence for a click-free fade-out.
    gain.gain.exponentialRampToValueAtTime(0.001, now + cfg.duration);

    osc.start(now);
    osc.stop(now + cfg.duration + 0.02);
  } catch {
    // AudioContext may be unavailable (no audio hardware, policy block, etc.).
    // Silently swallow — missing a beep is far better than crashing the runner.
  }
}

/**
 * Play the full preview sequence, each cue separated by
 * PREVIEW_CUE_GAP_MS milliseconds.
 *
 * This is the exact same pattern the runner uses during countdowns, so the
 * Settings preview gives the user an accurate impression of what they'll hear.
 */
export function playPreviewCue(): void {
  CUE_SECONDS.forEach((sec, i) => {
    setTimeout(() => playBeep(sec === FINAL_CUE_SECOND), i * PREVIEW_CUE_GAP_MS);
  });
}
