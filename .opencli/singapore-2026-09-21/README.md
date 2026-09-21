# 新加坡攻略辅助脚本

2026-09-21 新加坡攻略整理时使用的 Python 脚本。`sg-places`、`sg-ratings` 和 `sg-guide-sync` 是 `opencli browser <session> <command>` 的会话名。

| 脚本 | 用途 | 主要输入 |
| --- | --- | --- |
| `collect-maps.py` | 采集 Google Maps 地点、电话与地址 | `maps-places.json` |
| `save-maps.py` | 将地点保存到指定收藏夹 | `maps-places.json`、`maps-saved.json` |
| `check-rating-details.py` | 读取地点评分详情 | `maps-ratings.json` |
| `prepare-map-notes.py` | 生成包含菜系、招牌菜和价格等信息的备注 | `maps-places-final.json` |
| `write-map-notes.py` | 在 `sg-places` 会话中填写备注 | `maps-rich-notes.json` |
| `commit-map-notes.py` | 在 `sg-guide-sync` 会话中填写备注并检查保存请求 | `maps-rich-notes.json`、已加载的收藏列表 |
| `verify-map-notes.py` | 重新加载列表，逐项核对已保存备注 | `maps-rich-notes.json`、`maps-list.json` |
| `write-guide.py` | 生成初版 Markdown 与来源索引 | `xhs-*.json`、`note-*.json` |
| `extend-guide.py`、`broaden-guide.py` | 扩充对应阶段的攻略内容 | 当时的 Markdown、笔记与来源索引 |
| `update-guide-maps.py` | 将电话和地图链接写入攻略，导出 CSV | Markdown、地点、电话覆盖记录和收藏信息 |
| `build-guide.py` | 生成含目录、书签和链接的 PDF | `tmp/pdfs/guide-tokens.json` |

浏览器脚本调用本机 `opencli`，需要已连接的 Browser Bridge、已登录 Google Maps 的浏览器会话及英文地图页面。交互操作依赖目标标签页处于活动状态。收藏和备注脚本会修改所选列表。

这些脚本保留当时使用的路径、列表名和阶段性假设。例如 `commit-map-notes.py` 检查的是当时的 88 项列表，最终列表剔除停业店后为 87 项；`update-guide-maps.py` 保留了早期私人列表的说明。它们不能按文件顺序重新执行来还原最终攻略，运行前需要核对输入和目标状态。

普通脚本使用 Python 标准库；PDF 脚本还依赖 ReportLab、macOS 的 STHeiti 与 Arial Unicode 字体，以及预先生成的 Markdown token JSON。部分脚本的工作区路径固定为 `/Users/jingwang/WORKSPACE`。`build-guide.py` 从该工作区的 `tmp/pdfs/` 原样归档到此处。

Git 跟踪本目录的 Python 源码和本说明。原始采集 JSON、网络记录、浏览器状态、生成文件与本地依赖目录保留在本机。
