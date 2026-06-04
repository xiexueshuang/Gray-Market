# A股暗盘资金追踪器

A股暗盘资金追踪器是一个本地运行的短线资金观察工具，用于盘中观察和复盘筛选。系统围绕个股暗盘资金痕迹、板块资金轮动、同花顺热度龙头三条线索，辅助观察资金承接、板块切换和龙头候选池。

## 功能概览

- **暗盘筛选**：按成交额、量比、涨幅、振幅、换手率、主力净流入估算、超大单净流入估算、大单净流入估算等字段筛选个股。
- **板块轮动**：展示 A 股板块资金强度排名，识别强势、升温、分化、退潮状态。
- **近一日资金追踪**：在板块维度展示最近一个完整交易日的主力净流入估算、超大单净流入估算、成交额估算、成交额变化估算、资金排名变化估算。
- **板块详情**：展示板块强势原因、风险线、趋势变化、板块内强势个股和 1-3 条相关利好消息。
- **热度龙头监控**：基于同花顺热度榜筛选综合评分靠前、风险收益比相对更优、具备短线承接条件的龙头候选股。
- **前 50 候选池**：热度龙头页面和接口默认只展示综合评分排名前 50 的股票。
- **周期切换**：热度龙头支持今日、3 日、5 日周期，周期会影响热度变化、连续上榜、热度稳定性、综合评分、排序和推荐等级。
- **炒作概念备注**：展示每只热度龙头的核心概念，例如 `HBM/先进封装/AI算力`。
- **龙头详情弹窗**：点击热度龙头卡片或表格行，弹出热度表现、资金承接、板块强度、龙头定位、买点条件、风险线和失效条件。
- **CSV 导出**：支持导出当前筛选结果；热度龙头导出当前前 50 候选池。

## 安装环境与所需条件

- macOS、Linux 或 Windows 终端环境。
- Node.js 18 或更高版本。
- npm。
- 本地同花顺问财 A 股 Skill CLI。
- 可访问 GitHub 和公开行情接口的网络环境。
- 板块利好消息功能需要 `IWENCAI_API_KEY`。

检查 Node.js 和 npm：

```bash
node -v
npm -v
```

检查本地同花顺问财 Skill CLI 路径：

```bash
ls "/Users/xiexuelong/.codex/skills/hithink-astock-selector/scripts/cli.py"
```

## 运行方法

进入项目目录：

```bash
cd "/Users/xiexuelong/Documents/New project"
```

启动本地服务：

```bash
npm start
```

浏览器访问：

```text
http://localhost:4173
```

指定端口启动：

```bash
PORT=5173 npm start
```

运行测试：

```bash
npm test
```

推送到 GitHub：

```bash
git remote add origin git@github.com:xiexueshuang/Gray-Market.git
git branch -M main
git push -u origin main
```

已有 `origin` 时更新远程地址：

```bash
git remote set-url origin git@github.com:xiexueshuang/Gray-Market.git
git push -u origin main
```

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `4173` | 本地服务端口。 |
| `MARKET_DATA_PROVIDER` | `hithink` | 行情数据源，默认优先使用同花顺问财 Skill。 |
| `HITHINK_ASTOCK_CLI` | `/Users/xiexuelong/.codex/skills/hithink-astock-selector/scripts/cli.py` | 本地同花顺 A 股 Skill CLI 路径。 |
| `HITHINK_LIMIT` | `500` | 暗盘筛选查询数量上限。 |
| `HITHINK_HOT_LIMIT` | `50` | 热度龙头热度榜数量上限。 |
| `HITHINK_QUERY` | 内置问财查询 | 暗盘筛选使用的问财查询语句。 |
| `HITHINK_HOT_QUERY` | 内置问财查询 | 热度龙头使用的问财查询语句。 |
| `HITHINK_STRICT` | 空 | 设置为 `1` 时，同花顺查询失败会直接报错。 |
| `IWENCAI_API_KEY` | 空 | 板块利好消息搜索所需 API Key。 |

临时指定环境变量启动：

```bash
PORT=5173 HITHINK_LIMIT=800 npm start
```

启用严格同花顺数据模式：

```bash
HITHINK_STRICT=1 npm start
```
