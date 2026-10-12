# RAVEN — Read ArxiV 4 mE Now

本地运行的 arXiv 天体物理论文阅读助手：Python 抓取公开论文，React 前端支持搜索、分类、多选、公式渲染和多轮 AI 对话。

## 快速开始

需要 Node.js 20.19+（或 22.12+）及 Python 3.9+。

```bash
npm ci
cp env.example .env
npm run dev
```

打开终端显示的本地地址（默认 http://localhost:5173/）。未抓取数据时，页面展示 3 篇公开论文示例，不需要 API Key。

需要 AI 功能时，在本地 `.env` 中填写兼容 Chat Completions 的模型服务地址、模型名称和密钥。默认示例指向本地模型服务，密钥留空；服务需要允许浏览器跨域请求。修改 `.env` 后重启开发服务器。网页中可临时切换模型名称。

`.env` 不提交到 Git。`VITE_*` 配置会进入浏览器代码，因此真实密钥只用于个人本地运行；不要公开带有真实密钥的构建产物。

## 抓取论文

先安装 Python 依赖：

```bash
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r requirements.txt
```

在项目根目录运行：

```bash
# 从列表页抓取最新 astro-ph 论文，批量获取摘要
python3 fetch_arxiv_list.py

# 使用 RSS 抓取
python3 fetch_arxiv.py

# 按日期抓取：日期必须出现在 arXiv 的 pastweek 列表中
python3 fetch_arxiv_list.py --date 20260928

# 抓取指定论文
python3 fetch_arxiv_ids.py 2402.07716 2503.23047
```

每日输出位于 `public/archive/YYYYMM/`，包含 `RAVEN_YYYYMMDD.json` 和 `astroph_YYYY-MM-DD.md`。`public/latest.json` 记录最新文件位置。指定 ID 的默认输出位于 `public/RAVEN_IDS_*.json`，可用 `--update-latest` 更新索引。JSON 可直接通过网页导入。

如果同一天的新版或旧版 JSON/Markdown 已存在，每日抓取会跳过，保留手动编辑和已保存的对话。`--date` 不是任意历史日期查询；缺失日期不会生成数据。默认 API 批量请求失败时可能留下空摘要，必要时可使用 `--no-api` 改为逐篇请求；已有输出仍需自行保存并处理后才能重新抓取。

证书验证默认开启，支持 `--ca-bundle` 或 `RAVEN_SSL_CA_BUNDLE` 指定证书。全部选项见各脚本的 `--help`。

## 阅读与保存

- 按关键词或分类筛选，按序号或主题浏览，选择多篇论文作为对话上下文。
- 生成单篇简短摘要、每日亮点或所选论文概览；聊天支持 Markdown 和数学公式。
- 调整左右分栏和上下区域大小；从上下文列表切换已保存的对话。
- 导出 JSON 保存论文、AI 摘要及对话；再次导入可继续阅读。
- 支持文件读写 API 的浏览器可授权打开本地 JSON，后续修改约 800 ms 后写回该文件。其他浏览器使用上传导入和手动导出。

启动加载顺序为：最新索引指向的数据 → 旧版 `public/papers.json` → `public/example-papers.json`。缺失、无效 JSON 或数据格式错误都会继续回退。

## macOS 启动器

完成依赖安装后，可以运行 `./start_app.sh`。脚本优先使用 `.venv` 中的 Python，尝试抓取、更新最新索引、启动前端并打开浏览器。

也可以在项目根目录编译启动器：

```bash
osacompile -o ArxivExplorer.app ArxivExplorer.applescript
```

将生成的 `.app` 保留在 `start_app.sh` 旁边，双击启动。路径由应用所在目录推导，不依赖个人目录。编译产物不提交到仓库。

## 验证与版本管理

```bash
npm run check
npm run lint
npm test
npm run build
python3 -m unittest discover -s tests -p 'test_*.py'
```

仓库仅保留源码、锁文件、静态图片和最小公开示例。唯一允许跟踪的隐藏文件是根目录 `.gitignore`；其他隐藏文件、隐藏目录、抓取缓存、历史论文、个人对话、运行时索引及构建产物均留在本地。既有 Git 历史未被重写。

提交时按文件选择，先检查暂存区，不使用 `git add -f` 绕过忽略规则。删除版本跟踪不等于清除 Git 历史；请始终确认新提交不含密钥或个人数据。
