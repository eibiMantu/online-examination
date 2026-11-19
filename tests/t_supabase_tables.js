'use strict';
// Relational Supabase layout: one table per collection, row-level sync, lossless hydration.
const assert = require('assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { openDatabase } = require('../server/database');
const { createSupabaseReplicatedStore } = require('../server/supabase-replica');
const { TABLES, rowsFor, createTableSql } = require('../server/supabase-tables');

/* A tiny in-memory PostgREST: tables of rows keyed by id (or collection_key).
   Like the real triggers, every write bumps the collection's sync_versions row. */
function fakeSupabase() {
  const tables = new Map(), calls = [];
  const collectionOf = new Map(Object.entries(TABLES).map(([collection, { table }]) => [table, collection]));
  const table = name => { if (!tables.has(name)) tables.set(name, new Map()); return tables.get(name); };
  const bump = key => { const v = table('sync_versions'); v.set(key, { collection_key: key, version: (v.get(key)?.version || 0) + 1 }); };
  const unquote = list => decodeURIComponent(list).match(/"((?:[^"\\]|\\.)*)"/g).map(s => s.slice(1, -1).replace(/\\(.)/g, '$1'));
  async function fetchImpl(url, init = {}) {
    const u = new URL(url), name = u.pathname.split('/').pop(), method = init.method || 'GET', rows = table(name);
    calls.push({ method, name, size: init.body ? JSON.parse(init.body).length : 0 });
    const keyOf = r => r.id ?? r.collection_key;
    const ok = (body, status = 200) => ({ ok: true, status, text: async () => body === null ? '' : JSON.stringify(body) });
    if (method === 'POST') {
      const body = JSON.parse(init.body);
      for (const r of body) rows.set(keyOf(r), { ...(rows.get(keyOf(r)) || {}), ...r });
      if (name === 'app_collections') body.forEach(r => bump(r.collection_key)); else if (collectionOf.has(name)) bump(collectionOf.get(name));
      return ok(null, 201);
    }
    if (method === 'DELETE') {
      const idIn = u.searchParams.get('id'), ck = u.searchParams.get('collection_key');
      if (idIn && idIn.startsWith('in.(')) unquote(idIn.slice(4, -1)).forEach(id => rows.delete(id));
      else if (idIn === 'not.is.null') rows.clear();
      else if (ck) { rows.delete(ck.replace(/^eq\./, '')); bump(ck.replace(/^eq\./, '')); }
      if (collectionOf.has(name)) bump(collectionOf.get(name));
      return ok(null, 204);
    }
    let list = [...rows.values()];
    const ckFilter = u.searchParams.get('collection_key');
    if (ckFilter && ckFilter.startsWith('eq.')) list = list.filter(r => r.collection_key === ckFilter.slice(3));
    if ((u.searchParams.get('order') || '').startsWith('position')) list.sort((a, b) => a.position - b.position || String(a.id).localeCompare(String(b.id)));
    const offset = Number(u.searchParams.get('offset') || 0), limit = Number(u.searchParams.get('limit') || 1e9);
    return ok(list.slice(offset, offset + limit));
  }
  return { fetchImpl, tables, calls, table };
}

const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'neu-sb-tables-'));
(async () => {
  // 1) SQL is generated for every mapped collection.
  const sql = createTableSql();
  for (const { table } of Object.values(TABLES)) assert.ok(sql.includes(`create table if not exists public.${table} (`), `SQL creates ${table}`);
  console.log(`✅ migration SQL defines ${Object.keys(TABLES).length} tables with RLS`);

  // 2) Rows: typed columns, full record in data, unique ids even for duplicates / missing keys.
  const rows = rowsFor('exams', [{ id: 'E1', title: 'Quiz', subjectCode: 'CS1', date: '2026-09-07' }, { id: 'E1', title: 'Copy' }, { title: 'No id' }]);
  assert.deepEqual(rows.map(r => r.id), ['E1', 'E1#2', '#2']);
  assert.equal(rows[0].subject_code, 'CS1'); assert.equal(rows[0].data.title, 'Quiz');
  console.log('✅ rows carry typed columns, the full record, and never collide on id');

  // 3) Seed + hydrate round-trip is exact, including order and >1000 rows (paging).
  const sb = fakeSupabase();
  const source = openDatabase(path.join(folder, 'source.sqlite'));
  const enrollments = Array.from({ length: 2345 }, (_, i) => ({ id: `ENR-${i}`, studentId: `S${i % 50}`, sectionId: 'SEC', offeringId: `OFR-${i % 7}`, subjectCode: 'CS1' }));
  const settings = { semester: 'First Semester', status: 'active' };
  const writer = createSupabaseReplicatedStore(source, { url: 'https://example.supabase.co', serviceKey: 'k', fetchImpl: sb.fetchImpl, relational: true });
  writer.write('studentEnrollments', enrollments);
  writer.write('students', [{ id: 'S2', first: 'B', sections: ['SEC'] }, { id: 'S1', first: 'A', sections: [] }]);
  writer.write('systemSettings', settings);
  assert.ok(await writer.flush());
  assert.equal(sb.table('student_enrollments').size, 2345);
  assert.equal(sb.table('students').get('S2').first_name, 'B');
  assert.deepEqual(sb.table('app_collections').get('systemSettings').value_json, settings);
  assert.ok(!sb.table('app_collections').has('studentEnrollments'), 'mapped collections are not stored as JSON rows');
  const target = openDatabase(path.join(folder, 'target.sqlite'));
  const reader = createSupabaseReplicatedStore(target, { url: 'https://example.supabase.co', serviceKey: 'k', fetchImpl: sb.fetchImpl, relational: true });
  await reader.hydrate();
  assert.deepEqual(target.read('studentEnrollments'), enrollments);
  assert.deepEqual(target.read('students').map(s => s.id), ['S2', 'S1'], 'list order survives');
  assert.deepEqual(target.read('systemSettings'), settings);
  console.log('✅ hydration rebuilds every list exactly, in order, across pages of 1000');

  // 4) Editing one record sends one row; removing a record deletes its row.
  sb.calls.length = 0;
  const edited = enrollments.map(e => e.id === 'ENR-5' ? { ...e, sectionId: 'SEC-2' } : e);
  writer.write('studentEnrollments', edited);
  await writer.flush();
  const posts = sb.calls.filter(c => c.method === 'POST');
  assert.equal(posts.reduce((n, c) => n + c.size, 0), 1, 'only the changed record is uploaded');
  assert.equal(sb.table('student_enrollments').get('ENR-5').section_id, 'SEC-2');
  writer.write('studentEnrollments', edited.filter(e => e.id !== 'ENR-9'));
  await writer.flush();
  assert.ok(!sb.table('student_enrollments').has('ENR-9'));
  assert.equal(sb.table('student_enrollments').size, 2344);
  console.log('✅ a one-record edit uploads one row; removed records are deleted');

  // 5) Appends and collection deletes.
  writer.append('applicationAuditLog', { id: 'A1', at: '2026-11-19T00:00:00Z', action: 'login', actorId: 'admin' });
  await writer.flush();
  assert.equal(sb.table('audit_log').get('A1').action, 'login');
  writer.delete('students'); await writer.flush();
  assert.equal(sb.table('students').size, 0);
  console.log('✅ appends add rows; deleting a collection empties its table');

  // 6) Before a table is filled, hydration still uses the old JSON row.
  const legacy = fakeSupabase();
  legacy.table('app_collections').set('subjects', { collection_key: 'subjects', value_json: [{ code: 'CS1', name: 'Intro' }] });
  const fresh = openDatabase(path.join(folder, 'fresh.sqlite'));
  await createSupabaseReplicatedStore(fresh, { url: 'https://example.supabase.co', serviceKey: 'k', fetchImpl: legacy.fetchImpl, relational: true }).hydrate();
  assert.deepEqual(fresh.read('subjects'), [{ code: 'CS1', name: 'Intro' }]);
  console.log('✅ until a table has rows, the legacy app_collections JSON is used');

  // 7) A failed sync marks the collection for a full re-sync next time.
  let fail = true;
  const flaky = fakeSupabase(), flakyFetch = async (url, init) => (fail && (init?.method === 'POST') ? { ok: false, status: 500, text: async () => 'boom' } : flaky.fetchImpl(url, init));
  const local = openDatabase(path.join(folder, 'flaky.sqlite'));
  const store = createSupabaseReplicatedStore(local, { url: 'https://example.supabase.co', serviceKey: 'k', fetchImpl: flakyFetch, relational: true });
  store.write('faculty', [{ id: 'F1', first: 'A', last: 'B' }]);
  assert.equal(await store.flush(), false);
  fail = false;
  store.write('faculty', [{ id: 'F1', first: 'A', last: 'B' }, { id: 'F2', first: 'C', last: 'D' }]);
  assert.ok(await store.flush());
  assert.deepEqual([...flaky.table('faculty').keys()].sort(), ['F1', 'F2'], 'the record lost in the failed sync is recovered');
  console.log('✅ after a failed sync the next write re-sends the whole collection');

  // 8) Two server instances share one Supabase: each picks up the other's changes,
  //    concurrent edits to different records both survive, and a pending local
  //    write is never undone by a reload.
  const shared = fakeSupabase(), opts = { url: 'https://example.supabase.co', serviceKey: 'k', fetchImpl: shared.fetchImpl, relational: true };
  const dbA = openDatabase(path.join(folder, 'a.sqlite')), dbB = openDatabase(path.join(folder, 'b.sqlite'));
  const A = createSupabaseReplicatedStore(dbA, opts), B = createSupabaseReplicatedStore(dbB, opts);
  await A.hydrate(); await B.hydrate();
  A.write('students', [{ id: 'S1', first: 'Ana' }]); await A.flush();
  assert.deepEqual((await B.pollOnce()).reloaded, ['students']);
  assert.deepEqual(dbB.read('students'), [{ id: 'S1', first: 'Ana' }], 'B sees what A wrote');
  B.write('students', [{ id: 'S1', first: 'Ana' }, { id: 'S2', first: 'Ben' }]); // still on its way to Supabase
  await B.pollOnce();
  assert.equal(dbB.read('students').length, 2, 'a reload never undoes a write that is still pending');
  await B.flush();
  A.write('students', [{ id: 'S1', first: 'Ana' }, { id: 'S3', first: 'Cy' }]); // A had not seen S2 yet
  await A.flush();
  await A.pollOnce(); await B.pollOnce();
  const ids = db => db.read('students').map(s => s.id).sort();
  assert.deepEqual(ids(dbA), ['S1', 'S2', 'S3']); assert.deepEqual(ids(dbB), ['S1', 'S2', 'S3'], 'both concurrent additions survive on both instances');
  A.write('systemSettings', { status: 'active' }); await A.flush(); await B.pollOnce();
  assert.deepEqual(dbB.read('systemSettings'), { status: 'active' });
  A.delete('systemSettings'); await A.flush(); await B.pollOnce();
  assert.equal(dbB.read('systemSettings', null), null, 'deleting a settings object reaches the other instance');
  console.log('✅ two instances stay in step through sync_versions without undoing pending writes');

  // 9) Sign-in on one instance works on the other; logout on one holds on both.
  const { createAuth } = require('../server/auth');
  A.write('users', [{ username: 'u1', password: 'pass1234', role: 'student', status: 'active' }]); await A.flush(); await B.pollOnce();
  const authA = createAuth(A, { secret: 'shared' }), authB = createAuth(B, { secret: 'shared' }), stranger = createAuth(B, { secret: 'other' });
  const { token } = authA.login('u1', 'pass1234');
  assert.equal(authB.resolve(token)?.username, 'u1', 'a token from instance A is accepted by instance B');
  assert.equal(stranger.resolve(token), null, 'a server with a different secret rejects it');
  assert.equal(authB.resolve(token.slice(0, -2) + (token.endsWith('A') ? 'B' : 'A') + token.slice(-1)), null, 'a tampered token is rejected');
  authA.logout(token); await A.flush(); await B.pollOnce();
  assert.equal(authB.resolve(token), null, 'logging out on A ends the session on B');
  console.log('✅ sealed session tokens work across instances; logout and tampering are handled');

  A.close(); B.close();
  [source, target, fresh, local].forEach(db => db.close());
  fs.rmSync(folder, { recursive: true, force: true });
})().catch(error => { console.error('❌', error); process.exit(1); });
