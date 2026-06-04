# A股暗盘资金追踪器

A股暗盘资金追踪器是一个本地运行的短线资金观察工具，用于盘中观察和复盘筛选。系统围绕个股暗盘资金痕迹、板块资金轮动、同花顺热度龙头三条线索，辅助观察资金承接、板块切换和龙头候选池。

## 功能概览

- **暗盘筛选**：按成交额、量比、涨幅、振幅、主力净流入、超大单净流入等字段筛选个股。
- **板块轮动**：展示板块资金强度排名，识别强势、升温、分化、退潮状态。
- **过去一日资金追踪**：在板块维度展示最近一个完整交易日的主力净流入估算、超大单净流入估算、成交额估算、成交额变化估算、资金排名变化估算。
- **板块利好消息**：在板块详情中展示 1-3 条匹配板块、核心个股、热门概念关键词的利好资讯。
- **热度龙头监控**：基于同花顺热度榜筛选前 50 只龙头候选股，排除北交所、科创板、ST、退市风险和低流动性股票。
- **周期切换**：热度龙头支持今日、3日、5日周期，周期会影响热度变化、连续上榜、稳定性、综合评分、排序和推荐等级。
- **龙头详情弹窗**：点击热度龙头卡片或表格行，弹出热度表现、资金承接、板块强度、买点条件、风险线和失效条件。
- **CSV 导出**：导出当前筛选结果，热度龙头导出当前前 50 候选池。

## 龙头类型说明

| 龙头类型 | 含义 |
| --- | --- |
| 核心龙头 | 热度排名靠前，板块内成交额居前，具备资金和辨识度双重优势。 |
| 情绪龙头 | 热度排名很高，市场关注集中，短线弹性强，承接质量决定持续性。 |
| 趋势龙头 | 主力资金为正，涨幅在板块内靠前，偏向沿趋势推进。 |
| 补涨龙头 | 板块已有主线热度，个股处在跟随或低位扩散阶段，重点看放量承接。 |

## 技术栈

- Node.js 原生 HTTP 服务
- 原生 HTML / CSS / JavaScript
- Node Test Runner
- 同花顺问财 Skill CLI
- 东方财富公开行情接口作为备用行情来源

## 目录结构

```text
.
├── public/
│   ├── index.html
│   ├── app.js
│   └── styles.css
├── tests/
│   └── rotation.test.js
├── server.js
├── package.json
├── .gitignore
└── README.md
```

## 本地运行

```bash
npm start
```

默认访问地址：

```text
http://localhost:4173
```

指定端口：

```bash
PORT=5173 npm start
```

## 环境变量

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `PORT` | `4173` | 本地服务端口 |
| `MARKET_DATA_PROVIDER` | `hithink` | 行情数据源，默认优先走同花顺问财 Skill |
| `HITHINK_ASTOCK_CLI` | `/Users/xiexuelong/.codex/skills/hithink-astock-selector/scripts/cli.py` | 本地同花顺 A 股 Skill CLI 路径 |
| `HITHINK_LIMIT` | `500` | 暗盘筛选查询数量上限 |
| `HITHINK_HOT_LIMIT` | `50` | 热度龙头热度榜数量上限 |
| `HITHINK_QUERY` | 内置问财查询 | 暗盘筛选问财查询语句 |
| `HITHINK_HOT_QUERY` | 内置问财查询 | 热度龙头问财查询语句 |
| `HITHINK_STRICT` | 空 | 设置为 `1` 时，同花顺查询失败会直接报错 |
| `IWENCAI_API_KEY` | 空 | 板块利好消息搜索所需 API Key |

## 数据与缓存

系统会在 `.cache/` 目录保存短期缓存，降低行情和资讯请求频率：

- 市场行情缓存
- 板块资金历史快照
- 热度榜历史快照
- 板块利好消息缓存

缓存目录已加入 `.gitignore`。

## API

### 暗盘筛选

```text
GET /api/scan?limit=80&minAmount=800000000&minVolumeRatio=1.2&maxChange=8&maxAmplitude=9
```

返回候选个股、统计数据、数据来源和缓存状态。

### 板块轮动

```text
GET /api/sectors?period=1&limit=80
```

支持周期：

- `period=1`
- `period=3`
- `period=5`
- `period=10`

返回板块排行榜、轮动评分、状态标签、最近一日资金追踪估算。

### 板块详情

```text
GET /api/sector-detail?code=SYN009&period=1
```

返回板块强势原因、风险线、趋势数据、强势个股、利好消息。

### 热度龙头

```text
GET /api/hot-leaders?period=5&limit=50
```

支持周期：

- `period=1`
- `period=3`
- `period=5`

返回综合排名前 50 的热度龙头候选池。

### 热度龙头详情

```text
GET /api/hot-leader-detail?code=000725&period=5
```

返回单只股票的热度榜表现、暗盘资金承接、所属板块强度、龙头定位、买点条件、风险线和失效条件。

## 评分模型

### 板块轮动评分

板块轮动评分由以下因素组成：

- 资金净流入
- 成交额放大
- 涨跌强度
- 上涨家数占比
- 连续性

状态标签：

- 强势
- 升温
- 分化
- 退潮

### 热度龙头综合评分

热度龙头综合评分由以下因素组成：

- 热度榜权重：热度排名、排名变化、连续上榜、板块同步热度。
- 暗盘承接权重：主力净流入估算、超大单净流入估算、大单净流入估算、成交额变化、量比。
- 龙头辨识度权重：板块内成交额排名、板块内涨幅排名、所属板块强度、带动性。
- 风险收益比权重：涨幅位置、振幅、换手率、高位加速、资金分歧。

## 测试

```bash
npm test
```

当前测试覆盖：

- 板块字段归一化
- 板块评分和状态判断
- 股票级数据聚合为板块数据
- 同花顺问财字段映射
- 北交所、科创板、ST 过滤
- 热度龙头评分和排序
- 3日 / 5日周期差异
- 热度龙头前 50 限制
- 炒作概念提取和兜底
- 近一日板块资金字段
- 板块利好消息解析
- 热度龙头弹窗结构

## 部署到 GitHub

本项目是纯本地 Node 服务，推送到 GitHub 后可作为源码仓库管理。常用流程：

```bash
git init
git add README.md .gitignore package.json server.js public tests
git commit -m "Initial A-share dark fund tracker"
git branch -M main
git remote add origin git@github.com:<your-name>/<repo-name>.git
git push -u origin main
```

GitHub CLI 创建仓库流程：

```bash
gh auth login
gh repo create a-share-dark-fund-tracker --private --source=. --remote=origin --push
```

## 风险提示

本项目输出用于短线盘中观察和复盘筛选。公开数据中的主力净流入、超大单净流入、热度榜、板块资金均属于估算或统计口径数据，实际交易需结合实时盘口、仓位管理、止损纪律和个人交易计划。
