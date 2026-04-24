import { createLogger } from './logger';

const log = createLogger('loggedFetch');

export async function loggedFetch(url: string, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? 'GET').toUpperCase();
  if (init?.body) {
    log.debug(`→ ${method} ${url} body: ${init.body}`);
  } else {
    log.debug(`→ ${method} ${url}`);
  }

  const r = await fetch(url, init);

  try {
    const text = await r.clone().text();
    let display: string;
    try { display = JSON.stringify(JSON.parse(text)); } catch { display = text; }
    if (!r.ok) {
      log.warn(`← ${r.status} ${display}`);
    } else {
      log.debug(`← ${r.status} ${display}`);
    }
  } catch {
    if (!r.ok) {
      log.warn(`← ${r.status}`);
    } else {
      log.debug(`← ${r.status}`);
    }
  }

  return r;
}
