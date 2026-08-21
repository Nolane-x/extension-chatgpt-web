export function splitComposerText(text, maxChars = 12_000) {
  const value = String(text ?? '');
  const limit = Math.max(2, Math.floor(maxChars));
  const out = [];
  let offset = 0;
  while (offset < value.length) {
    let end = Math.min(value.length, offset + limit);
    if (end < value.length) {
      const prev = value.charCodeAt(end - 1), next = value.charCodeAt(end);
      if (prev >= 0xD800 && prev <= 0xDBFF && next >= 0xDC00 && next <= 0xDFFF) end -= 1;
    }
    out.push(value.slice(offset, end));
    offset = end;
  }
  return out;
}
