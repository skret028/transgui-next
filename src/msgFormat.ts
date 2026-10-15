/**
 * Filling in a message that has been looked up.
 *
 * Kept apart from the lookup so it can be tested without a browser: the locale
 * files are Vite imports, this is plain string work.
 *
 * transgui's own messages come with two conventions this has to honour, because
 * the locale files are its own translations carried over as they stand:
 *
 *   - a line break inside a message is written `~`, in the English source and in
 *     every translation, so a two-line question stays one line in the file;
 *   - placeholders are printf's, `%s` and `%d`, and they are filled in the order
 *     they appear. A caller passing an object gives its values in insertion
 *     order; `{name}`-style placeholders, which this app's own newer strings
 *     use, are handled first and by name.
 */
export function formatMessage(raw: string, vars?: Record<string, string | number>): string {
  let out = raw;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      out = out.split(`{${k}}`).join(String(v));
    }
    const positional = Object.values(vars);
    if (positional.length > 0 && /%[sd]/.test(out)) {
      let i = 0;
      out = out.replace(/%[sd]/g, () => String(positional[i++] ?? ""));
    }
  }
  return out.split("~").join("\n");
}
