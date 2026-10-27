/**
 * 全局「忙碌任务」计数：上传/覆盖保存、下载等长任务进行中时，
 * 空闲登出必须暂停，避免传了一半被踢下线。
 */
let busyTasks = 0;

export const beginBusyTask = () => {
  busyTasks += 1;
};

export const endBusyTask = () => {
  busyTasks = Math.max(0, busyTasks - 1);
};

export const isBusy = () => busyTasks > 0;

/** 给上传/下载这类一进一出的任务包一层，异常也会释放计数。 */
export const withBusyTask = async <T>(task: () => Promise<T>): Promise<T> => {
  beginBusyTask();

  try {
    return await task();
  } finally {
    endBusyTask();
  }
};
