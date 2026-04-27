# 🚀 RAVEN (arXiv 论文解读助手)

嘿！这是一个我个人用来**每天自动抓取 arXiv 天体物理学（astro-ph）最新论文**，并结合**大语言模型（LLM）进行智能解读**的纯前端可视化小工具。

受够了每天在终端里或者简陋的 RSS 阅读器里看枯燥的论文摘要了吗？这个项目提供了一个高颜值、极客风的本地网页，你可以直接在左侧浏览当天的论文列表，选中你感兴趣的（甚至支持多选！），然后让右侧的 AI 助手帮你精读、总结或者对比！

***

## ✨ 核心亮点

- **自动抓取最新数据**：内置 Python 脚本，一键从 arXiv RSS 拉取当天最新发布的天体物理学论文（自动过滤掉那些只是稍微改了改的旧文章）。
- **纯前端架构，数据全在本地**：抓取完会生成 `papers.json` 供网页读取，没有任何后端数据库，轻量级。
- **灵活的 AI 上下文**：
  - 点击左侧论文即可将其加入右侧的 AI 对话上下文（支持选中多篇一起问！）。
  - 支持一键“总结今日亮点”，让 AI 快速挑出 3-5 篇最值得看的突破性文章。
- **兼容任意大模型**：无论你是用 OpenAI 的 GPT-4o，还是本地部署的 Ollama，只要是兼容 OpenAI 接口格式的模型，填个地址就能跑！

***

## 🛠️ 如何跑起来？

这个项目分为两部分：**Python 抓取脚本** 和 **React 前端网页**。

### 1. 环境准备

- 确保你的电脑里装了 **Python 3**（用来跑抓取脚本）。
- 确保你装了 **Node.js** 和 **npm**（用来跑前端网页）。

### 2. 抓取今天的论文

打开终端，进入项目目录，运行以下命令抓取数据：

```bash
python fetch_arxiv.py
```

> 运行成功后，你会在 `public/` 目录下看到一个新鲜出炉的 `papers.json`，同时根目录下也会生成一份 Markdown 格式的备份。

### 3. 配置你的大模型 API 🔑 (非常重要！)

为了安全起见，**包含你 API Key 的配置文件** **`.env`** **是被** **`.gitignore`** **忽略的，绝对不会被上传到 GitHub！**

所以，当你克隆（Clone）这个项目到本地后，你需要**手动在项目根目录创建一个** **`.env`** **文件**。

新建 `.env` 文件，并填入你的配置（下面是示例）：

```env
# 你的 API Key (例如 sk-xxxx)
VITE_LLM_API_KEY=你的密钥填这里

# API 的 Base URL (如果是 OpenAI 默认是 https://api.openai.com/v1)
# 如果你用本地模型比如 Ollama，填类似于 http://localhost:11434/v1
VITE_LLM_BASE_URL=https://api.openai.com/v1

# 使用的模型名称 (例如 gpt-3.5-turbo, deepseek-chat 等)
VITE_LLM_MODEL=gpt-3.5-turbo
```

*💡 提示：如果你的本地模型（比如部分 Ollama 设置）不需要 API Key，`VITE_LLM_API_KEY`* *留空即可，程序会自动兼容无 Key 请求。*

### 4. 启动网页！

装好依赖，跑起来：

```bash
npm install
npm run dev
```

然后打开浏览器访问 `http://localhost:5173/` 就可以开始愉快地和 AI 一起读论文啦！

***

## 🍎 Mac 用户的终极偷懒技巧 (一键启动 App)

如果你和我一样用的是 Mac，并且觉得每次都要敲命令太麻烦了，项目里其实包含了一个一键启动脚本。

你可以直接双击运行项目里的 **`ArxivExplorer.app`**（如果它失效了，你可以通过终端运行 `osacompile -o ArxivExplorer.app ArxivExplorer.applescript` 重新编译一个）。

双击它之后，它会自动在后台帮你：

1. 运行 Python 抓最新论文
2. 启动 Vite 前端服务
3. 自动打开你的默认浏览器跳转到网页
   每天早上点一下，一杯咖啡的时间，今天的科研动态和 AI 助手就全准备好了！

***

## 🤝 关于提交代码 (Git Push)

如果你想 Fork 或者修改这个项目并推送到自己的 GitHub，请放心使用：

```bash
git add .
git commit -m "你的修改"
git push
```

