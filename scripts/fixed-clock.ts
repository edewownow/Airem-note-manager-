/**
 * Import FIRST in a sim whose fixtures use fixed dates: makes `new Date()` / `Date.now()` return
 * Thu 29 Oct 2026, 17:00 local, so the checks don't go stale as the real date moves on.
 */
const FIXED = new Date(2026, 9, 29, 17, 0).getTime();
const RealDate = Date;
class FixedDate extends RealDate {
  constructor(...args: any[]) {
    if (args.length === 0) super(FIXED);
    else super(...(args as [any]));
  }
  static now() {
    return FIXED;
  }
}
(globalThis as any).Date = FixedDate;
