import {
  QueryClient,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      "X-Requested-With": "JotageProspect",
      ...options.headers,
    },
  });
  const body = await response.json();
  if (!response.ok)
    throw new ApiError(
      response.status,
      body.error || "Não foi possível concluir a solicitação",
    );
  return body as T;
}
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15000,
      retry: (count, error) =>
        !(error instanceof ApiError && error.status < 500) && count < 1,
      refetchOnWindowFocus: true,
    },
  },
});
export function useAction<T = unknown>(onSuccess?: (value: T) => void) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      path,
      method = "POST",
      body,
    }: {
      path: string;
      method?: string;
      body?: unknown;
    }) =>
      api<T>(path, {
        method,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      }),
    onSuccess: async (value) => {
      await client.invalidateQueries();
      onSuccess?.(value);
    },
    onError: (error: Error) => toast.error(error.message),
  });
}
export const formatDate = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
