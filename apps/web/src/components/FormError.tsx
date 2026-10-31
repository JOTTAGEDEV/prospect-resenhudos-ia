import { useEffect, useRef } from "react";
import { ApiError } from "../lib/api";
export function FormError({ error }: { error: Error | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) ref.current?.focus();
  }, [error]);
  if (!error) return null;
  return (
    <div ref={ref} tabIndex={-1} role="alert" className="error-text">
      <strong>{error.message}</strong>
      {error instanceof ApiError &&
        error.details?.map((detail, index) => (
          <p key={index}>
            <button
              type="button"
              className="underline"
              onClick={() =>
                document
                  .querySelector<HTMLElement>(
                    `[name="${CSS.escape(detail.field)}"]`,
                  )
                  ?.focus()
              }
            >
              {detail.field}: {detail.message}
            </button>
          </p>
        ))}
    </div>
  );
}
