export type ArchiveFrequency = "daily" | "weekly" | "monthly";

export interface ScheduleTiming {
  dayOfMonth: number;
  frequency: ArchiveFrequency;
  hour: number;
  weekday: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 计算下一次执行时间：在本时区按「整点」触发。
 * - daily：每天 hour:00
 * - weekly：每周 weekday（1=周一…7=周日）hour:00
 * - monthly：每月 dayOfMonth（1-28）hour:00
 */
export const computeNextRun = (
  timing: ScheduleTiming,
  from: Date = new Date()
): Date => {
  const hour = Math.min(23, Math.max(0, Math.trunc(timing.hour)));

  for (let offset = 0; offset < 400; offset += 1) {
    const candidate = new Date(from);
    candidate.setDate(from.getDate() + offset);
    candidate.setHours(hour, 0, 0, 0);

    if (candidate.getTime() <= from.getTime()) {
      continue;
    }

    if (timing.frequency === "daily") {
      return candidate;
    }

    if (timing.frequency === "weekly") {
      const jsDay = timing.weekday === 7 ? 0 : timing.weekday;

      if (candidate.getDay() === jsDay) {
        return candidate;
      }

      continue;
    }

    const day = Math.min(28, Math.max(1, Math.trunc(timing.dayOfMonth)));

    if (candidate.getDate() === day) {
      return candidate;
    }
  }

  return new Date(from.getTime() + DAY_MS);
};

export const describeSchedule = (timing: ScheduleTiming) => {
  const pad = (value: number) => String(value).padStart(2, "0");

  if (timing.frequency === "daily") {
    return `每天 ${pad(timing.hour)}:00`;
  }

  if (timing.frequency === "weekly") {
    const names = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
    const jsDay = timing.weekday === 7 ? 0 : timing.weekday;

    return `每周${names[jsDay]?.replace(/^周/u, "")} ${pad(timing.hour)}:00`;
  }

  return `每月 ${timing.dayOfMonth} 日 ${pad(timing.hour)}:00`;
};
