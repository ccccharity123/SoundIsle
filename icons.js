import { glyphs } from './phosphor-glyphs.js';

const aliases = {
  "prev": "skip-back",
  "next": "skip-forward",
  "lyrics": "quotes",
  "library": "playlist",
  "close": "x",
  "down": "caret-down",
  "up": "arrow-up",
  "right": "caret-right",
  "left": "caret-left",
  "arrowdown": "arrow-down",
  "external": "arrow-up-right",
  "size": "arrows-out-simple",
  "settings": "gear-six",
  "one": "repeat-once",
  "volumeLow": "speaker-low",
  "volumeHigh": "speaker-high",
  "volumeMute": "speaker-slash",
  "more": "dots-three-outline",
  "note": "note",
  "palette": "swatches",
  "refresh": "arrows-clockwise",
  "music": "music-notes",
  "resonance": "sparkle",
  "search": "magnifying-glass",
  "archive": "archive",
  "sort": "arrows-down-up",
  "bookmark": "bookmark-simple",
  "plus": "plus",
  "remove": "trash",
  "edit": "pencil-simple",
  "users": "user-list",
  "scan": "scan",
  "history": "clock-counter-clockwise",
  "checkmark": "check",
  "minus": "minus",
  "folder": "folder-simple",
  "download": "download-simple",
  "upload": "upload-simple",
  "warning": "warning-circle",
  "speaker": "speaker-high",
  "save": "floppy-disk",
  "undo": "arrow-counter-clockwise"
};
const filled = new Set(['play', 'pause', 'skip-back', 'skip-forward', 'stop']);
const weights = new Set(['regular', 'fill', 'duotone']);
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

export function icon(name, size = 22, options = {}) {
  const canonical = own(aliases, name) ? aliases[name] : name;
  const paths = own(glyphs, canonical) ? glyphs[canonical] : glyphs.question;
  const weight = weights.has(options.weight) ? options.weight : (options.active || filled.has(canonical) ? 'fill' : 'regular');
  const pixels = typeof size === 'number' && Number.isFinite(size) ? Math.max(8, Math.min(256, size)) : 22;
  return '<svg class="cap-icon" aria-hidden="true" focusable="false" viewBox="0 0 256 256" width="' + pixels +
    '" height="' + pixels + '" fill="currentColor">' + paths[weight] + '</svg>';
}
