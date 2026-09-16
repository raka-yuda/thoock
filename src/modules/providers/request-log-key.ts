const PROVIDER_LOG_KEY_LIMIT = 100;

export function createHistoryLookupLogKey(
  generationJobId: string,
  providerRequestId: string,
  nonce: string,
) {
  const prefix = `history:${generationJobId.slice(0, 8)}:`;
  const suffix = `:${nonce.slice(0, 12)}`;
  const requestIdLength = Math.max(
    1,
    PROVIDER_LOG_KEY_LIMIT - prefix.length - suffix.length,
  );
  return `${prefix}${providerRequestId.slice(0, requestIdLength)}${suffix}`;
}
