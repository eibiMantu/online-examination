const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openDatabase } = require('../server/database');
const { createSupabaseReplicatedStore } = require('../server/supabase-replica');

const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'neu-supabase-test-'));
const remote = new Map([['users', [{ username:'remote-admin', role:'admin' }]]]);
const fakeFetch = async (url, init = {}) => {
  const method = init.method || 'GET';
  if (method === 'GET') {
    return new Response(JSON.stringify([...remote].map(([collection_key, value_json]) => ({ collection_key, value_json, updated_at:new Date().toISOString() }))), { status:200 });
  }
  if (method === 'POST') {
    for (const row of JSON.parse(init.body)) remote.set(row.collection_key, row.value_json);
    return new Response(null, { status:204 });
  }
  if (method === 'DELETE') {
    const key = decodeURIComponent(new URL(url).searchParams.get('collection_key').replace(/^eq\./, ''));
    remote.delete(key);
    return new Response(null, { status:204 });
  }
  return new Response('unsupported', { status:405 });
};

(async () => {
  const local = openDatabase(path.join(folder, 'cache.sqlite'));
  const store = createSupabaseReplicatedStore(local, { url:'https://project.supabase.co', serviceKey:'server-secret', fetchImpl:fakeFetch });
  const hydration = await store.hydrate();
  assert.equal(hydration.hydrated, 1);
  assert.equal(store.read('users')[0].username, 'remote-admin', 'Supabase hydrates the SQLite cache before startup');

  store.write('subjects', [{ code:'CHC1101' }]);
  store.append('subjects', { code:'CCS1201' });
  await store.flush();
  assert.deepEqual(remote.get('subjects'), [{ code:'CHC1101' }, { code:'CCS1201' }], 'writes and appends replicate to Supabase');

  store.delete('subjects');
  await store.flush();
  assert.equal(remote.has('subjects'), false, 'deletions replicate to Supabase');
  assert.deepEqual(store.status(), { enabled:true, provider:'supabase', lastSyncedAt:store.status().lastSyncedAt, healthy:true, pendingWrites:0, error:null, following:{ active:false, lastPollAt:null, reloads:0, error:null } });
  store.close();

  const fallback = createSupabaseReplicatedStore(openDatabase(path.join(folder, 'local.sqlite')));
  assert.equal((await fallback.hydrate()).enabled, false, 'SQLite remains available without cloud credentials');
  fallback.write('users', []);
  assert.deepEqual(fallback.read('users'), [], 'local fallback remains synchronous');
  fallback.close();
  console.log('✅ Supabase hydration, replication, deletion, and SQLite fallback pass');
})().catch(error => { console.error(error); process.exitCode = 1; });
