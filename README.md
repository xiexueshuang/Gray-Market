# Gray Market

A-share dark-fund and sector-rotation tracker for short-term market review.

Gray Market is a local web dashboard for observing A-share capital-flow clues, sector rotation, and hot leading stocks. It combines stock-level dark-fund signals, sector-level fund strength, and heat-ranking based leader selection into one review interface.

## 功能概览

- **暗盘资金筛选**：按成交额、量比、涨幅、振幅、换手率、主力净流入估算、超大单净流入估算、大单净流入估算筛选个股。
- **板块资金轮动**：展示 A 股板块资金强度排名，识别强势、升温、分化、退潮状态。
- **近一日资金追踪**：在板块维度展示最近一个完整交易日的主力净流入估算、超大单净流入估算、成交额估算、成交额变化估算、资金排名变化估算。
- **板块详情与利好消息**：展示板块强势原因、风险线、趋势变化、板块内强势个股，并匹配 1-3 条相关利好消息。
- **热度龙头监控**：基于同花顺热度榜筛选综合评分靠前、风险收益比相对更优、具备短线承接条件的龙头候选股。
- **前 50 候选池**：热度龙头页面和接口默认只展示综合评分排名前 50 的股票。
- **多周期观察**：热度龙头支持今日、3 日、5 日周期；板块轮动支持今日、3 日、5 日、10 日周期。
- **炒作概念备注**：展示每只热度龙头的核心概念，例如 `HBM/先进封装/AI算力`。
- **详情弹窗**：点击热度龙头卡片或表格行，查看热度表现、资金承接、板块强度、龙头定位、买点条件、风险线和失效条件。
- **CSV 导出**：支持导出当前筛选结果；热度龙头导出当前前 50 候选池。

## 安装环境与所需条件

### 1. 安装 Node.js 和 npm

本项目使用 Node.js 原生 HTTP 服务和原生前端实现，建议安装 Node.js 18 或更高版本。

- Node.js 官方下载：[https://nodejs.org/en/download](https://nodejs.org/en/download)
- npm 安装说明：[https://docs.npmjs.com/downloading-and-installing-node-js-and-npm](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm)

检查版本：

```bash
node -v
npm -v
```

### 2. 安装 Git

Git 用于克隆项目、提交修改和推送到 GitHub。

- Git 官方下载：[https://git-scm.com/downloads](https://git-scm.com/downloads)
- GitHub 克隆仓库说明：[https://docs.github.com/en/repositories/creating-and-managing-repositories/cloning-a-repository](https://docs.github.com/en/repositories/creating-and-managing-repositories/cloning-a-repository)

检查版本：

```bash
git --version
```

### 3. 配置 GitHub SSH

需要向 GitHub 推送代码时，建议配置 SSH Key。

- 生成 SSH Key 并添加到 ssh-agent：[GitHub Docs](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/generating-a-new-ssh-key-and-adding-it-to-the-ssh-agent)
- 添加 SSH Key 到 GitHub 账号：[GitHub Docs](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/adding-a-new-ssh-key-to-your-github-account)

生成 SSH Key：

```bash
ssh-keygen -t ed25519 -C "your_email@example.com"
```

启动 ssh-agent 并添加私钥：

```bash
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519
```

查看公钥内容：

```bash
cat ~/.ssh/id_ed25519.pub
```

把公钥添加到 GitHub 后，测试连接：

```bash
ssh -T git@github.com
```

### 4. 克隆项目并安装依赖

```bash
git clone <repository-url>
cd <project-folder>
npm install
```

当前项目没有第三方 npm 依赖，`npm install` 会根据 `package.json` 完成标准初始化流程。

### 5. 配置行情数据 CLI

本项目通过 `HITHINK_ASTOCK_CLI` 调用本地行情数据 CLI。该 CLI 需要兼容以下命令参数：

- `--query`
- `--page`
- `--limit`
- `--timeout`

CLI 标准输出需要返回 JSON，并包含：

- `success`
- `datas`

macOS / Linux 配置示例：

```bash
export HITHINK_ASTOCK_CLI="/absolute/path/to/hithink-astock-cli.py"
```

Windows PowerShell 配置示例：

```powershell
$env:HITHINK_ASTOCK_CLI="C:\path\to\hithink-astock-cli.py"
```

也可以把 CLI 放入系统 `PATH`，并将命令名设置为：

```text
hithink-astock-cli
```

配置完成后测试：

```bash
"$HITHINK_ASTOCK_CLI" --query "今日A股涨幅前10" --page 1 --limit 10 --timeout 30
```

### 6. 配置利好消息 API Key

板块利好消息功能需要 `IWENCAI_API_KEY`。请把 API Key 保存在本机环境变量或部署平台的 Secrets 中。

macOS / Linux：

```bash
export IWENCAI_API_KEY="your_api_key"
```

Windows PowerShell：

```powershell
$env:IWENCAI_API_KEY="your_api_key"
```

公开仓库提交前建议扫描敏感信息：

```bash
git grep -n -E "/Users/|C:\\\\Users|ghp_|github_pat_|AKIA|BEGIN .*PRIVATE KEY"
```

## 运行方法

启动服务：

```bash
npm start
```

浏览器访问：

```text
http://localhost:4173
```

指定端口：

```bash
PORT=5173 npm start
```

开发模式：

```bash
npm run dev
```

运行测试：

```bash
npm test
```

推送到 GitHub：

```bash
git remote add origin <repository-ssh-url>
git branch -M main
git push -u origin main
```

已有 `origin` 时更新远程地址：

```bash
git remote set-url origin <repository-ssh-url>
git push -u origin main
```

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `4173` | 本地服务端口。 |
| `MARKET_DATA_PROVIDER` | `hithink` | 行情数据源，默认优先使用兼容的同花顺问财 CLI。 |
| `HITHINK_ASTOCK_CLI` | `hithink-astock-cli` | 本地行情数据 CLI 命令或绝对路径。 |
| `HITHINK_LIMIT` | `500` | 暗盘筛选查询数量上限，范围会被限制在 50 到 1000。 |
| `HITHINK_HOT_LIMIT` | `50` | 热度龙头热度榜数量上限，范围会被限制在 20 到 50。 |
| `HITHINK_QUERY` | 内置问财查询 | 暗盘筛选使用的查询语句。 |
| `HITHINK_HOT_QUERY` | 内置问财查询 | 热度龙头使用的查询语句。 |
| `HITHINK_STRICT` | 空 | 设置为 `1` 时，行情 CLI 查询失败会直接报错。 |
| `IWENCAI_API_KEY` | 空 | 板块利好消息搜索所需 API Key。 |

macOS / Linux 一次性启动示例：

```bash
export HITHINK_ASTOCK_CLI="/absolute/path/to/hithink-astock-cli.py"
export IWENCAI_API_KEY="your_api_key"
PORT=5173 npm start
```

Windows PowerShell 一次性启动示例：

```powershell
$env:HITHINK_ASTOCK_CLI="C:\path\to\hithink-astock-cli.py"
$env:IWENCAI_API_KEY="your_api_key"
$env:PORT="5173"
npm start
```
