const KEY_PATTERN = /^backups\/grammashop-(\d{4}-\d{2}-\d{2})\.sql\.gz$/;

export const DAILY_RETENTION = 7;
export const WEEKLY_RETENTION = 4;

function isoWeekKey(dateStamp: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStamp);
  if (!match) {
    throw new Error(`некорректная дата: ${dateStamp}`);
  }
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  // ISO-8601: неделя начинается с понедельника, содержит четверг —
  // сдвигаем на четверг той же недели, чтобы год недели не путался с
  // годом даты у первых/последних дней года.
  // Сдвиг на четверг той же недели — стандартный трюк ISO-8601 для
  // корректного номера недели у дат на границе года.
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  return `${date.getUTCFullYear()}-W${weekNum}`;
}

// Ретеншн из STACK.md#бэкапы: последние 7 дампов безусловно + по одному
// самому свежему в каждой из следующих 4 отдельных ISO-недель.
export function selectKeysToDelete(keys: string[]): string[] {
  const entries = keys
    .map((key) => {
      const match = KEY_PATTERN.exec(key);
      return match ? { key, date: match[1] } : null;
    })
    .filter((entry): entry is { key: string; date: string } => entry !== null)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const keep = new Set<string>();
  for (const entry of entries.slice(0, DAILY_RETENTION)) {
    keep.add(entry.key);
  }

  const weeksSeen = new Set<string>();
  for (const entry of entries.slice(DAILY_RETENTION)) {
    if (weeksSeen.size >= WEEKLY_RETENTION) {
      break;
    }
    const week = isoWeekKey(entry.date);
    if (weeksSeen.has(week)) {
      continue;
    }
    weeksSeen.add(week);
    keep.add(entry.key);
  }

  return entries.filter((entry) => !keep.has(entry.key)).map((e) => e.key);
}
