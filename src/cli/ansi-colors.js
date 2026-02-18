/**
 * Shared ANSI color helpers for static output via outputBuffer.append()
 *
 * Use these in strings passed to outputBuffer.append() or sendOutput().
 * Ink strips ANSI codes for layout measurement, so no layout impact.
 */

const R = '\x1b[0m';

export const bold       = s => `\x1b[1m${s}${R}`;
export const dim        = s => `\x1b[2m${s}${R}`;
export const cyan       = s => `\x1b[36m${s}${R}`;
export const green      = s => `\x1b[32m${s}${R}`;
export const yellow     = s => `\x1b[33m${s}${R}`;
export const red        = s => `\x1b[31m${s}${R}`;
export const blue       = s => `\x1b[34m${s}${R}`;
export const gray       = s => `\x1b[90m${s}${R}`;
export const boldCyan   = s => `\x1b[1m\x1b[36m${s}${R}`;
export const boldGreen  = s => `\x1b[1m\x1b[32m${s}${R}`;
export const boldYellow = s => `\x1b[1m\x1b[33m${s}${R}`;
export const boldRed    = s => `\x1b[1m\x1b[31m${s}${R}`;
