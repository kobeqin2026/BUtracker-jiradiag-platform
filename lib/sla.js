/**
 * 软件 Bug SLA 口径（提醒模式）—— 后端唯一判定源
 *
 * ⚠ 与 public/js/jira-dashboard.js 的 SLA_FIX / SLA_CAD / SLA_FIRST / slaOf() 同源：
 *   页面渲染用前端那份（避免每次刷新都要等后端算），邮件正文用这份。
 *   改阈值 / 改判定必须两处一起改，否则看板与邮件会出现两个口径。
 *
 * 2026-11-20 Kobe 定稿：SLA 暂不执行，只做提醒。
 *   · 只提醒，不写 JIRA、不升档、不计违约；
 *   · ① 首次响应改用 changelog 真口径（报单 → 首次离开 Opened，工作小时 08:00–17:00）；
 *   · ② 持续响应（心跳）黄牌/红牌照算，另给「第几次提醒」；
 *   · ③ 修复超期只进周会/总览，不进个人提醒（每周一封）；④ 挂起 = 暂时不追踪（静默与修复都免）。
 */

var SLA_FIX = { highest: 7, high: 14, medium: 30, low: 60 };          // 自然日
var SLA_CAD = { highest: 2, high: 3, medium: 7, low: 14 };            // 自然日（1× 心跳）
var SLA_FIRST_WD = { highest: 0.5, high: 1, medium: 2, low: 5 };      // 工作日（08:00-17:00）
var SLA_NAME = { highest: 'Highest', high: 'High', medium: 'Medium', low: 'Low' };
var SLA_RANK = { highest: 0, high: 1, medium: 2, low: 3 };
var SLA_PAUSED_LABEL = 'sla-paused';
var WORKDAY_START = 8, WORKDAY_END = 17;
var WORKDAY_HOURS = WORKDAY_END - WORKDAY_START;                      // 9h

function slaDaysSince(dateStr) {
    if (!dateStr) return null;
    var t = Date.parse(String(dateStr).replace(' ', 'T'));
    if (isNaN(t)) return null;
    return Math.max(0, Math.floor((Date.now() - t) / 86400000));
}

function slaOf(bug) {
    var p = String(bug.severity || '').toLowerCase();
    var cad = SLA_CAD[p] || null, fix = SLA_FIX[p] || null;
    var labels = (bug.labels || []).map(function (x) { return String(x).toLowerCase(); });
    var closed = (bug.status === 'closed' || bug.status === 'rejected');
    var daysOpen = slaDaysSince(bug.reportDate);
    var silent = slaDaysSince(bug.updatedDate || bug.reportDate);
    var paused = labels.indexOf(SLA_PAUSED_LABEL) >= 0;
    var red = !closed && !paused && cad !== null && silent !== null && silent > 2 * cad;
    var warn = !closed && !paused && cad !== null && silent !== null && !red && silent > cad;
    return {
        prio: p, cadence: cad, fixTarget: fix, daysOpen: daysOpen, silent: silent,
        fixRemain: (daysOpen === null || fix === null) ? null : fix - daysOpen,
        fixOver: (daysOpen === null || fix === null) ? 0 : Math.max(0, daysOpen - fix),
        paused: paused, closed: closed, warn: warn, red: red,
        // 第几次提醒 = 已经错过了几个完整心跳周期（1 = 第一次提醒，≥3 = 已被提醒 3 个周期以上）
        remindN: (cad === null || silent === null) ? null : Math.floor(silent / cad)
    };
}

/** 工作日耗时（小时），区间按 周一~周五 08:00–17:00 计。 */
function workHoursBetween(a, b) {
    if (!(a < b)) return 0;
    var total = 0, cur = new Date(a.getTime());
    var guard = 0;
    while (cur < b && guard++ < 100000) {
        var dow = cur.getDay();
        var h = cur.getHours() + cur.getMinutes() / 60;
        if (dow >= 1 && dow <= 5 && h >= WORKDAY_START && h < WORKDAY_END) {
            var inDay = (WORKDAY_END - Math.max(h, WORKDAY_START)) * 3600000;
            var left = b - cur;
            var step = Math.min(inDay, left);
            total += step;
            cur = new Date(cur.getTime() + step);
            continue;
        }
        var nxt = new Date(cur.getTime());
        if (dow >= 1 && dow <= 5 && h < WORKDAY_START) {
            nxt.setHours(WORKDAY_START, 0, 0, 0);
        } else {
            nxt.setDate(nxt.getDate() + 1);
            nxt.setHours(WORKDAY_START, 0, 0, 0);
            while (nxt.getDay() === 0 || nxt.getDay() === 6) nxt.setDate(nxt.getDate() + 1);
        }
        if (nxt <= cur) cur = new Date(cur.getTime() + 60000);
        else cur = nxt;
    }
    return total / 3600000;
}

function fmtHours(h) {
    if (h === null || h === undefined) return '-';
    if (h < 1) return Math.round(h * 60) + ' 分钟';
    if (h < 48) return (Math.round(h * 10) / 10) + ' 小时';
    return Math.round(h / 24) + ' 天';
}

/**
 * 把 firstResp（key → {firstOutAt, stillOpened}）合并进 bug，产出 ① 判定。
 * 上限 = SLA_FIRST_WD × 9 工作小时；仍 Opened 视为未响应（按到现在的工作小时算）。
 */
function attachFirstResponse(bugs, firstRespMap) {
    (bugs || []).forEach(function (b) {
        var fr = (firstRespMap || {})[b.bugId] || null;
        // 取数失败 / 没有条目 / 「已离开 Opened 但拿不到时刻」= 未知，不参与 ① 判定。
        // 早期写法把未知当 stillOpened，会把 changelog 失败的单全量误报成「未响应 · 超时」。
        if (!fr || fr.error || (!fr.firstOutAt && !fr.stillOpened)) { b.firstResp = null; return; }
        var prio = String(b.severity || '').toLowerCase();
        var limitWd = SLA_FIRST_WD[prio];
        var limit = (limitWd === undefined) ? null : limitWd * WORKDAY_HOURS;
        var created = b.createdTimestamp ? new Date(b.createdTimestamp) : (b.reportDate ? new Date(b.reportDate) : null);
        var stillOpened = !!fr.stillOpened;
        var out = fr.firstOutAt ? new Date(fr.firstOutAt) : null;
        var hours = null;
        if (limit !== null && created) {
            hours = workHoursBetween(created, out || new Date());
        }
        b.firstResp = {
            limitHours: limit,
            limitWorkdays: (limitWd === undefined ? null : limitWd),
            workHours: hours,
            stillOpened: stillOpened,
            firstOutAt: out ? out.toISOString() : null,
            transition: fr ? (fr.transition || null) : null,
            overdue: (limit !== null && hours !== null) ? (hours > limit) : false,
            known: !!fr
        };
    });
    return bugs || [];
}

/** 汇总所有提醒清单（口径统一在这里，页面与邮件都从这里取语义）。 */
function buildModel(bugs) {
    var all = (bugs || []).slice();
    all.forEach(function (b) { b.sla = slaOf(b); });
    var open = all.filter(function (b) { return !b.sla.closed; });
    var warn = open.filter(function (b) { return b.sla.warn; })
        .sort(function (a, b) { return (b.sla.silent || 0) - (a.sla.silent || 0); });
    var red = open.filter(function (b) { return b.sla.red; })
        .sort(function (a, b) { return (b.sla.silent || 0) - (a.sla.silent || 0); });
    var paused = open.filter(function (b) { return b.sla.paused; });
    /* 2026-11-20 Kobe：sla-paused = 「暂时不需要追踪 SLA」—— 挂起单静默超期、预期修复超期、临期全部不计，
       只留在「挂起清单」里等解除（早期版本只免静默、修复照算，已推翻）。 */
    var fixOver = open.filter(function (b) { return !b.sla.paused && (b.sla.fixOver || 0) > 0; })
        .sort(function (a, b) { return b.sla.fixOver - a.sla.fixOver; });
    var near = open.filter(function (b) {
        var s = b.sla;
        return !s.paused && s.fixRemain !== null && s.fixRemain >= 0 && s.fixRemain <= Math.max(1, Math.round((s.fixTarget || 0) * 0.2));
    }).sort(function (a, b) { return a.sla.fixRemain - b.sla.fixRemain; });
    // ① 首次响应：超时 或 仍 Opened（未响应）
    var first = open.filter(function (b) { return b.firstResp && b.firstResp.limitHours !== null && (b.firstResp.overdue || b.firstResp.stillOpened); })
        .sort(function (a, b) {
            var ao = a.firstResp.overdue ? 0 : 1, bo = b.firstResp.overdue ? 0 : 1;
            if (ao !== bo) return ao - bo;                                   // 超时的在前
            var ax = a.firstResp.limitHours ? a.firstResp.workHours / a.firstResp.limitHours : 0;
            var bx = b.firstResp.limitHours ? b.firstResp.workHours / b.firstResp.limitHours : 0;
            return bx - ax;                                                  // 超得越狠越前
        });
    var firstOver = open.filter(function (b) { return b.firstResp && b.firstResp.overdue; });
    var noPrio = open.filter(function (b) { return !String(b.severity || '').trim(); });
    /* 2026-11-20 Kobe：提醒里不要黄/红牌概念 —— 只按优先级的持续响应时间判「超出静默」一张清单。
       silentOver = 未关闭、未挂起、静默 > 该优先级持续响应天数（原来的黄+红合并），按超出天数降序。 */
    var silentOver = open.filter(function (b) {
        var s = b.sla;
        return !s.paused && s.cadence !== null && s.silent !== null && s.silent > s.cadence;
    }).map(function (b) { b.sla.over = b.sla.silent - b.sla.cadence; return b; })
      .sort(function (a, b) { return (b.sla.over - a.sla.over) || (b.sla.silent - a.sla.silent); });
    return {
        all: all, open: open, warn: warn, red: red, paused: paused,
        fixOver: fixOver, near: near, first: first, firstOver: firstOver, noPrio: noPrio,
        silentOver: silentOver,
        counts: {
            total: all.length, open: open.length,
            warn: warn.length, red: red.length, paused: paused.length,
            fixOver: fixOver.length, near: near.length,
            first: first.length, firstOver: firstOver.length, noPrio: noPrio.length,
            silentOver: silentOver.length
        }
    };
}

/* ---------------- 提醒邮件（手工导出：每人一封 + 给 Kobe 的总览） ---------------- */

function esc(s) {
    return String(s === null || s === undefined ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function jiraUrlOf(b) {
    return b.jiraUrl || (b.jiraKey ? ('https://jira01.birentech.com/browse/' + b.jiraKey) : '');
}
function titleOf(b) {
    var t = String(b.summary || b.description || '').replace(/\s+/g, ' ').trim();
    return t || '-';
}
function today() {
    var d = new Date();
    function p2(n) { return n < 10 ? '0' + n : '' + n; }
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
}
function hhmm() {
    var d = new Date();
    function p2(n) { return n < 10 ? '0' + n : '' + n; }
    return p2(d.getHours()) + ':' + p2(d.getMinutes());
}

var TBL = 'border-collapse:collapse;font-size:12px;margin:4px 0 12px;';
var TH = 'background:#f2f2f2;border:1px solid #d0d4d9;padding:5px 8px;text-align:left;font-weight:bold;';
var TD = 'border:1px solid #d0d4d9;padding:5px 8px;';
var H4 = 'font-size:13px;margin:14px 0 4px;color:#12395e;';

function bugRowHtml(b, cols) {
    var s = b.sla || slaOf(b);
    var url = jiraUrlOf(b);
    var keyCell = url ? '<a href="' + esc(url) + '" style="color:#055fb0;">' + esc(b.bugId) + '</a>' : esc(b.bugId);
    var cells = [keyCell];
    cols.forEach(function (c) { cells.push(c(b, s)); });
    return '<tr>' + cells.map(function (v, i) {
        return '<td style="' + TD + (i === 0 ? '' : '') + '">' + v + '</td>';
    }).join('') + '</tr>';
}
function tableHtml(headers, rowsHtml) {
    return '<table style="' + TBL + '"><tr>' + headers.map(function (h) {
        return '<th style="' + TH + '">' + h + '</th>';
    }).join('') + '</tr>' + rowsHtml + '</table>';
}
function plainTable(headers, rows) {
    return [headers.join('\t')].concat(rows.map(function (r) { return r.join('\t'); })).join('\n');
}
function plainKey(b) {
    var url = jiraUrlOf(b);
    return url ? (b.bugId + ' <' + url + '>') : b.bugId;
}

/**
 * 生成提醒邮件清单。
 * @param {object} model buildModel() 的返回值
 * @param {object} opts {emailMap: {ownerName: email}, triageOwner: 'Kobe'}
 * @returns {{recipients: Array, overview: object, counts: object}}
 */
/* 阈值表：优先级 → 持续响应(天) / 预期修复(天)。2026-11-20 起放在清单之上，收件人一眼对照。 */
var TH_COLS = ['优先级', '持续响应（天）', '预期修复（天）'];
var TH_KEYS = ['highest', 'high', 'medium', 'low'];

function thresholdTableHtml() {
    return tableHtml(TH_COLS, TH_KEYS.map(function (p) {
        return '<tr>' +
            '<td style="' + TD + '"><b>' + SLA_NAME[p] + '</b></td>' +
            '<td style="' + TD + '">' + SLA_CAD[p] + ' 天</td>' +
            '<td style="' + TD + '">' + SLA_FIX[p] + ' 天</td></tr>';
    }).join(''));
}
function thresholdTableText() {
    return plainTable(TH_COLS, TH_KEYS.map(function (p) { return [SLA_NAME[p], SLA_CAD[p], SLA_FIX[p]]; }));
}

/* 静默超期清单：9 列 —— Key / 标题 / Domain（紧跟标题）/ 优先级 / 静默 / 持续响应 / 超出 / Reporter / Assignee */
var OVER_COLS = ['Key', '标题', 'Domain', '优先级', '持续响应(天)', '静默(天)', '超出(天)', 'Reporter', 'Assignee'];

function overRowHtml(b) {
    var s = b.sla;
    return bugRowHtml(b, [
        function () { return esc(titleOf(b)); },
        function () { return esc(b.domain || '-'); },
        function () { return SLA_NAME[s.prio] || '-'; },
        function () { return s.cadence; },
        function () { return '<b style="color:#c0392b;">' + s.silent + '</b>'; },
        function () { return '<b style="color:#c0392b;">+' + s.over + '</b>'; },
        function () { return esc(b.reporter || '-'); },
        function () { return esc(b.owner || '-'); }
    ]);
}
function overRowText(b) {
    var s = b.sla;
    return [plainKey(b), titleOf(b), b.domain || '-', SLA_NAME[s.prio] || '-',
        s.cadence, s.silent, '+' + s.over, b.reporter || '-', b.owner || '-'];
}

/* 预期修复超期清单：9 列 —— Key / 标题 / Domain / 优先级 / 已开 / 预期修复 / 超期 / Reporter / Assignee */
var FIX_COLS = ['Key', '标题', 'Domain', '优先级', '预期修复(天)', '已开(天)', '超期(天)', 'Reporter', 'Assignee'];

function fixRowHtml(b) {
    var s = b.sla;
    return bugRowHtml(b, [
        function () { return esc(titleOf(b)); },
        function () { return esc(b.domain || '-'); },
        function () { return SLA_NAME[s.prio] || '-'; },
        function () { return s.fixTarget; },
        function () { return '<b>' + s.daysOpen + '</b>'; },
        function () { return '<b style="color:#c0392b;">+' + s.fixOver + '</b>'; },
        function () { return esc(b.reporter || '-'); },
        function () { return esc(b.owner || '-'); }
    ]);
}
function fixRowText(b) {
    var s = b.sla;
    return [plainKey(b), titleOf(b), b.domain || '-', SLA_NAME[s.prio] || '-',
        s.fixTarget, s.daysOpen, '+' + s.fixOver, b.reporter || '-', b.owner || '-'];
}

/**
 * 生成提醒邮件：每人一封（该人名下「静默超期」条目）+ 给 Triage Owner 的总览。
 * 2026-11-20 Kobe 定稿：不再有黄牌/红牌概念、不再有 ① 首次响应段、清单只按持续响应时间判超期。
 * @param {object} model buildModel() 的返回值（用 model.silentOver）
 * @param {object} opts {emailMap:{ownerName:email}, overviewOwner:'Kobe'}
 */
function buildReminders(model, opts) {
    opts = opts || {};
    var emailMap = opts.emailMap || {};
    var day = today(), tm = hhmm(), stamp = day + ' ' + tm;
    var thresholdHtml = thresholdTableHtml(), thresholdText = thresholdTableText();
    var silent = model.silentOver || [];
    var fixList = model.fixOver || [];

    var byOwner = {};
    function bucket(owner) {
        var k = (owner && !/^tbd$/i.test(owner)) ? owner : '无主';
        if (!byOwner[k]) byOwner[k] = { owner: k, email: emailMap[k] || '', silent: [], fix: [] };
        return byOwner[k];
    }
    silent.forEach(function (b) { bucket(b.owner).silent.push(b); });
    fixList.forEach(function (b) { bucket(b.owner).fix.push(b); });

    function worstOver(r) {
        var a = r.silent.length ? r.silent[0].sla.over : -1;
        var b = r.fix.length ? r.fix[0].sla.fixOver : -1;
        return Math.max(a, b);
    }
    var recipients = Object.keys(byOwner).map(function (k) { return byOwner[k]; })
        .filter(function (r) { return r.owner !== '无主' && (r.silent.length || r.fix.length); })
        .sort(function (a, b) { return worstOver(b) - worstOver(a); });

    var ACTION = '<p style="margin:10px 0 4px;">建议动作（任一动过 JIRA，下一次提醒里这条就自动消失）：</p>' +
        '<ol style="margin:2px 0 10px 20px;padding:0;">' +
        '<li>更新进展 —— 评论写清「下一步 + 承诺时间」，或改状态/字段；</li>' +
        '<li>在等外部条件（硬件/供应商/客户）—— 回复本邮件说明，我给单打 <code>sla-paused</code>，静默不计；</li>' +
        '<li>已有结论 —— 直接关单或降级。</li>' +
        '</ol>';
    var ACTION_TEXT = ['建议动作（任一动过 JIRA，下一次提醒里这条就自动消失）：',
        '  1) 更新进展 —— 评论写清「下一步 + 承诺时间」，或改状态/字段；',
        '  2) 在等外部条件（硬件/供应商/客户）—— 回复本邮件说明，我给单打 sla-paused，静默不计；',
        '  3) 已有结论 —— 直接关单或降级。'];
    var SIG_HTML = '<p style="color:#666;font-size:12px;margin-top:12px;">—— 288Y Bug 提醒（每周一次，自动生成）· Kobe | NPI PEL</p></div>';
    var SIG_TEXT = '—— 288Y Bug 提醒（每周一次，自动生成）· Kobe | NPI PEL';

    function subjOf(nSilent, nFix) {
        var parts = [];
        if (nSilent) parts.push('静默超期 ' + nSilent);
        if (nFix) parts.push('修复超期 ' + nFix);
        return '[BR288Y] Bug 提醒 · ' + parts.join(' · ') + '（' + day + '）';
    }

    recipients.forEach(function (r) {
        var html = ['<div style="font-family:\'Microsoft YaHei\',Arial,sans-serif;font-size:13px;color:#222;">' +
            '<p>Hi ' + esc(r.owner) + '，</p>' +
            '<p>下面是当前挂在你名下、已超过阈值的 288Y Bug（数据截至 ' + esc(stamp) + '）：' +
            '«静默超期» = 距 JIRA 最后一次更新超过该优先级的持续响应时间；«修复超期» = 已开天数超过该优先级的预期修复时间。' +
            '<b>本轮只做提醒</b>：不改 JIRA 优先级、不升档、不计违约。</p>'];
        var text = ['Hi ' + r.owner + ',', '',
            '下面是当前挂在你名下、已超过阈值的 288Y Bug（数据截至 ' + stamp + '）：' +
            '「静默超期」= 距 JIRA 最后一次更新超过该优先级的持续响应时间；' +
            '「修复超期」= 已开天数超过该优先级的预期修复时间。本轮只做提醒：不改 JIRA 优先级、不升档、不计违约。', ''];

        html.push('<h4 style="' + H4 + '">持续响应 / 预期修复时间</h4>');
        html.push(thresholdHtml);
        text.push('【持续响应 / 预期修复时间】', thresholdText, '');

        if (r.silent.length) {
            html.push('<h4 style="' + H4 + '">静默超期清单（' + r.silent.length + ' 条）</h4>');
            html.push(tableHtml(OVER_COLS, r.silent.map(overRowHtml).join('')));
            text.push('【静默超期清单】', plainTable(OVER_COLS, r.silent.map(overRowText)), '');
        }
        if (r.fix.length) {
            html.push('<h4 style="' + H4 + '">预期修复超期清单（' + r.fix.length + ' 条）</h4>');
            html.push(tableHtml(FIX_COLS, r.fix.map(fixRowHtml).join('')));
            text.push('【预期修复超期清单】', plainTable(FIX_COLS, r.fix.map(fixRowText)), '');
        }

        html.push(ACTION, SIG_HTML);
        text = text.concat(ACTION_TEXT, ['', SIG_TEXT]);

        r.subject = subjOf(r.silent.length, r.fix.length);
        r.silentCount = r.silent.length;
        r.fixCount = r.fix.length;
        r.count = r.silent.length + r.fix.length;
        r.html = html.join('');
        r.text = text.join('\n');
    });

    // ---- 总览（给 Triage Owner）：统计 + 阈值表 + 两张全量清单 ----
    var c = model.counts;
    var unowned = (byOwner['无主'] && (byOwner['无主'].silent.length + byOwner['无主'].fix.length)) || 0;
    var longestSilent = silent.length ? silent[0].sla.over : 0;
    var longestFix = fixList.length ? fixList[0].sla.fixOver : 0;
    var statParts = ['未关闭 ' + c.open + ' 条 / 总 ' + c.total + ' 条',
        '静默超期 ' + c.silentOver + ' 条' + (silent.length ? '（最久超 ' + longestSilent + ' 天）' : ''),
        '修复超期 ' + c.fixOver + ' 条' + (fixList.length ? '（最久超 ' + longestFix + ' 天，临期 ' + c.near + '）' : ''),
        '挂起 ' + c.paused];
    if (unowned) statParts.push('其中无主 ' + unowned + ' 条');
    var stat = statParts.join('；');

    var ovHtml = ['<div style="font-family:\'Microsoft YaHei\',Arial,sans-serif;font-size:13px;color:#222;">',
        '<p>288Y Bug 提醒总览（数据截至 ' + esc(stamp) + '）—— ' + esc(stat) + '。</p>',
        '<h4 style="' + H4 + '">持续响应 / 预期修复时间</h4>', thresholdHtml];
    if (silent.length) {
        ovHtml.push('<h4 style="' + H4 + '">静默超期清单（' + silent.length + ' 条）</h4>');
        ovHtml.push(tableHtml(OVER_COLS, silent.map(overRowHtml).join('')));
    } else ovHtml.push('<p style="color:#666;">当前没有静默超期的单。</p>');
    if (fixList.length) {
        ovHtml.push('<h4 style="' + H4 + '">预期修复超期清单（' + fixList.length + ' 条）</h4>');
        ovHtml.push(tableHtml(FIX_COLS, fixList.map(fixRowHtml).join('')));
    } else ovHtml.push('<p style="color:#666;">当前没有预期修复超期的单。</p>');
    ovHtml.push(SIG_HTML);

    var ovText = ['288Y Bug 提醒总览（数据截至 ' + stamp + '）', stat, '',
        '【持续响应 / 预期修复时间】', thresholdText, ''];
    ovText.push('【静默超期清单】', silent.length ? plainTable(OVER_COLS, silent.map(overRowText)) : '(无)', '');
    ovText.push('【预期修复超期清单】', fixList.length ? plainTable(FIX_COLS, fixList.map(fixRowText)) : '(无)', '');
    ovText.push(SIG_TEXT);

    return {
        recipients: recipients,
        counts: c,
        overview: {
            owner: opts.overviewOwner || 'Kobe',
            subject: '[BR288Y] Bug 提醒总览 · 静默超期 ' + c.silentOver + ' 条 · 修复超期 ' + c.fixOver + ' 条（' + day + '）',
            html: ovHtml.join(''),
            text: ovText.join('\n'),
            count: c.silentOver + c.fixOver
        },
        generatedAt: new Date().toISOString()
    };
}

/** 生成标准 .eml（MIME multipart/alternative，UTF-8 + base64）—— Outlook 双击即可打开，链接可点。 */
function buildEml(opts) {
    var subject = opts.subject || '';
    var to = opts.to || '';
    var html = opts.html || '';
    var text = opts.text || '';
    var bnd = '----=_288Y_reminder_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    function b64(s) {
        var raw = Buffer.from(String(s), 'utf8').toString('base64');
        return (raw.match(/.{1,76}/g) || []).join('\r\n');
    }
    var d = new Date();
    var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var mons = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    function p2(n) { return n < 10 ? '0' + n : '' + n; }
    var date = days[d.getDay()] + ', ' + p2(d.getDate()) + ' ' + mons[d.getMonth()] + ' ' + d.getFullYear() +
        ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds()) + ' +0800';
    var lines = [
        'MIME-Version: 1.0',
        'X-Unsent: 1',
        to ? ('To: ' + to) : 'To: ',
        'Subject: =?UTF-8?B?' + Buffer.from(subject, 'utf8').toString('base64') + '?=',
        'Date: ' + date,
        'Content-Type: multipart/alternative; boundary="' + bnd + '"',
        '',
        'This is a multi-part message in MIME format.',
        '',
        '--' + bnd,
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
        '',
        b64(text),
        '',
        '--' + bnd,
        'Content-Type: text/html; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
        '',
        b64(html),
        '',
        '--' + bnd + '--',
        ''
    ];
    return lines.join('\r\n');
}

module.exports = {
    SLA_FIX: SLA_FIX, SLA_CAD: SLA_CAD, SLA_FIRST_WD: SLA_FIRST_WD, SLA_NAME: SLA_NAME,
    WORKDAY_HOURS: WORKDAY_HOURS,
    slaDaysSince: slaDaysSince, slaOf: slaOf,
    workHoursBetween: workHoursBetween, fmtHours: fmtHours,
    attachFirstResponse: attachFirstResponse, buildModel: buildModel,
    buildReminders: buildReminders, buildEml: buildEml
};
