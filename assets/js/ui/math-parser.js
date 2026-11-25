// Pure math delimiter scanner with currency-safe Pandoc inline rules.
// Kept DOM-free so both browser rendering and Node tests share the exact logic.

const WS = /\s/;
const ASCII_DIGIT = /[0-9]/;
const NON_CLOSING_PREV = /[\s(\[{（【《“‘]/;

function isEscaped(text, index) {
  let slashes = 0;
  for (let i = index - 1; i >= 0 && text[i] === '\\'; i--) slashes++;
  return (slashes & 1) === 1;
}

function isBlankBreak(text, newlineIndex) {
  let j = newlineIndex + 1;
  while (j < text.length && (text[j] === ' ' || text[j] === '\t')) j++;
  return text[j] === '\n';
}

function findDoubleDollarClose(text, start) {
  for (let k = start; k < text.length; ) {
    if (text[k] === '\\') { k += 2; continue; }
    if (text[k] === '$' && text[k + 1] === '$') return k;
    k++;
  }
  return -1;
}

function findEscapedBracketClose(text, start, closeChar, rejectBlankLine) {
  for (let k = start; k < text.length; ) {
    const ch = text[k];
    if (ch === '\\') {
      if (text[k + 1] === closeChar) return k;
      k += 2;
      continue;
    }
    if (rejectBlankLine && ch === '\n' && isBlankBreak(text, k)) return -1;
    k++;
  }
  return -1;
}

function findSingleDollarClose(text, start) {
  for (let k = start; k < text.length; ) {
    const ch = text[k];
    if (ch === '\\') { k += 2; continue; }
    if (ch === '\n' && isBlankBreak(text, k)) return { close: -1, eof: false };
    if (ch === '$') {
      if (text[k + 1] === '$') { k += 2; continue; }
      const prev = text[k - 1];
      const next = text[k + 1] || '';
      if (!NON_CLOSING_PREV.test(prev) && !ASCII_DIGIT.test(next)) {
        return { close: k, eof: false };
      }
      // An unescaped `$` that cannot close means this opening `$` is literal (e.g. `$100 ... $x$`).
      return { close: -1, eof: false };
    }
    k++;
  }
  return { close: -1, eof: true };
}

/**
 * Splits plain text into `{ type: 'text' | 'inline' | 'display', value }` segments.
 * Returns `null` when no valid math expression exists so callers can skip loading KaTeX.
 */
export function splitMath(text) {
  if (!text || (!text.includes('$') && !text.includes('\\'))) return null;
  const parts = [];
  let cursor = 0;
  let hasMath = false;
  let noInlineDollar = false;

  const flushText = end => {
    if (end <= cursor) return;
    const chunk = text.slice(cursor, end);
    if (parts.length && parts[parts.length - 1].type === 'text') parts[parts.length - 1].value += chunk;
    else parts.push({ type: 'text', value: chunk });
    cursor = end;
  };

  for (let i = 0; i < text.length; ) {
    const ch = text[i];
    if (ch === '\\' && !isEscaped(text, i)) {
      const next = text[i + 1];
      if (next === '(' || next === '[') {
        const display = next === '[';
        const closeChar = display ? ']' : ')';
        const close = findEscapedBracketClose(text, i + 2, closeChar, !display);
        if (close !== -1) {
          const inner = text.slice(i + 2, close);
          if (inner.trim()) {
            flushText(i);
            parts.push({ type: display ? 'display' : 'inline', value: inner });
            hasMath = true;
            i = cursor = close + 2;
            continue;
          }
        }
      }
      i += 2;
      continue;
    }

    if (ch === '$' && !isEscaped(text, i)) {
      if (text[i + 1] === '$') {
        const close = findDoubleDollarClose(text, i + 2);
        if (close !== -1) {
          const inner = text.slice(i + 2, close);
          if (inner.trim()) {
            flushText(i);
            parts.push({ type: 'display', value: inner });
            hasMath = true;
            i = cursor = close + 2;
            continue;
          }
        }
        i += 2;
        continue;
      }

      if (!noInlineDollar && i + 1 < text.length && !WS.test(text[i + 1])) {
        const { close, eof } = findSingleDollarClose(text, i + 1);
        if (close !== -1) {
          const inner = text.slice(i + 1, close);
          if (inner.trim()) {
            flushText(i);
            parts.push({ type: 'inline', value: inner });
            hasMath = true;
            i = cursor = close + 1;
            continue;
          }
        } else if (eof) {
          noInlineDollar = true;
        }
      }
    }

    i++;
  }

  if (!hasMath) return null;
  flushText(text.length);
  return parts;
}

/**
 * Reconstructs a standalone display-math paragraph when HyperDown converts
 * underscore subscripts into `<em>` elements and line wraps into `<br>`.
 */
export function extractDisplayTex(runs) {
  let raw = '';
  for (const run of runs) {
    if (run.kind === 'text') raw += run.value;
    else if (run.kind === 'br') raw += '\n';
    else if (run.kind === 'em') raw += '_' + run.value + '_';
    else return null;
  }
  const trimmed = raw.trim();
  if (trimmed.length <= 4) return null;
  if (trimmed.startsWith('$$') && trimmed.endsWith('$$')) {
    const inner = trimmed.slice(2, -2);
    if (inner.trim() && findDoubleDollarClose(inner, 0) === -1) return inner;
  }
  if (trimmed.startsWith('\\[') && trimmed.endsWith('\\]')) {
    const inner = trimmed.slice(2, -2);
    if (inner.trim() && findEscapedBracketClose(inner, 0, ']', false) === -1) return inner;
  }
  return null;
}
