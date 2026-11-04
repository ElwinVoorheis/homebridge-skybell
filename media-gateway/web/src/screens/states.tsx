/** Shared loading and error states (FR-12). */
export function Loading({ label }: { label: string }) {
  return (
    <p role="status" className="muted">
      {label}
    </p>
  );
}

export function ErrorMessage({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="tile">
      <p role="alert" className="error">
        {message}
      </p>
      <button type="button" className="button" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong';
}
