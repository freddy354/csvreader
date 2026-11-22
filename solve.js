// Faster drop-in for csv-reader 1.0.0 (make.fun's own CSV reader).
// Same answers as vendor/csv-reader/index.js, byte for byte (as JSON values),
// but the text is scanned in slices instead of one character at a time:
//   - unquoted fields: one regex scan to the next comma / CR / LF, slice the run;
//   - quoted fields: indexOf to the next quote, slice the segment (doubled
//     quotes and embedded line breaks are the only slow paths);
//   - no per-character string concatenation anywhere.
// Pure: no clock, no randomness, no locale, nothing kept from one call to the next.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input {text, header}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const n = text.length;
  let pos = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let line = 1;

  // The record being read: the line it starts on, and its index in rows (null: the header).
  let recordLine = 1;
  let recordRow = null;

  // Next comma / CR / LF at or after the regex's lastIndex.
  const DELIM = /[,\r\n]/g;
  // CRLF or lone CR, for converting line breaks inside quoted fields to LF.
  const CR = /\r\n?/g;

  function error(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Reads unquoted characters onto `value` up to the next comma or line break.
  // A CR not followed by LF is dropped (stray_cr). Returns the field, how it
  // ended, and `added`: the characters kept (not counting the initial value).
  function unquoted(value) {
    let added = 0;
    let parts = null; // set once a stray CR forces the field to be built in pieces
    for (;;) {
      DELIM.lastIndex = pos;
      const mt = DELIM.exec(text);
      if (mt === null) {
        const tail = text.slice(pos);
        if (parts !== null) {
          parts.push(tail);
          value = parts.join('');
        } else if (value !== '') {
          value += tail;
        } else {
          value = tail;
        }
        added += tail.length;
        pos = n;
        return { value, ended: END, added };
      }
      const i = mt.index;
      const c = mt[0];
      if (c === ',') {
        const tail = text.slice(pos, i);
        value = finish(value, parts, tail);
        added += i - pos;
        pos = i + 1;
        return { value, ended: COMMA, added };
      }
      if (c === '\n') {
        const tail = text.slice(pos, i);
        value = finish(value, parts, tail);
        added += i - pos;
        pos = i + 1;
        line += 1;
        return { value, ended: LINE_BREAK, added };
      }
      // c === '\r'
      if (text[i + 1] === '\n') {
        const tail = text.slice(pos, i);
        value = finish(value, parts, tail);
        added += i - pos;
        pos = i + 2;
        line += 1;
        return { value, ended: LINE_BREAK, added };
      }
      // Lone CR outside quotes: dropped, stray_cr, and the field goes on.
      // The characters kept before it still count toward `added`.
      added += i - pos;
      error('stray_cr');
      if (parts === null) parts = [value];
      parts.push(text.slice(pos, i));
      pos = i + 1;
    }
  }

  // Joins the tail slice onto the field: the single-slice fast path when no
  // stray CR split the field, the parts join otherwise.
  function finish(value, parts, tail) {
    if (parts !== null) {
      parts.push(tail);
      return parts.join('');
    }
    if (tail === '') return value;
    return value === '' ? tail : value + tail;
  }

  // Converts one segment of a quoted field: CRLF and lone CR each become LF,
  // and `line` advances by the number of line breaks in it. The common case
  // (no CR or LF in the segment) returns the segment untouched.
  function convert(seg) {
    if (seg.indexOf('\r') < 0 && seg.indexOf('\n') < 0) return seg;
    CR.lastIndex = 0;
    const out = seg.replace(CR, '\n');
    let count = 0;
    let at = out.indexOf('\n');
    while (at >= 0) {
      count += 1;
      at = out.indexOf('\n', at + 1);
    }
    line += count;
    return out;
  }

  // Reads a quoted field whose opening quote is at pos.
  function quoted() {
    const open = pos;
    const openLine = line;
    let parts = null;
    let value = '';
    pos += 1;
    for (;;) {
      const q = text.indexOf('"', pos);
      if (q < 0) {
        // The quote never closes: it is a literal character, and the text
        // after it is read again as an unquoted field.
        pos = open + 1;
        line = openLine;
        error('unterminated_quote');
        return unquoted('"');
      }
      const seg = convert(text.slice(pos, q));
      if (text[q + 1] === '"') {
        // Doubled quote: one literal quote, and the field goes on.
        if (parts === null) parts = [value];
        parts.push(seg, '"');
        pos = q + 2;
        continue;
      }
      // The closing quote.
      value = parts === null ? seg : (parts.push(seg), parts.join(''));
      pos = q + 1;
      break;
    }
    if (pos >= n) return { value, ended: END };
    const c = text[pos];
    if (c === ',') {
      pos += 1;
      return { value, ended: COMMA };
    }
    if (c === '\n') {
      pos += 1;
      line += 1;
      return { value, ended: LINE_BREAK };
    }
    if (c === '\r' && text[pos + 1] === '\n') {
      pos += 2;
      line += 1;
      return { value, ended: LINE_BREAK };
    }
    // What follows the closing quote is appended as it stands, up to the next
    // comma or line break.
    const junk = unquoted(value);
    if (junk.added > 0) error('quote_junk');
    return junk;
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text[pos];
      if (c === '\n') {
        pos += 1;
        line += 1;
      } else if (c === '\r' && text[pos + 1] === '\n') {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let ended;
    let wasQuoted;
    do {
      if (text[pos] === '"') {
        wasQuoted = true;
        const field = quoted();
        fields.push(field.value);
        ended = field.ended;
        continue;
      }
      wasQuoted = false;
      // Unquoted field, inlined: one regex scan to the next comma / CR / LF,
      // the run sliced straight onto the record, no object per field. Only a
      // lone CR (stray_cr) falls back to the full reader below.
      const fs = pos;
      for (;;) {
        DELIM.lastIndex = pos;
        const mt = DELIM.exec(text);
        if (mt === null) {
          fields.push(text.slice(pos));
          pos = n;
          ended = END;
          break;
        }
        const i = mt.index;
        const c = mt[0];
        if (c === ',') {
          fields.push(text.slice(pos, i));
          pos = i + 1;
          ended = COMMA;
          break;
        }
        if (c === '\n') {
          fields.push(text.slice(pos, i));
          pos = i + 1;
          line += 1;
          ended = LINE_BREAK;
          break;
        }
        if (text[i + 1] === '\n') {
          fields.push(text.slice(pos, i));
          pos = i + 2;
          line += 1;
          ended = LINE_BREAK;
          break;
        }
        // Lone CR: the full reader takes over from the CR, with the run
        // read so far as the field's start.
        pos = i;
        const f = unquoted(text.slice(fs, i));
        fields.push(f.value);
        ended = f.ended;
        break;
      }
    } while (ended === COMMA);

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !wasQuoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
