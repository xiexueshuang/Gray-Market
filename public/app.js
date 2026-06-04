const state = {
  rows: [],
  filteredRows: [],
  sortKey: "score",
  sortDir: "desc",
  lastPayload: null,
  view: "tracker",
  sectorRows: [],
  filteredSectorRows: [],
  sectorSortKey: "rotationScore",
  sectorSortDir: "desc",
  sectorPeriod: 1,
  selectedSectorCode: "",
  hotRows: [],
  filteredHotRows: [],
  hotSortKey: "totalScore",
  hotSortDir: "desc",
  hotPeriod: 1,
  selectedHotCode: ""
};

const API_BASE = window.location.protocol === "file:" ? "http://localhost:4173" : "";

const modes = {
  balanced: { minAmount: 8, minVolumeRatio: 1.2, maxChange: 8, maxAmplitude: 9 },
  conservative: { minAmount: 10, minVolumeRatio: 1.5, maxChange: 5, maxAmplitude: 7 },
  aggressive: { minAmount: 5, minVolumeRatio: 1.1, maxChange: 9.5, maxAmplitude: 11 },
  capacity: { minAmount: 20, minVolumeRatio: 1.2, maxChange: 8, maxAmplitude: 9 }
};

const els = {
  refreshBtn: document.querySelector("#refreshBtn"),
  exportBtn: document.querySelector("#exportBtn"),
  minAmount: document.querySelector("#minAmount"),
  minVolumeRatio: document.querySelector("#minVolumeRatio"),
  maxChange: document.querySelector("#maxChange"),
  maxAmplitude: document.querySelector("#maxAmplitude"),
  minAmountOut: document.querySelector("#minAmountOut"),
  minVolumeRatioOut: document.querySelector("#minVolumeRatioOut"),
  maxChangeOut: document.querySelector("#maxChangeOut"),
  maxAmplitudeOut: document.querySelector("#maxAmplitudeOut"),
  candidateCount: document.querySelector("#candidateCount"),
  totalMain: document.querySelector("#totalMain"),
  positiveSuper: document.querySelector("#positiveSuper"),
  avgVolumeRatio: document.querySelector("#avgVolumeRatio"),
  timestamp: document.querySelector("#timestamp"),
  sourceBadge: document.querySelector("#sourceBadge"),
  focusList: document.querySelector("#focusList"),
  rowsBody: document.querySelector("#rowsBody"),
  searchInput: document.querySelector("#searchInput"),
  trackerView: document.querySelector("#trackerView"),
  sectorView: document.querySelector("#sectorView"),
  hotView: document.querySelector("#hotView"),
  sectorTimestamp: document.querySelector("#sectorTimestamp"),
  sectorSourceBadge: document.querySelector("#sectorSourceBadge"),
  sectorCount: document.querySelector("#sectorCount"),
  sectorHotCount: document.querySelector("#sectorHotCount"),
  sectorFadeCount: document.querySelector("#sectorFadeCount"),
  sectorTotalMain: document.querySelector("#sectorTotalMain"),
  sectorFocusList: document.querySelector("#sectorFocusList"),
  sectorRowsBody: document.querySelector("#sectorRowsBody"),
  sectorSearchInput: document.querySelector("#sectorSearchInput"),
  sectorState: document.querySelector("#sectorState"),
  sectorDetailTitle: document.querySelector("#sectorDetailTitle"),
  sectorDetailMeta: document.querySelector("#sectorDetailMeta"),
  sectorDetailBadge: document.querySelector("#sectorDetailBadge"),
  sectorDetailCards: document.querySelector("#sectorDetailCards"),
  sectorDetailRows: document.querySelector("#sectorDetailRows"),
  hotTimestamp: document.querySelector("#hotTimestamp"),
  hotSourceBadge: document.querySelector("#hotSourceBadge"),
  hotCount: document.querySelector("#hotCount"),
  hotStrongCount: document.querySelector("#hotStrongCount"),
  hotPositiveFlow: document.querySelector("#hotPositiveFlow"),
  hotAvgScore: document.querySelector("#hotAvgScore"),
  hotFocusList: document.querySelector("#hotFocusList"),
  hotRowsBody: document.querySelector("#hotRowsBody"),
  hotSearchInput: document.querySelector("#hotSearchInput"),
  hotState: document.querySelector("#hotState"),
  hotDetailModal: document.querySelector("#hotDetailModal"),
  hotDetailClose: document.querySelector("#hotDetailClose"),
  hotDetailTitle: document.querySelector("#hotDetailTitle"),
  hotDetailMeta: document.querySelector("#hotDetailMeta"),
  hotDetailBadge: document.querySelector("#hotDetailBadge"),
  hotDetailCards: document.querySelector("#hotDetailCards"),
  toast: document.querySelector("#toast")
};

function money(value) {
  if (value === null || value === undefined || value === "") return "待确认";
  const number = Number(value);
  if (!Number.isFinite(number)) return "待确认";
  const abs = Math.abs(number);
  const sign = number < 0 ? "-" : "";
  if (abs >= 100_000_000) return `${sign}${(abs / 100_000_000).toFixed(2)}亿`;
  if (abs >= 10_000) return `${sign}${(abs / 10_000).toFixed(0)}万`;
  return `${number.toFixed(0)}`;
}

function pct(value) {
  if (value === null || value === undefined || value === "") return "待确认";
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(2)}%` : "待确认";
}

function fixed(value, digits = 2) {
  if (value === null || value === undefined || value === "") return "待确认";
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(digits) : "待确认";
}

function codeOf(row) {
  return `${row.exchange}${row.code}`;
}

function statusClass(status) {
  if (status === "强势") return "hot";
  if (status === "升温") return "warm";
  if (status === "退潮") return "fade";
  if (status === "强关注") return "hot";
  if (status === "观察") return "warm";
  if (status === "谨慎") return "fade";
  return "split";
}

function rankChangeText(value) {
  if (value === null || value === undefined) return "待确认";
  if (!value) return "0";
  return value > 0 ? `↑${value}` : `↓${Math.abs(value)}`;
}

function rankChangeClass(value) {
  if (value > 0) return "good";
  if (value < 0) return "bad";
  return "";
}

function updateOutputs() {
  els.minAmountOut.value = `${Number(els.minAmount.value).toFixed(0)}亿`;
  els.minVolumeRatioOut.value = Number(els.minVolumeRatio.value).toFixed(1);
  els.maxChangeOut.value = `${Number(els.maxChange.value).toFixed(1)}%`;
  els.maxAmplitudeOut.value = `${Number(els.maxAmplitude.value).toFixed(1)}%`;
}

function params() {
  return new URLSearchParams({
    limit: "80",
    minAmount: String(Number(els.minAmount.value) * 100_000_000),
    minVolumeRatio: els.minVolumeRatio.value,
    maxChange: els.maxChange.value,
    maxAmplitude: els.maxAmplitude.value,
    minChange: "-1",
    minMainInflow: "0"
  });
}

async function refresh() {
  if (state.view === "sectors") {
    await refreshSectors();
    return;
  }
  if (state.view === "hot") {
    await refreshHotLeaders();
    return;
  }
  updateOutputs();
  els.refreshBtn.disabled = true;
  els.refreshBtn.textContent = "刷新中";
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${API_BASE}/api/scan?${params().toString()}`, {
      cache: "no-store",
      signal: controller.signal
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "请求失败");
    state.lastPayload = payload;
    state.rows = payload.rows;
    state.filteredRows = payload.rows;
    render(payload);
    showToast(payload.warning || "行情已更新");
  } catch (error) {
    showToast(error.name === "AbortError" ? "行情请求超时" : error.message);
  } finally {
    window.clearTimeout(timeoutId);
    els.refreshBtn.disabled = false;
    els.refreshBtn.textContent = "↻ 刷新";
  }
}

async function refreshHotLeaders() {
  els.refreshBtn.disabled = true;
  els.refreshBtn.textContent = "刷新中";
  els.hotState.textContent = "热度龙头数据加载中";
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch(`${API_BASE}/api/hot-leaders?period=${state.hotPeriod}&limit=50`, {
      cache: "no-store",
      signal: controller.signal
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "请求失败");
    state.hotRows = payload.rows;
    renderHotLeaders(payload);
    showToast(payload.warning || "热度龙头已更新");
  } catch (error) {
    els.hotState.textContent = error.name === "AbortError" ? "热度榜请求超时" : error.message;
    showToast(els.hotState.textContent);
  } finally {
    window.clearTimeout(timeoutId);
    els.refreshBtn.disabled = false;
    els.refreshBtn.textContent = "↻ 刷新";
  }
}

async function refreshSectors() {
  els.refreshBtn.disabled = true;
  els.refreshBtn.textContent = "刷新中";
  els.sectorState.textContent = "板块轮动数据加载中";
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 18_000);
  try {
    const response = await fetch(`${API_BASE}/api/sectors?period=${state.sectorPeriod}&limit=80`, {
      cache: "no-store",
      signal: controller.signal
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "请求失败");
    state.sectorRows = payload.rows;
    renderSectors(payload);
    showToast(payload.warning || "板块轮动已更新");
  } catch (error) {
    els.sectorState.textContent = error.name === "AbortError" ? "板块行情请求超时" : error.message;
    showToast(els.sectorState.textContent);
  } finally {
    window.clearTimeout(timeoutId);
    els.refreshBtn.disabled = false;
    els.refreshBtn.textContent = "↻ 刷新";
  }
}

function render(payload) {
  els.candidateCount.textContent = payload.stats.total;
  els.totalMain.textContent = money(payload.stats.totalMainInflow);
  els.positiveSuper.textContent = `${payload.stats.positiveSuper}/${payload.stats.total}`;
  els.avgVolumeRatio.textContent = payload.stats.avgVolumeRatio.toFixed(2);
  els.timestamp.textContent = payload.warning ? `数据时间：${payload.timestamp} · ${payload.warning}` : `数据时间：${payload.timestamp}`;
  els.sourceBadge.textContent = payload.source;
  applySearchAndSort();
  renderFocus();
  renderTable();
}

function renderSectors(payload) {
  els.sectorCount.textContent = payload.stats.total;
  els.sectorHotCount.textContent = `${payload.stats.strong}/${payload.stats.warming}`;
  els.sectorFadeCount.textContent = payload.stats.fading;
  els.sectorTotalMain.textContent = money(payload.stats.totalMainInflow);
  els.sectorTimestamp.textContent = payload.warning ? `数据时间：${payload.timestamp} · ${payload.warning}` : `数据时间：${payload.timestamp}`;
  els.sectorSourceBadge.textContent = payload.source;
  applySectorSearchAndSort();
  renderSectorFocus();
  renderSectorTable();
  els.sectorState.textContent = state.filteredSectorRows.length ? "" : "当前筛选条件下没有板块数据";
  if (!state.selectedSectorCode && state.filteredSectorRows[0]) {
    loadSectorDetail(state.filteredSectorRows[0].code);
  }
}

function renderHotLeaders(payload) {
  els.hotCount.textContent = payload.stats.total;
  els.hotStrongCount.textContent = payload.stats.strong;
  els.hotPositiveFlow.textContent = payload.stats.positiveFlow;
  els.hotAvgScore.textContent = fixed(payload.stats.avgScore, 1);
  const hotNote = payload.stats.historyNote ? ` · ${payload.stats.historyNote}` : "";
  els.hotTimestamp.textContent = payload.warning ? `数据时间：${payload.timestamp} · ${payload.warning}${hotNote}` : `数据时间：${payload.timestamp}${hotNote}`;
  els.hotSourceBadge.textContent = payload.source;
  applyHotSearchAndSort();
  renderHotFocus();
  renderHotTable();
  els.hotState.textContent = state.filteredHotRows.length ? "" : "当前热度榜没有符合条件的龙头候选";
}

function applyHotSearchAndSort() {
  const keyword = els.hotSearchInput.value.trim().toLowerCase();
  state.filteredHotRows = state.hotRows.filter((row) => {
    return row.name.toLowerCase().includes(keyword) || codeOf(row).toLowerCase().includes(keyword) || row.sectorName.toLowerCase().includes(keyword);
  });
  state.filteredHotRows.sort((a, b) => {
    const av = a[state.hotSortKey];
    const bv = b[state.hotSortKey];
    const result = typeof av === "number" && typeof bv === "number"
      ? av - bv
      : String(av).localeCompare(String(bv), "zh-CN");
    return state.hotSortDir === "asc" ? result : -result;
  });
}

function renderHotFocus() {
  const rows = state.filteredHotRows.slice(0, 3);
  els.hotFocusList.innerHTML = rows.map((row) => `
    <article class="focus-item hot-card" data-code="${row.code}" role="button" tabindex="0" title="查看${row.name}承接条件和风险线">
      <div class="focus-title">
        <div>
          <div class="stock-code">${codeOf(row)} · 热度第${row.heatRank}</div>
          <div class="stock-name">${row.name}</div>
        </div>
        <span class="score">${fixed(row.totalScore, 1)}</span>
      </div>
      <div class="focus-grid">
        <div class="mini"><span>板块</span><strong>${row.sectorName}</strong></div>
        <div class="mini"><span>涨幅</span><strong class="${row.changePct >= 0 ? "up" : "down"}">${pct(row.changePct)}</strong></div>
        <div class="mini"><span>等级</span><strong>${row.grade}</strong></div>
      </div>
      <div class="concept-line">${row.conceptNote || "题材待确认"}</div>
      <div class="bars">
        ${bar("热度", row.heatScore, Math.min(row.heatScore / 35, 1) * 100)}
        ${bar("承接", row.flowScore, Math.min(row.flowScore / 30, 1) * 100)}
        ${bar("风收", row.riskRewardScore, Math.min(row.riskRewardScore / 15, 1) * 100)}
      </div>
    </article>
  `).join("");
}

function renderHotTable() {
  els.hotRowsBody.innerHTML = state.filteredHotRows.map((row) => `
    <tr class="hot-row ${row.code === state.selectedHotCode ? "is-selected" : ""}" data-code="${row.code}" role="button" tabindex="0" title="查看${row.name}承接条件和风险线">
      <td>${row.rank}</td>
      <td>${codeOf(row)}</td>
      <td><strong>${row.name}</strong></td>
      <td>${row.sectorName}</td>
      <td>${row.heatRank}</td>
      <td><span class="rank-change ${rankChangeClass(row.rankChange)}">${rankChangeText(row.rankChange)}${row.rankChangeEstimated ? "估" : ""}</span></td>
      <td class="${row.changePct >= 0 ? "up" : "down"}">${pct(row.changePct)}</td>
      <td>${money(row.amount)}</td>
      <td>${fixed(row.volumeRatio, 2)}</td>
      <td>${pct(row.amplitude)}</td>
      <td>${pct(row.turnover)}</td>
      <td class="${row.mainInflow >= 0 ? "up" : "down"}">${money(row.mainInflow)}</td>
      <td class="${row.superInflow >= 0 ? "up" : "down"}">${money(row.superInflow)}</td>
      <td>${row.leaderType}</td>
      <td>${row.conceptNote || "待确认"}</td>
      <td><strong>${fixed(row.totalScore, 2)}</strong></td>
      <td><span class="tag ${statusClass(row.grade)}">${row.grade}</span></td>
      <td>${row.carryReason}</td>
      <td>${row.riskReward}</td>
      <td>${row.riskLine}</td>
      <td>${row.invalidCondition}</td>
    </tr>
  `).join("");
}

function applySectorSearchAndSort() {
  const keyword = els.sectorSearchInput.value.trim().toLowerCase();
  state.filteredSectorRows = state.sectorRows.filter((row) => row.name.toLowerCase().includes(keyword));
  state.filteredSectorRows.sort((a, b) => {
    const av = sectorSortValue(a, state.sectorSortKey);
    const bv = sectorSortValue(b, state.sectorSortKey);
    const result = typeof av === "number" && typeof bv === "number"
      ? av - bv
      : String(av).localeCompare(String(bv), "zh-CN");
    return state.sectorSortDir === "asc" ? result : -result;
  });
}

function sectorSortValue(row, key) {
  const flow = row.oneDayFlow || {};
  const map = {
    oneDayMain: flow.mainInflow,
    oneDaySuper: flow.superInflow,
    oneDayAmount: flow.amount,
    oneDayAmountChange: flow.amountChangePct,
    oneDayFundRankChange: flow.fundRankChange
  };
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : row[key];
}

function renderSectorFocus() {
  const rows = state.filteredSectorRows.slice(0, 3);
  els.sectorFocusList.innerHTML = rows.map((row) => `
    <article class="focus-item sector-card" data-code="${row.code}">
      <div class="focus-title">
        <div>
          <div class="stock-code">${row.code} · ${row.leaderName || "无领涨股"}</div>
          <div class="stock-name">${row.name}</div>
        </div>
        <span class="score">${row.rotationScore.toFixed(1)}</span>
      </div>
      <div class="focus-grid">
        <div class="mini"><span>涨幅</span><strong class="${row.changePct >= 0 ? "up" : "down"}">${pct(row.changePct)}</strong></div>
        <div class="mini"><span>成交额</span><strong>${money(row.amount)}</strong></div>
        <div class="mini"><span>上涨占比</span><strong>${pct(row.upRatio * 100)}</strong></div>
      </div>
      <div class="bars">
        ${bar("主力", row.mainInflow, Math.min(Math.abs(row.mainInflow) / 5_000_000_000, 1) * 100)}
        ${bar("超大单", row.superInflow, Math.min(Math.abs(row.superInflow) / 3_000_000_000, 1) * 100)}
        ${bar("近一日主力估", row.oneDayFlow.mainInflow, Math.min(Math.abs(row.oneDayFlow.mainInflow) / 5_000_000_000, 1) * 100)}
      </div>
    </article>
  `).join("");
}

function renderSectorTable() {
  els.sectorRowsBody.innerHTML = state.filteredSectorRows.map((row) => `
    <tr class="sector-row ${row.code === state.selectedSectorCode ? "is-selected" : ""}" data-code="${row.code}">
      <td>${row.rank}</td>
      <td><strong>${row.name}</strong></td>
      <td class="${row.changePct >= 0 ? "up" : "down"}">${pct(row.changePct)}</td>
      <td>${money(row.amount)}</td>
      <td class="${row.amountChangePct >= 0 ? "up" : "down"}">${pct(row.amountChangePct)}</td>
      <td class="${row.mainInflow >= 0 ? "up" : "down"}">${money(row.mainInflow)}</td>
      <td class="${row.superInflow >= 0 ? "up" : "down"}">${money(row.superInflow)}</td>
      <td class="${row.oneDayFlow.mainInflow >= 0 ? "up" : "down"}">${money(row.oneDayFlow.mainInflow)}</td>
      <td class="${row.oneDayFlow.superInflow >= 0 ? "up" : "down"}">${money(row.oneDayFlow.superInflow)}</td>
      <td>${money(row.oneDayFlow.amount)}</td>
      <td class="${row.oneDayFlow.amountChangePct >= 0 ? "up" : "down"}">${pct(row.oneDayFlow.amountChangePct)}</td>
      <td><span class="rank-change ${rankChangeClass(row.oneDayFlow.fundRankChange)}">${rankChangeText(row.oneDayFlow.fundRankChange)}</span></td>
      <td>${pct(row.upRatio * 100)}</td>
      <td>${row.volumeRatio.toFixed(2)}</td>
      <td><strong>${row.rotationScore.toFixed(2)}</strong></td>
      <td><span class="rank-change ${rankChangeClass(row.rankChange)}">${rankChangeText(row.rankChange)}</span></td>
      <td><span class="tag ${statusClass(row.status)}">${row.status}</span></td>
    </tr>
  `).join("");
}

function applySearchAndSort() {
  const keyword = els.searchInput.value.trim().toLowerCase();
  state.filteredRows = state.rows.filter((row) => {
    return row.name.toLowerCase().includes(keyword) || codeOf(row).toLowerCase().includes(keyword);
  });
  state.filteredRows.sort((a, b) => {
    const av = a[state.sortKey];
    const bv = b[state.sortKey];
    const result = typeof av === "number" && typeof bv === "number"
      ? av - bv
      : String(av).localeCompare(String(bv), "zh-CN");
    return state.sortDir === "asc" ? result : -result;
  });
}

function renderFocus() {
  const rows = state.filteredRows.slice(0, 3);
  els.focusList.innerHTML = rows.map((row) => {
    const mainWidth = Math.min(Math.abs(row.mainInflow) / 800_000_000, 1) * 100;
    const superWidth = Math.min(Math.abs(row.superInflow) / 500_000_000, 1) * 100;
    const largeWidth = Math.min(Math.abs(row.largeInflow) / 500_000_000, 1) * 100;
    return `
      <article class="focus-item">
        <div class="focus-title">
          <div>
            <div class="stock-code">${codeOf(row)}</div>
            <div class="stock-name">${row.name}</div>
          </div>
          <span class="score">${row.score}</span>
        </div>
        <div class="focus-grid">
          <div class="mini"><span>涨幅</span><strong class="${row.changePct >= 0 ? "up" : "down"}">${pct(row.changePct)}</strong></div>
          <div class="mini"><span>成交额</span><strong>${money(row.amount)}</strong></div>
          <div class="mini"><span>量比</span><strong>${row.volumeRatio.toFixed(2)}</strong></div>
        </div>
        <div class="bars">
          ${bar("主力", row.mainInflow, mainWidth)}
          ${bar("超大单", row.superInflow, superWidth)}
          ${bar("大单", row.largeInflow, largeWidth)}
        </div>
      </article>
    `;
  }).join("");
}

function bar(label, value, width) {
  return `
    <div class="bar">
      <span>${label}</span>
      <div class="bar-track"><div class="bar-fill ${value < 0 ? "red" : ""}" style="width: ${width}%"></div></div>
      <strong>${money(value)}</strong>
    </div>
  `;
}

function renderTable() {
  els.rowsBody.innerHTML = state.filteredRows.map((row) => `
    <tr>
      <td><strong>${row.score.toFixed(2)}</strong></td>
      <td>${codeOf(row)}</td>
      <td><strong>${row.name}</strong></td>
      <td class="${row.changePct >= 0 ? "up" : "down"}">${pct(row.changePct)}</td>
      <td>${money(row.amount)}</td>
      <td>${row.volumeRatio.toFixed(2)}</td>
      <td>${pct(row.amplitude)}</td>
      <td>${pct(row.turnover)}</td>
      <td class="${row.mainInflow >= 0 ? "up" : "down"}">${money(row.mainInflow)}</td>
      <td class="${row.superInflow >= 0 ? "up" : "down"}">${money(row.superInflow)} (${pct(row.superPct)})</td>
      <td class="${row.largeInflow >= 0 ? "up" : "down"}">${money(row.largeInflow)} (${pct(row.largePct)})</td>
      <td><span class="tag ${tagClass(row.tag)}">${row.tag}</span> ${row.reason}</td>
      <td>${row.risk}</td>
    </tr>
  `).join("");
}

async function loadSectorDetail(code) {
  state.selectedSectorCode = code;
  renderSectorTable();
  els.sectorDetailTitle.textContent = "板块详情加载中";
  els.sectorDetailMeta.textContent = "正在读取板块成分股";
  els.sectorDetailBadge.textContent = code;
  els.sectorDetailRows.innerHTML = "";
  els.sectorDetailCards.innerHTML = "";
  const newsList = document.querySelector("#sectorNewsList");
  if (newsList) newsList.innerHTML = `<article class="news-item"><div class="news-title">利好消息加载中</div><div class="news-meta">同花顺财经资讯搜索</div><p>正在匹配板块名称、核心个股和题材关键词。</p></article>`;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 18_000);
  try {
    const response = await fetch(`${API_BASE}/api/sector-detail?code=${encodeURIComponent(code)}&period=${state.sectorPeriod}`, {
      cache: "no-store",
      signal: controller.signal
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "请求失败");
    renderSectorDetail(payload.board, payload.rows, payload.news);
  } catch (error) {
    els.sectorDetailTitle.textContent = "板块详情";
    els.sectorDetailMeta.textContent = error.name === "AbortError" ? "板块详情请求超时" : error.message;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function renderSectorDetail(board, rows, news) {
  els.sectorDetailTitle.textContent = `${board.name} · 板块详情`;
  els.sectorDetailMeta.textContent = `${board.reason}。${board.risk}`;
  els.sectorDetailBadge.textContent = board.status;
  const trendBars = board.trend.slice(-10).map((point) => {
    const height = Math.max(8, Math.min(42, Math.abs(point.changePct) * 6 + 8));
    return `<div class="trend-bar ${point.changePct < 0 ? "negative" : ""}" title="${point.date} ${pct(point.changePct)}" style="height:${height}px"></div>`;
  }).join("");
  els.sectorDetailCards.innerHTML = `
    <div class="detail-card">
      <span>强势原因</span>
      <strong>${board.reason}</strong>
    </div>
    <div class="detail-card">
      <span>风险线</span>
      <strong>${board.risk}</strong>
    </div>
    <div class="detail-card">
      <span>${board.period}日趋势</span>
      <strong>${pct(board.periodReturn)} · 成交变化 ${pct(board.amountChangePct)}</strong>
      <div class="trend-strip">${trendBars}</div>
    </div>
    <div class="detail-card">
      <span>近一日资金追踪估算</span>
      <strong>主力 ${money(board.oneDayFlow.mainInflow)} · 超大单 ${money(board.oneDayFlow.superInflow)} · 排名 ${rankChangeText(board.oneDayFlow.fundRankChange)}</strong>
    </div>
    <div class="detail-card">
      <span>近一日成交额估算</span>
      <strong>${money(board.oneDayFlow.amount)} · 成交变化 ${pct(board.oneDayFlow.amountChangePct)}</strong>
    </div>
  `;
  renderSectorNews(news);
  els.sectorDetailRows.innerHTML = rows.map((row) => `
    <tr>
      <td><strong>${row.score.toFixed(2)}</strong></td>
      <td>${codeOf(row)}</td>
      <td><strong>${row.name}</strong></td>
      <td class="${row.changePct >= 0 ? "up" : "down"}">${pct(row.changePct)}</td>
      <td>${money(row.amount)}</td>
      <td>${row.volumeRatio.toFixed(2)}</td>
      <td>${pct(row.amplitude)}</td>
      <td>${pct(row.turnover)}</td>
      <td class="${row.mainInflow >= 0 ? "up" : "down"}">${money(row.mainInflow)}</td>
      <td class="${row.superInflow >= 0 ? "up" : "down"}">${money(row.superInflow)} (${pct(row.superPct)})</td>
      <td class="${row.largeInflow >= 0 ? "up" : "down"}">${money(row.largeInflow)} (${pct(row.largePct)})</td>
      <td><span class="tag ${tagClass(row.tag)}">${row.tag}</span> ${row.reason}</td>
      <td>${row.risk}</td>
    </tr>
  `).join("");
}

function renderSectorNews(news) {
  const list = document.querySelector("#sectorNewsList");
  if (!list) return;
  const items = news?.items?.length ? news.items : [{
    title: "暂无明确利好，等待确认",
    source: "系统提示",
    publishTime: "待确认",
    summary: "当前未匹配到可用的板块利好资讯。",
    url: ""
  }];
  list.innerHTML = items.map((item) => `
    <article class="news-item">
      <div class="news-title">${item.url ? `<a href="${item.url}" target="_blank" rel="noreferrer">${item.title}</a>` : item.title}</div>
      <div class="news-meta">${item.source || "待确认"} · ${item.publishTime || "待确认"}</div>
      <p>${item.summary || "暂无摘要"}</p>
    </article>
  `).join("");
}

async function loadHotDetail(code) {
  state.selectedHotCode = code;
  renderHotTable();
  openHotDetailModal();
  els.hotDetailTitle.textContent = "热度龙头详情加载中";
  els.hotDetailMeta.textContent = "正在读取热度榜和承接条件";
  els.hotDetailBadge.textContent = code;
  els.hotDetailCards.innerHTML = "";
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(`${API_BASE}/api/hot-leader-detail?code=${encodeURIComponent(code)}&period=${state.hotPeriod}`, {
      cache: "no-store",
      signal: controller.signal
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "请求失败");
    renderHotDetail(payload.row, payload.detail);
  } catch (error) {
    els.hotDetailTitle.textContent = "热度龙头详情";
    els.hotDetailMeta.textContent = error.name === "AbortError" ? "热度详情请求超时" : error.message;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function openHotDetailModal() {
  els.hotDetailModal.hidden = false;
  document.body.classList.add("modal-open");
  els.hotDetailClose.focus();
}

function closeHotDetailModal() {
  els.hotDetailModal.hidden = true;
  document.body.classList.remove("modal-open");
}

function renderHotDetail(row, detail) {
  els.hotDetailTitle.textContent = `${row.name} · ${row.leaderType}`;
  els.hotDetailMeta.textContent = `${row.carryReason}。${row.riskReward}`;
  els.hotDetailBadge.textContent = row.grade;
  els.hotDetailCards.innerHTML = `
    <div class="detail-card">
      <span>热度榜表现</span>
      <strong>${detail.heat}</strong>
    </div>
    <div class="detail-card">
      <span>暗盘资金承接</span>
      <strong>${detail.flow}</strong>
    </div>
    <div class="detail-card">
      <span>所属板块强度</span>
      <strong>${detail.sector}</strong>
    </div>
    <div class="detail-card">
      <span>龙头定位</span>
      <strong>${detail.leader}</strong>
    </div>
    <div class="detail-card">
      <span>炒作概念</span>
      <strong>${detail.concepts}</strong>
    </div>
    <div class="detail-card">
      <span>周期评分</span>
      <strong>${detail.period}</strong>
    </div>
    <div class="detail-card">
      <span>买点条件</span>
      <strong>${detail.entryCondition}</strong>
    </div>
    <div class="detail-card">
      <span>风险线</span>
      <strong>${detail.riskLine}</strong>
    </div>
    <div class="detail-card wide-card">
      <span>失效条件</span>
      <strong>${detail.invalidCondition}</strong>
    </div>
  `;
}

function tagClass(tag) {
  if (tag === "强承接") return "strong";
  if (tag === "进攻") return "attack";
  if (tag === "分歧") return "diverge";
  return "";
}

function exportCsv() {
  if (state.view === "hot") {
    exportHotCsv();
    return;
  }
  const header = ["代码", "名称", "分数", "价格", "涨幅", "成交额", "量比", "振幅", "换手", "主力净额", "超大单净额", "超大单占比", "大单净额", "大单占比", "信号", "风险线"];
  const rows = state.filteredRows.map((row) => [
    codeOf(row),
    row.name,
    row.score,
    row.price,
    row.changePct,
    row.amount,
    row.volumeRatio,
    row.amplitude,
    row.turnover,
    row.mainInflow,
    row.superInflow,
    row.superPct,
    row.largeInflow,
    row.largePct,
    row.tag,
    row.risk
  ]);
  const csv = [header, ...rows]
    .map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `a-share-dark-fund-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function exportHotCsv() {
  const header = ["综合排名", "代码", "名称", "所属板块", "热度排名", "热度变化", "涨幅", "成交额", "量比", "振幅", "换手", "主力净额", "超大单净额", "龙头类型", "炒作概念", "综合评分", "推荐等级", "短线承接理由", "风险收益判断", "风险线", "失效条件"];
  const rows = state.filteredHotRows.slice(0, 50).map((row) => [
    row.rank,
    codeOf(row),
    row.name,
    row.sectorName,
    row.heatRank,
    row.rankChange === null ? "待确认" : row.rankChange,
    row.changePct,
    row.amount,
    row.volumeRatio,
    row.amplitude,
    row.turnover,
    row.mainInflow,
    row.superInflow,
    row.leaderType,
    row.conceptNote,
    row.totalScore,
    row.grade,
    row.carryReason,
    row.riskReward,
    row.riskLine,
    row.invalidCondition
  ]);
  const csv = [header, ...rows]
    .map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `a-share-hot-leaders-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function applyMode(mode) {
  const values = modes[mode];
  Object.entries(values).forEach(([key, value]) => {
    els[key].value = value;
  });
  document.querySelectorAll(".mode").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.mode === mode);
  });
  refresh();
}

function setView(view) {
  state.view = view;
  els.trackerView.hidden = view !== "tracker";
  els.sectorView.hidden = view !== "sectors";
  els.hotView.hidden = view !== "hot";
  document.querySelectorAll(".view-tab").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === view);
  });
  if (view === "sectors" && !state.sectorRows.length) refreshSectors();
  if (view === "hot" && !state.hotRows.length) refreshHotLeaders();
}

function setPeriod(period) {
  state.sectorPeriod = Number(period);
  state.selectedSectorCode = "";
  document.querySelectorAll(".period").forEach((button) => {
    button.classList.toggle("is-active", Number(button.dataset.period) === state.sectorPeriod);
  });
  refreshSectors();
}

function setHotPeriod(period) {
  state.hotPeriod = Number(period);
  state.selectedHotCode = "";
  document.querySelectorAll(".hot-period").forEach((button) => {
    button.classList.toggle("is-active", Number(button.dataset.hotPeriod) === state.hotPeriod);
  });
  refreshHotLeaders();
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => els.toast.classList.remove("show"), 1800);
}

document.querySelectorAll("th[data-sort]").forEach((th) => {
  th.addEventListener("click", () => {
    const key = th.dataset.sort;
    if (state.sortKey === key) {
      state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
    } else {
      state.sortKey = key;
      state.sortDir = "desc";
    }
    applySearchAndSort();
    renderFocus();
    renderTable();
  });
});

document.querySelectorAll(".mode").forEach((button) => {
  button.addEventListener("click", () => applyMode(button.dataset.mode));
});

document.querySelectorAll(".view-tab").forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.view));
});

document.querySelectorAll(".period").forEach((button) => {
  button.addEventListener("click", () => setPeriod(button.dataset.period));
});

document.querySelectorAll(".hot-period").forEach((button) => {
  button.addEventListener("click", () => setHotPeriod(button.dataset.hotPeriod));
});

document.querySelectorAll("th[data-sector-sort]").forEach((th) => {
  th.addEventListener("click", () => {
    const key = th.dataset.sectorSort;
    if (state.sectorSortKey === key) {
      state.sectorSortDir = state.sectorSortDir === "asc" ? "desc" : "asc";
    } else {
      state.sectorSortKey = key;
      state.sectorSortDir = "desc";
    }
    applySectorSearchAndSort();
    renderSectorFocus();
    renderSectorTable();
  });
});

document.querySelectorAll("th[data-hot-sort]").forEach((th) => {
  th.addEventListener("click", () => {
    const key = th.dataset.hotSort;
    if (state.hotSortKey === key) {
      state.hotSortDir = state.hotSortDir === "asc" ? "desc" : "asc";
    } else {
      state.hotSortKey = key;
      state.hotSortDir = "desc";
    }
    applyHotSearchAndSort();
    renderHotFocus();
    renderHotTable();
  });
});

[els.minAmount, els.minVolumeRatio, els.maxChange, els.maxAmplitude].forEach((input) => {
  input.addEventListener("input", updateOutputs);
  input.addEventListener("change", refresh);
});

els.searchInput.addEventListener("input", () => {
  applySearchAndSort();
  renderFocus();
  renderTable();
});

els.sectorSearchInput.addEventListener("input", () => {
  applySectorSearchAndSort();
  renderSectorFocus();
  renderSectorTable();
  els.sectorState.textContent = state.filteredSectorRows.length ? "" : "没有匹配的板块";
});

els.hotSearchInput.addEventListener("input", () => {
  applyHotSearchAndSort();
  renderHotFocus();
  renderHotTable();
  els.hotState.textContent = state.filteredHotRows.length ? "" : "没有匹配的热度龙头";
});

els.sectorFocusList.addEventListener("click", (event) => {
  const card = event.target.closest(".sector-card");
  if (card) loadSectorDetail(card.dataset.code);
});

els.hotFocusList.addEventListener("click", (event) => {
  const card = event.target.closest(".hot-card");
  if (card) loadHotDetail(card.dataset.code);
});

els.hotFocusList.addEventListener("keydown", (event) => {
  const card = event.target.closest(".hot-card");
  if (!card || (event.key !== "Enter" && event.key !== " ")) return;
  event.preventDefault();
  loadHotDetail(card.dataset.code);
});

els.sectorRowsBody.addEventListener("click", (event) => {
  const row = event.target.closest(".sector-row");
  if (row) loadSectorDetail(row.dataset.code);
});

els.hotRowsBody.addEventListener("click", (event) => {
  const row = event.target.closest(".hot-row");
  if (row) loadHotDetail(row.dataset.code);
});

els.hotRowsBody.addEventListener("keydown", (event) => {
  const row = event.target.closest(".hot-row");
  if (!row || (event.key !== "Enter" && event.key !== " ")) return;
  event.preventDefault();
  loadHotDetail(row.dataset.code);
});

els.hotDetailClose.addEventListener("click", closeHotDetailModal);

els.hotDetailModal.addEventListener("click", (event) => {
  if (event.target === els.hotDetailModal) closeHotDetailModal();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !els.hotDetailModal.hidden) closeHotDetailModal();
});

els.refreshBtn.addEventListener("click", refresh);
els.exportBtn.addEventListener("click", exportCsv);

updateOutputs();
refresh();
