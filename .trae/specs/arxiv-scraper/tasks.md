# Tasks
- [x] Task 1: 使用内置工具获取网页内容: 助手调用内置 `WebFetch` 或 `browser_navigate` 相关工具，抓取 `https://arxiv.org/list/astro-ph/new` 的最新论文列表。
- [x] Task 2: 内容解析与数据汇总: 助手分析抓取到的文本内容，统计出当天的文章总数，并按领域（如 astro-ph.EP, astro-ph.GA 等）分类汇总数量。
- [x] Task 3: 在对话中展示汇总报告: 助手在当前聊天窗口中，以美观的 Markdown 格式输出统计结果，并提示用户可以继续输入关键词进行检索。
- [ ] Task 4: (可选/持续) 交互检索: 当用户在下一轮对话中输入关键词（如 Fast Radio Burst, FRB），助手基于上下文筛选出符合条件的论文并回复（该任务将在最终回复后由用户的后续对话自然触发）。

# Task Dependencies
- [Task 2] depends on [Task 1]
- [Task 3] depends on [Task 2]
- [Task 4] depends on [Task 3]
