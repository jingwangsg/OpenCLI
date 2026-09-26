# 东部餐饮与晚间营业资料

2026-09-26 的攻略构建与 Google Maps 备注同步脚本。沿用现有收藏列表，菜单、地址、评分、营业时间和小红书证据在输入资料中保存。

- `build-east-guide.py`：从 `guide-before-east.md`、`east-entries.json`、`east-sources.json`、`opening-tonight.md` 等输入构建 `guide-east-draft.md`，保留原稿的地图编号，给东部门店和来源分配引用。
- `sync-east-map-notes.py`：使用已登录的 `edge` 浏览器配置，将 `east-entries.json` 中的备注写入现有列表，重新加载后核验新增备注、原有备注、总数和排除品牌。会修改 Google Maps 收藏备注及列表描述。

列表配置读取自相邻 `singapore-2026-09-21/maps-list.json`。`maps-before.json` 是新增地点前的列表快照；脚本据此核对原有备注。运行同步前，地点须已保存至对应列表，输入中的 `map_title` 须与地图卡片一致。

Google Maps 的空备注输入框初始隐藏。同步脚本先操作卡片上的 `Add note` 按钮，再填写已显示的输入框；通过地点卡片按钮滚动加载列表。每次打开列表后使用返回的页面标识，避免复用失效的标签页标识。

PDF 使用相邻目录的 `build-guide.py`，输入为工作区 `tmp/pdfs/guide-tokens.json`。Markdown 可由 `markdown-qa` 目录中的 `markdown-it` 解析；该依赖的实际入口由其 `package.json` 决定。构建 PDF 后需检查目录、链接和页面布局。

Python 脚本仅使用标准库，PDF 构建另需 ReportLab 和本机字体。研究输入、原始笔记、网络记录及生成文件保留在本地；本目录的 Python 源码与说明纳入 Git。
