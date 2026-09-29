# Google Maps

通过所选浏览器 profile 的 Cookie 调用 Google Maps 接口。命令不跳转或点击页面；写入上下文通过同一 Google 账号的 HTTP 初始化文档读取。

| 命令 | 功能 |
| --- | --- |
| `google-maps search <query>` | 地点搜索，`--limit 1-100`，自动分页 |
| `google-maps place <place>` | 名称、评分、评论数、地址、电话、网站、价格区间、营业时间、坐标 |
| `google-maps list <list>` | 读取完整地点列表及备注，核对服务端总数 |
| `google-maps list-info <list>` | 列表名称、描述和数量 |
| `google-maps save <list> <place>` | 保存地点；已保存时保持原备注 |
| `google-maps note <list> <place> <text>` | 设置地点备注，最多 4000 字符 |
| `google-maps list-description <list> <text>` | 设置列表描述，最多 400 字符 |

`<place>` 支持 `0x…:0x…` 地点 ID 或包含它的完整 Maps URL。`<list>` 支持列表 ID 或完整列表 URL。

```bash
opencli --profile edge google-maps search 'cafes in Tiong Bahru Singapore' --limit 35 -f json
opencli --profile edge google-maps place '0x31da19a747de0c15:0xe5639e25fabece80' -f json
opencli --profile edge google-maps list '<list-url>' -f json
opencli --profile edge google-maps note '<list-id>' '<place-id>' '准确的新备注' --account 1
# 检查预览后，明确指定 --execute 才提交
opencli --profile edge google-maps note '<list-id>' '<place-id>' '准确的新备注' --account 1 --execute
```

列表命令保留 URL 的 `authuser`；也可以用 `--account` 指定 Google 账号索引，两者冲突时报错。一个 Edge profile 中可以有多个 Google 账号，不能以 profile 名称代替站内账号选择。

三个写命令默认只返回预览。执行时要求所选账号拥有该列表；提交后重新读取完整列表，验证目标值、其他成员及原有备注。写请求失败或验证失败时不重试，先检查列表状态。空字符串可以清除备注或描述。

这些是站内未公开稳定契约的接口。字段或权限结构改变时命令会报错。读接口已现场验证；三类写入已完成合成协议与错误路径测试，尚未进行真实账号写入验收。
