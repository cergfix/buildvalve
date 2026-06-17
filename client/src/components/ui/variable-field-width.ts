// Per-card width budget for the launch form's variable cards. A card has a
// compact MIN width (sized so the 300px control has equal grey margin on both
// sides) and grows only to fit its own (non-wrapping) key — so a long variable
// name targets that name. PipelineLaunchPage resolves one shared width per
// nesting level and passes it to each card; cardWidthPx is also the standalone
// fallback when no width is supplied.
//
// Kept in its own module (not variable-field.tsx) so that component file only
// exports components — required by the react-refresh/only-export-components lint.
const MIN_CARD_PX = 404; // 300px control + 52px left gutter + matching 52px on the right
const CHROME_PX = 70; // 52px badge gutter + 18px right padding
const KEY_CHAR_PX = 8.6; // approx advance of an uppercase key glyph at 13px + letter-spacing
const LOCKED_CHIP_PX = 66; // LOCKED chip width + gap, present only on locked vars

export function cardWidthPx(key: string, locked: boolean): number {
  const keyWidth = key.length * KEY_CHAR_PX + (locked ? LOCKED_CHIP_PX : 0);
  return Math.max(MIN_CARD_PX, Math.round(CHROME_PX + keyWidth));
}
