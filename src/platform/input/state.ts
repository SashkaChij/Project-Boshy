import { emptyInput, type InputFrame } from '../../core/types.js'

/**
 * Edge-latching input accumulator.
 *
 * Event handlers set bits here; the simulator drains them once per 20 ms tick.
 * `pressed` and `released` are STICKY -- they survive until a tick consumes
 * them -- because a jump tap that starts and ends between two ticks would
 * otherwise vanish entirely, taking the release edge (and therefore variable
 * jump height) with it.
 */
export class InputAccumulator {
  private held = 0
  private pressed = 0
  private released = 0

  down(bit: number): void {
    if ((this.held & bit) === 0) this.pressed |= bit
    this.held |= bit
  }

  up(bit: number): void {
    if ((this.held & bit) !== 0) this.released |= bit
    this.held &= ~bit
  }

  /** Force-clear, e.g. when the window loses focus mid-hold. */
  clear(): void {
    this.held = 0
    this.pressed = 0
    this.released = 0
  }

  isHeld(bit: number): boolean {
    return (this.held & bit) !== 0
  }

  /** Take a frame and reset the edges. Call exactly once per simulation tick. */
  snapshot(): InputFrame {
    const f: InputFrame = { held: this.held, pressed: this.pressed, released: this.released }
    this.pressed = 0
    this.released = 0
    return f
  }

  static empty(): InputFrame {
    return emptyInput()
  }
}
