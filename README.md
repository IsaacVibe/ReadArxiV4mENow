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

如果同一天的新版或旧版 JSON/Markdown 已存在，每日抓取会跳过，保留手动编辑和已保存的对话。`--date` 不是任意历史日期查询；缺失日期不会生成数据。批量 API 请求失败或被限流时，缺失摘要会回退到逐篇 `/abs` 页面请求；也可用 `--no-api` 跳过批量 API。已有输出仍需自行保存并处理后才能重新抓取。

证书验证默认开启，支持 `--ca-bundle` 或 `RAVEN_SSL_CA_BUNDLE` 指定证书。全部选项见各脚本的 `--help`。

## 阅读与保存

- 按关键词或分类筛选，按序号或主题浏览，选择多篇论文作为对话上下文。
- 生成单篇简短摘要、每日亮点或所选论文概览；聊天支持 Markdown 和数学公式。
- 使用筛选／精读两种布局，拖拽或用键盘调整左右分栏；从会话下拉框切换已保存的对话。支持浅色、深色及跟随系统。
- 导出 JSON 保存论文、AI 摘要及对话；再次导入可继续阅读。
- 支持文件读写 API 的浏览器可授权打开本地 JSON，后续修改约 800 ms 后写回该文件。其他浏览器使用上传导入和手动导出。

启动加载顺序为：最新索引指向的数据 → 旧版 `public/papers.json` → `public/example-papers.json`。缺失、无效 JSON 或数据格式错误都会继续回退。

## macOS 启动器

完成依赖安装后，可以运行 `./start_app.sh`。脚本优先复用完整的今日数据，等待正在运行的抓取任务，缺失时调用 `automation/run_daily.sh` 尝试一次快速抓取，再同步索引并启动网页。可通过 `RAVEN_PYTHON` 指定解释器，未指定时优先使用项目 `.venv`。

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

## 可选自动抓取

macOS 可手动运行 `bash automation/install.sh` 安装工作日 10:30 的 launchd 任务，先用 `--dry-run` 查看配置；触发时间跟随系统本地时区，建议设为 Asia/Shanghai。卸载使用 `bash automation/uninstall.sh`。首次启动可能需要 macOS 文件夹访问授权。安装脚本、缓存清理与迁移脚本均需用户主动运行，克隆和启动网页不会安装定时任务。Linux 可参考 `automation/crontab.example`。

快捷指令可通过 `bash automation/build_shortcut.sh` 在本机生成，生成文件和 `.app` 不进入版本库。不要直接删除唯一保存的论文或对话；清理工具仅针对可再生成的缓存。

## 桌面阅读工作台与网页原文

网页提供「筛选 / 精读」两种布局，以及浅色、深色和跟随系统的外观设置。勾选论文后可生成一句话摘要，或进入精读与比较；会话可以改名，引用顺序在恢复会话后保持不变。

- **保存**：通过「打开工作区」在支持的浏览器中授权读写，顶栏显示文件名与保存状态。其他浏览器或「导入 JSON 副本」不会自动写回，需使用「导出」。不要仅凭导入成功判断已保存。
- **原文**：研究问答会先请求本地 `/api/paper-text?id=...`，按顺序读取 arXiv、ar5iv 的 HTML 网页正文，将实际提取的文本、LaTeX 公式与图注传入模型。程序不请求 PDF、不下载图片，也不把原文保存到项目磁盘。
- **来源可核对**：每次回答记录网页来源、取得时间、使用字符数及「网页正文 / 原文节选 / 仅摘要」。选篇较多或文章较长时，总正文预算约 120,000 字符，节选会明确标注；这不是所有模型上下文长度的保证。
- **覆盖边界**：并非每篇文献都有可用的 HTML，网络也可能失败；此时明确仅依据摘要，不会把读取失败说成 arXiv 编号无效。HTML 转换可能遗漏图像或格式，图片解读仍需用户核对原文。模型的训练截止日期不用于过滤文献。
- **运行要求**：HTML 读取中间件同时接入 `npm run dev` 和 `npm run preview`（Node.js），正常的一键启动器继续可用。仅把 `dist` 放在纯静态主机上不会提供该接口，需要部署等价的 Node 读取服务；否则页面会说明原文不可用。
- **读取限制**：只允许规范 arXiv 编号和受限 HTTPS HTML 来源，拦截 PDF/其他地址跳转；内存缓存一小时、最大 24 篇，未开启批量后台抓取。

核心回归可运行 `npm test`，类型检查与静态检查为 `npm run check`、`npm run lint`。本轮只验证改动涉及的核心桌面路径，不包含 50 轮长对话压力矩阵。
