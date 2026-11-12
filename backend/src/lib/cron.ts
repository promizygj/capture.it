import parser from 'cron-parser';

/** Thin wrapper over cron-parser (same library BullMQ uses for job schedulers). */
const cron = {
  isValid(expr: string): boolean {
    const fields = expr.trim().split(/\s+/);
    if (fields.length !== 5) return false;
    try {
      parser.parseExpression(expr);
      return true;
    } catch {
      return false;
    }
  },
  next(expr: string, tz = 'UTC'): Date | null {
    try {
      return parser.parseExpression(expr, { tz }).next().toDate();
    } catch {
      return null;
    }
  },
};
export default cron;
