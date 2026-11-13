(function () {
  'use strict';

  var KEY = 'studytracker.v1';
  var COLORS = ['#0f8b7c', '#3b6fd4', '#b5527f', '#c97a12', '#7a5bc7', '#2e8b3e', '#c4492f', '#4a7f96'];
  var TABS = [
    { id: 'today', label: 'Today' },
    { id: 'stats', label: 'Stats' },
    { id: 'subjects', label: 'Subjects' },
    { id: 'settings', label: 'Settings' }
  ];

  function svg(inner, fill) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" ' + (fill ? 'fill="currentColor"' :
      'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"') + '>' + inner + '</svg>';
  }
  var I = {
    today: svg('<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.8 2.8L16.5 9.5"/>'),
    stats: svg('<rect x="4" y="12" width="4" height="8" rx="1"/><rect x="10" y="5" width="4" height="15" rx="1"/><rect x="16" y="9" width="4" height="11" rx="1"/>', true),
    subjects: svg('<path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v14H7.5A2.5 2.5 0 0 0 5 19.5z"/><path d="M5 19.5A2.5 2.5 0 0 0 7.5 22H19v-5"/>'),
    settings: svg('<path d="M4 7h8M18 7h2M4 12h2M12 12h8M4 17h10M20 17h0"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="12" r="2.2"/><circle cx="17" cy="17" r="2.2"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    minus: svg('<path d="M5 12h14"/>'),
    flame: svg('<path d="M12 2.5c.7 3.3-1.9 5-3.4 7.2C7.3 11.6 7 13 7 14.4a5 5 0 0 0 10 0c0-2.2-1-3.7-2.1-5-.3 1.5-1 2.4-2.2 2.8.5-3.3 0-6.5-.7-9.7z"/>', true),
    play: svg('<path d="M8 5.5v13l11-6.5z"/>', true),
    pause: svg('<rect x="6.5" y="5" width="4" height="14" rx="1.2"/><rect x="13.5" y="5" width="4" height="14" rx="1.2"/>', true),
    check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
    trash: svg('<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>'),
    bell: svg('<path d="M6 17v-5.5a6 6 0 1 1 12 0V17l1.5 2h-15z"/><path d="M10 21.5h4"/>'),
    reset: svg('<path d="M4 12a8 8 0 1 0 2.6-5.9"/><path d="M4 4v4.5h4.5"/>')
  };

  var S, tab = 'today', sheetOpen = false, pendingDel = null, delTimer = null, snackTimer = null, justDone = false, lastDay;

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function key(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseKey(k) { var p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function todayKey() { return key(new Date()); }
  function addDays(k, n) { var d = parseKey(k); d.setDate(d.getDate() + n); return key(d); }
  function lastDays(n) { var out = [], t = todayKey(); for (var i = n - 1; i >= 0; i--) out.push(addDays(t, -i)); return out; }
  function fmt(min) {
    min = Math.round(min);
    var h = Math.floor(min / 60), m = min % 60;
    if (h && m) return h + 'h ' + m + 'm';
    return h ? h + 'h' : m + 'm';
  }
  function fmtShort(min) { return min >= 60 ? (Math.round(min / 6) / 10) + 'h' : Math.round(min) + 'm'; }
  function clock(ms) {
    var s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
    return pad(h) + ':' + pad(m) + ':' + pad(s % 60);
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function uid() { return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4); }
  function buzz(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} }
  function $(id) { return document.getElementById(id); }

  /* ---------- Android bridge: notifications, alarms, widget. Everything stays on the phone. ---------- */
  var NATIVE = null;
  try {
    var cap = window.Capacitor;
    if (cap && cap.isNativePlatform && cap.isNativePlatform()) NATIVE = cap.registerPlugin('StudyNative');
  } catch (e) { NATIVE = null; }
  var link = { ok: null, err: '' };
  function linkErr(e) {
    link.ok = false; link.err = String((e && e.message) || e || 'unknown error').slice(0, 120);
    if (tab === 'settings' && !sheetOpen) render();
  }
  function nat(method, args) {
    if (!NATIVE) return Promise.resolve(null);
    var p;
    try { p = Promise.resolve(NATIVE[method](args || {})); } catch (e) { linkErr(e); return Promise.resolve(null); }
    return p.then(function (r) { return r; }, function (e) { linkErr(e); return null; });
  }
  function linkText() {
    if (!NATIVE) return 'Only in the Android app';
    return link.ok === true ? 'Working' : link.ok === false ? 'Problem: ' + link.err : 'Checking\u2026';
  }
  function syncSoon() { syncData(); }
  /* Sends today's numbers to Android right away so the widget and reminders match the app. */
  function syncData() {
    if (!NATIVE) return;
    var tk = todayKey(), t = totals(), by = {};
    S.sessions.forEach(function (x) { if (x.date === tk) by[x.subject] = (by[x.subject] || 0) + x.minutes; });
    nat('syncData', {
      date: tk, target: Math.round(targetFor(tk)), total: Math.round(t[tk] || 0),
      subjects: S.subjects.map(function (b) { return { id: b.id, name: b.name, color: b.color, goal: Math.round(b.goal || 0), m: Math.round(by[b.id] || 0) }; })
    });
  }
  function syncReminders() { nat('reminders', { enabled: !!S.set.remind, times: S.set.times.slice() }); }
  function syncTimer() {
    if (!NATIVE) return;
    var T = S.timer, ms = elapsed(), sb = subj(T.subject), name = sb ? sb.name : 'Study session';
    if ((T.startedAt || ms > 0) && S.set.ongoing) {
      nat('timerNotify', { running: !!T.startedAt, startedAt: Math.round(Date.now() - ms), elapsedMs: Math.round(ms), subject: name });
    } else nat('timerClear');
    var limitAt = 0, targetAt = 0, now = Date.now();
    if (T.startedAt) {
      if (S.set.limit > 0) { var r1 = S.set.limit * 60000 - ms; if (r1 > 0) limitAt = Math.round(now + r1); }
      if (S.set.tgtAlert) {
        var tk = todayKey(), done = totals()[tk] || 0, r2 = (targetFor(tk) - done) * 60000 - ms;
        if (r2 > 0) targetAt = Math.round(now + r2);
      }
    }
    nat('timerAlerts', { limitAt: limitAt, targetAt: targetAt, subject: name, limitMin: S.set.limit });
  }
  function needNotif(then) {
    if (!NATIVE) { toast('This works in the Android app.'); return; }
    nat('requestNotifPermission').then(function (r) {
      if (r && r.granted) then(); else toast('Notifications are blocked. Allow them in Android settings.');
    });
  }
  function fmtClock12(hm) {
    var p = hm.split(':'), h = +p[0];
    return ((h + 11) % 12 + 1) + ':' + p[1] + ' ' + (h < 12 ? 'am' : 'pm');
  }

  /* ---------- state ---------- */
  function fresh() {
    return { v: 1, target: 240, dayTargets: {}, installed: todayKey(), weekStart: 6, theme: 'auto',
      subjects: [], sessions: [], timer: { subject: null, startedAt: null, accum: 0 },
      set: { remind: false, times: ['20:00'], limit: 0, tgtAlert: true, ongoing: true } };
  }
  function load() {
    try {
      var o = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (o && o.v === 1 && Array.isArray(o.sessions) && Array.isArray(o.subjects)) {
        var f = fresh();
        for (var k in f) if (o[k] == null) o[k] = f[k];
        o.set = Object.assign({}, f.set, o.set);
        return o;
      }
    } catch (e) {}
    return fresh();
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} syncSoon(); }

  function targetFor(k) { return S.dayTargets[k] != null ? S.dayTargets[k] : S.target; }
  function totals() { var t = {}; S.sessions.forEach(function (s) { t[s.date] = (t[s.date] || 0) + s.minutes; }); return t; }
  function met(t, k) { return (t[k] || 0) > 0 && t[k] >= targetFor(k); }
  function startKey() {
    var m = S.installed;
    S.sessions.forEach(function (s) { if (s.date < m) m = s.date; });
    return m;
  }
  function subj(id) { for (var i = 0; i < S.subjects.length; i++) if (S.subjects[i].id === id) return S.subjects[i]; return null; }
  function subjOf(s) { var x = subj(s.subject); return x || { id: s.subject, name: s.subjectName || 'Removed subject', color: '#7f8a88' }; }
  function streak(t) {
    var k = todayKey(), n = 0;
    if (!met(t, k)) k = addDays(k, -1);
    while (met(t, k) && n < 3650) { n++; k = addDays(k, -1); }
    return n;
  }
  function elapsed() { var T = S.timer; return T.accum + (T.startedAt ? Date.now() - T.startedAt : 0); }

  function setTarget(min) {
    min = Math.max(15, Math.min(960, min));
    var old = S.target;
    for (var i = 1; i <= 120; i++) { var k = addDays(todayKey(), -i); if (S.dayTargets[k] == null) S.dayTargets[k] = old; }
    S.target = min;
    S.dayTargets[todayKey()] = min;
    save(); render();
  }

  function addSession(date, subjectId, minutes, note) {
    var sb = subj(subjectId);
    if (S.dayTargets[date] == null) S.dayTargets[date] = S.target;
    var t = totals(), before = t[date] || 0, tg = targetFor(date);
    S.sessions.push({ id: uid(), date: date, subject: subjectId, subjectName: sb ? sb.name : '', minutes: minutes, note: note || '', ts: Date.now() });
    save();
    var crossed = date === todayKey() && before < tg && before + minutes >= tg;
    if (crossed) { justDone = true; buzz([30, 60, 30]); } else buzz(12);
    render();
    toast(crossed ? 'Daily target achieved' : 'Added ' + fmt(minutes) + (sb ? ' to ' + sb.name : ''));
  }

  function toast(msg) {
    var el = $('snack');
    el.textContent = msg; el.hidden = false;
    clearTimeout(snackTimer);
    snackTimer = setTimeout(function () { el.hidden = true; }, 2800);
  }

  /* ---------- views ---------- */
  function emptyArt() {
    return '<svg viewBox="0 0 160 120" aria-hidden="true">' +
      '<rect class="ill-b" x="26" y="86" width="112" height="20" rx="7"/><rect class="ill-c" x="36" y="64" width="94" height="20" rx="7"/>' +
      '<rect class="ill-a" x="20" y="42" width="104" height="20" rx="7"/>' +
      '<path class="ill-l" d="M34 52h40M48 74h34M44 96h44"/>' +
      '<circle cx="128" cy="30" r="16" class="ill-a"/><path class="ill-s" d="M121 30l5 5 9-10"/></svg>';
  }

  function viewToday() {
    var tk = todayKey(), t = totals(), done = t[tk] || 0, tgt = targetFor(tk), ok = done >= tgt && done > 0;
    var C = 2 * Math.PI * 66, pct = Math.min(1, done / tgt);
    var head, sub;
    if (ok) { head = 'Target achieved'; sub = done > tgt ? fmt(done - tgt) + ' over the goal.' : 'Right on target.'; }
    else if (done === 0) { head = fmt(tgt) + ' to go'; sub = 'Log a session or start the timer.'; }
    else { head = fmt(tgt - done) + ' to go'; sub = Math.round(pct * 100) + '% of today’s target done.'; }
    var days = lastDays(7), mc = 0, first = startKey();
    days.forEach(function (k) { if (met(t, k)) mc++; });
    var h = '<section class="card hero"><h2 class="label">Today’s target</h2><div class="hero-grid">' +
      '<div class="ring' + (justDone ? ' done' : '') + '"><svg viewBox="0 0 156 156" aria-hidden="true"><circle class="trk" cx="78" cy="78" r="66"/>' +
      '<circle class="bar" cx="78" cy="78" r="66" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + C.toFixed(1) + '" data-off="' + (C * (1 - pct)).toFixed(1) + '"/></svg>' +
      '<div class="mid"><b class="num">' + esc(fmt(done)) + '</b><span>of ' + esc(fmt(tgt)) + '</span></div></div>' +
      '<div class="hero-text"><strong>' + esc(head) + '</strong><span>' + esc(sub) + '</span>' +
      (ok ? '<span class="badge">' + I.check + 'Achieved</span>' : '<span>' + mc + ' of 7 targets met this week</span>') +
      '</div></div></section>';
    justDone = false;
    h += timerCard();
    var list = S.sessions.filter(function (s) { return s.date === tk; }).sort(function (a, b) { return b.ts - a.ts; });
    h += '<section class="card"><h2 class="label">Today’s sessions</h2>';
    if (!list.length) {
      h += '<div class="empty">' + emptyArt() + '<b>Nothing logged yet</b><span>Start the timer or tap Log time to add your first session.</span></div>';
    } else {
      h += '<ul class="list">' + list.map(function (s) {
        var sb = subjOf(s), armed = pendingDel === s.id;
        return '<li class="li"><span class="dot" style="--c:' + sb.color + '"></span><div class="txt"><b>' + esc(sb.name) + '</b>' +
          (s.note ? '<small>' + esc(s.note) + '</small>' : '') + '</div><span class="val num">' + esc(fmt(s.minutes)) + '</span>' +
          '<button type="button" class="icon-btn' + (armed ? ' armed' : '') + '" data-act="s-del" data-v="' + s.id + '" aria-label="Delete session">' + (armed ? 'Delete?' : I.trash) + '</button></li>';
      }).join('') + '</ul>';
    }
    return h + '</section>';
  }

  function timerCard() {
    var T = S.timer, running = !!T.startedAt, ms = elapsed(), chips;
    if (!S.subjects.length) {
      return '<section class="card timer"><h2 class="label" style="margin:0">Focus timer</h2><div class="timer-row"><span class="hint">Add a subject to start timing.</span>' +
        '<button type="button" class="btn tonal" data-act="subj-new">' + I.plus + 'New subject</button></div></section>';
    }
    chips = S.subjects.map(function (s) {
      return '<button type="button" class="chip" style="--c:' + s.color + '" data-act="t-subj" data-v="' + s.id + '" aria-pressed="' + (T.subject === s.id) + '"><i></i>' + esc(s.name) + '</button>';
    }).join('');
    return '<section class="card timer"><h2 class="label" style="margin:0">Focus timer</h2><div class="chips">' + chips + '</div>' +
      '<div class="timer-row"><div class="clock num" id="timer-text">' + clock(ms) + '</div><div class="btn-row">' +
      (running ? '<button type="button" class="btn tonal" data-act="t-pause">' + I.pause + 'Pause</button>'
        : '<button type="button" class="btn filled" data-act="t-start">' + I.play + (ms > 0 ? 'Resume' : 'Start') + '</button>') +
      (ms >= 1000 ? '<button type="button" class="icon-btn" data-act="t-reset" aria-label="Reset timer">' + I.reset + '</button>' : '') +
      '</div></div>' +
      (ms >= 60000 && !running ? '<button type="button" class="btn tonal block" data-act="t-save">' + I.check + 'Save ' + fmt(Math.round(ms / 60000)) + ' session</button>' : '') +
      '</section>';
  }

  function viewStats() {
    var t = totals(), days = lastDays(7), first = startKey(), tk = todayKey();
    var total = 0, tracked = 0, mc = 0, maxv = 60;
    days.forEach(function (k) {
      total += t[k] || 0;
      if (k >= first) { tracked++; if (met(t, k)) mc++; }
      maxv = Math.max(maxv, t[k] || 0, targetFor(k));
    });
    maxv *= 1.1;
    var best = 0;
    lastDays(35).forEach(function (k) { best = Math.max(best, t[k] || 0); });
    var h = '<div class="kpis">' +
      '<div class="kpi"><small>Last 7 days</small><b class="num">' + esc(fmt(total)) + '</b></div>' +
      '<div class="kpi"><small>Daily average</small><b class="num">' + esc(fmt(tracked ? total / tracked : 0)) + '</b></div>' +
      '<div class="kpi"><small>Targets met</small><b class="num">' + mc + ' of ' + tracked + '</b></div>' +
      '<div class="kpi"><small>Best day, 5 weeks</small><b class="num">' + esc(fmt(best)) + '</b></div></div>';
    var cols = '', labs = '';
    days.forEach(function (k) {
      var v = t[k] || 0, tg = targetFor(k), isT = k === tk, ok = met(t, k), pre = k < first;
      var cls = pre || v === 0 ? (pre || isT ? '' : 'miss') : ok ? 'met' : isT ? 'live' : 'miss';
      cols += '<div class="day"><div class="col ' + cls + '" style="height:' + (v / maxv * 100).toFixed(1) + '%"></div>' +
        (pre ? '' : '<div class="tick" style="bottom:' + (tg / maxv * 100).toFixed(1) + '%"></div>') + '</div>';
      labs += '<div class="' + (isT ? 't' : '') + '">' + esc(parseKey(k).toLocaleDateString(undefined, { weekday: 'short' })) +
        '<b class="num">' + (pre ? '–' : esc(fmtShort(v))) + '</b></div>';
    });
    h += '<section class="card"><h2 class="label">Last 7 days</h2><div class="week">' + cols + '</div><div class="wlabels">' + labs + '</div>' +
      '<p class="legend"><span style="--c:var(--pri)">Target met</span><span style="--c:var(--err)">Missed</span><span style="--c:var(--ter)">Today, in progress</span><span class="dash">Target</span></p></section>';

    // 5-week heat map aligned to the chosen first day of the week
    var ws = S.weekStart, names = ['S', 'M', 'T', 'W', 'T', 'F', 'S'], dow = (new Date().getDay() - ws + 7) % 7;
    var start = addDays(tk, -(dow + 28)), cells = '';
    for (var i = 0; i < 7; i++) cells += '<div class="hh">' + names[(ws + i) % 7] + '</div>';
    for (var j = 0; j < 35; j++) {
      var k = addDays(start, j), v = t[k] || 0, tg = targetFor(k), c = 'cell', st = '', n = parseKey(k).getDate();
      if (k > tk) c += ' fut';
      else if (k < first) c += ' pre';
      else if (v === 0) { if (k !== tk) c += ' x'; }
      else if (v >= tg) { c += ' m'; st = '--o:1'; }
      else st = '--o:' + (0.22 + 0.5 * v / tg).toFixed(2);
      if (k === tk) c += ' today';
      cells += '<div class="' + c + '"' + (st ? ' style="' + st + '"' : '') + '><span>' + n + '</span></div>';
    }
    h += '<section class="card"><h2 class="label">Last 5 weeks</h2><div class="heat">' + cells + '</div>' +
      '<p class="legend"><span style="--c:var(--pri)">Target met</span><span style="--c:var(--sc-high)">Missed</span></p></section>';

    // subject split for the last 7 days
    var by = {}, sum = 0;
    S.sessions.forEach(function (s) {
      if (days.indexOf(s.date) < 0) return;
      var sb = subjOf(s);
      by[sb.id] = by[sb.id] || { name: sb.name, color: sb.color, m: 0 };
      by[sb.id].m += s.minutes; sum += s.minutes;
    });
    var arr = Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return b.m - a.m; });
    h += '<section class="card"><h2 class="label">Time by subject, last 7 days</h2>';
    if (!arr.length) h += '<div class="empty"><span>Subjects appear here once you log time.</span></div>';
    else {
      h += '<div class="share">' + arr.map(function (a) { return '<i style="--c:' + a.color + ';flex:' + a.m + '"></i>'; }).join('') + '</div><ul class="list">' +
        arr.map(function (a) {
          return '<li class="li" style="min-height:48px"><span class="dot" style="--c:' + a.color + '"></span><div class="txt"><b style="font-size:15px">' + esc(a.name) +
            '</b></div><span class="val num">' + esc(fmt(a.m)) + ' · ' + Math.round(a.m / sum * 100) + '%</span></li>';
        }).join('') + '</ul>';
    }
    return h + '</section>';
  }

  function viewSubjects() {
    var wk = lastDays(7), all = {}, week = {};
    S.sessions.forEach(function (s) {
      all[s.subject] = (all[s.subject] || 0) + s.minutes;
      if (wk.indexOf(s.date) >= 0) week[s.subject] = (week[s.subject] || 0) + s.minutes;
    });
    var h = '<section class="card"><h2 class="label">Your subjects</h2>';
    if (!S.subjects.length) {
      h += '<div class="empty">' + emptyArt() + '<b>No subjects yet</b><span>Add the courses or topics you study so time can be split by subject.</span>' +
        '<button type="button" class="btn filled" data-act="subj-new">' + I.plus + 'Add subject</button></div>';
    } else {
      h += '<ul class="list">' + S.subjects.map(function (s) {
        return '<li><button type="button" class="li" data-act="subj-edit" data-v="' + s.id + '"><span class="dot" style="--c:' + s.color + '"></span><div class="txt"><b>' + esc(s.name) +
          '</b><small>' + esc(fmt(week[s.id] || 0)) + ' this week' + (s.goal ? ' \u00b7 goal ' + esc(fmt(s.goal)) + ' a day' : '') + '</small></div><span class="val num">' + esc(fmt(all[s.id] || 0)) + '</span></button></li>';
      }).join('') + '</ul><div style="margin-top:12px"><button type="button" class="btn tonal" data-act="subj-new">' + I.plus + 'Add subject</button></div>';
    }
    return h + '</section>';
  }

  function seg(act, cur, opts) {
    return '<div class="seg" role="group">' + opts.map(function (o) {
      return '<button type="button" data-act="' + act + '" data-v="' + o[0] + '" aria-pressed="' + (String(cur) === String(o[0])) + '">' + o[1] + '</button>';
    }).join('') + '</div>';
  }

  function sw(act, on, label) {
    return '<button type="button" class="switch" role="switch" aria-checked="' + (!!on) + '" aria-label="' + label + '" data-act="' + act + '"><i></i></button>';
  }
  function alertsCard() {
    var st = S.set, times = st.remind ? '<div class="rowx"><div class="chips wrap">' + st.times.map(function (t, i) {
      return '<button type="button" class="chip on" data-act="rem-del" data-v="' + i + '" aria-label="Remove reminder at ' + fmtClock12(t) + '">' + fmtClock12(t) + ' &times;</button>';
    }).join('') + (st.times.length < 4 ? '<button type="button" class="chip" data-act="rem-add">' + I.plus.replace('<svg', '<svg width="16" height="16"') + 'Add time</button>' : '') + '</div></div>' : '';
    var limits = [[0, 'Off'], [25, '25 min'], [30, '30 min'], [45, '45 min'], [60, '1 hour'], [90, '90 min']].map(function (o) {
      return '<button type="button" class="chip" data-act="limit" data-v="' + o[0] + '" aria-pressed="' + (st.limit === o[0]) + '">' + o[1] + '</button>';
    }).join('');
    return '<section class="card"><h2 class="label">Reminders and alerts</h2>' +
      (NATIVE ? '' : '<p class="hint" style="margin:0 0 8px">These work in the Android app.</p>') +
      '<div class="row"><div class="t"><b>Study reminders</b><small>Daily. Skipped once your target is met.</small></div>' + sw('rem-toggle', st.remind, 'Study reminders') + '</div>' + times +
      '<div class="row"><div class="t"><b>Session limit</b><small>Alert when one timer run reaches this</small></div></div>' +
      '<div class="rowx"><div class="chips wrap">' + limits + '</div></div>' +
      '<div class="row"><div class="t"><b>Target reached alert</b><small>Tells you while the timer is running</small></div>' + sw('tgt-toggle', st.tgtAlert, 'Target reached alert') + '</div>' +
      '<div class="row"><div class="t"><b>Timer in notification bar</b><small>Live time while you study</small></div>' + sw('ongoing-toggle', st.ongoing, 'Timer in notification bar') + '</div>' +
      '<div class="row"><div class="t"><b>Home screen widget</b><small>Square. Tap its subject name to switch subject.</small></div><button type="button" class="btn tonal" data-act="widget">Add</button></div>' +
      '<div class="row"><div class="t"><b>Link to Android</b><small>' + esc(linkText()) + '</small></div><button type="button" class="btn tonal" data-act="test-notif">Test</button></div></section>';
  }
  function viewSettings() {
    return alertsCard() + '<section class="card">' +
      '<div class="row"><div class="t"><b>Daily target</b><small>Applies from today</small></div><div class="stepper">' +
      '<button type="button" data-act="tgt-dec" aria-label="Decrease target by 15 minutes">' + I.minus + '</button><b class="num">' + esc(fmt(S.target)) + '</b>' +
      '<button type="button" data-act="tgt-inc" aria-label="Increase target by 15 minutes">' + I.plus + '</button></div></div>' +
      '<div class="row"><div class="t"><b>Week starts on</b></div>' + seg('wk', S.weekStart, [[6, 'Sat'], [0, 'Sun'], [1, 'Mon']]) + '</div>' +
      '<div class="row"><div class="t"><b>Theme</b></div>' + seg('theme', S.theme, [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']]) + '</div></section>' +
      '<section class="card"><h2 class="label">Your data</h2><p class="hint" style="margin:0 0 12px">Everything is stored on this phone only. Copy a backup to move it to another device.</p>' +
      '<div class="btn-row"><button type="button" class="btn tonal" data-act="backup">Backup &amp; restore</button>' +
      '<button type="button" class="btn text danger' + (pendingDel === 'reset' ? ' armed' : '') + '" data-act="reset">' + (pendingDel === 'reset' ? 'Tap again to erase everything' : 'Erase all data') + '</button></div></section>' +
      '<p class="about">Study Tracker 1.2</p>';
  }

  function renderTop() {
    var d = new Date(), t = totals(), n = streak(t), titles = {
      today: ['Today', d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })],
      stats: ['Stats', 'How your study time adds up'],
      subjects: ['Subjects', 'What you are studying'],
      settings: ['Settings', 'Reminders, targets, theme and backup']
    }[tab];
    $('topbar').innerHTML = '<div class="titles"><h1>' + titles[0] + '</h1><p>' + esc(titles[1]) + '</p></div>' +
      (tab === 'today' ? '<button type="button" class="icon-btn" data-act="goto-rem" aria-label="Reminders and alerts">' + I.bell + '</button>' +
        '<span class="streak" title="Days in a row with the target met">' + I.flame + '<span class="num">' + n + (n === 1 ? ' day' : ' days') + '</span></span>' : '');
  }
  function renderNav() {
    $('nav').innerHTML = TABS.map(function (x) {
      return '<button type="button" data-act="tab" data-v="' + x.id + '"' + (tab === x.id ? ' aria-current="page"' : '') + '><span class="pill">' + I[x.id] + '</span>' + x.label + '</button>';
    }).join('');
  }
  function renderFab() {
    var f = $('fab');
    f.hidden = tab === 'settings';
    f.innerHTML = I.plus + 'Log time';
  }
  function render(keepScroll) {
    var v = $('view'), top = v.scrollTop;
    var views = { today: viewToday, stats: viewStats, subjects: viewSubjects, settings: viewSettings };
    renderTop();
    v.innerHTML = views[tab]();
    if (keepScroll !== false) v.scrollTop = top;
    renderNav(); renderFab();
    requestAnimationFrame(function () {
      var bars = v.querySelectorAll('.ring .bar[data-off]');
      for (var i = 0; i < bars.length; i++) bars[i].setAttribute('stroke-dashoffset', bars[i].getAttribute('data-off'));
    });
    applyTheme();
  }
  function applyTheme() {
    var r = document.documentElement;
    if (S.theme === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', S.theme);
  }

  /* ---------- sheets ---------- */
  function showSheet(html) {
    $('layer').innerHTML = '<div class="scrim" data-act="close"></div><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>' + html + '</div>';
    if (!sheetOpen) { try { history.pushState({ sheet: 1 }, ''); } catch (e) {} }
    sheetOpen = true;
  }
  function hideSheet() { sheetOpen = false; $('layer').innerHTML = ''; }
  function closeSheet() {
    if (!sheetOpen) return;
    var st = null; try { st = history.state; } catch (e) {}
    if (st && st.sheet) { try { history.back(); return; } catch (e) {} }
    hideSheet();
  }
  window.addEventListener('popstate', function () { if (sheetOpen) hideSheet(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });

  function openLog(pre) {
    var last = S.sessions.length ? S.sessions.slice().sort(function (a, b) { return b.ts - a.ts; })[0].subject : null;
    var sel = pre || S.timer.subject || (subj(last) ? last : null) || (S.subjects[0] && S.subjects[0].id) || '__new';
    var chips = S.subjects.map(function (s) {
      return '<button type="button" class="chip" style="--c:' + s.color + '" data-sv="' + s.id + '"><i></i>' + esc(s.name) + '</button>';
    }).join('') + '<button type="button" class="chip" data-sv="__new">' + I.plus.replace('<svg', '<svg width="16" height="16"') + 'New subject</button>';
    showSheet('<h3>Log study time</h3><div class="field"><label>Subject</label><div class="chips wrap" id="lg-chips">' + chips + '</div></div>' +
      '<div class="field" id="lg-newf"><label for="lg-name">New subject name</label><input id="lg-name" type="text" maxlength="40" placeholder="e.g. Structural Analysis" autocomplete="off"></div>' +
      '<div class="field"><label>Time studied</label><div class="two"><input id="lg-h" type="number" inputmode="numeric" min="0" max="16" placeholder="Hours" aria-label="Hours"><input id="lg-m" type="number" inputmode="numeric" min="0" max="59" placeholder="Minutes" aria-label="Minutes"></div></div>' +
      '<div class="chips"><button type="button" class="chip" data-add="15">+15 min</button><button type="button" class="chip" data-add="30">+30 min</button><button type="button" class="chip" data-add="60">+1 hour</button></div>' +
      '<div class="field"><label>Day</label><div class="chips" id="lg-days"><button type="button" class="chip" data-day="0">Today</button><button type="button" class="chip" data-day="1">Yesterday</button></div>' +
      '<input id="lg-date" type="date" style="margin-top:8px" aria-label="Date"></div>' +
      '<div class="field"><label for="lg-note">Note (optional)</label><input id="lg-note" type="text" maxlength="120" placeholder="Chapter, problem set, revision" autocomplete="off"></div>' +
      '<p class="err" id="lg-err" role="alert"></p><button type="button" class="btn filled block" id="lg-save">' + I.check + 'Save session</button>');
    var L = $('layer'), date = todayKey();
    function paintSubj() {
      L.querySelectorAll('[data-sv]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-sv') === sel)); });
      $('lg-newf').hidden = sel !== '__new';
    }
    function paintDay() {
      var t = todayKey();
      $('lg-date').value = date; $('lg-date').max = t;
      L.querySelectorAll('[data-day]').forEach(function (b) { b.setAttribute('aria-pressed', String(addDays(t, -(+b.getAttribute('data-day'))) === date)); });
    }
    paintSubj(); paintDay();
    L.querySelectorAll('[data-sv]').forEach(function (b) { b.onclick = function () { sel = b.getAttribute('data-sv'); paintSubj(); if (sel === '__new') $('lg-name').focus(); }; });
    L.querySelectorAll('[data-day]').forEach(function (b) { b.onclick = function () { date = addDays(todayKey(), -(+b.getAttribute('data-day'))); paintDay(); }; });
    $('lg-date').onchange = function () { if (this.value) { date = this.value; paintDay(); } };
    L.querySelectorAll('[data-add]').forEach(function (b) {
      b.onclick = function () {
        var tot = (parseInt($('lg-h').value || '0', 10) || 0) * 60 + (parseInt($('lg-m').value || '0', 10) || 0) + (+b.getAttribute('data-add'));
        tot = Math.min(tot, 960);
        $('lg-h').value = Math.floor(tot / 60) || ''; $('lg-m').value = tot % 60 || '';
        buzz(8);
      };
    });
    $('lg-save').onclick = function () {
      var err = $('lg-err'), mins = (parseInt($('lg-h').value || '0', 10) || 0) * 60 + (parseInt($('lg-m').value || '0', 10) || 0), id = sel;
      if (id === '__new') {
        var nm = $('lg-name').value.trim();
        if (!nm) { err.textContent = 'Enter a name for the new subject.'; $('lg-name').focus(); return; }
        var ex = S.subjects.filter(function (s) { return s.name.toLowerCase() === nm.toLowerCase(); })[0];
        if (ex) id = ex.id;
        else { id = uid(); S.subjects.push({ id: id, name: nm, color: COLORS[S.subjects.length % COLORS.length] }); }
      }
      if (mins < 1) { err.textContent = 'Enter the time you studied, or tap a quick-add chip.'; return; }
      if (mins > 960) { err.textContent = 'A session can be at most 16 hours.'; return; }
      if (date > todayKey()) { err.textContent = 'Pick today or an earlier day.'; return; }
      closeSheet();
      addSession(date, id, mins, $('lg-note').value.trim());
    };
  }

  function openSubject(id) {
    var ex = id ? subj(id) : null, color = ex ? ex.color : COLORS[S.subjects.length % COLORS.length], armed = false, goal = ex ? (ex.goal || 0) : 0;
    showSheet('<h3>' + (ex ? 'Edit subject' : 'New subject') + '</h3><div class="field"><label for="sb-name">Name</label><input id="sb-name" type="text" maxlength="40" autocomplete="off" value="' + esc(ex ? ex.name : '') + '" placeholder="e.g. Fluid Mechanics"></div>' +
      '<div class="field"><label>Colour</label><div class="swatches" id="sb-sw">' + COLORS.map(function (c) {
        return '<button type="button" class="sw" style="--c:' + c + '" data-c="' + c + '" aria-label="Colour ' + c + '">' + I.check + '</button>';
      }).join('') + '</div></div>' +
      '<div class="field"><label>Daily goal for this subject</label><div class="stepper" style="justify-content:space-between"><button type="button" id="sb-gm" aria-label="Decrease goal">' + I.minus + '</button><b class="num" id="sb-gv"></b><button type="button" id="sb-gp" aria-label="Increase goal">' + I.plus + '</button></div>' +
      '<p class="hint" style="margin:6px 4px 0">The widget shows the percentage of this goal. At the daily target it uses your overall target.</p></div><p class="err" id="sb-err" role="alert"></p>' +
      '<button type="button" class="btn filled block" id="sb-save">' + I.check + 'Save</button>' +
      (ex ? '<button type="button" class="btn tonal block" id="sb-widget">Add widget for this subject</button><button type="button" class="btn text danger block" id="sb-del">Delete subject</button>' : ''));
    var L = $('layer');
    function paint() { L.querySelectorAll('[data-c]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-c') === color)); }); }
    paint();
    L.querySelectorAll('[data-c]').forEach(function (b) { b.onclick = function () { color = b.getAttribute('data-c'); paint(); }; });
    function paintGoal() { $('sb-gv').textContent = goal ? fmt(goal) : 'Daily target'; }
    paintGoal();
    $('sb-gp').onclick = function () { goal = goal === 0 ? 30 : Math.min(960, goal + 15); paintGoal(); };
    $('sb-gm').onclick = function () { goal = goal <= 30 ? 0 : goal - 15; paintGoal(); };
    if (ex) $('sb-widget').onclick = function () {
      if (!NATIVE) { toast('The widget is available in the Android app.'); return; }
      nat('requestWidget', { subjectId: ex.id }).then(function (r) {
        toast(r && r.requested ? 'Confirm adding the widget to your home screen.' : 'Long-press your home screen, add the Study today widget, then tap its name to pick this subject.');
      });
    };
    $('sb-save').onclick = function () {
      var nm = $('sb-name').value.trim();
      if (!nm) { $('sb-err').textContent = 'Enter a name.'; return; }
      var dup = S.subjects.filter(function (s) { return s.name.toLowerCase() === nm.toLowerCase() && (!ex || s.id !== ex.id); })[0];
      if (dup) { $('sb-err').textContent = 'You already have a subject with that name.'; return; }
      if (ex) {
        ex.name = nm; ex.color = color; ex.goal = goal;
        S.sessions.forEach(function (s) { if (s.subject === ex.id) s.subjectName = nm; });
      } else S.subjects.push({ id: uid(), name: nm, color: color, goal: goal });
      save(); closeSheet(); render();
    };
    if (ex) $('sb-del').onclick = function () {
      if (!armed) { armed = true; this.textContent = 'Tap again to delete. Past sessions are kept.'; this.classList.add('armed'); return; }
      S.subjects = S.subjects.filter(function (s) { return s.id !== ex.id; });
      if (S.timer.subject === ex.id) S.timer.subject = null;
      save(); closeSheet(); render(); syncTimer(); toast('Subject deleted');
    };
  }

  function openReminderTime() {
    showSheet('<h3>Add reminder</h3><div class="field"><label for="rm-time">Time</label><input id="rm-time" type="time" value="20:00"></div>' +
      '<p class="err" id="rm-err" role="alert"></p><button type="button" class="btn filled block" id="rm-save">' + I.check + 'Add reminder</button>');
    $('rm-save').onclick = function () {
      var v = $('rm-time').value;
      if (!/^\d\d:\d\d$/.test(v)) { $('rm-err').textContent = 'Choose a time.'; return; }
      if (S.set.times.indexOf(v) >= 0) { $('rm-err').textContent = 'You already have a reminder at that time.'; return; }
      S.set.times.push(v); S.set.times.sort(); save(); syncReminders(); closeSheet(); render();
    };
  }

  function openBackup() {
    showSheet('<h3>Backup &amp; restore</h3><p class="hint">Copy this text and keep it safe. To restore, paste a backup over it and tap Restore.</p>' +
      '<div class="field"><label for="bk-text">Backup data</label><textarea id="bk-text" spellcheck="false"></textarea></div><p class="err" id="bk-err" role="alert"></p>' +
      '<div class="btn-row"><button type="button" class="btn filled" id="bk-copy">Copy</button><button type="button" class="btn tonal" id="bk-restore">Restore</button></div>');
    var ta = $('bk-text'), orig = JSON.stringify(S);
    ta.value = orig;
    $('bk-copy').onclick = function () {
      ta.value = orig;
      var done = function () { toast('Backup copied'); };
      try { navigator.clipboard.writeText(orig).then(done, function () { ta.select(); toast('Select and copy the text'); }); }
      catch (e) { ta.select(); toast('Select and copy the text'); }
    };
    $('bk-restore').onclick = function () {
      try {
        var o = JSON.parse(ta.value);
        if (!o || o.v !== 1 || !Array.isArray(o.sessions) || !Array.isArray(o.subjects)) throw 0;
        var f = fresh(); for (var k in f) if (o[k] == null) o[k] = f[k];
        o.set = Object.assign({}, f.set, o.set);
        S = o; save(); closeSheet(); render(); syncReminders(); syncTimer(); toast('Backup restored');
      } catch (e) { $('bk-err').textContent = 'That text is not a valid Study Tracker backup.'; }
    };
  }

  /* ---------- events ---------- */
  function clearPending() { pendingDel = null; clearTimeout(delTimer); }
  function arm(id) { pendingDel = id; clearTimeout(delTimer); delTimer = setTimeout(function () { pendingDel = null; if (!sheetOpen) render(); }, 3500); render(); }

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el) return;
    var a = el.getAttribute('data-act'), v = el.getAttribute('data-v'), T = S.timer;
    if (a === 'tab') { clearPending(); tab = v; render(false); var vw = $('view'); vw.scrollTop = 0; for (var q = 0; q < vw.children.length; q++) vw.children[q].classList.add('fade'); return; }
    if (a === 'close') { closeSheet(); return; }
    if (a === 'goto-rem') { clearPending(); tab = 'settings'; render(false); var sv = $('view'); sv.scrollTop = 0; for (var z = 0; z < sv.children.length; z++) sv.children[z].classList.add('fade'); return; }
    if (a === 'test-notif') { needNotif(function () { nat('testNotify').then(function () { toast('Test notification sent'); }); }); return; }
    if (a === 'log') { openLog(); return; }
    if (a === 'subj-new') { openSubject(null); return; }
    if (a === 'subj-edit') { openSubject(v); return; }
    if (a === 'backup') { openBackup(); return; }
    if (a === 't-subj') { T.subject = v; save(); render(); syncTimer(); return; }
    if (a === 't-start') {
      if (!T.subject) { T.subject = S.subjects[0].id; }
      T.startedAt = Date.now(); save(); buzz(10); render(); syncTimer(); return;
    }
    if (a === 't-pause') { T.accum = elapsed(); T.startedAt = null; save(); render(); syncTimer(); return; }
    if (a === 't-reset') { T.accum = 0; T.startedAt = null; save(); render(); syncTimer(); return; }
    if (a === 't-save') {
      var mins = Math.round(elapsed() / 60000);
      if (mins < 1 || !T.subject) return;
      var sid = T.subject; T.accum = 0; T.startedAt = null; save();
      addSession(todayKey(), sid, mins, 'Focus timer'); syncTimer(); return;
    }
    if (a === 's-del') {
      if (pendingDel === v) { clearPending(); S.sessions = S.sessions.filter(function (s) { return s.id !== v; }); save(); render(); toast('Session deleted'); }
      else arm(v);
      return;
    }
    if (a === 'tgt-dec') { setTarget(S.target - 15); return; }
    if (a === 'tgt-inc') { setTarget(S.target + 15); return; }
    if (a === 'theme') { S.theme = v; save(); render(); return; }
    if (a === 'wk') { S.weekStart = +v; save(); render(); return; }
    if (a === 'rem-toggle') {
      if (S.set.remind) { S.set.remind = false; save(); syncReminders(); render(); }
      else needNotif(function () { S.set.remind = true; save(); syncReminders(); render(); });
      return;
    }
    if (a === 'rem-add') { if (S.set.times.length >= 4) toast('You can set up to 4 reminders.'); else openReminderTime(); return; }
    if (a === 'rem-del') { S.set.times.splice(+v, 1); save(); syncReminders(); render(); return; }
    if (a === 'limit') {
      var apply = function () { S.set.limit = +v; save(); render(); syncTimer(); };
      if (+v > 0) needNotif(apply); else apply();
      return;
    }
    if (a === 'tgt-toggle' || a === 'ongoing-toggle') {
      var fld = a === 'tgt-toggle' ? 'tgtAlert' : 'ongoing';
      var flip = function () { S.set[fld] = !S.set[fld]; save(); render(); syncTimer(); };
      if (!S.set[fld]) needNotif(flip); else flip();
      return;
    }
    if (a === 'widget') {
      if (!NATIVE) { toast('The widget is available in the Android app.'); return; }
      nat('requestWidget', { subjectId: 'all' }).then(function (r) {
        toast(r && r.requested ? 'Confirm adding the widget to your home screen.' : 'Long-press your home screen, tap Widgets, then choose Study today.');
      });
      return;
    }
    if (a === 'reset') {
      if (pendingDel === 'reset') { clearPending(); S = fresh(); save(); render(); syncReminders(); syncTimer(); toast('All data erased'); }
      else arm('reset');
    }
  });

  function tick() {
    var el = $('timer-text');
    if (el) el.textContent = clock(elapsed());
    var k = todayKey();
    if (k !== lastDay) { lastDay = k; syncData(); if (!sheetOpen) render(); }
  }
  document.addEventListener('visibilitychange', function () { if (document.hidden) syncData(); else tick(); });

  S = load();
  lastDay = todayKey();
  applyTheme();
  render(false);
  setInterval(tick, 1000);
  syncData(); syncReminders(); syncTimer();
  nat('ping').then(function (r) {
    if (r && r.ok) { link.ok = true; link.err = ''; } else if (NATIVE && link.ok === null) { link.ok = false; link.err = 'No answer from Android'; }
    if (tab === 'settings' && !sheetOpen) render();
  });
})();
