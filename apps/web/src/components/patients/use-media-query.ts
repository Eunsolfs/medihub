import { useCallback, useSyncExternalStore } from "react";

/**
 * 订阅一个媒体查询。用来在抽屉上按断点切换方向：
 * 桌面从右侧滑出，移动端从底部全高展开。
 */
export const useMediaQuery = (query: string) => {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onStoreChange);

      return () => {
        list.removeEventListener("change", onStoreChange);
      };
    },
    [query]
  );

  const getSnapshot = useCallback(
    () => window.matchMedia(query).matches,
    [query]
  );

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
};
