import type { MiniAppResponse } from '../types/miniAppRequest.types';
import { loggedFetch } from './loggedFetch';

export async function postResponse(backendUrl: string, response: MiniAppResponse): Promise<unknown> {
  const r = await loggedFetch(`${backendUrl}/response`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${response.privyToken}`,
    },
    body: JSON.stringify(response),
  });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}
