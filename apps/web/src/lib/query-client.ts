import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export const createQueryClient = () => {
  const queryClient: QueryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // 同一页面的多次挂载（侧栏切换、返回）不重复请求，减少加载闪烁。
        gcTime: 10 * 60 * 1000,
        refetchOnWindowFocus: false,
        staleTime: 15_000,
      },
    },
    queryCache: new QueryCache({
      onError: (error) => {
        toast.error(error.message, {
          action: {
            label: "重试",
            onClick: () => {
              void queryClient.invalidateQueries();
            },
          },
        });
      },
    }),
    mutationCache: new MutationCache({
      onError: (error) => {
        toast.error(error.message);
      },
    }),
  });

  return queryClient;
};
