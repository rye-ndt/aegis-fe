import type { MiniAppResponse } from '../types/miniAppRequest.types';
import { resilientFetch } from './resilientFetch';

export async function postResponse(backendUrl: string, response: MiniAppResponse): Promise<unknown> {
  const r = await resilientFetch(`${backendUrl}/response`, {
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
