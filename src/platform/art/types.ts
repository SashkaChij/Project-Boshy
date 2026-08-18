/**
 * Sprites are authored as data in code: rows of palette characters.
 *
 * The payoff beyond "no binary files in git" is that the per-pixel spike
 * masks the simulation collides against are derived from the same source as
 * the art, so a hitbox can never silently drift from what the player sees --
 * which would invalidate every recorded replay at once.
 */
export interface SpriteData {
  w: number
  h: number
  /** Exactly `h` strings of exactly `w` characters. '.' means transparent. */
  rows: string[]
  /**
   * Anchor within the sprite that sits on the entity origin.
   * Defaults to the centre. The player needs an explicit one because its
   * 11x21 hitbox is not centred in its drawn frame.
   */
  ax?: number
  ay?: number
}

export interface SpriteSheet {
  [name: string]: SpriteData
}
