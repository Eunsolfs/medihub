import { describe, expect, it } from "vite-plus/test";

import { computeNextRun, describeSchedule } from "#src/schedules.ts";

const at = (value: string) => new Date(value);

describe("computeNextRun", () => {
  it("daily：当天时刻已过则顺延到第二天", () => {
    const next = computeNextRun(
      { dayOfMonth: 1, frequency: "daily", hour: 3, weekday: 1 },
      at("2026-01-01T04:00:00")
    );

    expect(next.getTime()).toBe(at("2026-01-02T03:00:00").getTime());
  });

  it("weekly：从周四算到下一个周一", () => {
    const next = computeNextRun(
      { dayOfMonth: 1, frequency: "weekly", hour: 3, weekday: 1 },
      at("2026-01-01T10:00:00")
    );

    // 2026-01-01 是周四，下一个周一是 01-05。
    expect(next.getTime()).toBe(at("2026-01-05T03:00:00").getTime());
    expect(next.getDay()).toBe(1);
  });

  it("monthly：本月已过则下月同日", () => {
    const next = computeNextRun(
      { dayOfMonth: 1, frequency: "monthly", hour: 3, weekday: 1 },
      at("2026-01-15T10:00:00")
    );

    expect(next.getTime()).toBe(at("2026-02-01T03:00:00").getTime());
  });

  it("描述文案包含频率与时刻", () => {
    expect(
      describeSchedule({
        dayOfMonth: 1,
        frequency: "monthly",
        hour: 3,
        weekday: 1,
      })
    ).toContain("每月 1 日 03:00");
    expect(
      describeSchedule({
        dayOfMonth: 1,
        frequency: "daily",
        hour: 22,
        weekday: 1,
      })
    ).toContain("每天 22:00");
  });
});
