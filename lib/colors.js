/**
 * ChromaWave - Terminal color library with rainbow gradients
 * Supports 24-bit true color ANSI codes for beautiful terminal output
 */

// ANSI color codes using 24-bit true color
export const colors = {
  // Basic colors (standard ANSI)
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  red: '\x1b[31m',

  // Extended true colors (24-bit RGB)
  coral: '\x1b[38;2;255;127;80m',
  peach: '\x1b[38;2;255;218;185m',
  lavender: '\x1b[38;2;230;230;250m',
  mint: '\x1b[38;2;152;255;152m',
  sky: '\x1b[38;2;135;206;235m',
  rose: '\x1b[38;2;255;182;193m',
  gold: '\x1b[38;2;255;215;0m',
  violet: '\x1b[38;2;238;130;238m',
  aqua: '\x1b[38;2;127;255;212m',
  salmon: '\x1b[38;2;250;128;114m',
  lime: '\x1b[38;2;50;205;50m',
  indigo: '\x1b[38;2;75;0;130m',
  teal: '\x1b[38;2;0;128;128m',
  amber: '\x1b[38;2;255;191;0m',
  crimson: '\x1b[38;2;220;20;60m',
  emerald: '\x1b[38;2;80;200;120m',
  sapphire: '\x1b[38;2;15;82;186m',

  // Muted/subdued colors
  mutedRed: '\x1b[38;2;180;100;100m',
  mutedGreen: '\x1b[38;2;120;160;120m',
  mutedBlue: '\x1b[38;2;100;120;180m',
  mutedYellow: '\x1b[38;2;200;180;100m',
  mutedPurple: '\x1b[38;2;160;120;160m',
  mutedOrange: '\x1b[38;2;200;140;100m',

  // Grays
  gray: '\x1b[38;2;128;128;128m',
  lightGray: '\x1b[38;2;192;192;192m',
  darkGray: '\x1b[38;2;64;64;64m',

  // Formatting
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m'
};

/**
 * Rainbow colorizer function (lolcat style) with smooth color transitions
 * @param {string} text - The text to colorize
 * @param {number} frequency - Controls the speed of color transitions (default: 0.3)
 * @returns {string} - The colorized text with ANSI codes
 */
export function rainbow(text, frequency = 0.3) {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    // Calculate RGB values using sine waves for smooth transitions
    const r = Math.floor(Math.sin(frequency * i + 0) * 55 + 145);
    const g = Math.floor(Math.sin(frequency * i + 2) * 55 + 145);
    const b = Math.floor(Math.sin(frequency * i + 4) * 55 + 145);

    // Use 24-bit true color ANSI codes for smooth gradients
    result += `\x1b[38;2;${r};${g};${b}m${text[i]}`;
  }
  return result + colors.reset;
}

/**
 * Create a custom color using RGB values
 * @param {number} r - Red (0-255)
 * @param {number} g - Green (0-255)
 * @param {number} b - Blue (0-255)
 * @returns {string} - ANSI color code
 */
export function rgb(r, g, b) {
  return `\x1b[38;2;${r};${g};${b}m`;
}

/**
 * Colorize text with a specific color
 * @param {string} text - The text to colorize
 * @param {string} color - The color code or name from colors object
 * @returns {string} - The colorized text
 */
export function colorize(text, color) {
  const colorCode = colors[color] || colors['aqua'];
  return `${colorCode}${text}${colors.reset}`;
}

// Default export for convenience
export default {
  colors,
  rainbow,
  rgb,
  colorize
};
