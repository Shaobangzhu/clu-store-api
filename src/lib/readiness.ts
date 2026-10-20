// Coalesce simultaneous probes and keep a hung probe from creating unbounded work.
export function boundedReadiness(probe: () => Promise<void>, timeoutMs: number) {
  let inFlight: Promise<void> | undefined;
  return async () => {
    if (!inFlight) {
      inFlight = Promise.resolve().then(probe).finally(() => { inFlight = undefined; });
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        inFlight,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error('Database probe timed out')), timeoutMs);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
}
