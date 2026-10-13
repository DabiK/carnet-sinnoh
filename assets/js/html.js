'use strict';
const htmlChunks = new WeakMap();
/**
 * Template tag for markup written over several lines: every line break and the indentation that
 * follows it are dropped, so the layout of the source never reaches the DOM. Interpolated values
 * are inserted as they are; escape untrusted text with `esc()`.
 */
function html(strings, ...values) {
  let chunks = htmlChunks.get(strings);
  if (!chunks) {
    chunks = strings.map((chunk) => chunk.replace(/\n\s*/g, ''));
    htmlChunks.set(strings, chunks);
  }
  let markup = chunks[0];
  for (let i = 0; i < values.length; i++) markup += `${values[i]}${chunks[i + 1]}`;
  return markup;
}
