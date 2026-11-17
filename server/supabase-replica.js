'use strict';

function createSupabaseReplicatedStore(localStore, options = {}) {
  const baseUrl = String(options.url || '').replace(/\/$/, '');
  const serviceKey = String(options.serviceKey || '');
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const enabled = Boolean(baseUrl && serviceKey && fetchImpl);
  let pending = Promise.resolve();
  let lastError = null;
  let lastSyncedAt = null;

  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json'
  };

  async function request(pathname, init = {}) {
    const response = await fetchImpl(`${baseUrl}/rest/v1/${pathname}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
    if (!response.ok) throw new Error(`Supabase replication returned ${response.status}: ${await response.text()}`);
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  function enqueue(operation) {
    if (!enabled) return;
    pending = pending.then(operation).then(() => {
      lastError = null;
      lastSyncedAt = new Date().toISOString();
    }).catch(error => {
      lastError = error;
      console.error(error.message);
    });
  }

  function upsertRecords(records) {
    const rows = Object.entries(records).map(([collectionKey, value]) => ({
      collection_key: collectionKey,
      value_json: value,
      updated_at: new Date().toISOString()
    }));
    if (!rows.length) return Promise.resolve();
    return request('app_collections?on_conflict=collection_key', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(rows)
    });
  }

  const store = {
    raw: localStore.raw,
    read: localStore.read,
    all: localStore.all,
    write(key, value) {
      const result = localStore.write(key, value);
      enqueue(() => upsertRecords({ [key]: value }));
      return result;
    },
    append(key, value) {
      const items = localStore.append(key, value);
      enqueue(() => upsertRecords({ [key]: items }));
      return items;
    },
    delete(key) {
      const result = localStore.delete(key);
      enqueue(() => request(`app_collections?collection_key=eq.${encodeURIComponent(key)}`, { method: 'DELETE' }));
      return result;
    },
    migrate(records, options = {}) {
      const before = options.missingOnly ? localStore.all() : {};
      const result = localStore.migrate(records, options);
      const changed = options.missingOnly
        ? Object.fromEntries(Object.entries(records).filter(([key]) => !Object.hasOwn(before, key)))
        : records;
      enqueue(() => upsertRecords(changed));
      return result;
    },
    recordImport: localStore.recordImport,
    async hydrate() {
      if (!enabled) return { enabled: false, hydrated: 0 };
      const rows = await request('app_collections?select=collection_key,value_json,updated_at&order=collection_key');
      if (Array.isArray(rows) && rows.length) {
        const records = Object.fromEntries(rows.map(row => [row.collection_key,
          typeof row.value_json === 'string' ? JSON.parse(row.value_json) : row.value_json]));
        localStore.migrate(records);
        lastSyncedAt = new Date().toISOString();
        return { enabled: true, hydrated: rows.length };
      }
      const local = localStore.all();
      if (Object.keys(local).length) {
        enqueue(() => upsertRecords(local));
        await pending;
      }
      return { enabled: true, hydrated: 0 };
    },
    async flush() { await pending; return !lastError; },
    status() {
      return {
        enabled,
        provider: enabled ? 'supabase' : null,
        lastSyncedAt,
        healthy: !lastError,
        error: lastError ? lastError.message : null
      };
    },
    close() { localStore.close(); }
  };
  return store;
}

module.exports = { createSupabaseReplicatedStore };
