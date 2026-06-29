const state = {
  rows: [],
  filteredRows: [],
  sortKey: "score",
  sortDir: "desc",
  lastPayload: null,
  view: "tracker",
  watchRows: [],
  filteredWatchRows: [],
  watchSortKey: "watchScore",
  watchSortDir: "desc",
  watchPeriod: 1,
  watchFilter: "all",
  selectedWatchCode: "",
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
  selectedHotCode: "",
  breakoutRows: [],
  filteredBreakoutRows: [],
  breakoutSortKey: "breakoutScore",
  breakoutSortDir: "desc",
  breakoutAlert: {
    enabled: false,
    sound: true,
    popup: true,
    minScore: 78,
    stage: "刚起爆"
  },
  breakoutAlertSeen: new Set(),
  detailCharts: {
    watch: [],
    hot: []
  }
};

const API_BASE = window.location.protocol === "file:" ? "http://localhost:4173" : "";
const BREAKOUT_ALERT_STORAGE_KEY = "grayMarket.breakoutAlertSettings";
const LIGHTWEIGHT_CHARTS_SRC = `${API_BASE}/vendor/lightweight-charts.standalone.production.js`;
const BREAKOUT_STAGE_RANK = {
  "观察": 1,
  "升温": 2,
  "刚起爆": 3,
  "试盘": 0
};
let breakoutAudioContext = null;

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
  watchView: document.querySelector("#watchView"),
  watchTimestamp: document.querySelector("#watchTimestamp"),
  watchSourceBadge: document.querySelector("#watchSourceBadge"),
  watchCount: document.querySelector("#watchCount"),
  watchConfluenceCount: document.querySelector("#watchConfluenceCount"),
  watchBreakoutCount: document.querySelector("#watchBreakoutCount"),
  watchStrongCount: document.querySelector("#watchStrongCount"),
  watchPositiveFlow: document.querySelector("#watchPositiveFlow"),
  watchAvgScore: document.querySelector("#watchAvgScore"),
  watchFocusList: document.querySelector("#watchFocusList"),
  watchRowsBody: document.querySelector("#watchRowsBody"),
  watchSearchInput: document.querySelector("#watchSearchInput"),
  watchState: document.querySelector("#watchState"),
  watchDetailModal: document.querySelector("#watchDetailModal"),
  watchDetailClose: document.querySelector("#watchDetailClose"),
  watchDetailTitle: document.querySelector("#watchDetailTitle"),
  watchDetailMeta: document.querySelector("#watchDetailMeta"),
  watchDetailBadge: document.querySelector("#watchDetailBadge"),
  watchDetailCards: document.querySelector("#watchDetailCards"),
  watchChartPanel: document.querySelector("#watchChartPanel"),
  watchChartState: document.querySelector("#watchChartState"),
  watchIntradayChart: document.querySelector("#watchIntradayChart"),
  watchDailyChart: document.querySelector("#watchDailyChart"),
  sectorView: document.querySelector("#sectorView"),
  hotView: document.querySelector("#hotView"),
  breakoutView: document.querySelector("#breakoutView"),
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
  hotChartPanel: document.querySelector("#hotChartPanel"),
  hotChartState: document.querySelector("#hotChartState"),
  hotIntradayChart: document.querySelector("#hotIntradayChart"),
  hotDailyChart: document.querySelector("#hotDailyChart"),
  breakoutTimestamp: document.querySelector("#breakoutTimestamp"),
  breakoutSourceBadge: document.querySelector("#breakoutSourceBadge"),
  breakoutCount: document.querySelector("#breakoutCount"),
  breakoutStrongCount: document.querySelector("#breakoutStrongCount"),
  breakoutPositiveFlow: document.querySelector("#breakoutPositiveFlow"),
  breakoutAvgScore: document.querySelector("#breakoutAvgScore"),
  breakoutFocusList: document.querySelector("#breakoutFocusList"),
  breakoutRowsBody: document.querySelector("#breakoutRowsBody"),
  breakoutSearchInput: document.querySelector("#breakoutSearchInput"),
  breakoutState: document.querySelector("#breakoutState"),
  breakoutAlertEnabled: document.querySelector("#breakoutAlertEnabled"),
  breakoutAlertSound: document.querySelector("#breakoutAlertSound"),
  breakoutAlertPopup: document.querySelector("#breakoutAlertPopup"),
  breakoutAlertMinScore: document.querySelector("#breakoutAlertMinScore"),
  breakoutAlertMinScoreOut: document.querySelector("#breakoutAlertMinScoreOut"),
  breakoutAlertStage: document.querySelector("#breakoutAlertStage"),
  breakoutAlertTest: document.querySelector("#breakoutAlertTest"),
  breakoutAlertModal: document.querySelector("#breakoutAlertModal"),
  breakoutAlertClose: document.querySelector("#breakoutAlertClose"),
  breakoutAlertTitle: document.querySelector("#breakoutAlertTitle"),
  breakoutAlertMeta: document.querySelector("#breakoutAlertMeta"),
  breakoutAlertBadge: document.querySelector("#breakoutAlertBadge"),
  breakoutAlertList: document.querySelector("#breakoutAlertList"),
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

function loadBreakoutAlertSettings() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(BREAKOUT_ALERT_STORAGE_KEY) || "{}");
    state.breakoutAlert = {
      enabled: Boolean(saved.enabled),
      sound: saved.sound !== false,
      popup: saved.popup !== false,
      minScore: Number.isFinite(Number(saved.minScore)) ? Number(saved.minScore) : 78,
      stage: ["刚起爆", "升温", "观察"].includes(saved.stage) ? saved.stage : "刚起爆"
    };
  } catch {
    state.breakoutAlert = { enabled: false, sound: true, popup: true, minScore: 78, stage: "刚起爆" };
  }
}

function saveBreakoutAlertSettings() {
  window.localStorage.setItem(BREAKOUT_ALERT_STORAGE_KEY, JSON.stringify(state.breakoutAlert));
}

function syncBreakoutAlertControls() {
  els.breakoutAlertEnabled.checked = state.breakoutAlert.enabled;
  els.breakoutAlertSound.checked = state.breakoutAlert.sound;
  els.breakoutAlertPopup.checked = state.breakoutAlert.popup;
  els.breakoutAlertMinScore.value = state.breakoutAlert.minScore;
  els.breakoutAlertMinScoreOut.textContent = String(state.breakoutAlert.minScore);
  els.breakoutAlertStage.value = state.breakoutAlert.stage;
}

function readBreakoutAlertControls() {
  state.breakoutAlert = {
    enabled: els.breakoutAlertEnabled.checked,
    sound: els.breakoutAlertSound.checked,
    popup: els.breakoutAlertPopup.checked,
    minScore: Number(els.breakoutAlertMinScore.value),
    stage: els.breakoutAlertStage.value
  };
  syncBreakoutAlertControls();
  saveBreakoutAlertSettings();
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
  if (state.view === "watch") {
    await refreshWatchlist();
    return;
  }
  if (state.view === "sectors") {
    await refreshSectors();
    return;
  }
  if (state.view === "hot") {
    await refreshHotLeaders();
    return;
  }
  if (state.view === "breakout") {
    await refreshBreakouts();
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

async function refreshWatchlist() {
  els.refreshBtn.disabled = true;
  els.refreshBtn.textContent = "刷新中";
  els.watchState.textContent = "盯盘总榜数据加载中";
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch(`${API_BASE}/api/watchlist?period=${state.watchPeriod}&limit=80`, {
      cache: "no-store",
      signal: controller.signal
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "请求失败");
    state.watchRows = payload.rows;
    renderWatchlist(payload);
    showToast(payload.warning || "盯盘总榜已更新");
  } catch (error) {
    els.watchState.textContent = error.name === "AbortError" ? "盯盘总榜请求超时" : error.message;
    showToast(els.watchState.textContent);
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

async function refreshBreakouts() {
  els.refreshBtn.disabled = true;
  els.refreshBtn.textContent = "刷新中";
  els.breakoutState.textContent = "起爆预警数据加载中";
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch(`${API_BASE}/api/breakout-alerts?limit=50`, {
      cache: "no-store",
      signal: controller.signal
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "请求失败");
    state.breakoutRows = payload.rows;
    renderBreakouts(payload);
    showToast(payload.warning || "起爆预警已更新");
  } catch (error) {
    els.breakoutState.textContent = error.name === "AbortError" ? "起爆预警请求超时" : error.message;
    showToast(els.breakoutState.textContent);
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

function renderWatchlist(payload) {
  els.watchCount.textContent = payload.stats.total;
  els.watchConfluenceCount.textContent = payload.stats.confluence;
  els.watchBreakoutCount.textContent = payload.stats.freshBreakout;
  els.watchStrongCount.textContent = payload.stats.strong;
  els.watchPositiveFlow.textContent = payload.stats.positiveFlow;
  els.watchAvgScore.textContent = fixed(payload.stats.avgScore, 1);
  els.watchTimestamp.textContent = payload.warning ? `数据时间：${payload.timestamp} · ${payload.warning}` : `数据时间：${payload.timestamp}`;
  els.watchSourceBadge.textContent = payload.source;
  applyWatchSearchAndSort();
  renderWatchFocus();
  renderWatchTable();
  els.watchState.textContent = state.filteredWatchRows.length ? "" : "当前筛选条件下没有盯盘候选";
  handleBreakoutAlerts(payload.rows);
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

function renderBreakouts(payload) {
  els.breakoutCount.textContent = payload.stats.total;
  els.breakoutStrongCount.textContent = payload.stats.strong;
  els.breakoutPositiveFlow.textContent = payload.stats.positiveFlow;
  els.breakoutAvgScore.textContent = fixed(payload.stats.avgScore, 1);
  els.breakoutTimestamp.textContent = payload.warning ? `数据时间：${payload.timestamp} · ${payload.warning}` : `数据时间：${payload.timestamp}`;
  els.breakoutSourceBadge.textContent = payload.source;
  applyBreakoutSearchAndSort();
  renderBreakoutFocus();
  renderBreakoutTable();
  els.breakoutState.textContent = state.filteredBreakoutRows.length ? "" : "当前没有符合条件的起爆预警";
  handleBreakoutAlerts(payload.rows);
}

function applyWatchSearchAndSort() {
  const keyword = els.watchSearchInput.value.trim().toLowerCase();
  state.filteredWatchRows = state.watchRows.filter((row) => {
    const haystack = [
      row.name,
      codeOf(row),
      row.sectorName,
      row.sourceType,
      row.breakoutStage,
      ...(row.tags || [])
    ].join(" ").toLowerCase();
    return haystack.includes(keyword) && watchFilterMatch(row);
  });
  state.filteredWatchRows.sort((a, b) => {
    const av = watchSortValue(a, state.watchSortKey);
    const bv = watchSortValue(b, state.watchSortKey);
    const result = typeof av === "number" && typeof bv === "number"
      ? av - bv
      : String(av ?? "").localeCompare(String(bv ?? ""), "zh-CN");
    return state.watchSortDir === "asc" ? result : -result;
  });
}

function watchSortValue(row, key) {
  if (key === "code") return codeOf(row);
  if (key === "sourceType") return (row.tags || []).join("/");
  return row[key];
}

function watchFilterMatch(row) {
  if (state.watchFilter === "confluence") return row.isConfluence;
  if (state.watchFilter === "freshBreakout") return row.breakoutStage === "刚起爆";
  if (state.watchFilter === "strong") return row.grade === "强关注";
  if (state.watchFilter === "positive") return row.isPositiveFlow;
  if (state.watchFilter === "hotOnly") return row.hasHot && !row.hasBreakout;
  if (state.watchFilter === "breakoutOnly") return row.hasBreakout && !row.hasHot;
  if (state.watchFilter === "new") return row.isNewSignal;
  return true;
}

function tagStyle(tag) {
  if (tag === "双榜共振" || tag === "刚起爆") return "hot";
  if (tag === "强关注" || tag === "资金双正") return "strong";
  if (tag === "起爆预警") return "warm";
  if (tag === "热度龙头") return "split";
  return "";
}

function renderWatchTags(row) {
  return (row.tags || []).map((tag) => `<span class="tag ${tagStyle(tag)}">${tag}</span>`).join("");
}

function renderWatchFocus() {
  const rows = state.filteredWatchRows.slice(0, 4);
  els.watchFocusList.innerHTML = rows.map((row) => `
    <article class="focus-item watch-card" data-code="${row.code}" role="button" tabindex="0" title="查看${row.name}盯盘详情">
      <div class="focus-title">
        <div>
          <div class="stock-code">${codeOf(row)} · ${row.sectorName}</div>
          <div class="stock-name">${row.name}</div>
        </div>
        <span class="score">${fixed(row.watchScore, 1)}</span>
      </div>
      <div class="watch-tags">${renderWatchTags(row)}</div>
      <div class="focus-grid">
        <div class="mini"><span>阶段</span><strong>${row.breakoutStage || "待确认"}</strong></div>
        <div class="mini"><span>热度</span><strong>${Number.isFinite(row.heatRank) ? `第${row.heatRank}` : "待确认"}</strong></div>
        <div class="mini"><span>涨幅</span><strong class="${row.changePct >= 0 ? "up" : "down"}">${pct(row.changePct)}</strong></div>
      </div>
      <div class="concept-line">${row.watchNote}</div>
      <div class="bars">
        ${bar("起爆", row.breakoutScore || 0, Math.min((row.breakoutScore || 0) / 100, 1) * 100)}
        ${bar("承接", row.carryScore || 0, Math.min((row.carryScore || 0) / 100, 1) * 100)}
        ${bar("DDE", row.ddeNetAmount || 0, Math.min(Math.abs(row.ddeNetAmount || 0) / 800_000_000, 1) * 100)}
      </div>
    </article>
  `).join("");
}

function renderWatchTable() {
  els.watchRowsBody.innerHTML = state.filteredWatchRows.map((row) => `
    <tr class="watch-row ${row.code === state.selectedWatchCode ? "is-selected" : ""}" data-code="${row.code}" role="button" tabindex="0" title="查看${row.name}盯盘详情">
      <td>${row.rank}</td>
      <td>${codeOf(row)}</td>
      <td><strong>${row.name}</strong></td>
      <td>${row.sectorName}</td>
      <td><strong>${fixed(row.watchScore, 2)}</strong></td>
      <td><div class="watch-tags compact-tags">${renderWatchTags(row)}</div></td>
      <td><span class="tag ${tagStyle(row.breakoutStage)}">${row.breakoutStage || "待确认"}</span></td>
      <td>${Number.isFinite(row.heatRank) ? row.heatRank : "待确认"}</td>
      <td>${Number.isFinite(row.xueqiuRank) ? row.xueqiuRank : "未上榜"}</td>
      <td class="${row.changePct >= 0 ? "up" : "down"}">${pct(row.changePct)}</td>
      <td>${money(row.amount)}</td>
      <td>${fixed(row.volumeRatio, 2)}</td>
      <td class="${row.mainInflow >= 0 ? "up" : "down"}">${money(row.mainInflow)}</td>
      <td class="${row.superInflow >= 0 ? "up" : "down"}">${money(row.superInflow)}</td>
      <td class="${row.ddeNetAmount >= 0 ? "up" : "down"}">${money(row.ddeNetAmount)}</td>
      <td>${money(row.largeOrderAmount)}</td>
      <td>${row.riskLine || "待确认"}</td>
      <td>${row.watchNote || "待确认"}</td>
    </tr>
  `).join("");
}

function applyBreakoutSearchAndSort() {
  const keyword = els.breakoutSearchInput.value.trim().toLowerCase();
  state.filteredBreakoutRows = state.breakoutRows.filter((row) => {
    return row.name.toLowerCase().includes(keyword) || codeOf(row).toLowerCase().includes(keyword) || row.sectorName.toLowerCase().includes(keyword);
  });
  state.filteredBreakoutRows.sort((a, b) => {
    const av = a[state.breakoutSortKey];
    const bv = b[state.breakoutSortKey];
    const result = typeof av === "number" && typeof bv === "number"
      ? av - bv
      : String(av).localeCompare(String(bv), "zh-CN");
    return state.breakoutSortDir === "asc" ? result : -result;
  });
}

function renderBreakoutFocus() {
  const rows = state.filteredBreakoutRows.slice(0, 3);
  els.breakoutFocusList.innerHTML = rows.map((row) => `
    <article class="focus-item breakout-card">
      <div class="focus-title">
        <div>
          <div class="stock-code">${codeOf(row)} · ${row.sectorName}</div>
          <div class="stock-name">${row.name}</div>
        </div>
        <span class="score">${fixed(row.breakoutScore, 1)}</span>
      </div>
      <div class="focus-grid">
        <div class="mini"><span>阶段</span><strong>${row.stage}</strong></div>
        <div class="mini"><span>涨幅</span><strong class="${row.changePct >= 0 ? "up" : "down"}">${pct(row.changePct)}</strong></div>
        <div class="mini"><span>量比</span><strong>${fixed(row.volumeRatio, 2)}</strong></div>
      </div>
      <div class="concept-line">${row.reason}</div>
      <div class="bars">
        ${bar("量能", row.volumeScore, Math.min(row.volumeScore / 30, 1) * 100)}
        ${bar("热度", row.heatScore, Math.min(row.heatScore / 25, 1) * 100)}
        ${bar("承接", row.flowScore, Math.min(row.flowScore / 25, 1) * 100)}
      </div>
    </article>
  `).join("");
}

function renderBreakoutTable() {
  els.breakoutRowsBody.innerHTML = state.filteredBreakoutRows.map((row) => `
    <tr>
      <td>${row.rank}</td>
      <td>${codeOf(row)}</td>
      <td><strong>${row.name}</strong></td>
      <td>${row.sectorName}</td>
      <td><strong>${fixed(row.breakoutScore, 2)}</strong></td>
      <td><span class="tag ${statusClass(row.stage === "刚起爆" ? "强关注" : row.stage === "升温" ? "观察" : "分化")}">${row.stage}</span></td>
      <td class="${row.changePct >= 0 ? "up" : "down"}">${pct(row.changePct)}</td>
      <td>${money(row.amount)}</td>
      <td>${fixed(row.volumeRatio, 2)}</td>
      <td class="${row.mainInflow >= 0 ? "up" : "down"}">${money(row.mainInflow)}</td>
      <td class="${row.superInflow >= 0 ? "up" : "down"}">${money(row.superInflow)}</td>
      <td class="${row.ddeNetAmount >= 0 ? "up" : "down"}">${money(row.ddeNetAmount)}</td>
      <td>${money(row.largeOrderAmount)}</td>
      <td>${Number.isFinite(row.heatRank) ? row.heatRank : "待确认"}</td>
      <td>${Number.isFinite(row.xueqiuRank) ? row.xueqiuRank : "未上榜"}</td>
      <td>${fixed(row.volumeScore, 1)}</td>
      <td>${fixed(row.heatScore, 1)}</td>
      <td>${fixed(row.flowScore, 1)}</td>
      <td>${fixed(row.sectorScore, 1)}</td>
      <td>${row.reason}</td>
      <td>${row.risk}</td>
      <td>${row.entryCondition}</td>
    </tr>
  `).join("");
}

function handleBreakoutAlerts(rows) {
  if (!state.breakoutAlert.enabled) return;
  const matches = rows.filter(isBreakoutAlertMatch);
  const freshMatches = matches.filter((row) => !state.breakoutAlertSeen.has(breakoutAlertKey(row)));
  if (!freshMatches.length) return;
  freshMatches.forEach((row) => state.breakoutAlertSeen.add(breakoutAlertKey(row)));
  if (state.breakoutAlert.sound) playBreakoutAlertSound();
  if (state.breakoutAlert.popup) openBreakoutAlertModal(freshMatches);
  showToast(`起爆警报：${freshMatches.length} 只股票触发`);
}

function isBreakoutAlertMatch(row) {
  const requiredStage = BREAKOUT_STAGE_RANK[state.breakoutAlert.stage] ?? 3;
  const stage = row.breakoutStage || row.stage;
  const rowStage = BREAKOUT_STAGE_RANK[stage] ?? 0;
  return Number(row.breakoutScore || row.watchScore) >= state.breakoutAlert.minScore && rowStage >= requiredStage;
}

function breakoutAlertKey(row) {
  const stage = row.breakoutStage || row.stage;
  return `${row.code}:${stage}:${Math.floor(Number(row.breakoutScore || row.watchScore) || 0)}`;
}

function openBreakoutAlertModal(rows) {
  const topRows = rows.slice(0, 8);
  els.breakoutAlertTitle.textContent = "起爆信号警报";
  els.breakoutAlertMeta.textContent = `${topRows.length} 只股票达到 ${state.breakoutAlert.stage} / ${state.breakoutAlert.minScore} 分条件`;
  els.breakoutAlertBadge.textContent = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  els.breakoutAlertList.innerHTML = topRows.map((row) => `
    <article class="alert-item">
      <div>
        <div class="stock-code">${codeOf(row)} · ${row.sectorName}</div>
        <strong>${row.name}</strong>
      </div>
      <div class="alert-score">${fixed(row.watchScore || row.breakoutScore, 1)}</div>
      <div class="alert-detail">
        <span>${row.breakoutStage || row.stage}</span>
        <span>热度 ${Number.isFinite(row.heatRank) ? `第${row.heatRank}` : "待确认"}</span>
        <span class="${row.changePct >= 0 ? "up" : "down"}">${pct(row.changePct)}</span>
        <span>量比 ${fixed(row.volumeRatio, 2)}</span>
        <span>DDE ${money(row.ddeNetAmount)}</span>
        <span>大单 ${money(row.largeOrderAmount)}</span>
      </div>
      <p>${row.breakoutReason || row.reason || row.watchNote}</p>
      <p>风险线：${row.riskLine || row.risk || "待确认"}</p>
    </article>
  `).join("");
  els.breakoutAlertModal.hidden = false;
  document.body.classList.add("modal-open");
}

function closeBreakoutAlertModal() {
  els.breakoutAlertModal.hidden = true;
  document.body.classList.remove("modal-open");
}

function getBreakoutAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!breakoutAudioContext) breakoutAudioContext = new AudioContextClass();
  return breakoutAudioContext;
}

function unlockBreakoutAlertSound() {
  const context = getBreakoutAudioContext();
  if (context && context.state === "suspended") context.resume();
}

function playBreakoutAlertSound() {
  const context = getBreakoutAudioContext();
  if (!context) return;
  if (context.state === "suspended") context.resume();
  const now = context.currentTime;
  [0, 0.18, 0.36].forEach((offset) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, now + offset);
    oscillator.frequency.exponentialRampToValueAtTime(1180, now + offset + 0.08);
    gain.gain.setValueAtTime(0.0001, now + offset);
    gain.gain.exponentialRampToValueAtTime(0.12, now + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.14);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now + offset);
    oscillator.stop(now + offset + 0.16);
  });
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
      <div class="concept-line">${row.conceptNote || "题材待确认"} · 雪球${Number.isFinite(row.xueqiuRank) ? `第${row.xueqiuRank}` : "未上榜"}</div>
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
      <td>${Number.isFinite(row.xueqiuRank) ? row.xueqiuRank : "未上榜"}</td>
      <td>${Number.isFinite(row.xueqiuHeatValue) ? fixed(row.xueqiuHeatValue, 0) : "待确认"}</td>
      <td><span class="rank-change ${rankChangeClass(row.xueqiuRankChange)}">${Number.isFinite(row.xueqiuRankChange) ? rankChangeText(row.xueqiuRankChange) : "待确认"}</span></td>
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
      <td class="${row.ddeNetAmount >= 0 ? "up" : "down"}">${money(row.ddeNetAmount)}</td>
      <td>${money(row.largeOrderAmount)}</td>
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
  if (newsList) newsList.innerHTML = `<article class="news-item"><div class="news-title">热点事件加载中</div><div class="news-meta">同花顺财经资讯搜索 · 最近一周</div><p>正在匹配板块名称、核心个股和题材关键词。</p></article>`;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 18_000);
  try {
    const response = await fetch(`${API_BASE}/api/sector-detail?code=${encodeURIComponent(code)}&period=${state.sectorPeriod}`, {
      cache: "no-store",
      signal: controller.signal
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "请求失败");
    renderSectorDetail(payload.board, payload.rows, payload.news, payload.interpretation);
  } catch (error) {
    els.sectorDetailTitle.textContent = "板块详情";
    els.sectorDetailMeta.textContent = error.name === "AbortError" ? "板块详情请求超时" : error.message;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function renderSectorDetail(board, rows, news, interpretation) {
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
  renderSectorNews(news, interpretation);
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
      <td class="${row.ddeNetAmount >= 0 ? "up" : "down"}">${money(row.ddeNetAmount)}</td>
      <td>${money(row.largeOrderAmount)}</td>
      <td><span class="tag ${tagClass(row.tag)}">${row.tag}</span> ${row.reason}</td>
      <td>${row.risk}</td>
    </tr>
  `).join("");
}

function renderSectorNews(news, interpretation) {
  const list = document.querySelector("#sectorNewsList");
  if (!list) return;
  const model = interpretation || news?.interpretation;
  const items = news?.items?.length ? news.items : [{
    title: "暂无明确利好，等待确认",
    source: "系统提示",
    publishTime: "待确认",
    summary: "当前未匹配到可用的板块利好资讯。",
    eventType: "待确认",
    impact: "热点驱动待确认，优先观察板块成交额和龙头承接。",
    relatedStocks: "待确认",
    risk: "等待消息源和资金线同步确认。",
    url: ""
  }];
  const modelCard = model ? renderSectorInterpretationCard(model) : "";
  const eventCards = items.map((item) => `
    <article class="news-item">
      <div class="news-title">${item.url ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.title)}</a>` : escapeHtml(item.title)}</div>
      <div class="news-meta">${escapeHtml(item.source || "待确认")} · ${escapeHtml(item.publishTime || "待确认")} · ${escapeHtml(item.eventType || "热点事件")}</div>
      <p>${escapeHtml(item.summary || "暂无摘要")}</p>
      <p>${escapeHtml(item.impact || "影响链待确认")}</p>
      <p>相关个股：${escapeHtml(item.relatedStocks || "待确认")}；风险：${escapeHtml(item.risk || "等待资金线确认")}</p>
    </article>
  `).join("");
  list.innerHTML = `${modelCard}${eventCards}`;
}

function renderSectorInterpretationCard(model) {
  const whyRise = renderInterpretationList(model.whyRise);
  const watchSignals = renderInterpretationList(model.watchSignals);
  const risks = renderInterpretationList(model.risks);
  const modelLabel = String(model.source || "").includes("本地规则") ? "规则解读" : "问财模型解读";
  const beneficiaries = (model.beneficiaries || []).slice(0, 8).map((item) => `
    <li>
      <strong>${escapeHtml(item.name || "待确认")}</strong>
      <span>${escapeHtml(item.reason || "受益逻辑待确认")}</span>
    </li>
  `).join("");
  const warning = model.warning ? `<div class="interpretation-warning">${escapeHtml(model.warning)}</div>` : "";
  return `
    <article class="sector-interpretation-card">
      <div class="interpretation-head">
        <div>
          <span class="model-pill">${escapeHtml(modelLabel)}</span>
          <h3>${escapeHtml(model.headline || "热点事件解读待确认")}</h3>
          <p>${escapeHtml(model.coreConclusion || "等待模型生成板块解读。")}</p>
        </div>
        <div class="interpretation-source">
          <span>${escapeHtml(model.source || "同花顺问财模型")}</span>
          <span>${escapeHtml(model.generatedAt || "待确认")}</span>
        </div>
      </div>
      ${warning}
      <div class="interpretation-grid">
        <section>
          <h4>为什么涨</h4>
          <ul>${whyRise}</ul>
        </section>
        <section>
          <h4>持续性</h4>
          <div class="continuity-badge">${escapeHtml(model.continuity?.level || "待确认")}</div>
          <p>${escapeHtml(model.continuity?.text || "持续性等待资金和核心股承接确认。")}</p>
        </section>
        <section>
          <h4>后续观察</h4>
          <ul>${watchSignals}</ul>
        </section>
        <section>
          <h4>风险点</h4>
          <ul>${risks}</ul>
        </section>
      </div>
      <section class="beneficiary-panel">
        <h4>受益股票</h4>
        <ul>${beneficiaries || `<li><strong>待确认</strong><span>暂无明确受益股。</span></li>`}</ul>
      </section>
    </article>
  `;
}

function renderInterpretationList(items = []) {
  const rows = items.length ? items : ["待确认"];
  return rows.slice(0, 6).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

let lightweightChartsPromise = null;

function ensureChartLibrary() {
  if (window.LightweightCharts) return Promise.resolve(window.LightweightCharts);
  if (lightweightChartsPromise) return lightweightChartsPromise;
  lightweightChartsPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = LIGHTWEIGHT_CHARTS_SRC;
    script.async = true;
    script.onload = () => window.LightweightCharts ? resolve(window.LightweightCharts) : reject(new Error("图表库加载失败"));
    script.onerror = () => reject(new Error("图表库加载失败"));
    document.head.appendChild(script);
  });
  return lightweightChartsPromise;
}

function detailChartElements(scope) {
  if (scope === "watch") {
    return {
      panel: els.watchChartPanel,
      state: els.watchChartState,
      intraday: els.watchIntradayChart,
      daily: els.watchDailyChart
    };
  }
  return {
    panel: els.hotChartPanel,
    state: els.hotChartState,
    intraday: els.hotIntradayChart,
    daily: els.hotDailyChart
  };
}

function clearDetailCharts(scope) {
  state.detailCharts[scope].forEach((item) => {
    item.cleanup?.forEach((cleanup) => cleanup());
    item.observer?.disconnect();
    item.chart?.remove();
  });
  state.detailCharts[scope] = [];
}

function prepareChartPanel(scope, message) {
  const chartEls = detailChartElements(scope);
  clearDetailCharts(scope);
  chartEls.panel.hidden = false;
  chartEls.state.textContent = message;
  chartEls.intraday.innerHTML = `<div class="chart-empty">分时图加载中</div>`;
  chartEls.daily.innerHTML = `<div class="chart-empty">日K线加载中</div>`;
}

async function loadStockCharts(scope, row) {
  const chartEls = detailChartElements(scope);
  prepareChartPanel(scope, "图表加载中");
  const exchange = row.exchange ? `&exchange=${encodeURIComponent(row.exchange)}` : "";
  try {
    const [library, response] = await Promise.all([
      ensureChartLibrary(),
      fetch(`${API_BASE}/api/stock-chart?code=${encodeURIComponent(row.code)}${exchange}`, { cache: "no-store" })
    ]);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "图表请求失败");
    renderStockCharts(scope, payload, library);
  } catch (error) {
    clearDetailCharts(scope);
    chartEls.state.textContent = error.message;
    chartEls.intraday.innerHTML = `<div class="chart-empty">分时图待确认</div>`;
    chartEls.daily.innerHTML = `<div class="chart-empty">日K线待确认</div>`;
  }
}

function renderStockCharts(scope, payload, library) {
  const chartEls = detailChartElements(scope);
  clearDetailCharts(scope);
  chartEls.intraday.innerHTML = "";
  chartEls.daily.innerHTML = "";
  const missing = missingLevelText(payload.levels || {});
  chartEls.state.textContent = `${payload.source}${payload.warning ? ` · ${payload.warning}` : ""}${missing}`;
  if (payload.intraday?.length) {
    renderIntradayChart(scope, chartEls.intraday, payload, library);
  } else {
    chartEls.intraday.innerHTML = `<div class="chart-empty">分时图暂无可用数据</div>`;
  }
  if (payload.daily?.length) {
    renderDailyChart(scope, chartEls.daily, payload, library);
  } else {
    chartEls.daily.innerHTML = `<div class="chart-empty">日K线暂无可用数据</div>`;
  }
}

function renderIntradayChart(scope, container, payload, library) {
  const chart = createBaseChart(container, library);
  const priceSeries = chart.addLineSeries({ color: "#c2413a", lineWidth: 2, title: "价格" });
  priceSeries.setData(payload.intraday.map((point) => ({ time: point.timestamp, value: point.price })));
  const averageData = payload.intraday
    .filter((point) => Number.isFinite(point.average))
    .map((point) => ({ time: point.timestamp, value: point.average }));
  if (averageData.length) {
    const averageSeries = chart.addLineSeries({
      color: "#0f766e",
      lineWidth: 1,
      title: "均线",
      lastValueVisible: false,
      priceLineVisible: false
    });
    averageSeries.setData(averageData);
  }
  addLevelLines(priceSeries, payload.levels || {}, library);
  chart.timeScale().fitContent();
  trackChartResize(scope, chart, container);
}

function renderDailyChart(scope, container, payload, library) {
  const chart = createBaseChart(container, library);
  const candleSeries = chart.addCandlestickSeries({
    upColor: "#c2413a",
    downColor: "#17834f",
    borderUpColor: "#c2413a",
    borderDownColor: "#17834f",
    wickUpColor: "#c2413a",
    wickDownColor: "#17834f"
  });
  candleSeries.setData(payload.daily.map((point) => ({
    time: point.date,
    open: point.open,
    high: point.high,
    low: point.low,
    close: point.close
  })));
  const emaSeries = [];
  [
    ["EMA5", payload.movingAverages?.ma5 || [], "#2563eb"],
    ["EMA10", payload.movingAverages?.ma10 || [], "#b7791f"],
    ["EMA20", payload.movingAverages?.ma20 || [], "#6a645c"]
  ].forEach(([title, data, color]) => {
    if (!data.length) return;
    const series = chart.addLineSeries({
      color,
      lineWidth: 1,
      title: "",
      lastValueVisible: false,
      priceLineVisible: false
    });
    series.setData(data);
    series.applyOptions({ title: "", lastValueVisible: false, priceLineVisible: false });
    emaSeries.push({ title, color, series });
  });
  addLevelLines(candleSeries, payload.levels || {}, library);
  chart.timeScale().fitContent();
  const updateCostZone = addCostZoneOverlay(chart, container, candleSeries, payload.levels || {});
  const cleanupEmaLegend = addEmaHoverLegend(chart, container, emaSeries);
  trackChartResize(scope, chart, container, [updateCostZone], [cleanupEmaLegend]);
}

function createBaseChart(container, library) {
  return library.createChart(container, {
    width: Math.max(container.clientWidth, 320),
    height: Math.max(container.clientHeight, 360),
    layout: {
      background: { color: "#fffdf8" },
      textColor: "#202020"
    },
    grid: {
      vertLines: { color: "#eee8de" },
      horzLines: { color: "#eee8de" }
    },
    rightPriceScale: { borderColor: "#d8d0c4" },
    timeScale: { borderColor: "#d8d0c4", timeVisible: true, secondsVisible: false },
    crosshair: { mode: library.CrosshairMode.Normal }
  });
}

function trackChartResize(scope, chart, container, updateCallbacks = [], cleanupCallbacks = []) {
  const observer = new ResizeObserver(() => {
    chart.applyOptions({
      width: Math.max(container.clientWidth, 320),
      height: Math.max(container.clientHeight, 360)
    });
    window.requestAnimationFrame(() => updateCallbacks.forEach((callback) => callback()));
  });
  observer.observe(container);
  const rangeHandler = () => {
    window.requestAnimationFrame(() => updateCallbacks.forEach((callback) => callback()));
  };
  chart.timeScale().subscribeVisibleLogicalRangeChange(rangeHandler);
  window.requestAnimationFrame(() => updateCallbacks.forEach((callback) => callback()));
  state.detailCharts[scope].push({
    chart,
    observer,
    cleanup: [
      () => chart.timeScale().unsubscribeVisibleLogicalRangeChange(rangeHandler),
      ...cleanupCallbacks
    ]
  });
}

function addCostZoneOverlay(chart, container, series, levels) {
  if (!Number.isFinite(levels.costLow) || !Number.isFinite(levels.costHigh)) return () => {};
  const low = Math.min(levels.costLow, levels.costHigh);
  const high = Math.max(levels.costLow, levels.costHigh);
  const zone = document.createElement("div");
  zone.className = "chart-cost-zone";
  zone.innerHTML = `<span>大单成本区 ${low.toFixed(2)}-${high.toFixed(2)}</span>`;
  container.appendChild(zone);

  return () => {
    const topCoordinate = series.priceToCoordinate(high);
    const bottomCoordinate = series.priceToCoordinate(low);
    if (!Number.isFinite(topCoordinate) || !Number.isFinite(bottomCoordinate)) {
      zone.hidden = true;
      return;
    }
    const top = Math.min(topCoordinate, bottomCoordinate);
    const bottom = Math.max(topCoordinate, bottomCoordinate);
    const rightScaleWidth = chart.priceScale("right")?.width?.() || 0;
    zone.hidden = false;
    zone.style.top = `${top}px`;
    zone.style.height = `${Math.max(bottom - top, 4)}px`;
    zone.style.right = `${rightScaleWidth}px`;
  };
}

function addEmaHoverLegend(chart, container, emaSeries) {
  if (!emaSeries.length) return () => {};
  const legend = document.createElement("div");
  legend.className = "chart-inline-legend";
  legend.innerHTML = `
    ${emaSeries.map((item) => `<span style="--legend-color: ${item.color}">${item.title}</span>`).join("")}
    <strong></strong>
  `;
  const valueEl = legend.querySelector("strong");
  container.appendChild(legend);
  const handler = (param) => {
    const hovered = emaSeries.find((item) => item.series === param.hoveredSeries);
    const point = hovered ? param.seriesData.get(hovered.series) : null;
    const value = point?.value;
    valueEl.textContent = Number.isFinite(value) ? `${hovered.title} ${value.toFixed(2)}` : "";
  };
  chart.subscribeCrosshairMove(handler);
  return () => chart.unsubscribeCrosshairMove(handler);
}

function addLevelLines(series, levels, library) {
  const dashed = library.LineStyle.Dashed;
  [
    ["压力区", levels.pressure, "#b7791f"],
    ["承接区", levels.support, "#17834f"],
    ["风险线", levels.riskInvalid, "#c2413a"]
  ].forEach(([title, price, color]) => {
    if (!Number.isFinite(price)) return;
    series.createPriceLine({
      price,
      color,
      lineWidth: 1,
      lineStyle: dashed,
      axisLabelVisible: true,
      title
    });
  });
}

function missingLevelText(levels) {
  const missing = [];
  if (!Number.isFinite(levels.costLow) || !Number.isFinite(levels.costHigh)) missing.push("成本区");
  if (!Number.isFinite(levels.pressure)) missing.push("压力区");
  if (!Number.isFinite(levels.support)) missing.push("承接区");
  if (!Number.isFinite(levels.riskInvalid)) missing.push("风险线");
  return missing.length ? ` · ${missing.join("、")}待确认` : "";
}

async function loadWatchDetail(code) {
  state.selectedWatchCode = code;
  renderWatchTable();
  openWatchDetailModal();
  els.watchDetailTitle.textContent = "盯盘详情加载中";
  els.watchDetailMeta.textContent = "正在读取统一榜单、热度分析和起爆信号";
  els.watchDetailBadge.textContent = code;
  els.watchDetailCards.innerHTML = "";
  prepareChartPanel("watch", "图表等待详情数据");
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 35_000);
  try {
    const response = await fetch(`${API_BASE}/api/watchlist-detail?code=${encodeURIComponent(code)}&period=${state.watchPeriod}`, {
      cache: "no-store",
      signal: controller.signal
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "请求失败");
    renderWatchDetail(payload.row, payload.detail);
    loadStockCharts("watch", payload.row);
  } catch (error) {
    els.watchDetailTitle.textContent = "盯盘详情";
    els.watchDetailMeta.textContent = error.name === "AbortError" ? "盯盘详情请求超时" : error.message;
    detailChartElements("watch").state.textContent = "图表待确认";
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function openWatchDetailModal() {
  els.watchDetailModal.hidden = false;
  document.body.classList.add("modal-open");
  els.watchDetailClose.focus();
}

function closeWatchDetailModal() {
  clearDetailCharts("watch");
  els.watchDetailModal.hidden = true;
  document.body.classList.remove("modal-open");
}

function renderWatchDetail(row, detail) {
  const hot = detail.hot;
  const breakout = detail.breakout;
  els.watchDetailTitle.textContent = `${row.name} · ${row.sourceType}`;
  els.watchDetailMeta.textContent = `${detail.confluence} ${row.watchNote}`;
  els.watchDetailBadge.textContent = `${fixed(row.watchScore, 1)} 分`;
  const hotCards = hot ? `
    <div class="detail-card">
      <span>热度榜表现</span>
      <strong>${hot.heat}</strong>
    </div>
    <div class="detail-card">
      <span>暗盘资金承接</span>
      <strong>${hot.flow}</strong>
    </div>
    <div class="detail-card">
      <span>所属板块强度</span>
      <strong>${hot.sector}</strong>
    </div>
    <div class="detail-card">
      <span>龙头定位</span>
      <strong>${hot.leader}</strong>
    </div>
    <div class="detail-card wide-card">
      <span>AI股票分析</span>
      <strong>${hot.aiAnalysis}</strong>
    </div>
    <div class="detail-card wide-card">
      <span>风险诊断</span>
      <strong>${hot.riskDiagnosis}</strong>
    </div>
    <div class="detail-card">
      <span>大单成本区</span>
      <strong>${hot.chipCost}</strong>
    </div>
    <div class="detail-card">
      <span>上方压力区</span>
      <strong>${hot.chipPressure}</strong>
    </div>
    <div class="detail-card">
      <span>下方承接区</span>
      <strong>${hot.chipSupport}</strong>
    </div>
    <div class="detail-card wide-card">
      <span>价格相对主力成本位置</span>
      <strong>${hot.chipPosition}</strong>
    </div>
  ` : "";
  const breakoutCards = breakout ? `
    <div class="detail-card wide-card">
      <span>起爆理由</span>
      <strong>${breakout.reason || "待确认"}</strong>
    </div>
    <div class="detail-card">
      <span>起爆阶段</span>
      <strong>${breakout.stage || "待确认"}</strong>
    </div>
    <div class="detail-card">
      <span>量能/热度/承接</span>
      <strong>${fixed(breakout.volumeScore, 1)} / ${fixed(breakout.heatScore, 1)} / ${fixed(breakout.carryScore, 1)}</strong>
    </div>
    <div class="detail-card">
      <span>板块共振</span>
      <strong>${fixed(breakout.sectorScore, 1)} 分 · ${row.sectorName}</strong>
    </div>
  ` : "";
  els.watchDetailCards.innerHTML = `
    <div class="detail-card wide-card">
      <span>共振结论</span>
      <strong>${detail.confluence}</strong>
    </div>
    <div class="detail-card">
      <span>来源标签</span>
      <strong>${(row.tags || []).join(" / ") || "待确认"}</strong>
    </div>
    <div class="detail-card">
      <span>盯盘分</span>
      <strong>${fixed(row.watchScore, 2)} · ${row.grade}</strong>
    </div>
    <div class="detail-card">
      <span>热度与涨幅</span>
      <strong>热度${Number.isFinite(row.heatRank) ? `第${row.heatRank}` : "待确认"} · 涨幅${pct(row.changePct)}</strong>
    </div>
    <div class="detail-card">
      <span>DDE / 大单总额</span>
      <strong>${money(row.ddeNetAmount)} · ${money(row.largeOrderAmount)}</strong>
    </div>
    ${hotCards}
    ${breakoutCards}
    <div class="detail-card wide-card">
      <span>买点条件</span>
      <strong>${row.buyPointCondition || row.entryCondition || "待确认"}</strong>
    </div>
    <div class="detail-card">
      <span>风险线</span>
      <strong>${row.riskLine || "待确认"}</strong>
    </div>
    <div class="detail-card wide-card">
      <span>失效条件</span>
      <strong>${row.invalidCondition || "待确认"}</strong>
    </div>
  `;
}

async function loadHotDetail(code) {
  state.selectedHotCode = code;
  renderHotTable();
  openHotDetailModal();
  els.hotDetailTitle.textContent = "热度龙头详情加载中";
  els.hotDetailMeta.textContent = "正在读取热度榜和承接条件";
  els.hotDetailBadge.textContent = code;
  els.hotDetailCards.innerHTML = "";
  prepareChartPanel("hot", "图表等待详情数据");
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
    loadStockCharts("hot", payload.row);
  } catch (error) {
    els.hotDetailTitle.textContent = "热度龙头详情";
    els.hotDetailMeta.textContent = error.name === "AbortError" ? "热度详情请求超时" : error.message;
    detailChartElements("hot").state.textContent = "图表待确认";
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
  clearDetailCharts("hot");
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
    <div class="detail-card wide-card">
      <span>AI股票分析</span>
      <strong>${detail.aiAnalysis}</strong>
    </div>
    <div class="detail-card wide-card">
      <span>风险诊断</span>
      <strong>${detail.riskDiagnosis}</strong>
    </div>
    <div class="detail-card">
      <span>大单成本区</span>
      <strong>${detail.chipCost}</strong>
    </div>
    <div class="detail-card">
      <span>上方压力区</span>
      <strong>${detail.chipPressure}</strong>
    </div>
    <div class="detail-card">
      <span>下方承接区</span>
      <strong>${detail.chipSupport}</strong>
    </div>
    <div class="detail-card wide-card">
      <span>价格相对主力成本位置</span>
      <strong>${detail.chipPosition}</strong>
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
    <div class="detail-card wide-card">
      <span>筹码来源</span>
      <strong>${detail.chipSource}</strong>
    </div>
  `;
}

function tagClass(tag) {
  if (tag === "强承接") return "strong";
  if (tag === "大单增强") return "strong";
  if (tag === "进攻") return "attack";
  if (tag === "分歧") return "diverge";
  return "";
}

function exportCsv() {
  if (state.view === "watch") {
    exportWatchCsv();
    return;
  }
  if (state.view === "hot") {
    exportHotCsv();
    return;
  }
  if (state.view === "breakout") {
    exportBreakoutCsv();
    return;
  }
  const header = ["代码", "名称", "分数", "价格", "涨幅", "成交额", "量比", "振幅", "换手", "主力净额", "超大单净额", "超大单占比", "大单净额", "大单占比", "DDE大单净额", "DDE大单净量", "大单总额", "信号", "风险线"];
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
    row.ddeNetAmount,
    row.ddeNetVolume,
    row.largeOrderAmount,
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

function exportWatchCsv() {
  const header = ["排名", "代码", "名称", "板块", "盯盘分", "来源标签", "起爆阶段", "热度排名", "雪球排名", "涨幅", "成交额", "量比", "主力净额", "超大单净额", "DDE大单净额", "DDE大单净量", "大单总额", "风险线", "买点条件", "盯盘备注"];
  const rows = state.filteredWatchRows.map((row) => [
    row.rank,
    codeOf(row),
    row.name,
    row.sectorName,
    row.watchScore,
    (row.tags || []).join("/"),
    row.breakoutStage,
    Number.isFinite(row.heatRank) ? row.heatRank : "",
    Number.isFinite(row.xueqiuRank) ? row.xueqiuRank : "",
    row.changePct,
    row.amount,
    row.volumeRatio,
    row.mainInflow,
    row.superInflow,
    row.ddeNetAmount,
    row.ddeNetVolume,
    row.largeOrderAmount,
    row.riskLine,
    row.buyPointCondition || row.entryCondition,
    row.watchNote
  ]);
  const csv = [header, ...rows]
    .map((line) => line.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `a-share-watchlist-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function exportHotCsv() {
  const header = ["综合排名", "代码", "名称", "所属板块", "同花顺热度排名", "雪球排名", "雪球热度", "雪球变化", "同花顺热度变化", "涨幅", "成交额", "量比", "振幅", "换手", "主力净额", "超大单净额", "龙头类型", "炒作概念", "综合评分", "推荐等级", "短线承接理由", "风险收益判断", "风险线", "失效条件"];
  const rows = state.filteredHotRows.slice(0, 50).map((row) => [
    row.rank,
    codeOf(row),
    row.name,
    row.sectorName,
    row.heatRank,
    Number.isFinite(row.xueqiuRank) ? row.xueqiuRank : "未上榜",
    Number.isFinite(row.xueqiuHeatValue) ? row.xueqiuHeatValue : "",
    Number.isFinite(row.xueqiuRankChange) ? row.xueqiuRankChange : "",
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

function exportBreakoutCsv() {
  const header = ["排名", "代码", "名称", "所属板块", "起爆评分", "阶段", "涨幅", "成交额", "量比", "主力净额", "超大单净额", "DDE大单净额", "DDE大单净量", "大单总额", "同花顺热度", "雪球排名", "量能分", "热度分", "承接分", "板块分", "触发理由", "风险提示", "买点条件"];
  const rows = state.filteredBreakoutRows.slice(0, 50).map((row) => [
    row.rank,
    codeOf(row),
    row.name,
    row.sectorName,
    row.breakoutScore,
    row.stage,
    row.changePct,
    row.amount,
    row.volumeRatio,
    row.mainInflow,
    row.superInflow,
    row.ddeNetAmount,
    row.ddeNetVolume,
    row.largeOrderAmount,
    Number.isFinite(row.heatRank) ? row.heatRank : "",
    Number.isFinite(row.xueqiuRank) ? row.xueqiuRank : "",
    row.volumeScore,
    row.heatScore,
    row.flowScore,
    row.sectorScore,
    row.reason,
    row.risk,
    row.entryCondition
  ]);
  const csv = [header, ...rows]
    .map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `a-share-breakout-alerts-${new Date().toISOString().slice(0, 10)}.csv`;
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
  els.watchView.hidden = view !== "watch";
  els.sectorView.hidden = view !== "sectors";
  els.hotView.hidden = view !== "hot";
  els.breakoutView.hidden = view !== "breakout";
  document.querySelectorAll(".view-tab").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === view);
  });
  if (view === "watch" && !state.watchRows.length) refreshWatchlist();
  if (view === "sectors" && !state.sectorRows.length) refreshSectors();
  if (view === "hot" && !state.hotRows.length) refreshHotLeaders();
  if (view === "breakout" && !state.breakoutRows.length) refreshBreakouts();
}

function setWatchPeriod(period) {
  state.watchPeriod = Number(period);
  state.selectedWatchCode = "";
  document.querySelectorAll(".watch-period").forEach((button) => {
    button.classList.toggle("is-active", Number(button.dataset.watchPeriod) === state.watchPeriod);
  });
  refreshWatchlist();
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

document.querySelectorAll(".watch-period").forEach((button) => {
  button.addEventListener("click", () => setWatchPeriod(button.dataset.watchPeriod));
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

document.querySelectorAll("th[data-watch-sort]").forEach((th) => {
  th.addEventListener("click", () => {
    const key = th.dataset.watchSort;
    if (state.watchSortKey === key) {
      state.watchSortDir = state.watchSortDir === "asc" ? "desc" : "asc";
    } else {
      state.watchSortKey = key;
      state.watchSortDir = "desc";
    }
    applyWatchSearchAndSort();
    renderWatchFocus();
    renderWatchTable();
  });
});

document.querySelectorAll("th[data-breakout-sort]").forEach((th) => {
  th.addEventListener("click", () => {
    const key = th.dataset.breakoutSort;
    if (state.breakoutSortKey === key) {
      state.breakoutSortDir = state.breakoutSortDir === "asc" ? "desc" : "asc";
    } else {
      state.breakoutSortKey = key;
      state.breakoutSortDir = "desc";
    }
    applyBreakoutSearchAndSort();
    renderBreakoutFocus();
    renderBreakoutTable();
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

els.watchSearchInput.addEventListener("input", () => {
  applyWatchSearchAndSort();
  renderWatchFocus();
  renderWatchTable();
  els.watchState.textContent = state.filteredWatchRows.length ? "" : "没有匹配的盯盘候选";
});

document.querySelectorAll(".watch-filter").forEach((button) => {
  button.addEventListener("click", () => {
    state.watchFilter = button.dataset.watchFilter;
    document.querySelectorAll(".watch-filter").forEach((item) => {
      item.classList.toggle("is-active", item === button);
    });
    applyWatchSearchAndSort();
    renderWatchFocus();
    renderWatchTable();
    els.watchState.textContent = state.filteredWatchRows.length ? "" : "没有匹配的盯盘候选";
  });
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

els.breakoutSearchInput.addEventListener("input", () => {
  applyBreakoutSearchAndSort();
  renderBreakoutFocus();
  renderBreakoutTable();
  els.breakoutState.textContent = state.filteredBreakoutRows.length ? "" : "没有匹配的起爆预警";
});

[
  els.breakoutAlertEnabled,
  els.breakoutAlertSound,
  els.breakoutAlertPopup,
  els.breakoutAlertMinScore,
  els.breakoutAlertStage
].forEach((control) => {
  control.addEventListener("input", () => {
    readBreakoutAlertControls();
    unlockBreakoutAlertSound();
  });
  control.addEventListener("change", () => {
    readBreakoutAlertControls();
    unlockBreakoutAlertSound();
  });
});

els.breakoutAlertTest.addEventListener("click", () => {
  unlockBreakoutAlertSound();
  playBreakoutAlertSound();
  showToast("起爆警报提示音已试听");
});

els.sectorFocusList.addEventListener("click", (event) => {
  const card = event.target.closest(".sector-card");
  if (card) loadSectorDetail(card.dataset.code);
});

els.watchFocusList.addEventListener("click", (event) => {
  const card = event.target.closest(".watch-card");
  if (card) loadWatchDetail(card.dataset.code);
});

els.watchFocusList.addEventListener("keydown", (event) => {
  const card = event.target.closest(".watch-card");
  if (!card || (event.key !== "Enter" && event.key !== " ")) return;
  event.preventDefault();
  loadWatchDetail(card.dataset.code);
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

els.watchRowsBody.addEventListener("click", (event) => {
  const row = event.target.closest(".watch-row");
  if (row) loadWatchDetail(row.dataset.code);
});

els.watchRowsBody.addEventListener("keydown", (event) => {
  const row = event.target.closest(".watch-row");
  if (!row || (event.key !== "Enter" && event.key !== " ")) return;
  event.preventDefault();
  loadWatchDetail(row.dataset.code);
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

els.watchDetailClose.addEventListener("click", closeWatchDetailModal);

els.watchDetailModal.addEventListener("click", (event) => {
  if (event.target === els.watchDetailModal) closeWatchDetailModal();
});

els.hotDetailClose.addEventListener("click", closeHotDetailModal);

els.hotDetailModal.addEventListener("click", (event) => {
  if (event.target === els.hotDetailModal) closeHotDetailModal();
});

els.breakoutAlertClose.addEventListener("click", closeBreakoutAlertModal);

els.breakoutAlertModal.addEventListener("click", (event) => {
  if (event.target === els.breakoutAlertModal) closeBreakoutAlertModal();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !els.watchDetailModal.hidden) closeWatchDetailModal();
  if (event.key === "Escape" && !els.hotDetailModal.hidden) closeHotDetailModal();
  if (event.key === "Escape" && !els.breakoutAlertModal.hidden) closeBreakoutAlertModal();
});

els.refreshBtn.addEventListener("click", refresh);
els.exportBtn.addEventListener("click", exportCsv);

loadBreakoutAlertSettings();
syncBreakoutAlertControls();
updateOutputs();
refresh();
