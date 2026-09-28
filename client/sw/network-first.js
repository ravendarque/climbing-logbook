import { isCacheableAsset } from "./responses.js";

export const NETWORK_TIMEOUT_MS = 3000;

const TIMED_OUT = Symbol("timed out");

export async function networkFirst({
  request,
  fetchImpl,
  matchCached,
  store,
  waitUntil,
  timeoutMs = NETWORK_TIMEOUT_MS,
}) {
  const network = fetchImpl(request).then(response => {
    if (isCacheableAsset(response)) waitUntil(store(request, response.clone()));
    return response;
  });
  let timer;
  const timedOut = new Promise(resolve => {
    timer = setTimeout(resolve, timeoutMs, TIMED_OUT);
  });

  let winner;
  try {
    winner = await Promise.race([network, timedOut]);
  } catch (err) {
    const cached = await matchCached(request);
    if (cached) return cached;
    throw err;
  } finally {
    clearTimeout(timer);
  }
  if (winner !== TIMED_OUT) return winner;

  const cached = await matchCached(request);
  if (!cached) return network;
  waitUntil(network.catch(() => {}));
  return cached;
}
