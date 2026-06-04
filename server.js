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
const HOT_LEADER_CACHE_NAME = "hot-leaders-v2";
const DATA_PROVIDER = String(process.env.MARKET_DATA_PROVIDER || "hithink").toLowerCase();
const HITHINK_ASTOCK_CLI =
  process.env.HITHINK_ASTOCK_CLI || "/Users/xiexuelong/.codex/skills/hithink-astock-selector/scripts/cli.py";
const HITHINK_LIMIT = Math.min(1000, Math.max(50, Number(process.env.HITHINK_LIMIT || 500)));
const HITHINK_QUERY =
  process.env.HITHINK_QUERY ||
  "今日A股非ST，列出股票代码、股票简称、最新价、涨跌幅、成交额、量比、振幅、换手率、主力资金流向、特大单净买入额、dde大单净额，按主力资金流向从高到低";
const HITHINK_HOT_LIMIT = Math.min(50, Math.max(20, Number(process.env.HITHINK_HOT_LIMIT || 50)));
const HITHINK_HOT_QUERY =
  process.env.HITHINK_HOT_QUERY ||
  `个股热度排名前${HITHINK_HOT_LIMIT}名，列出股票代码、股票简称、个股热度排名、所属概念、最新价、涨跌幅、成交额、量比、振幅、换手率、主力资金流向、特大单净买入额、dde大单净额`;
const NEWS_CACHE_MS = 6 * 60 * 60_000;
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

const klineCache = new Map();
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

function hithinkRowToEastmoney(row) {
  const rawCode = String(pickExact(row, ["股票代码", "代码"]) || "").trim();
  const codeMatch = rawCode.match(/^(\d{6})(?:\.(SH|SZ|BJ))?/i);
  const code = codeMatch?.[1] || "";
  if (!code) return null;
  const suffix = (codeMatch?.[2] || (code.startsWith("6") ? "SH" : "SZ")).toUpperCase();
  const amount = asMarketNumber(pickByPrefix(row, ["成交额"]));
  const mainInflow = asMarketNumber(pickByPrefix(row, ["主力资金流向", "主力净流入", "主力净额"]));
  const superInflow = asMarketNumber(pickByPrefix(row, ["特大单净买入额", "超大单净流入", "超大单净额"]));
  const largeInflow = asMarketNumber(pickByPrefix(row, ["dde大单净额", "大单净流入", "大单净额"], ["特大单", "超大单"]));
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
    f75: amount ? (largeInflow / amount) * 100 : 0
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
  const amount = asMarketNumber(pickByPrefix(row, ["成交额"]));
  const mainInflow = asMarketNumber(pickByPrefix(row, ["主力资金流向", "主力净流入", "主力净额"]));
  const superInflow = asMarketNumber(pickByPrefix(row, ["特大单净买入额", "超大单净流入", "超大单净额"]));
  const largeInflow = asMarketNumber(pickByPrefix(row, ["dde大单净额", "大单净流入", "大单净额"], ["特大单", "超大单"]));
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
    f75: amount && largeInflow !== null ? (largeInflow / amount) * 100 : null
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
    largePct: asNumber(row.f75)
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
    largePct: asNumber(row.f75)
  };
  const complete = Object.entries(parsed).every(([key, value]) => {
    return ["code", "name", "exchange"].includes(key) || value !== null;
  });
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

function scoreStock(row) {
  let score = 0;
  score += Math.min(row.mainInflow / 100_000_000, 12) * 2;
  score += Math.max(row.superPct, 0) * 1.2;
  score += Math.max(row.largePct, 0) * 1;
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
  return enriched;
}

function estimateRankChange(row, period) {
  const flowPct = row.amount ? ((row.mainInflow || 0) + (row.superInflow || 0)) / row.amount * 100 : 0;
  const control = (row.changePct || 0) - Math.max((row.amplitude || 0) - 6, 0) * 0.7;
  const heatBase = Math.max(0, HITHINK_HOT_LIMIT - (row.heatRank || HITHINK_HOT_LIMIT)) / HITHINK_HOT_LIMIT;
  return Math.round(clamp((flowPct * 0.9 + control * 0.4 + heatBase * 4) * Math.log2(period + 1), -18, 18));
}

function scoreHeat(row, maxRank, rankChange, continuousDays, sectorHotCount, period, historySampleSufficient = true) {
  const rankScore = scale(maxRank - row.heatRank + 1, 0, maxRank, 0, 22);
  const changeScore = rankChange === null ? 2 : scale(rankChange, -20, 30, 0, historySampleSufficient ? 5 : 4);
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
  return clamp(mainScore + superScore + largeScore + volumeScore, 0, 30);
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

async function scan(url) {
  const params = parseParams(url);
  const market = await getMarketPayload();
  const payload = market.payload;
  const rawRows = payload?.data?.diff;
  if (!Array.isArray(rawRows)) throw new Error("Unexpected Eastmoney response shape");
  const rows = rawRows
    .map(normalize)
    .filter((row) => keep(row, params))
    .map((row) => ({
      ...row,
      score: scoreStock(row),
      tag: classify(row),
      reason: explain(row),
      risk: riskLine(row)
    }))
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
    .map((row) => ({
      ...row,
      score: scoreStock(row),
      tag: classify(row),
      reason: explain(row),
      risk: riskLine(row)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 30);
  const news = await getSectorNews(enrichedBoard, rows);
  return {
    timestamp: new Date().toLocaleString("zh-CN", { hour12: false, timeZoneName: "short" }),
    source: boardMarket.source || "Eastmoney board quote API",
    period,
    board: enrichedBoard,
    news,
    rows
  };
}

async function hotLeaders(url) {
  const period = Math.round(clampNumber(url.searchParams.get("period"), 1, 5, 1));
  const limit = Math.round(clampNumber(url.searchParams.get("limit"), 10, 50, 50));
  const hotMarket = await getHotLeaderPayload();
  const rawRows = hotMarket.payload?.rows || [];
  const history = readHotHistory();
  const rows = limitHotLeaderRows(enrichHotLeaders(rawRows, period, history), limit);
  const historyInsufficient = period > 1 && rows.some((row) => row.historySampleSufficient === false);
  const stats = {
    total: rows.length,
    strong: rows.filter((row) => row.grade === "强关注").length,
    observe: rows.filter((row) => row.grade === "观察").length,
    positiveFlow: rows.filter((row) => (row.mainInflow || 0) > 0 && (row.superInflow || 0) > 0).length,
    avgScore: rows.length ? rows.reduce((sum, row) => sum + row.totalScore, 0) / rows.length : 0,
    historyInsufficient,
    historyNote: historyInsufficient ? "历史样本不足，3日/5日使用当前热度和承接估算" : "历史样本已接入"
  };
  return {
    timestamp: new Date().toLocaleString("zh-CN", { hour12: false, timeZoneName: "short" }),
    source: hotMarket.cacheStatus === "disk" ? "同花顺问财 OpenAPI · 个股热度排名 · disk cache" : hotMarket.cacheStatus === "stale" ? "同花顺问财 OpenAPI · 个股热度排名 · cached fallback" : "同花顺问财 OpenAPI · 个股热度排名",
    warning: hotMarket.cacheStatus === "stale" || hotMarket.cacheStatus === "disk" ? `热度榜连接中断，已显示 ${Math.round(hotMarket.ageMs / 1000)} 秒前缓存` : "",
    period,
    stats,
    rows
  };
}

async function hotLeaderDetail(url) {
  const code = url.searchParams.get("code");
  const period = Math.round(clampNumber(url.searchParams.get("period"), 1, 5, 1));
  if (!/^\d{6}$/.test(code || "")) throw new Error("Invalid stock code");
  const hotMarket = await getHotLeaderPayload();
  const rows = enrichHotLeaders(hotMarket.payload?.rows || [], period, readHotHistory());
  const row = rows.find((item) => item.code === code);
  if (!row) throw new Error("Stock not found in hot list");
  return {
    timestamp: new Date().toLocaleString("zh-CN", { hour12: false, timeZoneName: "short" }),
    source: "同花顺问财 OpenAPI · 个股热度排名",
    period,
    row,
    detail: {
      heat: `热度第${row.heatRank}，热度值${Number.isFinite(row.heatValue) ? row.heatValue.toFixed(0) : "待确认"}，${row.rankChange === null ? "热度变化待确认" : row.rankChange >= 0 ? `排名上升${row.rankChange}` : `排名回落${Math.abs(row.rankChange)}`}`,
      flow: `主力${moneyShort(row.mainInflow)}，超大单${moneyShort(row.superInflow)}，大单${moneyShort(row.largeInflow)}`,
      sector: `${row.sectorName}，热度榜内${row.sectorHotCount}只同步上榜，板块均涨幅${pctShort(row.sectorAvgChange)}`,
      leader: `${row.leaderType}，板块内成交额排名${row.sectorAmountRank || "待确认"}，涨幅排名${row.sectorChangeRank || "待确认"}`,
      concepts: `${row.conceptNote || "待确认"}（${row.conceptSource || "待确认"}）`,
      period: `${row.period}日评分影响${row.periodScore >= 0 ? "+" : ""}${row.periodScore}，${row.historyNote}`,
      entryCondition: row.entryCondition,
      riskLine: row.riskLine,
      invalidCondition: row.invalidCondition
    }
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
  return String(message).split("|")[0].split("\n")[0].slice(0, 120);
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
  const cacheName = `sector-news-${safeCacheName(board.name)}`;
  const disk = readDiskCache(cacheName, NEWS_CACHE_MS);
  if (disk) return disk.payload;
  const leaderNames = stocks.slice(0, 3).map((row) => row.name).filter(Boolean).join(" ");
  const query = `${board.name} ${leaderNames} A股 利好 最新消息`;
  try {
    const raw = await requestNewsSearchRaw(query);
    const items = extractNewsItems(raw).slice(0, 3);
    const payload = {
      query,
      source: "同花顺财经资讯搜索",
      empty: items.length === 0,
      items: items.length ? items : [emptyNewsItem()]
    };
    writeDiskCache(cacheName, payload);
    return payload;
  } catch (error) {
    return {
      query,
      source: "同花顺财经资讯搜索",
      empty: true,
      warning: compactError(error.message),
      items: [emptyNewsItem()]
    };
  }
}

function emptyNewsItem() {
  return {
    title: "暂无明确利好，等待确认",
    source: "系统提示",
    publishTime: "待确认",
    summary: "当前未匹配到可用的板块利好资讯。",
    url: ""
  };
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
    return {
      rows: result.datas,
      query: HITHINK_HOT_QUERY,
      total: result.code_count || result.datas.length
    };
  });
}

function queryHithinkCli(query, limit, timeoutSeconds) {
  return new Promise((resolve, reject) => {
    execFile(
      "python3",
      [
        HITHINK_ASTOCK_CLI,
        "--query",
        query,
        "--page",
        "1",
        "--limit",
        String(limit),
        "--timeout",
        String(timeoutSeconds)
      ],
      { timeout: 45_000, maxBuffer: 80 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr.trim() || error.message));
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
  serveStatic(req, res, url);
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`A-share dark fund tracker running at http://localhost:${PORT}`);
  });
}

module.exports = {
  parseKlines,
  periodMetrics,
  scoreBoard,
  classifyBoard,
  normalizeBoard,
  hithinkRowToEastmoney,
  hithinkRowToHotStock,
  keepHotStock,
  enrichHotLeaders,
  limitHotLeaderRows,
  scoreHeat,
  attachOneDayFlows,
  extractNewsItems,
  buildSyntheticBoardPayload
};
