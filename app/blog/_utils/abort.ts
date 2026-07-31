export class BlogOperationAbortedError extends Error {
  readonly name = 'BlogOperationAbortedError';
}

function abortError(label: string, reason: unknown): BlogOperationAbortedError {
  const detail = reason instanceof Error ? reason.message : String(reason ?? 'aborted');
  return new BlogOperationAbortedError(`${label} aborted: ${detail}`);
}

export function throwIfAborted(signal: AbortSignal | undefined, label: string): void {
  if (signal?.aborted) throw abortError(label, signal.reason);
}

export function abortableSleep(
  ms: number,
  signal?: AbortSignal,
  label = 'sleep',
): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      throwIfAborted(signal, label);
    } catch (error) {
      reject(error);
      return;
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError(label, signal?.reason));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Abort the underlying operation and reject the caller at the same boundary.
 * Promise.race is retained only as the caller wake-up mechanism; unlike the old
 * helper, the operation receives the controller signal and must propagate it.
 */
export async function runWithAbortTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  label: string,
  parentSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  let rejectOnAbort: ((error: BlogOperationAbortedError) => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    rejectOnAbort = reject;
  });
  const onControllerAbort = () => {
    rejectOnAbort?.(abortError(label, controller.signal.reason));
  };
  const onParentAbort = () => controller.abort(parentSignal?.reason);

  controller.signal.addEventListener('abort', onControllerAbort, { once: true });
  parentSignal?.addEventListener('abort', onParentAbort, { once: true });
  if (parentSignal?.aborted) controller.abort(parentSignal.reason);

  const timer = setTimeout(
    () => controller.abort(new Error(`timeout after ${timeoutMs}ms`)),
    timeoutMs,
  );

  try {
    const running = Promise.resolve().then(() => {
      throwIfAborted(controller.signal, label);
      return operation(controller.signal);
    });
    return await Promise.race([running, aborted]);
  } finally {
    clearTimeout(timer);
    controller.signal.removeEventListener('abort', onControllerAbort);
    parentSignal?.removeEventListener('abort', onParentAbort);
  }
}
