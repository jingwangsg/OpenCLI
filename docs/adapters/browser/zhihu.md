# Zhihu

**Mode**: 🔐 Profile-authenticated API reads; browser login and writes · **Domain**: `zhihu.com`

## Quick Start

```bash
opencli profile list
opencli --profile edge zhihu login
opencli --profile edge zhihu auth-sync
opencli --profile edge zhihu whoami
opencli --profile edge zhihu search "机器人" --limit 5 -f json
```

Replace `edge` with your browser profile. Complete login in the browser once, then sync its existing session. Login with an explicit profile also refreshes the cache automatically. Keep the same `--profile` for subsequent commands; both `opencli --profile edge zhihu search ...` and `opencli zhihu search ... --profile edge` work.

The read commands below use Node HTTP requests with that profile's cached Cookie and actual User-Agent. They do not open tabs, require a running browser or Browser Bridge, or switch to another profile. Sessions are stored per profile under `~/.opencli/auth/zhihu/` with private file permissions. When a session expires, log in and run `auth-sync` again. `login`, `auth-sync`, write commands, and `download` still use the browser.

## Commands

| Command | Description |
|---------|-------------|
| `opencli zhihu login` | Open Zhihu login and wait for authentication |
| `opencli zhihu auth-sync --profile <name>` | Sync the existing browser session for API reads |
| `opencli zhihu whoami` | Verify the current logged-in account |
| `opencli zhihu hot` | Read Zhihu hot topics |
| `opencli zhihu recommend` | Read Zhihu home recommendations |
| `opencli zhihu search` | Search Zhihu content |
| `opencli zhihu question` | Read question answers by question ID |
| `opencli zhihu answer-detail <id>` | Read one full answer by answer ID, typed target, or answer URL |
| `opencli zhihu answer-comments <id>` | Read answer comments with reply hierarchy |
| `opencli zhihu collections` | List your Zhihu favorite collections |
| `opencli zhihu collection <collection_id>` | List content from a Zhihu favorite collection |
| `opencli zhihu download` | Export a Zhihu column article or answer to Markdown |
| `opencli zhihu user <user>` | Read a user's profile |
| `opencli zhihu user-answers <user>` | List a user's answers |
| `opencli zhihu user-articles <user>` | List a user's articles |
| `opencli zhihu pins <user>` | List a user's short posts |
| `opencli zhihu following <user>` | List people a user follows |
| `opencli zhihu followers <user>` | List a user's followers |
| `opencli zhihu follow <target> --execute` | Follow a user or question |
| `opencli zhihu like <target> --execute` | Like an answer or article |
| `opencli zhihu favorite <target> (--collection <name> \| --collection-id <id>) --execute` | Favorite an answer or article into a specific collection |
| `opencli zhihu comment <target> (<text> \| --file <path>) --execute` | Create a top-level comment when a fresh top-level editor is already present |
| `opencli zhihu answer <target> (<text> \| --file <path>) --execute` | Create a new answer when a fresh answer editor is already present |

## Target Formats

- Question: `question:123456` or `https://www.zhihu.com/question/123456`
- Answer: `answer:123456:789012` or `https://www.zhihu.com/question/123456/answer/789012`
- Article: `article:998877` or `https://zhuanlan.zhihu.com/p/998877`
- User: `user:alice` or `https://www.zhihu.com/people/alice`

## Write Safety Notes

- All write commands require `--execute`
- `favorite` requires exactly one of `--collection` or `--collection-id`
- `favorite` only supports existing collections, it does not create new collections
- `comment` only supports top-level comments
- `comment` currently requires the page to already expose a fresh top-level comment editor
- `answer` only supports creating a new non-anonymous plain-text answer
- `answer` currently requires the page to already expose a fresh answer editor
- `comment` and `answer` also support `--file <path>` for multi-line payloads
- Article targets can live on `zhuanlan.zhihu.com`, while question and answer targets stay on `www.zhihu.com`

## Usage Examples

```bash
# Read flows
opencli zhihu hot --limit 5
opencli zhihu recommend --limit 20
opencli zhihu search codex --type answer --limit 20
opencli zhihu search "Claude Code vs Codex?" --type all --limit 20
opencli zhihu question 123456 --limit 3
opencli zhihu answer-detail answer:123456:789012
opencli zhihu answer-detail "https://www.zhihu.com/question/123456/answer/789012" --max-content 2000
opencli zhihu answer-comments answer:123456:789012 --limit 20 --replies-limit 3
opencli zhihu answer-comments answer:123456:789012 --order latest --limit 20 --replies-limit 100
opencli zhihu collections --limit 20
opencli zhihu collection 83283292 --limit 20
opencli zhihu download --url "https://zhuanlan.zhihu.com/p/998877" --download-images
opencli zhihu download --url "https://www.zhihu.com/question/123456/answer/789012" --download-images

# Write flows
opencli zhihu follow question:123456 --execute
opencli zhihu follow user:alice --execute
opencli zhihu like answer:123456:789012 --execute
opencli zhihu like article:998877 --execute
opencli zhihu favorite article:998877 --collection "默认收藏夹" --execute
opencli zhihu favorite answer:123456:789012 --collection-id fav-b --execute
opencli zhihu comment answer:123456:789012 --file ./comment.txt --execute
opencli zhihu answer question:123456 --file ./answer.txt --execute

# JSON output
opencli zhihu hot -f json
```

## Search Notes

- Quote queries that contain spaces or shell-special characters, for example `opencli zhihu search "Claude Code vs Codex?"`
- `search --type` supports `all`, `answer`, `article`, and `question`
- `search --limit` supports up to 1000 results, but normal-sized requests are recommended

## Hot List Notes

- `hot` returns rank, title, heat, answer count, and the exact question URL. `--limit` must be a positive integer; requests above the available hot list return all available topics.
- Authentication failures, HTTP failures, malformed responses, and a valid empty list produce distinct errors instead of an empty success.
- The command uses Zhihu's existing hot-list endpoint through direct HTTP requests. This internal endpoint can change; question IDs are preserved as strings before JSON parsing because newer IDs exceed JavaScript's safe integer range.

## Comment Notes

- `answer-comments --order score|latest` selects Zhihu's scored or chronological root-comment order
- `answer-comments --limit` counts unique top-level comment IDs in that root order
- `answer-comments --replies-limit` expands that many unique replies per root; `0` sends no child-comment requests
- Comment rows stay flat for table/JSON output, while `parent_id` and `depth` preserve the `comment_v5` reply relationship so callers can rebuild each thread. Pagination is resource-scoped and bounded; malformed or stalled pages fail instead of returning a partial graph.

## Prerequisites

- API reads require a synced, unexpired session in the selected profile.
- Initial login/sync, writes, and downloads require a running browser with the [Browser Bridge extension](/guide/browser-bridge).
- Article writes and downloads also require access to `zhuanlan.zhihu.com`.
