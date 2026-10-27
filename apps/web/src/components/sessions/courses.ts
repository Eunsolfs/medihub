import { toDateTimeInput } from "#src/components/sessions/session-kind.ts";

/** 与后端 `learningSession.courses` 的结构对齐（时间用 ISO 字符串）。 */
export interface SessionCourse {
  id?: string;
  title: string;
  speaker?: string | null;
  startsAt?: string | null;
  note?: string | null;
}

/** 表单里的课程草稿：时间用 `<input type="datetime-local">` 的本地串。 */
export interface CourseDraft {
  key: string;
  id?: string;
  title: string;
  speaker: string;
  startsAt: string;
  note: string;
}

/** 提交给接口的课程结构：空值统一收敛成 null，时间转 ISO。 */
export interface CoursePayload {
  id?: string;
  title: string;
  speaker: string | null;
  startsAt: string | null;
  note: string | null;
}

export const createCourseDraft = (): CourseDraft => ({
  key: crypto.randomUUID(),
  note: "",
  speaker: "",
  startsAt: "",
  title: "",
});

export const toCourseDrafts = (
  courses: readonly SessionCourse[] | null | undefined
): CourseDraft[] =>
  (courses ?? []).map((course, index) => ({
    id: course.id,
    key: course.id ?? `course-${index}`,
    note: course.note ?? "",
    speaker: course.speaker ?? "",
    startsAt: toDateTimeInput(course.startsAt),
    title: course.title,
  }));

/** 课程名称必填；空行在保存时丢弃，避免用户误加的空白行入库。
 * 时间转 ISO 由调用方传入（在事件处理里做），保持本模块是纯函数。 */
export const toCoursePayloads = (
  drafts: readonly CourseDraft[],
  toIso: (value: string) => string
): CoursePayload[] =>
  drafts.flatMap((draft) => {
    if (draft.title.trim().length === 0) {
      return [];
    }

    return [
      {
        ...(draft.id ? { id: draft.id } : {}),
        note: draft.note.trim() || null,
        speaker: draft.speaker.trim() || null,
        startsAt: draft.startsAt ? toIso(draft.startsAt) : null,
        title: draft.title.trim(),
      },
    ];
  });
