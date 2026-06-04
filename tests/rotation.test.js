const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  buildSyntheticBoardPayload,
  classifyBoard,
  enrichHotLeaders,
  extractNewsItems,
  hithinkRowToEastmoney,
  hithinkRowToHotStock,
  keepHotStock,
  limitHotLeaderRows,
  normalizeBoard,
  periodMetrics,
  scoreBoard,
  attachOneDayFlows
} = require("../server.js");

test("normalizes board breadth and money fields", () => {
  const board = normalizeBoard({
    f12: "BK0001",
    f14: "测试板块",
    f2: 100,
    f3: 2,
    f6: 1_000_000_000,
    f10: 1.5,
    f62: 120_000_000,
    f66: 80_000_000,
    f69: 8,
    f72: 40_000_000,
    f75: 4,
    f104: 7,
    f105: 2,
    f106: 1,
    f184: 12,
    f204: "龙头",
    f205: "000001"
  });
  assert.equal(board.name, "测试板块");
  assert.equal(board.upRatio, 0.7);
  assert.equal(board.mainInflow, 120_000_000);
});

test("period metrics reflect amount expansion and positive continuity", () => {
  const klines = [
    { date: "d1", open: 10, close: 10, amount: 100, changePct: 0 },
    { date: "d2", open: 10, close: 10, amount: 100, changePct: 0 },
    { date: "d3", open: 10, close: 11, amount: 150, changePct: 10 },
    { date: "d4", open: 11, close: 12, amount: 200, changePct: 9 },
    { date: "d5", open: 12, close: 13, amount: 250, changePct: 8 }
  ];
  const metrics = periodMetrics(klines, 3);
  assert.equal(metrics.period, 3);
  assert(metrics.amountChangePct > 90);
  assert.equal(metrics.positiveRatio, 1);
  assert.equal(metrics.trend.length, 3);
});

test("board score ranks stronger money and breadth higher", () => {
  const metrics = {
    amountChangePct: 30,
    periodReturn: 4,
    positiveRatio: 0.8,
    continuityScore: 14,
    trend: []
  };
  const strong = {
    mainPct: 10,
    superPct: 8,
    volumeRatio: 2,
    changePct: 3,
    upRatio: 0.75,
    mainInflow: 200_000_000
  };
  const weak = {
    mainPct: -2,
    superPct: -1,
    volumeRatio: 0.8,
    changePct: -1,
    upRatio: 0.3,
    mainInflow: -20_000_000
  };
  assert(scoreBoard(strong, metrics) > scoreBoard(weak, metrics));
  assert.equal(classifyBoard(strong, metrics, scoreBoard(strong, metrics)), "强势");
  assert.equal(classifyBoard(weak, metrics, scoreBoard(weak, metrics)), "退潮");
});

test("synthetic sector mapping aggregates stock-level dark-fund fields", () => {
  const payload = buildSyntheticBoardPayload({
    data: {
      diff: [
        { f12: "002050", f13: 0, f14: "三花智控", f2: 52, f3: 3, f6: 1000, f7: 4, f8: 2, f10: 2, f62: 120, f66: 80, f69: 8, f72: 40, f75: 4 },
        { f12: "601689", f13: 1, f14: "拓普集团", f2: 70, f3: 2, f6: 900, f7: 4, f8: 2, f10: 1.8, f62: 90, f66: 50, f69: 5, f72: 40, f75: 4 },
        { f12: "603728", f13: 1, f14: "鸣志电器", f2: 65, f3: -1, f6: 700, f7: 4, f8: 2, f10: 1.4, f62: 30, f66: 20, f69: 3, f72: 10, f75: 1 },
        { f12: "300502", f13: 0, f14: "新易盛", f2: 680, f3: 5, f6: 1200, f7: 5, f8: 3, f10: 2.2, f62: 150, f66: 70, f69: 6, f72: 80, f75: 7 }
      ]
    }
  });
  const robot = payload.data.diff.find((row) => row.f14 === "机器人");
  assert(robot);
  assert.equal(robot.f104, 2);
  assert(robot.f62 > 200);
});

test("maps hithink iwencai rows into quote payload fields", () => {
  const mapped = hithinkRowToEastmoney({
    "股票代码": "300502.SZ",
    "股票简称": "新易盛",
    "最新价": "700.0",
    "最新涨跌幅": 6.21,
    "成交额[20260526]": 31_816_134_000,
    "量比[20260526]": 1.236,
    "振幅[20260526]": 7.37,
    "换手率[20260526]": 5.22,
    "主力资金流向[20260526]": 3_527_764_027,
    "特大单净买入额[20260526]": 1_633_658_871,
    "dde大单净额[20260526]": 1_705_036_867
  });
  assert.equal(mapped.f12, "300502");
  assert.equal(mapped.f13, 0);
  assert.equal(mapped.f14, "新易盛");
  assert.equal(mapped.f62, 3_527_764_027);
  assert(mapped.f69 > 5);
  assert(mapped.f75 > 5);
});

test("filters north exchange, star market, and ST rows from hot leaders", () => {
  const rows = [
    hithinkRowToHotStock({ "股票代码": "920001.BJ", "股票简称": "北交测试", "个股热度排名[20260526]": 1, "成交额[20260526]": 500_000_000 }),
    hithinkRowToHotStock({ "股票代码": "688001.SH", "股票简称": "科创测试", "个股热度排名[20260526]": 2, "成交额[20260526]": 500_000_000 }),
    hithinkRowToHotStock({ "股票代码": "000001.SZ", "股票简称": "ST测试", "个股热度排名[20260526]": 3, "成交额[20260526]": 500_000_000 }),
    hithinkRowToHotStock({ "股票代码": "000725.SZ", "股票简称": "京东方A", "个股热度排名[20260526]": 4, "成交额[20260526]": 500_000_000 })
  ];
  assert.equal(rows.filter(keepHotStock).length, 1);
  assert.equal(rows.filter(keepHotStock)[0].code, "000725");
});

test("hot leader scoring ranks stronger carrying stock higher", () => {
  const rows = [
    {
      "股票代码": "000725.SZ",
      "股票简称": "京东方A",
      "最新价": "5.77",
      "最新涨跌幅": 4,
      "个股热度排名[20260526]": 2,
      "个股热度[20260526]": 8000000,
      "成交额[20260526]": 20_000_000_000,
      "量比[20260526]": 1.8,
      "振幅[20260526]": 6,
      "换手率[20260526]": 7,
      "主力资金流向[20260526]": 2_000_000_000,
      "特大单净买入额[20260526]": 900_000_000,
      "dde大单净额[20260526]": 800_000_000
    },
    {
      "股票代码": "002156.SZ",
      "股票简称": "通富微电",
      "最新价": "75.39",
      "最新涨跌幅": 9.5,
      "个股热度排名[20260526]": 1,
      "个股热度[20260526]": 9000000,
      "成交额[20260526]": 24_000_000_000,
      "量比[20260526]": 1.6,
      "振幅[20260526]": 12,
      "换手率[20260526]": 22,
      "主力资金流向[20260526]": -1_000_000_000,
      "特大单净买入额[20260526]": -900_000_000,
      "dde大单净额[20260526]": -800_000_000
    }
  ];
  const ranked = enrichHotLeaders(rows, 1, { snapshots: [] });
  assert.equal(ranked[0].code, "000725");
  assert.equal(ranked[0].grade, "强关注");
  assert(ranked[0].totalScore > ranked[1].totalScore);
});

test("hot leader period change uses cached heat rank history", () => {
  const rows = [
    {
      "股票代码": "000725.SZ",
      "股票简称": "京东方A",
      "最新价": "5.77",
      "最新涨跌幅": 3,
      "个股热度排名[20260526]": 5,
      "成交额[20260526]": 10_000_000_000,
      "量比[20260526]": 1.2,
      "振幅[20260526]": 5,
      "换手率[20260526]": 5,
      "主力资金流向[20260526]": 500_000_000,
      "特大单净买入额[20260526]": 300_000_000,
      "dde大单净额[20260526]": 200_000_000
    }
  ];
  const ranked = enrichHotLeaders(rows, 3, {
    snapshots: [
      { date: "2026-05-23", rows: [{ code: "000725", rank: 15 }] },
      { date: "2026-05-24", rows: [{ code: "000725", rank: 10 }] }
    ]
  });
  assert.equal(ranked[0].rankChange, 5);
  assert.equal(ranked[0].continuousDays, 3);
});

test("hot leader period scoring changes when history is insufficient", () => {
  const rows = [
    {
      "股票代码": "000725.SZ",
      "股票简称": "京东方A",
      "最新价": "5.77",
      "最新涨跌幅": 3,
      "个股热度排名[20260603]": 5,
      "成交额[20260603]": 10_000_000_000,
      "量比[20260603]": 1.2,
      "振幅[20260603]": 5,
      "换手率[20260603]": 5,
      "主力资金流向[20260603]": 500_000_000,
      "特大单净买入额[20260603]": 300_000_000,
      "dde大单净额[20260603]": 200_000_000
    }
  ];
  const today = enrichHotLeaders(rows, 1, { snapshots: [] })[0];
  const fiveDay = enrichHotLeaders(rows, 5, { snapshots: [] })[0];
  assert.notEqual(today.totalScore, fiveDay.totalScore);
  assert.equal(fiveDay.historySampleSufficient, false);
});

test("hot row mapping tolerates missing flow fields", () => {
  const row = hithinkRowToHotStock({
    "股票代码": "000725.SZ",
    "股票简称": "京东方A",
    "最新价": "5.77",
    "个股热度排名[20260526]": 2,
    "成交额[20260526]": 500_000_000
  });
  assert.equal(row.code, "000725");
  assert.equal(row.mainInflow, null);
  assert.equal(keepHotStock(row), true);
});

test("hot concept note uses iwencai concepts and fallback concepts", () => {
  const fromData = hithinkRowToHotStock({
    "股票代码": "600584.SH",
    "股票简称": "长电科技",
    "个股热度排名[20260603]": 2,
    "成交额[20260603]": 500_000_000,
    "所属概念": ["融资融券", "先进封装", "HBM存储", "芯片概念"]
  });
  assert(fromData.conceptNote.includes("先进封装"));
  assert.equal(fromData.conceptSource, "同花顺问财");

  const fallback = hithinkRowToHotStock({
    "股票代码": "300502.SZ",
    "股票简称": "新易盛",
    "个股热度排名[20260603]": 3,
    "成交额[20260603]": 500_000_000
  });
  assert(fallback.concepts.length > 0);
  assert.equal(fallback.conceptSource, "本地映射");
});

test("hot leaders are capped at fifty rows", () => {
  const rows = Array.from({ length: 80 }, (_, index) => ({ code: String(index).padStart(6, "0") }));
  assert.equal(limitHotLeaderRows(rows, 80).length, 50);
});

test("one-day board flow fields are numeric", () => {
  const rows = attachOneDayFlows([
    { code: "SYN001", name: "测试A", mainInflow: 100, superInflow: 50, amount: 1000, amountChangePct: 12 },
    { code: "SYN002", name: "测试B", mainInflow: 80, superInflow: 20, amount: 800, amountChangePct: -3 }
  ], {
    snapshots: [{ date: "2026-06-02", rows: [{ code: "SYN001", fundRank: 2 }, { code: "SYN002", fundRank: 1 }] }]
  });
  assert.equal(typeof rows[0].oneDayFlow.mainInflow, "number");
  assert.equal(typeof rows[0].oneDayFlow.superInflow, "number");
  assert.equal(typeof rows[0].oneDayFlow.amount, "number");
  assert.equal(typeof rows[0].oneDayFlow.amountChangePct, "number");
  assert.equal(rows[0].oneDayFlow.fundRankChange, 1);
});

test("news extraction handles normal and empty responses", () => {
  const items = extractNewsItems({
    status_code: 0,
    data: [{
      title: "半导体行业景气高涨",
      summary: "存储芯片涨价和AI GPU放量带动景气度。",
      url: "https://example.com/a",
      publish_date: "2026-06-03 11:05:00",
      extra: { publish_source: "新浪财经" }
    }]
  });
  assert.equal(items[0].source, "新浪财经");
  assert.equal(items[0].publishTime, "2026-06-03 11:05:00");
  assert.equal(extractNewsItems({ data: [] }).length, 0);
});

test("hot leader detail uses modal and keeps type guide visible", () => {
  const html = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");
  const app = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
  assert.match(html, /id="hotDetailModal"/);
  assert.match(html, /class="leader-type-guide"/);
  assert.doesNotMatch(html, /<section class="table-section" aria-label="热度龙头详情">/);
  assert.match(app, /openHotDetailModal\(\)/);
  assert.match(app, /closeHotDetailModal/);
});
