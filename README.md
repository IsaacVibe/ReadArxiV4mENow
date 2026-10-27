# RAVEN — Read ArxiV 4 mE Now

本地运行的 arXiv 天体物理论文阅读助手，支持每日论文筛选、AI 摘要与上下文精读。

## 功能

- 抓取最新 astro-ph 论文，按关键词、作者或领域筛选，多选阅读与比较。
- 生成一句话摘要、今日亮点，进行多轮研究对话；支持 Markdown 和 LaTeX 公式。
- 读取可用的 arXiv / ar5iv 网页原文，无需下载 PDF；原文不可用时明确仅依据摘要。
- 自动保存 AI 摘要、亮点和对话到工作区 JSON，支持导入、导出与恢复。
- 提供筛选／精读布局、可调分栏、浅色／深色主题，以及 80%–200% 整页缩放。

## 安装

需要 Node.js 20.19+（或 22.12+）和 Python 3.9+。

```bash
git clone https://github.com/IsaacVibe/ReadArxiV4mENow.git
cd ReadArxiV4mENow
npm ci
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
cp env.example .env
```

在 `.env` 中配置兼容 OpenAI Chat Completions 的模型服务：

```env
VITE_LLM_BASE_URL=http://localhost:11434/v1
VITE_LLM_MODEL=your-model-name
VITE_LLM_API_KEY=
```

将地址和模型名改为实际服务支持的值；服务需允许浏览器跨域请求，本地免密服务可将密钥留空。修改配置后重启网页服务。`.env` 不进入 Git，但密钥会进入浏览器代码，因此仅用于个人本地运行，不要公开含真实密钥的构建产物。

## 使用

在项目目录运行：

```bash
source .venv/bin/activate
python fetch_arxiv_list.py
npm run dev
```

打开终端显示的地址，默认 [http://localhost:5173/](http://localhost:5173/)。未抓取数据时会显示 3 篇公开论文示例。

1. 在左栏搜索、筛选并勾选论文，点击「一句话摘要」或「进入精读」。
2. 点击「今日亮点」查看当日概览，或在精读区提问；通过会话下拉框切换对话。
3. 使用顶栏 `Aa` 调整整页缩放，通过主题按钮切换外观。

每日数据位于 `public/archive/YYYYMM/`，包含 JSON 和 Markdown，`public/latest.json` 指向最新论文。已存在的当日文件会跳过抓取。其他抓取方式：

```bash
python fetch_arxiv.py                              # RSS 抓取
python fetch_arxiv_ids.py 2402.07716 2503.23047      # 指定 arXiv ID
```

默认加载的项目 JSON 会自动写回，一句话摘要、亮点和对话保存在 JSON 中，配套 Markdown 不同步。通过「打开工作区」关联的可写文件也会自动保存；示例数据和「导入 JSON 副本」请使用「导出」。下次打开同一 JSON 即可恢复记录，保存状态见顶栏。

macOS 可运行 `bash start_app.sh` 一键抓取并启动网页。需要工作日 10:30 自动抓取时，运行 `bash automation/install.sh`；首次按系统提示授权，时间跟随系统时区。卸载使用 `bash automation/uninstall.sh`。
