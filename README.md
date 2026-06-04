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

### 基础环境

- Node.js 18 或更高版本，建议安装 LTS 版本：[Node.js 下载](https://nodejs.org/en/download)
- npm，随 Node.js 一起安装：[npm 文档](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm)
- Git：[Git 下载](https://git-scm.com/downloads)
- GitHub 账号：[GitHub 注册](https://github.com/signup)
- 可访问公开行情接口和 GitHub 的网络环境

检查安装结果：

```bash
node -v
npm -v
git --version
```

### 获取项目代码

通过 Git 克隆仓库。GitHub 官方克隆说明见：[Cloning a repository](https://docs.github.com/en/repositories/creating-and-managing-repositories/cloning-a-repository)。

```bash
git clone <repository-url>
cd <project-folder>
```

安装项目依赖：

```bash
npm install
```

### 配置 GitHub SSH

需要向 GitHub 推送代码时，建议使用 SSH。GitHub 官方 SSH 配置说明：

- [生成 SSH Key 并添加到 ssh-agent](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/generating-a-new-ssh-key-and-adding-it-to-the-ssh-agent)
- [把 SSH Key 添加到 GitHub 账号](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/adding-a-new-ssh-key-to-your-github-account)

生成 SSH Key：

```bash
ssh-keygen -t ed25519 -C "your_email@example.com"
```

启动 ssh-agent 并添加私钥：

```bash
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519
```

复制公钥：

```bash
cat ~/.ssh/id_ed25519.pub
```

进入 GitHub 的 `Settings` -> `SSH and GPG keys` -> `New SSH key`，粘贴公钥内容后保存。

测试 SSH 连接：

```bash
ssh -T git@github.com
```

### 配置行情数据 CLI

本项目通过 `HITHINK_ASTOCK_CLI` 调用本地同花顺问财数据 CLI。该 CLI 需要满足以下约定：

- 可以通过命令行执行。
- 支持 `--query`、`--page`、`--limit`、`--timeout` 参数。
- 标准输出返回 JSON。
- JSON 中包含 `success` 和 `datas` 字段。

配置方式：

```bash
export HITHINK_ASTOCK_CLI="/absolute/path/to/hithink-astock-cli.py"
```

也可以把 CLI 放入系统 `PATH`，并命名为：

```text
hithink-astock-cli
```

配置完成后检查：

```bash
"$HITHINK_ASTOCK_CLI" --query "今日A股涨幅前10" --page 1 --limit 10 --timeout 30
```

### 配置利好消息 API Key

板块利好消息功能需要配置 `IWENCAI_API_KEY`。获取 API Key 后，在终端中设置：

```bash
export IWENCAI_API_KEY="your_api_key"
```

公开仓库使用建议：

- 把密钥放在本机环境变量或部署平台的 Secrets 中。
- 保持 `.env`、`.cache/`、日志文件在 `.gitignore` 中。
- 提交前检查敏感信息：

```bash
git grep -n -E "/Users/|C:\\\\Users|ghp_|github_pat_|AKIA|BEGIN .*PRIVATE KEY"
```

## 运行方法

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
| `MARKET_DATA_PROVIDER` | `hithink` | 行情数据源，默认优先使用同花顺问财 CLI。 |
| `HITHINK_ASTOCK_CLI` | `hithink-astock-cli` | 本地同花顺问财数据 CLI 命令或绝对路径。 |
| `HITHINK_LIMIT` | `500` | 暗盘筛选查询数量上限。 |
| `HITHINK_HOT_LIMIT` | `50` | 热度龙头热度榜数量上限。 |
| `HITHINK_QUERY` | 内置问财查询 | 暗盘筛选使用的问财查询语句。 |
| `HITHINK_HOT_QUERY` | 内置问财查询 | 热度龙头使用的问财查询语句。 |
| `HITHINK_STRICT` | 空 | 设置为 `1` 时，同花顺查询失败会直接报错。 |
| `IWENCAI_API_KEY` | 空 | 板块利好消息搜索所需 API Key。 |

macOS / Linux 临时设置：

```bash
export HITHINK_ASTOCK_CLI="/absolute/path/to/hithink-astock-cli.py"
export IWENCAI_API_KEY="your_api_key"
PORT=5173 npm start
```

Windows PowerShell 临时设置：

```powershell
$env:HITHINK_ASTOCK_CLI="C:\path\to\hithink-astock-cli.py"
$env:IWENCAI_API_KEY="your_api_key"
$env:PORT="5173"
npm start
```

启用严格同花顺数据模式：

```bash
HITHINK_STRICT=1 npm start
```
