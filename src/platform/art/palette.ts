/**
 * The one palette. Every sprite, tile, particle and glyph in the game is
 * painted from these 36 colours, which is what makes a mossy stone block, a
 * rusted press and a shard of the void look like they belong in the same game
 * instead of three different games stapled together.
 *
 * It is a single ramp family reused three ways:
 *   - a cool violet-grey neutral ramp (0..7) that everything is shaded against,
 *     so shadows in the forest and shadows in the factory match;
 *   - three thematic accent families -- sick greens, rust/steel/neon,
 *     void violet -- that never fight because they all share those neutrals;
 *   - two reserved signal colours that mean exactly one thing each:
 *     'E'/'x' is blood (death, and only death) and 'o'/'O' is the fox.
 *
 * The consequence worth stating out loud: nothing decorative is ever allowed
 * to use hot red. If the player sees red, something has just killed them or
 * is about to.
 *
 * Keys are single printable ASCII characters, used as the pixels of every
 * sprite row. '.' is reserved for transparent and is never a colour.
 */
export const PALETTE: Readonly<Record<string, string>> = Object.freeze({
  // -- neutral ramp: outlines, stone, metal shading, UI text ---------------
  /** Void black. Sprite outlines, the backdrop of world 3, deepest shadow. */
  '0': '#07060c',
  /** Ink. One step off black: shadowed sides of blocks, cracks, mortar. */
  '1': '#14111d',
  /** Slate shadow. The default "unlit surface" of any structure. */
  '2': '#241f33',
  /** Slate. Base tone of stone and of unpainted machinery. */
  '3': '#3b3550',
  /** Slate light. Lit faces, bevels, the top edge of a block. */
  '4': '#58506f',
  /** Stone highlight. Chipped edges, worn corners, dust. */
  '5': '#7c7595',
  /** Pale grey. Bone, dead wood, secondary UI text. */
  '6': '#a9a2bd',
  /** Bone white. Primary text, eye glints, the fox's chest. */
  '7': '#e8e4f2',

  // -- world 1: the sickly forest -----------------------------------------
  /** Pine dark. Deep foliage, the inside of a vine, swamp water weeds. */
  g: '#1b3a1f',
  /** Moss. Body colour of anything overgrown. */
  G: '#2e6130',
  /** Sick leaf. The unhealthy yellow-green that names the world. */
  h: '#56913a',
  /** Acid highlight. Grass tips, lit moss, spore glow. */
  H: '#93c247',
  /** Bark. Trunks, signposts, crates, the shaft of a wooden platform. */
  B: '#4b3122',
  /** Dry wood. Lit edge of bark, rope, old planks. */
  n: '#7a5533',

  // -- world 2: rust, steel and neon ---------------------------------------
  /** Rust dark. Corroded shadow -- also the fox's shadow tone. */
  r: '#5e2a15',
  /** Rust. Oxidised iron, the body of anything abandoned. */
  R: '#9c4a1e',
  /** Fox orange. Reserved: the player's fur, and warm rust highlights. */
  o: '#d4762a',
  /** Fox highlight. The brightest fur, and glowing embers. */
  O: '#f5a23e',
  /** Lamp yellow. Working machinery, arrows, warning stripes, sparks. */
  y: '#ffd45e',
  /** Steel shadow. The underside of plate, pipe interiors. */
  i: '#3a4753',
  /** Steel. Machined metal, rails, bolts. */
  I: '#6c8090',
  /** Bright steel. Polished bevels, rivet caps, blade edges. */
  w: '#bcc9d2',
  /** Neon cyan. Powered circuitry, energy, the goal gate. */
  C: '#2ef0d4',
  /** Neon magenta dark. The unlit half of a neon tube. */
  m: '#a12896',
  /** Neon magenta. Lit signage, boss energy, warp light. */
  M: '#ff5ce0',

  // -- world 3: the black-and-violet void ----------------------------------
  /** Violet deep. Obsidian, the shadow inside void geometry. */
  v: '#38175c',
  /** Violet. Body colour of void matter. */
  V: '#6a2fb2',
  /** Light violet. Void highlights, portal rims, shadow-fox fur. */
  u: '#a86bf0',
  /** Pale lilac. Stars, sparks, the brightest void edge. */
  U: '#e2bcff',

  // -- signal colours: these mean death, and nothing else -------------------
  /** Clotted blood. The dark core of the death burst; spike bases. */
  e: '#6b0a14',
  /** Blood red. The death burst. Never used for decoration. */
  E: '#c2101f',
  /** Hot red. Hazard highlights: spike edges, laser cores, armed traps. */
  x: '#ff3a3a',

  // -- water and ice --------------------------------------------------------
  /** Deep water. The dark body of a submerged tile. */
  a: '#17456b',
  /** Water. Mid tone of every water variant. */
  A: '#2f7fb5',
  /** Shallow water / ice. Surface sparkle and the body of ice. */
  q: '#79d2e8',
  /** Ice white. Frozen highlights and foam crests. */
  Q: '#dcf5ff',
})
