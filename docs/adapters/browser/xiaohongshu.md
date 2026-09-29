# Xiaohongshu (小红书)

**Mode**: 🔐 Browser · **Domain**: `xiaohongshu.com`

主站命令使用第一方签名 API 客户端，不通过页面跳转、点击或滚动取得业务结果。先在所选浏览器 profile 登录小红书主站，保持签名运行时完成初始化；必要时在该标签页执行：

```bash
opencli --profile edge browser xiaohongshu-web-api bind
opencli --profile edge xiaohongshu whoami
```

主站命令使用持久会话；必要时激活已有的签名标签页，保持原 URL，不点击业务控件。`login` 只检查并等待手动登录，不自动打开登录页。创作者中心的统计、发布、草稿和内容管理不属于本次 API 迁移范围，下面这些创作者命令保留原实现。

## Commands

| Command | Description |
|---------|-------------|
| `opencli xiaohongshu search` | Search notes by keyword (returns title, author, likes, URL) |
| `opencli xiaohongshu ask` | Ask 点点 and return its answer with citation sources (`sources[]` in JSON) |
| `opencli xiaohongshu note` | Read full note content (title, author, description, likes, collects, comments, tags) |
| `opencli xiaohongshu comments` | Read comments from a note (`--with-replies` for nested 楼中楼 replies) |
| `opencli xiaohongshu feed` | Home feed API with cursor pagination and signed drill-down URLs |
| `opencli xiaohongshu notifications` | User notifications (mentions, likes, connections) |
| `opencli xiaohongshu user` | Get public notes from a user profile |
| `opencli xiaohongshu saved` | List saved notes through the collection API |
| `opencli xiaohongshu liked` | List liked notes through the likes API |
| `opencli xiaohongshu download` | Download images and videos from a note |
| `opencli xiaohongshu publish` | Publish image-text notes (creator center UI automation) |
| `opencli xiaohongshu delete-note` | Verify or delete a published creator-center note by exact note ID |
| `opencli xiaohongshu follow` | Follow through the signed API and independently verify the relationship |
| `opencli xiaohongshu unfollow` | Unfollow through the signed API and independently verify the relationship |
| `opencli xiaohongshu creator-notes` | Creator's note list with per-note metrics |
| `opencli xiaohongshu creator-note-detail` | Detailed analytics for a single creator note |
| `opencli xiaohongshu creator-notes-summary` | Combined note list + detail analytics summary |
| `opencli xiaohongshu creator-profile` | Creator account info (followers, growth level) |
| `opencli xiaohongshu creator-stats` | Creator data overview (views, likes, collects, trends) |

## Usage Examples

```bash
# Search for notes
opencli xiaohongshu search 美食 --limit 10

# Combine API search filters
opencli xiaohongshu search 美食 --sort latest --note-type video --publish-time week

# Ask 点点 and keep the citation audit trail
opencli xiaohongshu ask "上海露营需要注意什么？" -f json

# Read a note's full content (pass URL from search results to preserve xsec_token)
opencli xiaohongshu note "https://www.xiaohongshu.com/search_result/<id>?xsec_token=..."

# Read comments with nested replies (楼中楼)
opencli xiaohongshu comments "https://www.xiaohongshu.com/search_result/<id>?xsec_token=..." --with-replies --limit 20

# JSON output
opencli xiaohongshu search 旅行 -f json

# Other commands
opencli xiaohongshu feed
opencli xiaohongshu saved --limit 20
opencli xiaohongshu liked --limit 20
opencli xiaohongshu saved "https://www.xiaohongshu.com/user/profile/<id>?tab=fav&subTab=note"
opencli xiaohongshu liked "https://www.xiaohongshu.com/user/profile/<id>?tab=liked&subTab=note"
opencli xiaohongshu notifications
opencli xiaohongshu download "https://www.xiaohongshu.com/search_result/<id>?xsec_token=..."
opencli xiaohongshu download "https://xhslink.com/..."

# Publish an ordinary image-text note
opencli xiaohongshu publish "正文内容" --title "标题" --images ./a.jpg,./b.png

# Publish a text-image note; split multiple cards with ||| and use \n for card line breaks
opencli xiaohongshu publish "正文内容" --title "标题" --card-text "第一张\\n第二行|||第二张" --card-style 边框

# Follow / unfollow a profile
opencli xiaohongshu follow 5d8f88dc0000000001005d3a
opencli xiaohongshu unfollow https://www.xiaohongshu.com/user/profile/5d8f88dc0000000001005d3a

# Verify a published creator note without deleting it (default dry-run)
opencli xiaohongshu delete-note 6a08ba0b000000000702a893

# Actually delete after the target row and delete action are verified
opencli xiaohongshu delete-note 6a08ba0b000000000702a893 --execute
```

`search` supports the same visible filter-panel choices as the website: `--sort comprehensive|latest|most-liked|most-commented|most-collected`, `--note-type all|video|image`, `--publish-time anytime|day|week|half-year`, `--scope all|seen|unseen|following`, and `--location all|same-city|nearby`. Filter IDs are resolved from the site API; a filter choice the site no longer offers fails explicitly.

> Note: `note` and `comments` now require a full signed note URL with `xsec_token`. `download` accepts either a signed note URL or an `xhslink` short link. Bare note IDs are no longer reliable on xiaohongshu.
> With `comments --with-replies`, `reply_to` comes from the API target comment, with the parent author as fallback. `time` is an ISO UTC timestamp. Nested replies are paginated independently.
> `ask` is separate from ordinary `search`: it submits the question to 点点, returns `answer`, `source_count`, and `sources[]`, and keeps `xsec_token` in JSON when Xiaohongshu returns one. The current 点点 source API may return bare note IDs without `xsec_token`; in that case `url` falls back to `/explore/<note_id>` and `xsec_token` is an empty string. Each source also carries the engagement and identity metadata 点点 returns: `like_count`, `note_type` (`normal`/`video`), `user_id`, and `published_at` (each omitted when 点点 does not provide it), so citation analysis can read likes and note format without a follow-up `search`/`note` round-trip.
> `delete-note` operates in creator center and accepts a 24-character note ID or exact Xiaohongshu note URL; it defaults to dry-run verification and only deletes with `--execute`.
> `follow` and `unfollow` are write commands. They bind the API request to the target user ID, skip already-satisfied states, and read the relationship again after submission. An uncertain result is not automatically retried.
> `publish --card-text` uses creator-center 文字配图. It requires generated card images to appear in the current composer before filling title/body or submitting. If you request `--card-style`, that exact live page style must be selected; unavailable styles fail instead of silently falling back.

## Prerequisites

- Chrome or Edge running and **logged into the main site** xiaohongshu.com in the selected profile
- [Browser Bridge extension](/guide/browser-bridge) installed
