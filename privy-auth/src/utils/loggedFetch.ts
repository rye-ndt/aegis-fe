export async function loggedFetch(url: string, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const body = init?.body;
  if (body) {
    console.log(`[API] → ${method} ${url}\n[API] body: ${body}`);
  } else {
    console.log(`[API] → ${method} ${url}`);
  }

  const r = await fetch(url, init);

  try {
    const text = await r.clone().text();
    let display: string;
    try { display = JSON.stringify(JSON.parse(text)); } catch { display = text; }
    console.log(`[API] ← ${r.status} ${display}`);
  } catch {
    console.log(`[API] ← ${r.status}`);
  }

  return r;
}
