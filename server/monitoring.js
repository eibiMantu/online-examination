'use strict';
/* Live monitoring snapshot for the Administrator dashboard.
   - server: the Node process (on Render or local): uptime, memory, CPU,
     event-loop delay, API requests and response times in the last minute.
   - render: Render's own environment (service, instance, commit) and, when
     RENDER_API_KEY is set, the latest deploy status from the Render API.
   - supabase: a timed read from Supabase plus replication state.
   - sqlite: size of the local working copy. */
const fs = require('fs');
const os = require('os');

function createMonitor({ store, env = process.env, dbFile, fetchImpl = globalThis.fetch }) {
  const startedAt = new Date();
  const requests = []; // { at, ms, status } for the last minute
  let lastCpu = process.cpuUsage(), lastCpuAt = process.hrtime.bigint();
  let supabaseCache = null, supabaseAt = 0, renderCache = null, renderAt = 0;

  function track(status, ms) {
    const now = Date.now();
    requests.push({ at: now, ms, status });
    while (requests.length && now - requests[0].at > 60000) requests.shift();
  }

  function cpuPercent() {
    const now = process.hrtime.bigint(), usage = process.cpuUsage(lastCpu);
    const elapsedUs = Number(now - lastCpuAt) / 1000;
    lastCpu = process.cpuUsage(); lastCpuAt = now;
    return elapsedUs > 0 ? Math.min(100, (usage.user + usage.system) / elapsedUs * 100) : 0;
  }

  function eventLoopDelay() {
    return new Promise(resolve => { const started = process.hrtime.bigint(); setImmediate(() => resolve(Number(process.hrtime.bigint() - started) / 1e6)); });
  }

  let supabaseRefresh = null;
  async function refreshSupabase() {
    const ping = typeof store.ping === 'function' ? await store.ping() : { enabled: false };
    supabaseCache = { ...ping, checkedAt: new Date().toISOString() };
    supabaseAt = Date.now();
  }
  async function supabase() {
    // One ping every 3 seconds at most, however many admins are watching. After the
    // first ping the latest result is returned at once and refreshed in the
    // background, so the Supabase round trip never slows (or skews) the site timing.
    if (!supabaseCache) await refreshSupabase();
    else if (Date.now() - supabaseAt >= 3000 && !supabaseRefresh) supabaseRefresh = refreshSupabase().finally(() => { supabaseRefresh = null; });
    const status = typeof store.status === 'function' ? store.status() : {};
    return { ...supabaseCache, lastSyncedAt: status.lastSyncedAt || null, replicationHealthy: status.healthy !== false, pendingWrites: status.pendingWrites || 0, replicationError: status.error || null };
  }

  async function renderDeploy() {
    const key = env.RENDER_API_KEY, service = env.RENDER_SERVICE_ID;
    if (!key || !service || !fetchImpl) return null;
    if (renderCache && Date.now() - renderAt < 60000) return renderCache;
    try {
      const response = await fetchImpl(`https://api.render.com/v1/services/${encodeURIComponent(service)}/deploys?limit=1`, { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' } });
      if (!response.ok) throw new Error(`Render API returned ${response.status}`);
      const rows = await response.json(), deploy = rows?.[0]?.deploy || rows?.[0] || {};
      renderCache = { ok: true, status: deploy.status || 'unknown', createdAt: deploy.createdAt || null, finishedAt: deploy.finishedAt || null, commit: deploy.commit?.id?.slice(0, 7) || null, message: deploy.commit?.message?.split('\n')[0] || null };
    } catch (error) {
      renderCache = { ok: false, error: error.message };
    }
    renderAt = Date.now();
    return renderCache;
  }

  async function snapshot() {
    const now = Date.now(), recent = requests.filter(r => now - r.at <= 60000);
    const memory = process.memoryUsage();
    let sqliteBytes = null; try { sqliteBytes = fs.statSync(dbFile).size; } catch (_) {}
    const [loopMs, db, deploy] = await Promise.all([eventLoopDelay(), supabase(), renderDeploy()]);
    return {
      at: new Date().toISOString(),
      server: {
        host: env.RENDER ? 'render' : 'local',
        startedAt: startedAt.toISOString(),
        uptimeSec: Math.round(process.uptime()),
        memoryMb: Math.round(memory.rss / 1048576),
        heapMb: Math.round(memory.heapUsed / 1048576),
        systemMemoryMb: Math.round(os.totalmem() / 1048576),
        cpuPercent: Math.round(cpuPercent() * 10) / 10,
        eventLoopMs: Math.round(loopMs * 100) / 100,
        node: process.version,
        requestsLastMinute: recent.length,
        errorsLastMinute: recent.filter(r => r.status >= 500).length,
        avgResponseMs: recent.length ? Math.round(recent.reduce((s, r) => s + r.ms, 0) / recent.length * 10) / 10 : 0
      },
      render: {
        detected: Boolean(env.RENDER),
        serviceName: env.RENDER_SERVICE_NAME || null,
        serviceId: env.RENDER_SERVICE_ID || null,
        instanceId: env.RENDER_INSTANCE_ID || null,
        url: env.RENDER_EXTERNAL_URL || null,
        branch: env.RENDER_GIT_BRANCH || null,
        commit: env.RENDER_GIT_COMMIT ? env.RENDER_GIT_COMMIT.slice(0, 7) : null,
        deploy
      },
      supabase: db,
      sqlite: { bytes: sqliteBytes }
    };
  }

  return { track, snapshot };
}

module.exports = { createMonitor };
