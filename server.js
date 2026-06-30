const http = require("node:http");
const https = require("node:https");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { URL } = require("node:url");
const { execFile } = require("node:child_process");

const PORT = Number(process.env.PORT || 4173);
const PUBLIC_DIR = path.join(__dirname, "public");
const CACHE_DIR = path.join(__dirname, ".cache");
const FRESH_CACHE_MS = 10_000;
const STALE_CACHE_MS = 5 * 60_000;
const DISK_CACHE_MS = 24 * 60 * 60_000;
const REFRESH_ACTIVE_MS = 60_000;
const REFRESH_LUNCH_MS = 3 * 60_000;
const REFRESH_CLOSED_MS = 5 * 60_000;
const HOT_LEADER_CACHE_NAME = "hot-leaders-v3";
const DATA_PROVIDER = String(process.env.MARKET_DATA_PROVIDER || "hithink").toLowerCase();
const HITHINK_ASTOCK_CLI = resolveHithinkAstockCli();
const HITHINK_LIMIT = Math.min(1000, Math.max(50, Number(process.env.HITHINK_LIMIT || 500)));
const HITHINK_QUERY =
  process.env.HITHINK_QUERY ||
  "今日A股非ST，列出股票代码、股票简称、最新价、涨跌幅、成交额、量比、振幅、换手率、主力资金流向、特大单净买入额、dde大单净额、dde大单净量、大单金额、大单净量，按主力资金流向从高到低";
const HITHINK_HOT_LIMIT = Math.min(50, Math.max(20, Number(process.env.HITHINK_HOT_LIMIT || 50)));
const HITHINK_HOT_QUERY =
  process.env.HITHINK_HOT_QUERY ||
  `个股热度排名前${HITHINK_HOT_LIMIT}名，列出股票代码、股票简称、个股热度排名、所属概念、最新价、涨跌幅、成交额、量比、振幅、换手率、主力资金流向、特大单净买入额、dde大单净额、dde大单净量、大单金额、大单净量`;
const XUEQIU_HOT_ENABLED = process.env.XUEQIU_HOT_ENABLED !== "0";
const XUEQIU_HOT_SIZE = Math.min(100, Math.max(20, Number(process.env.XUEQIU_HOT_SIZE || 80)));
const XUEQIU_HOT_TYPE = process.env.XUEQIU_HOT_TYPE || "hot_1h";
const XUEQIU_HOT_URL =
  process.env.XUEQIU_HOT_URL ||
  `https://stock.xueqiu.com/v5/stock/screener/quote/list.json?market=CN&order=desc&order_by=value&page=1&size=${XUEQIU_HOT_SIZE}&type=${encodeURIComponent(XUEQIU_HOT_TYPE)}`;
const NEWS_CACHE_MS = 6 * 60 * 60_000;
const STOCK_CHIP_CACHE_MS = 30 * 60_000;
const STOCK_CHART_CACHE_MS = 60_000;
const BREAKOUT_HISTORY_LIMIT = 200;
const LIGHTWEIGHT_CHARTS_VENDOR = path.join(__dirname, "node_modules", "lightweight-charts", "dist", "lightweight-charts.standalone.production.js");
const FIELDS = "f12,f13,f14,f2,f3,f4,f5,f6,f7,f8,f10,f62,f66,f69,f72,f75";
const BOARD_FIELDS = "f12,f14,f2,f3,f6,f10,f62,f66,f69,f72,f75,f104,f105,f106,f184,f204,f205,f206";
const EASTMONEY_HOSTS = [
  "16.push2.eastmoney.com",
  "17.push2.eastmoney.com",
  "18.push2.eastmoney.com",
  "push2his.eastmoney.com"
];
const EASTMONEY_PATH =
  "/api/qt/clist/get" +
  "?pn=1&pz=5000&po=1&np=1&ut=bd1d9ddb04089700cf9c27f6f7426281" +
  "&fltt=2&invt=2&fid=f62" +
  "&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23" +
  `&fields=${FIELDS}`;
const BOARD_PATH =
  "/api/qt/clist/get" +
  "?pn=1&pz=180&po=1&np=1&ut=bd1d9ddb04089700cf9c27f6f7426281" +
  "&fltt=2&invt=2&fid=f62" +
  "&fs=m:90+t:2,m:90+t:3" +
  `&fields=${BOARD_FIELDS}`;
const BOARD_KLINE_PATH = (code) =>
  "/api/qt/stock/kline/get" +
  `?secid=90.${code}&fields1=f1,f2,f3,f4,f5,f6` +
  "&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61" +
  "&klt=101&fqt=1&beg=20250101&end=20500101&lmt=30";
const BOARD_STOCK_PATH = (code) =>
  "/api/qt/clist/get" +
  "?pn=1&pz=120&po=1&np=1&ut=bd1d9ddb04089700cf9c27f6f7426281" +
  "&fltt=2&invt=2&fid=f62" +
  `&fs=b:${code}` +
  `&fields=${FIELDS}`;
const STOCK_TRENDS_PATH = (secid) =>
  "/api/qt/stock/trends2/get" +
  `?secid=${secid}` +
  "&fields1=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13" +
  "&fields2=f51,f52,f53,f54,f55,f56,f57,f58" +
  "&iscr=0&iscca=0&ndays=1";
const STOCK_DAILY_KLINE_PATH = (secid, limit = 120) =>
  "/api/qt/stock/kline/get" +
  `?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6` +
  "&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61" +
  `&klt=101&fqt=1&beg=20200101&end=20500101&lmt=${limit}`;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

const marketCache = {
  payload: null,
  fetchedAt: 0,
  pending: null,
  lastGoodHost: EASTMONEY_HOSTS[0],
  provider: "",
  source: "",
  warning: ""
};

const boardCache = {
  payload: null,
  fetchedAt: 0,
  pending: null,
  lastGoodHost: EASTMONEY_HOSTS[0]
};

const hotLeaderCache = {
  payload: null,
  fetchedAt: 0,
  pending: null
};
const xueqiuSession = {
  cookie: "",
  fetchedAt: 0
};

const klineCache = new Map();
const stockChartCache = new Map();
const boardStockCache = new Map();
const syntheticSectorMembers = new Map();

const SYNTHETIC_SECTORS = [
  { code: "SYN001", name: "证券金融", re: /证券|财富|同花顺|指南针|金融|银行|保险|期货|信托/ },
  { code: "SYN002", name: "半导体芯片", re: /半导体|微电|芯|晶|硅|士兰|韦尔|兆易|澜起|海光|寒武纪|中微|北方华创|长川|国科微|瑞芯|长电|通富|华天|封测/ },
  { code: "SYN016", name: "面板显示", re: /京东方|TCL科技|深天马|维信诺|彩虹|华映|莱宝|凯盛科技|沃格光电|面板|显示/ },
  { code: "SYN017", name: "电力能源", re: /华电|大唐|京能|上海电力|浙能|国电|华能|华电辽能|长江电力|中国核电|电力|发电|能源/ },
  { code: "SYN003", name: "PCB与电子元件", re: /PCB|电路|沪电|胜宏|生益|兴森|景旺|世运|崇达|东山|鹏鼎|深南|风华|三环|顺络/ },
  { code: "SYN004", name: "AI算力光模块", re: /新易盛|中际旭创|天孚|源杰|剑桥|光迅|太辰光|华工|中科曙光|浪潮|紫光|工业富联|服务器|光电/ },
  { code: "SYN005", name: "消费电子", re: /歌尔|立讯|蓝思|领益|水晶|欧菲光|长盈|东山|传音|闻泰|环旭|鹏鼎|豪威|深科技/ },
  { code: "SYN006", name: "机器人", re: /机器人|三花|拓普|鸣志|绿的|埃斯顿|汇川|中大力德|双环|柯力|均胜|卧龙|兆威|富临|中鼎|减速器|执行器/ },
  { code: "SYN007", name: "新能源车", re: /宁德|比亚迪|赛力斯|长安|江淮|长城|广汽|上汽|吉利|理想|蔚来|小鹏|德赛西威|均胜|拓普/ },
  { code: "SYN008", name: "电池光伏", re: /电池|锂|钠|光伏|隆基|阳光电源|通威|晶澳|天合|福斯特|亿纬|赣锋|天齐|璞泰来|恩捷|星源/ },
  { code: "SYN009", name: "有色金属", re: /铝|铜|锌|锡|钴|镍|钨|钼|黄金|紫金|洛阳钼业|中国铝业|江西铜业|华友|赣锋|天齐/ },
  { code: "SYN010", name: "软件AI应用", re: /软件|信息|智能|科大讯飞|金山|用友|三六零|昆仑|万兴|拓尔思|汉得|中科信息|云从|商汤/ },
  { code: "SYN011", name: "传媒游戏", re: /传媒|游戏|影视|出版|中文在线|掌趣|恺英|巨人|完美|三七|姚记|分众|芒果/ },
  { code: "SYN012", name: "医药医疗", re: /医药|医疗|生物|药业|制药|医院|迈瑞|恒瑞|药明|爱尔|片仔癀|智飞|长春高新|泰格/ },
  { code: "SYN013", name: "白酒消费", re: /茅台|五粮液|泸州|汾酒|洋河|古井|今世缘|舍得|酒鬼|食品|饮料|伊利|海天|东鹏/ },
  { code: "SYN014", name: "低空经济军工", re: /航空|航天|军工|无人机|低空|中航|洪都|成飞|航发|光启|纵横|万丰|宗申/ },
  { code: "SYN015", name: "地产基建", re: /地产|置业|万科|保利|招商蛇口|金地|建工|建筑|中国交建|中国铁建|中国中铁|水泥/ }
];

function asNumber(value) {
  if (value === null || value === undefined || value === "-") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function asMarketNumber(value) {
  if (value === null || value === undefined || value === "" || value === "-") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value).replaceAll(",", "").trim();
  if (!text) return null;
  const multiplier = text.endsWith("亿") ? 100_000_000 : text.endsWith("万") ? 10_000 : 1;
  const number = Number(text.replace(/[亿万%]/g, ""));
  return Number.isFinite(number) ? number * multiplier : null;
}

function pickExact(row, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
  }
  return null;
}

function pickByPrefix(row, prefixes, exclude = []) {
  const keys = Object.keys(row);
  for (const prefix of prefixes) {
    const matched = keys.find((key) => {
      if (exclude.some((part) => key.includes(part))) return false;
      return key === prefix || key.startsWith(`${prefix}[`) || key.startsWith(`${prefix}_`);
    });
    if (matched) return row[matched];
  }
  return null;
}

function pickMarketNumber(row, prefixes, exclude = []) {
  return asMarketNumber(pickByPrefix(row, prefixes, exclude));
}

function deriveAmount(row) {
  const direct = pickMarketNumber(row, ["成交额", "成交金额", "成交额_前复权"]);
  if (direct !== null) return direct;
  const inflow = pickMarketNumber(row, ["资金流入", "流入资金"]);
  const outflow = pickMarketNumber(row, ["资金流出", "流出资金"]);
  if (inflow !== null && outflow !== null) return Math.abs(inflow) + Math.abs(outflow);
  const price = asMarketNumber(pickExact(row, ["最新价"]) ?? pickByPrefix(row, ["收盘价_前复权", "收盘价", "最新价"]));
  const volume = pickMarketNumber(row, ["成交量"]);
  if (price !== null && volume !== null) return price * volume;
  return null;
}

function deriveSuperInflow(row, mainInflow, largeInflow) {
  const direct = pickMarketNumber(row, ["特大单净买入额", "超大单净流入", "超大单净额", "超大单资金流向"]);
  if (direct !== null) return direct;
  if (mainInflow !== null && largeInflow !== null) {
    const sameDirection = Math.sign(mainInflow) === Math.sign(largeInflow) || mainInflow === 0 || largeInflow === 0;
    return sameDirection ? mainInflow * 0.45 : mainInflow * 0.35;
  }
  return mainInflow !== null ? mainInflow * 0.45 : null;
}

function deriveLargeInflow(row, mainInflow) {
  const direct = pickMarketNumber(row, ["dde大单净额", "大单净流入", "大单净额"], ["特大单", "超大单"]);
  if (direct !== null) return direct;
  return mainInflow !== null ? mainInflow * 0.5 : null;
}

function deriveDdeNetVolume(row) {
  return pickMarketNumber(row, ["dde大单净量", "大单净买入量", "大单净量"]);
}

function deriveLargeOrderAmount(row, amount, largeInflow) {
  const direct = pickMarketNumber(row, ["大单总额", "大单金额", "大单成交额", "大单资金"]);
  if (direct !== null) return direct;
  if (largeInflow !== null) return Math.abs(largeInflow);
  return amount !== null ? amount * 0.18 : null;
}

function dateFromMetricKey(key) {
  const matched = String(key).match(/\[(\d{8})(?:-\d{8})?\]/);
  return matched ? matched[1] : "";
}

function pickLatestByPrefix(row, prefixes, exclude = []) {
  const matches = Object.keys(row)
    .filter((key) => {
      if (exclude.some((part) => key.includes(part))) return false;
      return prefixes.some((prefix) => key === prefix || key.startsWith(`${prefix}[`) || key.startsWith(`${prefix}_`));
    })
    .sort((a, b) => dateFromMetricKey(b).localeCompare(dateFromMetricKey(a)));
  return matches.length ? row[matches[0]] : null;
}

function pickLatestMarketNumber(row, prefixes, exclude = []) {
  return asMarketNumber(pickLatestByPrefix(row, prefixes, exclude));
}

function resolveHithinkAstockCli() {
  if (process.env.HITHINK_ASTOCK_CLI) return process.env.HITHINK_ASTOCK_CLI;
  const home = process.env.HOME || "";
  const codexSkillCli = path.join(home, ".codex", "skills", "hithink-astock-selector", "scripts", "cli.py");
  if (home && fs.existsSync(codexSkillCli)) return codexSkillCli;
  return "hithink-astock-cli";
}

function hithinkRowToEastmoney(row) {
  const rawCode = String(pickExact(row, ["股票代码", "代码"]) || "").trim();
  const codeMatch = rawCode.match(/^(\d{6})(?:\.(SH|SZ|BJ))?/i);
  const code = codeMatch?.[1] || "";
  if (!code) return null;
  const suffix = (codeMatch?.[2] || (code.startsWith("6") ? "SH" : "SZ")).toUpperCase();
  const amount = deriveAmount(row);
  const mainInflow = pickMarketNumber(row, ["主力资金流向", "主力净流入", "主力净额"]);
  const largeInflow = deriveLargeInflow(row, mainInflow);
  const superInflow = deriveSuperInflow(row, mainInflow, largeInflow);
  const ddeNetVolume = deriveDdeNetVolume(row);
  const largeOrderAmount = deriveLargeOrderAmount(row, amount, largeInflow);
  if ([amount, mainInflow, superInflow, largeInflow].some((value) => value === null)) return null;
  return {
    f12: code,
    f13: suffix === "SH" ? 1 : 0,
    f14: String(pickExact(row, ["股票简称", "股票名称", "名称", "简称"]) || ""),
    f2: asMarketNumber(pickExact(row, ["最新价"]) ?? pickByPrefix(row, ["收盘价_前复权", "收盘价", "最新价"])),
    f3: asMarketNumber(pickExact(row, ["最新涨跌幅"]) ?? pickByPrefix(row, ["涨跌幅", "最新涨跌幅"])),
    f6: amount,
    f7: asMarketNumber(pickByPrefix(row, ["振幅"])),
    f8: asMarketNumber(pickByPrefix(row, ["换手率"])),
    f10: asMarketNumber(pickByPrefix(row, ["量比"])),
    f62: mainInflow,
    f66: superInflow,
    f69: amount ? (superInflow / amount) * 100 : 0,
    f72: largeInflow,
    f75: amount ? (largeInflow / amount) * 100 : 0,
    ddeNetAmount: largeInflow,
    ddeNetVolume,
    largeOrderAmount,
    largeOrderPct: amount && largeOrderAmount !== null ? (largeOrderAmount / amount) * 100 : null
  };
}

function hithinkRowToHotStock(row) {
  const quote = hithinkRowToLooseQuote(row);
  if (!quote) return null;
  const normalized = normalizeLoose(quote);
  const rawCode = String(pickExact(row, ["股票代码", "代码"]) || "");
  const suffix = rawCode.match(/\.(SH|SZ|BJ)/i)?.[1]?.toUpperCase() || normalized.exchange;
  const sector = matchSyntheticSectors(normalized)[0];
  const conceptMeta = extractConcepts(row, sector.name, normalized.name);
  return {
    ...normalized,
    exchange: suffix === "BJ" ? "BJ" : normalized.exchange,
    heatRank: asMarketNumber(pickByPrefix(row, ["个股热度排名", "热度排名"]) ?? pickExact(row, ["__heatRank"])),
    heatValue: asMarketNumber(pickByPrefix(row, ["个股热度", "热度"], ["排名"])),
    xueqiuRank: asMarketNumber(pickExact(row, ["__xueqiuRank"])),
    xueqiuHeatValue: asMarketNumber(pickExact(row, ["__xueqiuHeatValue"])),
    xueqiuRankChange: asMarketNumber(pickExact(row, ["__xueqiuRankChange"])),
    xueqiuFollowers: asMarketNumber(pickExact(row, ["__xueqiuFollowers"])),
    sectorCode: sector.code,
    sectorName: sector.name,
    concepts: conceptMeta.concepts,
    conceptNote: conceptMeta.concepts.join("/"),
    conceptSource: conceptMeta.source,
    raw: row
  };
}

function extractConcepts(row, sectorName, stockName) {
  const rawConcepts =
    pickByPrefix(row, ["所属概念", "热门概念", "题材概念", "同花顺概念", "概念题材"]) ||
    pickExact(row, ["所属同花顺行业"]);
  const values = Array.isArray(rawConcepts)
    ? rawConcepts
    : String(rawConcepts || "")
        .split(/[、,，/|;；\s]+/)
        .filter(Boolean);
  const noisy = /融资融券|沪股通|深股通|转融券|标普|富时罗素|MSCI|同花顺|预增|年报|摘帽|参股|股权转让/;
  const selected = [...new Set(values.map((item) => String(item).trim()).filter((item) => item && !noisy.test(item)))]
    .sort((a, b) => conceptPriority(b, sectorName, stockName) - conceptPriority(a, sectorName, stockName))
    .slice(0, 3);
  if (selected.length) return { concepts: selected, source: "同花顺问财" };
  return { concepts: fallbackConcepts(sectorName, stockName), source: "本地映射" };
}

function conceptPriority(value, sectorName, stockName) {
  let score = 0;
  if (/AI|人工智能|算力|CPO|光模块|HBM|先进封装|存储|芯片|半导体|机器人|绿色电力|核电|风电|储能|黄金|铜|铝|PCB|液冷/.test(value)) score += 6;
  if (sectorName && value.includes(sectorName.slice(0, 2))) score += 3;
  if (stockName && value.includes(stockName)) score -= 2;
  if (value.length <= 8) score += 1;
  return score;
}

function fallbackConcepts(sectorName, stockName = "") {
  if (/半导体|芯片/.test(sectorName)) return ["先进封装", "存储芯片", "国产替代"];
  if (/面板/.test(sectorName)) return ["面板显示", "OLED", "消费电子"];
  if (/电力|能源/.test(sectorName)) return ["绿色电力", "火电", "央企改革"];
  if (/PCB/.test(sectorName)) return ["PCB", "AI服务器", "高速铜连接"];
  if (/AI算力|光模块/.test(sectorName)) return ["AI算力", "CPO", "光模块"];
  if (/消费电子/.test(sectorName)) return ["消费电子", "AI终端", "苹果概念"];
  if (/机器人/.test(sectorName)) return ["机器人", "减速器", "执行器"];
  if (/新能源/.test(sectorName)) return ["新能源车", "智能驾驶", "汽车电子"];
  if (/电池|光伏/.test(sectorName)) return ["储能", "锂电池", "光伏"];
  if (/有色/.test(sectorName)) return ["黄金", "铜铝", "小金属"];
  if (/软件/.test(sectorName)) return ["AI应用", "国产软件", "数据要素"];
  if (/传媒/.test(sectorName)) return ["游戏", "短剧", "IP经济"];
  if (/医药/.test(sectorName)) return ["创新药", "医疗器械", "CRO"];
  if (/白酒|消费/.test(sectorName)) return ["大消费", "白酒", "食品饮料"];
  if (/低空|军工/.test(sectorName)) return ["低空经济", "无人机", "军工"];
  if (/地产|基建/.test(sectorName)) return ["地产链", "基建", "水泥"];
  if (/证券|金融/.test(sectorName)) return ["券商", "财富管理", "金融科技"];
  return stockName ? [sectorName || "活跃题材", "资金关注", "热度上榜"] : [sectorName || "活跃题材"];
}

function hithinkRowToLooseQuote(row) {
  const rawCode = String(pickExact(row, ["股票代码", "代码"]) || "").trim();
  const codeMatch = rawCode.match(/^(\d{6})(?:\.(SH|SZ|BJ))?/i);
  const code = codeMatch?.[1] || "";
  if (!code) return null;
  const suffix = (codeMatch?.[2] || (code.startsWith("6") ? "SH" : "SZ")).toUpperCase();
  const amount = deriveAmount(row);
  const mainInflow = pickMarketNumber(row, ["主力资金流向", "主力净流入", "主力净额"]);
  const largeInflow = deriveLargeInflow(row, mainInflow);
  const superInflow = deriveSuperInflow(row, mainInflow, largeInflow);
  const ddeNetVolume = deriveDdeNetVolume(row);
  const largeOrderAmount = deriveLargeOrderAmount(row, amount, largeInflow);
  return {
    f12: code,
    f13: suffix === "SH" ? 1 : 0,
    f14: String(pickExact(row, ["股票简称", "股票名称", "名称", "简称"]) || ""),
    f2: asMarketNumber(pickExact(row, ["最新价"]) ?? pickByPrefix(row, ["收盘价_前复权", "收盘价", "最新价"])),
    f3: asMarketNumber(pickExact(row, ["最新涨跌幅"]) ?? pickByPrefix(row, ["涨跌幅", "最新涨跌幅"])),
    f6: amount,
    f7: asMarketNumber(pickByPrefix(row, ["振幅"])),
    f8: asMarketNumber(pickByPrefix(row, ["换手率"])),
    f10: asMarketNumber(pickByPrefix(row, ["量比"])),
    f62: mainInflow,
    f66: superInflow,
    f69: amount && superInflow !== null ? (superInflow / amount) * 100 : null,
    f72: largeInflow,
    f75: amount && largeInflow !== null ? (largeInflow / amount) * 100 : null,
    ddeNetAmount: largeInflow,
    ddeNetVolume,
    largeOrderAmount,
    largeOrderPct: amount && largeOrderAmount !== null ? (largeOrderAmount / amount) * 100 : null
  };
}

function normalizeLoose(row) {
  return {
    code: String(row.f12 || ""),
    name: String(row.f14 || ""),
    exchange: row.f13 === 1 ? "SH" : "SZ",
    price: asNumber(row.f2),
    changePct: asNumber(row.f3),
    amount: asNumber(row.f6),
    amplitude: asNumber(row.f7),
    turnover: asNumber(row.f8),
    volumeRatio: asNumber(row.f10),
    mainInflow: asNumber(row.f62),
    superInflow: asNumber(row.f66),
    superPct: asNumber(row.f69),
    largeInflow: asNumber(row.f72),
    largePct: asNumber(row.f75),
    ddeNetAmount: asNumber(row.ddeNetAmount ?? row.f72),
    ddeNetVolume: asNumber(row.ddeNetVolume),
    largeOrderAmount: asNumber(row.largeOrderAmount),
    largeOrderPct: asNumber(row.largeOrderPct)
  };
}

function normalize(row) {
  const parsed = {
    code: String(row.f12 || ""),
    name: String(row.f14 || ""),
    exchange: row.f13 === 1 ? "SH" : "SZ",
    price: asNumber(row.f2),
    changePct: asNumber(row.f3),
    amount: asNumber(row.f6),
    amplitude: asNumber(row.f7),
    turnover: asNumber(row.f8),
    volumeRatio: asNumber(row.f10),
    mainInflow: asNumber(row.f62),
    superInflow: asNumber(row.f66),
    superPct: asNumber(row.f69),
    largeInflow: asNumber(row.f72),
    largePct: asNumber(row.f75),
    ddeNetAmount: asNumber(row.ddeNetAmount ?? row.f72),
    ddeNetVolume: asNumber(row.ddeNetVolume),
    largeOrderAmount: asNumber(row.largeOrderAmount),
    largeOrderPct: asNumber(row.largeOrderPct)
  };
  const requiredFields = ["price", "changePct", "amount", "amplitude", "turnover", "volumeRatio", "mainInflow", "superInflow", "superPct", "largeInflow", "largePct"];
  const complete = requiredFields.every((key) => parsed[key] !== null);
  return complete ? parsed : null;
}

function normalizeBoard(row) {
  const up = asNumber(row.f104) || 0;
  const down = asNumber(row.f105) || 0;
  const flat = asNumber(row.f106) || 0;
  const members = up + down + flat;
  const parsed = {
    code: String(row.f12 || ""),
    name: String(row.f14 || ""),
    price: asNumber(row.f2),
    changePct: asNumber(row.f3),
    amount: asNumber(row.f6),
    volumeRatio: asNumber(row.f10),
    mainInflow: asNumber(row.f62),
    superInflow: asNumber(row.f66),
    superPct: asNumber(row.f69),
    largeInflow: asNumber(row.f72),
    largePct: asNumber(row.f75),
    mainPct: asNumber(row.f184),
    leaderName: String(row.f204 || ""),
    leaderCode: String(row.f205 || ""),
    upCount: up,
    downCount: down,
    flatCount: flat,
    upRatio: members ? up / members : 0
  };
  const complete = ["price", "changePct", "amount", "volumeRatio", "mainInflow", "superInflow", "mainPct"].every(
    (key) => parsed[key] !== null
  );
  return complete ? parsed : null;
}

function scoreLevel2Activity(row, maxScore = 10) {
  const amount = row.amount || 0;
  const ddeAmountPct = amount && Number.isFinite(row.ddeNetAmount) ? (row.ddeNetAmount / amount) * 100 : row.largePct;
  const largeActivityPct = amount && Number.isFinite(row.largeOrderAmount) ? (row.largeOrderAmount / amount) * 100 : row.largeOrderPct;
  const ddeAmountScore = scale(ddeAmountPct, -6, 10, 0, maxScore * 0.46);
  const largeActivityScore = scale(largeActivityPct, 4, 45, 0, maxScore * 0.34);
  const volumeScore = scale(Math.abs(row.ddeNetVolume || 0), 0, 10_000_000, 0, maxScore * 0.2);
  return clamp(ddeAmountScore + largeActivityScore + volumeScore, 0, maxScore);
}

function scoreStock(row) {
  let score = 0;
  score += Math.min(row.mainInflow / 100_000_000, 12) * 2;
  score += Math.max(row.superPct, 0) * 1.2;
  score += Math.max(row.largePct, 0) * 1;
  score += scoreLevel2Activity(row, 8);
  score += Math.min(row.volumeRatio, 3) * 3;
  score += Math.max(0, 8 - Math.abs(row.changePct - 2.5)) * 0.8;
  score += Math.max(0, 6 - row.amplitude) * 0.7;
  if (row.turnover >= 0.5 && row.turnover <= 6) score += 3;
  if (row.changePct > 6) score -= 5;
  return Number(score.toFixed(2));
}

function keep(row, params) {
  if (!row || row.name.toUpperCase().includes("ST")) return false;
  if (row.price <= 0) return false;
  if (row.amount < params.minAmount) return false;
  if (row.changePct < params.minChange || row.changePct > params.maxChange) return false;
  if (row.volumeRatio < params.minVolumeRatio) return false;
  if (row.amplitude > params.maxAmplitude) return false;
  if (row.mainInflow <= params.minMainInflow) return false;
  return true;
}

function parseParams(url) {
  const query = url.searchParams;
  return {
    limit: clampNumber(query.get("limit"), 1, 200, 30),
    minAmount: clampNumber(query.get("minAmount"), 0, 100_000_000_000, 800_000_000),
    minChange: clampNumber(query.get("minChange"), -20, 20, -1),
    maxChange: clampNumber(query.get("maxChange"), -20, 20, 8),
    minVolumeRatio: clampNumber(query.get("minVolumeRatio"), 0, 20, 1.2),
    maxAmplitude: clampNumber(query.get("maxAmplitude"), 0, 30, 9),
    minMainInflow: clampNumber(query.get("minMainInflow"), -10_000_000_000, 10_000_000_000, 0)
  };
}

function clampNumber(value, min, max, fallback) {
  if (value === null || value === "") return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function classify(row) {
  if (row.changePct > 6 || row.amplitude > 7.5) return "进攻";
  if ((row.ddeNetAmount || 0) > 0 && (row.ddeNetVolume || 0) > 0 && (row.largeOrderPct || 0) >= 18) return "大单增强";
  if (row.largeInflow < 0 && row.superInflow > 0) return "分歧";
  if (row.mainInflow > 0 && row.superInflow > 0 && row.largeInflow > 0) return "强承接";
  return "观察";
}

function explain(row) {
  const pieces = [];
  if (row.volumeRatio >= 2) pieces.push("量比放大");
  if (row.mainInflow > 0) pieces.push("主力净额为正");
  if (row.superInflow > 0) pieces.push("超大单主动性强");
  if (row.largeInflow > 0) pieces.push("大单跟随");
  if ((row.ddeNetAmount || 0) > 0) pieces.push(`DDE大单${moneyShort(row.ddeNetAmount)}`);
  if ((row.largeOrderAmount || 0) > 0) pieces.push(`大单总额${moneyShort(row.largeOrderAmount)}`);
  if (row.amplitude <= 4) pieces.push("振幅克制");
  if (row.changePct > 5) pieces.push("短线加速");
  if (row.largeInflow < 0 && row.superInflow > 0) pieces.push("超大单与大单分歧");
  return pieces.slice(0, 4).join("，");
}

function riskLine(row) {
  const level = row.changePct > 6 || row.amplitude > 8 ? "高波动" : "正常";
  const invalid = Math.max(row.price * (1 - Math.min(Math.max(row.amplitude, 3), 9) / 200), 0);
  return `${level}；关注 ${invalid.toFixed(2)} 附近承接`;
}

function buildTradePlan(row, chip = null) {
  const score = tradeSignalScore(row);
  const tier = tradeSignalTier(row, score);
  const riskLines = tradeRiskLines(row, chip);
  const riskAction = tradeRiskStatus(row, riskLines, chip);
  const entryAction = tradeEntryAction(row, tier, chip, riskLines);
  const holdAction = tradeHoldAction(row, tier, chip, riskAction);
  const addPositionAction = tradeAddPositionAction(row, tier, chip, riskAction, entryAction);
  const position = tradePosition(row, tier, riskLines, entryAction, holdAction, addPositionAction, riskAction);
  const buyLogic = tradeBuyLogic(row, entryAction, riskLines, chip);
  const sellLogic = tradeSellLogic(row, holdAction, riskAction, chip);
  const addLogic = tradeAddLogic(row, tier, addPositionAction);
  const riskPlan = tradeRiskPlan(row, riskLines, riskAction);
  const sellRules = tradeSellRules(row, chip, riskAction);
  const buyPoints = tradeBuyPoints(row, entryAction, riskLines);
  const primaryAction = riskAction === "破线卖出" ? "破线卖出" : entryAction;
  const operationText = tradeOperationText(entryAction, holdAction, addPositionAction, riskAction);
  return {
    signalTier: tier,
    action: primaryAction,
    entryAction,
    holdAction,
    positionAction: position.hint,
    addPositionAction,
    riskAction,
    primaryAction,
    operationText,
    buyPointType: entryAction,
    positionHint: position.hint,
    riskLineStatus: riskAction,
    score: Number(score.toFixed(2)),
    buyPoints,
    sellRules,
    buyLogic,
    sellLogic,
    addLogic,
    position,
    riskLines,
    riskPlan,
    summary: tradePlanSummary(tier, primaryAction, position.hint, riskAction)
  };
}

function tradeSignalScore(row) {
  return firstFinite(row.watchScore, row.totalScore, row.breakoutScore, row.score, 0) || 0;
}

function tradeSignalTier(row, score) {
  const positiveFlow = isTradePositiveFlow(row);
  const strongDde = (row.ddeNetAmount || 0) > 0;
  const fresh = row.isConfluence || row.breakoutStage === "刚起爆" || row.stage === "刚起爆";
  if (score >= 80 && positiveFlow && strongDde && fresh) return "A类";
  if (score >= 80 && positiveFlow && strongDde && row.grade === "强关注") return "A类";
  if (score >= 65 && (positiveFlow || strongDde || row.breakoutStage === "升温" || row.stage === "升温")) return "B类";
  return "C类";
}

function isTradePositiveFlow(row) {
  return (row.mainInflow || 0) > 0 && (row.superInflow || 0) > 0;
}

function tradeEntryAction(row, tier, chip, riskLines) {
  if (tradeInvalidated(row, chip)) return "先不买";
  if (nearPressure(row, chip) || tradeOverheated(row)) return "等回踩买";
  if (tradeBreakoutConfirmed(row, chip)) return "突破买";
  if (tradeSupportConfirmed(row, chip)) return "承接区低吸";
  if (tradePullbackConfirmed(row, chip, riskLines)) return "试买";
  if (tier === "A类") {
    const directBuy = (row.changePct || 0) <= 5 && (row.amplitude || 0) <= 8 && isTradePositiveFlow(row) && (row.ddeNetAmount || 0) > 0;
    return directBuy ? "试买" : "等回踩买";
  }
  if (tier === "B类") return "等回踩买";
  return "先不买";
}

function tradeHoldAction(row, tier, chip, riskAction) {
  if (riskAction === "破线卖出") return "清仓";
  if (riskAction === "压力位减仓" || tradeOverheated(row)) return "减仓";
  if (tier === "C类") return "清仓";
  return "持有";
}

function tradeBreakoutConfirmed(row, chip) {
  return (
    Number.isFinite(chip?.costHigh) &&
    Number.isFinite(row.price) &&
    row.price > chip.costHigh * 1.005 &&
    (row.volumeRatio || 0) >= 1.6 &&
    isTradePositiveFlow(row) &&
    (row.ddeNetAmount || 0) > 0
  );
}

function tradeSupportConfirmed(row, chip) {
  return (
    Number.isFinite(chip?.support) &&
    Number.isFinite(row.price) &&
    row.price <= chip.support * 1.03 &&
    isTwoOfThreeMoneyPositive(row) &&
    !tradeInvalidated(row, chip)
  );
}

function tradePullbackConfirmed(row, chip, riskLines) {
  if (!Number.isFinite(row.price)) return false;
  const targets = [chip?.costHigh, chip?.support, riskLineNumber(row)]
    .filter(Number.isFinite)
    .filter((value) => value > 0);
  if (!targets.length) return false;
  const nearestDistance = Math.min(...targets.map((value) => Math.abs(row.price - value) / row.price));
  return nearestDistance <= 0.008 && isTwoOfThreeMoneyPositive(row) && (row.volumeRatio || 0) >= 1.1 && !tradeInvalidated(row, chip);
}

function isTwoOfThreeMoneyPositive(row) {
  return [
    (row.mainInflow || 0) > 0,
    (row.superInflow || 0) > 0,
    (row.ddeNetAmount || 0) > 0
  ].filter(Boolean).length >= 2;
}

function tradeInvalidated(row, chip) {
  if (Number.isFinite(chip?.invalid) && Number.isFinite(row.price) && row.price < chip.invalid) return true;
  if (Number.isFinite(chip?.support) && Number.isFinite(row.price) && row.price < chip.support * 0.985) return true;
  if ((row.mainInflow || 0) < 0 && (row.superInflow || 0) < 0 && (row.ddeNetAmount || 0) < 0) return true;
  return false;
}

function nearPressure(row, chip) {
  return Number.isFinite(chip?.pressure) && Number.isFinite(row.price) && row.price >= chip.pressure * 0.98;
}

function tradeOverheated(row) {
  return (row.changePct || 0) > 7 || (row.amplitude || 0) > 10;
}

function tradeRiskLines(row, chip) {
  const entry = entryRiskLine(row);
  const structural = Number.isFinite(chip?.support)
    ? `${priceText(chip.support)} 下方承接区`
    : row.riskLine || row.risk || "待确认";
  const hardInvalidValue = firstFinite(
    chip?.invalid,
    Number.isFinite(chip?.support) ? chip.support * 0.985 : null,
    riskLineNumber(row),
    Number.isFinite(row.price) ? row.price * 0.96 : null
  );
  return {
    entry,
    structural,
    hardInvalid: Number.isFinite(hardInvalidValue) ? `${priceText(hardInvalidValue)} 硬失效` : "待确认",
    hardInvalidValue: Number.isFinite(hardInvalidValue) ? Number(hardInvalidValue.toFixed(3)) : null,
    source: chip?.source ? `${chip.source} + 当前盘口字段` : "当前盘口字段 + 暗盘资金模型"
  };
}

function entryRiskLine(row) {
  if (row.breakoutStage === "刚起爆" || row.stage === "刚起爆") return "分时均价线或日内平台低点";
  if (row.breakoutStage === "升温" || row.stage === "升温") return "日内平台低点";
  return row.riskLine || row.risk || "待确认";
}

function riskLineNumber(row) {
  const text = String(row.riskLine || row.risk || "");
  const matched = text.match(/(\d+(?:\.\d+)?)/);
  if (matched) return Number(matched[1]);
  return null;
}

function tradeRiskStatus(row, riskLines, chip) {
  if (tradeInvalidated(row, chip)) return "破线卖出";
  if (Number.isFinite(riskLines.hardInvalidValue) && Number.isFinite(row.price)) {
    const distance = (row.price - riskLines.hardInvalidValue) / row.price;
    if (distance <= 0.015) return "盯紧止损";
  }
  if (nearPressure(row, chip)) return "压力位减仓";
  return "守风险线";
}

function tradeAddPositionAction(row, tier, chip, riskAction, entryAction) {
  if (riskAction === "破线卖出" || riskAction === "压力位减仓" || tradeOverheated(row) || entryAction === "先不买") return "不加仓";
  if (tier === "A类" && tradeAddConfirmed(row, chip, 80, 0.02)) return "可加到20%";
  if (tier === "B类" && tradeAddConfirmed(row, chip, 65, 0)) return "可加到10%";
  return "首仓后确认";
}

function tradeAddConfirmed(row, chip, minScore, minProfit) {
  const score = tradeSignalScore(row);
  const floatingProfit = firstFinite(row.floatingProfitPct, row.currentProfitPct, row.profitPct, null);
  const profitConfirmed = Number.isFinite(floatingProfit) ? floatingProfit >= minProfit * 100 : false;
  return (
    score >= minScore &&
    isTradePositiveFlow(row) &&
    (row.ddeNetAmount || 0) > 0 &&
    (row.breakoutStage === "刚起爆" || row.breakoutStage === "升温" || row.stage === "刚起爆" || row.stage === "升温" || row.grade === "强关注") &&
    !nearPressure(row, chip) &&
    profitConfirmed
  );
}

function tradePosition(row, tier, riskLines, entryAction, holdAction, addPositionAction, riskAction) {
  const empty = {
    basis: "account",
    initialPct: 0,
    addToPct: 0,
    maxPct: 0,
    singleStockCapPct: 0,
    hint: "空仓",
    addHint: "不加仓",
    accountAmount: null,
    initialAmount: null,
    addToAmount: null,
    riskBudgetPct: 0,
    riskBudgetPositionPct: 0
  };
  if (riskAction === "破线卖出" || holdAction === "清仓" || entryAction === "先不买") return empty;
  if (holdAction === "减仓" || addPositionAction === "不加仓") {
    return {
      ...empty,
      hint: "不加仓",
      singleStockCapPct: 0,
      addHint: "不加仓"
    };
  }
  const caps = {
    "A类": { initialPct: 0.1, addToPct: 0.2, maxPct: 0.2, singleStockCapPct: 0.2, hint: "首仓10%" },
    "B类": { initialPct: 0.05, addToPct: 0.1, maxPct: 0.1, singleStockCapPct: 0.1, hint: "首仓5%" },
    "C类": { initialPct: 0, addToPct: 0, maxPct: 0, singleStockCapPct: 0, hint: "空仓" }
  };
  const base = caps[tier] || caps["C类"];
  const riskBudgetPct = tier === "A类" ? 0.004 : tier === "B类" ? 0.0025 : 0;
  const price = row.price;
  const hardInvalid = riskLines.hardInvalidValue;
  let riskBudgetPositionPct = base.singleStockCapPct;
  if (Number.isFinite(price) && Number.isFinite(hardInvalid) && price > hardInvalid && riskBudgetPct > 0) {
    const riskDistancePct = (price - hardInvalid) / price;
    riskBudgetPositionPct = Math.min(base.singleStockCapPct, riskBudgetPct / Math.max(riskDistancePct, 0.001));
  }
  return {
    basis: "account",
    ...base,
    addHint: addPositionAction,
    accountAmount: null,
    initialAmount: null,
    addToAmount: null,
    riskBudgetPct,
    riskBudgetPositionPct: Number(riskBudgetPositionPct.toFixed(4)),
    initialPct: Number(base.initialPct.toFixed(2)),
    addToPct: Number(base.addToPct.toFixed(2)),
    maxPct: Number(base.maxPct.toFixed(2)),
    singleStockCapPct: Number(base.singleStockCapPct.toFixed(2))
  };
}

function tradeSellRules(row, chip, riskStatus) {
  const rules = [];
  if (nearPressure(row, chip) || tradeOverheated(row)) {
    rules.push({ type: "减仓", trigger: "接近压力区、涨幅或振幅偏高", action: "分批卖出" });
  }
  if (isTradePositiveFlow(row) && (row.ddeNetAmount || 0) > 0 && riskStatus === "守风险线") {
    rules.push({ type: "持有", trigger: "资金双正且DDE大单为正", action: "持有到风险线破位" });
  }
  rules.push({ type: "止损", trigger: "跌破硬失效线或资金三项转负", action: "破线卖出" });
  rules.push({ type: "撤单", trigger: "3日未放量上攻或5日盯盘分持续下降", action: "取消加仓" });
  return rules;
}

function tradeBuyPoints(row, buyPointType, riskLines) {
  const map = {
    "试买": "回踩均价线、日内平台或成本区后缩量企稳，资金至少两项为正",
    "等回踩买": "等待分时均价线、日内平台、大单成本区或下方承接区确认",
    "突破买": "放量突破成本区上沿或日内平台，资金双正维持",
    "承接区低吸": "靠近下方承接区后快速收回，主力和超大单保持为正",
    "先不买": "等待资金回正、风险线重新收复或起爆信号恢复"
  };
  return [{
    type: buyPointType,
    trigger: map[buyPointType] || map["等回踩买"],
    riskLine: riskLines.entry
  }];
}

function tradeBuyLogic(row, entryAction, riskLines, chip) {
  const pullbackTargets = [
    "分时均价线",
    "日内平台低点",
    Number.isFinite(chip?.costHigh) ? `${priceText(chip.costHigh)} 大单成本区上沿` : "大单成本区上沿/成本区内",
    Number.isFinite(chip?.support) ? `${priceText(chip.support)} 下方承接区` : "下方承接区"
  ];
  if (entryAction === "试买") {
    return [
      "盯盘分达到A类或回踩确认条件",
      "主力、超大单、DDE至少两项为正",
      "涨幅不透支，振幅可控",
      `买点失效线：${riskLines.entry}`
    ];
  }
  if (entryAction === "等回踩买") {
    return [
      `回踩位置：${pullbackTargets.join(" → ")}`,
      "当前价距离目标位0.8%以内后观察缩量承接",
      "重新站回均价线或平台位后升级为买入",
      "资金至少两项为正，硬止损线保持有效"
    ];
  }
  if (entryAction === "突破买") {
    return [
      "放量突破日内平台或成本区上沿",
      "突破后回踩平台不破",
      "资金双正和DDE大单为正",
      "板块保持强势或升温"
    ];
  }
  if (entryAction === "承接区低吸") {
    return [
      "价格回踩下方承接区或成本区内企稳",
      "缩量回踩后快速收回",
      "主力、超大单、DDE至少两项为正",
      `结构风险线：${riskLines.structural}`
    ];
  }
  return [
    "资金三项偏弱或结构风险线已破",
    "等待主力、超大单、DDE重新转强",
    "等待起爆阶段或热度排名恢复",
    `硬止损线：${riskLines.hardInvalid}`
  ];
}

function tradeSellLogic(row, holdAction, riskAction, chip) {
  const rules = [];
  if (holdAction === "持有") rules.push("价格在大单成本区上方且资金三项保持正向时持有");
  if (holdAction === "减仓") rules.push("接近压力区、涨幅超过7%或振幅超过10%时减仓");
  if (holdAction === "清仓") rules.push("跌破硬止损线、下方承接区失守或资金三项转负时清仓");
  rules.push("分时跌破均价线后反抽无量，降低仓位");
  rules.push("热度排名快速回落或起爆阶段降级，收紧风控");
  if (riskAction === "压力位减仓" && Number.isFinite(chip?.pressure)) rules.push(`压力区参考：${priceText(chip.pressure)}`);
  return rules;
}

function tradeAddLogic(row, tier, addPositionAction) {
  if (addPositionAction === "可加到20%") {
    return [
      "已持有A类首仓",
      "价格站稳买点上方",
      "主力、超大单、DDE继续为正",
      "盯盘分维持80分以上，浮盈约2%以上"
    ];
  }
  if (addPositionAction === "可加到10%") {
    return [
      "已持有B类首仓",
      "回踩确认完成",
      "资金至少两项为正",
      "盯盘分维持65分以上，风险线未破"
    ];
  }
  if (addPositionAction === "首仓后确认") {
    return [
      tier === "A类" ? "先按账户总资金10%建立首仓" : "先按账户总资金5%建立首仓",
      "买入后站稳买点上方再评估加仓",
      "接近压力区时停止加仓"
    ];
  }
  return ["当前不加仓，优先执行风控或等待新买点"];
}

function tradeRiskPlan(row, riskLines, riskAction) {
  return {
    entryInvalidLine: riskLines.entry,
    structuralRiskLine: riskLines.structural,
    hardStopLine: riskLines.hardInvalid,
    hardStopValue: riskLines.hardInvalidValue,
    action: riskAction,
    invalidCondition: riskAction === "破线卖出"
      ? "跌破硬止损线或资金三项转负"
      : "跌破买点失效线后观察能否快速收回"
  };
}

function tradeOperationText(entryAction, holdAction, addPositionAction, riskAction) {
  const entryMap = {
    "试买": "回踩均线或平台确认后试买",
    "等回踩买": "等待回踩到均价线、平台位或成本区",
    "突破买": "放量突破平台后回踩不破再买",
    "承接区低吸": "回踩承接区企稳后低吸",
    "先不买": "等待资金和结构重新转强"
  };
  const holdMap = {
    "持有": "守风险线持有",
    "减仓": "接近压力位或资金转弱先减仓",
    "清仓": "破线或资金三项转负清仓"
  };
  return `未持仓：${entryMap[entryAction] || "等待确认"}；已持仓：${holdMap[holdAction] || "按风险线处理"}；加仓：${addPositionAction}；风控：${riskAction}`;
}

function tradePlanSummary(tier, action, positionHint, riskStatus) {
  return `${tier} · ${action} · ${positionHint} · ${riskStatus}`;
}

function attachTradePlan(row, chip = null) {
  const tradePlan = buildTradePlan(row, chip);
  return {
    ...row,
    tradePlan,
    tradeAction: tradePlan.primaryAction,
    entryAction: tradePlan.entryAction,
    holdAction: tradePlan.holdAction,
    positionAction: tradePlan.positionAction,
    addPositionAction: tradePlan.addPositionAction,
    riskAction: tradePlan.riskAction,
    operationText: tradePlan.operationText,
    positionHint: tradePlan.positionHint,
    buyPointType: tradePlan.buyPointType,
    riskLineStatus: tradePlan.riskLineStatus,
    signalTier: tradePlan.signalTier
  };
}

function parseKlines(payload) {
  const lines = payload?.data?.klines;
  if (!Array.isArray(lines)) return [];
  return lines
    .map((line) => {
      const [date, open, close, high, low, volume, amount, amplitude, changePct, changeAmount, turnover] = String(line).split(",");
      return {
        date,
        open: Number(open),
        close: Number(close),
        high: Number(high),
        low: Number(low),
        volume: Number(volume),
        amount: Number(amount),
        amplitude: Number(amplitude),
        changePct: Number(changePct),
        changeAmount: Number(changeAmount),
        turnover: Number(turnover)
      };
    })
    .filter((row) => Number.isFinite(row.close) && Number.isFinite(row.amount));
}

function parseTrends(payload) {
  const lines = payload?.data?.trends;
  if (!Array.isArray(lines)) return [];
  return lines
    .map((line) => {
      const [timeText, open, price, high, low, volume, amount, average] = String(line).split(",");
      const time = String(timeText || "").trim();
      const timestamp = trendTimestamp(time);
      return {
        time,
        timestamp,
        open: Number(open),
        price: Number(price),
        high: Number(high),
        low: Number(low),
        volume: Number(volume),
        amount: Number(amount),
        average: Number(average)
      };
    })
    .filter((row) => Number.isFinite(row.timestamp) && Number.isFinite(row.price));
}

function trendTimestamp(value) {
  const matched = String(value || "").match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})(?::(\d{2}))?$/);
  if (!matched) return NaN;
  return Math.floor(Date.parse(`${matched[1]}T${matched[2]}:${matched[3] || "00"}+08:00`) / 1000);
}

function movingAverage(rows, period) {
  const result = [];
  for (let index = period - 1; index < rows.length; index += 1) {
    const windowRows = rows.slice(index - period + 1, index + 1);
    if (!windowRows.every((row) => Number.isFinite(row.close))) continue;
    const value = windowRows.reduce((sum, row) => sum + row.close, 0) / period;
    result.push({ time: rows[index].date, value: Number(value.toFixed(3)) });
  }
  return result;
}

function exponentialMovingAverage(rows, period) {
  const result = [];
  const closes = rows.map((row) => row.close).filter(Number.isFinite);
  if (closes.length < period) return result;
  const multiplier = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  result.push({ time: rows[period - 1].date, value: Number(ema.toFixed(3)) });
  for (let index = period; index < rows.length; index += 1) {
    if (!Number.isFinite(rows[index].close)) continue;
    ema = rows[index].close * multiplier + ema * (1 - multiplier);
    result.push({ time: rows[index].date, value: Number(ema.toFixed(3)) });
  }
  return result;
}

function periodMetrics(klines, period) {
  const days = klines.slice(-period);
  const previous = klines.slice(Math.max(0, klines.length - period * 2), Math.max(0, klines.length - period));
  if (!days.length) {
    return {
      period,
      periodReturn: 0,
      avgAmount: 0,
      amountChangePct: 0,
      positiveRatio: 0,
      continuityScore: 0,
      trend: []
    };
  }
  const firstOpen = days[0].open || days[0].close;
  const lastClose = days[days.length - 1].close;
  const avgAmount = days.reduce((sum, row) => sum + row.amount, 0) / days.length;
  const previousAvg = previous.length ? previous.reduce((sum, row) => sum + row.amount, 0) / previous.length : avgAmount;
  const positiveRatio = days.filter((row) => row.changePct > 0).length / days.length;
  const amountChangePct = previousAvg ? ((avgAmount - previousAvg) / previousAvg) * 100 : 0;
  const continuityScore = Math.max(0, Math.min(20, positiveRatio * 14 + Math.min(Math.max(amountChangePct, 0), 60) / 10));
  return {
    period,
    periodReturn: firstOpen ? ((lastClose - firstOpen) / firstOpen) * 100 : 0,
    avgAmount,
    amountChangePct,
    positiveRatio,
    continuityScore,
    trend: days.map((row, index) => ({
      date: row.date,
      score: Number((50 + row.changePct * 4 + Math.min(Math.max(row.amount / Math.max(avgAmount, 1) - 1, -1), 2) * 12).toFixed(2)),
      amount: row.amount,
      changePct: row.changePct,
      rank: index + 1
    }))
  };
}

function scoreBoard(board, metrics) {
  const flowScore = Math.max(-20, Math.min(35, (board.mainPct || 0) * 3 + Math.max(board.superPct || 0, 0) * 0.8));
  const amountScore = Math.max(-10, Math.min(20, (board.volumeRatio - 1) * 12 + Math.max(metrics.amountChangePct, 0) * 0.15));
  const changeScore = Math.max(-15, Math.min(25, board.changePct * 4 + metrics.periodReturn * 0.6));
  const breadthScore = Math.max(0, Math.min(20, board.upRatio * 20));
  const continuityScore = Math.max(0, Math.min(20, metrics.continuityScore));
  return Number((50 + flowScore + amountScore + changeScore + breadthScore + continuityScore).toFixed(2));
}

function classifyBoard(board, metrics, score) {
  if (score >= 115 && board.mainInflow > 0 && board.upRatio >= 0.62) return "强势";
  if (board.mainInflow < 0 || board.upRatio < 0.38 || score < 65) return "退潮";
  if (score >= 92 && (metrics.amountChangePct > 10 || board.volumeRatio >= 1.25)) return "升温";
  return "分化";
}

function boardReason(board, metrics) {
  const pieces = [];
  if (board.mainInflow > 0) pieces.push("主力净流入为正");
  if (board.superInflow > 0) pieces.push("超大单承接");
  if (board.volumeRatio >= 1.2) pieces.push("成交额放大");
  if (board.upRatio >= 0.6) pieces.push("上涨家数占优");
  if (metrics.positiveRatio >= 0.6) pieces.push(`${metrics.period}日连续性较好`);
  return pieces.slice(0, 4).join("，") || "轮动信号偏弱";
}

function boardRisk(board, metrics) {
  if (board.changePct > 4 || metrics.amountChangePct > 60) return "高热度；关注成交额回落和龙头冲高回落";
  if (board.upRatio < 0.5) return "分化扩大；关注上涨家数能否修复";
  if (board.mainInflow < 0) return "资金转弱；关注主力净额能否回正";
  return "正常；关注排名和成交额能否延续";
}

function readBoardFlowHistory() {
  try {
    const parsed = JSON.parse(fs.readFileSync(cachePath("board-flow-history"), "utf8"));
    return Array.isArray(parsed.snapshots) ? parsed : { snapshots: [] };
  } catch {
    return { snapshots: [] };
  }
}

function writeBoardFlowHistory(history) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(cachePath("board-flow-history"), JSON.stringify(history), "utf8");
  } catch {
    // History writes are best-effort.
  }
}

function recordBoardFlowSnapshot(rows) {
  const today = tradingDateKey();
  const history = readBoardFlowHistory();
  const byFund = [...rows].sort((a, b) => (b.mainInflow || 0) - (a.mainInflow || 0));
  const snapshot = {
    date: today,
    fetchedAt: Date.now(),
    rows: byFund.map((row, index) => ({
      code: row.code,
      name: row.name,
      fundRank: index + 1,
      mainInflow: row.mainInflow || 0,
      superInflow: row.superInflow || 0,
      amount: row.amount || 0
    }))
  };
  const snapshots = history.snapshots.filter((item) => item.date !== today);
  snapshots.push(snapshot);
  writeBoardFlowHistory({ snapshots: snapshots.slice(-8) });
}

function attachOneDayFlows(rows, history = readBoardFlowHistory()) {
  const previousSnapshot = history.snapshots.filter((item) => item.date !== tradingDateKey()).at(-1);
  const byFund = [...rows].sort((a, b) => (b.mainInflow || 0) - (a.mainInflow || 0));
  const currentRanks = new Map(byFund.map((row, index) => [row.code, index + 1]));
  return rows.map((row) => {
    const previous = previousSnapshot?.rows?.find((item) => item.code === row.code);
    const currentRank = currentRanks.get(row.code) || 0;
    const fundRankChange = previous?.fundRank ? previous.fundRank - currentRank : 0;
    return {
      ...row,
      oneDayFlow: {
        estimated: true,
        mainInflow: row.mainInflow || 0,
        superInflow: row.superInflow || 0,
        amount: row.amount || 0,
        amountChangePct: row.amountChangePct || 0,
        fundRank: currentRank,
        fundRankChange
      }
    };
  });
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function scale(value, min, max, outMin, outMax) {
  if (!Number.isFinite(value) || max === min) return outMin;
  return outMin + clamp((value - min) / (max - min), 0, 1) * (outMax - outMin);
}

function moneyShort(value) {
  if (!Number.isFinite(value)) return "待确认";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 100_000_000) return `${sign}${(abs / 100_000_000).toFixed(2)}亿`;
  if (abs >= 10_000) return `${sign}${(abs / 10_000).toFixed(0)}万`;
  return `${value.toFixed(0)}`;
}

function pctShort(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)}%` : "待确认";
}

function rankChangeLabel(value) {
  if (!Number.isFinite(value)) return "待确认";
  if (value > 0) return `上升${value}`;
  if (value < 0) return `回落${Math.abs(value)}`;
  return "持平";
}

function keepHotStock(row) {
  if (!row || !row.code || !row.name) return false;
  if (row.exchange === "BJ") return false;
  if (/^(4|8|920)/.test(row.code)) return false;
  if (/^68[89]/.test(row.code)) return false;
  if (/ST|\*ST|退/.test(row.name.toUpperCase())) return false;
  if (!Number.isFinite(row.heatRank)) return false;
  if (Number.isFinite(row.price) && row.price <= 0) return false;
  if (Number.isFinite(row.amount) && row.amount < 200_000_000) return false;
  return true;
}

function buildSectorStats(rows) {
  const sectors = new Map();
  for (const row of rows) {
    if (!sectors.has(row.sectorName)) {
      sectors.set(row.sectorName, {
        name: row.sectorName,
        hotCount: 0,
        totalAmount: 0,
        totalChange: 0,
        positiveCount: 0,
        rows: []
      });
    }
    const sector = sectors.get(row.sectorName);
    sector.hotCount += 1;
    sector.totalAmount += Number.isFinite(row.amount) ? row.amount : 0;
    sector.totalChange += Number.isFinite(row.changePct) ? row.changePct : 0;
    if ((row.changePct || 0) > 0) sector.positiveCount += 1;
    sector.rows.push(row);
  }
  for (const sector of sectors.values()) {
    sector.avgChange = sector.hotCount ? sector.totalChange / sector.hotCount : 0;
    sector.upRatio = sector.hotCount ? sector.positiveCount / sector.hotCount : 0;
    const byAmount = [...sector.rows].sort((a, b) => (b.amount || 0) - (a.amount || 0));
    const byChange = [...sector.rows].sort((a, b) => (b.changePct || -100) - (a.changePct || -100));
    byAmount.forEach((row, index) => {
      row.sectorAmountRank = index + 1;
    });
    byChange.forEach((row, index) => {
      row.sectorChangeRank = index + 1;
    });
  }
  return sectors;
}

function tradingDateKey(date = new Date()) {
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
}

function readHotHistory() {
  try {
    const parsed = JSON.parse(fs.readFileSync(cachePath("hot-leaders-history"), "utf8"));
    return Array.isArray(parsed.snapshots) ? parsed : { snapshots: [] };
  } catch {
    return { snapshots: [] };
  }
}

function writeHotHistory(history) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(cachePath("hot-leaders-history"), JSON.stringify(history), "utf8");
  } catch {
    // History writes are best-effort.
  }
}

function recordHotSnapshot(rows) {
  const today = tradingDateKey();
  const history = readHotHistory();
  const parsedRows = rows.map((row, index) => hithinkRowToHotStock({ ...row, __heatRank: index + 1 })).filter(keepHotStock);
  const snapshot = {
    date: today,
    fetchedAt: Date.now(),
    rows: parsedRows.map((row) => ({
      code: row.code,
      name: row.name,
      rank: row.heatRank,
      heatValue: row.heatValue
    }))
  };
  const snapshots = history.snapshots.filter((item) => item.date !== today);
  snapshots.push(snapshot);
  writeHotHistory({ snapshots: snapshots.slice(-8) });
}

function readBreakoutHistory() {
  try {
    const parsed = JSON.parse(fs.readFileSync(cachePath("watch-breakout-history"), "utf8"));
    return Array.isArray(parsed.records) ? parsed : { records: [] };
  } catch {
    return { records: [] };
  }
}

function writeBreakoutHistory(history) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(cachePath("watch-breakout-history"), JSON.stringify(history), "utf8");
  } catch {
    // History writes are best-effort.
  }
}

function chinaDateTimeText(date = new Date()) {
  return date.toLocaleString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai" }).replace(/\//g, "-");
}

function mergeBreakoutHistoryRecords(existingRecords = [], rows = [], now = new Date()) {
  const today = tradingDateKey(now);
  const nowIso = now.toISOString();
  const nowText = chinaDateTimeText(now);
  const byCode = new Map((existingRecords || []).filter((item) => item?.code).map((item) => [item.code, item]));
  rows.filter((row) => row?.breakoutStage === "刚起爆").forEach((row) => {
    const previous = byCode.get(row.code);
    const nextCount = previous?.lastBreakoutDate === today ? previous.breakoutCount || 1 : (previous?.breakoutCount || 0) + 1;
    byCode.set(row.code, {
      code: row.code,
      exchange: row.exchange,
      name: row.name,
      sectorName: row.sectorName,
      firstBreakoutAt: previous?.firstBreakoutAt || nowIso,
      firstBreakoutText: previous?.firstBreakoutText || nowText,
      firstBreakoutDate: previous?.firstBreakoutDate || today,
      lastBreakoutAt: nowIso,
      lastBreakoutText: nowText,
      lastBreakoutDate: today,
      breakoutCount: nextCount,
      latestStage: row.breakoutStage,
      latestScore: row.breakoutScore,
      latestWatchScore: row.watchScore,
      latestPrice: row.price,
      latestChangePct: row.changePct,
      latestAmount: row.amount,
      latestVolumeRatio: row.volumeRatio,
      latestMainInflow: row.mainInflow,
      latestSuperInflow: row.superInflow,
      latestDdeNetAmount: row.ddeNetAmount,
      latestLargeOrderAmount: row.largeOrderAmount,
      latestTradeAction: row.tradeAction,
      latestEntryAction: row.entryAction,
      latestHoldAction: row.holdAction,
      latestPositionHint: row.positionHint,
      latestAddPositionAction: row.addPositionAction,
      latestBuyPointType: row.buyPointType,
      latestRiskAction: row.riskAction,
      latestRiskLineStatus: row.riskLineStatus,
      latestOperationText: row.operationText,
      latestRiskLine: row.riskLine,
      latestWatchNote: row.watchNote,
      latestTags: row.tags || []
    });
  });
  return [...byCode.values()]
    .sort((a, b) => Date.parse(b.lastBreakoutAt || 0) - Date.parse(a.lastBreakoutAt || 0))
    .slice(0, BREAKOUT_HISTORY_LIMIT);
}

function buildBreakoutHistoryPayload(records = [], currentRows = []) {
  const today = tradingDateKey();
  const currentByCode = new Map(currentRows.map((row) => [row.code, row]));
  const rows = records.slice(0, 30).map((record, index) => {
    const current = currentByCode.get(record.code);
    return {
      ...record,
      rank: index + 1,
      currentInWatchlist: Boolean(current),
      currentStage: current?.breakoutStage || record.latestStage || "历史起爆",
      currentWatchScore: current?.watchScore ?? record.latestWatchScore ?? null,
      currentTradeAction: current?.tradeAction || record.latestTradeAction || "待确认",
      currentEntryAction: current?.entryAction || record.latestEntryAction || current?.tradeAction || record.latestTradeAction || "待确认",
      currentHoldAction: current?.holdAction || record.latestHoldAction || "待确认",
      currentPositionHint: current?.positionHint || record.latestPositionHint || "待确认",
      currentAddPositionAction: current?.addPositionAction || record.latestAddPositionAction || "待确认",
      currentRiskAction: current?.riskAction || record.latestRiskAction || current?.riskLineStatus || record.latestRiskLineStatus || "待确认",
      currentRiskLineStatus: current?.riskLineStatus || record.latestRiskLineStatus || "待确认",
      currentOperationText: current?.operationText || record.latestOperationText || "",
      currentRiskLine: current?.riskLine || record.latestRiskLine || "待确认",
      currentChangePct: current?.changePct ?? record.latestChangePct ?? null,
      currentTags: current?.tags || record.latestTags || []
    };
  });
  return {
    stats: {
      total: records.length,
      today: records.filter((record) => record.lastBreakoutDate === today).length,
      current: rows.filter((record) => record.currentInWatchlist).length,
      latestTime: rows[0]?.lastBreakoutText || ""
    },
    rows
  };
}

function recordBreakoutHistory(rows = []) {
  const history = readBreakoutHistory();
  const records = mergeBreakoutHistoryRecords(history.records, rows);
  writeBreakoutHistory({ records });
  return buildBreakoutHistoryPayload(records, rows);
}

function mergeXueqiuHotRows(hithinkRows, xueqiuRows) {
  const xueqiuByCode = new Map(xueqiuRows.map((row) => [row.code, row]));
  let matched = 0;
  const rows = hithinkRows.map((row) => {
    const code = stockCodeFromRaw(row);
    const xueqiu = xueqiuByCode.get(code);
    if (!xueqiu) return row;
    matched += 1;
    return {
      ...row,
      __xueqiuRank: xueqiu.rank,
      __xueqiuHeatValue: xueqiu.heatValue,
      __xueqiuRankChange: xueqiu.rankChange,
      __xueqiuFollowers: xueqiu.followers
    };
  });
  return { rows, matched, total: xueqiuRows.length };
}

function stockCodeFromRaw(row) {
  const rawCode = String(pickExact(row, ["股票代码", "代码", "symbol"]) || "").trim();
  const matched = rawCode.match(/(\d{6})/);
  return matched?.[1] || "";
}

function hotHistoryForCode(history, code, period) {
  const today = tradingDateKey();
  const recent = history.snapshots.filter((item) => item.date !== today).slice(-Math.max(period - 1, 1));
  const matched = recent
    .map((snapshot) => snapshot.rows.find((row) => row.code === code))
    .filter(Boolean);
  const previous = matched.at(-1);
  return {
    previousRank: previous?.rank || null,
    continuousDays: 1 + matched.length,
    sampleDays: recent.length
  };
}

function enrichHotLeaders(rawRows, period, history) {
  const baseRows = rawRows.map((row, index) => hithinkRowToHotStock({ ...row, __heatRank: index + 1 })).filter(keepHotStock);
  const maxRank = Math.max(...baseRows.map((row) => row.heatRank).filter(Number.isFinite), HITHINK_HOT_LIMIT);
  const sectorStats = buildSectorStats(baseRows);
  return baseRows
    .map((row) => enrichHotLeader(row, period, history, sectorStats, maxRank))
    .sort((a, b) => b.totalScore - a.totalScore)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

function limitHotLeaderRows(rows, limit) {
  return rows.slice(0, Math.min(50, Math.max(0, Number(limit) || 50)));
}

function enrichHotLeader(row, period, history, sectorStats, maxRank) {
  const sector = sectorStats.get(row.sectorName) || { hotCount: 1, avgChange: 0, upRatio: 0 };
  const historical = hotHistoryForCode(history, row.code, period);
  const historySampleSufficient = period === 1 || historical.sampleDays >= Math.min(period - 1, 2);
  const estimatedRankChange = historySampleSufficient ? null : estimateRankChange(row, period);
  const rankChange = historical.previousRank ? historical.previousRank - row.heatRank : estimatedRankChange;
  const continuousDays = historySampleSufficient ? historical.continuousDays : Math.min(period, 1 + Math.max(0, Math.round((maxRank - row.heatRank) / Math.max(maxRank / period, 1))));
  const heatScore = scoreHeat(row, maxRank, rankChange, continuousDays, sector.hotCount, period, historySampleSufficient);
  const flowScore = scoreHotFlow(row);
  const leaderScore = scoreHotLeaderPosition(row, sector);
  const riskRewardScore = scoreRiskReward(row);
  const periodScore = scorePeriodMomentum(row, period, rankChange, continuousDays, historySampleSufficient);
  const totalScore = Number((heatScore + flowScore + leaderScore + riskRewardScore + periodScore).toFixed(2));
  const enriched = {
    ...row,
    period,
    rankChange,
    rankChangeEstimated: !historySampleSufficient,
    historySampleSufficient,
    historyNote: historySampleSufficient ? "历史样本已接入" : "历史样本不足，使用当前热度和承接估算",
    previousRank: historical.previousRank,
    continuousDays,
    sectorHotCount: sector.hotCount,
    sectorAvgChange: Number((sector.avgChange || 0).toFixed(2)),
    sectorUpRatio: sector.upRatio || 0,
    heatScore: Number(heatScore.toFixed(2)),
    flowScore: Number(flowScore.toFixed(2)),
    leaderScore: Number(leaderScore.toFixed(2)),
    riskRewardScore: Number(riskRewardScore.toFixed(2)),
    periodScore: Number(periodScore.toFixed(2)),
    totalScore
  };
  enriched.leaderType = classifyHotLeader(enriched);
  enriched.grade = classifyHotGrade(enriched);
  enriched.carryReason = hotCarryReason(enriched);
  enriched.riskReward = hotRiskReward(enriched);
  enriched.riskLine = hotRiskLine(enriched);
  enriched.invalidCondition = hotInvalidCondition(enriched);
  enriched.entryCondition = hotEntryCondition(enriched);
  return attachTradePlan(enriched);
}

function estimateRankChange(row, period) {
  const flowPct = row.amount ? ((row.mainInflow || 0) + (row.superInflow || 0)) / row.amount * 100 : 0;
  const control = (row.changePct || 0) - Math.max((row.amplitude || 0) - 6, 0) * 0.7;
  const heatBase = Math.max(0, HITHINK_HOT_LIMIT - (row.heatRank || HITHINK_HOT_LIMIT)) / HITHINK_HOT_LIMIT;
  return Math.round(clamp((flowPct * 0.9 + control * 0.4 + heatBase * 4) * Math.log2(period + 1), -18, 18));
}

function scoreHeat(row, maxRank, rankChange, continuousDays, sectorHotCount, period, historySampleSufficient = true) {
  const hasXueqiu = Number.isFinite(row.xueqiuRank);
  const thsRankScore = scale(maxRank - row.heatRank + 1, 0, maxRank, 0, hasXueqiu ? 14 : 22);
  const xueqiuRankScore = hasXueqiu
    ? scale(Math.max(0, XUEQIU_HOT_SIZE - row.xueqiuRank + 1), 0, XUEQIU_HOT_SIZE, 0, 6)
    : 0;
  const xueqiuValueScore = hasXueqiu
    ? scale(Math.log10(Math.max(row.xueqiuHeatValue || 0, 1)), 2.5, 4.3, 0, 2)
    : 0;
  const rankScore = thsRankScore + xueqiuRankScore + xueqiuValueScore;
  const thsChangeScore = rankChange === null ? 2 : scale(rankChange, -20, 30, 0, hasXueqiu ? 3.5 : historySampleSufficient ? 5 : 4);
  const xueqiuChangeScore = hasXueqiu ? scale(row.xueqiuRankChange || 0, -20, 30, 0, 1.5) : 0;
  const changeScore = thsChangeScore + xueqiuChangeScore;
  const continuityScore = scale(Math.min(continuousDays, period), 1, Math.max(period, 1), period === 1 ? 5 : 2, 5);
  const syncScore = scale(sectorHotCount, 1, 6, 0, 3);
  return clamp(rankScore + changeScore + continuityScore + syncScore, 0, 35);
}

function scorePeriodMomentum(row, period, rankChange, continuousDays, historySampleSufficient) {
  if (period === 1) return 0;
  const flowPct = row.amount ? ((row.mainInflow || 0) + (row.superInflow || 0)) / row.amount * 100 : 0;
  const rankScore = scale(rankChange || 0, -12, 18, -3, 5);
  const stabilityScore = scale(continuousDays, 1, period, 0, 4);
  const carryScore = scale(flowPct, -8, 12, -3, 4);
  const penalty = historySampleSufficient ? 0 : 1.2;
  return Number(clamp((rankScore + stabilityScore + carryScore - penalty) * (period / 5), -5, 8).toFixed(2));
}

function scoreHotFlow(row) {
  const mainPct = row.amount ? (row.mainInflow / row.amount) * 100 : NaN;
  const superPct = row.amount ? (row.superInflow / row.amount) * 100 : NaN;
  const largePct = row.amount ? (row.largeInflow / row.amount) * 100 : NaN;
  const mainScore = scale(mainPct, -8, 12, 0, 12);
  const superScore = scale(superPct, -8, 10, 0, 8);
  const largeScore = scale(largePct, -8, 10, 0, 5);
  const volumeScore = scale(row.volumeRatio, 0.8, 2.5, 0, 5);
  const level2Score = scoreLevel2Activity(row, 4);
  return clamp(mainScore + superScore + largeScore + volumeScore + level2Score, 0, 30);
}

function scoreHotLeaderPosition(row, sector) {
  const count = Math.max(sector.hotCount || 1, 1);
  const amountScore = scale(count - (row.sectorAmountRank || count) + 1, 0, count, 0, 8);
  const changeScore = scale(count - (row.sectorChangeRank || count) + 1, 0, count, 0, 5);
  const sectorScore = scale(sector.hotCount || 1, 1, 6, 0, 5);
  const strengthScore = scale((sector.avgChange || 0) * (sector.upRatio || 0), -2, 6, 0, 2);
  return clamp(amountScore + changeScore + sectorScore + strengthScore, 0, 20);
}

function scoreRiskReward(row) {
  let score = 15;
  if ((row.changePct || 0) > 7) score -= 3;
  if ((row.changePct || 0) > 9.5) score -= 3;
  if ((row.changePct || 0) < -4) score -= 2;
  if ((row.amplitude || 0) > 10) score -= 3;
  if ((row.amplitude || 0) > 14) score -= 2;
  if ((row.turnover || 0) > 18) score -= 2;
  if ((row.mainInflow || 0) < 0 && (row.superInflow || 0) < 0) score -= 4;
  if ((row.volumeRatio || 0) > 3 && (row.mainInflow || 0) < 0) score -= 2;
  return clamp(score, 0, 15);
}

function classifyHotLeader(row) {
  if (row.heatRank <= 10 && row.sectorAmountRank <= 2) return "核心龙头";
  if (row.heatRank <= 15) return "情绪龙头";
  if ((row.mainInflow || 0) > 0 && row.sectorChangeRank <= 2) return "趋势龙头";
  return "补涨龙头";
}

function classifyHotGrade(row) {
  if (row.totalScore >= 75 && (row.mainInflow || 0) > 0 && (row.superInflow || 0) > 0 && row.riskRewardScore >= 8) {
    return "强关注";
  }
  if (row.totalScore >= 60) return "观察";
  return "谨慎";
}

function hotCarryReason(row) {
  const pieces = [`热度第${row.heatRank}`];
  if (Number.isFinite(row.xueqiuRank)) pieces.push(`雪球第${row.xueqiuRank}`);
  if (row.rankChange !== null) pieces.push(row.rankChange > 0 ? `排名上升${row.rankChange}` : row.rankChange < 0 ? `排名回落${Math.abs(row.rankChange)}` : "排名持平");
  if ((row.mainInflow || 0) > 0) pieces.push(`主力净额${moneyShort(row.mainInflow)}`);
  if ((row.superInflow || 0) > 0) pieces.push(`超大单${moneyShort(row.superInflow)}`);
  if ((row.volumeRatio || 0) >= 1.2) pieces.push(`量比${row.volumeRatio.toFixed(2)}`);
  if (row.sectorHotCount >= 2) pieces.push(`${row.sectorName}${row.sectorHotCount}只上榜`);
  return pieces.slice(0, 5).join("，");
}

function hotRiskReward(row) {
  if ((row.mainInflow || 0) < 0 && (row.superInflow || 0) < 0) return "热度高，资金承接偏弱";
  if ((row.changePct || 0) > 9.5 || (row.amplitude || 0) > 12) return "热度强，波动消耗偏大";
  if ((row.mainInflow || 0) > 0 && (row.superInflow || 0) > 0 && (row.changePct || 0) <= 7) return "承接较强，风险收益较优";
  return "承接有待延续";
}

function hotRiskLine(row) {
  if (!Number.isFinite(row.price)) return "待确认";
  const amplitude = Number.isFinite(row.amplitude) ? row.amplitude : 6;
  const invalid = Math.max(row.price * (1 - Math.min(Math.max(amplitude, 4), 10) / 200), 0);
  return `${invalid.toFixed(2)} 附近承接`;
}

function hotInvalidCondition(row) {
  return `跌破${hotRiskLine(row)}，或热度跌出前${HITHINK_HOT_LIMIT}且主力净额转弱`;
}

function hotEntryCondition(row) {
  if ((row.mainInflow || 0) > 0 && (row.superInflow || 0) > 0) {
    return "回踩不破风险线，分时缩量回收后再确认";
  }
  return "等待主力净额或超大单净额回正后再观察";
}

async function breakoutAlerts(url) {
  const limit = Math.round(clampNumber(url.searchParams.get("limit"), 10, 80, 50));
  const market = await getMarketPayload();
  const rawRows = market.payload?.data?.diff;
  if (!Array.isArray(rawRows)) throw new Error("Unexpected market response shape");
  const hotRefs = await getBreakoutHotRefs().catch(() => new Map());
  const rows = makeBreakoutAlertRows(rawRows, hotRefs, limit);
  const stats = {
    total: rows.length,
    strong: rows.filter((row) => row.stage === "刚起爆").length,
    warming: rows.filter((row) => row.stage === "升温").length,
    positiveFlow: rows.filter((row) => (row.mainInflow || 0) > 0 && (row.superInflow || 0) > 0).length,
    avgScore: rows.length ? rows.reduce((sum, row) => sum + row.breakoutScore, 0) / rows.length : 0
  };
  return {
    timestamp: new Date().toLocaleString("zh-CN", { hour12: false, timeZoneName: "short" }),
    source: `${marketSource(market)} + 同花顺/雪球热度参考 + 股票级板块映射`,
    warning: marketWarning(market, "行情源"),
    dataState: dataStateFromCache(market, "起爆预警"),
    stats,
    rows
  };
}

async function getBreakoutHotRefs() {
  const hotMarket = await getHotLeaderPayload();
  const hotRows = enrichHotLeaders(hotMarket.payload?.rows || [], 1, readHotHistory());
  return new Map(hotRows.map((row) => [row.code, row]));
}

function makeBreakoutAlertRows(rawRows, hotRefs = new Map(), limit = 50) {
  const baseRows = rawRows
    .map(normalize)
    .filter(keepBreakoutBase)
    .map((row) => {
      const sector = matchSyntheticSectors(row)[0];
      return { ...row, sectorCode: sector.code, sectorName: sector.name };
    });
  const sectorStats = buildBreakoutSectorStats(baseRows);
  return baseRows
    .map((row) => enrichBreakoutAlert(row, hotRefs.get(row.code), sectorStats.get(row.sectorName)))
    .filter((row) => row.breakoutScore >= 45)
    .sort((a, b) => b.breakoutScore - a.breakoutScore)
    .slice(0, limit)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

function keepBreakoutBase(row) {
  if (!row || !row.code || !row.name) return false;
  if (row.exchange === "BJ") return false;
  if (/^(4|8|920)/.test(row.code)) return false;
  if (/^68[89]/.test(row.code)) return false;
  if (/ST|\*ST|退/.test(row.name.toUpperCase())) return false;
  if (!Number.isFinite(row.amount) || row.amount < 200_000_000) return false;
  if (!Number.isFinite(row.volumeRatio) || row.volumeRatio < 1.15) return false;
  if (!Number.isFinite(row.changePct) || row.changePct < -2 || row.changePct > 7) return false;
  if (Number.isFinite(row.amplitude) && row.amplitude > 12) return false;
  return true;
}

function buildBreakoutSectorStats(rows) {
  const sectors = new Map();
  for (const row of rows) {
    const current = sectors.get(row.sectorName) || {
      count: 0,
      activeCount: 0,
      positiveCount: 0,
      totalChange: 0,
      totalAmount: 0
    };
    current.count += 1;
    if ((row.volumeRatio || 0) >= 1.5 && (row.changePct || 0) >= 0) current.activeCount += 1;
    if ((row.changePct || 0) > 0) current.positiveCount += 1;
    current.totalChange += row.changePct || 0;
    current.totalAmount += row.amount || 0;
    sectors.set(row.sectorName, current);
  }
  for (const sector of sectors.values()) {
    sector.avgChange = sector.count ? sector.totalChange / sector.count : 0;
    sector.upRatio = sector.count ? sector.positiveCount / sector.count : 0;
  }
  return sectors;
}

function enrichBreakoutAlert(row, hotRef, sector = {}) {
  const volumeScore = scoreBreakoutVolume(row);
  const heatScore = scoreBreakoutHeat(row, hotRef);
  const flowScore = scoreBreakoutFlow(row);
  const sectorScore = scoreBreakoutSector(sector);
  const riskPenalty = scoreBreakoutRiskPenalty(row, hotRef);
  const breakoutScore = Number(clamp(volumeScore + heatScore + flowScore + sectorScore - riskPenalty, 0, 100).toFixed(2));
  const enriched = {
    ...row,
    heatRank: hotRef?.heatRank ?? null,
    rankChange: hotRef?.rankChange ?? null,
    xueqiuRank: hotRef?.xueqiuRank ?? null,
    xueqiuHeatValue: hotRef?.xueqiuHeatValue ?? null,
    xueqiuRankChange: hotRef?.xueqiuRankChange ?? null,
    sectorActiveCount: sector.activeCount || 0,
    sectorUpRatio: sector.upRatio || 0,
    sectorAvgChange: Number((sector.avgChange || 0).toFixed(2)),
    volumeScore: Number(volumeScore.toFixed(2)),
    heatScore: Number(heatScore.toFixed(2)),
    flowScore: Number(flowScore.toFixed(2)),
    sectorScore: Number(sectorScore.toFixed(2)),
    riskPenalty: Number(riskPenalty.toFixed(2)),
    breakoutScore
  };
  enriched.stage = classifyBreakoutStage(enriched);
  enriched.reason = breakoutReason(enriched);
  enriched.risk = breakoutRisk(enriched);
  enriched.entryCondition = breakoutEntryCondition(enriched);
  return attachTradePlan(enriched);
}

function scoreBreakoutVolume(row) {
  const ratioScore = scale(row.volumeRatio, 1.1, 4, 0, 18);
  const amountScore = scale(row.amount, 200_000_000, 2_000_000_000, 0, 8);
  const earlyBonus = row.changePct >= 0 && row.changePct <= 5 ? 4 : 0;
  return clamp(ratioScore + amountScore + earlyBonus, 0, 30);
}

function scoreBreakoutHeat(row, hotRef) {
  if (!hotRef) return row.volumeRatio >= 2.5 ? 4 : 0;
  const thsRankScore = Number.isFinite(hotRef.heatRank)
    ? scale(Math.max(0, HITHINK_HOT_LIMIT - hotRef.heatRank + 1), 0, HITHINK_HOT_LIMIT, 0, 8)
    : 0;
  const thsChangeScore = Number.isFinite(hotRef.rankChange) ? scale(hotRef.rankChange, -10, 25, 0, 5) : 1.5;
  const xueqiuRankScore = Number.isFinite(hotRef.xueqiuRank)
    ? scale(Math.max(0, XUEQIU_HOT_SIZE - hotRef.xueqiuRank + 1), 0, XUEQIU_HOT_SIZE, 0, 6)
    : 0;
  const xueqiuChangeScore = Number.isFinite(hotRef.xueqiuRankChange) ? scale(hotRef.xueqiuRankChange, -10, 25, 0, 4) : 0;
  const xueqiuValueScore = Number.isFinite(hotRef.xueqiuHeatValue)
    ? scale(Math.log10(Math.max(hotRef.xueqiuHeatValue, 1)), 2.5, 4.3, 0, 2)
    : 0;
  return clamp(thsRankScore + thsChangeScore + xueqiuRankScore + xueqiuChangeScore + xueqiuValueScore, 0, 25);
}

function scoreBreakoutFlow(row) {
  const mainPct = row.amount ? ((row.mainInflow || 0) / row.amount) * 100 : 0;
  const superPct = row.amount ? ((row.superInflow || 0) / row.amount) * 100 : 0;
  const largePct = row.amount ? ((row.largeInflow || 0) / row.amount) * 100 : 0;
  const mainScore = scale(mainPct, -4, 10, 0, 10);
  const superScore = scale(superPct, -4, 8, 0, 7);
  const largeScore = scale(largePct, -4, 8, 0, 5);
  const positiveBonus = (row.mainInflow || 0) > 0 && (row.superInflow || 0) > 0 ? 3 : 0;
  const level2Score = scoreLevel2Activity(row, 6);
  return clamp(mainScore + superScore + largeScore + positiveBonus + level2Score, 0, 25);
}

function scoreBreakoutSector(sector = {}) {
  const activeScore = scale(sector.activeCount || 0, 1, 6, 0, 7);
  const breadthScore = scale(sector.upRatio || 0, 0.3, 0.85, 0, 4);
  const changeScore = scale(sector.avgChange || 0, -1, 4, 0, 4);
  return clamp(activeScore + breadthScore + changeScore, 0, 15);
}

function scoreBreakoutRiskPenalty(row, hotRef) {
  let penalty = 0;
  if ((row.changePct || 0) > 5) penalty += 1.5;
  if ((row.amplitude || 0) > 9) penalty += 1.5;
  if ((row.turnover || 0) > 18) penalty += 1;
  if ((row.mainInflow || 0) < 0 && (row.superInflow || 0) < 0) penalty += 2;
  if (hotRef?.heatRank <= 10 && (row.changePct || 0) > 6) penalty += 1;
  return clamp(penalty, 0, 5);
}

function classifyBreakoutStage(row) {
  if (row.breakoutScore >= 78 && row.changePct <= 5 && row.flowScore >= 14) return "刚起爆";
  if (row.breakoutScore >= 65) return "升温";
  if (row.flowScore >= 12 && row.volumeScore >= 18) return "试盘";
  return "观察";
}

function breakoutReason(row) {
  const pieces = [`量比${Number.isFinite(row.volumeRatio) ? row.volumeRatio.toFixed(2) : "待确认"}`];
  if (row.changePct >= 0 && row.changePct <= 5) pieces.push(`涨幅${pctShort(row.changePct)}未透支`);
  if ((row.mainInflow || 0) > 0) pieces.push(`主力${moneyShort(row.mainInflow)}`);
  if ((row.superInflow || 0) > 0) pieces.push(`超大单${moneyShort(row.superInflow)}`);
  if ((row.ddeNetAmount || 0) > 0) pieces.push(`DDE大单${moneyShort(row.ddeNetAmount)}`);
  if ((row.largeOrderAmount || 0) > 0) pieces.push(`大单总额${moneyShort(row.largeOrderAmount)}`);
  if (Number.isFinite(row.heatRank)) pieces.push(`同花顺热度第${row.heatRank}`);
  if (Number.isFinite(row.xueqiuRank)) pieces.push(`雪球第${row.xueqiuRank}`);
  if (row.sectorActiveCount >= 2) pieces.push(`${row.sectorName}${row.sectorActiveCount}只同步放量`);
  return pieces.slice(0, 6).join("，");
}

function breakoutRisk(row) {
  if ((row.mainInflow || 0) < 0 && (row.superInflow || 0) < 0) return "资金承接偏弱";
  if ((row.amplitude || 0) > 9) return "振幅偏大，观察回落承接";
  if ((row.changePct || 0) > 5) return "涨幅偏高，等待缩量回踩";
  if ((row.turnover || 0) > 18) return "换手偏高，分歧加大";
  return "观察均价线和放量后承接";
}

function breakoutEntryCondition(row) {
  if (row.stage === "刚起爆") return "分时回踩均价线不破，缩量后再放量上攻";
  if (row.stage === "升温") return "等待板块继续共振，个股回落不破日内平台";
  return "等待主力和超大单继续转强";
}

async function scan(url) {
  const params = parseParams(url);
  const market = await getMarketPayload();
  const payload = market.payload;
  const rawRows = payload?.data?.diff;
  if (!Array.isArray(rawRows)) throw new Error("Unexpected Eastmoney response shape");
  const rows = rawRows
    .map(normalize)
    .filter((row) => keep(row, params))
    .map((row) => {
      const enriched = {
        ...row,
        score: scoreStock(row),
        tag: classify(row),
        reason: explain(row),
        risk: riskLine(row)
      };
      return attachTradePlan(enriched);
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, params.limit);
  const stats = {
    total: rows.length,
    positiveSuper: rows.filter((row) => row.superInflow > 0).length,
    positiveLarge: rows.filter((row) => row.largeInflow > 0).length,
    totalMainInflow: rows.reduce((sum, row) => sum + row.mainInflow, 0),
    avgVolumeRatio: rows.length ? rows.reduce((sum, row) => sum + row.volumeRatio, 0) / rows.length : 0
  };
  return {
    timestamp: new Date().toLocaleString("zh-CN", { hour12: false, timeZoneName: "short" }),
    source: marketSource(market),
    warning: marketWarning(market, "行情源"),
    dataState: dataStateFromCache(market, "暗盘筛选"),
    params,
    stats,
    rows
  };
}

async function sectors(url) {
  const period = Math.round(clampNumber(url.searchParams.get("period"), 1, 10, 1));
  const limit = Math.round(clampNumber(url.searchParams.get("limit"), 10, 120, 60));
  const boardMarket = await getBoardPayload().catch(async (error) => {
    const market = await getMarketPayload();
    return {
      payload: buildSyntheticBoardPayload(market.payload),
      cacheStatus: "synthetic",
      ageMs: 0,
      warning: `官方板块源连接中断，已使用股票级映射层：${compactError(error.message)}`
    };
  });
  const rawRows = boardMarket.payload?.data?.diff;
  if (!Array.isArray(rawRows)) throw new Error("Unexpected board response shape");
  const boards = rawRows.map(normalizeBoard).filter(Boolean).slice(0, limit);
  const useSynthetic = boardMarket.cacheStatus === "synthetic" || boardMarket.cacheStatus !== "live";
  const enriched = await mapLimit(boards, useSynthetic ? 12 : 8, async (board) => {
    return useSynthetic ? enrichSyntheticBoard(board, period) : enrichBoard(board, period);
  });
  const sortedBase = enriched
    .sort((a, b) => b.rotationScore - a.rotationScore)
    .map((board, index, all) => ({
      ...board,
      rank: index + 1,
      rankChange: rankChange(board, all, period)
    }));
  const sorted = attachOneDayFlows(sortedBase);
  recordBoardFlowSnapshot(sorted);
  const stats = {
    total: sorted.length,
    strong: sorted.filter((board) => board.status === "强势").length,
    warming: sorted.filter((board) => board.status === "升温").length,
    fading: sorted.filter((board) => board.status === "退潮").length,
    totalMainInflow: sorted.reduce((sum, board) => sum + board.mainInflow, 0)
  };
  return {
    timestamp: new Date().toLocaleString("zh-CN", { hour12: false, timeZoneName: "short" }),
    source: boardMarket.source || (boardMarket.cacheStatus === "synthetic" ? "股票级板块映射 · fallback" : boardMarket.cacheStatus === "stale" ? "Eastmoney board quote API · cached fallback" : boardMarket.cacheStatus === "disk" ? "Eastmoney board quote API · disk cache" : "Eastmoney board quote API"),
    warning: boardMarket.warning || (boardMarket.cacheStatus === "stale" || boardMarket.cacheStatus === "disk" ? `板块行情源连接中断，已显示 ${Math.round(boardMarket.ageMs / 1000)} 秒前缓存` : ""),
    dataState: dataStateFromCache(boardMarket, "板块轮动"),
    period,
    stats,
    rows: sorted
  };
}

async function sectorDetail(url) {
  const code = url.searchParams.get("code");
  const period = Math.round(clampNumber(url.searchParams.get("period"), 1, 10, 1));
  if (!/^(BK|SYN)\d{3,4}$/.test(code || "")) throw new Error("Invalid sector code");
  const boardMarket = await getBoardPayload().catch(async () => {
    const market = await getMarketPayload();
    return { payload: buildSyntheticBoardPayload(market.payload), cacheStatus: "synthetic" };
  });
  const rawBoards = boardMarket.payload?.data?.diff || [];
  const board = rawBoards.map(normalizeBoard).filter(Boolean).find((item) => item.code === code);
  if (!board) throw new Error("Sector not found");
  const useSynthetic = code.startsWith("SYN") || boardMarket.cacheStatus === "synthetic" || boardMarket.cacheStatus !== "live";
  const enrichedBoardBase = useSynthetic ? enrichSyntheticBoard(board, period) : await enrichBoard(board, period);
  const enrichedBoard = attachOneDayFlows([enrichedBoardBase])[0];
  const useMappedStocks = useSynthetic || boardMarket.cacheStatus !== "live";
  let stocks = useMappedStocks ? await mappedStocksForBoard(board.name) : await getBoardStocks(code).catch(async () => {
    const market = await getMarketPayload();
    buildSyntheticBoardPayload(market.payload);
    return syntheticMembersByBoardName(board.name);
  });
  if (!stocks.length) {
    const market = await getMarketPayload();
    stocks = market.payload?.data?.diff || [];
  }
  const rows = stocks
    .map(normalize)
    .filter((row) => row && row.amount >= 200_000_000)
    .map((row) => {
      const enriched = {
        ...row,
        score: scoreStock(row),
        tag: classify(row),
        reason: explain(row),
        risk: riskLine(row)
      };
      return attachTradePlan(enriched);
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 30);
  const news = await getSectorNews(enrichedBoard, rows);
  const interpretation = await getSectorInterpretation(enrichedBoard, rows, news);
  return {
    timestamp: new Date().toLocaleString("zh-CN", { hour12: false, timeZoneName: "short" }),
    source: boardMarket.source || "Eastmoney board quote API",
    period,
    board: enrichedBoard,
    interpretation,
    news,
    rows
  };
}

async function hotLeaders(url) {
  const period = Math.round(clampNumber(url.searchParams.get("period"), 1, 5, 1));
  const limit = Math.round(clampNumber(url.searchParams.get("limit"), 10, 50, 50));
  const payload = await buildHotLeaderRows(period, limit);
  return {
    timestamp: new Date().toLocaleString("zh-CN", { hour12: false, timeZoneName: "short" }),
    source: payload.source,
    warning: payload.warning,
    dataState: payload.dataState,
    period,
    stats: payload.stats,
    rows: payload.rows
  };
}

async function buildHotLeaderRows(period, limit) {
  const hotMarket = await getHotLeaderPayload();
  const rawRows = hotMarket.payload?.rows || [];
  const history = readHotHistory();
  const rows = limitHotLeaderRows(enrichHotLeaders(rawRows, period, history), limit);
  const historyInsufficient = period > 1 && rows.some((row) => row.historySampleSufficient === false);
  const xueqiu = hotMarket.payload?.xueqiu || { enabled: false, rows: 0, matched: 0, warning: "" };
  const xueqiuNote = xueqiu.enabled ? ` · 雪球热股榜${xueqiu.warning ? "待确认" : `匹配${xueqiu.matched}/${xueqiu.rows}`}` : "";
  const stats = {
    total: rows.length,
    strong: rows.filter((row) => row.grade === "强关注").length,
    observe: rows.filter((row) => row.grade === "观察").length,
    positiveFlow: rows.filter((row) => (row.mainInflow || 0) > 0 && (row.superInflow || 0) > 0).length,
    avgScore: rows.length ? rows.reduce((sum, row) => sum + row.totalScore, 0) / rows.length : 0,
    xueqiuMatched: xueqiu.matched || 0,
    xueqiuRows: xueqiu.rows || 0,
    xueqiuWarning: xueqiu.warning || "",
    historyInsufficient,
    historyNote: `${historyInsufficient ? "历史样本不足，3日/5日使用当前热度和承接估算" : "历史样本已接入"}${xueqiuNote}`
  };
  const sourceBase = hotMarket.cacheStatus === "disk" ? "同花顺问财 OpenAPI · 个股热度排名 · disk cache" : hotMarket.cacheStatus === "stale" ? "同花顺问财 OpenAPI · 个股热度排名 · cached fallback" : "同花顺问财 OpenAPI · 个股热度排名";
  const warning = [
    hotMarket.cacheStatus === "stale" || hotMarket.cacheStatus === "disk" ? `热度榜连接中断，已显示 ${Math.round(hotMarket.ageMs / 1000)} 秒前缓存` : "",
    xueqiu.warning ? `雪球热股榜暂不可用：${xueqiu.warning}` : ""
  ].filter(Boolean).join("；");
  return {
    source: xueqiu.enabled ? `${sourceBase} + 雪球热股榜` : sourceBase,
    warning,
    dataState: dataStateFromCache(hotMarket, "热度龙头"),
    period,
    stats,
    rows
  };
}

async function hotLeaderDetail(url) {
  const code = url.searchParams.get("code");
  const period = Math.round(clampNumber(url.searchParams.get("period"), 1, 5, 1));
  if (!/^\d{6}$/.test(code || "")) throw new Error("Invalid stock code");
  return buildHotLeaderDetail(code, period);
}

async function buildHotLeaderDetail(code, period) {
  const hotMarket = await getHotLeaderPayload();
  const rows = enrichHotLeaders(hotMarket.payload?.rows || [], period, readHotHistory());
  const row = rows.find((item) => item.code === code);
  if (!row) throw new Error("Stock not found in hot list");
  const chip = await getStockChipInsight(row);
  const diagnosis = buildAiStockDiagnosis(row, chip);
  const detailedRow = attachTradePlan({
    ...row,
    riskLine: chip.enhancedRiskLine || row.riskLine,
    invalidCondition: `${row.invalidCondition}；${diagnosis.invalidCondition}`
  }, chip);
  return {
    timestamp: new Date().toLocaleString("zh-CN", { hour12: false, timeZoneName: "short" }),
    source: "同花顺问财 OpenAPI · 个股热度排名 + 雪球热股榜",
    period,
    row: detailedRow,
    detail: {
      heat: `同花顺第${row.heatRank}，热度值${Number.isFinite(row.heatValue) ? row.heatValue.toFixed(0) : "待确认"}；雪球${Number.isFinite(row.xueqiuRank) ? `第${row.xueqiuRank}，热度${Number.isFinite(row.xueqiuHeatValue) ? row.xueqiuHeatValue.toFixed(0) : "待确认"}，变化${rankChangeLabel(row.xueqiuRankChange)}` : "未上榜"}；${row.rankChange === null ? "同花顺热度变化待确认" : row.rankChange >= 0 ? `同花顺排名上升${row.rankChange}` : `同花顺排名回落${Math.abs(row.rankChange)}`}`,
      flow: `主力${moneyShort(row.mainInflow)}，超大单${moneyShort(row.superInflow)}，大单${moneyShort(row.largeInflow)}，DDE${moneyShort(row.ddeNetAmount)}，大单总额${moneyShort(row.largeOrderAmount)}`,
      sector: `${row.sectorName}，热度榜内${row.sectorHotCount}只同步上榜，板块均涨幅${pctShort(row.sectorAvgChange)}`,
      leader: `${row.leaderType}，板块内成交额排名${row.sectorAmountRank || "待确认"}，涨幅排名${row.sectorChangeRank || "待确认"}`,
      concepts: `${row.conceptNote || "待确认"}（${row.conceptSource || "待确认"}）`,
      period: `${row.period}日评分影响${row.periodScore >= 0 ? "+" : ""}${row.periodScore}，${row.historyNote}`,
      aiAnalysis: diagnosis.summary,
      riskDiagnosis: diagnosis.risk,
      chipCost: chip.costZoneText,
      chipPressure: chip.pressureText,
      chipSupport: chip.supportText,
      chipPosition: chip.positionText,
      chipSource: `${chip.source}${chip.warning ? `；${chip.warning}` : ""}`,
      chipData: chip,
      entryCondition: row.entryCondition,
      riskLine: detailedRow.riskLine,
      invalidCondition: detailedRow.invalidCondition,
      tradePlan: detailedRow.tradePlan
    }
  };
}

async function watchlist(url) {
  const period = Math.round(clampNumber(url.searchParams.get("period"), 1, 5, 1));
  const limit = Math.round(clampNumber(url.searchParams.get("limit"), 10, 100, 80));
  return buildWatchlistPayload(period, limit);
}

async function buildWatchlistPayload(period, limit) {
  const warnings = [];
  const dataStates = [];
  let hotRows = [];
  let hotSource = "同花顺问财 OpenAPI · 个股热度排名";
  let hotStats = {};
  try {
    const hotPayload = await buildHotLeaderRows(period, 50);
    hotRows = hotPayload.rows;
    hotSource = hotPayload.source;
    hotStats = hotPayload.stats;
    if (hotPayload.dataState) dataStates.push(hotPayload.dataState);
    if (hotPayload.warning) warnings.push(hotPayload.warning);
  } catch (error) {
    warnings.push(`热度榜暂不可用：${compactError(error.message)}`);
  }

  let breakoutRows = [];
  let marketSourceText = "行情源待确认";
  try {
    const market = await getMarketPayload();
    const rawRows = market.payload?.data?.diff;
    if (!Array.isArray(rawRows)) throw new Error("Unexpected market response shape");
    const hotRefs = new Map(hotRows.map((row) => [row.code, row]));
    breakoutRows = makeBreakoutAlertRows(rawRows, hotRefs, 120).filter(isWatchlistBreakoutStage);
    marketSourceText = `${marketSource(market)} + 股票级板块映射`;
    dataStates.push(dataStateFromCache(market, "行情源"));
    const warning = marketWarning(market, "行情源");
    if (warning) warnings.push(warning);
  } catch (error) {
    if (!hotRows.length) throw error;
    warnings.push(`起爆预警暂不可用：${compactError(error.message)}`);
  }

  const mergedRows = mergeWatchlistRows(hotRows, breakoutRows, Math.max(limit, 120));
  const rows = mergedRows.slice(0, limit);
  const breakoutHistory = recordBreakoutHistory(mergedRows);
  const stats = {
    total: rows.length,
    confluence: rows.filter((row) => row.isConfluence).length,
    freshBreakout: rows.filter((row) => row.breakoutStage === "刚起爆").length,
    strong: rows.filter((row) => row.grade === "强关注").length,
    positiveFlow: rows.filter((row) => row.isPositiveFlow).length,
    newSignals: rows.filter((row) => row.isNewSignal).length,
    avgScore: rows.length ? rows.reduce((sum, row) => sum + row.watchScore, 0) / rows.length : 0,
    hotStrong: hotStats.strong || 0
  };
  return {
    timestamp: new Date().toLocaleString("zh-CN", { hour12: false, timeZoneName: "short" }),
    source: `${hotSource} + ${marketSourceText}`,
    warning: [...new Set(warnings.filter(Boolean))].join("；"),
    dataState: combineDataStates(dataStates, "盯盘总榜"),
    period,
    stats,
    breakoutHistory,
    rows
  };
}

function mergeWatchlistRows(hotRows = [], breakoutRows = [], limit = 80) {
  const byCode = new Map();
  hotRows.forEach((hot) => {
    if (!hot?.code) return;
    byCode.set(hot.code, { hot, breakout: null });
  });
  breakoutRows.forEach((breakout) => {
    if (!breakout?.code) return;
    if (!isWatchlistBreakoutStage(breakout)) return;
    const current = byCode.get(breakout.code) || { hot: null, breakout: null };
    current.breakout = breakout;
    byCode.set(breakout.code, current);
  });
  return [...byCode.values()]
    .map(({ hot, breakout }) => enrichWatchlistRow(hot, breakout))
    .sort((a, b) => b.watchScore - a.watchScore)
    .slice(0, limit)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

function enrichWatchlistRow(hot, breakout) {
  const base = hot || breakout || {};
  const hasHot = Boolean(hot);
  const hasBreakout = Boolean(breakout);
  const scores = scoreWatchlistRow(hot, breakout);
  const mainInflow = firstFinite(hot?.mainInflow, breakout?.mainInflow, 0);
  const superInflow = firstFinite(hot?.superInflow, breakout?.superInflow, 0);
  const row = {
    code: base.code,
    exchange: base.exchange,
    name: base.name,
    sectorCode: base.sectorCode,
    sectorName: base.sectorName || "其他活跃股",
    price: firstFinite(hot?.price, breakout?.price, null),
    changePct: firstFinite(hot?.changePct, breakout?.changePct, null),
    amount: firstFinite(hot?.amount, breakout?.amount, null),
    volumeRatio: firstFinite(hot?.volumeRatio, breakout?.volumeRatio, null),
    amplitude: firstFinite(hot?.amplitude, breakout?.amplitude, null),
    turnover: firstFinite(hot?.turnover, breakout?.turnover, null),
    mainInflow,
    superInflow,
    largeInflow: firstFinite(hot?.largeInflow, breakout?.largeInflow, null),
    ddeNetAmount: firstFinite(hot?.ddeNetAmount, breakout?.ddeNetAmount, null),
    ddeNetVolume: firstFinite(hot?.ddeNetVolume, breakout?.ddeNetVolume, null),
    largeOrderAmount: firstFinite(hot?.largeOrderAmount, breakout?.largeOrderAmount, null),
    heatRank: firstFinite(hot?.heatRank, breakout?.heatRank, null),
    rankChange: firstFinite(hot?.rankChange, breakout?.rankChange, null),
    xueqiuRank: firstFinite(hot?.xueqiuRank, breakout?.xueqiuRank, null),
    xueqiuHeatValue: firstFinite(hot?.xueqiuHeatValue, breakout?.xueqiuHeatValue, null),
    xueqiuRankChange: firstFinite(hot?.xueqiuRankChange, breakout?.xueqiuRankChange, null),
    hotScore: hasHot ? hot.totalScore : null,
    breakoutScore: hasBreakout ? breakout.breakoutScore : null,
    heatScore: firstFinite(hot?.heatScore, breakout?.heatScore, null),
    flowScore: scores.flowScore,
    carryScore: scores.flowScore,
    riskScore: scores.riskScore,
    watchScore: scores.watchScore,
    grade: hot?.grade || (breakout?.stage === "刚起爆" ? "强关注" : "观察"),
    leaderType: hot?.leaderType || "起爆候选",
    breakoutStage: breakout?.stage || "",
    sourceType: hasHot && hasBreakout ? "双榜共振" : hasHot ? "热度龙头" : "起爆预警",
    hasHot,
    hasBreakout,
    isConfluence: hasHot && hasBreakout,
    isPositiveFlow: (mainInflow || 0) > 0 && (superInflow || 0) > 0,
    isNewSignal: Boolean(
      breakout?.stage === "刚起爆" ||
      (Number(hot?.rankChange) || 0) > 0 ||
      (Number(hot?.xueqiuRankChange) || 0) > 0
    ),
    conceptNote: hot?.conceptNote || "",
    riskLine: hot?.riskLine || breakout?.risk || "待确认",
    entryCondition: hot?.entryCondition || breakout?.entryCondition || "等待资金承接确认",
    buyPointCondition: hot?.entryCondition || breakout?.entryCondition || "等待资金承接确认",
    carryReason: hot?.carryReason || "",
    breakoutReason: breakout?.reason || "",
    riskReward: hot?.riskReward || breakout?.risk || "待确认",
    invalidCondition: hot?.invalidCondition || breakout?.risk || "待确认",
    volumeScore: breakout?.volumeScore ?? null,
    sectorScore: breakout?.sectorScore ?? null
  };
  row.tags = watchTags(row);
  row.watchNote = watchNote(row);
  return attachTradePlan(row);
}

function scoreWatchlistRow(hot, breakout) {
  const flowScore = Math.max(
    hot ? clamp(((hot.flowScore || 0) / 30) * 100, 0, 100) : 0,
    breakout ? clamp(((breakout.flowScore || 0) / 25) * 100, 0, 100) : 0
  );
  const riskScore = Math.max(
    hot ? clamp(((hot.riskRewardScore || 0) / 15) * 100, 0, 100) : 0,
    breakout ? clamp(100 - (breakout.riskPenalty || 0) * 18, 0, 100) : 0
  );
  let watchScore = 0;
  if (hot && breakout) {
    watchScore = hot.totalScore * 0.35 + breakout.breakoutScore * 0.35 + flowScore * 0.2 + riskScore * 0.1;
  } else if (hot) {
    watchScore = hot.totalScore * 0.55 + flowScore * 0.3 + riskScore * 0.15;
  } else if (breakout) {
    watchScore = breakout.breakoutScore * 0.55 + flowScore * 0.3 + riskScore * 0.15;
  }
  if (breakout?.stage === "刚起爆") watchScore += 3;
  if (hot?.grade === "强关注") watchScore += 2;
  if ((firstFinite(hot?.mainInflow, breakout?.mainInflow, 0) || 0) > 0 && (firstFinite(hot?.superInflow, breakout?.superInflow, 0) || 0) > 0) {
    watchScore += 1.5;
  }
  return {
    flowScore: Number(flowScore.toFixed(2)),
    riskScore: Number(riskScore.toFixed(2)),
    watchScore: Number(clamp(watchScore, 0, 100).toFixed(2))
  };
}

function firstFinite(...values) {
  for (const value of values) {
    if (Number.isFinite(value)) return value;
  }
  return values.at(-1);
}

function watchTags(row) {
  const tags = [];
  if (row.isConfluence) tags.push("双榜共振");
  if (row.hasHot) tags.push("热度龙头");
  if (row.hasBreakout) tags.push("起爆预警");
  if (row.breakoutStage === "刚起爆") tags.push("刚起爆");
  if (row.grade === "强关注") tags.push("强关注");
  if (row.isPositiveFlow) tags.push("资金双正");
  return tags;
}

function breakoutStageRank(stage) {
  const ranks = {
    "观察": 1,
    "试盘": 1,
    "升温": 2,
    "刚起爆": 3
  };
  return ranks[stage] || 0;
}

function isWatchlistBreakoutStage(row) {
  return breakoutStageRank(row?.stage || row?.breakoutStage) >= 2;
}

function watchNote(row) {
  const pieces = [];
  if (row.isConfluence) pieces.push("双榜共振");
  if (row.breakoutStage === "刚起爆") pieces.push("刚起爆");
  if (Number.isFinite(row.heatRank)) pieces.push(`热度第${row.heatRank}`);
  if ((row.ddeNetAmount || 0) > 0) pieces.push(`DDE大单${moneyShort(row.ddeNetAmount)}`);
  if ((row.mainInflow || 0) > 0 && (row.superInflow || 0) > 0) pieces.push("资金双正");
  if (Number.isFinite(row.changePct) && row.changePct <= 5) pieces.push("涨幅未透支");
  return pieces.slice(0, 5).join(" + ") || "等待热度、起爆和资金承接继续确认";
}

async function watchlistDetail(url) {
  const code = url.searchParams.get("code");
  const period = Math.round(clampNumber(url.searchParams.get("period"), 1, 5, 1));
  if (!/^\d{6}$/.test(code || "")) throw new Error("Invalid stock code");
  const payload = await buildWatchlistPayload(period, 100);
  const row = payload.rows.find((item) => item.code === code);
  if (!row) throw new Error("Stock not found in watchlist");
  let hotDetail = null;
  if (row.hasHot) {
    hotDetail = await buildHotLeaderDetail(code, period).catch(() => null);
  }
  const chip = hotDetail?.detail?.chipData || null;
  const detailRow = attachTradePlan({
    ...row,
    riskLine: chip?.enhancedRiskLine || row.riskLine,
    invalidCondition: hotDetail?.row?.invalidCondition || row.invalidCondition
  }, chip);
  return {
    timestamp: new Date().toLocaleString("zh-CN", { hour12: false, timeZoneName: "short" }),
    source: payload.source,
    warning: payload.warning,
    period,
    row: detailRow,
    detail: {
      hot: hotDetail?.detail || null,
      breakout: detailRow.hasBreakout ? {
        reason: detailRow.breakoutReason,
        stage: detailRow.breakoutStage,
        volumeScore: detailRow.volumeScore,
        heatScore: detailRow.heatScore,
        carryScore: detailRow.carryScore,
        sectorScore: detailRow.sectorScore,
        entryCondition: detailRow.entryCondition,
        risk: detailRow.riskLine
      } : null,
      confluence: watchConfluenceText(detailRow),
      tradePlan: detailRow.tradePlan
    }
  };
}

function watchConfluenceText(row) {
  if (row.isConfluence) {
    const heatText = Number.isFinite(row.heatRank) ? `热度第${row.heatRank}` : "热度待确认";
    return `${heatText}验证起爆信号，盯盘分${row.watchScore}；${row.isPositiveFlow ? "资金双正支持继续观察" : "资金承接需要继续确认"}。`;
  }
  if (row.hasHot) return `热度榜优先候选，盯盘分${row.watchScore}；等待量能起爆信号同步。`;
  return `起爆预警优先候选，盯盘分${row.watchScore}；等待热度排名进一步确认。`;
}

async function stockChart(url) {
  const code = String(url.searchParams.get("code") || "").trim();
  if (!/^\d{6}$/.test(code)) {
    const error = new Error("Invalid stock code");
    error.statusCode = 400;
    throw error;
  }
  const exchange = inferStockExchange(code, url.searchParams.get("exchange"));
  const cacheName = `stock-chart-${exchange}-${code}`;
  const cached = stockChartCache.get(cacheName);
  if (cached && Date.now() - cached.fetchedAt < STOCK_CHART_CACHE_MS) {
    return { ...cached.payload, cacheStatus: "memory" };
  }

  const disk = readDiskCache(cacheName, DISK_CACHE_MS);
  const warnings = [];
  const secid = stockSecid(code, exchange);
  const [intradayResult, dailyResult] = await Promise.allSettled([
    getStockIntraday(secid),
    getStockDaily(secid)
  ]);
  const intraday = intradayResult.status === "fulfilled" ? intradayResult.value : [];
  const daily = dailyResult.status === "fulfilled" ? dailyResult.value : [];
  if (intradayResult.status === "rejected") warnings.push(`分时图暂不可用：${compactError(intradayResult.reason.message)}`);
  if (dailyResult.status === "rejected") warnings.push(`日K图暂不可用：${compactError(dailyResult.reason.message)}`);

  if (!intraday.length && !daily.length && disk?.payload) {
    return {
      ...disk.payload,
      cacheStatus: "disk",
      warning: [...new Set([disk.payload.warning, ...warnings, `图表接口暂不可用，已使用 ${Math.round(disk.ageMs / 1000)} 秒前缓存`].filter(Boolean))].join("；")
    };
  }

  const referenceRow = await getStockChartReferenceRow(code, exchange);
  const currentPrice = latestChartPrice(intraday, daily, referenceRow.price);
  const chip = await getStockChipInsight({ ...referenceRow, price: currentPrice }).catch((error) => {
    return buildStockChipInsight({ ...referenceRow, price: currentPrice }, {}, "本地估算 · 近120日筹码代理", compactError(error.message));
  });
  const levels = buildChartLevels(chip, currentPrice);
  const payload = {
    timestamp: new Date().toLocaleString("zh-CN", { hour12: false, timeZoneName: "short" }),
    source: "东方财富公开图表接口 + 大单筹码估算",
    cacheStatus: intraday.length && daily.length ? "live" : "partial",
    warning: warnings.join("；"),
    code,
    exchange,
    name: referenceRow.name,
    intraday,
    daily,
    movingAverages: {
      ma5: exponentialMovingAverage(daily, 5),
      ma10: exponentialMovingAverage(daily, 10),
      ma20: exponentialMovingAverage(daily, 20)
    },
    levels
  };
  stockChartCache.set(cacheName, { payload, fetchedAt: Date.now() });
  if (intraday.length || daily.length) writeDiskCache(cacheName, payload);
  return payload;
}

async function getStockIntraday(secid) {
  const { payload } = await requestEastmoneyPath(STOCK_TRENDS_PATH(secid), "push2his.eastmoney.com");
  const rows = parseTrends(payload);
  if (!rows.length) throw new Error("分时接口未返回可用数据");
  return rows;
}

async function getStockDaily(secid) {
  const { payload } = await requestEastmoneyPath(STOCK_DAILY_KLINE_PATH(secid, 120), "push2his.eastmoney.com");
  const rows = parseKlines(payload);
  if (!rows.length) throw new Error("日K接口未返回可用数据");
  return rows.slice(-120);
}

function inferStockExchange(code, exchange) {
  const normalized = String(exchange || "").trim().toUpperCase();
  if (normalized === "SH" || normalized === "SZ") return normalized;
  return code.startsWith("6") ? "SH" : "SZ";
}

function stockSecid(code, exchange) {
  return `${exchange === "SH" ? 1 : 0}.${code}`;
}

async function getStockChartReferenceRow(code, exchange) {
  const fallback = {
    code,
    exchange,
    name: code,
    price: null,
    changePct: 0,
    amplitude: 6,
    mainInflow: 0,
    superInflow: 0,
    ddeNetAmount: 0,
    largeOrderAmount: 0
  };
  try {
    const hotMarket = await getHotLeaderPayload();
    const hotRows = enrichHotLeaders(hotMarket.payload?.rows || [], 1, readHotHistory());
    const row = hotRows.find((item) => item.code === code);
    if (row) return row;
  } catch {
    // Reference row falls back to market data.
  }
  try {
    const market = await getMarketPayload();
    const row = (market.payload?.data?.diff || []).map(normalize).filter(Boolean).find((item) => item.code === code);
    if (row) return row;
  } catch {
    // Final fallback keeps the chart endpoint renderable.
  }
  return fallback;
}

function latestChartPrice(intraday, daily, fallback) {
  const intradayPrice = intraday.at(-1)?.price;
  if (Number.isFinite(intradayPrice)) return intradayPrice;
  const close = daily.at(-1)?.close;
  if (Number.isFinite(close)) return close;
  return Number.isFinite(fallback) ? fallback : null;
}

function buildChartLevels(chip, currentPrice) {
  return {
    costLow: nullableNumber(chip.costLow),
    costHigh: nullableNumber(chip.costHigh),
    pressure: nullableNumber(chip.pressure),
    support: nullableNumber(chip.support),
    riskInvalid: nullableNumber(chip.invalid),
    currentPrice: nullableNumber(currentPrice),
    source: chip.source || "待确认",
    warning: chip.warning || ""
  };
}

function nullableNumber(value) {
  return Number.isFinite(value) ? Number(value.toFixed(3)) : null;
}

async function getStockChipInsight(row) {
  const cacheName = `stock-chip-${row.code}`;
  const disk = readDiskCache(cacheName, STOCK_CHIP_CACHE_MS);
  if (disk) return disk.payload;
  const query =
    `${row.name} ${row.code} 近120个交易日 大单筹码分布 主力成本 压力位 支撑位 DDE大单净量 大单金额，` +
    "列出股票代码、股票简称、最新价、近120日最高价、近120日最低价、近120日均价、主力资金流向、dde大单净量、dde大单净额、大单金额";
  try {
    const result = await queryHithinkCli(query, 1, 25);
    const raw = result.datas?.[0] || {};
    const payload = buildStockChipInsight(row, raw, "同花顺问财 · 近120日大单筹码");
    writeDiskCache(cacheName, payload);
    return payload;
  } catch (error) {
    const payload = buildStockChipInsight(row, {}, "本地估算 · 近120日筹码代理", compactError(error.message));
    writeDiskCache(cacheName, payload);
    return payload;
  }
}

function buildStockChipInsight(row, raw, source, warning = "") {
  const price = Number.isFinite(row.price) ? row.price : pickLatestMarketNumber(raw, ["最新价", "收盘价"]);
  const cost = pickLatestMarketNumber(raw, ["主力持仓成本", "主力成本", "大单成本"]) || pickLatestMarketNumber(raw, ["avl120", "近120日均价", "均价"]) || price;
  const pressure = pickLatestMarketNumber(raw, ["压力位", "上方压力"]) || (cost ? cost * 1.06 : price * 1.06);
  const support = pickLatestMarketNumber(raw, ["支撑位", "下方支撑", "承接位"]) || (cost ? cost * 0.94 : price * 0.94);
  const concentration = pickLatestMarketNumber(raw, ["集中度90", "筹码集中度"]);
  const high120 = pickLatestMarketNumber(raw, ["最高价最大值", "近120日最高价", "最高价"]);
  const low120 = pickLatestMarketNumber(raw, ["最低价最小值", "近120日最低价", "最低价"]);
  const ddeNetAmount = pickLatestMarketNumber(raw, ["dde大单净额", "大单净额"]) ?? row.ddeNetAmount;
  const ddeNetVolume = pickLatestMarketNumber(raw, ["dde大单净量", "大单净买入量", "大单净量"]) ?? row.ddeNetVolume;
  const largeOrderAmount = pickLatestMarketNumber(raw, ["大单总额", "大单金额", "大单成交额"]) ?? row.largeOrderAmount;
  const band = Math.max((concentration || 8) / 100 / 2, 0.018);
  const costLow = cost ? cost * (1 - band) : null;
  const costHigh = cost ? cost * (1 + band) : null;
  const invalid = support ? support * 0.985 : price ? price * 0.96 : null;
  return {
    source,
    warning,
    price,
    cost,
    costLow,
    costHigh,
    pressure,
    support,
    invalid,
    concentration,
    high120,
    low120,
    ddeNetAmount,
    ddeNetVolume,
    largeOrderAmount,
    costZoneText: priceBandText(costLow, costHigh),
    pressureText: priceText(pressure),
    supportText: priceText(support),
    enhancedRiskLine: invalid ? `${priceText(invalid)} 跌破失效，观察 ${priceText(support)} 承接` : "",
    positionText: chipPositionText(price, costLow, costHigh, pressure, support)
  };
}

function priceText(value) {
  return Number.isFinite(value) ? value.toFixed(2) : "待确认";
}

function priceBandText(low, high) {
  if (!Number.isFinite(low) || !Number.isFinite(high)) return "待确认";
  return `${low.toFixed(2)} - ${high.toFixed(2)}`;
}

function chipPositionText(price, costLow, costHigh, pressure, support) {
  if (!Number.isFinite(price)) return "价格位置待确认";
  if (Number.isFinite(pressure) && price >= pressure) return "当前价格靠近或突破上方压力区，追高风险抬升";
  if (Number.isFinite(costHigh) && price > costHigh) return "当前价格位于主力成本区上方，趋势承接占优";
  if (Number.isFinite(costLow) && price >= costLow) return "当前价格处于主力成本区，适合观察承接强弱";
  if (Number.isFinite(support) && price >= support) return "当前价格靠近下方承接区，重点看缩量企稳";
  return "当前价格低于主要承接区，风险线已转弱";
}

function buildAiStockDiagnosis(row, chip) {
  const strengths = [];
  const risks = [];
  if ((row.mainInflow || 0) > 0) strengths.push("主力资金为正");
  if ((row.superInflow || 0) > 0) strengths.push("超大单承接");
  if ((row.ddeNetAmount || 0) > 0) strengths.push("DDE大单净额为正");
  if ((row.largeOrderAmount || 0) > 0) strengths.push("大单成交活跃");
  if ((row.changePct || 0) > 7) risks.push("涨幅消耗偏大");
  if ((row.amplitude || 0) > 10) risks.push("日内分歧偏高");
  if (Number.isFinite(chip.pressure) && Number.isFinite(row.price) && row.price > chip.pressure * 0.98) risks.push("价格接近压力位");
  if ((row.mainInflow || 0) < 0 && (row.superInflow || 0) < 0) risks.push("资金承接转弱");
  return {
    summary: `${strengths.slice(0, 4).join("，") || "资金优势待确认"}；${chip.positionText}`,
    risk: `${risks.slice(0, 4).join("，") || "主要风险来自热度回落和大单承接减弱"}。`,
    invalidCondition: chip.invalid ? `跌破增强风险线 ${priceText(chip.invalid)}，或DDE大单净额转负` : "DDE大单净额转负或热度排名快速回落"
  };
}

async function enrichBoard(board, period) {
  const klines = await getBoardKlines(board.code).catch(() => []);
  const metrics = periodMetrics(klines, period);
  const rotationScore = scoreBoard(board, metrics);
  const status = classifyBoard(board, metrics, rotationScore);
  return {
    ...board,
    period,
    amountChangePct: metrics.amountChangePct,
    periodReturn: metrics.periodReturn,
    avgAmount: metrics.avgAmount,
    positiveRatio: metrics.positiveRatio,
    continuityScore: metrics.continuityScore,
    trend: metrics.trend,
    rotationScore,
    status,
    reason: boardReason(board, metrics),
    risk: boardRisk(board, metrics)
  };
}

function enrichSyntheticBoard(board, period) {
  const amountChangePct = (board.volumeRatio - 1) * 100;
  const metrics = {
    period,
    periodReturn: board.changePct * Math.sqrt(period),
    avgAmount: board.amount,
    amountChangePct: amountChangePct / Math.sqrt(period),
    positiveRatio: board.upRatio,
    continuityScore: Math.max(0, Math.min(20, board.upRatio * 12 + Math.max(board.volumeRatio - 1, 0) * 5)),
    trend: Array.from({ length: Math.min(period, 10) }, (_, index) => {
      const weight = (index + 1) / Math.min(period, 10);
      return {
        date: `T-${Math.min(period, 10) - index - 1}`,
        score: Number((50 + board.changePct * 4 * weight + Math.max(board.volumeRatio - 1, 0) * 10 * weight).toFixed(2)),
        amount: board.amount * weight,
        changePct: board.changePct * weight,
        rank: index + 1
      };
    })
  };
  const rotationScore = scoreBoard(board, metrics);
  return {
    ...board,
    period,
    amountChangePct: metrics.amountChangePct,
    periodReturn: metrics.periodReturn,
    avgAmount: metrics.avgAmount,
    positiveRatio: metrics.positiveRatio,
    continuityScore: metrics.continuityScore,
    trend: metrics.trend,
    rotationScore,
    status: classifyBoard(board, metrics, rotationScore),
    reason: boardReason(board, metrics),
    risk: `${boardRisk(board, metrics)}；映射层结果需结合成分股确认`
  };
}

function buildSyntheticBoardPayload(stockPayload) {
  const rawRows = stockPayload?.data?.diff || [];
  const buckets = new Map();
  syntheticSectorMembers.clear();
  for (const raw of rawRows) {
    const stock = normalize(raw);
    if (!stock) continue;
    const matched = matchSyntheticSectors(stock);
    for (const sector of matched) {
      if (!buckets.has(sector.code)) {
        buckets.set(sector.code, { sector, stocks: [] });
      }
      buckets.get(sector.code).stocks.push(raw);
    }
  }
  const diff = [];
  for (const { sector, stocks } of buckets.values()) {
    if (stocks.length < 3) continue;
    syntheticSectorMembers.set(sector.code, stocks);
    const normalized = stocks.map(normalize).filter(Boolean);
    const amount = normalized.reduce((sum, row) => sum + row.amount, 0);
    if (amount <= 0) continue;
    const weighted = (key) => normalized.reduce((sum, row) => sum + row[key] * row.amount, 0) / amount;
    const mainInflow = normalized.reduce((sum, row) => sum + row.mainInflow, 0);
    const superInflow = normalized.reduce((sum, row) => sum + row.superInflow, 0);
    const largeInflow = normalized.reduce((sum, row) => sum + row.largeInflow, 0);
    const upCount = normalized.filter((row) => row.changePct > 0).length;
    const downCount = normalized.filter((row) => row.changePct < 0).length;
    const flatCount = normalized.length - upCount - downCount;
    const leader = [...normalized].sort((a, b) => b.mainInflow - a.mainInflow)[0];
    diff.push({
      f12: sector.code,
      f14: sector.name,
      f2: 100,
      f3: weighted("changePct"),
      f6: amount,
      f10: weighted("volumeRatio"),
      f62: mainInflow,
      f66: superInflow,
      f69: amount ? (superInflow / amount) * 100 : 0,
      f72: largeInflow,
      f75: amount ? (largeInflow / amount) * 100 : 0,
      f104: upCount,
      f105: downCount,
      f106: flatCount,
      f184: amount ? (mainInflow / amount) * 100 : 0,
      f204: leader?.name || "",
      f205: leader?.code || "",
      f206: leader?.exchange === "SH" ? 1 : 0
    });
  }
  diff.sort((a, b) => b.f62 - a.f62);
  return { data: { diff, total: diff.length } };
}

function matchSyntheticSectors(stock) {
  const text = `${stock.code}${stock.name}`;
  const matches = SYNTHETIC_SECTORS.filter((sector) => sector.re.test(text));
  return matches.length ? matches : [{ code: "SYN999", name: "其他活跃股", re: /.*/ }];
}

function syntheticMembersByBoardName(name) {
  const text = String(name || "");
  const matched = SYNTHETIC_SECTORS.find((sector) => sector.name.includes(text) || text.includes(sector.name));
  if (matched) return syntheticSectorMembers.get(matched.code) || [];
  if (/铜|铝|金属|黄金|稀土|小金属/.test(text)) return syntheticSectorMembers.get("SYN009") || [];
  if (/证券|金融|保险|银行/.test(text)) return syntheticSectorMembers.get("SYN001") || [];
  if (/芯片|半导体|电子/.test(text)) return syntheticSectorMembers.get("SYN002") || [];
  if (/机器人|减速器|执行器/.test(text)) return syntheticSectorMembers.get("SYN006") || [];
  return [];
}

async function mappedStocksForBoard(name) {
  const market = await getMarketPayload();
  buildSyntheticBoardPayload(market.payload);
  return syntheticMembersByBoardName(name);
}

function compactError(message) {
  const raw = String(message || "").replace(/\r/g, "\n").trim();
  if (/次数已用完|升级权益|额度/.test(raw) && /问财|iwencai|SkillHub|10jqka/.test(raw)) {
    return "同花顺问财今日调用额度已用完，请等待额度恢复或升级问财 SkillHub 权益";
  }
  let text = raw
    .replace(/Command failed:[^\n]*/g, "命令执行失败")
    .replace(/\/Users\/[^/\s]+\/[^\s]+/g, "[local-path]")
    .replace(/[A-Za-z]:\\[^\s]+/g, "[local-path]");
  const meaningful = text
    .split(/[\n|]/)
    .map((part) => part.trim())
    .find((part) => part && part !== "命令执行失败");
  return (meaningful || text || "未知错误").slice(0, 120);
}

function activeMarketProvider() {
  return DATA_PROVIDER === "eastmoney" ? "eastmoney" : "hithink";
}

function marketCacheKey(provider) {
  return provider === "eastmoney" ? "market" : "market-hithink";
}

function sourceMeta(payload) {
  return payload?.__source || {};
}

function attachSource(payload, meta) {
  return { ...payload, __source: meta };
}

function marketSource(market) {
  const base = market.source || "同花顺问财 OpenAPI";
  if (market.cacheStatus === "stale") return `${base} · cached fallback`;
  if (market.cacheStatus === "disk") return `${base} · disk cache`;
  return base;
}

function marketWarning(market, label) {
  if (market.warning) return market.warning;
  if (market.cacheStatus === "stale" || market.cacheStatus === "disk") {
    return `${label}连接中断，已显示 ${Math.round(market.ageMs / 1000)} 秒前缓存`;
  }
  return "";
}

function marketSession(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(now).map((part) => [part.type, part.value]));
  const weekday = parts.weekday;
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  const minutes = hour * 60 + minute;
  const tradingDay = !["Sat", "Sun"].includes(weekday);
  if (!tradingDay) return { phase: "closed", text: "非交易日", suggestedRefreshMs: REFRESH_CLOSED_MS };
  if (minutes >= 9 * 60 + 15 && minutes < 9 * 60 + 30) {
    return { phase: "preopen", text: "集合竞价", suggestedRefreshMs: REFRESH_ACTIVE_MS };
  }
  if ((minutes >= 9 * 60 + 30 && minutes <= 11 * 60 + 30) || (minutes >= 13 * 60 && minutes <= 15 * 60)) {
    return { phase: "trading", text: "盘中交易", suggestedRefreshMs: REFRESH_ACTIVE_MS };
  }
  if (minutes > 11 * 60 + 30 && minutes < 13 * 60) {
    return { phase: "lunch", text: "午间休市", suggestedRefreshMs: REFRESH_LUNCH_MS };
  }
  return { phase: "closed", text: "非交易时段", suggestedRefreshMs: REFRESH_CLOSED_MS };
}

function dataStateFromCache(source = {}, label = "数据") {
  const normalizedStatus = normalizeCacheStatus(source.cacheStatus, source.ageMs);
  const session = marketSession();
  const ageMs = Math.max(0, Number(source.ageMs) || 0);
  const stale = normalizedStatus === "stale" || normalizedStatus === "disk";
  const severity = stale ? normalizedStatus === "disk" ? "bad" : "warn" : "good";
  return {
    label,
    cacheStatus: normalizedStatus,
    cacheStatusText: cacheStatusText(normalizedStatus),
    severity,
    ageMs,
    ageText: ageText(ageMs),
    marketPhase: session.phase,
    marketPhaseText: session.text,
    suggestedRefreshMs: session.suggestedRefreshMs,
    minRefreshMs: 30_000,
    realtimeText: stale ? "显示缓存行情" : "公开接口轮询更新",
    quotaHint: "盘中建议60-120秒；页面隐藏暂停，午间和收盘后自动降频；服务端10秒内存缓存会合并重复请求"
  };
}

function combineDataStates(states = [], label = "综合数据") {
  const valid = states.filter(Boolean);
  if (!valid.length) return dataStateFromCache({ cacheStatus: "live", ageMs: 0 }, label);
  const worst = [...valid].sort((a, b) => severityRank(b.severity) - severityRank(a.severity))[0];
  const maxAge = valid.reduce((max, item) => Math.max(max, item.ageMs || 0), 0);
  const session = marketSession();
  return {
    ...worst,
    label,
    ageMs: maxAge,
    ageText: ageText(maxAge),
    marketPhase: session.phase,
    marketPhaseText: session.text,
    suggestedRefreshMs: Math.max(session.suggestedRefreshMs, worst.suggestedRefreshMs || REFRESH_ACTIVE_MS),
    sources: valid.map((item) => ({ label: item.label, cacheStatus: item.cacheStatus, severity: item.severity, ageMs: item.ageMs }))
  };
}

function normalizeCacheStatus(status, ageMs = 0) {
  if (status === "live") return "live";
  if (status === "fresh") return "fresh";
  if (status === "stale") return "stale";
  if (status === "disk") return "disk";
  if (status === "partial") return "stale";
  if (status === "synthetic" || status === "hithink-synthetic") return (Number(ageMs) || 0) <= FRESH_CACHE_MS ? "fresh" : "stale";
  return "live";
}

function cacheStatusText(status) {
  if (status === "live") return "实时更新";
  if (status === "fresh") return "刚更新";
  if (status === "stale") return "缓存兜底";
  if (status === "disk") return "磁盘缓存";
  return "状态待确认";
}

function severityRank(value) {
  if (value === "bad") return 3;
  if (value === "warn") return 2;
  return 1;
}

function ageText(ms) {
  const seconds = Math.round((Number(ms) || 0) / 1000);
  if (seconds < 1) return "刚刚";
  if (seconds < 60) return `${seconds}秒前`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.round(minutes / 60);
  return `${hours}小时前`;
}

function cachePath(name) {
  return path.join(CACHE_DIR, `${name}.json`);
}

function writeDiskCache(name, payload) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(cachePath(name), JSON.stringify({ fetchedAt: Date.now(), payload }), "utf8");
  } catch {
    // Cache writes are best-effort.
  }
}

function readDiskCache(name, maxAgeMs) {
  try {
    const cached = JSON.parse(fs.readFileSync(cachePath(name), "utf8"));
    const ageMs = Date.now() - cached.fetchedAt;
    if (cached.payload && ageMs <= maxAgeMs) return { payload: cached.payload, ageMs };
  } catch {
    return null;
  }
  return null;
}

function safeCacheName(value) {
  return String(value || "default")
    .replace(/[^\w\u4e00-\u9fa5-]+/g, "_")
    .slice(0, 80);
}

async function getSectorNews(board, stocks = []) {
  const cacheName = `sector-events-week-${safeCacheName(board.name)}`;
  const disk = readDiskCache(cacheName, NEWS_CACHE_MS);
  if (disk) return disk.payload;
  const leaderNames = stocks.slice(0, 3).map((row) => row.name).filter(Boolean).join(" ");
  const query = `${board.name} ${leaderNames} A股 最近一周 热点事件 利好消息 产业趋势 受益股`;
  try {
    const raw = await requestNewsSearchRaw(query);
    const allItems = extractNewsItems(raw);
    const recentItems = allItems.filter((item) => isRecentNewsItem(item, 7));
    const items = enrichSectorEvents(recentItems.slice(0, 3), board, stocks);
    const payload = {
      query,
      source: "同花顺财经资讯搜索 · 最近一周热点事件",
      period: "最近一周",
      empty: items.length === 0,
      items: items.length ? items : [emptyNewsItem()]
    };
    writeDiskCache(cacheName, payload);
    return payload;
  } catch (error) {
    return {
      query,
      source: "同花顺财经资讯搜索 · 最近一周热点事件",
      period: "最近一周",
      empty: true,
      warning: compactError(error.message),
      items: [emptyNewsItem()]
    };
  }
}

async function getSectorInterpretation(board, stocks = [], news = {}) {
  const cacheName = `sector-interpretation-v4-week-${safeCacheName(board.name)}`;
  const disk = readDiskCache(cacheName, NEWS_CACHE_MS);
  if (disk) return disk.payload;
  const fallback = buildRuleSectorInterpretation(board, stocks, news);
  const query = buildSectorInterpretationPrompt(board, stocks, news);
  try {
    const raw = await requestIwenCaiModelRaw(query);
    const text = extractIwenCaiAnswerText(raw);
    if (!text) throw new Error("问财模型未返回可解析文本");
    const parsed = parseSectorInterpretationJson(text);
    const payload = normalizeSectorInterpretation(parsed || { rawText: text }, fallback, {
      source: "同花顺问财模型 · 最近一周热点事件解读",
      query,
      rawText: text
    });
    writeDiskCache(cacheName, payload);
    return payload;
  } catch (error) {
    return {
      ...fallback,
      source: "本地规则解读 · 问财模型待确认",
      query,
      warning: compactError(error.message)
    };
  }
}

function buildSectorInterpretationPrompt(board, stocks = [], news = {}) {
  const leaders = stocks.slice(0, 8).map((row, index) => {
    return `${index + 1}. ${row.name}(${row.code}) 涨幅${pctShort(row.changePct)} 成交额${moneyShort(row.amount)} 量比${Number.isFinite(row.volumeRatio) ? row.volumeRatio.toFixed(2) : "待确认"} 主力${moneyShort(row.mainInflow)} 超大单${moneyShort(row.superInflow)} DDE${moneyShort(row.ddeNetAmount)}`;
  }).join("\n");
  const events = (news.items || [])
    .filter((item) => item && item.title && item.title !== "暂无明确利好，等待确认")
    .slice(0, 5)
    .map((item, index) => `${index + 1}. ${item.title}｜${item.source || "待确认"}｜${item.publishTime || "待确认"}｜${item.summary || ""}`)
    .join("\n");
  return [
    `请用A股短线复盘视角，生成「${board.name}」板块热点事件解读。`,
    "要求解释：板块为什么涨、哪些股票受益、持续性如何、后续观察信号和风险。",
    "请只输出JSON，不要输出Markdown。",
    "JSON字段：headline, coreConclusion, driverLogic对象{summary, points数组{title,text}, investmentMeaning}, whyRise数组, beneficiaries数组{name, reason}, continuity对象{level,text}, watchSignals数组, risks数组。",
    "driverLogic.summary 用「政策催化 + 估值修复 + 资金回流」这类短语概括；driverLogic.points 写清每条驱动的事件、数据、资金或产业链依据；driverLogic.investmentMeaning 写短线和中线含义。",
    `板块数据：状态${board.status}，今日涨跌幅${pctShort(board.changePct)}，成交额${moneyShort(board.amount)}，成交额变化${pctShort(board.amountChangePct)}，主力净流入估算${moneyShort(board.mainInflow)}，超大单净流入估算${moneyShort(board.superInflow)}，上涨家数占比${pctShort((board.upRatio || 0) * 100)}，量比均值${Number.isFinite(board.volumeRatio) ? board.volumeRatio.toFixed(2) : "待确认"}，轮动评分${Number.isFinite(board.rotationScore) ? board.rotationScore.toFixed(1) : "待确认"}。`,
    `强势股：\n${leaders || "暂无强势股数据"}`,
    `最近一周事件：\n${events || "暂无明确事件，结合资金和强势股生成判断"}`
  ].join("\n\n");
}

function buildRuleSectorInterpretation(board, stocks = [], news = {}) {
  const validEvents = (news.items || []).filter((item) => item && item.title && item.title !== "暂无明确利好，等待确认");
  const leaders = stocks.slice(0, 5);
  const eventText = validEvents[0]?.title ? `最近事件聚焦「${validEvents[0].title}」` : "最近一周暂无明确单一利好，资金和强势股表现是主要观察依据";
  const flowText = `主力净流入估算${moneyShort(board.mainInflow)}，超大单净流入估算${moneyShort(board.superInflow)}`;
  const breadthText = `上涨家数占比${pctShort((board.upRatio || 0) * 100)}，量比均值${Number.isFinite(board.volumeRatio) ? board.volumeRatio.toFixed(2) : "待确认"}`;
  const continuity = sectorContinuity(board);
  const driverLogic = buildSectorDriverLogic(board, leaders, validEvents, flowText, breadthText, eventText);
  return {
    source: "本地规则解读",
    generatedAt: new Date().toLocaleString("zh-CN", { hour12: false, timeZoneName: "short" }),
    headline: `${board.name}热点解读：${board.status}，${flowText}`,
    coreConclusion: `${board.name}当前处于${board.status}状态，今日涨幅${pctShort(board.changePct)}，成交额${moneyShort(board.amount)}，成交额变化${pctShort(board.amountChangePct)}。${eventText}，短线重点看核心股承接和资金连续性。`,
    driverLogic,
    whyRise: [
      `${flowText}，资金承接是板块轮动评分的重要支撑。`,
      `${breadthText}，板块内部扩散程度决定行情持续性。`,
      `${eventText}。`
    ],
    beneficiaries: leaders.length ? leaders.map((row) => ({
      name: `${row.name}(${row.code})`,
      reason: `涨幅${pctShort(row.changePct)}，成交额${moneyShort(row.amount)}，主力${moneyShort(row.mainInflow)}，${row.reason || "观察资金承接"}`
    })) : [{ name: "待确认", reason: "暂无满足成交额门槛的强势成分股。" }],
    continuity,
    watchSignals: [
      `${board.name}成交额继续放大，主力和超大单维持正流入。`,
      `板块内至少2-3只核心股保持强承接，回落后能收回分时均线。`,
      `上涨家数占比维持在60%以上，量比均值保持活跃。`
    ],
    risks: sectorInterpretationRisks(board, leaders),
    references: validEvents.slice(0, 3).map((item) => ({
      title: item.title,
      source: item.source || "待确认",
      publishTime: item.publishTime || "待确认"
    })),
    rawText: ""
  };
}

function buildSectorDriverLogic(board, leaders = [], events = [], flowText = "", breadthText = "", eventText = "") {
  const text = `${board.name} ${events.map((item) => `${item.title} ${item.summary}`).join(" ")}`;
  const tags = [];
  if (/医药|医疗|创新药|CRO|减肥药|重组蛋白/.test(text)) tags.push("政策催化");
  if (/政策|医保|目录|商保|创新药|会议|规划|补贴|监管/.test(text)) tags.push("政策催化");
  if (/涨价|提价|供需|订单|中标|合同|产能|扩产/.test(text)) tags.push("产业催化");
  if (/业绩|预增|利润|营收|财报/.test(text)) tags.push("业绩催化");
  if (/医药|消费|证券|地产|白酒|金融|保险/.test(text) || (board.status === "强势" && (board.changePct || 0) > 0)) tags.push("估值修复");
  if ((board.mainInflow || 0) > 0 || (board.superInflow || 0) > 0) tags.push("资金回流");
  if ((board.upRatio || 0) >= 0.6 || leaders.length >= 3) tags.push("细分扩散");
  const summary = [...new Set(tags)].slice(0, 4).join(" + ") || "事件催化 + 资金承接 + 板块扩散";
  const primaryEvent = relevantSectorEvent(board, events);
  const points = [];
  points.push({
    title: driverEventTitle(board, primaryEvent),
    text: primaryEvent
      ? `${primaryEvent.publishTime || "近期"}，${primaryEvent.title}。${primaryEvent.summary || "事件催化提升市场关注度"}，板块热度获得事件侧支撑。`
      : /医药|医疗|创新药|CRO/.test(board.name)
        ? "医保目录、商保创新药目录、创新药审评等政策预期提升市场关注度，资金更容易向创新药产业链扩散。"
      : `${eventText}，当前驱动更多来自资金和价格行为验证。`
  });
  points.push({
    title: `${board.name}细分扩散`,
    text: leaders.length
      ? `${leaders.slice(0, 4).map((row) => row.name).join("、")}等核心股同步走强，${breadthText}，说明资金在板块内部扩散。`
      : `${breadthText}，继续观察强势成分股数量能否增加。`
  });
  points.push({
    title: "资金面配合",
    text: `${flowText}，成交额${moneyShort(board.amount)}，成交额变化${pctShort(board.amountChangePct)}，行业资金偏好正在强化。`
  });
  return {
    summary,
    points,
    investmentMeaning: sectorInvestmentMeaning(board, summary)
  };
}

function relevantSectorEvent(board, events = []) {
  const boardText = String(board.name || "");
  const keywords = sectorEventKeywords(boardText);
  return events.find((item) => {
    const text = `${item.title || ""} ${item.summary || ""}`;
    return keywords.some((keyword) => text.includes(keyword));
  }) || null;
}

function sectorEventKeywords(boardName) {
  if (/医药|医疗|创新药|CRO/.test(boardName)) return ["医药", "医疗", "创新药", "医保", "商保", "药品", "CRO", "减肥药", "重组蛋白"];
  if (/半导体|芯片|电子/.test(boardName)) return ["半导体", "芯片", "晶圆", "封装", "存储", "国产替代"];
  if (/机器人/.test(boardName)) return ["机器人", "减速器", "执行器", "工业母机"];
  if (/证券|金融/.test(boardName)) return ["证券", "券商", "金融", "资本市场"];
  if (/消费|白酒|食品/.test(boardName)) return ["消费", "白酒", "食品", "饮料"];
  const compact = boardName.replace(/板块|行业|概念/g, "");
  return compact ? [compact, ...compact.split(/[、/]/).filter((part) => part.length >= 2)] : [];
}

function driverEventTitle(board, event) {
  const text = `${board.name} ${event?.title || ""} ${event?.summary || ""}`;
  if (/医保|目录|商保/.test(text)) return "医保目录调整催化";
  if (/医药|医疗|创新药|CRO/.test(text)) return "医保/创新药政策预期催化";
  if (/政策|规划|补贴|会议/.test(text)) return "政策预期催化";
  if (/订单|中标|合同/.test(text)) return "订单验证催化";
  if (/涨价|提价|供需/.test(text)) return "供需涨价催化";
  if (/业绩|预增|利润|营收/.test(text)) return "业绩兑现催化";
  return `${board.name}事件催化`;
}

function sectorInvestmentMeaning(board, summary) {
  const shortTerm = `${board.name}当前属于“${summary}”驱动的弹性行情，短线看成交额放大、核心股承接和资金集中流入。`;
  const midTerm = /医药|医疗|创新药|CRO/.test(board.name)
    ? "中线持续性取决于创新药管线、临床数据、商业化能力、医保准入预期和行业资金连续性，单纯蹭概念的个股持续性偏弱。"
    : "中线持续性取决于产业趋势兑现、业绩验证和资金连续性，单纯蹭概念的个股持续性偏弱。";
  if ((board.changePct || 0) > 5) return `${shortTerm} 今日涨幅偏高，后续重点看回踩时能否缩量企稳。${midTerm}`;
  return `${shortTerm} ${midTerm}`;
}

function sectorContinuity(board) {
  let score = 0;
  if (board.status === "强势") score += 2;
  if (board.status === "升温") score += 1;
  if ((board.mainInflow || 0) > 0) score += 1;
  if ((board.superInflow || 0) > 0) score += 1;
  if ((board.upRatio || 0) >= 0.6) score += 1;
  if ((board.amountChangePct || 0) > 0) score += 1;
  const level = score >= 5 ? "较强" : score >= 3 ? "中等" : "偏弱";
  return {
    level,
    text: `${board.name}持续性取决于资金连续净流入、上涨家数扩散和核心股分时承接。当前评分因子为${score}，短线按${level}处理。`
  };
}

function sectorInterpretationRisks(board, leaders = []) {
  const risks = [];
  if ((board.changePct || 0) > 5) risks.push("板块涨幅较大，日内追高需要等待回踩承接确认。");
  if ((board.upRatio || 0) < 0.55) risks.push("上涨家数占比不足，板块内部存在分化。");
  if ((board.mainInflow || 0) < 0 || (board.superInflow || 0) < 0) risks.push("主力或超大单资金转弱，持续性需要重新确认。");
  if (leaders.some((row) => (row.amplitude || 0) > 10)) risks.push("核心股振幅偏大，短线情绪波动加剧。");
  if (!risks.length) risks.push("重点防范高开低走、成交额缩量和核心股资金转负。");
  return risks;
}

function normalizeSectorInterpretation(value = {}, fallback = {}, meta = {}) {
  const rawText = String(value.rawText || meta.rawText || "").trim();
  const headline = nonEmptyText(value.headline) || fallback.headline;
  const coreConclusion = nonEmptyText(value.coreConclusion || value.conclusion || value.summary) || textFromRaw(rawText) || fallback.coreConclusion;
  const driverLogic = normalizeDriverLogic(value.driverLogic || value.driveLogic || value.drivingLogic || value.logic, fallback.driverLogic);
  const whyRise = normalizeStringList(value.whyRise || value.reasons || value.why || value.upReason, fallback.whyRise);
  const beneficiaries = normalizeBeneficiaries(value.beneficiaries || value.stocks || value.benefitStocks, fallback.beneficiaries);
  const continuity = normalizeContinuity(value.continuity, fallback.continuity);
  const watchSignals = normalizeStringList(value.watchSignals || value.signals || value.observe, fallback.watchSignals);
  const risks = normalizeStringList(value.risks || value.risk || value.riskTips, fallback.risks);
  return {
    ...fallback,
    ...meta,
    generatedAt: new Date().toLocaleString("zh-CN", { hour12: false, timeZoneName: "short" }),
    headline,
    coreConclusion,
    driverLogic,
    whyRise,
    beneficiaries,
    continuity,
    watchSignals,
    risks,
    rawText
  };
}

function normalizeDriverLogic(value, fallback = {}) {
  if (typeof value === "string") {
    return {
      summary: value.trim() || fallback.summary || "事件催化 + 资金承接",
      points: fallback.points || [],
      investmentMeaning: fallback.investmentMeaning || ""
    };
  }
  if (value && typeof value === "object") {
    return {
      summary: nonEmptyText(value.summary || value.title || value.logic) || fallback.summary || "事件催化 + 资金承接",
      points: normalizeDriverPoints(value.points || value.items || value.details, fallback.points),
      investmentMeaning: nonEmptyText(value.investmentMeaning || value.meaning || value.investment || value.投资含义) || fallback.investmentMeaning || ""
    };
  }
  return fallback;
}

function normalizeDriverPoints(value, fallback = []) {
  const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[；;\n]/) : [];
  const points = source.map((item) => {
    if (typeof item === "string") {
      const [title, ...rest] = item.split(/[:：]/);
      return {
        title: (title || "驱动逻辑").replace(/^[\d.、\-\s]+/, "").trim(),
        text: (rest.join("：") || item).trim()
      };
    }
    return {
      title: String(item?.title || item?.name || item?.label || "驱动逻辑").trim(),
      text: String(item?.text || item?.reason || item?.summary || item?.detail || "").trim()
    };
  }).filter((item) => item.title && item.text).slice(0, 6);
  return points.length ? points : fallback || [];
}

function normalizeStringList(value, fallback = []) {
  const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[；;\n]/) : [];
  const list = source
    .map((item) => typeof item === "string" ? item : item?.text || item?.reason || item?.summary || "")
    .map((item) => String(item || "").replace(/^[\d.、\-\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 6);
  return list.length ? list : fallback;
}

function normalizeBeneficiaries(value, fallback = []) {
  const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[；;\n]/) : [];
  const list = source.map((item) => {
    if (typeof item === "string") {
      const [name, ...rest] = item.split(/[:：]/);
      return { name: (name || "受益股").trim(), reason: (rest.join("：") || item).trim() };
    }
    return {
      name: String(item?.name || item?.stock || item?.股票 || "待确认").trim(),
      reason: String(item?.reason || item?.logic || item?.原因 || "受益逻辑待确认").trim()
    };
  }).filter((item) => item.name && item.reason).slice(0, 8);
  return list.length ? list : fallback;
}

function normalizeContinuity(value, fallback = {}) {
  if (typeof value === "string") return { level: fallback.level || "待确认", text: value.trim() || fallback.text || "" };
  if (value && typeof value === "object") {
    return {
      level: nonEmptyText(value.level || value.grade || value.持续性) || fallback.level || "待确认",
      text: nonEmptyText(value.text || value.reason || value.summary || value.判断) || fallback.text || ""
    };
  }
  return fallback;
}

function nonEmptyText(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text || "";
}

function textFromRaw(rawText) {
  if (!rawText) return "";
  return rawText.replace(/```json|```/g, "").replace(/\s+/g, " ").slice(0, 300);
}

function parseSectorInterpretationJson(text) {
  const cleaned = String(text || "").replace(/```json|```/g, "").trim();
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) return null;
  try {
    return JSON.parse(cleaned.slice(first, last + 1));
  } catch {
    return null;
  }
}

function extractIwenCaiAnswerText(raw) {
  const candidates = [];
  collectIwenCaiText(raw, candidates, "");
  const relevant = candidates
    .map((item) => ({ ...item, text: item.text.replace(/\s+/g, " ").trim() }))
    .filter((item) => item.text.length >= 40 && /板块|上涨|受益|持续|风险|资金|热点/.test(item.text))
    .sort((a, b) => b.priority - a.priority || b.text.length - a.text.length);
  return relevant[0]?.text || "";
}

function collectIwenCaiText(value, out, key) {
  if (!value) return;
  if (typeof value === "string") {
    const priority = /answer|content|result|text|summary|conclusion|source_original/i.test(key) ? 10 : 0;
    out.push({ text: value, priority });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectIwenCaiText(item, out, key));
    return;
  }
  if (typeof value !== "object") return;
  for (const [childKey, childValue] of Object.entries(value)) {
    collectIwenCaiText(childValue, out, childKey);
  }
}

function requestIwenCaiModelRaw(query) {
  const apiKey = process.env.IWENCAI_API_KEY || "";
  if (!apiKey) return Promise.reject(new Error("IWENCAI_API_KEY 未配置"));
  const body = JSON.stringify({
    channels: ["news"],
    app_id: "AIME_SKILL",
    query
  });
  const options = {
    method: "POST",
    hostname: "openapi.iwencai.com",
    path: "/v1/comprehensive/search",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
      "X-Claw-Call-Type": "normal",
      "X-Claw-Skill-Id": "news-search",
      "X-Claw-Skill-Version": "1.0.0",
      "X-Claw-Plugin-Id": "none",
      "X-Claw-Plugin-Version": "none",
      "X-Claw-Trace-Id": crypto.randomBytes(32).toString("hex")
    },
    timeout: 15_000
  };
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let response = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        response += chunk;
      });
      res.on("end", () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`问财模型调用失败：${res.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(response));
        } catch (error) {
          reject(new Error(`问财模型 JSON 解析失败：${error.message}`));
        }
      });
    });
    req.on("timeout", () => req.destroy(new Error("问财模型请求超时")));
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function emptyNewsItem() {
  return {
    title: "暂无明确利好，等待确认",
    source: "系统提示",
    publishTime: "待确认",
    summary: "当前未匹配到可用的板块利好资讯。",
    eventType: "待确认",
    impact: "热点驱动待确认，优先观察板块成交额和龙头承接。",
    relatedStocks: "待确认",
    risk: "等待消息源和资金线同步确认。",
    url: ""
  };
}

function parseNewsTime(value) {
  const text = String(value || "").trim();
  if (!text || text === "待确认") return null;
  const normalized = text.replace(/[年月]/g, "-").replace(/日/g, "").replace(/\./g, "-").replace(/\//g, "-");
  const matched = normalized.match(/(\d{4}-\d{1,2}-\d{1,2})(?:\s+(\d{1,2}:\d{1,2}(?::\d{1,2})?))?/);
  if (!matched) return null;
  const date = new Date(`${matched[1]}T${matched[2] || "00:00:00"}+08:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isRecentNewsItem(item, days) {
  const date = parseNewsTime(item.publishTime);
  if (!date) return false;
  return Date.now() - date.getTime() <= days * 24 * 60 * 60_000 && Date.now() >= date.getTime() - 60 * 60_000;
}

function enrichSectorEvents(items, board, stocks) {
  return items.map((item) => {
    const text = `${item.title} ${item.summary}`;
    const related = stocks
      .filter((row) => text.includes(row.name) || text.includes(row.code))
      .slice(0, 4)
      .map((row) => row.name);
    const fallbackRelated = stocks.slice(0, 3).map((row) => row.name);
    return {
      ...item,
      eventType: sectorEventType(text),
      impact: sectorEventImpact(board, text),
      relatedStocks: [...new Set(related.length ? related : fallbackRelated)].join("、") || "待确认",
      risk: "观察热点消息能否转化为成交额放大和核心股承接。"
    };
  });
}

function sectorEventType(text) {
  if (/订单|中标|合同|涨价|提价|供需|扩产|产能/.test(text)) return "产业催化";
  if (/政策|监管|会议|规划|补贴|税|发布/.test(text)) return "政策催化";
  if (/业绩|预增|利润|营收|财报/.test(text)) return "业绩催化";
  if (/并购|重组|增持|回购|定增/.test(text)) return "资本运作";
  return "热点事件";
}

function sectorEventImpact(board, text) {
  const drivers = [];
  if (/涨价|提价|供需/.test(text)) drivers.push("价格弹性");
  if (/AI|算力|芯片|机器人|低空|储能|新能源|军工/.test(text)) drivers.push("题材辨识度");
  if (/政策|规划|补贴/.test(text)) drivers.push("政策预期");
  if (/业绩|预增|订单/.test(text)) drivers.push("基本面确认");
  const driverText = drivers.length ? drivers.join("、") : "消息关注度";
  return `${board.name}事件驱动来自${driverText}，需要结合主力净流入和上涨家数占比确认持续性。`;
}

function requestNewsSearchRaw(query) {
  const apiKey = process.env.IWENCAI_API_KEY || "";
  if (!apiKey) return Promise.reject(new Error("IWENCAI_API_KEY 未配置"));
  const body = JSON.stringify({
    channels: ["news"],
    app_id: "AIME_SKILL",
    query
  });
  const options = {
    method: "POST",
    hostname: "openapi.iwencai.com",
    path: "/v1/comprehensive/search",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
      "X-Claw-Call-Type": "normal",
      "X-Claw-Skill-Id": "news-search",
      "X-Claw-Skill-Version": "1.0.0",
      "X-Claw-Plugin-Id": "none",
      "X-Claw-Plugin-Version": "none",
      "X-Claw-Trace-Id": crypto.randomBytes(32).toString("hex")
    },
    timeout: 8_000
  };
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let response = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        response += chunk;
      });
      res.on("end", () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`news-search failed: ${res.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(response));
        } catch (error) {
          reject(new Error(`news-search JSON parse failed: ${error.message}`));
        }
      });
    });
    req.on("timeout", () => req.destroy(new Error("news-search timeout")));
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function extractNewsItems(raw) {
  const candidates = [];
  collectNewsCandidates(raw, candidates);
  const seen = new Set();
  return candidates
    .filter((item) => item.title && !seen.has(item.title) && seen.add(item.title))
    .map((item) => ({
      title: String(item.title || "").slice(0, 80),
      source: String(item.source || "同花顺资讯").slice(0, 30),
      publishTime: String(item.publishTime || "待确认").slice(0, 32),
      summary: String(item.summary || item.title || "").replace(/\s+/g, " ").slice(0, 120),
      url: String(item.url || "")
    }));
}

function collectNewsCandidates(value, out) {
  if (!value) return;
  if (Array.isArray(value)) {
    value.forEach((item) => collectNewsCandidates(item, out));
    return;
  }
  if (typeof value !== "object") return;
  const title = value.title || value.news_title || value.name;
  const summary = value.summary || value.abstract || value.content || value.source_original;
  if (title && (summary || value.url)) {
    out.push({
      title,
      summary,
      url: value.url || value.link || value.news_url,
      source: value.extra?.publish_source || value.extra?.real_publish_source || value.source || value.media || value.data_source,
      publishTime: value.publish_date || value.publish_time || value.time || value.datetime
    });
  }
  for (const child of Object.values(value)) collectNewsCandidates(child, out);
}

function rankChange(board, allBoards, period) {
  if (!board.trend.length || period === 1) return 0;
  const historicalScore = board.trend[0].score;
  const currentRank = allBoards.findIndex((item) => item.code === board.code) + 1;
  const historicalRank = [...allBoards]
    .sort((a, b) => {
      const left = a.trend[0]?.score || 0;
      const right = b.trend[0]?.score || 0;
      return right - left;
    })
    .findIndex((item) => item.code === board.code) + 1;
  return historicalScore ? historicalRank - currentRank : 0;
}

async function getMarketPayload() {
  const now = Date.now();
  const provider = activeMarketProvider();
  if (marketCache.provider && marketCache.provider !== provider) {
    marketCache.payload = null;
    marketCache.fetchedAt = 0;
    marketCache.pending = null;
    marketCache.source = "";
    marketCache.warning = "";
  }
  marketCache.provider = provider;
  if (marketCache.payload && now - marketCache.fetchedAt < FRESH_CACHE_MS) {
    return {
      payload: marketCache.payload,
      cacheStatus: "fresh",
      ageMs: now - marketCache.fetchedAt,
      source: marketCache.source,
      warning: marketCache.warning,
      provider
    };
  }
  if (!marketCache.payload) {
    const disk = readDiskCache(marketCacheKey(provider), DISK_CACHE_MS);
    if (disk) {
      const meta = sourceMeta(disk.payload);
      marketCache.payload = disk.payload;
      marketCache.fetchedAt = Date.now() - disk.ageMs;
      marketCache.source = meta.source || (provider === "hithink" ? "同花顺问财 OpenAPI" : "Eastmoney public quote API");
      marketCache.warning = meta.warning || "";
      return {
        payload: disk.payload,
        cacheStatus: "disk",
        ageMs: disk.ageMs,
        source: marketCache.source,
        warning: marketCache.warning,
        provider
      };
    }
  }
  if (marketCache.pending) return marketCache.pending;

  marketCache.pending = requestMarketPayload()
    .then(({ payload, host, source, warning = "", provider: actualProvider = provider }) => {
      marketCache.payload = payload;
      marketCache.fetchedAt = Date.now();
      marketCache.lastGoodHost = host;
      marketCache.source = source;
      marketCache.warning = warning;
      writeDiskCache(marketCacheKey(provider), attachSource(payload, { source, provider: actualProvider, warning }));
      return { payload, cacheStatus: "live", ageMs: 0, source, warning, provider: actualProvider };
    })
    .catch((error) => {
      const ageMs = Date.now() - marketCache.fetchedAt;
      if (marketCache.payload && ageMs < STALE_CACHE_MS) {
        return {
          payload: marketCache.payload,
          cacheStatus: "stale",
          ageMs,
          source: marketCache.source,
          warning: marketCache.warning,
          provider
        };
      }
      const disk = readDiskCache(marketCacheKey(provider), DISK_CACHE_MS);
      if (disk) {
        const meta = sourceMeta(disk.payload);
        return {
          payload: disk.payload,
          cacheStatus: "disk",
          ageMs: disk.ageMs,
          source: meta.source || marketCache.source,
          warning: meta.warning || "",
          provider
        };
      }
      throw new Error(`行情源连接中断：${compactError(error.message)}`);
    })
    .finally(() => {
      marketCache.pending = null;
    });
  return marketCache.pending;
}

async function getBoardPayload() {
  if (activeMarketProvider() === "hithink") {
    const market = await getMarketPayload();
    return {
      payload: buildSyntheticBoardPayload(market.payload),
      cacheStatus: "hithink-synthetic",
      ageMs: market.ageMs || 0,
      source: `${marketSource(market)} · 股票级板块映射`,
      warning: marketWarning(market, "行情源")
    };
  }
  const now = Date.now();
  if (boardCache.payload && now - boardCache.fetchedAt < FRESH_CACHE_MS) {
    return { payload: boardCache.payload, cacheStatus: "fresh", ageMs: now - boardCache.fetchedAt };
  }
  if (!boardCache.payload) {
    const disk = readDiskCache("boards", DISK_CACHE_MS);
    if (disk) {
      boardCache.payload = disk.payload;
      boardCache.fetchedAt = Date.now() - disk.ageMs;
      return { payload: disk.payload, cacheStatus: "disk", ageMs: disk.ageMs };
    }
  }
  if (boardCache.pending) return boardCache.pending;

  boardCache.pending = requestEastmoneyPath(BOARD_PATH, boardCache.lastGoodHost)
    .then(({ payload, host }) => {
      boardCache.payload = payload;
      boardCache.fetchedAt = Date.now();
      boardCache.lastGoodHost = host;
      writeDiskCache("boards", payload);
      return { payload, cacheStatus: "live", ageMs: 0 };
    })
    .catch((error) => {
      const ageMs = Date.now() - boardCache.fetchedAt;
      if (boardCache.payload && ageMs < STALE_CACHE_MS) {
        return { payload: boardCache.payload, cacheStatus: "stale", ageMs };
      }
      const disk = readDiskCache("boards", DISK_CACHE_MS);
      if (disk) return { payload: disk.payload, cacheStatus: "disk", ageMs: disk.ageMs };
      throw new Error(`板块行情源连接中断：${compactError(error.message)}`);
    })
    .finally(() => {
      boardCache.pending = null;
    });
  return boardCache.pending;
}

async function getHotLeaderPayload() {
  const now = Date.now();
  if (hotLeaderCache.payload && now - hotLeaderCache.fetchedAt < FRESH_CACHE_MS) {
    return { payload: hotLeaderCache.payload, cacheStatus: "fresh", ageMs: now - hotLeaderCache.fetchedAt };
  }
  if (!hotLeaderCache.payload) {
    const disk = readDiskCache(HOT_LEADER_CACHE_NAME, DISK_CACHE_MS);
    if (disk) {
      hotLeaderCache.payload = disk.payload;
      hotLeaderCache.fetchedAt = Date.now() - disk.ageMs;
      return { payload: disk.payload, cacheStatus: "disk", ageMs: disk.ageMs };
    }
  }
  if (hotLeaderCache.pending) return hotLeaderCache.pending;

  hotLeaderCache.pending = requestHithinkHotPayload()
    .then((payload) => {
      hotLeaderCache.payload = payload;
      hotLeaderCache.fetchedAt = Date.now();
      writeDiskCache(HOT_LEADER_CACHE_NAME, payload);
      recordHotSnapshot(payload.rows);
      return { payload, cacheStatus: "live", ageMs: 0 };
    })
    .catch((error) => {
      const ageMs = Date.now() - hotLeaderCache.fetchedAt;
      if (hotLeaderCache.payload && ageMs < STALE_CACHE_MS) {
        return { payload: hotLeaderCache.payload, cacheStatus: "stale", ageMs };
      }
      const disk = readDiskCache(HOT_LEADER_CACHE_NAME, DISK_CACHE_MS);
      if (disk) return { payload: disk.payload, cacheStatus: "disk", ageMs: disk.ageMs };
      throw new Error(`热度榜连接中断：${compactError(error.message)}`);
    })
    .finally(() => {
      hotLeaderCache.pending = null;
    });
  return hotLeaderCache.pending;
}

async function getBoardKlines(code) {
  const cached = klineCache.get(code);
  if (cached && Date.now() - cached.fetchedAt < 15 * 60_000) return cached.rows;
  const { payload } = await requestEastmoneyPath(BOARD_KLINE_PATH(code), "push2his.eastmoney.com");
  const rows = parseKlines(payload);
  klineCache.set(code, { rows, fetchedAt: Date.now() });
  return rows;
}

async function getBoardStocks(code) {
  const cached = boardStockCache.get(code);
  if (cached && Date.now() - cached.fetchedAt < FRESH_CACHE_MS) return cached.rows;
  const { payload } = await requestEastmoneyPath(BOARD_STOCK_PATH(code), marketCache.lastGoodHost);
  const rows = payload?.data?.diff || [];
  boardStockCache.set(code, { rows, fetchedAt: Date.now() });
  return rows;
}

async function requestMarketPayload() {
  if (activeMarketProvider() === "eastmoney") {
    const result = await requestEastmoneyPath(EASTMONEY_PATH, marketCache.lastGoodHost);
    return { ...result, provider: "eastmoney", source: "Eastmoney public quote API" };
  }
  try {
    return await requestHithinkMarketPayload();
  } catch (error) {
    if (process.env.HITHINK_STRICT === "1") throw error;
    const result = await requestEastmoneyPath(EASTMONEY_PATH, marketCache.lastGoodHost);
    return {
      ...result,
      provider: "eastmoney",
      source: "Eastmoney public quote API",
      warning: `同花顺问财暂不可用，已回退东方财富：${compactError(error.message)}`
    };
  }
}

async function requestEastmoneyPath(pathname, preferredHost) {
  const orderedHosts = [
    preferredHost,
    ...EASTMONEY_HOSTS.filter((host) => host !== preferredHost)
  ];
  const errors = [];
  for (const host of orderedHosts) {
    const targetUrl = `https://${host}${pathname}`;
    try {
      const payload = await requestJson(targetUrl);
      return { payload, host };
    } catch (error) {
      errors.push(`${host}: ${error.message}`);
    }
  }
  throw new Error(errors.join(" | "));
}

function requestHithinkMarketPayload() {
  return queryHithinkCli(HITHINK_QUERY, HITHINK_LIMIT, 35).then((result) => {
    const diff = result.datas.map(hithinkRowToEastmoney).filter(Boolean);
    if (!diff.length) {
      throw new Error("同花顺问财字段无法映射到行情模型");
    }
    return {
      payload: { data: { diff, total: result.code_count || diff.length } },
      host: "iwencai",
      provider: "hithink",
      source: "同花顺问财 OpenAPI"
    };
  });
}

function requestHithinkHotPayload() {
  return queryHithinkCli(HITHINK_HOT_QUERY, HITHINK_HOT_LIMIT, 35).then((result) => {
    if (!result.datas.length) {
      throw new Error("同花顺问财热度榜未返回股票列表");
    }
    return mergeXueqiuHotPayload(result.datas).then((merged) => ({
      rows: merged.rows,
      query: HITHINK_HOT_QUERY,
      total: result.code_count || result.datas.length,
      xueqiu: merged.xueqiu
    }));
  });
}

async function mergeXueqiuHotPayload(hithinkRows) {
  if (!XUEQIU_HOT_ENABLED) {
    return {
      rows: hithinkRows,
      xueqiu: { enabled: false, rows: 0, matched: 0, warning: "雪球热股榜已关闭" }
    };
  }
  try {
    const xueqiuRows = await requestXueqiuHotPayload();
    const merged = mergeXueqiuHotRows(hithinkRows, xueqiuRows);
    return {
      rows: merged.rows,
      xueqiu: {
        enabled: true,
        rows: merged.total,
        matched: merged.matched,
        type: XUEQIU_HOT_TYPE,
        source: "雪球热股榜",
        warning: ""
      }
    };
  } catch (error) {
    return {
      rows: hithinkRows,
      xueqiu: {
        enabled: true,
        rows: 0,
        matched: 0,
        type: XUEQIU_HOT_TYPE,
        source: "雪球热股榜",
        warning: compactError(error.message)
      }
    };
  }
}

async function requestXueqiuHotPayload() {
  const cookie = await getXueqiuCookie();
  const payload = await requestJsonWithHeaders(XUEQIU_HOT_URL, {
    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    accept: "application/json,text/plain,*/*",
    referer: "https://xueqiu.com/hot/stock",
    origin: "https://xueqiu.com",
    cookie
  }, "Xueqiu");
  const list = payload?.data?.list;
  if (!Array.isArray(list) || !list.length) {
    throw new Error(payload?.error_description || "雪球热股榜未返回列表");
  }
  return list
    .map((item, index) => normalizeXueqiuHotRow(item, index + 1))
    .filter(Boolean);
}

function normalizeXueqiuHotRow(item, fallbackRank) {
  const code = String(item.code || item.symbol || "").match(/(\d{6})/)?.[1] || "";
  if (!code) return null;
  return {
    code,
    symbol: String(item.symbol || ""),
    name: String(item.name || ""),
    rank: fallbackRank,
    heatValue: asMarketNumber(item.value),
    rankChange: asMarketNumber(item.rank_change),
    followers: asMarketNumber(item.followers),
    percent: asMarketNumber(item.percent),
    amount: asMarketNumber(item.amount)
  };
}

async function getXueqiuCookie() {
  if (xueqiuSession.cookie && Date.now() - xueqiuSession.fetchedAt < 2 * 60 * 60_000) {
    return xueqiuSession.cookie;
  }
  const response = await requestTextWithHeaders("https://xueqiu.com/hot/stock", {
    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    referer: "https://xueqiu.com/",
    connection: "close"
  }, "Xueqiu");
  const cookie = cookieFromSetCookie(response.headers["set-cookie"]);
  if (!cookie) throw new Error("雪球 Cookie 初始化失败");
  xueqiuSession.cookie = cookie;
  xueqiuSession.fetchedAt = Date.now();
  return cookie;
}

function cookieFromSetCookie(setCookie) {
  const items = Array.isArray(setCookie) ? setCookie : [];
  return items
    .map((item) => String(item).split(";")[0])
    .filter(Boolean)
    .join("; ");
}

async function requestJsonWithHeaders(targetUrl, headers, label) {
  const response = await requestTextWithHeaders(targetUrl, headers, label);
  try {
    return JSON.parse(response.body);
  } catch (error) {
    throw new Error(`${label} JSON parse failed: ${error.message}`);
  }
}

function requestTextWithHeaders(targetUrl, headers, label) {
  return new Promise((resolve, reject) => {
    const req = https.get(targetUrl, { headers, timeout: 8_000 }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`${label} request failed: ${res.statusCode}`));
          return;
        }
        resolve({ body, headers: res.headers, statusCode: res.statusCode });
      });
    });
    req.on("timeout", () => req.destroy(new Error(`${label} request timeout`)));
    req.on("error", reject);
  });
}

function queryHithinkCli(query, limit, timeoutSeconds) {
  const cliArgs = [
    "--query",
    query,
    "--page",
    "1",
    "--limit",
    String(limit),
    "--timeout",
    String(timeoutSeconds)
  ];
  const usePython = HITHINK_ASTOCK_CLI.endsWith(".py");
  const command = usePython ? "python3" : HITHINK_ASTOCK_CLI;
  const args = usePython ? [HITHINK_ASTOCK_CLI, ...cliArgs] : cliArgs;
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      { timeout: 45_000, maxBuffer: 80 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr.trim() || stdout.trim() || error.message));
          return;
        }
        let result;
        try {
          result = JSON.parse(stdout);
        } catch (parseError) {
          reject(new Error(`同花顺问财 JSON 解析失败：${parseError.message}`));
          return;
        }
        if (!result.success || !Array.isArray(result.datas)) {
          reject(new Error(result.error || result.message || "同花顺问财未返回股票列表"));
          return;
        }
        resolve(result);
      }
    );
  });
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await mapper(items[current], current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function requestJson(targetUrl, attempt = 1) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      targetUrl,
      {
        headers: {
          "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          accept: "application/json,text/plain,*/*",
          referer: "https://quote.eastmoney.com/",
          connection: "close"
        },
        timeout: 4_000
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`Eastmoney request failed: ${res.statusCode}`));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(new Error(`Eastmoney JSON parse failed: ${error.message}`));
          }
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("Eastmoney request timeout")));
    req.on("error", (error) => {
      if (attempt < 2) {
        setTimeout(() => {
          requestJson(targetUrl, attempt + 1).then(resolve, reject);
        }, 400 * attempt);
        return;
      }
      requestJsonViaPython(targetUrl).then(resolve, reject);
    });
  });
}

function requestJsonViaPython(targetUrl) {
  const script = `
import json
import sys
import urllib.request

url = sys.argv[1]
req = urllib.request.Request(url, headers={
    "User-Agent": "Mozilla/5.0",
    "Referer": "https://quote.eastmoney.com/",
    "Accept": "application/json,text/plain,*/*",
})
with urllib.request.urlopen(req, timeout=8) as resp:
    print(resp.read().decode("utf-8"))
`;
  return new Promise((resolve, reject) => {
    execFile(
      "python",
      ["-c", script, targetUrl],
      { timeout: 5_000, maxBuffer: 20 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr.trim() || error.message));
          return;
        }
        try {
          resolve(JSON.parse(stdout));
        } catch (parseError) {
          reject(new Error(`Python fetch JSON parse failed: ${parseError.message}`));
        }
      }
    );
  });
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "content-type"
  });
  res.end(body);
}

function serveVendor(req, res, url) {
  if (url.pathname !== "/vendor/lightweight-charts.standalone.production.js") return false;
  fs.readFile(LIGHTWEIGHT_CHARTS_VENDOR, (err, content) => {
    if (err) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Lightweight Charts vendor file not found");
      return;
    }
    res.writeHead(200, {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "public, max-age=86400"
    });
    res.end(content);
  });
  return true;
}

function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  const filePath = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "content-type": MIME[path.extname(filePath)] || "application/octet-stream" });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "content-type"
    });
    res.end();
    return;
  }
  if (url.pathname === "/favicon.ico") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (serveVendor(req, res, url)) return;
  if (url.pathname === "/api/scan") {
    try {
      sendJson(res, 200, await scan(url));
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }
  if (url.pathname === "/api/sectors") {
    try {
      sendJson(res, 200, await sectors(url));
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }
  if (url.pathname === "/api/sector-detail") {
    try {
      sendJson(res, 200, await sectorDetail(url));
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }
  if (url.pathname === "/api/hot-leaders") {
    try {
      sendJson(res, 200, await hotLeaders(url));
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }
  if (url.pathname === "/api/hot-leader-detail") {
    try {
      sendJson(res, 200, await hotLeaderDetail(url));
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }
  if (url.pathname === "/api/breakout-alerts") {
    try {
      sendJson(res, 200, await breakoutAlerts(url));
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }
  if (url.pathname === "/api/watchlist") {
    try {
      sendJson(res, 200, await watchlist(url));
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }
  if (url.pathname === "/api/watchlist-detail") {
    try {
      sendJson(res, 200, await watchlistDetail(url));
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }
  if (url.pathname === "/api/stock-chart") {
    try {
      sendJson(res, 200, await stockChart(url));
    } catch (error) {
      sendJson(res, error.statusCode || 500, { error: error.message });
    }
    return;
  }
  serveStatic(req, res, url);
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`A-share dark fund tracker running at http://localhost:${PORT}`);
  });
}

module.exports = {
  parseKlines,
  parseTrends,
  movingAverage,
  exponentialMovingAverage,
  periodMetrics,
  scoreBoard,
  classifyBoard,
  normalizeBoard,
  hithinkRowToEastmoney,
  hithinkRowToHotStock,
  keepHotStock,
  enrichHotLeaders,
  limitHotLeaderRows,
  mergeXueqiuHotRows,
  normalizeXueqiuHotRow,
  makeBreakoutAlertRows,
  enrichBreakoutAlert,
  mergeWatchlistRows,
  mergeBreakoutHistoryRecords,
  buildBreakoutHistoryPayload,
  scoreWatchlistRow,
  watchTags,
  isWatchlistBreakoutStage,
  buildChartLevels,
  scoreBreakoutVolume,
  scoreBreakoutHeat,
  scoreBreakoutFlow,
  scoreHeat,
  scoreStock,
  buildTradePlan,
  buildStockChipInsight,
  buildAiStockDiagnosis,
  buildRuleSectorInterpretation,
  normalizeSectorInterpretation,
  dataStateFromCache,
  combineDataStates,
  attachOneDayFlows,
  extractNewsItems,
  buildSyntheticBoardPayload
};
