/* ==================================================================
   Administrator · real-time monitoring of Render, Supabase and the site.
   Every 2 seconds the browser asks the server for /api/monitoring:
   - Render server: CPU, memory, uptime, where it runs (Render service,
     instance and commit, or this machine) and the latest deploy when the
     server has a RENDER_API_KEY.
   - Supabase: the server times a read from Supabase and reports sync state.
   - Site: how long the round trip browser → site → browser took, plus
     API traffic and errors in the last minute.
   ================================================================== */
const AdminMonitoring = (() => {
  const POLL_MS = 2000, WINDOW_MS = 60000, GLIDE_MS = 900;
  // Samples are { t, v } in performance.now() time; drawn continuously by draw().
  const history = { server: [], supabase: [], site: [] };
  const view = { server: { max: 1 }, supabase: { max: 1 }, site: { max: 1 } };
  let lastTickAt = 0, frame = 0;
  let lastPoll = 0, busy = false, lastOk = null, lastSnapshot = null;
  const $ = id => document.getElementById(id);
  const set = (id, text) => { const el = $(id); if (el) el.textContent = text; };
  const tone = (id, value) => { const el = $(id); if (el) el.dataset.tone = value; };

  function duration(sec) {
    const d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60);
    return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : m ? `${m}m ${sec % 60}s` : `${sec}s`;
  }
  function ago(iso) {
    if (!iso) return 'never';
    const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
    return s < 5 ? 'just now' : s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`;
  }
  /* Smooth "mountain" chart: a curved line through the samples (monotone cubic,
     so peaks never overshoot) over an area that fades to transparent. The SVG's
     own content is rebuilt; the line and area keep their ids. */
  function smooth(pts) {
    if (pts.length < 2) return '';
    const n = pts.length, d = [], m = [];
    for (let i = 0; i < n - 1; i++) d.push((pts[i + 1][1] - pts[i][1]) / (pts[i + 1][0] - pts[i][0]));
    m.push(d[0]); for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2); m.push(d[n - 2]);
    let path = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < n - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], h = (x1 - x0) / 3;
      path += ` C${(x0 + h).toFixed(1)},${(y0 + m[i] * h).toFixed(1)} ${(x1 - h).toFixed(1)},${(y1 - m[i + 1] * h).toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
    }
    return path;
  }
  // New reading: stored with its arrival time; the drawing loop glides it in.
  function chart(name, value) {
    const list = history[name], now = performance.now();
    list.push({ t: now, v: Number.isFinite(value) ? Math.max(0, value) : 0 });
    while (list.length > 2 && list[1].t < now - WINDOW_MS - POLL_MS * 2) list.shift();
    if (!frame && typeof requestAnimationFrame === 'function') frame = requestAnimationFrame(draw);
  }
  function build(svg, name) {
    const gid = `${name}Fade`;
    svg.innerHTML = `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".55"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>`
      + `<path id="${name}Area" class="ad-mtn-area" fill="url(#${gid})"/><path id="${name}Line" class="ad-mtn-line" fill="none"/><circle class="ad-mtn-dot" r="3.2"/>`;
  }
  const ease = x => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
  /* One frame for every chart: time runs right to left across the last 60 s.
     The newest reading eases in from the previous value, the line keeps
     extending to "now" between readings, and the vertical scale eases too.
     While monitoring is stopped (no tick for 1.5 s) the picture holds still. */
  function draw() {
    frame = 0;
    const real = performance.now(), now = lastTickAt && real - lastTickAt > 1500 ? lastTickAt + 1000 : real;
    let busyCharts = false;
    for (const name of Object.keys(history)) {
      const list = history[name], svg = $(`${name}Chart`) || $(`${name}Line`)?.ownerSVGElement;
      if (!svg || !list.length) continue;
      if (!svg.querySelector('.ad-mtn-dot')) build(svg, name);
      if (svg.getClientRects && !svg.getClientRects().length) { busyCharts = true; continue; } // dashboard hidden
      const H = Number(svg.viewBox?.baseVal?.height) || 64, W = 300, start = now - WINDOW_MS;
      const last = list[list.length - 1], prev = list[list.length - 2] || last;
      const tipValue = prev.v + (last.v - prev.v) * ease((now - last.t) / GLIDE_MS);
      const target = Math.max(1, ...list.filter(p => p.t >= start - POLL_MS).map(p => p.v)) * 1.3, v = view[name];
      v.max += (target - v.max) * 0.06;
      const y = val => (H - 2) - Math.min(val, v.max) / v.max * (H - 8), x = t => (t - start) / WINDOW_MS * W;
      const pts = list.slice(0, -1).map(p => [x(p.t), y(p.v)]);
      pts.push([x(last.t + Math.min(GLIDE_MS, now - last.t)), y(tipValue)]);
      if (now > last.t + GLIDE_MS) pts.push([x(now), y(last.v)]);
      if (pts.length === 1) pts.unshift([x(start), pts[0][1]]);
      const line = smooth(pts), tip = pts[pts.length - 1], first = pts[0][0];
      svg.querySelector(`#${name}Line`)?.setAttribute('d', line);
      svg.querySelector(`#${name}Area`)?.setAttribute('d', `${line} L${tip[0].toFixed(1)},${H} L${first.toFixed(1)},${H} Z`);
      const dot = svg.querySelector('.ad-mtn-dot'); dot?.setAttribute('cx', tip[0].toFixed(1)); dot?.setAttribute('cy', tip[1].toFixed(1));
      busyCharts = true;
    }
    if (busyCharts && typeof requestAnimationFrame === 'function') frame = requestAnimationFrame(draw);
  }
  const ms = v => v == null ? '—' : v < 10 ? `${v.toFixed(1)} ms` : `${Math.round(v)} ms`;

  function render(data, roundTrip) {
    lastSnapshot = data; lastOk = new Date();
    const { server, render: host, supabase: db } = data;
    // Render server card
    set('metricServer', `${server.cpuPercent.toFixed(1)}% CPU`);
    const where = host.detected
      ? `Render · ${host.serviceName || 'web service'}${host.commit ? ` · ${host.commit}` : ''}${host.deploy?.ok ? ` · deploy ${host.deploy.status}` : ''}`
      : 'Running on this computer (not on Render)';
    set('serverWhere', where);
    set('serverMemory', `Memory ${server.memoryMb} MB`);
    set('serverUptime', `Up ${duration(server.uptimeSec)}`);
    tone('serverCard', server.errorsLastMinute ? 'warn' : 'ok');
    chart('server', server.cpuPercent);
    // Supabase card
    if (!db.enabled) {
      set('metricSupabase', 'Off'); set('supabaseWhere', 'Supabase is not configured on this server');
      set('supabaseSync', 'Data stays in SQLite only'); set('supabaseQueue', '—'); tone('supabaseCard', 'warn'); chart('supabase', 0);
    } else if (!db.ok) {
      set('metricSupabase', 'Error'); set('supabaseWhere', db.error || 'Supabase did not answer');
      set('supabaseSync', `Last sync ${ago(db.lastSyncedAt)}`); set('supabaseQueue', `${db.pendingWrites} waiting`); tone('supabaseCard', 'down'); chart('supabase', 0);
    } else {
      set('metricSupabase', ms(db.latencyMs)); set('supabaseWhere', db.tables ? `Connected · ${db.tables} tables · ${Math.max(0, db.collections - db.tables)} settings` : `Connected · ${db.collections} collections`);
      set('supabaseSync', db.replicationHealthy ? `Last sync ${ago(db.lastSyncedAt)}` : `Sync error: ${db.replicationError}`);
      set('supabaseQueue', db.pendingWrites ? `${db.pendingWrites} writes waiting` : 'Up to date');
      tone('supabaseCard', db.replicationHealthy ? 'ok' : 'warn'); chart('supabase', db.latencyMs);
    }
    // Site card
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    set('metricSite', ms(roundTrip));
    set('siteWhere', `Browser ↔ site round trip${connection?.effectiveType ? ` · ${connection.effectiveType.toUpperCase()}` : ''}`);
    set('siteTraffic', `${server.requestsLastMinute} requests/min · avg ${ms(server.avgResponseMs)}`);
    set('siteErrors', server.errorsLastMinute ? `${server.errorsLastMinute} errors` : 'No errors');
    tone('siteCard', server.errorsLastMinute ? 'warn' : 'ok'); chart('site', roundTrip);
    // Status row
    set('statusSite', navigator.onLine === false ? 'Offline' : 'Online'); tone('statusSiteItem', navigator.onLine === false ? 'down' : 'ok');
    set('statusServer', host.detected ? 'Running on Render' : 'Running locally'); tone('statusServerItem', 'ok');
    set('statusSupabase', !db.enabled ? 'Not configured' : db.ok ? `Connected · ${ms(db.latencyMs)}` : 'Error'); tone('statusSupabaseItem', !db.enabled ? 'warn' : db.ok ? 'ok' : 'down');
  }

  function renderDown(message) {
    lastSnapshot = null;
    ['metricServer', 'metricSupabase', 'metricSite'].forEach(id => set(id, '—'));
    set('serverWhere', message); set('supabaseWhere', 'Waiting for the server'); set('siteWhere', message);
    ['serverCard', 'supabaseCard', 'siteCard'].forEach(id => tone(id, 'down'));
    ['server', 'supabase', 'site'].forEach(name => chart(name, 0));
    set('statusSite', navigator.onLine === false ? 'Offline' : 'Online'); tone('statusSiteItem', navigator.onLine === false ? 'down' : 'ok');
    set('statusServer', 'Unreachable'); tone('statusServerItem', 'down');
    set('statusSupabase', 'Unknown'); tone('statusSupabaseItem', 'warn');
  }

  async function poll() {
    if (busy) return; busy = true;
    const token = (() => { try { return sessionStorage.getItem('serverSessionToken'); } catch (_) { return null; } })();
    if (location.protocol === 'file:' || typeof fetch !== 'function') { renderDown('Open the app through the server to see live metrics'); busy = false; return; }
    const started = performance.now();
    try {
      const response = await fetch('/api/monitoring', { cache: 'no-store', headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const roundTrip = performance.now() - started;
      if (response.status === 401 || response.status === 403) throw new Error('Sign in again to see server metrics');
      if (!response.ok) throw new Error(`Server answered ${response.status}`);
      render(await response.json(), roundTrip);
    } catch (error) {
      renderDown(error.message === 'Failed to fetch' ? 'The server is not answering' : error.message);
    } finally { busy = false; }
  }

  // Called every second by the dashboard timer: clock text each second, a poll every 2 s.
  function tick() {
    lastTickAt = performance.now();
    if (Date.now() - lastPoll >= POLL_MS) { lastPoll = Date.now(); poll(); }
    set('statusChecked', lastOk ? `${new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(lastOk)}` : '—');
    if (lastSnapshot) set('supabaseSync', lastSnapshot.supabase.enabled && lastSnapshot.supabase.ok && lastSnapshot.supabase.replicationHealthy ? `Last sync ${ago(lastSnapshot.supabase.lastSyncedAt)}` : $('supabaseSync')?.textContent || '');
  }
  function reset() {
    Object.values(history).forEach(v => v.splice(0));
    Object.keys(view).forEach(name => { view[name].max = 1; const svg = $(`${name}Chart`); if (svg) svg.innerHTML = ''; });
    lastPoll = 0;
  }
  return { tick, reset, poll };
})();
if (typeof window !== 'undefined') window.AdminMonitoring = AdminMonitoring;
