import type { DateInput } from "#src/lib/format.ts";

const pad = (value: number) => String(value).padStart(2, "0");

const toValidDate = (value: DateInput) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
};

/** 用于 <input type="datetime-local"> 的 YYYY-MM-DDTHH:mm（本地时间）。 */
export const toDateTimeInput = (value: DateInput) => {
  const date = toValidDate(value);

  if (!date) {
    return "";
  }

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

/** datetime-local 的字符串按本地时间解析，避免 UTC 时区导致的日期漂移。 */
export const fromDateTimeInput = (value: string) => {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const date = new Date(trimmed);

  return Number.isNaN(date.getTime()) ? null : date;
};

/** 用于 <input type="date"> 的 YYYY-MM-DD（本地时间）。 */
export const toDateValue = (value: DateInput) => {
  const date = toValidDate(value);

  return date
    ? `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    : "";
};

export const fromDateValue = (value: string) => {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const date = new Date(`${trimmed}T00:00:00`);

  return Number.isNaN(date.getTime()) ? null : date;
};
