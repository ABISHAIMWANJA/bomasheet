import { config } from './config';

/**
 * One BomaSheet API caller, scoped to a single user's personal access token.
 *
 * Deliberately does not reuse @teable/openapi's client: that package's axios
 * instance is a module-level singleton with a relative baseURL, built for a
 * single browser session. This bot serves many Telegram users concurrently,
 * each with a different token -- a shared client with mutable default headers
 * would race under concurrency and could leak one user's token onto another
 * user's in-flight request. Each call here builds its own request instead.
 */
export class BomaSheetClient {
  constructor(private readonly personalAccessToken: string) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${config.bomasheetOrigin}/api${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.personalAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`BomaSheet API ${method} ${path} failed (${res.status}): ${text}`);
    }
    return (await res.json()) as T;
  }

  /** Validates the token and identifies whose it is, for /connect. */
  whoAmI() {
    return this.request<{ id: string; name: string; email: string }>('GET', '/auth/user/me');
  }

  listBases() {
    return this.request<{ id: string; name: string; spaceId: string }[]>(
      'GET',
      '/base/access/all'
    );
  }

  listTables(baseId: string) {
    return this.request<{ id: string; name: string }[]>(
      'GET',
      `/base/${encodeURIComponent(baseId)}/table`
    );
  }

  listFields(tableId: string) {
    return this.request<{ id: string; name: string; type: string }[]>(
      'GET',
      `/table/${encodeURIComponent(tableId)}/field`
    );
  }

  listRecords(tableId: string, take = 20) {
    return this.request<{ records: { id: string; fields: Record<string, unknown> }[] }>(
      'GET',
      `/table/${encodeURIComponent(tableId)}/record?take=${take}&fieldKeyType=name`
    );
  }

  createRecord(tableId: string, fields: Record<string, unknown>) {
    return this.request<{ records: { id: string; fields: Record<string, unknown> }[] }>(
      'POST',
      `/table/${encodeURIComponent(tableId)}/record`,
      { fieldKeyType: 'name', typecast: true, records: [{ fields }] }
    );
  }

  updateRecord(tableId: string, recordId: string, fields: Record<string, unknown>) {
    return this.request<{ id: string; fields: Record<string, unknown> }>(
      'PATCH',
      `/table/${encodeURIComponent(tableId)}/record/${encodeURIComponent(recordId)}`,
      { fieldKeyType: 'name', typecast: true, record: { fields } }
    );
  }
}
