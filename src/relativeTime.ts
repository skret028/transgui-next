// Dates shown as how long ago they were, the way the original does it.
//
// Its HumanReadableTime prints the two most significant units, abbreviated and
// never translated: "%ds"/"%dm"/"%dh"/"%dd"/"%dmo"/"%dy" are the same six forms
// in every language it ships. A date a month back reads "1mo 2d", not
// "1 month ago" - the shape is a duration, not a sentence.
//
// Years and months are calendar properties, so they are anchored rather than
// divided: the earlier moment is moved forward by whole months (clamping the
// day, so 31 January plus a month is 28 February) and the remainder is the
// elapsed time. Dividing seconds instead would report 31 January to 1 March as
// "0mo 29d" instead of "1mo 1d".

export interface AgoParts {
  years: number;
  months: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

const SUFFIX: Record<keyof AgoParts, string> = {
  years: "y",
  months: "mo",
  days: "d",
  hours: "h",
  minutes: "m",
  seconds: "s",
};

const ORDER: (keyof AgoParts)[] = ["years", "months", "days", "hours", "minutes", "seconds"];

/** The earlier moment moved on by whole months, with the day clamped. */
function addMonths(from: Date, months: number): Date {
  const total = from.getFullYear() * 12 + from.getMonth() + months;
  const year = Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(
    year,
    month,
    Math.min(from.getDate(), lastDay),
    from.getHours(),
    from.getMinutes(),
    from.getSeconds(),
    from.getMilliseconds(),
  );
}

/**
 * The calendar and clock distance between two moments, oldest unit first.
 *
 * Either order is accepted: a moment in the future gives the same parts, since
 * what is being shown is the distance, not a signed span.
 */
export function agoParts(nowSeconds: number, thenSeconds: number): AgoParts {
  const a = new Date(Math.min(nowSeconds, thenSeconds) * 1000);
  const b = new Date(Math.max(nowSeconds, thenSeconds) * 1000);

  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  let anchor = addMonths(a, months);
  if (anchor.getTime() > b.getTime()) {
    months -= 1;
    anchor = addMonths(a, months);
  }

  let rest = Math.max(0, Math.floor((b.getTime() - anchor.getTime()) / 1000));
  const days = Math.floor(rest / 86400);
  rest -= days * 86400;
  const hours = Math.floor(rest / 3600);
  rest -= hours * 3600;
  const minutes = Math.floor(rest / 60);
  rest -= minutes * 60;

  return { years: Math.floor(months / 12), months: months % 12, days, hours, minutes, seconds: rest };
}

/**
 * The two most significant non-zero parts, which is what the original prints:
 * years and months, else months and days, else days and hours, else hours and
 * minutes, else minutes and seconds, else seconds alone.
 */
export function agoUnits(parts: AgoParts): [keyof AgoParts, number][] {
  const first = ORDER.findIndex((unit) => parts[unit] > 0);
  if (first < 0) return [["seconds", 0]];
  return [ORDER[first], ORDER[first + 1]]
    .filter((unit): unit is keyof AgoParts => unit !== undefined)
    .map((unit) => [unit, parts[unit]]);
}

/** How long ago (or from now) a moment is, as the original prints it. */
export function agoText(nowSeconds: number, thenSeconds: number): string {
  return agoUnits(agoParts(nowSeconds, thenSeconds))
    .map(([unit, value]) => `${value}${SUFFIX[unit]}`)
    .join(" ");
}
