import type { Pool } from "pg";

export interface PoolErrorSummary {
  message: string;
  code?: string;
}

/** pg removes failed idle connections itself; handling the event prevents a process crash. */
export function handleIdlePoolErrors(
  pool: Pool,
  report: (error: PoolErrorSummary) => void,
): void {
  pool.on("error", (error: Error & { code?: string }) => {
    // Never log the pool/client: they can contain database credentials.
    report({ message: error.message, code: error.code });
  });
}