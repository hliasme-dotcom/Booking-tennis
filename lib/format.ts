const TZ = "Europe/Athens";

export const euro = (cents: number) =>
  new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(cents / 100);

export const when = (d: Date | string) =>
  new Intl.DateTimeFormat("el-GR", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(d));

export const time = (d: Date | string) =>
  new Intl.DateTimeFormat("el-GR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(d));

/** "2026-11-26T21:15" σε ώρα Ελλάδας -> Date */
export function athensLocalToDate(local: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) throw new Error("bad datetime");
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  // διαφορά της ζώνης Ελλάδας εκείνη τη στιγμή (χειμερινή/θερινή ώρα)
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .formatToParts(new Date(guess));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asAthens = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return new Date(guess - (asAthens - guess));
}

export const minToHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
export const HHMMToMin = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
};

export const WEEKDAYS = ["Κυριακή", "Δευτέρα", "Τρίτη", "Τετάρτη", "Πέμπτη", "Παρασκευή", "Σάββατο"];

export const STATUS: Record<string, string> = {
  open: "Ψάχνει παίκτη",
  confirmed: "Επιβεβαιωμένος",
  expired: "Έληξε",
  cancelled: "Ακυρώθηκε",
};

export const level = (n: number | string | null) => (n === null ? "—" : Number(n).toFixed(1).replace(".", ","));
