// Frame pacing and canvas resolution, both judged from rAF timestamps alone.

export const FRAME_INTERVAL = 1000 / 60;
const SLACK = 2;

/**
 * Paces drawing to about 60 fps on any display. The deadline advances one
 * interval per frame instead of being measured from the last frame, so a 90 Hz
 * screen draws two vsyncs in three (60 fps) rather than one in two (45 fps).
 * Panels up to about 78 Hz draw every refresh: skipping one in five would judder.
 */
export class Pacer {
  constructor(interval = FRAME_INTERVAL) {
    this.interval = interval;
    this.deadline = 0;
  }

  /** Whether the frame at `now` should be drawn. */
  due(now) {
    if (now < this.deadline - SLACK) return false;
    // Never fall far behind (no burst after a stall), nor run ahead of a panel
    // that ticks slightly faster than 60 Hz (no periodic dropped frame).
    this.deadline = Math.min(Math.max(this.deadline + this.interval, now + this.interval / 4), now + this.interval - SLACK);
    return true;
  }
}

/**
 * Chooses the canvas resolution from measured smoothness, over windows of about
 * 1.5 s. Two slow windows in a row start a descent: the scale steps down until
 * frames get faster. Frame times snap to whole display refreshes, so a single
 * step often shows no gain; only when a third of the pixels is no faster does
 * the limit lie elsewhere (a battery saver, a 50 Hz panel), and the resolution
 * is restored with that pace accepted. Calm windows let the scale climb back,
 * more patiently each time a climb proved too much.
 */
export class Governor {
  constructor({ min = .55, window = 1500 } = {}) {
    this.min = min;
    this.window = window;
    this.max = 1;
    this.scale = 1;
    this.pace = FRAME_INTERVAL;   // the frame interval a smooth window reaches
    this.patience = 2;            // calm windows needed before climbing
    this.calm = 0;
    this.strikes = 0;
    this.trial = null;            // the last change, until the next window judges it
    this.descent = null;          // where the current descent began
    this.restart();
  }

  /** Drops the partial window, e.g. when drawing pauses. */
  restart() {
    this.start = 0;
    this.frames = 0;
  }

  /** Follows a new resolution ceiling; a scale at the ceiling stays there. */
  setMax(max) {
    if (max === this.max) return;
    const atMax = this.scale >= this.max;
    this.max = max;
    this.scale = atMax ? max : Math.min(this.scale, max);
    // Earlier windows measured a different canvas.
    this.trial = this.descent = null;
    this.restart();
  }

  /** Call once per drawn frame; returns true when the scale changed. */
  sample(now) {
    if (!this.start) { this.start = now; this.frames = 0; return false; }
    this.frames++;
    const elapsed = now - this.start;
    // A window that judges a change is shorter, so a wrong step is undone sooner.
    if (elapsed < (this.trial || this.descent ? this.window / 2 : this.window)) return false;
    const interval = elapsed / this.frames;
    this.start = now; this.frames = 0;
    return this.judge(interval);
  }

  judge(interval) {
    const before = this.scale, trial = this.trial;
    this.trial = null;
    // Frames faster than the accepted pace mean an earlier cap has lifted.
    if (interval < this.pace) this.pace = Math.max(FRAME_INTERVAL, interval);
    const slow = interval > this.pace * 1.18, calm = interval < this.pace * 1.06;
    // Fewer pixels made frames faster: resolution is what limits them.
    if (this.descent && interval < this.descent.interval * .93) this.descent = null;
    if (trial?.raised && slow) {
      // The climb was too much: return to the last smooth scale.
      this.scale = trial.from;
      this.patience = Math.min(this.patience * 2, 32);
      this.strikes = this.calm = 0;
    } else if (slow) {
      this.calm = 0;
      // A single slow window may be a hiccup; after a change or within a descent, act at once.
      if (++this.strikes >= 2 || trial || this.descent) {
        this.strikes = 0;
        const descent = this.descent ||= { scale: this.scale, interval };
        const floor = Math.max(this.min, descent.scale * .6);
        if (this.scale > floor) {
          this.trial = { lowered: true };
          this.scale = Math.max(floor, this.scale * .84);
        } else {
          // A third of the pixels and no faster: the limit lies elsewhere.
          this.scale = descent.scale;
          this.pace = Math.max(this.pace, descent.interval);
          this.descent = null;
        }
      }
    } else {
      this.strikes = 0;
      this.descent = null;
      this.calm = calm ? this.calm + 1 : 0;
      if (this.calm >= this.patience && this.scale < this.max) {
        this.calm = 0;
        this.trial = { raised: true, from: this.scale };
        this.scale = Math.min(this.max, this.scale * 1.1);
      }
    }
    return this.scale !== before;
  }
}
