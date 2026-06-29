const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  buildSyntheticBoardPayload,
  buildChartLevels,
  classifyBoard,
  enrichHotLeaders,
  exponentialMovingAverage,
  extractNewsItems,
  hithinkRowToEastmoney,
  hithinkRowToHotStock,
  keepHotStock,
  limitHotLeaderRows,
  mergeXueqiuHotRows,
  mergeWatchlistRows,
  movingAverage,
  normalizeXueqiuHotRow,
  parseTrends,
  makeBreakoutAlertRows,
  scoreWatchlistRow,
  watchTags,
  isWatchlistBreakoutStage,
  normalizeBoard,
  periodMetrics,
  scoreBoard,
  scoreStock,
  attachOneDayFlows,
  buildStockChipInsight,
  buildAiStockDiagnosis,
  buildRuleSectorInterpretation,
  normalizeSectorInterpretation
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

test("parses stock intraday trends and computes daily moving averages", () => {
  const trends = parseTrends({
    data: {
      trends: [
        "2026-06-29 09:30,10.22,10.22,10.22,10.22,6117,6251574.00,10.220",
        "2026-06-29 09:31,10.20,10.14,10.20,10.10,36390,36975676.00,10.169"
      ]
    }
  });
  assert.equal(trends.length, 2);
  assert.equal(trends[0].price, 10.22);
  assert.equal(trends[1].average, 10.169);
  assert.equal(typeof trends[0].timestamp, "number");

  const ma = movingAverage([
    { date: "2026-06-23", close: 10 },
    { date: "2026-06-24", close: 11 },
    { date: "2026-06-25", close: 12 },
    { date: "2026-06-26", close: 13 },
    { date: "2026-06-29", close: 14 }
  ], 5);
  assert.deepEqual(ma, [{ time: "2026-06-29", value: 12 }]);
  const ema = exponentialMovingAverage([
    { date: "2026-06-23", close: 10 },
    { date: "2026-06-24", close: 11 },
    { date: "2026-06-25", close: 12 },
    { date: "2026-06-26", close: 13 },
    { date: "2026-06-29", close: 14 },
    { date: "2026-06-30", close: 16 }
  ], 5);
  assert.equal(ema[0].value, 12);
  assert(ema[1].value > ema[0].value);
});

test("chart levels expose cost pressure support and risk line prices", () => {
  const levels = buildChartLevels({
    costLow: 10.1234,
    costHigh: 10.9876,
    pressure: 12,
    support: 9.5,
    invalid: 9.1,
    source: "测试筹码"
  }, 11.2);
  assert.equal(levels.costLow, 10.123);
  assert.equal(levels.costHigh, 10.988);
  assert.equal(levels.pressure, 12);
  assert.equal(levels.support, 9.5);
  assert.equal(levels.riskInvalid, 9.1);
  assert.equal(levels.currentPrice, 11.2);
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

test("maps DDE and large order fields into enhanced score inputs", () => {
  const mapped = hithinkRowToEastmoney({
    "股票代码": "300750.SZ",
    "股票简称": "宁德时代",
    "最新价": "392.1",
    "最新涨跌幅": 2.91,
    "成交额[20260629]": 11_490_185_848,
    "量比[20260629]": 1.41,
    "振幅[20260629]": 4.67,
    "换手率[20260629]": 0.696,
    "主力资金流向[20260629]": 1_428_146_495,
    "特大单净买入额[20260629]": 967_353_983,
    "dde大单净额[20260629]": 933_272_758,
    "大单净买入量[20260629]": 2_379_293,
    "大单总额[20260629]": 7_421_986_103
  });
  assert.equal(mapped.ddeNetVolume, 2_379_293);
  assert.equal(mapped.largeOrderAmount, 7_421_986_103);
  const base = { price: 392.1, changePct: 2.91, amount: 11_490_185_848, amplitude: 4.67, turnover: 0.696, volumeRatio: 1.41, mainInflow: 1_428_146_495, superInflow: 967_353_983, superPct: 8.42, largeInflow: 933_272_758, largePct: 8.12 };
  const enhanced = { ...base, ddeNetAmount: 933_272_758, ddeNetVolume: 2_379_293, largeOrderAmount: 7_421_986_103 };
  assert(scoreStock(enhanced) > scoreStock(base));
});

test("maps hithink rows when amount and super order fields are missing", () => {
  const mapped = hithinkRowToEastmoney({
    "股票代码": "603986.SH",
    "股票简称": "兆易创新",
    "最新价": 586.04,
    "最新涨跌幅": 10.000751,
    "量比[20260617]": 1.466,
    "振幅[20260617]": 12.208124,
    "换手率[20260617]": 8.497,
    "主力资金流向[20260617]": 3_052_887_027.36,
    "dde大单净额[20260617]": 3_097_489_189.8,
    "资金流出[20260617]": 14_625_301_095.71,
    "资金流入[20260617]": 16_973_593_429.84
  });
  assert.equal(mapped.f12, "603986");
  assert.equal(mapped.f13, 1);
  assert(mapped.f6 > 30_000_000_000);
  assert(mapped.f66 > 1_000_000_000);
  assert(mapped.f69 > 3);
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

test("hot leaders attach xueqiu heat ranking as reference", () => {
  const hithinkRows = [{
    "股票代码": "000725.SZ",
    "股票简称": "京东方A",
    "个股热度排名[20260616]": 6,
    "成交额[20260616]": 900_000_000,
    "量比[20260616]": 1.5,
    "振幅[20260616]": 5,
    "换手率[20260616]": 2,
    "主力资金流向[20260616]": 80_000_000,
    "特大单净买入额[20260616]": 30_000_000,
    "dde大单净额[20260616]": 20_000_000
  }];
  const xueqiuRows = [normalizeXueqiuHotRow({
    symbol: "SZ000725",
    code: "000725",
    name: "京东方A",
    value: 8943,
    rank_change: 3,
    followers: 500000
  }, 4)];
  const merged = mergeXueqiuHotRows(hithinkRows, xueqiuRows);
  const ranked = enrichHotLeaders(merged.rows, 1, { snapshots: [] })[0];
  assert.equal(merged.matched, 1);
  assert.equal(ranked.xueqiuRank, 4);
  assert.equal(ranked.xueqiuHeatValue, 8943);
  assert(ranked.carryReason.includes("雪球第4"));
});

test("xueqiu heat contributes to hot leader score", () => {
  const rows = [
    {
      "股票代码": "000725.SZ",
      "股票简称": "京东方A",
      "个股热度排名[20260616]": 8,
      "成交额[20260616]": 900_000_000,
      "量比[20260616]": 1.5,
      "振幅[20260616]": 5,
      "换手率[20260616]": 2,
      "主力资金流向[20260616]": 80_000_000,
      "特大单净买入额[20260616]": 30_000_000,
      "dde大单净额[20260616]": 20_000_000,
      __xueqiuRank: 3,
      __xueqiuHeatValue: 9000,
      __xueqiuRankChange: 5
    },
    {
      "股票代码": "000063.SZ",
      "股票简称": "中兴通讯",
      "个股热度排名[20260616]": 8,
      "成交额[20260616]": 900_000_000,
      "量比[20260616]": 1.5,
      "振幅[20260616]": 5,
      "换手率[20260616]": 2,
      "主力资金流向[20260616]": 80_000_000,
      "特大单净买入额[20260616]": 30_000_000,
      "dde大单净额[20260616]": 20_000_000,
      __xueqiuRank: 70,
      __xueqiuHeatValue: 800,
      __xueqiuRankChange: -5
    }
  ];
  const ranked = enrichHotLeaders(rows, 1, { snapshots: [] });
  const strong = ranked.find((row) => row.code === "000725");
  const weak = ranked.find((row) => row.code === "000063");
  assert(strong.heatScore > weak.heatScore);
  assert(strong.totalScore > weak.totalScore);
});

test("breakout alerts prefer early volume and carrying strength", () => {
  const rawRows = [
    { f12: "300502", f13: 0, f14: "新易盛", f2: 680, f3: 2.6, f6: 1_800_000_000, f7: 5, f8: 3, f10: 2.8, f62: 220_000_000, f66: 120_000_000, f69: 6, f72: 70_000_000, f75: 4 },
    { f12: "000725", f13: 0, f14: "京东方A", f2: 6, f3: 6.8, f6: 1_800_000_000, f7: 11.5, f8: 9, f10: 1.3, f62: -20_000_000, f66: -10_000_000, f69: -1, f72: -5_000_000, f75: -0.5 },
    { f12: "688001", f13: 1, f14: "科创测试", f2: 60, f3: 2, f6: 900_000_000, f7: 5, f8: 2, f10: 2.5, f62: 100_000_000, f66: 50_000_000, f69: 5, f72: 20_000_000, f75: 2 }
  ];
  const hotRefs = new Map([["300502", {
    heatRank: 15,
    rankChange: 8,
    xueqiuRank: 9,
    xueqiuHeatValue: 7000,
    xueqiuRankChange: 5
  }]]);
  const rows = makeBreakoutAlertRows(rawRows, hotRefs, 10);
  assert.equal(rows[0].code, "300502");
  assert.equal(rows.some((row) => row.code === "688001"), false);
  assert(rows[0].breakoutScore > 60);
  assert(rows[0].reason.includes("量比"));
});

test("watchlist merges hot leaders and breakout alerts by stock code", () => {
  const hot = {
    code: "300502",
    exchange: "SZ",
    name: "新易盛",
    sectorName: "AI算力光模块",
    price: 680,
    changePct: 2.6,
    amount: 1_800_000_000,
    volumeRatio: 2.8,
    amplitude: 5,
    turnover: 3,
    mainInflow: 220_000_000,
    superInflow: 120_000_000,
    largeInflow: 70_000_000,
    ddeNetAmount: 90_000_000,
    largeOrderAmount: 600_000_000,
    heatRank: 6,
    rankChange: 8,
    xueqiuRank: 5,
    xueqiuRankChange: 4,
    totalScore: 82,
    flowScore: 23,
    riskRewardScore: 12,
    grade: "强关注",
    leaderType: "核心龙头",
    riskLine: "650.00 附近承接",
    entryCondition: "回踩不破风险线后确认",
    carryReason: "热度前排，资金双正"
  };
  const breakout = {
    ...hot,
    breakoutScore: 81,
    stage: "刚起爆",
    volumeScore: 24,
    heatScore: 20,
    flowScore: 18,
    sectorScore: 12,
    riskPenalty: 1,
    reason: "量比放大，DDE大单转强",
    risk: "跌破日内平台",
    entryCondition: "分时回踩均价线不破"
  };
  const rows = mergeWatchlistRows([hot], [breakout], 10);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].code, "300502");
  assert.equal(rows[0].isConfluence, true);
  assert.equal(rows[0].sourceType, "双榜共振");
  assert(rows[0].tags.includes("双榜共振"));
  assert(rows[0].tags.includes("刚起爆"));
  assert(rows[0].tags.includes("资金双正"));
  assert(rows[0].watchScore > 80);
});

test("watchlist scoring covers confluence, hot-only, and breakout-only branches", () => {
  const hot = {
    totalScore: 76,
    flowScore: 20,
    riskRewardScore: 11,
    mainInflow: 100_000_000,
    superInflow: 80_000_000,
    grade: "强关注"
  };
  const breakout = {
    breakoutScore: 74,
    flowScore: 17,
    riskPenalty: 1,
    mainInflow: 90_000_000,
    superInflow: 60_000_000,
    stage: "升温"
  };
  const confluence = scoreWatchlistRow(hot, breakout);
  const hotOnly = scoreWatchlistRow(hot, null);
  const breakoutOnly = scoreWatchlistRow(null, breakout);
  assert(confluence.watchScore > 0);
  assert(hotOnly.watchScore > 0);
  assert(breakoutOnly.watchScore > 0);
  assert(confluence.flowScore >= hotOnly.flowScore);
  assert.deepEqual(watchTags({ isConfluence: true, hasHot: true, hasBreakout: true, breakoutStage: "刚起爆", grade: "强关注", isPositiveFlow: true }), [
    "双榜共振",
    "热度龙头",
    "起爆预警",
    "刚起爆",
    "强关注",
    "资金双正"
  ]);
});

test("watchlist only considers breakout alerts from warming stage and above", () => {
  const hot = {
    code: "300502",
    exchange: "SZ",
    name: "新易盛",
    sectorName: "AI算力光模块",
    price: 680,
    changePct: 2.6,
    amount: 1_800_000_000,
    volumeRatio: 2.8,
    mainInflow: 220_000_000,
    superInflow: 120_000_000,
    totalScore: 76,
    flowScore: 20,
    riskRewardScore: 11,
    heatRank: 8,
    grade: "强关注",
    riskLine: "650.00 附近承接",
    entryCondition: "回踩不破风险线后确认"
  };
  const probe = {
    ...hot,
    breakoutScore: 61,
    flowScore: 13,
    riskPenalty: 1,
    stage: "试盘",
    reason: "量能试探",
    risk: "承接待确认"
  };
  const warming = {
    ...hot,
    code: "603019",
    exchange: "SH",
    name: "中科曙光",
    breakoutScore: 68,
    flowScore: 15,
    riskPenalty: 1,
    stage: "升温",
    reason: "量能升温",
    risk: "观察回踩"
  };
  const rows = mergeWatchlistRows([hot], [probe, warming], 10);
  const hotRow = rows.find((row) => row.code === "300502");
  const warmingRow = rows.find((row) => row.code === "603019");
  assert.equal(isWatchlistBreakoutStage(probe), false);
  assert.equal(isWatchlistBreakoutStage(warming), true);
  assert.equal(hotRow.hasBreakout, false);
  assert.equal(hotRow.tags.includes("起爆预警"), false);
  assert.equal(warmingRow.hasBreakout, true);
  assert.equal(warmingRow.breakoutStage, "升温");
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

test("sector interpretation explains rise beneficiaries continuity and risks", () => {
  const board = {
    name: "半导体设备",
    status: "强势",
    changePct: 3.2,
    amount: 88_000_000_000,
    amountChangePct: 42,
    mainInflow: 1_200_000_000,
    superInflow: 620_000_000,
    upRatio: 0.72,
    volumeRatio: 1.86
  };
  const stocks = [{
    code: "000001",
    name: "测试龙头",
    changePct: 5.2,
    amount: 3_000_000_000,
    mainInflow: 300_000_000,
    superInflow: 120_000_000,
    ddeNetAmount: 80_000_000,
    reason: "资金双正"
  }];
  const news = {
    items: [{
      title: "半导体设备订单增长",
      source: "同花顺资讯",
      publishTime: "2026-06-29",
      summary: "产业链订单改善"
    }]
  };
  const fallback = buildRuleSectorInterpretation(board, stocks, news);
  assert.match(fallback.coreConclusion, /半导体设备/);
  assert(fallback.whyRise.length >= 3);
  assert.equal(fallback.beneficiaries[0].name, "测试龙头(000001)");
  assert.match(fallback.continuity.text, /持续性/);
  assert(fallback.risks.length >= 1);

  const normalized = normalizeSectorInterpretation({
    headline: "模型标题",
    coreConclusion: "模型结论",
    whyRise: ["订单催化", "资金回流"],
    beneficiaries: [{ name: "测试龙头", reason: "设备订单改善" }],
    continuity: { level: "较强", text: "资金和订单共振" },
    watchSignals: ["成交额继续放大"],
    risks: ["高位分化"]
  }, fallback, { source: "同花顺问财模型" });
  assert.equal(normalized.headline, "模型标题");
  assert.equal(normalized.continuity.level, "较强");
  assert.match(normalized.beneficiaries[0].reason, /订单/);
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

test("stock chip insight builds cost pressure support and AI risk diagnosis", () => {
  const row = {
    code: "603019",
    name: "中科曙光",
    price: 96.95,
    changePct: -1.83,
    amplitude: 6.88,
    mainInflow: -447_000_000,
    superInflow: 120_000_000,
    ddeNetAmount: -300_000_000,
    largeOrderAmount: 3_580_000_000
  };
  const chip = buildStockChipInsight(row, {
    "主力持仓成本[20260626]": 86.47,
    "压力位[20260629]": 102,
    "支撑位[20260629]": 77.77,
    "集中度90[20260629]": 10.4
  }, "同花顺问财 · 近120日大单筹码");
  const diagnosis = buildAiStockDiagnosis(row, chip);
  assert.equal(chip.pressureText, "102.00");
  assert.match(chip.costZoneText, /\d+\.\d{2} - \d+\.\d{2}/);
  assert.match(chip.enhancedRiskLine, /跌破失效/);
  assert.match(diagnosis.summary, /当前价格/);
  assert.match(diagnosis.invalidCondition, /DDE/);
});

test("breakout alerts expose configurable sound and popup controls", () => {
  const html = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");
  const app = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "../public/styles.css"), "utf8");
  assert.match(html, /id="breakoutAlertEnabled"/);
  assert.match(html, /id="breakoutAlertSound"/);
  assert.match(html, /id="breakoutAlertPopup"/);
  assert.match(html, /id="breakoutAlertMinScore"/);
  assert.match(html, /id="breakoutAlertModal"/);
  assert.match(app, /function handleBreakoutAlerts/);
  assert.match(app, /function isBreakoutAlertMatch/);
  assert.match(app, /function playBreakoutAlertSound/);
  assert.match(app, /localStorage\.setItem\(BREAKOUT_ALERT_STORAGE_KEY/);
  assert.match(html, /热点事件解读/);
  assert.match(app, /function renderSectorInterpretationCard/);
  assert.match(app, /问财模型解读/);
  assert.match(app, /为什么涨/);
  assert.match(app, /受益股票/);
  assert.match(app, /持续性/);
  assert.match(app, /风险点/);
  assert.match(css, /sector-interpretation-card/);
  assert.match(css, /interpretation-grid/);
  assert.match(app, /AI股票分析/);
  assert.match(app, /大单成本区/);
});

test("watchlist page exposes merged list, filters, detail modal, and CSV export", () => {
  const html = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");
  const app = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "../public/styles.css"), "utf8");
  const pkg = fs.readFileSync(path.join(__dirname, "../package.json"), "utf8");
  assert.match(html, /data-view="watch"/);
  assert.match(html, /id="watchView"/);
  assert.match(html, /id="watchRowsBody"/);
  assert.match(html, /id="watchDetailModal"/);
  assert.match(html, /id="watchIntradayChart"/);
  assert.match(html, /id="watchDailyChart"/);
  assert.match(html, /id="hotIntradayChart"/);
  assert.match(html, /id="hotDailyChart"/);
  assert.match(html, /EMA5 \/ EMA10 \/ EMA20/);
  assert.match(html, /data-watch-filter="confluence"/);
  assert.match(html, /data-watch-filter="freshBreakout"/);
  assert.match(app, /function refreshWatchlist/);
  assert.match(app, /\/api\/watchlist\?period=/);
  assert.match(app, /function renderWatchDetail/);
  assert.match(app, /function loadStockCharts/);
  assert.match(app, /\/api\/stock-chart\?code=/);
  assert.match(app, /createPriceLine/);
  assert.match(app, /function addCostZoneOverlay/);
  assert.match(app, /function addEmaHoverLegend/);
  assert.match(app, /subscribeCrosshairMove/);
  const intradayChartCode = app.match(/function renderIntradayChart[\s\S]*?function renderDailyChart/)?.[0] || "";
  const dailyChartCode = app.match(/function renderDailyChart[\s\S]*?function createBaseChart/)?.[0] || "";
  assert.doesNotMatch(intradayChartCode, /addCostZoneOverlay/);
  assert.match(dailyChartCode, /addCostZoneOverlay/);
  assert.match(app, /priceLineVisible: false/);
  assert.match(app, /lastValueVisible: false/);
  assert.match(css, /chart-cost-zone/);
  assert.match(css, /chart-inline-legend/);
  assert.match(css, /width: min\(1760px, calc\(100vw - 20px\)\)/);
  assert.match(css, /grid-template-columns: 1fr/);
  assert.match(css, /daily-chart-card \.stock-chart/);
  assert.match(app, /function exportWatchCsv/);
  assert.match(app, /watchlist-detail/);
  assert.match(pkg, /lightweight-charts/);
});
