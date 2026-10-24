import { useEffect, useState } from "react";

/** 手机/平板：视口 ≤768px 或指针为粗粒度（触屏），与 Tailwind sm 断点一致。 */
const MOBILE_QUERY = "(max-width: 768px), (pointer: coarse)";

export const useIsMobile = () => {
  const [matches, setMatches] = useState(
    () => window.matchMedia(MOBILE_QUERY).matches
  );

  useEffect(() => {
    const query = window.matchMedia(MOBILE_QUERY);

    const onChange = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    query.addEventListener("change", onChange);

    return () => {
      query.removeEventListener("change", onChange);
    };
  }, []);

  return matches;
};
