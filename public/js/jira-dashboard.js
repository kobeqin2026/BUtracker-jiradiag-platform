// JIRA Bug Dashboard - Frontend Logic
// Chart.js via CDN: https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js

// ============ 单点登录 / 项目透传 (门户 -> 这里): URL ?token=&project= ============
// 门户登录后免登录跳转: token = gpu-tracker 的会话 token (经 Authorization: Bearer 使用),
// project = 门户 JIRA 项目选择; 为空表示"全部项目"。跨端口 cookie 不共享, 故 token 走 URL (内网环境)。
var __urlParams = new URLSearchParams(location.search);
var __urlToken = __urlParams.get('token') || '';
var __urlProject = __urlParams.get('project') || '';
// 全局 fetch 统一注入 Authorization: Bearer <token> —— URL token 进入后所有 /api 请求都带认证
(function () {
  var __origFetch = window.fetch;
  window.fetch = function (input, init) {
    init = init || {};
    if (typeof Dashboard !== 'undefined' && Dashboard && Dashboard.authToken) {
      init.headers = init.headers || {};
      if (isHeadersObj(init.headers)) init.headers.set('Authorization', 'Bearer ' + Dashboard.authToken);
      else if (!init.headers['Authorization']) init.headers['Authorization'] = 'Bearer ' + Dashboard.authToken;
    }
    return __origFetch.call(window, input, init);
  };
  function isHeadersObj(h) { return typeof Headers !== 'undefined' && h instanceof Headers; }
})();

// ============ Chart.js Plugin: Labels on Pie/Doughnut (status inside, percentage outside) ============

var pieLabelPlugin = {
    id: 'pieLabel',
    afterDatasetsDraw: function(chart) {
        if (chart.config.type !== 'pie' && chart.config.type !== 'doughnut') return;
        // 单图可用 options.plugins.pieLabel=false 关掉圆内百分比(如 Domain 图改为圆外引线标注)
        var plOpt = chart.options && chart.options.plugins && chart.options.plugins.pieLabel;
        if (plOpt === false) return;

        var ctx = chart.ctx;
        var dataset = chart.data.datasets[0];
        var labels = chart.data.labels;
        var meta = chart.getDatasetMeta(0);
        var total = dataset.data.reduce(function(a, b) { return a + b; }, 0);

        if (total === 0) return;

        var centerX = meta.data[0].x;
        var centerY = meta.data[0].y;
        var outerRadius = meta.data[0].outerRadius;
        var innerRadius = meta.data[0].innerRadius || 0;

        ctx.save();

        meta.data.forEach(function(arc, i) {
            var value = dataset.data[i];
            var pct = Math.round((value / total) * 100);
            if (pct < 1) return;

            var label = labels[i] || '';
            var color = dataset.backgroundColor[i];
            var textColor = isLightColor(color) ? '#333' : '#fff';
            var angle = arc.startAngle + (arc.endAngle - arc.startAngle) / 2;

            var ringWidth = outerRadius - innerRadius;
            var labelR = innerRadius + ringWidth * 0.5;
            var labelX = centerX + Math.cos(angle) * labelR;
            var labelY = centerY + Math.sin(angle) * labelR;

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            // Status name on top
            var nameSize = Math.max(9, Math.min(12, ringWidth * 0.22));
            ctx.font = 'bold ' + nameSize + 'px sans-serif';
            ctx.fillStyle = textColor;
            ctx.fillText(label, labelX, labelY - nameSize * 0.55);

            // Percentage below
            var pctSize = Math.max(9, Math.min(11, ringWidth * 0.20));
            ctx.font = 'bold ' + pctSize + 'px sans-serif';
            ctx.fillText(pct + '%', labelX, labelY + pctSize * 0.6);
        });

        ctx.restore();
    }
};

function isLightColor(color) {
    var r = 0, g = 0, b = 0;
    if (color.startsWith('#')) {
        var hex = color.slice(1);
        if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
        r = parseInt(hex.substring(0, 2), 16);
        g = parseInt(hex.substring(2, 4), 16);
        b = parseInt(hex.substring(4, 6), 16);
    }
    var luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6;
}

// ============ Chart.js Plugin: Data Labels on Line Charts ============

var lineDataLabelPlugin = {
    id: 'lineDataLabel',
    afterDatasetsDraw: function(chart) {
        if (chart.config.type !== 'line') return;

        var ctx = chart.ctx;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.font = '10px sans-serif';

        chart.data.datasets.forEach(function(dataset, di) {
            var meta = chart.getDatasetMeta(di);
            if (meta.hidden) return;

            meta.data.forEach(function(point, i) {
                var value = dataset.data[i];
                if (value === 0 || value === null || value === undefined) return;

                ctx.fillStyle = dataset.borderColor || '#333';
                ctx.fillText(value, point.x, point.y - 6);
            });
        });

        ctx.restore();
    }
};

// ============ Chart.js Plugin: Data Labels on Bar Charts (vertical + horizontal) ============

var barDataLabelPlugin = {
    id: 'barDataLabel',
    afterDatasetsDraw: function(chart) {
        if (chart.config.type !== 'bar') return;

        var ctx = chart.ctx;
        ctx.save();
        ctx.textBaseline = 'middle';

        var isHorizontal = (chart.options.indexAxis === 'y');

        chart.data.datasets.forEach(function(dataset, di) {
            var meta = chart.getDatasetMeta(di);
            if (meta.hidden) return;

            meta.data.forEach(function(bar, i) {
                var value = dataset.data[i];
                if (value === 0 || value === null || value === undefined) return;

                ctx.fillStyle = '#333';
                ctx.font = 'bold 10px sans-serif';

                if (isHorizontal) {
                    ctx.textAlign = 'left';
                    ctx.fillText(value, bar.x + 4, bar.y);
                } else {
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'bottom';
                    ctx.fillText(value, bar.x, bar.y - 5);
                }
            });
        });

        ctx.restore();
    }
};

// Register plugins with Chart.js
if (typeof Chart !== 'undefined' && Chart.register) {
    Chart.register(pieLabelPlugin);
    Chart.register(lineDataLabelPlugin);
    Chart.register(barDataLabelPlugin);
}

// ============ State ============
var Dashboard = {
    allBugs: [],
    filteredBugs: [],
    visibleBugs: [],
    projects: [],
    selectedProjects: [],
    authToken: null,
    currentUser: null,
    userRole: null,
    charts: {},
    autoRefreshTimer: null,
    sortField: null,
    sortDirection: 'asc',
    selectedTag: null,
    selectedComponent: null
};

// ============ Auth ============
// 统一登录门: 与 Tracker 主页一致 — 登录前整页不可见; /api/auth/login 已实现本地 users.json + Hardware 平台回退

function showGateLogin() {
    document.body.classList.add('gated');
    var gate = document.getElementById('gate-login');
    if (gate) gate.style.display = 'flex';
    var err = document.getElementById('gate-login-err');
    if (err) err.textContent = '';
    var u = document.getElementById('gate-username');
    if (u) u.value = '';
    var p = document.getElementById('gate-password');
    if (p) p.value = '';
    if (u) u.focus();
}

function enterDashboard() {
    document.body.classList.remove('gated');
    var gate = document.getElementById('gate-login');
    if (gate) gate.style.display = 'none';
    // index.html 合体门: control-bar/quick-actions-section 仅存在于 jira-dashboard.html, 需防御
    var cb = document.getElementById('control-bar');
    if (cb) cb.style.display = 'flex';
    var qa = document.getElementById('quick-actions-section');
    if (qa) qa.style.display = 'flex';
    // 仅 JIRA Dashboard 页面才加载 dashboard 数据; index.html 借用 gate 门只放行主界面
    if (cb) loadJiraProjects();
    // 2026-10-07: 进入看板默认开启自动刷新(每5分钟), 也可用"同步JIRA数据"按钮手动触发
    startAutoRefresh();
}

async function gateLoginSubmit() {
    var username = document.getElementById('gate-username').value.trim();
    var password = document.getElementById('gate-password').value;
    var errEl = document.getElementById('gate-login-err');
    if (!errEl) return;
    errEl.textContent = '';
    if (!username || !password) {
        errEl.textContent = '请输入用户名和密码';
        return;
    }
    try {
        var resp = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: username, password: password }),
            cache: 'no-store'
        });
        var data = await resp.json();
        if (data.success) {
            Dashboard.authToken = data.token;
            Dashboard.currentUser = (data.user && (data.user.name || data.user.username)) || username;
            Dashboard.userRole = data.user ? data.user.role : 'user';
            updateLoginUI();
            enterDashboard();
        } else {
            errEl.textContent = data.message || '用户名或密码错误';
        }
    } catch (err) {
        errEl.textContent = '登录失败，请稍后重试';
    }
}

async function doLogout() {
    try {
        await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {}
    Dashboard.authToken = null;
    Dashboard.currentUser = null;
    Dashboard.userRole = null;
    updateLoginUI();
    document.getElementById('control-bar').style.display = 'none';
    document.getElementById('quick-actions-section').style.display = 'none';
    hideAllData();
    showGateLogin();
}

function updateLoginUI() {
    var loginBtn = document.getElementById('login-btn');
    var logoutBtn = document.getElementById('logout-btn');
    var loginStatus = document.getElementById('login-status');

    if (Dashboard.currentUser) {
        loginBtn.style.display = 'none';
        logoutBtn.style.display = 'inline-block';
        var roleText = Dashboard.userRole === 'admin' ? '管理员' : (Dashboard.userRole === 'domain_owner' ? 'Domain Owner' : '用户');
        loginStatus.textContent = '欢迎, ' + Dashboard.currentUser + ' (' + roleText + ')';
    } else {
        loginBtn.style.display = 'inline-block';
        logoutBtn.style.display = 'none';
        loginStatus.textContent = '';
    }
}

async function verifyAuth() {
    try {
        var opts = { credentials: 'same-origin', cache: 'no-store' };
        if (__urlToken) opts.headers = { 'Authorization': 'Bearer ' + __urlToken };
        var resp = await fetch('/api/auth/verify', opts);
        var data = await resp.json();
        if (data.success && data.user && data.user.username) {
            Dashboard.authToken = data.token || Dashboard.authToken || __urlToken;
            Dashboard.currentUser = data.user.name || data.user.username;
            Dashboard.userRole = data.user.role;
            updateLoginUI();
            enterDashboard();
            return true;
        }
    } catch (e) {}
    return false;
}

// ============ Project Loading ============

async function loadJiraProjects() {
    try {
        var resp = await fetch('/api/data/jira-projects', { credentials: 'same-origin' });
        if (resp.status === 401) { handleAuthExpired(); return; }
        var data = await resp.json();
        if (data.success) {
            Dashboard.projects = data.projects;
            renderProjectSelect(data.projects);
        } else {
            showError('加载项目列表失败: ' + (data.error || '未知错误'));
        }
    } catch (err) {
        showError('请求项目列表失败: ' + err.message);
    }
}

function renderProjectSelect(projects) {
    var select = document.getElementById('project-select');
    select.innerHTML = '<option value="">-- 全部项目 --</option>';
    projects.forEach(function(p) {
        var opt = document.createElement('option');
        opt.value = p.key;
        opt.textContent = p.key + ' - ' + p.name;
        select.appendChild(opt);
    });
    // 门户项目透传: URL ?project=<key> 存在则选中并加载 (单选; 空=全部项目, 不处理)
    if (__urlProject) {
        var found = projects.some(function(p){ return p.key === __urlProject; });
        if (found) {
            select.value = __urlProject;
            Dashboard.selectedProjects = [];
            fetchDashboardData();
        }
    }
}

function onProjectChange() {
    var val = document.getElementById('project-select').value;
    if (document.getElementById('multi-project-mode').checked) {
        if (val && Dashboard.selectedProjects.indexOf(val) === -1) {
            Dashboard.selectedProjects.push(val);
            renderProjectChips();
        }
    }
}

function toggleMultiSelect() {
    var checked = document.getElementById('multi-project-mode').checked;
    if (!checked) {
        Dashboard.selectedProjects = [];
        renderProjectChips();
        document.getElementById('project-select').value = '';
    }
}

function addSelectedProject() {
    var val = document.getElementById('project-select').value;
    if (val && Dashboard.selectedProjects.indexOf(val) === -1) {
        Dashboard.selectedProjects.push(val);
        renderProjectChips();
    }
}

function removeProjectChip(projectKey) {
    Dashboard.selectedProjects = Dashboard.selectedProjects.filter(function(p) { return p !== projectKey; });
    renderProjectChips();
}

function renderProjectChips() {
    var container = document.getElementById('multi-project-chips');
    container.innerHTML = '';
    Dashboard.selectedProjects.forEach(function(p) {
        var chip = document.createElement('span');
        chip.className = 'project-chip';
        chip.appendChild(document.createTextNode(p));
        var removeBtn = document.createElement('span');
        removeBtn.className = 'chip-remove';
        removeBtn.textContent = '\u00d7';
        removeBtn.onclick = (function(projectKey) {
            return function() { removeProjectChip(projectKey); };
        })(p);
        chip.appendChild(removeBtn);
        container.appendChild(chip);
    });
}

// ============ Dashboard Data Fetch ============

function clearDashboard() {
    if (!confirm('确定要清空所有已加载的 JIRA 数据吗？\n（清空后需重新同步才能查看数据）')) return;

    // Clear data
    Dashboard.allBugs = [];
    Dashboard.selectedProjects = [];

    // Reset UI - hide all data sections
    document.getElementById('kpi-grid').style.display = 'none';
    document.getElementById('charts-grid').style.display = 'none';
    var bugTable = document.getElementById('bug-table-section');
    if (bugTable) bugTable.style.display = 'none';
    var trendSection = document.getElementById('trend-section');
    if (trendSection) trendSection.style.display = 'none';

    // Clear KPI values
    ['kpi-total', 'kpi-open', 'kpi-closed', 'kpi-today', 'kpi-week', 'kpi-avg', 'kpi-overdue', 'kpi-noprio'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.textContent = '0';
    });

    // Clear chart canvases
    ['chart-status', 'chart-severity', 'chart-owner', 'chart-domain', 'chart-age', 'chart-age-prio', 'chart-trend'].forEach(function(id) {
        var canvas = document.getElementById(id);
        if (canvas) {
            var ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    });

    // Clear bug table body
    var bugTbody = document.getElementById('bug-table-body');
    if (bugTbody) bugTbody.innerHTML = '';

    // Clear search results
    var searchResults = document.getElementById('quick-search-results');
    if (searchResults) {
        searchResults.style.display = 'none';
        searchResults.innerHTML = '';
    }

    // Clear search input
    var searchInput = document.getElementById('quick-search-keyword');
    if (searchInput) searchInput.value = '';

    // Reset project selectors
    document.getElementById('project-select').value = '';
    document.getElementById('multi-project-chips').innerHTML = '';

    // Reset auto-refresh
    document.getElementById('auto-refresh').value = '0';
    if (Dashboard.autoRefreshTimer) {
        clearInterval(Dashboard.autoRefreshTimer);
        Dashboard.autoRefreshTimer = null;
    }
    updateAutoRefreshStatus();

    showSyncStatus('✓ 数据已清空', 'success');
}

async function fetchDashboardData(opts) {
    opts = opts || {};
    showLoading(true);
    hideError();

    var singleProject = document.getElementById('project-select').value;
    var multiProjects = Dashboard.selectedProjects;
    var includeClosed = document.getElementById('include-closed').checked;

    var body = {
        includeClosed: includeClosed,
        maxResults: 500,
        // 缓存穿透标记：手动刷新/自动刷新都强制服务端重新向 JIRA 取数
        _ts: Date.now(),
        force: !!opts.force
    };

    // 报告日期筛选 (服务端过滤, 使表格/卡片/图表一致)
    var reportDateFrom = document.getElementById('report-date-from').value;
    var reportDateTo = document.getElementById('report-date-to').value;
    if (reportDateFrom) body.reportDateFrom = reportDateFrom;
    if (reportDateTo) body.reportDateTo = reportDateTo;

    if (multiProjects.length > 0) {
        body.projects = multiProjects;
    } else if (singleProject) {
        body.project = singleProject;
    }

    try {
        var resp = await fetch('/api/data/jira-dashboard', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            cache: 'no-store',
            body: JSON.stringify(body)
        });

        // Debug: check response status
        if (!resp.ok) {
            if (resp.status === 401) {
                handleAuthExpired();
                showLoading(false);
                return;
            }
            showError('请求失败: HTTP ' + resp.status);
            showLoading(false);
            return;
        }

        var data = await resp.json();
        console.log('[Dashboard] API response:', JSON.stringify(data).substring(0, 500));

        if (data.success) {
            Dashboard.allBugs = data.bugs || [];
            Dashboard.dataFetchedAt = new Date();   // 本次数据到手时间，SLA 面板标题会显示"数据截至"

            // 关键：明细表先渲染，且每步单独 try/catch —— 早先 Chart.js CDN 取不到时
            // renderCharts 抛 "Chart is not defined" 会把整条链打断，KPI 之后的
            // Bug 明细表/最后更新时间全部不执行（用户看到「列表不更新」）。
            try { populateTagFilter(Dashboard.allBugs); } catch (e1) { console.warn('[Dashboard] populateTagFilter:', e1.message); }
            try { fillDomainFilter(); } catch (e1b) { console.warn('[Dashboard] fillDomainFilter:', e1b.message); }
            try { renderKPI(data.stats); } catch (e2) { console.warn('[Dashboard] renderKPI:', e2.message); }
            try { slaDecorate(Dashboard.allBugs); } catch (e2b) { console.warn('[Dashboard] slaDecorate:', e2b.message); }
            try { renderBugTable(Dashboard.allBugs); } catch (e3) { console.warn('[Dashboard] renderBugTable:', e3.message); }
            try { renderCharts(data.charts); } catch (e4) { console.warn('[Dashboard] renderCharts:', e4.message); }
            try { renderSlaPanel(Dashboard.allBugs); } catch (e5) { console.warn('[Dashboard] renderSlaPanel:', e5.message); }

            var nowStr = new Date().toLocaleString('zh-CN');
            Dashboard.lastRefreshAt = nowStr;
            document.getElementById('kpi-grid').style.display = 'grid';
            document.getElementById('charts-grid').style.display = 'grid';
            document.getElementById('bug-table-section').style.display = 'block';
            var slaPanel = document.getElementById('sla-panel');
            if (slaPanel) slaPanel.style.display = 'block';
            document.getElementById('last-updated').style.display = 'block';
            document.getElementById('last-updated-text').textContent =
                '最后更新: ' + nowStr + ' · 共 ' + Dashboard.allBugs.length + ' 条';
            updateAutoRefreshStatus();
        } else {
            var errMsg = data.error || data.message || '未知错误';
            showError('获取数据失败: ' + errMsg);
        }
    } catch (err) {
        showError('请求失败: ' + err.message);
    }

    showLoading(false);
}

// ============ KPI Rendering ============

function renderKPI(stats) {
    if (!stats) return;
    animateNumber('kpi-total', stats.total || 0);
    animateNumber('kpi-open', stats.open || 0);
    animateNumber('kpi-closed', stats.closed || 0);
    animateNumber('kpi-today', stats.todayNew || 0);
    animateNumber('kpi-week', stats.weekClosed || 0);
    animateNumber('kpi-avg', stats.avgResolutionDays || 0);
    animateNumber('kpi-overdue', stats.overdue || 0);
    renderNoPrioKpi();
}

/* 所有 Bug 都必须设置优先级：未关闭且 JIRA 优先级为空的单在这里计数（>0 标红），点卡片 → 明细表筛出它们 */
function renderNoPrioKpi() {
    var openNoPrio = (Dashboard.allBugs || []).filter(function (b) {
        var st = String(b.status || '').toLowerCase();
        if (st === 'closed' || st === 'rejected' || st === 'done') return false;
        return !String(b.severity || '').trim();
    });
    Dashboard.noPrioCount = openNoPrio.length;
    animateNumber('kpi-noprio', openNoPrio.length);
    var card = document.getElementById('kpi-noprio-card');
    if (card) {
        card.classList.toggle('kpi-alert', openNoPrio.length > 0);
        card.title = openNoPrio.length
            ? ('未关闭 Bug 中有 ' + openNoPrio.length + ' 条没设 JIRA 优先级（这些单不参与 SLA 心跳提醒）· 点击筛选明细表')
            : '未关闭 Bug 全部已设置优先级 · 点击查看';
    }
}

/* severity 徽章：所有 Bug 都必须设置优先级 —— 空值不再让渲染崩（旧代码 bug.severity.charAt(0) 会 TypeError） */
function severityBadgeInfo(bug) {
    var s = String((bug && bug.severity) || '').toLowerCase().trim();
    if (!s) return { cls: 'severity-none', text: '未设置' };
    return { cls: 'severity-' + s, text: s.charAt(0).toUpperCase() + s.slice(1) };
}

/* JIRA 链接：jira-dashboard.html 是独立页（没有全局 App），
   一律走这个函数：bug.jiraUrl → App.jiraBaseUrl + key → '#'，绝不直接读 App 造成 ReferenceError */
function jiraHref(bug) {
    if (!bug) return '#';
    if (bug.jiraUrl) return bug.jiraUrl;
    var base = (typeof App !== 'undefined' && App && App.jiraBaseUrl) ? App.jiraBaseUrl : '';
    return base ? (base + (bug.bugId || '')) : '#';
}

var _animTimers = {};
function animateNumber(elementId, target) {
    var el = document.getElementById(elementId);
    if (!el) return;
    // Clear previous animation on this element
    if (_animTimers[elementId]) clearInterval(_animTimers[elementId]);
    var current = parseInt(el.textContent) || 0;
    var diff = target - current;
    if (diff === 0) { el.textContent = target; return; }
    var steps = 20;
    var step = Math.max(1, Math.ceil(Math.abs(diff) / steps));
    _animTimers[elementId] = setInterval(function() {
        if (diff > 0) { current += step; if (current >= target) current = target; }
        else { current -= step; if (current <= target) current = target; }
        el.textContent = current;
        if (current === target) { clearInterval(_animTimers[elementId]); delete _animTimers[elementId]; }
    }, 30);
}

// ============ Chart Rendering ============

var CHART_COLORS = {
    status: {
        open: '#f39c12',
        triage: '#3498db',
        implement: '#27ae60',
        closed: '#95a5a6',
        rejected: '#e74c3c'
    },
    severity: {
        highest: '#e74c3c',
        high: '#f39c12',
        medium: '#3498db',
        low: '#95a5a6',
        lowest: '#bdc3c7'
    },
    domain: [
        '#e74c3c', '#3498db', '#27ae60', '#f39c12', '#9b59b6',
        '#1abc9c', '#e67e22', '#34495e', '#2ecc71', '#e91e63',
        '#00bcd4', '#ff5722', '#8bc34a', '#673ab7', '#ffc107'
    ]
};

function renderCharts(charts) {
    if (!charts) return;

    // 深色主题: 图表文字/图例/网格线默认色 (canvas 绘制, CSS 无法覆盖)
    if (typeof Chart !== 'undefined') {
        Chart.defaults.color = '#333333';
        Chart.defaults.borderColor = 'rgba(0,0,0,0.10)';
    }

    // Destroy existing charts
    Object.keys(Dashboard.charts).forEach(function(key) {
        if (Dashboard.charts[key]) {
            Dashboard.charts[key].destroy();
            Dashboard.charts[key] = null;
        }
    });

    renderStatusChart(charts.statusCount);
    renderSeverityChart(charts.severityCount, charts.severityOpenCount);
    renderTrendChart(charts.dailyTrend);
    renderOwnerChart(charts.ownerOpenCount || charts.ownerCount);
    renderDomainChart(charts.domainCount);
    renderAgeChart(charts.ageBuckets);
    renderAgeByPriority();
}

function renderStatusChart(statusCount) {
    var ctx = document.getElementById('chart-status').getContext('2d');
    var labels = [];
    var data = [];
    var colors = [];

    var statusMap = {
        open: 'Open',
        triage: 'Triage',
        implement: 'Implement',
        closed: 'Closed',
        rejected: 'Rejected'
    };

    Object.keys(statusCount).forEach(function(key) {
        if (statusCount[key] > 0) {
            labels.push(statusMap[key] || key);
            data.push(statusCount[key]);
            colors.push(CHART_COLORS.status[key] || '#999');
        }
    });

    var total = data.reduce(function (a, b) { return a + b; }, 0);

    // 圆外引线标签需要的左右留白(按最长标签实测宽度动态预留, 避免文字被裁)
    var padCtx = document.createElement('canvas').getContext('2d');
    padCtx.font = 'bold 11.5px sans-serif';
    var maxLabelW = 0;
    labels.forEach(function (l, i) {
        var t = l + ' ' + data[i] + ' (' + Math.round(data[i] / (total || 1) * 100) + '%)';
        maxLabelW = Math.max(maxLabelW, padCtx.measureText(t).width);
    });
    var sidePad = Math.min(170, Math.max(74, Math.ceil(maxLabelW) + 26));

    if (Dashboard.charts.status) Dashboard.charts.status.destroy();

    Dashboard.charts.status = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '54%',
            layout: { padding: { top: 10, bottom: 10, left: sidePad, right: sidePad } },
            plugins: {
                pieLabel: false,                                  // 圆内不再写百分比(改圆外引线)
                legend: { display: false },                       // 标签已在圆外, 图例重复
                tooltip: {
                    callbacks: {
                        label: function (item) {
                            var v = item.parsed;
                            return item.label + ': ' + v + ' 条（占 '
                                + (total ? (v / total * 100).toFixed(1) : '0.0') + '%）';
                        }
                    }
                }
            }
        },
        plugins: [statusCalloutPlugin]
    });
}

function renderSeverityChart(severityCount, severityOpenCount) {
    var ctx = document.getElementById('chart-severity').getContext('2d');
    var labels = [];
    var openData = [];
    var closedData = [];
    var colors = [];

    var severityMap = {
        highest: 'Highest',
        high: 'High',
        medium: 'Medium',
        low: 'Low',
        lowest: 'Lowest'
    };
    var openMap = severityOpenCount || {};

    Object.keys(severityCount).forEach(function(key) {
        if (severityCount[key] > 0) {
            labels.push(severityMap[key] || key);
            var total = severityCount[key];
            var open = (openMap[key] !== undefined ? openMap[key] : total);
            openData.push(open);
            closedData.push(Math.max(0, total - open));
            colors.push(CHART_COLORS.severity[key] || '#999');
        }
    });

    if (Dashboard.charts.severity) Dashboard.charts.severity.destroy();

    // 自定义插件: 柱段上标注数字 (彩色=未关闭, 灰=已关闭)
    // ⚠ 绝不为了"看得见"放大段高 —— 旧实现给 <15px 的段补画 15px 矩形，
    //   导致 Highest「1 未关闭 / 9 已关闭」里那个 1 被画成 15px、盖住灰色段，看起来比 9 还高（2026-11-19 用户报的 bug）。
    //   现在：段高 >=14px 写在柱内；更小的段数字画到柱右侧（带细引导线 + 强制 13px 间距），柱体比例保持真实。
    var severityBarLabels = {
        id: 'severityBarLabels',
        afterDatasetsDraw: function(chart) {
            if (!chart || !chart.data || !chart.data.datasets[0]) return;
            var c = chart.ctx;
            var openArr = chart.data.datasets[0].data || [];
            var closeArr = chart.data.datasets[1].data || [];
            var MIN_IN = 14;
            function onColor(hex) {
                var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
                if (!m) return '#ffffff';
                var n = parseInt(m[1], 16);
                var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
                return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#333333' : '#ffffff';
            }
            function drawNum(text, x, y, color, align) {
                c.save();
                c.font = 'bold 12px "Microsoft YaHei", "DengXian", "Heiti SC", sans-serif';
                c.textAlign = align || 'center';
                c.textBaseline = 'middle';
                c.fillStyle = color;
                c.fillText(String(text), x, y);
                c.restore();
            }
            c.save();
            for (var i = 0; i < openArr.length; i++) {
                var open = openArr[i] || 0;
                var closed = closeArr[i] || 0;
                var el0 = chart.getDatasetMeta(0).data[i];
                var el1 = chart.getDatasetMeta(1).data[i];
                if (!el0 || !el1) continue;
                var barRight = el0.x + (el0.width || 0) / 2;
                var outside = [];
                if (open > 0) {
                    var h0 = Math.abs(el0.base - el0.y), mid0 = (el0.y + el0.base) / 2;
                    if (h0 >= MIN_IN) drawNum(open, el0.x, mid0, onColor(chart.data.datasets[0].backgroundColor[i]));
                    else outside.push({ y: mid0, segY: mid0, text: open, color: '#c0392b' });
                }
                if (closed > 0) {
                    var h1 = Math.abs(el1.base - el1.y), mid1 = (el1.y + el1.base) / 2;
                    if (h1 >= MIN_IN) drawNum(closed, el1.x, mid1, '#333333');
                    else outside.push({ y: mid1, segY: mid1, text: closed, color: '#7f8c8d' });
                }
                if (outside.length) {
                    outside.sort(function(a, b) { return a.y - b.y; });
                    var GAP = 13;
                    for (var k = 1; k < outside.length; k++) {
                        if (outside[k].y - outside[k - 1].y < GAP) outside[k].y = outside[k - 1].y + GAP;
                    }
                    var area = chart.chartArea;
                    var over = outside[outside.length - 1].y - (area.bottom - 6);
                    if (over > 0) outside.forEach(function(o) { o.y -= over; });
                    outside.forEach(function(o) {
                        if (Math.abs(o.y - o.segY) > 1) {
                            c.save();
                            c.strokeStyle = o.color;
                            c.globalAlpha = 0.45;
                            c.lineWidth = 1;
                            c.beginPath();
                            c.moveTo(barRight + 2, o.segY);
                            c.lineTo(barRight + 10, o.y);
                            c.stroke();
                            c.restore();
                        }
                        drawNum(o.text, barRight + 13, o.y, o.color, 'left');
                    });
                }
            }
            c.restore();
        }
    };

    Dashboard.charts.severity = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: '未关闭', data: openData, backgroundColor: colors, borderRadius: 4, stack: 'sev' },
                { label: '已关闭', data: closedData, backgroundColor: 'rgba(149,165,166,0.5)', borderRadius: 4, stack: 'sev' }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 28 } },
            plugins: {
                barDataLabel: false, /* 禁用全局 barDataLabel, 避免与 severityBarLabels 的段内数字重复 */
                legend: { display: true, position: 'top', labels: { padding: 12, font: { size: 11 }, filter: function(item) { return item.text !== '未关闭'; } } },
                tooltip: {
                    callbacks: {
                        title: function(items) {
                            return items && items.length ? items[0].label : '';
                        },
                        label: function(item) {
                            var open = item.datasetIndex === 0 ? item.parsed.y : 0;
                            if (item.datasetIndex === 1) {
                                var idx = item.dataIndex;
                                open = (item.chart.data.datasets[0].data[idx] || 0);
                            }
                            var total = open + (item.chart.data.datasets[1].data[item.dataIndex] || 0);
                            var segLabel = item.datasetIndex === 0 ? '未关闭' : '已关闭';
                            return segLabel + ': ' + item.parsed.y + '  (未关 ' + open + ' / 共 ' + total + ')';
                        }
                    }
                }
            },
            scales: {
                x: { stacked: true },
                y: { stacked: true, beginAtZero: true, grace: '30%', ticks: { stepSize: 1 } }
            }
        },
        plugins: [severityBarLabels]
    });
}

function renderTrendChart(dailyTrend) {
    var ctx = document.getElementById('chart-trend').getContext('2d');

    // Only show last 60 days
    var recentTrend = dailyTrend.slice(-60);

    var labels = recentTrend.map(function(d) { return d.date; });
    var newData = recentTrend.map(function(d) { return d.new; });
    var closedData = recentTrend.map(function(d) { return d.closed; });

    Dashboard.charts.trend = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '每日新增',
                    data: newData,
                    borderColor: '#e74c3c',
                    backgroundColor: 'rgba(231,76,60,0.1)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 2
                },
                {
                    label: '每日关闭',
                    data: closedData,
                    borderColor: '#27ae60',
                    backgroundColor: 'rgba(39,174,96,0.1)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                lineDataLabel: {},
                legend: { position: 'top' },
                zoom: {
                    zoom: {
                        wheel: { enabled: true },
                        pinch: { enabled: true },
                        mode: 'x',
                    },
                    pan: {
                        enabled: true,
                        mode: 'x',
                    }
                }
            },
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1 } },
                x: {
                    ticks: {
                        maxTicksLimit: 15,
                        font: { size: 10 }
                    }
                }
            }
        }
    });
}

/* ================= 按负责人分布: A 横向堆叠条 + B 可排序表格 =================
   2026-11-11: 修悬停串行(tooltip/interaction 需 axis:'y', 否则 Chart.js 按 x 最近取索引,
   同值行互相撞)、覆盖全部有未关闭 bug 的负责人、柱尾三段标注、点击行联动下方明细表；
   并新增表格视图(排序/搜索/CSV/精确数值)。数据源统一用 Dashboard.allBugs 现算。 */
var OWNER_CLOSED_STATUS = { closed: 1, rejected: 1, done: 1 };

function ownerIsOpen(status) { return !OWNER_CLOSED_STATUS[String(status || '').toLowerCase()]; }

function ownerDaysSince(dateStr) {
    if (!dateStr) return 0;
    var t = Date.parse(String(dateStr).replace(' ', 'T'));
    if (isNaN(t)) return 0;
    return Math.max(0, Math.floor((Date.now() - t) / 86400000));
}

function buildOwnerStats() {
    var bugs = (window.Dashboard && Dashboard.allBugs) || [];
    var map = {};
    for (var i = 0; i < bugs.length; i++) {
        var b = bugs[i];
        var name = String(b.owner || '').trim() || 'TBD';
        var o = map[name] || (map[name] = {
            owner: name, open: 0, closed: 0, total: 0, oldestOpenDays: 0, domains: {}, openList: []
        });
        o.total++;
        if (ownerIsOpen(b.status)) {
            o.open++;
            o.openList.push(b);
            var d = ownerDaysSince(b.reportDate);
            if (d > o.oldestOpenDays) o.oldestOpenDays = d;
        } else {
            o.closed++;
        }
        var dom = String(b.domain || '').trim();
        if (dom) o.domains[dom] = (o.domains[dom] || 0) + 1;
    }
    var arr = Object.keys(map).map(function (k) { return map[k]; });
    arr.forEach(function (o) {
        o.domainText = Object.keys(o.domains)
            .sort(function (a, b) { return o.domains[b] - o.domains[a]; }).join(' / ');
        o.openPct = o.total ? Math.round(o.open / o.total * 100) : 0;
    });
    arr.sort(function (a, b) {
        return (b.open - a.open) || (b.total - a.total) || String(a.owner).localeCompare(String(b.owner));
    });
    return arr;
}

/* ================= 按负责人分布 —— A 图表 / C 卡片 / B 表格 =================
   2026-11-11 第三版: 用户两轮反馈后的定稿
   ① 悬停串行 → interaction/tooltip 必须 axis:'y'
   ② 只画"有未关闭"的人 → 改为全量负责人入图
   ③ 三段标注 `4 · 0 · 4` 仍不直观 → 主图只画「未关闭」单一 KPI(条尾一个数字),
      已关闭降级为名字右侧灰字「总 N」; 顶部三个汇总 KPI; 默认 Top15 + 可展开;
      另增「卡片」视图(每人一张 KPI 卡, 会议投影友好)。
   数据源统一 Dashboard.allBugs 现算。 */
var OWNER_TOP_N = 15;

// 过滤钩子保留（默认空 = 全量口径）。
// 2026-11-16 回滚：曾把 Kaiyan Cheng / HBM 从「按负责人 / 按 Domain 分布」整块剔除，
// 结果两块的「未关闭/全项目总量/最重」都与顶部 KPI 卡(33 / 131)对不上，表述失真 → 恢复全量。
// 如以后只想在图形里隐藏、汇总仍按全量，请改在 rows 层过滤，不要动 stats。
var OWNER_HIDDEN = [];
var DOMAIN_HIDDEN = [];

function ownerIsOpen(status) { return !OWNER_CLOSED_STATUS[String(status || '').toLowerCase()]; }

function ownerDaysSince(dateStr) {
    if (!dateStr) return 0;
    var t = Date.parse(String(dateStr).replace(' ', 'T'));
    if (isNaN(t)) return 0;
    return Math.max(0, Math.floor((Date.now() - t) / 86400000));
}

function buildOwnerStats() {
    var bugs = (window.Dashboard && Dashboard.allBugs) || [];
    var map = {};
    for (var i = 0; i < bugs.length; i++) {
        var b = bugs[i];
        var name = String(b.owner || '').trim() || 'TBD';
        var o = map[name] || (map[name] = {
            owner: name, open: 0, closed: 0, total: 0, oldestOpenDays: 0, domains: {}, openList: []
        });
        o.total++;
        if (ownerIsOpen(b.status)) {
            o.open++;
            o.openList.push(b);
            var d = ownerDaysSince(b.reportDate);
            if (d > o.oldestOpenDays) o.oldestOpenDays = d;
        } else {
            o.closed++;
        }
        var dom = String(b.domain || '').trim();
        if (dom) o.domains[dom] = (o.domains[dom] || 0) + 1;
    }
    var arr = Object.keys(map).map(function (k) { return map[k]; });
    arr.forEach(function (o) {
        o.domainText = Object.keys(o.domains)
            .sort(function (a, b) { return o.domains[b] - o.domains[a]; }).join(' / ');
        o.openPct = o.total ? Math.round(o.open / o.total * 100) : 0;
    });
    arr.sort(function (a, b) {
        return (b.open - a.open) || (b.total - a.total) || String(a.owner).localeCompare(String(b.owner));
    });
    return arr;
}

/* ---------- 顶部三个汇总 KPI ---------- */
function renderOwnerSummary(stats) {
    var box = document.getElementById('owner-summary');
    if (!box) return;
    var totalBugs = stats.reduce(function (s, o) { return s + o.total; }, 0);
    var openBugs = stats.reduce(function (s, o) { return s + o.open; }, 0);
    var withOpen = stats.filter(function (o) { return o.open > 0; });
    var top = withOpen[0];
    var pct = (top && openBugs) ? (top.open / openBugs * 100).toFixed(1) : '0.0';   // 占「未关闭」的份额更有意义
    box.innerHTML =
        '<div class="owner-sum"><b>' + openBugs + '</b><span>未关闭 Bug</span></div>' +
        '<div class="owner-sum"><b>' + withOpen.length + '<i>/' + stats.length + '</i></b><span>有未关闭的负责人</span></div>' +
        '<div class="owner-sum"><b class="os-name">' + (top ? top.owner : '-') + '</b>' +
        '<span>最重 ' + (top ? top.open : 0) + ' 条 · 占未关闭 ' + pct + '%</span></div>' +
        '<div class="owner-sum"><b>' + totalBugs + '</b><span>全项目 Bug 总量</span></div>';
}

/* ---------- A: 单指标条形图(只画未关闭) ---------- */
function renderOwnerChart(ownerCount) {
    var canvas = document.getElementById('chart-owner');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');

    var stats = buildOwnerStats();
    Dashboard.ownerStats = stats;
    if (!stats.length && Array.isArray(ownerCount) && ownerCount.length) {
        stats = ownerCount.map(function (o) {
            var total = (o.total !== undefined ? o.total : o.count);
            return { owner: o.owner, open: o.count, closed: Math.max(0, total - o.count), total: total,
                     oldestOpenDays: 0, domainText: '', openPct: total ? Math.round(o.count / total * 100) : 0 };
        });
        Dashboard.ownerStats = stats;
    }

    // 需求：Kaiyan Cheng（最重 4 条）不参与「按负责人分布」
    stats = stats.filter(function (o) { return OWNER_HIDDEN.indexOf(String(o.owner || '').trim()) < 0; });
    Dashboard.ownerStats = stats;

    renderOwnerSummary(stats);
    renderOwnerCards(stats);
    renderOwnerTable();

    var withOpen = stats.filter(function (o) { return o.open > 0; });
    var showAll = !!Dashboard.ownerShowAll;
    var rows = showAll ? withOpen : withOpen.slice(0, OWNER_TOP_N);

    // 口径说明
    var note = document.getElementById('owner-scope-note');
    var totalBugs = stats.reduce(function (s, o) { return s + o.total; }, 0);
    var openBugs = stats.reduce(function (s, o) { return s + o.open; }, 0);
    var closedOnly = stats.filter(function (o) { return o.open === 0; });
    if (note) {
        note.textContent = '（' + withOpen.length + ' 人有未关闭 · ' + openBugs + ' 条'
            + (closedOnly.length ? '；另 ' + closedOnly.length + ' 人仅已关闭 ' + closedOnly.reduce(function (s, o) { return s + o.total; }, 0) + ' 条，见「卡片/表格」' : '')
            + '｜点任意行 → 明细表按负责人筛选）';
    }
    var more = document.getElementById('owner-more');
    if (more) {
        if (withOpen.length > OWNER_TOP_N) {
            more.innerHTML = showAll
                ? '<a href="javascript:void(0)" onclick="ownerExpand(false)">收起，只看前 ' + OWNER_TOP_N + ' 人</a>'
                : '<a href="javascript:void(0)" onclick="ownerExpand(true)">展开全部 ' + withOpen.length + ' 人'
                  + '（其余 ' + (withOpen.length - OWNER_TOP_N) + ' 人 ' + withOpen.slice(OWNER_TOP_N).reduce(function (s, o) { return s + o.open; }, 0) + ' 条未关闭）</a>';
        } else { more.innerHTML = ''; }
    }

    var holder = document.getElementById('owner-chart-holder');
    var wrap = document.getElementById('owner-chart-wrapper');
    var needH = Math.max(260, rows.length * 26 + 84);
    if (holder) holder.style.height = needH + 'px';
    if (wrap) {
        wrap.style.maxHeight = '520px';
        wrap.style.height = Math.min(needH, 520) + 'px';
        wrap.style.overflowY = (holder ? needH : rows.length * 26) > 520 ? 'auto' : 'hidden';
    }

    var labels = rows.map(function (o) { return o.owner; });
    var openData = rows.map(function (o) { return o.open; });

    if (Dashboard.charts.owner) Dashboard.charts.owner.destroy();

    // 条尾: 主数字(未关闭) + 右侧灰字次要信息(总 N · 最长 N 天)
    var ownerBarLabels = {
        id: 'ownerBarLabels',
        afterDatasetsDraw: function (chart) {
            if (!chart || !chart.data || !chart.data.datasets.length) return;
            var c = chart.ctx, area = chart.chartArea;
            var meta = chart.getDatasetMeta(0);
            c.save();
            c.textBaseline = 'middle';
            (meta.data || []).forEach(function (bar, i) {
                var o = rows[i]; if (!o) return;
                c.font = 'bold 13px sans-serif';
                c.fillStyle = o.open > 0 ? '#d68910' : '#7d879b';
                c.textAlign = 'left';
                c.fillText(String(o.open), bar.x + 8, bar.y);
                c.font = '11px sans-serif';
                c.fillStyle = '#777777';
                var sub = '总 ' + o.total + (o.open > 0 ? ' · 最长 ' + o.oldestOpenDays + ' 天' : '（已全部关闭）');
                c.fillText(sub, area.right + 34, bar.y);
            });
            c.restore();
        }
    };

    Dashboard.charts.owner = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: '未关闭', data: openData,
                backgroundColor: '#e67e22',
                borderRadius: 4, borderSkipped: false,
                barPercentage: 0.72, categoryPercentage: 0.86
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { right: 190, top: 4 } },
            // ⚠ 横向条形图必须 axis:'y'，否则 'index' 模式按 x 找最近元素会串行(实测 3/10)
            interaction: { mode: 'index', axis: 'y', intersect: false },
            onClick: function (evt, elements) {
                if (elements && elements.length && rows[elements[0].index]) {
                    applyOwnerFilterToTable(rows[elements[0].index].owner);
                }
            },
            onHover: function (evt, elements) {
                var cv = document.getElementById('chart-owner');
                if (cv) cv.style.cursor = (elements && elements.length) ? 'pointer' : 'default';
            },
            plugins: {
                legend: { display: false },
                barDataLabel: false,
                tooltip: {
                    mode: 'index', axis: 'y', intersect: false, displayColors: false,
                    callbacks: {
                        title: function (items) { return items.length ? items[0].label : ''; },
                        label: function (item) {
                            var o = rows[item.dataIndex] || {};
                            return '未关闭 ' + o.open + ' 条（共 ' + o.total + ' 条，占该人 ' + o.openPct + '%）';
                        },
                        footer: function (items) {
                            var o = rows[(items[0] || {}).dataIndex]; if (!o) return '';
                            return o.open > 0
                                ? ['最长未关闭 ' + o.oldestOpenDays + ' 天｜' + (o.domainText || '无 Domain'),
                                   '点击该行 → 下方明细表按该负责人筛选']
                                : ['当前无未关闭（历史 bug 已全部关闭）'];
                        }
                    }
                }
            },
            scales: {
                x: { beginAtZero: true, ticks: { stepSize: Math.max(1, Math.ceil(Math.max.apply(null, openData.concat([1])) / 6)) },
                     grid: { color: 'rgba(0,0,0,.06)' }, title: { display: true, text: '未关闭 Bug 数' } },
                y: { ticks: { autoSkip: false, font: { size: 11.5 } }, grid: { display: false } }
            }
        },
        plugins: [ownerBarLabels]
    });

    // 应用当前视图(图表/卡片/表格), 记住上次选择
    var saved = Dashboard.ownerView;
    if (!saved) { try { saved = localStorage.getItem('kpi_owner_view') || 'chart'; } catch (e) { saved = 'chart'; } }
    setOwnerView(saved);
}

function ownerExpand(all) {
    Dashboard.ownerShowAll = !!all;
    renderOwnerChart();
}

/* ---------- C: KPI 卡片网格 ---------- */
function renderOwnerCards(stats) {
    var box = document.getElementById('owner-cards');
    if (!box) return;
    stats = stats || Dashboard.ownerStats || buildOwnerStats();
    var withOpen = stats.filter(function (o) { return o.open > 0; });
    var closedOnly = stats.filter(function (o) { return o.open === 0; });
    var maxOpen = withOpen.reduce(function (m, o) { return Math.max(m, o.open); }, 1);

    function card(o, dim) {
        var w = Math.max(6, Math.round(o.open / maxOpen * 100));
        return '<div class="owner-card' + (dim ? ' oc-dim' : '') + '" data-owner="' + String(o.owner).replace(/"/g, '&quot;') + '">' +
            '<div class="oc-name" title="' + o.owner + '">' + o.owner + '</div>' +
            '<div class="oc-open">' + o.open + '<i>未关闭</i></div>' +
            '<div class="oc-bar"><b style="width:' + w + '%"></b></div>' +
            '<div class="oc-meta">总 ' + o.total + ' 条 · 占该人 ' + o.openPct + '%'
                + (o.open > 0 ? ' · 最长 ' + o.oldestOpenDays + ' 天' : '') + '</div>' +
            '<div class="oc-dom">' + (o.domainText || '-') + '</div>' +
            '</div>';
    }

    var html = '';
    withOpen.forEach(function (o) { html += card(o, false); });
    if (closedOnly.length) {
        html += '<div class="owner-divider">仅已关闭（' + closedOnly.length + ' 人 / '
            + closedOnly.reduce(function (s, o) { return s + o.total; }, 0) + ' 条历史 bug，当前无未关闭）</div>';
        closedOnly.forEach(function (o) { html += card(o, true); });
    }
    box.innerHTML = html || '<div class="oc-empty">暂无数据</div>';
    Array.prototype.forEach.call(box.querySelectorAll('.owner-card[data-owner]'), function (el) {
        el.addEventListener('click', function () { applyOwnerFilterToTable(el.getAttribute('data-owner')); });
    });
}

/* ---------- 视图切换: 图表 / 卡片 / 表格 ---------- */
function setOwnerView(view) {
    if (['chart', 'cards', 'table'].indexOf(view) < 0) view = 'chart';
    Dashboard.ownerView = view;
    try { localStorage.setItem('kpi_owner_view', view); } catch (e) {}
    var chartW = document.getElementById('owner-chart-wrapper');
    var more = document.getElementById('owner-more');
    var cards = document.getElementById('owner-cards');
    var tableW = document.getElementById('owner-table-wrap');
    var restNote = document.getElementById('owner-rest-note');
    if (chartW) chartW.style.display = view === 'chart' ? 'block' : 'none';
    if (more) more.style.display = view === 'chart' ? 'block' : 'none';
    if (cards) cards.style.display = view === 'cards' ? 'grid' : 'none';
    if (tableW) tableW.style.display = view === 'table' ? 'block' : 'none';
    if (restNote) restNote.style.display = view === 'table' ? 'none' : 'block';
    Array.prototype.forEach.call(document.querySelectorAll('.owner-tab'), function (t) {
        t.classList.toggle('active', t.getAttribute('data-view') === view);
    });
    if (view === 'cards') renderOwnerCards();
    if (view === 'table') renderOwnerTable();
    if (view === 'chart' && Dashboard.charts.owner) { try { Dashboard.charts.owner.resize(); } catch (e) {} }
}
// 兼容旧调用
function toggleOwnerView() {
    var t = document.getElementById('owner-table-wrap');
    setOwnerView(t && getComputedStyle(t).display !== 'none' ? 'chart' : 'table');
}

/* ---------- B: 负责人表格（排序 / 搜索 / CSV / 点击筛选明细） ---------- */
var OWNER_TABLE_COLS = [
    { key: 'owner', label: '负责人', align: 'left' },
    { key: 'open', label: '未关闭', align: 'right' },
    { key: 'closed', label: '已关闭', align: 'right' },
    { key: 'total', label: '合计', align: 'right' },
    { key: 'openPct', label: '未关闭占比', align: 'left' },
    { key: 'oldestOpenDays', label: '最长未关闭(天)', align: 'right' },
    { key: 'domainText', label: '涉及 Domain', align: 'left' }
];

function ownerTableSort(col) {
    if (!Dashboard.ownerSort) Dashboard.ownerSort = { col: 'open', dir: -1 };
    if (Dashboard.ownerSort.col === col) Dashboard.ownerSort.dir = -Dashboard.ownerSort.dir;
    else Dashboard.ownerSort = { col: col, dir: (col === 'owner' || col === 'domainText') ? 1 : -1 };
    renderOwnerTable();
}

function renderOwnerTable() {
    var table = document.getElementById('owner-table');
    if (!table) return;
    var stats = (Dashboard.ownerStats || buildOwnerStats()).slice();
    var searchEl = document.getElementById('owner-tbl-search');
    var kw = String((searchEl && searchEl.value) || '').trim().toLowerCase();
    if (kw) {
        stats = stats.filter(function (o) {
            return String(o.owner).toLowerCase().indexOf(kw) >= 0 ||
                   String(o.domainText).toLowerCase().indexOf(kw) >= 0;
        });
    }
    var sort = Dashboard.ownerSort || { col: 'open', dir: -1 };
    stats.sort(function (a, b) {
        var va = a[sort.col], vb = b[sort.col];
        if (typeof va === 'string' || typeof vb === 'string') {
            return String(va || '').localeCompare(String(vb || '')) * sort.dir;
        }
        return ((va || 0) - (vb || 0)) * sort.dir;
    });

    var maxTotal = stats.reduce(function (m, o) { return Math.max(m, o.total); }, 1);
    var h = '<thead><tr>';
    OWNER_TABLE_COLS.forEach(function (c) {
        var cls = (sort.col === c.key) ? (sort.dir > 0 ? 'sort-asc' : 'sort-desc') : '';
        h += '<th class="' + cls + '" style="text-align:' + c.align + '" data-col="' + c.key + '">' + c.label + '</th>';
    });
    h += '</tr></thead><tbody>';
    if (!stats.length) {
        h += '<tr><td colspan="' + OWNER_TABLE_COLS.length + '" style="text-align:center;color:#8b93a7;padding:14px;">无匹配负责人</td></tr>';
    }
    stats.forEach(function (o) {
        var barW = Math.round((o.total / maxTotal) * 100);
        var fillW = o.total ? Math.round((o.open / o.total) * 100) : 0;
        h += '<tr data-owner="' + String(o.owner).replace(/"/g, '&quot;') + '"'
           + ' class="' + (o.open === 0 ? 'owner-only-closed' : '') + '">'
           + '<td>' + o.owner + '</td>'
           + '<td style="text-align:right" class="owner-cell-open">' + o.open + '</td>'
           + '<td style="text-align:right">' + o.closed + '</td>'
           + '<td style="text-align:right">' + o.total + '</td>'
           + '<td><div class="owner-bar-track" style="width:' + barW + '%">'
           + '<div class="owner-bar-fill" style="width:' + fillW + '%"></div></div>'
           + '<span class="owner-pct-txt">' + o.openPct + '%</span></td>'
           + '<td style="text-align:right">' + (o.open ? o.oldestOpenDays : '-') + '</td>'
           + '<td class="owner-domain-cell">' + (o.domainText || '-') + '</td></tr>';
    });
    h += '</tbody>';
    table.innerHTML = h;

    Array.prototype.forEach.call(table.querySelectorAll('th[data-col]'), function (th) {
        th.addEventListener('click', function () { ownerTableSort(th.getAttribute('data-col')); });
    });
    Array.prototype.forEach.call(table.querySelectorAll('tbody tr[data-owner]'), function (tr) {
        tr.addEventListener('click', function () { applyOwnerFilterToTable(tr.getAttribute('data-owner')); });
    });
    var cnt = document.getElementById('owner-tbl-count');
    if (cnt) cnt.textContent = '共 ' + stats.length + ' 人（未关闭 ' + stats.reduce(function (s, o) { return s + o.open; }, 0)
        + ' · 已关闭 ' + stats.reduce(function (s, o) { return s + o.closed; }, 0) + '）';
}


function applyOwnerFilterToTable(owner) {
    var el = document.getElementById('filter-owner');
    if (!el) return;
    el.value = owner;
    var stats = (Dashboard.ownerStats || []).filter(function (o) { return o.owner === owner; })[0];
    var sc = document.getElementById('show-closed');
    if (sc && stats && stats.open === 0) sc.checked = true;   // 仅已关闭的负责人: 自动显示已关闭
    var sec = document.getElementById('bug-table-section');
    if (sec) sec.style.display = 'block';
    if (typeof applyTableFilters === 'function') applyTableFilters();
    if (sec && sec.scrollIntoView) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function exportOwnerTableCsv() {
    var stats = Dashboard.ownerStats || buildOwnerStats();
    var head = ['负责人', '未关闭', '已关闭', '合计', '未关闭占比%', '最长未关闭天数', '涉及Domain'];
    var lines = [head.join(',')];
    stats.forEach(function (o) {
        var row = [o.owner, o.open, o.closed, o.total, o.openPct, o.oldestOpenDays, o.domainText]
            .map(function (v) { var s = String(v === undefined || v === null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; });
        lines.push(row.join(','));
    });
    var blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'owner-distribution-' + (Dashboard.selectedProject || 'all') + '-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}

/* ================= 按 Domain 分布 —— 外部引线标注 + 与「按负责人分布」同款卡片 =================
   2026-11-11: 用户要求"用引线把标识显示在 pie 图外面，再在显示上调整，和旁边的按负责人分布匹配上"。
   做法: ① 口径与负责人卡一致(主指标=未关闭, 已关闭降级为次要信息);
         ② 头部同款 h3 + 口径说明, 顶部同款 .owner-summary 四宫格 KPI;
         ③ 环形图关掉 legend, 用自绘引线把「Domain 名称 + 条数(占比)」标在圆外, 并做纵向防重叠;
         ④ 零未关闭的 Domain 不进饼图, 在图下灰字列出。 */
function buildDomainStats() {
    var bugs = (window.Dashboard && Dashboard.allBugs) || [];
    var map = {}, i, b;
    for (i = 0; i < bugs.length; i++) {
        b = bugs[i];
        var d = String(b.domain || '').trim() || 'TBD';
        var o = map[d] || (map[d] = { domain: d, open: 0, closed: 0, total: 0 });
        o.total++;
        if (ownerIsOpen(b.status)) o.open++; else o.closed++;
    }
    var arr = Object.keys(map).map(function (k) { return map[k]; });
    arr.sort(function (a, b2) {
        return (b2.open - a.open) || (b2.total - a.total) || String(a.domain).localeCompare(String(b2.domain));
    });
    return arr;
}

function renderDomainSummary(stats) {
    var box = document.getElementById('domain-summary');
    if (!box) return;
    var totalBugs = stats.reduce(function (s, o) { return s + o.total; }, 0);
    var openBugs = stats.reduce(function (s, o) { return s + o.open; }, 0);
    var withOpen = stats.filter(function (o) { return o.open > 0; });
    var top = withOpen[0];
    var pct = (top && openBugs) ? (top.open / openBugs * 100).toFixed(1) : '0.0';
    box.innerHTML =
        '<div class="owner-sum"><b>' + openBugs + '</b><span>未关闭 Bug</span></div>' +
        '<div class="owner-sum"><b>' + withOpen.length + '<i>/' + stats.length + '</i></b><span>有未关闭的 Domain</span></div>' +
        '<div class="owner-sum"><b class="os-name">' + (top ? top.domain : '-') + '</b>' +
        '<span>最重 ' + (top ? top.open : 0) + ' 条 · 占未关闭 ' + pct + '%</span></div>' +
        '<div class="owner-sum"><b>' + totalBugs + '</b><span>全项目 Bug 总量</span></div>';
}

/* 引线标注布局: 输入 arc 元信息, 输出每条标签的绘制坐标(已做纵向防重叠 + 上下越界夹取)
   2026-11-16 修: 旧版只夹底端, 顶端越界的标签会被画到画布外
   (Bug 状态分布的 Open 弧中点在 -83°, 折点 y=cy-(R+16)=-4 → 标签整行看不见) */
function layoutDomainCallouts(items, area, minGap) {
    minGap = minGap || 15;
    var topLimit = area.top + 8;
    var bottomLimit = area.bottom - 6;
    // 折点本身也夹进绘图区, 否则引线会画到画布外(顶端弧尤其明显)
    items.forEach(function (it) {
        it.y2 = Math.max(area.top + 2, Math.min(bottomLimit, it.y2));
    });
    var sides = { 1: [], '-1': [] };
    items.forEach(function (it) { (sides[it.side] = sides[it.side] || []).push(it); });
    Object.keys(sides).forEach(function (k) {
        var list = sides[k].sort(function (a, b) { return a.y2 - b.y2; });
        var last = -1e9;
        list.forEach(function (it) {
            var y = Math.max(it.y2, last + minGap);
            if (y < topLimit) y = topLimit;          // 顶端越界: 先夹到顶, 后面按 minGap 顺延
            it.labelY = y; last = y;
        });
        // 越界回推
        var overflow = (list.length ? list[list.length - 1].labelY : 0) - bottomLimit;
        if (overflow > 0) {
            for (var i = list.length - 1; i >= 0; i--) {
                list[i].labelY = Math.min(list[i].labelY, (i === list.length - 1 ? bottomLimit : list[i + 1].labelY - minGap));
                if (list[i].labelY < topLimit) list[i].labelY = topLimit + (list.length - 1 - i) * minGap;
            }
        }
    });
    return items;
}

// 「Bug 状态分布」圆外引线标签: 弧边 -> 折点 -> 固定标签列, 中心显示总数
var statusCalloutPlugin = {
    id: 'statusCallout',
    afterDatasetsDraw: function (chart) {
        if (!chart || chart.config.type !== 'doughnut') return;
        var dataset = chart.data.datasets[0];
        var meta = chart.getDatasetMeta(0);
        var arcs = meta.data || [];
        if (!arcs.length) return;
        var total = dataset.data.reduce(function (a, b) { return a + b; }, 0);
        if (!total) return;
        var c = chart.ctx, area = chart.chartArea;
        var R = arcs[0].outerRadius, cx = arcs[0].x, cy = arcs[0].y;

        var items = [];
        arcs.forEach(function (arc, i) {
            var v = dataset.data[i];
            if (!v) return;
            var mid = (arc.startAngle + arc.endAngle) / 2;
            var side = Math.cos(mid) >= 0 ? 1 : -1;
            items.push({
                i: i, value: v, side: side,
                color: Array.isArray(dataset.backgroundColor) ? dataset.backgroundColor[i] : dataset.backgroundColor,
                x1: cx + Math.cos(mid) * (R + 2), y1: cy + Math.sin(mid) * (R + 2),
                x2: cx + Math.cos(mid) * (R + 16), y2: cy + Math.sin(mid) * (R + 16),
                text: (chart.data.labels[i] || '') + ' ' + v + ' (' + Math.round(v / total * 100) + '%)'
            });
        });

        layoutDomainCallouts(items, area, 15);

        var COL_GAP = 12, TEXT_GAP = 8;
        var rightCol = area.right + COL_GAP;
        var leftCol = area.left - COL_GAP;
        // 文字预留区宽度(超宽则截断加省略号, 保证永远不出画布 —— 与「按 Domain 分布」同款兜底)
        var availW = Math.max(40, (chart.width - rightCol - TEXT_GAP));
        var availWL = Math.max(40, (leftCol - TEXT_GAP));

        c.save();
        c.textBaseline = 'middle';
        c.textAlign = 'center';
        c.font = 'bold 24px sans-serif';
        c.fillStyle = '#333333';
        c.fillText(String(total), cx, cy - 8);
        c.font = '11px sans-serif';
        c.fillStyle = '#777777';
        c.fillText('总 Bug', cx, cy + 12);

        c.font = 'bold 11.5px sans-serif';
        items.forEach(function (it) {
            var isRight = it.side > 0;
            var colX = isRight ? rightCol : leftCol;
            var turnX = isRight ? Math.min(it.x2, colX - 10) : Math.max(it.x2, colX + 10);

            c.strokeStyle = it.color || '#777777';
            c.lineWidth = 1.4;
            c.beginPath();
            c.moveTo(it.x1, it.y1);
            c.lineTo(turnX, it.y2);
            c.lineTo(colX, it.labelY);
            c.stroke();

            c.fillStyle = it.color || '#777777';
            c.beginPath();
            c.arc(colX, it.labelY, 2, 0, Math.PI * 2);
            c.fill();

            var maxW = isRight ? availW : availWL;
            var txt = it.text;
            if (c.measureText(txt).width > maxW) {
                while (txt.length > 3 && c.measureText(txt + '…').width > maxW) txt = txt.slice(0, -1);
                txt += '…';
            }
            c.fillStyle = '#333333';
            c.textAlign = isRight ? 'left' : 'right';
            c.fillText(txt, isRight ? (colX + TEXT_GAP) : (colX - TEXT_GAP), it.labelY);
        });
        c.restore();
    }
};

var domainCalloutPlugin = {
    id: 'domainCallout',
    afterDatasetsDraw: function (chart) {
        if (!chart || chart.config.type !== 'doughnut') return;
        var dataset = chart.data.datasets[0];
        var meta = chart.getDatasetMeta(0);
        var arcs = meta.data || [];
        if (!arcs.length) return;
        var total = dataset.data.reduce(function (a, b) { return a + b; }, 0);
        if (!total) return;
        var c = chart.ctx, area = chart.chartArea;
        var R = arcs[0].outerRadius, cx = arcs[0].x, cy = arcs[0].y;

        var items = [];
        arcs.forEach(function (arc, i) {
            var v = dataset.data[i];
            if (!v) return;
            var mid = (arc.startAngle + arc.endAngle) / 2;
            var side = Math.cos(mid) >= 0 ? 1 : -1;
            items.push({
                i: i, value: v, side: side,
                color: Array.isArray(dataset.backgroundColor) ? dataset.backgroundColor[i] : dataset.backgroundColor,
                x1: cx + Math.cos(mid) * (R + 2), y1: cy + Math.sin(mid) * (R + 2),
                x2: cx + Math.cos(mid) * (R + 16), y2: cy + Math.sin(mid) * (R + 16),
                text: (chart.data.labels[i] || '') + ' ' + v + ' (' + Math.round(v / total * 100) + '%)'
            });
        });

        layoutDomainCallouts(items, area, 15);

        // 固定标签列: 引线水平段一律拉到绘图区外侧的列, 文字放在预留 padding 里,
        // 避免"折点落在画布最左/最右 → 文字被裁"(实测 Silicon/Profiling/KMD/SW 被裁 10~24px)
        var COL_GAP = 12, TEXT_GAP = 8;
        var rightCol = area.right + COL_GAP;
        var leftCol = area.left - COL_GAP;
        var availW = Math.max(40, (chart.width - rightCol - TEXT_GAP));
        var availWL = Math.max(40, (leftCol - TEXT_GAP));

        c.save();
        c.textBaseline = 'middle';
        // 圆心总数(与负责人卡的大数字呼应)
        c.textAlign = 'center';
        c.font = 'bold 26px sans-serif';
        c.fillStyle = '#e67e22';
        c.fillText(String(total), cx, cy - 9);
        c.font = '11px sans-serif';
        c.fillStyle = '#777777';
        c.fillText('未关闭', cx, cy + 13);

        c.font = 'bold 11.5px sans-serif';
        items.forEach(function (it) {
            var isRight = it.side > 0;
            var colX = isRight ? rightCol : leftCol;
            // 引线: 弧边 → 折点(夹在圆弧与标签列之间) → 固定列
            var turnX = isRight ? Math.min(it.x2, colX - 10) : Math.max(it.x2, colX + 10);
            c.strokeStyle = it.color || '#777777';
            c.lineWidth = 1.4;
            c.beginPath();
            c.moveTo(it.x1, it.y1);
            c.lineTo(turnX, it.y2);
            c.lineTo(colX, it.labelY);
            c.stroke();
            // 弧边小圆点
            c.fillStyle = it.color || '#777777';
            c.beginPath(); c.arc(it.x1, it.y1, 2.2, 0, Math.PI * 2); c.fill();
            // 文字(放在预留区, 超宽则截断加省略号, 保证永远不出画布)
            var maxW = isRight ? availW : availWL;
            var txt = it.text;
            if (c.measureText(txt).width > maxW) {
                while (txt.length > 3 && c.measureText(txt + '…').width > maxW) txt = txt.slice(0, -1);
                txt += '…';
            }
            c.fillStyle = '#333333';
            c.textAlign = isRight ? 'left' : 'right';
            c.fillText(txt, isRight ? (colX + TEXT_GAP) : (colX - TEXT_GAP), it.labelY);
        });
        c.restore();
    }
};

function renderDomainChart(domainCount) {
    var canvas = document.getElementById('chart-domain');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');

    var stats = buildDomainStats();
    if (!stats.length && Array.isArray(domainCount) && domainCount.length) {
        stats = domainCount.map(function (d) { return { domain: d.domain, open: d.count, closed: 0, total: d.count }; });
    }
    // 需求：HBM（最重 7 条）不参与「按 Domain 分布」
    var hiddenDomain = [];
    stats = stats.filter(function (o) {
        if (DOMAIN_HIDDEN.indexOf(String(o.domain || '').trim()) < 0) return true;
        hiddenDomain.push(o.domain + '(' + o.open + ')');
        return false;
    });
    var withOpen = stats.filter(function (o) { return o.open > 0; });
    var idle = stats.filter(function (o) { return o.open === 0; });
    var openBugs = stats.reduce(function (s, o) { return s + o.open; }, 0);

    renderDomainSummary(stats);

    var note = document.getElementById('domain-scope-note');
    if (note) {
        note.textContent = '（主指标=未关闭 ' + openBugs + ' 条 / ' + withOpen.length + ' 个 Domain'
            + (idle.length ? '；另 ' + idle.length + ' 个已全部关闭' : '')
            + (hiddenDomain.length ? '；已隐藏 ' + hiddenDomain.join('、') : '')
            + '｜引线标注: 名称 条数(占未关闭%)）';
    }
    var rest = document.getElementById('domain-rest-note');
    if (rest) {
        if (idle.length) {
            rest.style.display = 'block';
            rest.textContent = '未入图（有历史 bug 但当前无未关闭）: '
                + idle.map(function (o) { return o.domain + '(' + o.total + ')'; }).join('、');
        } else { rest.style.display = 'none'; rest.textContent = ''; }
    }

    // Top9 + 聚合扇区合并, 避免圆外标签过密
    var MAXS = 9;
    var rows = withOpen.slice(0, MAXS);
    if (withOpen.length > MAXS) {
        var restRows = withOpen.slice(MAXS);
        rows = rows.concat([{
            domain: 'Others',                // 用户点名: 聚合扇区只写「Others」(不带中文/不带 Domain 个数)
            isOther: true,                   // 聚合标记: 点击保护用, 不再靠字符串前缀判断
            open: restRows.reduce(function (s, o) { return s + o.open; }, 0),
            total: restRows.reduce(function (s, o) { return s + o.total; }, 0),
            openPct: 0
        }]);
    }
    var labels = rows.map(function (o) { return o.domain; });
    var data = rows.map(function (o) { return o.open; });
    // 与「按负责人分布」同源配色(主题霓虹色), 不再用旧的 CHART_COLORS.domain 调色板
    var palette = ['#e67e22', '#4f8cff', '#27ae60', '#d68910', '#b57bff', '#22d3ee', '#e74c3c', '#6a5cff', '#2ecc71', '#95a5a6'];
    var colors = data.map(function (_, i) { return palette[i % palette.length]; });

    // 依据最长标签宽度动态预留左右 padding(保证圆外标签永远在画布内)
    var padCtx = document.createElement('canvas').getContext('2d');
    padCtx.font = 'bold 11.5px sans-serif';
    var maxLabelW = 0;
    rows.forEach(function (o, i) {
        var t = o.domain + ' ' + o.open + ' (' + Math.round((o.open / (openBugs || 1)) * 100) + '%)';
        maxLabelW = Math.max(maxLabelW, padCtx.measureText(t).width);
    });
    var sidePad = Math.min(180, Math.max(84, Math.ceil(maxLabelW) + 26));

    var wrap = document.getElementById('domain-chart-wrapper');
    if (wrap) wrap.style.height = '430px';

    if (Dashboard.charts.domain) Dashboard.charts.domain.destroy();

    Dashboard.charts.domain = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: labels, datasets: [{ data: data, backgroundColor: colors, borderColor: '#151b28', borderWidth: 2, hoverOffset: 6 }] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '54%',
            layout: { padding: { top: 14, bottom: 14, left: sidePad, right: sidePad } },
            // 点扇区 → 明细表按该 Domain 过滤(「Others」是聚合扇区, 不可单点)
            onClick: function (evt, elements) {
                if (!elements || !elements.length) return;
                var o = rows[elements[0].index];
                if (!o || !o.domain || o.isOther) return;
                setDomainFilterToTable(o.domain);
            },
            onHover: function (evt, elements) {
                var cv = document.getElementById('chart-domain');
                var clickable = !!(elements && elements.length) && !(rows[elements[0].index] || {}).isOther;
                if (cv) cv.style.cursor = clickable ? 'pointer' : 'default';
            },
            plugins: {
                legend: { display: false },       // 标签已在圆外, 不再重复图例
                pieLabel: false,                  // 关掉全局 pieLabel 的圆内百分比, 避免与圆外引线重复
                tooltip: {
                    displayColors: true,
                    callbacks: {
                        label: function (item) {
                            var o = rows[item.dataIndex] || {};
                            var pct = openBugs ? (o.open / openBugs * 100).toFixed(1) : '0.0';
                            if (o.isOther) {
                                var nDom = withOpen.length - MAXS;
                                return '未关闭 ' + o.open + ' 条（占未关闭 ' + pct + '%，聚合其余 ' + nDom + ' 个 Domain 共 ' + o.total + ' 条）';
                            }
                            return '未关闭 ' + o.open + ' 条（占未关闭 ' + pct + '%，该 Domain 共 ' + o.total + ' 条）';
                        }
                    }
                }
            }
        },
        plugins: [domainCalloutPlugin]
    });
}

function renderAgeChart(ageBuckets) {
    var ctx = document.getElementById('chart-age').getContext('2d');

    var labels = Object.keys(ageBuckets);
    var data = Object.values(ageBuckets);
    var colors = ['#27ae60', '#f1c40f', '#e67e22', '#e74c3c', '#8e44ad'];

    Dashboard.charts.age = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Bug 数量',
                data: data,
                backgroundColor: colors,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 18 } },
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1 } }
            }
        }
    });
}

// ============ Bug 年龄 × 优先级（indicator，2026-11-19）============
/* 口径：只看未关闭 Bug（status 非 closed/rejected/done，与「未关闭Bug年龄分布」一致）；
   年龄 = bug.ageDays（后端按 JIRA createdTimestamp 毫秒算，报告日→今天）；
   分桶与既有年龄图一致：0-3 / 3-7 / 7-14 / 14-30 / 30天+。
   主图单一指标 = 平均年龄(天)，条尾灰字「N 条 · 最长 M 天」；年龄结构看「表格」热力矩阵。 */
var AGE_PRIO_ORDER = [
    { key: 'highest', label: 'Highest' }, { key: 'high', label: 'High' },
    { key: 'medium', label: 'Medium' }, { key: 'low', label: 'Low' },
    { key: 'lowest', label: 'Lowest' }, { key: '', label: '未设置' }
];
var AGE_PRIO_COLORS = { highest: '#e74c3c', high: '#f39c12', medium: '#3498db', low: '#95a5a6', lowest: '#bdc3c7', '': '#7f8c8d' };
var AGE_BUCKET_DEFS = [
    { label: '0-3天', test: function (d) { return d <= 3; } },
    { label: '3-7天', test: function (d) { return d > 3 && d <= 7; } },
    { label: '7-14天', test: function (d) { return d > 7 && d <= 14; } },
    { label: '14-30天', test: function (d) { return d > 14 && d <= 30; } },
    { label: '30天+', test: function (d) { return d > 30; } }
];

function agePrioKey(bug) {
    var k = String((bug && bug.severity) || '').toLowerCase();
    return (/^(highest|high|medium|low|lowest)$/.test(k)) ? k : '';
}

function buildAgePrioStats() {
    var open = (Dashboard.allBugs || []).filter(function (b) {
        var st = String(b.status || '').toLowerCase();
        return st !== 'closed' && st !== 'rejected' && st !== 'done';
    });
    var map = {};
    open.forEach(function (b) {
        var k = agePrioKey(b);
        if (!map[k]) {
            map[k] = { key: k, count: 0, ages: [], buckets: AGE_BUCKET_DEFS.map(function () { return 0; }), oldest: null };
        }
        var g = map[k];
        var d = (typeof b.ageDays === 'number' && isFinite(b.ageDays)) ? b.ageDays : 0;
        g.count++;
        g.ages.push(d);
        for (var i = 0; i < AGE_BUCKET_DEFS.length; i++) {
            if (AGE_BUCKET_DEFS[i].test(d)) { g.buckets[i]++; break; }
        }
        if (!g.oldest || d > g.oldest.ageDays) {
            g.oldest = { bugId: b.bugId, ageDays: d, owner: b.owner || '', summary: b.summary || '' };
        }
    });
    return AGE_PRIO_ORDER.map(function (o) {
        var g = map[o.key];
        if (!g) return null;
        var sorted = g.ages.slice().sort(function (a, b) { return a - b; });
        var sum = sorted.reduce(function (a, b) { return a + b; }, 0);
        var mid = sorted.length
            ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2)
            : 0;
        g.label = o.label;
        g.avg = sorted.length ? Math.round(sum / sorted.length * 10) / 10 : 0;
        g.median = Math.round(mid * 10) / 10;
        g.max = sorted.length ? sorted[sorted.length - 1] : 0;
        g.old30 = g.buckets[AGE_BUCKET_DEFS.length - 1];
        return g;
    }).filter(Boolean);
}

function renderAgePrioSummary(stats) {
    var box = document.getElementById('age-prio-summary');
    if (!box) return;
    var total = stats.reduce(function (s, g) { return s + g.count; }, 0);
    // 平均值按条数加权（各档 avg × count 反推，避免再扫一遍全量）
    var wAvg = total ? stats.reduce(function (s, g) { return s + g.avg * g.count; }, 0) / total : 0;
    var old30 = stats.reduce(function (s, g) { return s + g.old30; }, 0);
    var worst = stats.slice().sort(function (a, b) { return b.avg - a.avg; })[0];
    box.innerHTML =
        '<div class="owner-sum"><b>' + total + '</b><span>未关闭 Bug</span></div>' +
        '<div class="owner-sum"><b>' + (Math.round(wAvg * 10) / 10) + '</b><span>平均年龄（天）</span></div>' +
        '<div class="owner-sum"><b class="os-name">' + (worst ? worst.label : '-') + '</b><span>最老优先级 · 平均 ' + (worst ? worst.avg : 0) + ' 天</span></div>' +
        '<div class="owner-sum"><b>' + old30 + '</b><span>30天+ 未关闭 · 占 ' + (total ? (old30 / total * 100).toFixed(1) : '0.0') + '%</span></div>';
}

function renderAgePrioCards(stats) {
    var box = document.getElementById('age-prio-cards');
    if (!box) return;
    if (!stats.length) { box.innerHTML = '<div class="oc-empty">暂无未关闭 Bug</div>'; return; }
    var maxAvg = stats.reduce(function (m, g) { return Math.max(m, g.avg); }, 1) || 1;
    box.innerHTML = stats.map(function (g) {
        var w = Math.max(6, Math.round(g.avg / maxAvg * 100));
        return '<div class="owner-card" data-prio="' + g.key + '" title="点击 → 明细表按 ' + g.label + ' 筛选">' +
            '<div class="oc-name">' + g.label + '</div>' +
            '<div class="oc-open">' + g.avg + '<i>天 平均</i></div>' +
            '<div class="oc-bar"><b style="width:' + w + '%;background:' + (AGE_PRIO_COLORS[g.key] || '#7f8c8d') + '"></b></div>' +
            '<div class="oc-meta">' + g.count + ' 条 · 中位 ' + g.median + ' 天 · 最长 ' + g.max + ' 天</div>' +
            '<div class="oc-dom">30天+ ' + g.old30 + ' 条</div>' +
            '</div>';
    }).join('');
}

function renderAgePrioTable(stats) {
    var tbl = document.getElementById('age-prio-table');
    if (!tbl) return;
    var maxCell = 1;
    stats.forEach(function (g) { g.buckets.forEach(function (n) { if (n > maxCell) maxCell = n; }); });
    function heat(n) {
        if (!n) return '';
        var a = (0.14 + 0.5 * (n / maxCell)).toFixed(2);
        return 'background:rgba(255,159,67,' + a + ');';
    }
    var head = '<thead><tr><th>优先级</th>' +
        AGE_BUCKET_DEFS.map(function (b) { return '<th class="sla-num-head" title="未关闭 Bug 的已开天数落在 ' + b.label + ' 的条数">' + b.label + '</th>'; }).join('') +
        '<th class="sla-num-head" title="该优先级未关闭总数">合计</th>' +
        '<th class="sla-num-head" title="平均已开天数（报告日 → 今天）">平均(天)</th>' +
        '<th class="sla-num-head" title="最老一条的已开天数">最长(天)</th></tr></thead>';
    var rows = stats.map(function (g) {
        return '<tr data-prio="' + g.key + '">' +
            '<td><span class="severity-badge severity-' + (g.key || 'none') + '">' + g.label + '</span></td>' +
            g.buckets.map(function (n, i) {
                return '<td class="n" style="' + heat(n) + '" title="' + g.label + ' · ' + AGE_BUCKET_DEFS[i].label + '：' + n + ' 条">' + (n || '-') + '</td>';
            }).join('') +
            '<td class="n"><b>' + g.count + '</b></td>' +
            '<td class="n">' + g.avg + '</td>' +
            '<td class="n">' + g.max + '</td></tr>';
    }).join('');
    var total = stats.reduce(function (s, g) { return s + g.count; }, 0);
    var sumAvg = stats.reduce(function (s, g) { return s + g.avg * g.count; }, 0);
    var sumMax = stats.reduce(function (s, g) { return Math.max(s, g.max); }, 0);
    var totalRow = '<tr style="font-weight:600;">' +
        '<td>合计</td>' +
        AGE_BUCKET_DEFS.map(function (b, i) {
            var n = stats.reduce(function (s, g) { return s + g.buckets[i]; }, 0);
            return '<td class="n">' + (n || '-') + '</td>';
        }).join('') +
        '<td class="n">' + total + '</td>' +
        '<td class="n">' + (total ? Math.round(sumAvg / total * 10) / 10 : 0) + '</td>' +
        '<td class="n">' + sumMax + '</td></tr>';
    tbl.innerHTML = head + '<tbody>' + rows + totalRow + '</tbody>';
}

function setAgePrioView(view) {
    Dashboard.agePrioView = view || 'chart';
    var wrap = document.getElementById('age-prio-chart-wrapper');
    var cards = document.getElementById('age-prio-cards');
    var table = document.getElementById('age-prio-table-wrap');
    if (wrap) wrap.style.display = Dashboard.agePrioView === 'chart' ? '' : 'none';
    if (cards) cards.style.display = Dashboard.agePrioView === 'cards' ? 'grid' : 'none';
    if (table) table.style.display = Dashboard.agePrioView === 'table' ? '' : 'none';
    [].forEach.call(document.querySelectorAll('#age-prio-card .owner-tab'), function (b) {
        b.classList.toggle('active', b.getAttribute('data-view') === Dashboard.agePrioView);
    });
}

function applyPriorityFilterToTable(key) {
    var sel = document.getElementById('filter-severity');
    if (!sel) return;
    // key 为空 = 「未设置优先级」组（所有 Bug 都应设置优先级，这组是待补名单）
    sel.value = key ? key : '__EMPTY__';
    var sec = document.getElementById('bug-table-section');
    if (sec) sec.style.display = 'block';
    // filterBugs() 是 200ms 防抖，点图后要立刻见结果 → 直接调 applyTableFilters（与 applyOwnerFilterToTable 一致）
    if (typeof applyTableFilters === 'function') applyTableFilters();
    if (sec && sec.scrollIntoView) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderAgeByPriority() {
    var canvas = document.getElementById('chart-age-prio');
    if (!canvas) return;
    var stats = buildAgePrioStats();
    Dashboard.agePrioStats = stats;

    renderAgePrioSummary(stats);
    renderAgePrioCards(stats);
    renderAgePrioTable(stats);
    setAgePrioView(Dashboard.agePrioView || 'chart');

    var note = document.getElementById('age-prio-scope-note');
    var total = stats.reduce(function (s, g) { return s + g.count; }, 0);
    if (note) {
        note.textContent = '（未关闭 ' + total + ' 条参与统计｜年龄 = 报告日 → 今天'
            + '｜点柱/行 → 明细表按优先级筛选）';
    }

    if (Dashboard.charts.agePrio) { Dashboard.charts.agePrio.destroy(); Dashboard.charts.agePrio = null; }
    if (!stats.length) return;

    var rows = stats;

    // 竖状柱：柱顶写「平均 N 天」，再上面一行灰字「N 条 · 最长 M 天」
    var agePrioBarLabels = {
        id: 'agePrioBarLabels',
        afterDatasetsDraw: function (chart) {
            if (!chart || !chart.data || !chart.data.datasets.length) return;
            var c = chart.ctx, meta = chart.getDatasetMeta(0);
            c.save();
            c.textAlign = 'center';
            c.textBaseline = 'bottom';
            (meta.data || []).forEach(function (bar, i) {
                var g = rows[i]; if (!g) return;
                c.font = 'bold 13px sans-serif';
                c.fillStyle = '#333333';
                c.fillText(g.avg + ' 天', bar.x, bar.y - 7);
                c.font = '11px sans-serif';
                c.fillStyle = '#777777';
                c.fillText(g.count + ' 条 · 最长 ' + g.max + ' 天', bar.x, bar.y - 23);
            });
            c.restore();
        }
    };

    var maxAvg = rows.reduce(function (m, g) { return Math.max(m, g.avg); }, 1) || 1;

    Dashboard.charts.agePrio = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: rows.map(function (g) { return g.label; }),
            datasets: [{
                label: '平均年龄(天)',
                data: rows.map(function (g) { return g.avg; }),
                backgroundColor: rows.map(function (g) { return AGE_PRIO_COLORS[g.key] || '#7f8c8d'; }),
                borderRadius: 4, borderSkipped: false,
                barPercentage: 0.55, categoryPercentage: 0.74
            }]
        },
        plugins: [agePrioBarLabels],
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 36, left: 8, right: 8 } },
            interaction: { mode: 'index', intersect: false },
            onClick: function (evt, elements) {
                if (elements && elements.length && rows[elements[0].index]) {
                    applyPriorityFilterToTable(rows[elements[0].index].key);
                }
            },
            onHover: function (evt, elements) {
                canvas.style.cursor = (elements && elements.length && rows[elements[0].index] && rows[elements[0].index].key) ? 'pointer' : 'default';
            },
            plugins: {
                legend: { display: false },
                barDataLabel: false,
                pieLabel: false,
                tooltip: {
                    mode: 'index', intersect: false, displayColors: false,
                    callbacks: {
                        title: function (items) { return items.length ? items[0].label : ''; },
                        label: function (item) {
                            var g = rows[item.dataIndex] || {};
                            return '平均 ' + g.avg + ' 天 · 中位 ' + g.median + ' 天 · 最长 ' + g.max + ' 天';
                        },
                        footer: function (items) {
                            var g = rows[(items[0] || {}).dataIndex]; if (!g) return '';
                            return ['未关闭 ' + g.count + ' 条｜30天+ ' + g.old30 + ' 条',
                                (g.oldest ? '最老：' + g.oldest.bugId + '（' + g.oldest.ageDays + ' 天）' : ''),
                                '点击该柱 → 下方明细表按该优先级筛选'];
                        }
                    }
                }
            },
            scales: {
                x: { grid: { display: false }, ticks: { autoSkip: false } },
                // 顶部留白给柱顶两行标注：轴上限抬到最大值的 1.3 倍
                y: { beginAtZero: true, suggestedMax: Math.ceil(maxAvg * 1.3), title: { display: true, text: '平均已开天数' }, ticks: { precision: 0 } }
            }
        }
    });
}

// 卡片/表格行点击 → 明细表按优先级筛选（事件委托，避免 inline onclick 引号炸裂）
document.addEventListener('click', function (ev) {
    var card = ev.target.closest ? ev.target.closest('#age-prio-cards .owner-card') : null;
    if (card) { applyPriorityFilterToTable(card.getAttribute('data-prio')); return; }
    var row = ev.target.closest ? ev.target.closest('#age-prio-table tbody tr[data-prio]') : null;
    if (row) applyPriorityFilterToTable(row.getAttribute('data-prio'));
});

// ============ Trend Zoom Control ============

function resetTrendZoom() {
    // zoom 插件已随 CDN 一并移除；无 resetZoom 时静默跳过，避免 TypeError
    if (Dashboard.charts.trend && typeof Dashboard.charts.trend.resetZoom === 'function') {
        Dashboard.charts.trend.resetZoom();
    }
}



// ============ History Trend ============
// Removed - trend history section no longer displayed on the page.

// ============ Bug Table ============

function renderBugTable(bugs) {
    Dashboard.filteredBugs = bugs.slice();
    applyTableFilters();
}

/* 按 Domain 过滤: 下拉选项来自当前数据集(含"未设置"项), 保留已选值 */
function fillDomainFilter() {
    var el = document.getElementById('filter-domain');
    if (!el) return;
    var prev = el.value;
    var seen = {}, list = [], hasEmpty = false;
    (Dashboard.allBugs || []).forEach(function (b) {
        var d = String(b.domain || '').trim();
        if (!d) { hasEmpty = true; return; }
        if (!seen[d]) { seen[d] = 1; list.push(d); }
    });
    list.sort(function (a, b) { return a.localeCompare(b); });
    var html = '<option value="">全部 Domain</option>';
    list.forEach(function (d) { html += '<option value="' + d.replace(/"/g, '&quot;') + '">' + d + '</option>'; });
    if (hasEmpty) html += '<option value="__EMPTY__">（未设置 Domain）</option>';
    el.innerHTML = html;
    if (prev && (prev === '__EMPTY__' ? hasEmpty : !!seen[prev])) el.value = prev;
}

function setDomainFilterToTable(domain) {
    var el = document.getElementById('filter-domain');
    if (!el) return;
    el.value = domain || '';
    var sec = document.getElementById('bug-table-section');
    if (sec) { sec.style.display = 'block'; }
    // 该 Domain 可能全是已关闭 → 自动显示已关闭, 否则会看到空列表
    var anyOpen = (Dashboard.allBugs || []).some(function (b) {
        var d = String(b.domain || '').trim();
        var hit = (domain === '__EMPTY__') ? !d : (d === domain);
        return hit && ['closed', 'rejected', 'done'].indexOf(String(b.status || '').toLowerCase()) < 0;
    });
    var sc = document.getElementById('show-closed');
    if (sc && !anyOpen) sc.checked = true;
    applyTableFilters();
    if (sec && sec.scrollIntoView) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function applyTableFilters() {
    var keyFilter = document.getElementById('filter-key').value.toLowerCase();
    var summaryFilter = document.getElementById('filter-summary').value.toLowerCase();
    var statusFilter = document.getElementById('filter-status').value;
    var severityFilter = document.getElementById('filter-severity').value;
    var ownerFilter = document.getElementById('filter-owner').value.toLowerCase();
    var domainEl = document.getElementById('filter-domain');
    var domainFilter = domainEl ? domainEl.value : '';
    var showClosed = document.getElementById('show-closed').checked;
    var tagFilter = Dashboard.selectedTag;
    var componentFilter = Dashboard.selectedComponent;

    var filtered = Dashboard.filteredBugs.filter(function(bug) {
        // Hide closed/rejected by default unless checkbox is checked or status filter targets them
        var isClosedStatus = (bug.status === 'closed' || bug.status === 'rejected');
        var isFilteringForClosed = (statusFilter === 'closed' || statusFilter === 'rejected');
        if (!showClosed && !isFilteringForClosed && isClosedStatus) return false;

        if (keyFilter && bug.bugId.toLowerCase().indexOf(keyFilter) === -1) return false;

        if (summaryFilter && (bug.summary || bug.description).toLowerCase().indexOf(summaryFilter) === -1) return false;
        if (statusFilter && bug.status !== statusFilter) return false;
        // severity: '__EMPTY__' = 未设置优先级（严格空值），其余为精确匹配
        if (severityFilter === '__EMPTY__') {
            if (String(bug.severity || '').trim()) return false;
        } else if (severityFilter && bug.severity !== severityFilter) return false;
        if (ownerFilter && bug.owner.toLowerCase().indexOf(ownerFilter) === -1) return false;
        // Domain 精确过滤('__EMPTY__' = 未设置 Domain)
        if (domainFilter) {
            var dval = String(bug.domain || '').trim();
            if (domainFilter === '__EMPTY__') { if (dval) return false; }
            else if (dval !== domainFilter) return false;
        }
        if (tagFilter) {
            var labels = bug.labels || [];
            if (labels.indexOf(tagFilter) === -1) return false;
        }
        if (componentFilter) {
            var components = bug.components || [];
            if (components.indexOf(componentFilter) === -1) return false;
        }
        return true;
    });

    // Apply sort
    if (Dashboard.sortField) {
        var severityPriority = { highest: 0, high: 1, medium: 2, low: 3, lowest: 4 };
        filtered.sort(function(a, b) {
            var valA, valB;
            if (Dashboard.sortField === 'severity') {
                valA = severityPriority[a.severity] !== undefined ? severityPriority[a.severity] : 999;
                valB = severityPriority[b.severity] !== undefined ? severityPriority[b.severity] : 999;
            } else if (Dashboard.sortField === 'ageDays') {
                valA = a.ageDays || 0;
                valB = b.ageDays || 0;
            } else if (Dashboard.sortField === 'reportDate') {
                valA = a.reportDate || '';
                valB = b.reportDate || '';
            } else if (Dashboard.sortField.indexOf('sla.') === 0) {
                var slaKey = Dashboard.sortField.slice(4);
                var sa = a.sla || {}, sb = b.sla || {};
                valA = typeof sa[slaKey] === 'boolean' ? (sa[slaKey] ? 1 : 0) : (sa[slaKey] === null || sa[slaKey] === undefined ? -1 : sa[slaKey]);
                valB = typeof sb[slaKey] === 'boolean' ? (sb[slaKey] ? 1 : 0) : (sb[slaKey] === null || sb[slaKey] === undefined ? -1 : sb[slaKey]);
            } else {
                valA = (a[Dashboard.sortField] || '').toString().toLowerCase();
                valB = (b[Dashboard.sortField] || '').toString().toLowerCase();
            }
            var cmp = valA > valB ? 1 : valA < valB ? -1 : 0;
            return Dashboard.sortDirection === 'asc' ? cmp : -cmp;
        });
    }

    renderBugRows(filtered);
    // 供「导出Bug明细」使用: 与表格完全一致的当前可见集合
    Dashboard.visibleBugs = filtered;
    // KPI 恒按在途范围(allBugs: 项目+包含已关闭+报告日期)统计, 不随表格子筛选(如"显示已关闭")变
    updateKPIFromFiltered(Dashboard.allBugs || []);
}

// ============ KPI from Filtered Bugs ============

function updateKPIFromFiltered(bugs) {
    var today = new Date().toISOString().split('T')[0];
    var weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    var total = bugs.length;
    var open = 0, closed = 0, todayNew = 0, weekClosed = 0, overdue = 0;
    var resolutionDays = [];

    bugs.forEach(function(bug) {
        var st = bug.status;
        var isOpen = st === 'open' || st === 'triage' || st === 'implement';
        var isClosed = st === 'closed';
        if (isOpen) open++;
        if (isClosed) closed++;
        if (bug.reportDate === today) todayNew++;
        if (isClosed && bug.updatedDate && bug.updatedDate >= weekAgo) weekClosed++;
        if (bug.resolutionDays !== undefined) resolutionDays.push(bug.resolutionDays);
        if (!isClosed && st !== 'rejected' && bug.ageDays > 14) overdue++;
    });

    var avgDays = resolutionDays.length > 0
        ? Math.round(resolutionDays.reduce(function(a, b) { return a + b; }, 0) / resolutionDays.length * 10) / 10
        : 0;

    renderKPI({
        total: total,
        open: open,
        closed: closed,
        todayNew: todayNew,
        weekClosed: weekClosed,
        avgResolutionDays: avgDays,
        overdue: overdue
    });
}

/* ================= SLA 阶段1 · 只读（当前：提醒模式，暂不执行）=================
   口径（2026-11-17 与 Kobe 对齐，写进 PPT proposal 前先用它跑数）：
   · 心跳 cadence（起步档）: Highest 2d / High 3d / Medium 7d / Low 14d
   · 黄牌 = 静默 > 1× 心跳（只提醒、不升档）
   · 红牌 = 静默 > 2× 心跳 → 严重静默提醒（催办）；**升档后心跳计时从升档时刻重置**（防连跳两级）
   · 修复完成 SLA: Highest 7d / High 14d / Medium 30d / Low 60d（从报告日起算）
   · 挂起 label: sla-paused（静默不计、不升档）
   · 已升档 label: sla-escalated + sla-from-<原档>（只用于追踪，不自动回退）
   数据限制：reportDate / updatedDate 都是日期精度（JIRA created / updated），静默为整数天；
   升档时刻需要 changelog，本阶段不取 —— 追踪表用「当前静默」近似「升档后静默」。
   本模块只读：JIRA 里的优先级改动仍由人在周会批量执行。 */
var SLA_FIX = { highest: 7, high: 14, medium: 30, low: 60 };
var SLA_CAD = { highest: 2, high: 3, medium: 7, low: 14 };
var SLA_NEXT = { low: 'medium', medium: 'high', high: 'highest', highest: null };
/* 2026-11-19 Kobe: 暂时先不执行 SLA —— 仅开始用 SLA 做提醒。
   SLA_ENFORCE = false 时：
     · 照常算黄牌/红牌（静默 > 1× / 2× 心跳）与修复 SLA，但全部只当「提醒」；
     · 不给升档建议（shouldEscalate / atTop 恒 false）、不判违约、不展示「已升档清单」、
       不提 sla-escalated / sla-from-* 标签协议，明细表「升档」列只剩「挂起」状态；
     · 没有任何 JIRA 写操作（本来也没有）。
   将来要真正执行 SLA（或接阶段2 自动写 JIRA）时，把它置 true 即可恢复原有判定与清单。 */
var SLA_ENFORCE = false;
// 排序用：优先级序位（0 = 最高）
var SLA_RANK = { highest: 0, high: 1, medium: 2, low: 3 };
var SLA_NAME = { highest: 'Highest', high: 'High', medium: 'Medium', low: 'Low' };
var SLA_PAUSED_LABEL = 'sla-paused';
var SLA_ESC_LABEL = 'sla-escalated';
var SLA_FROM_PREFIX = 'sla-from-';
// ①首次响应 / ④验证关闭 的单位是工作小时·工作日，②③ 是自然日（与提案 PPT P4 一致）
var SLA_FIRST = { highest: '4 工作小时', high: '1 工作日', medium: '2 工作日', low: '5 工作日' };
var SLA_VERIFY = { highest: '1 工作日', high: '2 工作日', medium: '3 工作日', low: '5 工作日' };

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
    var escalated = labels.indexOf(SLA_ESC_LABEL) >= 0;
    var escFrom = null;
    labels.forEach(function (l) { if (l.indexOf(SLA_FROM_PREFIX) === 0) escFrom = l.slice(SLA_FROM_PREFIX.length); });
    var red = !closed && !paused && cad !== null && silent !== null && silent > 2 * cad;
    var warn = !closed && !paused && cad !== null && silent !== null && !red && silent > cad;
    var next = SLA_NEXT[p] || null;
    // 提醒模式（SLA_ENFORCE=false）不产生任何升档建议：只提醒，不判违约、不给档位
    var escalateOn = SLA_ENFORCE && red && !escalated;
    return {
        prio: p, cadence: cad, fixTarget: fix, daysOpen: daysOpen, silent: silent,
        fixRemain: (daysOpen === null || fix === null) ? null : fix - daysOpen,
        fixOver: (daysOpen === null || fix === null) ? 0 : Math.max(0, daysOpen - fix),
        paused: paused, escalated: escalated, escFrom: escFrom,
        // 第几次提醒 = 已错过几个完整心跳周期（1 = 第一次提醒；≥3 = 已被提醒 3 个周期以上仍未动）
        remindN: (cad === null || silent === null) ? null : Math.floor(silent / cad),
        warn: warn, red: red,
        shouldEscalate: escalateOn && !!next,
        atTop: escalateOn && !next,
        escTarget: (escalateOn && next) ? next : null,
        closed: closed
    };
}

function slaDecorate(bugs) {
    (bugs || []).forEach(function (b) { b.sla = slaOf(b); });
    return bugs || [];
}

function slaHeartbeatCell(s) {
    if (s.paused) return { cls: 'sla-paused', text: '挂起' };
    if (s.red) return { cls: 'sla-red', text: '红牌' };
    if (s.warn) return { cls: 'sla-warn', text: '黄牌' };
    if (s.closed) return { cls: 'sla-closed', text: '已关闭' };
    return { cls: 'sla-ok', text: 'OK' };
}

// 列表用的标题列与转义（标题来自 JIRA summary，可能含 < > & " 与换行）
function bugTitle(b) {
    var t = String(b.summary || b.description || '').replace(/\s+/g, ' ').trim();
    return t || '-';
}
function escHtml(s) {
    return escapeHtml(String(s));
}
function escAttr(s) {
    return escapeHtml(String(s)).replace(/"/g, '&quot;');
}

// 面板标题里的"数据截至"时间戳：MM-DD HH:MM（跨天也能看出来）
function slaFmtTime(d) {
    if (!d) return '—';
    var t = (d instanceof Date) ? d : new Date(d);
    if (isNaN(t.getTime())) return '—';
    function p2(n) { return n < 10 ? '0' + n : '' + n; }
    return p2(t.getMonth() + 1) + '-' + p2(t.getDate()) + ' ' + p2(t.getHours()) + ':' + p2(t.getMinutes());
}

function renderSlaPanel(bugs) {
    var all = (bugs || []).filter(function (b) { return b.sla; });
    if (!all.length) return;
    var open = all.filter(function (b) { return !b.sla.closed; });
    // 所有 Bug 都必须设置优先级：空优先级的未关闭单拿不到心跳阈值，永远不黄不红 —— 单独提醒
    var noPrioOpen = open.filter(function (b) { return !String(b.severity || '').trim(); });
    var warn = open.filter(function (b) { return b.sla.warn; });
    var red = open.filter(function (b) { return b.sla.red; });
    var esc = open.filter(function (b) { return b.sla.shouldEscalate; });
    var atTop = open.filter(function (b) { return b.sla.atTop; });
    // 挂起（sla-paused）= 暂时不追踪 SLA：静默超期、修复超期、临期全部不计（只留在挂起清单里等解除）
    var fixOver = open.filter(function (b) { return !b.sla.paused && (b.sla.fixOver || 0) > 0; });
    var near = open.filter(function (b) { return !b.sla.paused && b.sla.fixRemain !== null && b.sla.fixRemain >= 0 && b.sla.fixRemain <= Math.max(1, Math.round((b.sla.fixTarget || 0) * 0.2)); });
    var paused = open.filter(function (b) { return b.sla.paused; });
    var escalated = all.filter(function (b) { return b.sla.escalated; });
    var chips = document.getElementById('sla-chips');
    if (chips) {
        chips.innerHTML =
            '<div class="sla-chip sla-chip-warn"><b>' + warn.length + '</b><span>黄牌（静默 &gt; 1× 心跳）</span></div>' +
            '<div class="sla-chip sla-chip-red"><b>' + red.length + '</b><span>红牌（静默 &gt; 2× 心跳' + (SLA_ENFORCE ? '' : ' · 催办') + '）</span></div>' +
            '<div class="sla-chip sla-chip-fix"><b>' + fixOver.length + '</b><span>修复超期</span><i>临期 ' + near.length + '</i></div>' +
            '<div class="sla-chip"><b>' + paused.length + '</b><span>挂起 sla-paused</span></div>' +
            (SLA_ENFORCE ? '<div class="sla-chip"><b>' + escalated.length + '</b><span>已升档（追踪中）</span></div>' : '') +
            (noPrioOpen.length ? '<div class="sla-chip sla-chip-red sla-chip-click" onclick="applyPriorityFilterToTable(\'\')" title="这些单 JIRA 优先级为空 → 拿不到心跳阈值，不参与黄牌/红牌提醒；点击筛选明细表去补优先级">' +
                '<b>' + noPrioOpen.length + '</b><span>优先级未设置（不参与提醒）</span></div>' : '');
    }

    // 面板标题与「已升档清单」跟随 SLA_ENFORCE：提醒模式下不出现任何执行/升档语义
    var titleEl = document.getElementById('sla-panel-title');
    if (titleEl) titleEl.textContent = SLA_ENFORCE ? 'SLA 阶段1 · 只读建议' : 'SLA 提醒 · 暂不执行（只读）';
    var escBlock = document.getElementById('sla-escalated-block');
    if (escBlock) escBlock.style.display = SLA_ENFORCE ? '' : 'none';
    var actHead = document.getElementById('sla-red-act-head');
    if (actHead) actHead.textContent = SLA_ENFORCE ? '处理建议' : '提醒动作';

    var note = document.getElementById('sla-scope-note');
    if (note) {
        note.textContent = '（数据截至 ' + slaFmtTime(Dashboard.dataFetchedAt) + ' · 未关闭 ' + open.length + ' 条参与判定；' +
            (SLA_ENFORCE ? '只读建议，JIRA 优先级需人工修改）' : '只提醒，不改 JIRA、不升档、不计违约）');
    }

    function rowWarn(b) {
        var s = b.sla;
        var ttl = bugTitle(b);
        return '<tr>' +
            '<td class="k"><a class="jira-key-link" href="' + jiraHref(b) + '" target="_blank">' + b.bugId + '</a></td>' +
            '<td class="ttl" title="' + escAttr(ttl) + '">' + escHtml(ttl) + '</td>' +
            '<td>' + SLA_NAME[s.prio] + '</td>' +
            '<td class="n sla-warn-text" title="已静默 ' + s.silent + ' 天，超过 1× 心跳 ' + s.cadence + ' 天，但未到红牌线 ' + (2 * s.cadence) + ' 天">' + s.silent + '</td>' +
            '<td class="n sla-warn-text" title="第 ' + s.remindN + ' 次提醒（= 静默 ' + s.silent + ' 天 / 心跳 ' + s.cadence + ' 天）">' + s.remindN + '</td>' +
            '<td>' + (b.domain || '-') + '</td><td>' + (b.owner || '-') + '</td></tr>';
    }
    function rowRed(b) {
        var s = b.sla;
        var ttl = bugTitle(b), act;
        if (!SLA_ENFORCE) {
            // 提醒模式：只催办，不给档位建议
            act = '<span class="sla-badge sla-esc-suggest" title="提醒负责人更新进展/给 ETA；本阶段不执行 SLA，不升档">催办 · 更新进展</span>';
        } else if (s.escalated) act = '<span class="sla-badge sla-esc-done">已升档' + (s.escFrom ? '(' + SLA_NAME[s.escFrom] + ')' : '') + '</span>';
        else if (s.atTop) act = '<span class="sla-badge sla-esc-top">到顶 · 升级到人</span>';
        else if (s.shouldEscalate) act = '<span class="sla-badge sla-esc-suggest">→ ' + SLA_NAME[s.escTarget] + '（升一档）</span>';
        else act = '—';
        return '<tr>' +
            '<td class="k"><a class="jira-key-link" href="' + jiraHref(b) + '" target="_blank">' + b.bugId + '</a></td>' +
            '<td class="ttl" title="' + escAttr(ttl) + '">' + escHtml(ttl) + '</td>' +
            '<td>' + SLA_NAME[s.prio] + '</td>' +
            '<td class="n sla-red-text" title="已静默 ' + s.silent + ' 天 > 红牌线 ' + (2 * s.cadence) + ' 天（心跳 ' + s.cadence + ' ×2）">' + s.silent + '</td>' +
            '<td class="n ' + (s.remindN >= 3 ? 'sla-red-text' : '') + '" title="第 ' + s.remindN + ' 次提醒（= 静默 ' + s.silent + ' 天 / 心跳 ' + s.cadence + ' 天）；≥3 说明这条已被提醒 3 个周期以上仍未动">' + s.remindN + '</td>' +
            '<td class="c">' + act + '</td>' +
            '<td>' + (b.domain || '-') + '</td><td>' + (b.owner || '-') + '</td></tr>';
    }
    function rowTracked(b) {
        var s = b.sla, hb = slaHeartbeatCell(s);
        return '<tr>' +
            '<td class="k"><a class="jira-key-link" href="' + jiraHref(b) + '" target="_blank">' + b.bugId + '</a></td>' +
            '<td>' + (s.escFrom ? SLA_NAME[s.escFrom] : '?') + ' → <b>' + SLA_NAME[s.prio] + '</b></td>' +
            '<td class="n ' + (s.red ? 'sla-red-text' : '') + '" title="升档后已静默 ' + (s.silent === null ? '?' : s.silent) + ' 天（心跳计时从升档时刻重置）">' + (s.silent === null ? '-' : s.silent) + '</td>' +
            '<td class="c"><span class="sla-badge ' + hb.cls + '">' + hb.text + '</span></td>' +
            '<td>' + (b.domain || '-') + '</td><td>' + (b.owner || '-') + '</td></tr>';
    }
    function rowFix(b) {
        var s = b.sla;
        var ttl = bugTitle(b);
        var over = (s.fixOver || 0) > 0;
        var txt = over ? (s.daysOpen + ' / ' + s.fixTarget + ' · 超 ' + s.fixOver + ' 天')
                       : (s.daysOpen + ' / ' + s.fixTarget + ' · 剩 ' + s.fixRemain + ' 天');
        var cls = over ? 'sla-red-text' : 'sla-warn-text';
        return '<tr>' +
            '<td class="k"><a class="jira-key-link" href="' + jiraHref(b) + '" target="_blank">' + b.bugId + '</a></td>' +
            '<td class="ttl" title="' + escAttr(ttl) + '">' + escHtml(ttl) + '</td>' +
            '<td>' + SLA_NAME[s.prio] + '</td>' +
            '<td class="c ' + cls + '" title="已开 ' + s.daysOpen + ' 天 / 修复 SLA ' + s.fixTarget + ' 天（从报告日 ' + (b.reportDate || '-') + ' 起算）">' + txt + '</td>' +
            '<td class="n' + (s.red ? ' sla-red-text' : '') + '">' + (s.silent === null ? '-' : s.silent) + '</td>' +
            '<td>' + (b.domain || '-') + '</td><td>' + (b.owner || '-') + '</td></tr>';
    }

    function slaAgeText(b) {
        // 已开时长：< 48 小时给小时精度（createdTimestamp 有毫秒），否则给天数
        var ts = b.createdTimestamp;
        if (!ts) return (b.sla.daysOpen === null ? '-' : b.sla.daysOpen + ' 天');
        var hours = (Date.now() - ts) / 3600000;
        if (hours < 0) hours = 0;
        if (hours < 48) return Math.max(1, Math.round(hours)) + ' 小时';
        return Math.round(hours / 24) + ' 天';
    }

    function rowPaused(b) {
        var s = b.sla;
        var ttl = bugTitle(b);
        return '<tr>' +
            '<td class="k"><a class="jira-key-link" href="' + jiraHref(b) + '" target="_blank">' + b.bugId + '</a></td>' +
            '<td class="ttl" title="' + escAttr(ttl) + '">' + escHtml(ttl) + '</td>' +
            '<td>' + SLA_NAME[s.prio] + '</td>' +
            '<td class="n" title="挂起中：静默 ' + (s.silent === null ? '?' : s.silent) + ' 天不计入黄牌/红牌（但挂起 >2× 心跳未解除视为解除）">' + (s.silent === null ? '-' : s.silent) + '</td>' +
            '<td class="c' + ((s.fixOver || 0) > 0 ? ' sla-red-text' : '') + '">' +
            (s.daysOpen === null ? '-' : s.daysOpen + ' / ' + s.fixTarget) + ((s.fixOver || 0) > 0 ? ' · 超 ' + s.fixOver + ' 天' : '') + '</td>' +
            '<td>' + (b.domain || '-') + '</td><td>' + (b.owner || '-') + '</td></tr>';
    }

    // ---- 各清单：每页 5 条 + 翻页（数据与行渲染器存到 Dashboard，供翻页复用，不重新算）----
    warn.sort(function (a, b) { return (b.sla.silent || 0) - (a.sla.silent || 0); });
    red.sort(function (a, b) { return (b.sla.silent || 0) - (a.sla.silent || 0); });
    escalated.sort(function (a, b) { return (b.sla.silent || 0) - (a.sla.silent || 0); });
    paused.sort(function (a, b) { return (b.sla.silent || 0) - (a.sla.silent || 0); });
    // 修复超期：已超期在前（超得多排前），临期在后（剩余少的排前）
    var fixRows = near.concat(fixOver).sort(function (a, b) {
        var ao = (a.sla.fixOver || 0) > 0, bo = (b.sla.fixOver || 0) > 0;
        if (ao !== bo) return ao ? -1 : 1;
        return ao ? (b.sla.fixOver - a.sla.fixOver) : (a.sla.fixRemain - b.sla.fixRemain);
    });
    Dashboard.slaLists = { warn: warn, red: red, fix: fixRows, paused: paused, escalated: escalated };
    Dashboard.slaRowFns = { warn: rowWarn, red: rowRed, fix: rowFix, paused: rowPaused, escalated: rowTracked };
    Dashboard.slaPage = { warn: 1, red: 1, fix: 1, paused: 1, escalated: 1 };
    slaRenderAllLists();

    // ---- 附：四段阈值总表（PPT P4 同款，值全部取自 SLA_* 常量，避免两处口径漂移）----
    var tbody = document.getElementById('sla-threshold-body');
    if (tbody) {
        tbody.innerHTML = ['highest', 'high', 'medium', 'low'].map(function (p) {
            return '<tr>' +
                '<td><b>' + SLA_NAME[p] + '</b></td>' +
                '<td class="c">' + SLA_FIRST[p] + '</td>' +
                '<td class="c">' + SLA_CAD[p] + ' 天（红线 ' + (2 * SLA_CAD[p]) + ' 天）</td>' +
                '<td class="c">' + SLA_FIX[p] + ' 天</td>' +
                '<td class="c">' + SLA_VERIFY[p] + '</td></tr>';
        }).join('');
    }
    Dashboard.slaStats = {
        open: open.length, warn: warn.length, red: red.length, escalate: esc.length,
        atTop: atTop.length, fixOver: fixOver.length, near: near.length, paused: paused.length, escalated: escalated.length
    };
}

function slaCopyWarn() {
    var bugs = (Dashboard.allBugs || []).filter(function (b) { return b.sla && b.sla.warn; });
    if (!bugs.length) { slaToast('当前没有黄牌单', true); return; }
    var lines = bugs.map(function (b) {
        return b.bugId + '\t' + SLA_NAME[b.sla.prio] + '\t静默' + b.sla.silent + 'd / 心跳' + b.sla.cadence + 'd\t' +
            (b.owner || '') + '\t' + bugTitle(b);
    });
    var text = 'Key\t优先级\t静默/心跳\t负责人\t标题\n' + lines.join('\n');
    slaCopyWithFallback(text, '黄牌清单（' + bugs.length + ' 条）');
}

function slaCopyRed() {
    var bugs = (Dashboard.allBugs || []).filter(function (b) { return b.sla && b.sla.red; });
    if (!bugs.length) { slaToast('当前没有红牌单', true); return; }
    function act(s) {
        if (!SLA_ENFORCE) return '催办 · 更新进展';
        if (s.escalated) return '已升档' + (s.escFrom ? '(' + SLA_NAME[s.escFrom] + ')' : '');
        if (s.atTop) return '到顶·升级到人';
        if (s.shouldEscalate) return '→ ' + SLA_NAME[s.escTarget] + '（升一档）';
        return '-';
    }
    var lines = bugs.map(function (b) {
        return b.bugId + '\t' + SLA_NAME[b.sla.prio] + '\t静默' + b.sla.silent + 'd / 心跳' + b.sla.cadence + 'd\t' +
            act(b.sla) + '\t' + (b.owner || '') + '\t' + bugTitle(b);
    });
    var text = 'Key\t优先级\t静默/心跳\t' + (SLA_ENFORCE ? '处理建议' : '提醒动作') + '\t负责人\t标题\n' + lines.join('\n') +
        '\n\nKeys: ' + bugs.map(function (b) { return b.bugId; }).join(', ');
    slaCopyWithFallback(text, '红牌清单（' + bugs.length + ' 条）');
}

/* ---- 清单翻页：每页 5 条 ---- */
var SLA_PAGE_SIZE = 5;

function slaRenderAllLists() {
    ['warn', 'red', 'fix', 'paused', 'escalated'].forEach(function (name) { slaRenderList(name); });
}

function slaRenderList(name) {
    var lists = Dashboard.slaLists || {}, pages = Dashboard.slaPage || {}, fns = Dashboard.slaRowFns || {};
    var arr = lists[name] || [];
    var total = arr.length;
    var pagesN = Math.max(1, Math.ceil(total / SLA_PAGE_SIZE));
    var page = Math.min(Math.max(1, pages[name] || 1), pagesN);
    pages[name] = page;
    var start = (page - 1) * SLA_PAGE_SIZE;
    var slice = arr.slice(start, start + SLA_PAGE_SIZE);

    var body = document.getElementById('sla-' + name + '-body');
    var table = document.getElementById('sla-' + name + '-table');
    var empty = document.getElementById('sla-' + name + '-empty');
    var pager = document.getElementById('sla-' + name + '-pager');
    var fn = fns[name];

    if (body) body.innerHTML = fn ? slice.map(fn).join('') : '';
    if (table) table.style.display = total ? '' : 'none';
    if (empty) empty.style.display = total ? 'none' : 'block';
    if (pager) {
        if (!total) {
            pager.style.display = 'none';
            pager.innerHTML = '';
        } else {
            pager.style.display = 'flex';
            var info = '共 ' + total + ' 条';
            if (pagesN > 1) info += ' · 第 ' + page + '/' + pagesN + ' 页 · 本页 ' + (start + 1) + '-' + (start + slice.length);
            pager.innerHTML =
                '<span class="sla-pager-info">' + info + '</span>' +
                (pagesN > 1
                    ? '<button class="sla-pg-btn" type="button"' + (page <= 1 ? ' disabled' : '') + ' onclick="slaPageGo(\'' + name + '\',-1)">‹ 上一页</button>' +
                      '<button class="sla-pg-btn" type="button"' + (page >= pagesN ? ' disabled' : '') + ' onclick="slaPageGo(\'' + name + '\',1)">下一页 ›</button>'
                    : '');
        }
    }
}

function slaPageGo(name, delta) {
    Dashboard.slaPage = Dashboard.slaPage || {};
    Dashboard.slaPage[name] = (Dashboard.slaPage[name] || 1) + delta;
    slaRenderList(name);
}

function slaCopyPaused() {
    var bugs = (Dashboard.allBugs || []).filter(function (b) { return b.sla && b.sla.paused; });
    if (!bugs.length) { slaToast('当前没有挂起单', true); return; }
    var lines = bugs.map(function (b) {
        var s = b.sla;
        return b.bugId + '\t' + SLA_NAME[s.prio] + '\t静默' + s.silent + 'd\t' +
            (s.daysOpen === null ? '-' : s.daysOpen + ' / ' + s.fixTarget) + '\t' + (b.owner || '') + '\t' + bugTitle(b);
    });
    var text = 'Key\t优先级\t静默\t已开/修复SLA\t负责人\t标题\n' + lines.join('\n') +
        '\n\nKeys: ' + bugs.map(function (b) { return b.bugId; }).join(', ');
    slaCopyWithFallback(text, '挂起清单（' + bugs.length + ' 条）');
}

function slaCopyFix() {
    var open = (Dashboard.allBugs || []).filter(function (b) { return b.sla && !b.sla.closed; });
    var rows = open.filter(function (b) {
        var s = b.sla;
        if (s.paused) return false;          // 挂起 = 不追踪 SLA，复制清单同样排除
        var isOver = (s.fixOver || 0) > 0;
        var isNear = s.fixRemain !== null && s.fixRemain >= 0 && s.fixRemain <= Math.max(1, Math.round((s.fixTarget || 0) * 0.2));
        return isOver || isNear;
    }).sort(function (a, b) {
        var ao = (a.sla.fixOver || 0) > 0, bo = (b.sla.fixOver || 0) > 0;
        if (ao !== bo) return ao ? -1 : 1;
        return ao ? (b.sla.fixOver - a.sla.fixOver) : (a.sla.fixRemain - b.sla.fixRemain);
    });
    if (!rows.length) { slaToast('当前没有修复超期或临期的单', true); return; }
    var lines = rows.map(function (b) {
        var s = b.sla;
        var state = (s.fixOver || 0) > 0 ? ('超 ' + s.fixOver + ' 天') : ('剩 ' + s.fixRemain + ' 天');
        return b.bugId + '\t' + SLA_NAME[s.prio] + '\t' + s.daysOpen + ' / ' + s.fixTarget + ' 天（' + state + '）\t' +
            '静默' + b.sla.silent + 'd\t' + (b.owner || '') + '\t' + bugTitle(b);
    });
    var text = 'Key\t优先级\t已开/修复SLA\t静默\t负责人\t标题\n' + lines.join('\n') +
        '\n\nKeys: ' + rows.map(function (b) { return b.bugId; }).join(', ');
    slaCopyWithFallback(text, '修复超期清单（' + rows.length + ' 条）');
}

/* 剪贴板三层兜底：
   8088 是 http 明文 → isSecureContext=false → navigator.clipboard 不存在，
   旧实现退到 window.prompt()，而 prompt 在很多环境被拦/静默失败，表现为"点了没反应"。
   ① 安全上下文（https / localhost）→ Clipboard API
   ② 明文 http → 隐藏 textarea + document.execCommand('copy')
   ③ 都失败 → 弹自带面板（textarea 预选中），用户 Ctrl+C 一定能复制 */
function slaCopyText(text) {
    return new Promise(function (resolve) {
        function legacy() {
            var ok = false, ta = null;
            try {
                ta = document.createElement('textarea');
                ta.value = text;
                ta.setAttribute('readonly', '');
                ta.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0';
                document.body.appendChild(ta);
                ta.select();
                ta.setSelectionRange(0, text.length);
                ok = document.execCommand('copy');
            } catch (e) {
                ok = false;
            } finally {
                if (ta && ta.parentNode) ta.parentNode.removeChild(ta);
            }
            resolve(!!ok);
        }
        if (window.isSecureContext && navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function () { resolve(true); }, legacy);
        } else {
            legacy();
        }
    });
}

function slaCopyWithFallback(text, label) {
    slaCopyText(text).then(function (ok) {
        if (ok) slaToast(label + ' 已复制到剪贴板');
        else slaShowCopyDialog(text, label);
    });
}

function slaShowCopyDialog(text, label) {
    var old = document.getElementById('sla-copy-dialog');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var wrap = document.createElement('div');
    wrap.id = 'sla-copy-dialog';
    wrap.className = 'sla-copy-overlay';
    wrap.innerHTML =
        '<div class="sla-copy-card">' +
        '<div class="sla-copy-head">' + label + ' · 浏览器拦截了自动复制，请按 <b>Ctrl+C</b>（文本已全选）</div>' +
        '<textarea id="sla-copy-area" readonly spellcheck="false"></textarea>' +
        '<div class="sla-copy-actions">' +
        '<button class="sla-btn sla-btn-primary" onclick="slaCopyAgain()">再试一次自动复制</button>' +
        '<button class="sla-btn" onclick="slaCloseCopyDialog()">关闭</button>' +
        '</div></div>';
    document.body.appendChild(wrap);
    var ta = document.getElementById('sla-copy-area');
    ta.value = text;
    ta.focus();
    ta.select();
}

function slaCopyAgain() {
    var ta = document.getElementById('sla-copy-area');
    if (!ta) return;
    ta.focus();
    ta.select();
    slaCopyText(ta.value).then(function (ok) {
        if (ok) { slaToast('已复制到剪贴板'); slaCloseCopyDialog(); }
        else slaToast('仍被浏览器拦截 —— 请手动 Ctrl+C', true);
    });
}

function slaCloseCopyDialog() {
    var d = document.getElementById('sla-copy-dialog');
    if (d && d.parentNode) d.parentNode.removeChild(d);
}

function slaToast(msg, isErr) {
    var t = document.getElementById('sla-toast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'sla-toast';
        document.body.appendChild(t);
    }
    t.textContent = msg;
    t.className = 'sla-toast' + (isErr ? ' sla-toast-err' : '');
    t.style.display = 'block';
    if (window.__slaToastTimer) clearTimeout(window.__slaToastTimer);
    window.__slaToastTimer = setTimeout(function () { t.style.display = 'none'; }, 2600);
}


/* ============ SLA 每周提醒邮件（手动导出：每人一封 + 总览） ============
   本阶段不发信、不写 JIRA：只在页面上把「谁该更新哪几条」按人分好，
   由 Kobe 手工导出 .eml（双击 Outlook 打开，To 已按 JIRA 负责人邮箱预填）或复制正文后自行发送。 */
var SLA_REMIND = { data: null, scope: 'overview', cur: null, loading: false };

function slaProjectKey() {
    var el = document.getElementById('project-select');
    var v = el ? String(el.value || '') : '';
    if (!v && Dashboard.selectedProjects && Dashboard.selectedProjects.length) v = Dashboard.selectedProjects[0];
    return v || 'BR288Y';
}

function openSlaReminder() {
    var modal = document.getElementById('sla-remind-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    if (!SLA_REMIND.data) slaRemindLoad(false);
    else slaRemindRender();
}

function closeSlaReminder() {
    var modal = document.getElementById('sla-remind-modal');
    if (modal) modal.style.display = 'none';
}

function slaRemindRefresh() { slaRemindLoad(true); }

function slaRemindLoad(force) {
    if (SLA_REMIND.loading) return;
    SLA_REMIND.loading = true;
    var meta = document.getElementById('sla-remind-meta');
    if (meta) meta.textContent = '正在回源 JIRA 生成…（① 首次响应要抓 changelog，约 2–5 秒）';
    var url = '/api/data/sla-reminder?project=' + encodeURIComponent(slaProjectKey()) + (force ? '&force=1' : '');
    fetch(url, { credentials: 'same-origin', cache: 'no-store' })
        .then(function (r) {
            if (r.status === 401 && typeof handleAuthExpired === 'function') { handleAuthExpired(); }
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        })
        .then(function (d) {
            if (!d || !d.success) throw new Error((d && d.error) || '生成失败');
            SLA_REMIND.data = d;
            SLA_REMIND.scope = 'overview';
            slaRemindRender();
        })
        .catch(function (e) {
            if (meta) meta.textContent = '生成失败：' + e.message;
            slaToast('提醒邮件生成失败：' + e.message, true);
        })
        .then(function () { SLA_REMIND.loading = false; });
}

function slaRemindMetaText() {
    var d = SLA_REMIND.data;
    if (!d) return '';
    var c = d.counts || {};
    return '数据截至 ' + slaFmtTime(d.fetchedAt) + ' · 未关闭 ' + c.open + ' 条 · 静默超期 ' + c.silentOver + ' 条' +
        ' · 修复超期 ' + c.fixOver + '（临期 ' + c.near + '）' +
        ' · 收件人 ' + (d.recipients || []).length + ' + 总览';
}

function slaRemindRender() {
    var d = SLA_REMIND.data, modal = document.getElementById('sla-remind-modal');
    if (!d || !modal) return;
    var meta = document.getElementById('sla-remind-meta');
    if (meta) meta.textContent = slaRemindMetaText();
    var list = document.getElementById('sla-remind-list');
    var items = [{ scope: 'overview', owner: '总览（Kobe 自己看）', email: '', count: d.counts.silentOver, overview: true }]
        .concat((d.recipients || []).map(function (r) {
            return { scope: 'owner:' + r.owner, owner: r.owner, email: r.email,
                     count: r.count, silentCount: r.silentCount, fixCount: r.fixCount };
        }));
    list.innerHTML = items.map(function (it) {
        var badge = '';
        if (it.overview) {
            badge = '<span class="sla-remind-tag sla-remind-tag-ov">静默超期 ' + d.counts.silentOver + ' · 修复超期 ' + d.counts.fixOver + '</span>';
        } else {
            if (it.silentCount) badge += '<span class="sla-remind-tag sla-remind-tag-red">静默超期 ' + it.silentCount + '</span>';
            if (it.fixCount) badge += '<span class="sla-remind-tag sla-remind-tag-ov">修复超期 ' + it.fixCount + '</span>';
        }
        return '<div class="sla-remind-item' + (SLA_REMIND.scope === it.scope ? ' active' : '') + '" data-scope="' + escAttr(it.scope) + '">' +
            '<div class="sla-remind-name">' + escHtml(it.owner) + '</div>' +
            '<div class="sla-remind-sub">' + (it.email ? escHtml(it.email) : (it.overview ? '给自己' : '无邮箱 · 手工选人')) + badge + '</div>' +
            '</div>';
    }).join('');
    Array.prototype.forEach.call(list.querySelectorAll('.sla-remind-item'), function (el) {
        el.onclick = function () { slaRemindSelect(el.getAttribute('data-scope')); };
    });
    slaRemindSelect(SLA_REMIND.scope);
}

function slaRemindPick(scope) {
    var d = SLA_REMIND.data;
    if (!d) return null;
    if (scope === 'overview') return d.overview;
    var who = String(scope).replace(/^owner:/, '');
    var r = (d.recipients || []).filter(function (x) { return x.owner === who; })[0];
    return r || null;
}

function slaRemindSelect(scope) {
    SLA_REMIND.scope = scope;
    var it = slaRemindPick(scope);
    SLA_REMIND.cur = it;
    Array.prototype.forEach.call(document.querySelectorAll('.sla-remind-item'), function (el) {
        el.classList.toggle('active', el.getAttribute('data-scope') === scope);
    });
    var sub = document.getElementById('sla-remind-subject');
    var to = document.getElementById('sla-remind-to');
    var frame = document.getElementById('sla-remind-frame');
    if (!it) { if (sub) sub.textContent = '找不到该收件人'; return; }
    if (sub) sub.textContent = '主题：' + it.subject;
    if (to) to.textContent = it.email ? ('To: ' + it.email) : 'To:（空，手工选人）';
    if (frame) frame.srcdoc = it.html;
}

/* 富文本复制：临时容器 + Range 选中 + execCommand('copy') —— http 明文页也能把表格/蓝色 key 带进剪贴板 */
function slaRemindCopyRich() {
    var it = SLA_REMIND.cur;
    if (!it) return;
    var ok = false, holder = null;
    try {
        holder = document.createElement('div');
        holder.style.cssText = 'position:fixed;left:-99999px;top:0;width:900px;';
        holder.innerHTML = it.html;
        document.body.appendChild(holder);
        var range = document.createRange();
        range.selectNodeContents(holder);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        ok = document.execCommand('copy');
        sel.removeAllRanges();
    } catch (e) { ok = false; }
    finally { if (holder && holder.parentNode) holder.parentNode.removeChild(holder); }
    if (ok) slaToast('已复制富文本正文 —— 新建 Outlook 邮件后 Ctrl+V 即可（表格与 key 链接都在）');
    else slaCopyText(it.text).then(function (ok2) {
        if (ok2) slaToast('浏览器拦了富文本，已复制纯文本（key 后带 <url>，Outlook 也会转成链接）', true);
        else slaShowCopyDialog(it.text, '提醒邮件正文');
    });
}

function slaRemindCopyText() {
    var it = SLA_REMIND.cur;
    if (!it) return;
    slaCopyWithFallback(it.text, '提醒邮件正文（纯文本）');
}

function slaRemindEml() {
    var it = SLA_REMIND.cur;
    if (!it) return;
    var url = '/api/data/sla-reminder/eml?project=' + encodeURIComponent(slaProjectKey()) +
        '&scope=' + encodeURIComponent(SLA_REMIND.scope);
    slaRemindDownload(url, function (name) { return name; }).then(function (ok) {
        if (ok) slaToast('已下载 .eml —— 双击用 Outlook 打开（To 已预填），补一句后发送');
        else slaToast('下载失败，请重试', true);
    });
}

function slaRemindAllEml() {
    var d = SLA_REMIND.data;
    if (!d) return;
    var scopes = ['overview'].concat((d.recipients || []).map(function (r) { return 'owner:' + r.owner; }));
    slaToast('开始逐个下载 ' + scopes.length + ' 封 —— 浏览器若提示「允许多个下载」请允许');
    var i = 0;
    function next() {
        if (i >= scopes.length) { slaToast('全部 ' + scopes.length + ' 封已下载'); return; }
        var s = scopes[i++];
        slaRemindDownload('/api/data/sla-reminder/eml?project=' + encodeURIComponent(slaProjectKey()) + '&scope=' + encodeURIComponent(s)).then(function () {
            setTimeout(next, 700);
        });
    }
    next();
}

function slaRemindDownload(url) {
    return fetch(url, { credentials: 'same-origin', cache: 'no-store' }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        var cd = r.headers.get('Content-Disposition') || '';
        var m = cd.match(/filename="?([^"]+)"?/);
        var name = m ? m[1] : 'reminder.eml';
        return r.blob().then(function (b) { return { b: b, name: name }; });
    }).then(function (x) {
        var a = document.createElement('a');
        var u = URL.createObjectURL(x.b);
        a.href = u;
        a.download = x.name;
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(u); a.remove(); }, 1500);
        return true;
    }).catch(function (e) {
        console.warn('[SLA] 下载 .eml 失败:', e.message);
        return false;
    });
}

function renderBugRows(bugs) {
    var tbody = document.getElementById('bug-table-body');
    tbody.innerHTML = '';

    var maxRows = 200;
    var displayBugs = bugs.slice(0, maxRows);
    var fragment = document.createDocumentFragment();

    for (var i = 0; i < displayBugs.length; i++) {
        var bug = displayBugs[i];
        var tr = document.createElement('tr');

        if ((bug.status === 'open' || bug.status === 'triage') && bug.ageDays > 14) {
            tr.classList.add('row-overdue');
        }

        var tdKey = document.createElement('td');
        var keyLink = document.createElement('a');
        keyLink.href = jiraHref(bug);
        keyLink.target = '_blank';
        keyLink.className = 'jira-key-link';
        keyLink.textContent = bug.bugId;
        tdKey.appendChild(keyLink);
        tr.appendChild(tdKey);

        var tdDesc = document.createElement('td');
        tdDesc.textContent = bug.summary || bug.description;
        tdDesc.title = bug.summary || bug.description;
        tdDesc.className = 'cell-ttl';
        tr.appendChild(tdDesc);

        var tdStatus = document.createElement('td');
        var statusBadge = document.createElement('span');
        statusBadge.className = 'status-badge status-' + bug.status;
        statusBadge.textContent = bug.status.charAt(0).toUpperCase() + bug.status.slice(1);
        tdStatus.appendChild(statusBadge);
        tr.appendChild(tdStatus);

        var tdSeverity = document.createElement('td');
        var sevInfo = severityBadgeInfo(bug);
        var severityBadge = document.createElement('span');
        severityBadge.className = 'severity-badge ' + sevInfo.cls;
        severityBadge.textContent = sevInfo.text;
        if (sevInfo.cls === 'severity-none') severityBadge.title = 'JIRA 优先级为空 —— 所有 Bug 都必须设置优先级，请到 JIRA 补优先级';
        tdSeverity.appendChild(severityBadge);
        tr.appendChild(tdSeverity);

        var tdOwner = document.createElement('td');
        tdOwner.textContent = bug.owner;
        tdOwner.title = bug.owner || '';
        tr.appendChild(tdOwner);

        var tdDomain = document.createElement('td');
        tdDomain.textContent = bug.domain;
        tdDomain.title = bug.domain || '';
        tr.appendChild(tdDomain);

        var tdDate = document.createElement('td');
        tdDate.textContent = bug.reportDate;
        tr.appendChild(tdDate);

        var tdAge = document.createElement('td');
        if (bug.ageDays !== undefined) {
            tdAge.textContent = bug.ageDays;
            if (bug.ageDays > 14 && bug.status !== 'closed' && bug.status !== 'rejected') {
                tdAge.className = 'age-overdue';
            } else if (bug.ageDays > 7) {
                tdAge.className = 'age-warning';
            }
        }
        tr.appendChild(tdAge);

        // ---- SLA 阶段1 三列（静默 / 心跳 / 修复SLA）+ 升档标记 ----
        var s = bug.sla || slaOf(bug);
        var tdSilent = document.createElement('td');
        tdSilent.textContent = (s.silent === null ? '-' : s.silent);
        tdSilent.className = 'sla-num' + (s.red ? ' sla-red-text' : (s.warn ? ' sla-warn-text' : ''));
        tdSilent.title = '静默 = 距 JIRA 最后一次更新 ' + (s.silent === null ? '?' : s.silent + ' 天') +
            '（心跳上限 ' + (s.cadence === null ? '-' : (s.cadence + 'd，红线 ' + (2 * s.cadence) + 'd')) + '）';
        tr.appendChild(tdSilent);

        var tdHeart = document.createElement('td');
        var hb = slaHeartbeatCell(s);
        var hbSpan = document.createElement('span');
        hbSpan.className = 'sla-badge ' + hb.cls;
        hbSpan.textContent = hb.text;
        tdHeart.appendChild(hbSpan);
        tr.appendChild(tdHeart);

        var tdFix = document.createElement('td');
        if (s.fixTarget === null || s.daysOpen === null) {
            tdFix.textContent = '-';
        } else if (s.fixOver > 0) {
            tdFix.textContent = '超 ' + s.fixOver + 'd';
            tdFix.className = 'sla-num sla-red-text';
        } else {
            tdFix.textContent = '剩 ' + s.fixRemain + 'd';
            tdFix.className = 'sla-num' + (s.fixRemain <= Math.max(1, Math.round(s.fixTarget * 0.2)) ? ' sla-warn-text' : '');
        }
        tdFix.title = '修复 SLA ' + s.fixTarget + ' 天（从报告日 ' + (bug.reportDate || '-') + ' 起算）';
        tr.appendChild(tdFix);

        var tdEsc = document.createElement('td');
        if (!SLA_ENFORCE) {
            // 提醒模式：不展示升档建议，只保留「挂起」状态（其余留空）
            if (s.paused) {
                tdEsc.innerHTML = '<span class="sla-badge sla-paused">挂起</span>';
                tdEsc.title = '挂起中（sla-paused）：静默不计入黄牌/红牌提醒';
            } else {
                tdEsc.textContent = '';
            }
        } else if (s.escalated) {
            // 列宽有限：徽章只放短标签，原档信息放 title（悬停可见）
            tdEsc.innerHTML = '<span class="sla-badge sla-esc-done">已升档</span>';
            tdEsc.title = '已升档' + (s.escFrom ? '（原档 ' + SLA_NAME[s.escFrom] + '）' : '') + '；请确认升档后是否还在静默';
        } else if (s.shouldEscalate) {
            tdEsc.innerHTML = '<span class="sla-badge sla-esc-suggest">→ ' + SLA_NAME[s.escTarget] + '</span>';
            tdEsc.title = '建议升一档：' + SLA_NAME[s.prio] + ' → ' + SLA_NAME[s.escTarget] + '（人在 JIRA 里改）';
        } else if (s.atTop) {
            tdEsc.innerHTML = '<span class="sla-badge sla-esc-top">到顶</span>';
            tdEsc.title = '已是 Highest 仍红牌 → 不升档，改升级到人（owner → PM）';
        } else if (s.paused) {
            tdEsc.innerHTML = '<span class="sla-badge sla-paused">挂起</span>';
            tdEsc.title = '挂起中（sla-paused）：静默不计、不升档';
        } else {
            tdEsc.textContent = '';
        }
        tr.appendChild(tdEsc);

        var tdDiag = document.createElement('td');
        var diagBtn = document.createElement('button');
        diagBtn.className = 'diag-btn';
        diagBtn.textContent = '\ud83d\udd0d';
        diagBtn.title = '智能诊断';
        diagBtn.onclick = (function(key) {
            return function() { diagnoseBug(key); };
        })(bug.bugId);
        tdDiag.appendChild(diagBtn);
        tr.appendChild(tdDiag);

        fragment.appendChild(tr);
    }

    tbody.appendChild(fragment);
    document.getElementById('bug-count').textContent = '显示 ' + displayBugs.length + ' / ' + bugs.length + ' 条';
}

// ============ Tag Filter (Labels) + Component Filter ============

function populateTagFilter(bugs) {
    // Populate labels dropdown
    var tagSet = {};
    bugs.forEach(function(bug) {
        var labels = bug.labels || [];
        labels.forEach(function(l) { if (l) tagSet[l] = true; });
    });
    var tags = Object.keys(tagSet).sort();
    var select = document.getElementById('tag-filter');
    var currentTag = select.value;
    select.innerHTML = '<option value="">全部标签</option>';
    tags.forEach(function(t) {
        var opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        select.appendChild(opt);
    });
    if (currentTag && tagSet[currentTag]) select.value = currentTag;

    // Populate components dropdown
    var compSet = {};
    bugs.forEach(function(bug) {
        var comps = bug.components || [];
        comps.forEach(function(c) { if (c) compSet[c] = true; });
    });
    var comps = Object.keys(compSet).sort();
    var compSelect = document.getElementById('tag-value-filter');
    var currentComp = compSelect.value;
    compSelect.innerHTML = '<option value="">全部组件</option>';
    comps.forEach(function(c) {
        var opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        compSelect.appendChild(opt);
    });
    compSelect.disabled = comps.length === 0;
    if (currentComp && compSet[currentComp]) compSelect.value = currentComp;

    // Restore state
    Dashboard.selectedTag = select.value || null;
    Dashboard.selectedComponent = compSelect.value || null;
}

function onTagFilterChange() {
    var val = document.getElementById('tag-filter').value;
    Dashboard.selectedTag = val || null;
    applyTableFilters();
}

function onTagValueFilterChange() {
    Dashboard.selectedComponent = document.getElementById('tag-value-filter').value || null;
    applyTableFilters();
}

var _filterBugsTimer = null;
function filterBugs() {
    if (_filterBugsTimer) clearTimeout(_filterBugsTimer);
    _filterBugsTimer = setTimeout(function() {
        applyTableFilters();
    }, 200);
}

function sortBugs(field) {
    if (Dashboard.sortField === field) {
        Dashboard.sortDirection = Dashboard.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        Dashboard.sortField = field;
        Dashboard.sortDirection = 'asc';
    }

    // Update sort indicators
    document.querySelectorAll('.dashboard-bug-table th').forEach(function(th) {
        th.classList.remove('sort-asc', 'sort-desc');
    });
    var th = document.querySelector('.dashboard-bug-table th[data-sort="' + field + '"]');
    if (th) {
        th.classList.add(Dashboard.sortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
    }

    applyTableFilters();
}

// ============ 导出 Bug 明细（按 priority 排序 + LLM 归纳最新 debug progress） ============

var PRIORITY_RANK = { highest: 0, high: 1, medium: 2, low: 3, lowest: 4 };

function jiraPriorityLabel(bug) {
    if (bug.jiraPriority) return bug.jiraPriority;
    var sev = bug.severity || '';
    return sev ? sev.charAt(0).toUpperCase() + sev.slice(1) : '';
}

function setExportStatus(msg, color) {
    var el = document.getElementById('export-status');
    if (!el) return;
    el.textContent = msg || '';
    el.style.color = color || '#777777';
}

function csvCell(val) {
    var s = (val === undefined || val === null) ? '' : String(val);
    // CSV 转义: 双引号加倍; 单元格内换行统一压成空格(Excel 单行更好读)
    return '"' + s.replace(/"/g, '""').replace(/\r\n|\r|\n/g, ' ') + '"';
}

function buildBugExportCsv(bugs, results) {
    var lines = [['Index', 'JIRA ID', 'Description', 'Priority', 'Age(days)', 'Silent(days)', 'Component', 'Assignee', 'Debug Progress'].map(csvCell).join(',')];
    bugs.forEach(function(bug, i) {
        var row = _exportRow(bug, (results || {})[bug.bugId]);
        lines.push([i + 1, row.key, row.description, row.priority, row.age, row.silent, row.component, row.assignee, row.progress].map(csvCell).join(','));
    });
    // UTF-8 BOM: Excel 直接双击打开不乱码
    return '\ufeff' + lines.join('\r\n') + '\r\n';
}

// ---- 导出分组：每个 priority 一个 Tab（含未设置优先级）----
var EXPORT_GROUPS = [
    { severity: 'highest', name: 'Highest', label: '🔥 Highest' },
    { severity: 'high',    name: 'High',    label: '⚡ High' },
    { severity: 'medium',  name: 'Medium',  label: '🔸 Medium' },
    { severity: 'low',     name: 'Low',     label: '🔹 Low' },
    { severity: 'lowest',  name: 'Lowest',  label: '▫️ Lowest' },
    { severity: '',        name: '未设置优先级', label: '❔ 未设置' }
];
var _exportState = null;   // { groups: [{name,label,bugs,rows}], stats }

// Debug progress 文案与旧 CSV 口径一致
function _exportProgressText(r) {
    r = r || {};
    if (r.error) return '（LLM 归纳失败，请到 JIRA 查看评论）';
    if (r.noComments) return '（JIRA 无评论）';
    if (!r.summary) return '（无归纳结果，请到 JIRA 查看评论）';
    return (r.lastCommentDate ? '[' + r.lastCommentDate + '] ' : '') + r.summary;
}

function _exportRow(bug, r) {
    // 年龄/静默与 Bug 明细表同口径：
    //   年龄 = ageDays（后端按 createdTimestamp 毫秒算，缺失则回退 reportDate 日期差）
    //   静默 = 今天 − JIRA updated（与 slaOf 的 silent 完全一致）
    var s = bug.sla || slaOf(bug);
    var age = (bug.ageDays !== undefined && bug.ageDays !== null) ? bug.ageDays : s.daysOpen;
    var silent = s.silent;
    return {
        key: bug.bugId,
        jiraUrl: bug.jiraUrl || '',
        description: bug.summary || bug.description || '',
        priority: jiraPriorityLabel(bug),
        age: (age === null || age === undefined) ? '' : age,
        silent: (silent === null || silent === undefined) ? '' : silent,
        component: (bug.components && bug.components.length ? bug.components.join(', ') : 'TBD'),
        assignee: bug.owner || '',
        progress: _exportProgressText(r)
    };
}


function downloadCsv(filename, content) {
    var blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function() {
        if (a.parentNode) a.parentNode.removeChild(a);
        URL.revokeObjectURL(url);
    }, 0);
}

async function exportBugDetails() {
    // 严格按当前表格筛选结果导出(含 Domain/状态/严重性/负责人/已关闭开关等);
    // 不要回退到 filteredBugs —— 否则筛选到 0 条时会导出全部, 与"按过滤导出"相悖
    var all = (Dashboard.visibleBugs || []).slice();
    if (!all.length) {
        alert('当前没有可导出的 Bug：请先选择项目查询数据，或放宽表格筛选条件。');
        return;
    }

    // 每个 priority 一组（空组丢弃，Tab 顺序 = highest→lowest→未设置）
    var groups = EXPORT_GROUPS.map(function(g) {
        var bugs = all.filter(function(b) { return String(b.severity || '').toLowerCase() === g.severity; });
        bugs.sort(function(a, b) {
            var na = parseInt(String(a.bugId).split('-').pop(), 10) || 0;
            var nb = parseInt(String(b.bugId).split('-').pop(), 10) || 0;
            return nb - na;   // 同优先级新 Bug 在前
        });
        return { severity: g.severity, name: g.name, label: g.label, bugs: bugs, rows: [] };
    }).filter(function(g) { return g.bugs.length > 0; });
    var targets = groups.reduce(function(a, g) { return a.concat(g.bugs); }, []);
    if (!targets.length) {
        alert('当前筛选结果里没有可导出的 Bug，无需导出。');
        return;
    }
    // 后端 /bug-debug-progress/batch 单次最多 200 条(LLM 归纳), 这里按分片多次请求,
    // 所以"按当前筛选结果导出"不再受 200 限制; 600 条仅作成本保护
    if (targets.length > 600) {
        alert('单次导出的 Bug 共 ' + targets.length + ' 条，超过 600 条上限。\n请先缩小筛选范围（如按 Domain / 状态 / 负责人）后再导出。');
        return;
    }

    var btn = document.getElementById('export-btn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ 归纳中…'; }
    var t0 = Date.now();
    var doneN = 0;
    var tick = function() {
        var s = Math.floor((Date.now() - t0) / 1000);
        var head = '正在抓取 ' + targets.length + ' 个 Bug（' + groups.map(function(g) { return g.name + ' ' + g.bugs.length; }).join(' / ')
            + '）的 JIRA 评论并做 LLM 归纳';
        if (doneN > 0) head = '已归纳 ' + doneN + ' / ' + targets.length + ' 条 · ' + head;
        setExportStatus(head + '（已等待 ' + s + 's，通常 10-90s）…', '#333333');
    };
    tick();
    var timer = setInterval(tick, 1000);

    try {
        var CHUNK = window.EXPORT_BATCH_CHUNK || 40;   // 后端单次上限 200, 40 一条请求更稳
        var results = {};
        var stats = { total: 0, summarized: 0, cached: 0, noComments: 0, failed: 0 };
        for (var start = 0; start < targets.length; start += CHUNK) {
            var slice = targets.slice(start, start + CHUNK);
            var resp = await fetch('/api/data/bug-debug-progress/batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({
                    items: slice.map(function(b) {
                        return { key: b.bugId, summary: b.summary || '', description: b.description || '' };
                    })
                })
            });
            var part = null;
            try { part = await resp.json(); } catch (e) { part = null; }
            if (!resp.ok || !part || !part.success) {
                if (resp.status === 401) { handleAuthExpired(); }
                throw new Error((part && part.error) || ('HTTP ' + resp.status));
            }
            var pr = part.results || {};
            Object.keys(pr).forEach(function(k) { results[k] = pr[k]; });
            var ps = part.stats || {};
            stats.summarized += ps.summarized || 0;
            stats.cached += ps.cached || 0;
            stats.noComments += ps.noComments || 0;
            stats.failed += ps.failed || 0;
            doneN += slice.length;
            stats.total = doneN;
            tick();
        }
        clearInterval(timer);
        var data = { results: results, stats: stats };
        groups.forEach(function(g) {
            g.rows = g.bugs.map(function(b) { return _exportRow(b, results[b.bugId]); });
        });
        _exportState = { groups: groups, stats: data.stats || {}, results: results };
        showExportModal();

        var st = data.stats || {};
        setExportStatus('✅ ' + groups.map(function(g) { return g.name + ' ' + g.bugs.length; }).join(' / ')
            + '（共 ' + targets.length + ' 条；LLM新归纳 ' + (st.summarized || 0) + ' / 缓存 ' + (st.cached || 0)
            + ' / 无评论 ' + (st.noComments || 0) + ' / 失败 ' + (st.failed || 0) + '）', '#27ae60');
    } catch (err) {
        clearInterval(timer);
        setExportStatus('❌ 导出失败: ' + err.message, '#e74c3c');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '📥 导出Bug明细'; }
    }
}

// ---- 预览弹窗：每个 priority 一个 Tab ----
function showExportModal() {
    var modal = document.getElementById('export-modal');
    if (!modal || !_exportState) return;
    var tabsEl = document.getElementById('export-tabs');
    var html = '';
    _exportState.groups.forEach(function(g, i) {
        html += '<button type="button" class="export-tab' + (i === 0 ? ' active' : '') + '"'
            + ' data-idx="' + i + '" onclick="switchExportTab(' + i + ')">'
            + g.label + ' <span class="export-tab-count">' + g.bugs.length + '</span></button>';
    });
    tabsEl.innerHTML = html;
    var totalN = _exportState.groups.reduce(function(s, g) { return s + g.bugs.length; }, 0);
    document.getElementById('export-summary').textContent =
        'JIRA Bug 明细 · 共 ' + totalN + ' 条 · ' + _exportState.groups.map(function(g) {
            return g.name + ' ' + g.bugs.length;
        }).join(' / ') + '（每个优先级一个 Sheet）';
    modal.style.display = 'flex';
    switchExportTab(0);
}

function switchExportTab(idx) {
    if (!_exportState || !_exportState.groups[idx]) return;
    _exportState.active = idx;
    var tabs = document.querySelectorAll('#export-tabs .export-tab');
    [].forEach.call(tabs, function(t, i) { t.classList.toggle('active', i === idx); });
    var g = _exportState.groups[idx];
    var tb = document.getElementById('export-tbody');
    if (!tb) return;
    if (!g.rows.length) {
        tb.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#8b93a7;padding:18px;">该优先级下暂无 Bug</td></tr>';
    } else {
        tb.innerHTML = g.rows.map(function(r, i) {
            // jira-dashboard.html 是独立页（不加载 globals.js，没有全局 App），
            // 所以优先用 bug 自带的 jiraUrl，其次才是 App.jiraBaseUrl，两者都没有就渲染纯文本，绝不能让 App 抛 ReferenceError
            var base = (typeof App !== 'undefined' && App && App.jiraBaseUrl) ? App.jiraBaseUrl : '';
            var href = r.jiraUrl || (base ? base + r.key : '');
            var keyCell = href
                ? '<a href="' + escapeHtml(href) + '" target="_blank" style="color:#4da3ff;">' + escapeHtml(r.key) + '</a>'
                : escapeHtml(r.key);
            return '<tr>'
                + '<td style="text-align:right;color:#8b93a7;">' + (i + 1) + '</td>'
                + '<td>' + keyCell + '</td>'
                + '<td>' + escapeHtml(r.description) + '</td>'
                + '<td>' + escapeHtml(r.priority) + '</td>'
                + '<td style="text-align:right;font-variant-numeric:tabular-nums;">' + escapeHtml(r.age) + '</td>'
                + '<td style="text-align:right;font-variant-numeric:tabular-nums;">' + escapeHtml(r.silent) + '</td>'
                + '<td>' + escapeHtml(r.component) + '</td>'
                + '<td>' + escapeHtml(r.assignee) + '</td>'
                + '<td style="white-space:pre-wrap;">' + escapeHtml(r.progress) + '</td>'
                + '</tr>';
        }).join('');
    }
    var st = _exportState.stats || {};
    document.getElementById('export-modal-status').textContent =
        'Debug Progress 由 LLM 依据 JIRA 评论/日志/截图归纳（新归纳 ' + (st.summarized || 0)
        + ' · 缓存 ' + (st.cached || 0) + ' · 无评论 ' + (st.noComments || 0) + ' · 失败 ' + (st.failed || 0) + '）';
}

function closeExportModal() {
    var modal = document.getElementById('export-modal');
    if (modal) modal.style.display = 'none';
}

// 导出 Excel：每个分类一个 worksheet（Excel 底部两个 tab）
async function downloadExportXlsx() {
    if (!_exportState) return;
    var btn = document.getElementById('export-xlsx-btn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ 生成中…'; }
    try {
        var payload = {
            groups: _exportState.groups.map(function(g) { return { name: g.name, rows: g.rows }; }),
            filename: 'JIRA-Bug明细-' + _exportState.groups.reduce(function(s, g) { return s + g.bugs.length; }, 0)
                + '条-' + _tsLabel() + '.xlsx'
        };
        var resp = await fetch('/api/data/bug-details-export', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            cache: 'no-store',
            body: JSON.stringify(payload)
        });
        if (!resp.ok) {
            if (resp.status === 401) { handleAuthExpired(); }
            var msg = 'HTTP ' + resp.status;
            try { var j = await resp.json(); msg = j.error || msg; } catch (e) {}
            throw new Error(msg);
        }
        var blob = await resp.blob();
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = payload.filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(function() { if (a.parentNode) a.parentNode.removeChild(a); URL.revokeObjectURL(url); }, 0);
        document.getElementById('export-modal-status').textContent = '✅ 已导出 ' + payload.filename
            + '（' + _exportState.groups.map(function(g) { return g.name; }).join(' / ') + ' 共 '
            + _exportState.groups.length + ' 个 Sheet）';
    } catch (e) {
        document.getElementById('export-modal-status').textContent = '❌ 导出失败: ' + e.message;
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '📥 导出 Excel（按优先级 Tab）'; }
    }
}

// 导出当前 Tab 为 CSV
function downloadExportTabCsv() {
    if (!_exportState) return;
    var g = _exportState.groups[_exportState.active || 0];
    var csv = buildBugExportCsv(g.bugs, _exportState.results || {});
    downloadCsv('JIRA-Bug-' + g.name + '-' + _tsLabel() + '.csv', csv);
    document.getElementById('export-modal-status').textContent = '✅ 已导出当前 Tab（' + g.name + '，' + g.bugs.length + ' 条）CSV';
}

function _tsLabel() {
    var d = new Date();
    var pad = function(n) { return ('0' + n).slice(-2); };
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes());
}


// ============ Auto Refresh ============

function startAutoRefresh() {
    var el = document.getElementById('auto-refresh');
    if (!el) return; // index.html 合体门无此元素, 防御
    if (Dashboard.autoRefreshTimer) {
        clearInterval(Dashboard.autoRefreshTimer);
        Dashboard.autoRefreshTimer = null;
    }
    // 默认 30 分钟（2026-11-05 由 5 分钟改为 30 分钟）
    var interval = parseInt(el.value, 10);
    if (isNaN(interval)) { interval = 30 * 60 * 1000; el.value = String(interval); }
    if (interval > 0) {
        Dashboard.autoRefreshInterval = interval;
        Dashboard.autoRefreshTimer = setInterval(function() {
            fetchDashboardData();
        }, interval);
    }
    updateAutoRefreshStatus();
}

// 手动触发：强制从 JIRA 重新拉一次（不走浏览器缓存），并给出可见反馈
async function manualRefresh() {
    var btn = document.getElementById('manual-refresh-btn');
    var statusEl = document.getElementById('manual-refresh-status');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ 刷新中…'; }
    if (statusEl) { statusEl.style.color = '#777777'; statusEl.textContent = '正在从 JIRA 获取最新数据…'; }
    try {
        await fetchDashboardData({ force: true });
        if (statusEl) {
            statusEl.style.color = '#27ae60';
            statusEl.textContent = '✅ 已更新 ' + (Dashboard.allBugs || []).length + ' 条 · ' + (Dashboard.lastRefreshAt || new Date().toLocaleString('zh-CN'));
        }
    } catch (e) {
        if (statusEl) { statusEl.style.color = '#e74c3c'; statusEl.textContent = '❌ 刷新失败: ' + e.message; }
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '🔄 手动刷新'; }
    }
}

function toggleAutoRefresh() {
    startAutoRefresh();
}

// 展示自动刷新状态 (间隔 + 下次刷新时刻); 每次设置/刷新后调用以保持新鲜
function updateAutoRefreshStatus() {
    var statusEl = document.getElementById('auto-refresh-status');
    if (!statusEl) return;
    var el = document.getElementById('auto-refresh');
    var min = parseInt(el && el.value) / 60000;
    if (min > 0) {
        var next = new Date(Date.now() + min * 60000);
        var hh = next.getHours();
        var mm = next.getMinutes();
        var hhStr = (hh < 10 ? '0' : '') + hh;
        var mmStr = (mm < 10 ? '0' : '') + mm;
        var unit = min >= 60 ? (min / 60) + '小时' : min + '分钟';
        statusEl.style.color = '#27ae60';
        statusEl.textContent = '自动刷新: 每' + unit + '从 JIRA 获取 (下次 ' + hhStr + ':' + mmStr + ')'
            + (Dashboard.lastRefreshAt ? ' · 上次 ' + Dashboard.lastRefreshAt : '');
    } else {
        statusEl.style.color = '#777777';
        statusEl.textContent = '自动刷新: 关闭';
    }
}

// ============ UI Helpers ============

function showLoading(show) {
    document.getElementById('loading-overlay').style.display = show ? 'flex' : 'none';
}

function showError(msg) {
    var el = document.getElementById('error-message');
    el.textContent = msg;
    el.style.display = 'block';
}

function hideError() {
    document.getElementById('error-message').style.display = 'none';
}

// 统一 401 处理: 会话失效时回到登录门, 而不是只显示「请求失败: HTTP 401」。
// 会话有效期自 v6.x 起为「连续 72h 无操作」才失效(绝对上限 30 天), 见后端 lib/sessions.js。
function handleAuthExpired(msg) {
    showError(msg || '登录已过期（连续 3 天无操作后才失效），请重新登录');
    if (typeof showGateLogin === 'function') {
        showGateLogin();
        var err = document.getElementById('gate-login-err');
        if (err) err.textContent = '登录已过期，请重新登录（会话有效期已延长为 3 天无操作）';
    }
}

function hideAllData() {
    document.getElementById('kpi-grid').style.display = 'none';
    document.getElementById('charts-grid').style.display = 'none';
    document.getElementById('bug-table-section').style.display = 'none';
    document.getElementById('last-updated').style.display = 'none';
}

// ============ 报告日期筛选 ============

function todayStr() {
    return new Date().toISOString().split('T')[0];
}
function getDateNDaysAgo(n) {
    return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
}
function onTimeRangeChange() {
    var v = document.getElementById('time-range').value;
    var fromEl = document.getElementById('report-date-from');
    var toEl = document.getElementById('report-date-to');
    if (v === 'all') {
        fromEl.value = '';
        toEl.value = '';
    } else if (v) {
        fromEl.value = getDateNDaysAgo(parseInt(v, 10));
        toEl.value = todayStr();
    }
    onFilterChange();
}
function onReportDateChange() {
    onFilterChange();
}
function clearReportDate() {
    document.getElementById('report-date-from').value = '';
    document.getElementById('report-date-to').value = '';
    onFilterChange();
}

function onFilterChange() {
    // Debounce: wait 500ms before fetching
    if (Dashboard.filterTimeout) clearTimeout(Dashboard.filterTimeout);
    Dashboard.filterTimeout = setTimeout(function() {
        fetchDashboardData();
    }, 500);
}

// ============ Keyboard shortcuts ============

document.addEventListener('keydown', function(e) {
    // Enter on gate login fields
    if (e.key === 'Enter' && document.getElementById('gate-login') && document.getElementById('gate-login').style.display === 'flex') {
        gateLoginSubmit();
    }
});

// ============ Init ============

document.addEventListener('DOMContentLoaded', function() {
    // Try to verify existing session (统一登录: 已有会话直接进入, 否则显示登录门)
    verifyAuth().then(function(loggedIn) {
        if (!loggedIn) {
            showGateLogin();
        }
    });
});

// ============ Bug Diagnosis ============

function diagnoseBug(bugKey) {
    var bug = Dashboard.allBugs.find(function(b) { return b.bugId === bugKey; });
    if (!bug) {
        alert('找不到 Bug: ' + bugKey);
        return;
    }

    var diagKey = document.getElementById('diag-bug-key');
    var diagLoading = document.getElementById('diag-loading');
    var diagResult = document.getElementById('diag-result');
    var diagModal = document.getElementById('diag-modal');

    if (diagKey) diagKey.textContent = bugKey;
    if (diagLoading) diagLoading.style.display = 'block';
    if (diagResult) diagResult.style.display = 'none';
    if (diagModal) diagModal.style.display = 'flex';

    fetch('/api/data/diagnose-bug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
            key: bugKey,
            summary: bug.description,
            status: bug.status,
            severity: bug.severity,
            projectKey: bug.projectKey || '',
            description: bug.jiraDescription || '',
            comments: bug.jiraComments || [],
            logContent: '',
            components: bug.components || [],
            rootCause: bug.rootCause || '',
            labels: bug.labels || []
        })
    })
    .then(function(resp) { return resp.json(); })
    .then(function(data) {
        if (data.success) {
            showDiagnoseResult(data.data, bug.status);
        } else {
            if (diagLoading) diagLoading.style.display = 'none';
            alert('诊断失败: ' + (data.error || '未知错误'));
        }
    })
    .catch(function(err) {
        if (diagLoading) diagLoading.style.display = 'none';
        alert('诊断请求失败: ' + err.message);
    });
}

// Quick diagnosis: diagnose by bug key only (backend auto-fetches from JIRA)
function diagnoseByKey() {
    console.log('[DiagByKey] Function called');

    var input = document.getElementById('quick-diag-key');
    if (!input) { alert('找不到输入框'); return; }
    var bugKey = input.value.trim();
    console.log('[DiagByKey] Bug key:', bugKey);
    if (!bugKey) {
        alert('请输入 Bug Key');
        return;
    }

    var diagKey = document.getElementById('diag-bug-key');
    var diagLoading = document.getElementById('diag-loading');
    var diagResult = document.getElementById('diag-result');
    var diagModal = document.getElementById('diag-modal');

    console.log('[DiagByKey] Elements:', diagKey ? 'OK' : 'NULL', diagLoading ? 'OK' : 'NULL', diagModal ? 'OK' : 'NULL');

    if (diagKey) diagKey.textContent = bugKey;
    if (diagLoading) diagLoading.style.display = 'block';
    if (diagResult) diagResult.style.display = 'none';
    if (diagModal) diagModal.style.display = 'flex';
    console.log('[DiagByKey] Modal display set to flex');

    // Only send key — backend auto-fetches comments, attachments, metadata from JIRA
    fetch('/api/data/diagnose-bug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ key: bugKey })
    })
    .then(function(resp) { return resp.json(); })
    .then(function(data) {
        console.log('[DiagByKey] Response:', JSON.stringify(data).substring(0, 300));
        if (data.success) {
            var bugStatus = data.data.bug_status || '';
            showDiagnoseResult(data.data, bugStatus);
        } else {
            if (diagLoading) diagLoading.style.display = 'none';
            var errMsg = data.error || data.message || '未知错误';
            alert('诊断失败: ' + errMsg);
        }
    })
    .catch(function(err) {
        if (diagLoading) diagLoading.style.display = 'none';
        alert('诊断请求失败: ' + err.message);
    });
}

function showDiagnoseResult(data, bugStatus) {
    var diagLoading = document.getElementById('diag-loading');
    var diagResult = document.getElementById('diag-result');
    if (diagLoading) diagLoading.style.display = 'none';
    if (diagResult) diagResult.style.display = 'block';

    var summaryEl = document.getElementById('diag-summary');
    if (summaryEl) summaryEl.textContent = data.summary || '无';

    // Confidence
    var confEl = document.getElementById('diag-confidence');
    if (confEl) {
        var conf = data.confidence || 0;
        var confColor = conf >= 70 ? '#27ae60' : (conf >= 40 ? '#f39c12' : '#e74c3c');
        confEl.textContent = '';
        var confStrong = document.createElement('strong');
        confStrong.style.color = confColor;
        confStrong.textContent = conf + '%';
        confEl.appendChild(document.createTextNode('置信度: '));
        confEl.appendChild(confStrong);
    }

    // Causes
    var causesEl = document.getElementById('diag-causes');
    if (causesEl) {
        causesEl.innerHTML = '';
        (data.possible_causes || []).forEach(function(c) {
            var li = document.createElement('li');
            li.textContent = c;
            causesEl.appendChild(li);
        });
    }

    // Check if bug is closed or rejected
    var isClosed = (bugStatus === 'closed' || bugStatus === 'rejected');

    // For closed/rejected bugs: show conclusion, hide actions and data
    var actionsSection = document.getElementById('diag-actions-section');
    var dataSection = document.getElementById('diag-data-section');
    var conclusionSection = document.getElementById('diag-conclusion-section');
    var conclusionEl = document.getElementById('diag-conclusion');

    if (isClosed) {
        if (actionsSection) actionsSection.style.display = 'none';
        if (dataSection) dataSection.style.display = 'none';
        if (conclusionSection) conclusionSection.style.display = 'block';
        if (conclusionEl) conclusionEl.textContent = data.conclusion || '该Bug已解决，无进一步建议。';
    } else {
        if (actionsSection) actionsSection.style.display = 'block';
        if (dataSection) dataSection.style.display = 'block';
        if (conclusionSection) conclusionSection.style.display = 'none';

        var actionsEl = document.getElementById('diag-actions');
        if (actionsEl) {
            actionsEl.innerHTML = '';
            (data.suggested_actions || []).forEach(function(a) {
                var li = document.createElement('li');
                li.textContent = a;
                actionsEl.appendChild(li);
            });
        }

        var dataEl = document.getElementById('diag-data');
        if (dataEl) {
            dataEl.innerHTML = '';
            (data.needed_data || []).forEach(function(d) {
                var li = document.createElement('li');
                li.textContent = d;
                dataEl.appendChild(li);
            });
        }
    }

    // Related bugs (cross-project) — score | key | summary
    var relatedSection = document.getElementById('diag-related-section');
    var relatedEl = document.getElementById('diag-related-bugs');

    if (relatedEl) relatedEl.innerHTML = '';

    if (data.related_bugs && data.related_bugs.length > 0) {
        if (relatedSection) relatedSection.style.display = 'block';
        data.related_bugs.forEach(function(b) {
            var row = document.createElement('div');
            row.className = 'related-bug-item';

            // Score
            var scoreSpan = document.createElement('span');
            scoreSpan.className = 'related-bug-score';
            var score = b.relevance_score || 0;
            scoreSpan.textContent = score;
            if (score >= 80) {
                scoreSpan.style.color = '#27ae60';
            } else if (score >= 60) {
                scoreSpan.style.color = '#f39c12';
            } else {
                scoreSpan.style.color = '#e74c3c';
            }
            row.appendChild(scoreSpan);

            // Bug key (clickable link)
            var keyLink = document.createElement('a');
            keyLink.href = b.url || '#';
            keyLink.target = '_blank';
            keyLink.className = 'related-bug-key';
            keyLink.textContent = b.key || '';
            row.appendChild(keyLink);

            // Summary
            var summarySpan = document.createElement('span');
            summarySpan.className = 'related-bug-summary';
            summarySpan.textContent = b.summary || '';
            summarySpan.title = b.summary || '';
            row.appendChild(summarySpan);

            relatedEl.appendChild(row);
        });
    } else {
        if (relatedSection) relatedSection.style.display = 'none';
    }

    // ===== Screenshot Analysis Section =====
    var screenshotSection = document.getElementById('diag-screenshot-section');
    var screenshotContent = document.getElementById('diag-screenshot-content');
    if (screenshotContent) screenshotContent.innerHTML = '';

    var hasAnyScreenshots = false;

    // Check for source bug screenshots
    var sourceImages = data.source_image_summaries || [];
    var sourcePending = data.source_unanalyzed_images || [];

    // Check for related bug screenshots
    var relatedBugImages = [];
    if (data.related_bugs) {
        data.related_bugs.forEach(function(rb) {
            var imgs = rb.image_summaries || [];
            var pend = rb.unanalyzed_images || [];
            if (imgs.length > 0 || pend.length > 0) {
                relatedBugImages.push({
                    key: rb.key,
                    url: rb.url,
                    images: imgs,
                    pending: pend
                });
            }
        });
    }

    if (sourceImages.length > 0 || sourcePending.length > 0 || relatedBugImages.length > 0) {
        hasAnyScreenshots = true;

        // Source bug accordion group
        if (sourceImages.length > 0 || sourcePending.length > 0) {
            var sourceGroup = document.createElement('div');
            sourceGroup.className = 'screenshot-section-group';

            var analyzedCount = sourceImages.length;
            var pendingCount = sourcePending.length;
            var headerEl = document.createElement('div');
            headerEl.className = 'screenshot-group-header';
            var iconSpan = document.createElement('span');
            iconSpan.className = 'accordion-icon';
            iconSpan.textContent = '\u25b6';
            headerEl.appendChild(iconSpan);
            headerEl.appendChild(document.createTextNode(' 源Bug截图 '));
            var sourceBadge = document.createElement('span');
            sourceBadge.className = 'screenshot-badge badge-source';
            sourceBadge.textContent = '已分析' + analyzedCount + '张';
            headerEl.appendChild(sourceBadge);
            if (pendingCount > 0) {
                var pendingBadge = document.createElement('span');
                pendingBadge.className = 'screenshot-pending';
                pendingBadge.textContent = '待分析' + pendingCount + '张';
                headerEl.appendChild(pendingBadge);
            }
            sourceGroup.appendChild(headerEl);

            var contentEl = document.createElement('div');
            contentEl.className = 'screenshot-group-content';
            var gridEl = document.createElement('div');
            gridEl.className = 'screenshot-grid';

            // Render analyzed screenshots
            sourceImages.forEach(function(img) {
                gridEl.appendChild(createScreenshotCard(img, false));
            });

            // Render pending screenshots
            sourcePending.forEach(function(img) {
                gridEl.appendChild(createPendingCard(img));
            });

            contentEl.appendChild(gridEl);
            sourceGroup.appendChild(contentEl);

            // Toggle handler
            headerEl.addEventListener('click', function() {
                var isExpanded = headerEl.classList.contains('expanded');
                if (isExpanded) {
                    headerEl.classList.remove('expanded');
                    contentEl.classList.remove('expanded');
                } else {
                    headerEl.classList.add('expanded');
                    contentEl.classList.add('expanded');
                }
            });

            screenshotContent.appendChild(sourceGroup);
        }

        // Related bug accordion groups
        relatedBugImages.forEach(function(rb) {
            var group = document.createElement('div');
            group.className = 'screenshot-section-group';

            var rAnalyzed = rb.images.length;
            var rPending = rb.pending.length;
            var rHeaderEl = document.createElement('div');
            rHeaderEl.className = 'screenshot-group-header';
            var rIcon = document.createElement('span');
            rIcon.className = 'accordion-icon';
            rIcon.textContent = '\u25b6';
            rHeaderEl.appendChild(rIcon);
            rHeaderEl.appendChild(document.createTextNode(' 相关Bug ' + rb.key + ' 截图 '));
            var rBadge = document.createElement('span');
            rBadge.className = 'screenshot-badge badge-related';
            rBadge.textContent = rb.key + ' - 已分析' + rAnalyzed + '张';
            rHeaderEl.appendChild(rBadge);
            if (rPending > 0) {
                var rPendingBadge = document.createElement('span');
                rPendingBadge.className = 'screenshot-pending';
                rPendingBadge.textContent = '待分析' + rPending + '张';
                rHeaderEl.appendChild(rPendingBadge);
            }
            group.appendChild(rHeaderEl);

            var rContentEl = document.createElement('div');
            rContentEl.className = 'screenshot-group-content';
            var rGridEl = document.createElement('div');
            rGridEl.className = 'screenshot-grid';

            rb.images.forEach(function(img) {
                rGridEl.appendChild(createScreenshotCard(img, false));
            });
            rb.pending.forEach(function(img) {
                rGridEl.appendChild(createPendingCard(img));
            });

            rContentEl.appendChild(rGridEl);
            group.appendChild(rContentEl);

            rHeaderEl.addEventListener('click', function() {
                var isExpanded = rHeaderEl.classList.contains('expanded');
                if (isExpanded) {
                    rHeaderEl.classList.remove('expanded');
                    rContentEl.classList.remove('expanded');
                } else {
                    rHeaderEl.classList.add('expanded');
                    rContentEl.classList.add('expanded');
                }
            });

            screenshotContent.appendChild(group);
        });
    }

    if (hasAnyScreenshots && screenshotSection) {
        screenshotSection.style.display = 'block';
    } else if (screenshotSection) {
        screenshotSection.style.display = 'none';
    }

    // ===== VLM Status Indicator =====
    var vlmStatusSection = document.getElementById('diag-vlm-status');
    var vlmIcon = document.getElementById('diag-vlm-icon');
    var vlmText = document.getElementById('diag-vlm-text');

    if (vlmStatusSection && vlmIcon && vlmText) {
        var totalAnalyzed = sourceImages.length;
        var totalPending = sourcePending.length;
        var totalAttachments = totalAnalyzed + totalPending;

        vlmStatusSection.className = 'diag-section diag-vlm-status';

        if (totalAttachments > 0) {
            // Has attachments — show analysis status
            if (totalAnalyzed > 0 && totalPending === 0) {
                vlmIcon.textContent = '🟢';
                vlmText.textContent = 'VLM图片识别 — 源Bug共 ' + totalAttachments + ' 张附件，已完成识别';
                vlmStatusSection.classList.add('vlm-active');
            } else if (totalAnalyzed > 0 && totalPending > 0) {
                vlmIcon.textContent = '🟡';
                vlmText.textContent = 'VLM图片识别 — 源Bug共 ' + totalAttachments + ' 张附件，已识别 ' + totalAnalyzed + ' 张，待识别 ' + totalPending + ' 张';
                vlmStatusSection.classList.add('vlm-pending');
            } else {
                vlmIcon.textContent = '⚪';
                vlmText.textContent = 'VLM图片识别 — 源Bug共 ' + totalAttachments + ' 张附件，当前模型不支持VLM，待启用后自动识别';
                vlmStatusSection.classList.add('vlm-disabled');
            }
        } else {
            // No attachments
            vlmIcon.textContent = '⚪';
            vlmText.textContent = 'VLM图片识别 — 源Bug无附件截图';
            vlmStatusSection.classList.add('vlm-disabled');
        }
        vlmStatusSection.style.display = 'flex';
    }
}

// Helper: create accordion header element
function createAccordionHeader(label) {
    var el = document.createElement('div');
    el.className = 'screenshot-group-header';
    el.textContent = label;
    return el;
}

// Helper: create a screenshot card from structured data
function createScreenshotCard(imgData) {
    var card = document.createElement('div');
    card.className = 'screenshot-card';

    // Handle both structured objects and legacy strings
    var summary, imgType, keyData, keywords;
    if (typeof imgData === 'string') {
        summary = imgData;
        imgType = 'other';
        keyData = [];
        keywords = [];
    } else {
        summary = imgData.summary || '';
        imgType = imgData.type || 'other';
        keyData = imgData.key_data || [];
        keywords = imgData.keywords || [];
    }

    // Type badge
    var typeEl = document.createElement('div');
    typeEl.className = 'screenshot-card-type type-' + imgType;
    typeEl.textContent = imgType.replace(/_/g, ' ');
    card.appendChild(typeEl);

    // Summary
    if (summary) {
        var summaryEl = document.createElement('div');
        summaryEl.className = 'screenshot-card-summary';
        summaryEl.textContent = summary;
        card.appendChild(summaryEl);
    }

    // Key data
    if (keyData && keyData.length > 0) {
        var kdEl = document.createElement('div');
        kdEl.className = 'screenshot-card-key-data';
        var kdTitle = document.createElement('strong');
        kdTitle.textContent = '关键数据:';
        kdEl.appendChild(kdTitle);
        var kdUl = document.createElement('ul');
        keyData.forEach(function(kd) {
            var li = document.createElement('li');
            li.textContent = kd;
            kdUl.appendChild(li);
        });
        kdEl.appendChild(kdUl);
        card.appendChild(kdEl);
    }

    // Keywords
    if (keywords && keywords.length > 0) {
        var kwEl = document.createElement('div');
        kwEl.className = 'screenshot-card-keywords';
        keywords.slice(0, 8).forEach(function(kw) {
            var tag = document.createElement('span');
            tag.className = 'screenshot-keyword-tag';
            tag.textContent = kw;
            kwEl.appendChild(tag);
        });
        card.appendChild(kwEl);
    }

    return card;
}

// Helper: create a pending screenshot card
function createPendingCard(imgData) {
    var card = document.createElement('div');
    card.className = 'screenshot-card screenshot-card-pending';

    var typeEl = document.createElement('div');
    typeEl.className = 'screenshot-card-type';
    typeEl.textContent = '待分析';
    card.appendChild(typeEl);

    var summaryEl = document.createElement('div');
    summaryEl.className = 'screenshot-card-summary';
    summaryEl.textContent = imgData.filename || imgData.url || '未知截图';
    summaryEl.title = imgData.url || '';
    card.appendChild(summaryEl);

    if (imgData.url) {
        var linkEl = document.createElement('a');
        linkEl.href = imgData.url;
        linkEl.target = '_blank';
        linkEl.style.fontSize = '11px';
        linkEl.style.color = '#e65100';
        linkEl.textContent = '查看原图 →';
        card.appendChild(linkEl);
    }

    return card;
}

// ============ Quick Keyword Search ============

var searchDebounceTimer = null;

function onSearchInput() {
    // Debounce: wait 300ms before searching
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(function() {
        searchBugsByKey();
    }, 300);
}

function searchBugsByKey() {
    var keyword = document.getElementById('quick-search-keyword').value.trim().toLowerCase();
    var resultsContainer = document.getElementById('quick-search-results');

    console.log('[Search] keyword:', keyword, 'allBugs.length:', Dashboard.allBugs.length);
    if (Dashboard.allBugs.length > 0) {
        console.log('[Search] Sample bug keys:', Dashboard.allBugs.slice(0, 3).map(function(b) { return b.bugId; }));
        console.log('[Search] Sample bug fields:', Object.keys(Dashboard.allBugs[0]));
    }

    if (!keyword) {
        resultsContainer.style.display = 'none';
        resultsContainer.innerHTML = '';
        return;
    }

    // Auto-sync if data hasn't been loaded yet
    if (Dashboard.allBugs.length === 0) {
        resultsContainer.textContent = '正在加载 JIRA 数据，请稍候...';
        resultsContainer.style.display = 'block';

        fetchDashboardData().then(function() {
            setTimeout(function() {
                console.log('[Search] Auto-sync complete, allBugs.length:', Dashboard.allBugs.length);
                if (Dashboard.allBugs.length === 0) {
                    resultsContainer.textContent = '数据加载失败，请手动点击"同步JIRA数据"后重试';
                    return;
                }
                searchBugsByKey();
            }, 500);
        }).catch(function() {
            resultsContainer.textContent = '数据同步失败，请手动点击"同步JIRA数据"后重试';
        });
        return;
    }

    // Debug: log first bug's field names and values
    if (Dashboard.allBugs.length > 0) {
        var sampleBug = Dashboard.allBugs[0];
        var sampleFields = {};
        for (var key in sampleBug) {
            sampleFields[key] = sampleBug[key];
        }
        console.log('[Search] First bug fields:', JSON.stringify(sampleFields, null, 2));

        // Also check if keyword matches a known bug
        var testBug = Dashboard.allBugs[0];
        console.log('[Search] Test - bugId:', testBug.bugId, '| desc:', (testBug.description || '').substring(0, 50), '| domain:', testBug.domain, '| owner:', testBug.owner);
    }

    // Search across all bugs (include summary & rootCause for full coverage)
    var searchFields = ['bugId', 'description', 'summary', 'domain', 'owner', 'status', 'severity', 'rootCause'];
    var matchCount = 0;
    var results = Dashboard.allBugs.filter(function(bug) {
        for (var i = 0; i < searchFields.length; i++) {
            var field = searchFields[i];
            var value = bug[field] || '';
            if (value.toLowerCase().indexOf(keyword) !== -1) {
                if (matchCount < 3) {
                    console.log('[Search] Match on field "' + field + '":', value.substring(0, 80));
                }
                matchCount++;
                return true;
            }
        }
        // Also search components and labels arrays
        if (bug.components && Array.isArray(bug.components)) {
            for (var j = 0; j < bug.components.length; j++) {
                if (bug.components[j].toLowerCase().indexOf(keyword) !== -1) {
                    return true;
                }
            }
        }
        if (bug.labels && Array.isArray(bug.labels)) {
            for (var k = 0; k < bug.labels.length; k++) {
                if (bug.labels[k].toLowerCase().indexOf(keyword) !== -1) {
                    return true;
                }
            }
        }
        return false;
    });

    console.log('[Search] Found', results.length, 'matches out of', Dashboard.allBugs.length);

    // Sort by relevance: exact key match first, then description contains, then others
    results.sort(function(a, b) {
        var aExact = a.bugId.toLowerCase() === keyword ? 1 : 0;
        var bExact = b.bugId.toLowerCase() === keyword ? 1 : 0;
        if (aExact !== bExact) return bExact - aExact;

        var aKeyStart = a.bugId.toLowerCase().indexOf(keyword) === 0 ? 1 : 0;
        var bKeyStart = b.bugId.toLowerCase().indexOf(keyword) === 0 ? 1 : 0;
        if (aKeyStart !== bKeyStart) return bKeyStart - aKeyStart;

        // Prefer open bugs over closed
        var aOpen = (a.status !== 'closed' && a.status !== 'rejected') ? 1 : 0;
        var bOpen = (b.status !== 'closed' && b.status !== 'rejected') ? 1 : 0;
        if (aOpen !== bOpen) return bOpen - aOpen;

        return 0;
    });

    // Limit to 50 results
    var maxResults = 50;
    var displayResults = results.slice(0, maxResults);

    renderSearchResults(displayResults, results.length, keyword);
}

function renderSearchResults(bugs, totalCount, keyword) {
    var container = document.getElementById('quick-search-results');
    container.innerHTML = '';
    container.style.display = 'block';

    if (bugs.length === 0) {
        var noResultDiv = document.createElement('div');
        noResultDiv.className = 'search-no-results';
        noResultDiv.appendChild(document.createTextNode('未找到匹配 "'));
        var strongEl = document.createElement('strong');
        strongEl.textContent = keyword;
        noResultDiv.appendChild(strongEl);
        noResultDiv.appendChild(document.createTextNode('" 的 Bug'));
        container.appendChild(noResultDiv);
        return;
    }

    var header = document.createElement('div');
    header.className = 'search-results-header';
    header.textContent = '找到 ' + bugs.length + (totalCount > bugs.length ? '+' : '') + ' 条结果（共 ' + totalCount + ' 条）';
    container.appendChild(header);

    var list = document.createElement('div');
    list.className = 'search-results-list';

    bugs.forEach(function(bug) {
        var item = document.createElement('div');
        item.className = 'search-result-item';

        // Row 1: Key + Status + Severity
        var row1 = document.createElement('div');
        row1.className = 'search-result-row1';

        var keyLink = document.createElement('a');
        keyLink.href = jiraHref(bug);
        keyLink.target = '_blank';
        keyLink.className = 'search-result-key';
        highlightTextNodes(bug.bugId, keyword, keyLink);
        row1.appendChild(keyLink);

        var statusBadge = document.createElement('span');
        statusBadge.className = 'status-badge status-' + bug.status;
        statusBadge.textContent = bug.status.charAt(0).toUpperCase() + bug.status.slice(1);
        row1.appendChild(statusBadge);

        var severityBadge = document.createElement('span');
        var sevInfo2 = severityBadgeInfo(bug);
        severityBadge.className = 'severity-badge ' + sevInfo2.cls;
        severityBadge.textContent = sevInfo2.text;
        row1.appendChild(severityBadge);

        item.appendChild(row1);

        // Row 2: Description
        var row2 = document.createElement('div');
        row2.className = 'search-result-desc';
        highlightTextNodes(bug.summary || bug.description, keyword, row2);
        row2.title = bug.summary || bug.description;
        item.appendChild(row2);

        // Row 3: Owner + Domain + Date
        var row3 = document.createElement('div');
        row3.className = 'search-result-meta';
        var metaOwner = document.createElement('span');
        metaOwner.appendChild(document.createTextNode('负责人: '));
        highlightTextNodes(bug.owner, keyword, metaOwner);
        row3.appendChild(metaOwner);
        var metaDomain = document.createElement('span');
        metaDomain.appendChild(document.createTextNode('Domain: '));
        highlightTextNodes(bug.domain, keyword, metaDomain);
        row3.appendChild(metaDomain);
        var metaDate = document.createElement('span');
        metaDate.textContent = bug.reportDate;
        row3.appendChild(metaDate);
        item.appendChild(row3);

        // Row 4: Action buttons
        var row4 = document.createElement('div');
        row4.className = 'search-result-actions';

        var diagBtn = document.createElement('button');
        diagBtn.className = 'search-result-diag-btn';
        diagBtn.textContent = '🔍 诊断';
        diagBtn.onclick = (function(key) {
            return function() { diagnoseBug(key); };
        })(bug.bugId);
        row4.appendChild(diagBtn);

        item.appendChild(row4);

        list.appendChild(item);
    });

    container.appendChild(list);
}

function highlightTextNodes(text, keyword, parentEl) {
    if (!text) return;
    if (!keyword) {
        parentEl.appendChild(document.createTextNode(text));
        return;
    }
    var regex = new RegExp('(' + escapeRegex(keyword) + ')', 'gi');
    var parts = text.split(regex);
    parts.forEach(function(part) {
        if (part.toLowerCase() === keyword.toLowerCase()) {
            var mark = document.createElement('mark');
            mark.className = 'search-highlight';
            mark.textContent = part;
            parentEl.appendChild(mark);
        } else {
            parentEl.appendChild(document.createTextNode(part));
        }
    });
}

function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function closeDiagModal() {
    var modal = document.getElementById('diag-modal');
    if (modal) modal.style.display = 'none';
}
