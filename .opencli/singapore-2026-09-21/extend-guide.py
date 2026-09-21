import json
import re
from pathlib import Path

base = Path('/Users/jingwang/WORKSPACE/opencli/.opencli/singapore-2026-09-21')
target = Path('/Users/jingwang/WORKSPACE/singapore-guide-2026-09-21.md')
s = target.read_text()
assert '### 小叫天 Xiao Jiao Tian' not in s

s = s.replace('# 新加坡中餐、酒吧与游玩攻略', '# 新加坡中餐、本地特色、酒吧与游玩攻略', 1)
s = s.replace('**[F1]、[P1]、[B1]、[E1] 都可以直接点击打开原帖**', '**[F1]、[L1]、[P1]、[B1]、[E1] 都可以直接点击打开原帖**', 1)
s = s.replace('| 川菜、下饭、菜价较明确 | 骆老妈 | 有烤鸡、水煮鱼、蹄花等可核对的菜单价格 |', '| 川菜、下饭、菜价较明确 | 骆老妈／小叫天 | 有烤鸡、酸菜鱼等价格依据；小叫天保留两家分店信息 |')
s = s.replace('| 清淡一点、吃点心 | 亚洲金阁 | 点心单价明确，适合午餐，之后可逛 City Hall |', '''| 清淡一点、吃点心 | 亚洲金阁 | 点心单价明确，适合午餐，之后可逛 City Hall |
| 清淡福建菜、午餐预算可控 | 莆田 | S$19.80净价午市套餐与正常单点分开列示 |
| 创意中餐、餐酒馆 | 烟伙 | 雪蟹蒸蛋、辣子鸡、炒饭有笔记与菜单双重依据 |
| 酸菜鱼、西部晚餐 | 太二 Jem | 有三人S$90.64的近期消费记录，可接裕廊湖灯会 |
| 本地早餐 | 亚坤／1950年代咖啡 | 咖椰吐司、半熟蛋和南洋咖啡 |
| 熟食中心鸡饭 | 天天／了凡原摊 | 海南鸡饭与油鸡饭分开，当前评级与历史获星分开 |''')
s = s.replace('### 1. 川菜｜骆老妈 Luo Lao Ma', '### 1. 川菜／川味\n\n#### 骆老妈 Luo Lao Ma', 1)

sichuan = '''#### 小叫天 Xiao Jiao Tian

**保留两家店：Wisma Atria #03-32/33/34；City Square Mall #04-37。规划预算：S$25–40/人。** 想结合乌节路逛街选Wisma；靠近Farrer Park选City Square。

| 特色菜 | 价格参考 | 口径 |
| --- | --- | --- |
| 脆皮烤鸡，半只 | S$19.90 | City Square店公开订位菜单 |
| 酸菜鱼 | S$29.90 | 同上 |
| 酸酸甜甜荔枝肉 | S$22.90 | 同上 |
| 蜂蜜辣子鸡 | S$19.90 | 同上 |
| 金牌泡椒活田鸡、桂花龙眼冰 | 单价未核实 | Wisma近期帖子具体推荐，不补猜测价格 |

- **被哪些帖子推荐：** [F12]是Wisma新店记录，推荐烤鸡、泡椒田鸡、干锅菜花，并特别喜欢桂花龙眼冰；[F13]是City Square店记录，提到烤鸡、荔枝肉和烤田鸡。
- **怎么选：** 不想太辣可从烤鸡、荔枝肉开始；能吃酸辣再加泡椒田鸡。两人先点两道主菜，按食量补蔬菜。
- **价格和优惠边界：** 上表来自City Square店，不能保证Wisma完全同价。[F13]提到的S$1.50自助小食／米饭等项目未核实是否还在，也不套用到Wisma。**Wisma的9月12–16日烤鸡半价活动已结束。**
- **核对来源：** [餐厅官网及门店](https://xiaojiaotian.sg/)、[City Square公开菜单](https://www.quandoo.sg/place/xiao-jiao-tian-108142/menu)、[Wisma商场开业活动日期](https://www.wismaonline.com/cn/store/xiao-jiao-tian/)。

#### 太二酸菜鱼 TAI ER｜Jem店

**地址：Jem #B1-04。预算参考：约S$30–40/人。** 适合在Jurong East吃饭后去裕廊湖灯会。

- **特色菜：** 酸菜鱼；搭配手撕包菜和米饭。想吃酸辣、鱼片与酸菜为主的一餐，可以选它。
- **有依据的价格：** [F16]记录三人点“双人餐＋手撕包菜”，**账单合计S$90.64，折合约S$30.21/人**。正文没有拆分鱼和包菜的单价，因此不推算一份鱼多少钱。
- **被哪些帖子推荐：** [F16]，楚凝陈的Jurong East用餐记录；作者认为味道与国内相近、上菜较快，也喜欢冷花茶。它是单次体验，不代表每次都不排队。
- **营业注意：** Jem商场列示 **11:30–14:00、17:00–21:00**。晚饭可安排在17:00后；不要按全天连续营业来计划。
- **核对来源：** [Jem店铺页](https://www.jem.sg/store-directory/tai-er/)。

'''
s = s.replace('### 2. 粤菜／广式点心｜亚洲金阁 Asia Grand', sichuan + '### 2. 粤菜／广式点心｜亚洲金阁 Asia Grand', 1)

putien_yanhuo = '''### 7. 福建菜｜莆田 PUTIEN

**便利选择：Marina Square #02-205；想试原帖里的Parkway Parade特色菜，去80 Marine Parade Road #01-36。** 午市套餐与晚餐单点分别看预算。

| 菜品／套餐 | 大概价格 | 适用口径 |
| --- | --- | --- |
| 午市随心搭套餐 | **S$19.80净价／人** | 官网2026年菜单；指定门店，搭配按人数不同，每日限量 |
| 福建海鲜卤面 | S$29.60 | [F17]的Parkway Parade消费记录，份量未明示 |
| 莆田荔枝肉 | S$26.70 | 同上，税费口径未明示 |
| 酥炒芋芯 | S$16.80 | 同上 |
| 紫菜黄花鱼汤 | S$18.80 | [F17]称为Parkway Parade特色菜，其他门店不可直接套用 |

- **被哪些帖子推荐：** [F14]记录五人聚餐、人均S$40，喜欢焗黄鱼、海鲜面线，也认为整体较稳、偏清淡，没必要仅为打卡专程去；[F17]逐项写出Parkway Parade的菜价。
- **怎么点：** 午餐优先看S$19.80净价套餐，在可选主食中考虑海鲜卤面或兴化炒米粉；正常聚餐可按**S$30–45/人**规划。不要把原帖的黄鱼、牛排、芋泥鸭都理解为套餐包含。
- **注意：** 套餐不含湿纸巾与开胃菜，饮料加购另计；部分门店采用不同菜单。原帖也提醒炸牛排、芋泥鸭、芋头类同时点会偏腻，少人数减少重复油炸菜。
- **核对来源：** [官方2026菜单与午市套餐入口](https://www.putien.com/zh-hans/menu/)、[门店地址](https://www.putien.com/restaurant-locator/)。季节海鲜以当期供应为准，不把夏季蛏子笔记当成9月现货保证。

### 8. 创意中餐／中式餐酒馆｜烟伙 Yan Huo

**地址：22 Cross Street，#01-56A、#01-57/62。规划预算：S$35–55/人，不含酒。** 想把中餐和饭后聊天放在同一处，可以优先看它。

| 特色菜 | 官网当前菜单价 |
| --- | --- |
| 白松露雪蟹蒸蛋 | S$28，另加税费与服务费 |
| 菠萝辣子鸡 | S$26，另加税费与服务费 |
| XO大爷炒饭 | S$18，另加税费与服务费 |
| 松露煲仔饭 | S$48，另加税费与服务费 |
| 百香果锅包肉 | S$23，另加税费与服务费 |
| 羊肚菌花胶鸡汤 | S$48／58，按规格；另加税费与服务费 |

- **被哪些帖子推荐：** [F15]，叮当的Cross Street探店，具体推荐鸡汤、菠萝辣子鸡、雪蟹蒸蛋和炒饭；也提到店内鸡尾酒。
- **怎么点：** 两人想控制预算，可考虑锅包肉＋蒸蛋＋炒饭，菜价合计**S$69，另加税费与服务费**；这是按当前菜单组合的建议。多人想吃更有特色的主食再换松露煲仔饭。
- **注意：** 官网午市11:30–14:30、晚市17:30–22:30，晚市最后点单21:30。它与新开的“椒哩”是不同餐厅，不混用店址、菜单或营业状态。
- **核对来源：** [餐厅菜单与地址](https://www.yanhuo.sg/pages/menu)、[已核对的当前菜单PDF](https://cdn.shopify.com/s/files/1/0955/4559/0055/files/yanhuo-menu.pdf?v=1784109180)。

'''
s = s.replace('### 其他菜系线索：先确认，再决定', putien_yanhuo + '### 其他菜系线索：先确认，再决定', 1)

local = '''## 二、本地特色早餐与熟食中心

这里把本地华人早餐、海南／油鸡饭和熟食中心小吃单列。**想体验“新加坡味”，建议至少安排一顿早餐和一顿熟食中心午餐。** 不需要每顿都吃餐厅。

### 1. 亚坤 Ya Kun｜咖椰吐司、半熟蛋、南洋咖啡

- **点什么：** Kaya Toast with Butter Set，通常包括咖椰牛油吐司、两颗半熟蛋和热咖啡／茶。喜欢冷饮可询问豆浆咖啡等选择。
- **大概价格：** 2026年8月Eatbook记录基础套餐 **S$6.30**；实际规划留 **S$7–9/人**，门店、饮品升级及收费口径可能不同，不承诺全岛统一价格。
- **去哪家：** 想接牛车水／Telok Ayer路线，可选 **Far East Square，18 China Street #01-01**；官网也列出 **297 South Bridge Road** 的Maxwell附近分店。优先选顺路店，不必专门跨城吃连锁早餐。
- **被哪些帖子推荐：** [L2]把亚坤列入反复吃的平价名单；[L1]提供不想太甜时向店员说明咖椰、黄油、咖啡甜度偏好的方法；[L4]则认为它是普通好吃，不必过度期待。
- **注意：** 半熟蛋是这种早餐的常见搭配；如果不喜欢，点单前问门店能否调整。帖子里的定制方法不代表每一家分店都接受所有改法。
- **核对来源：** [官方菜单](https://app.yakun.com/menu.html)、[官网门店表](https://app.yakun.com/find-us)、[2026年8月价格参照](https://eatbook.sg/changi-airport-food/)。

### 2. 天天海南鸡饭｜Maxwell Food Centre

**位置：1 Kadayanallur Street，Maxwell Food Centre #01-10/11。**

- **特色：** 白切鸡、鸡油饭和蘸酱；它与深色酱汁的油鸡饭是两种风格。第一次可点普通鸡饭，想比较口味再和同伴分食。
- **大概价格：** 所阅2026年6月实吃记录为**中份鸡饭S$6**。普通一餐可按 **S$6–10/人**规划，取决于份量、鸡腿等加点和饮料；这是Maxwell摊位口径，不套用到Jewel等餐厅门店。
- **米其林身份：** **2026年必比登推荐，不是一星餐厅。**
- **被哪些帖子提及：** [L4]的多家实测认为鸡肉和米饭表现稳定，但没有达到作者心中的“惊艳”；这里保留这条中性评价，不把人气直接等同于最好吃。
- **注意：** 米其林店页当前列示**周一休息，周二至日10:00–20:00，现金支付**。午间排队较常见，晚到还可能遇到售罄；熟食中心开放不等于这家摊位一定开。
- **核对来源：** [米其林店铺与营业资料](https://guide.michelin.com/en/singapore-region/singapore/restaurant/tian-tian-hainanese-chicken-rice)、[2026官方榜单](https://guide.michelin.com/sg/en/article/michelin-guide-ceremony/full-list-michelin-guide-sg-2026)、[2026年6月消费记录](https://www.thetravelmentor.com/tian-tian-hainanese-chicken-rice-singapore/)。

### 3. 了凡 Hawker Chan｜想尝历史获星的油鸡饭，认准原摊

**原摊：335 Smith Street，Chinatown Complex #02-126。街边餐厅：78 Smith Street。两处价格不同。**

| 吃什么 | 原摊价格参考 | 78 Smith Street餐厅价格参考 |
| --- | --- | --- |
| 油鸡饭 | S$3.50 | S$6.80 |
| 油鸡面 | S$4 | S$7.80 |

以上来自2026年餐饮报道，属于价格参考，不是到店当日保证价。特点是酱油卤香和鸡肉，若更喜欢清爽的鸡油饭，可以先试天天。

- **被哪些帖子推荐：** [L3]的牛车水熟食中心清单，具体提到油鸡饭和油鸡腿面。
- **评级纠正：** L3仍写“米其林一星”，但品牌官网列的是**2016–2019获星记录**；2026年官方星级名单中没有了凡。本文按**历史获星名店**介绍，不写成当前一星。
- **营业注意：** 品牌官网列示原摊 **10:30–15:30、周日休息**；78 Smith Street餐厅每日10:30–20:00，最后点单19:30。傍晚去熟食中心原摊很可能扑空。
- **核对来源：** [品牌门店与历史荣誉](https://www.liaofanhawkerchan.com/locations)、[2026分店价格对比](https://merlion-channel.com/en/hawkerchan/)。

### 4. 牛车水熟食中心加点：咖啡、薄饼

| 店／食品 | 值得试什么 | 大概价格与来源 | 对应帖子 |
| --- | --- | --- | --- |
| **1950年代咖啡 The 1950's Coffee** | 南洋咖啡，可作为鸡饭后的饮料；想吃早餐可再看吐司组合 | [L4]记录冰咖啡 **S$2**，是帖子历史消费价；冷热、奶和糖的选择可能影响价格 | [L3]、[L4]，后者把咖啡列为自己较喜欢的一项 |
| **安珍薄饼 Ann Chin Popiah** | 手工薄饼皮包蔬菜馅；也可试娘惹杯饼Kueh Pie Tee | 2026年5月媒体记录普通薄饼 **S$2.60/卷**、虾薄饼 **S$3.50/卷**、杯饼 **S$4/4个**；不同分店以菜单为准 | [L2]、[L3] |
| **老曾记 Old Chang Kee** | 咖喱角Curry'O，适合路上加餐，馅料有咖喱土豆、鸡肉及蛋 | 规划预算 **S$2–3/个**；公开外卖页显示10个装S$22，仅作价位参照，不当所有分店零售价 | [L2] |

**评级也要分清：** 2026官方名单把 **Ann Chin Handmade Popiah** 和 **The 1950's Coffee** 列为 **MICHELIN Selected**，不是一星；L3把1950年代咖啡写成必比登的说法没有沿用。评级对应具体入选店，不自动覆盖连锁的每一家分店。[2026官方名单](https://guide.michelin.com/sg/en/article/michelin-guide-ceremony/full-list-michelin-guide-sg-2026)

价格补充：[安珍2026年5月报道](https://sethlui.com/ann-chin-popiah-new-outlet-toa-payoh-singapore-may-2026/)、[老曾记公开外卖菜单](https://www.foodpanda.sg/zh/restaurant/p2vh/old-chang-kee-shell-woodlands-ave-9)。

### 5. 本地早餐与鸡饭怎么组合

**亚坤早餐 → 牛车水散步 → 午餐选天天或了凡原摊 → 安珍薄饼／南洋咖啡按食量加点。** 不需要一顿同时吃两份鸡饭。Maxwell和Chinatown Complex是两个熟食中心，导航时区分；天天周一休、了凡原摊周日休也不同。

熟食中心实用提醒：带一些现金；高峰期可能拼桌；看到桌面放着纸巾或个人物品先问是否已有座位；用餐后将托盘放到回收处。先看清摊位当天营业情况，再按想吃的菜排队。

'''
s = s.replace('## 二、酒吧：按体验选择', local + '## 二、酒吧：按体验选择', 1)

renames = {
    '## 二、酒吧：按体验选择': '## 三、酒吧：按体验选择',
    '## 三、地标与常设玩法': '## 四、地标与常设玩法',
    '## 四、近期仍可安排的活动': '## 五、近期仍可安排的活动',
    '## 五、可以直接组合的半日／一日路线': '## 六、可以直接组合的半日／一日路线',
    '## 六、小红书原帖索引': '## 七、小红书原帖索引',
    '## 七、阅读口径与保存记录': '## 八、阅读口径与保存记录',
}
for old, new in renames.items():
    assert s.count(old) == 1
    s = s.replace(old, new, 1)
s = s.replace('先复查第四节活动日期', '先复查第五节活动日期')
s = s.replace('4. **本周节庆：裕廊湖一晚。** 先吃饭，再于18:30后入园，', '4. **本周节庆：裕廊湖一晚。** 17:00后可先在Jem吃太二，再于18:30后入园，')
route_anchor = '## 七、小红书原帖索引'
s = s.replace(route_anchor, '''6. **乌节路尝新。** 乌节路逛街 → 小叫天Wisma店；按正常菜价预算，不计入已结束的开业半价。
7. **清淡午餐＋灯会。** Marina Square莆田午市套餐 → 滨海湾散步 → 滨海湾花园中秋灯会；先确认所选门店当天套餐供应。
8. **创意中餐＋饭后小酌。** 烟伙晚餐 → 在店内聊天，或按预算另订附近酒吧；饭和酒分别预算。

''' + route_anchor, 1)

new_sources = {
    'F12': '6aad157d000000000b03796b',
    'F13': '69fb3f470000000022026fcf',
    'F14': '6aa17a55000000002b01c5dc',
    'F15': '6a0d83f70000000013020400',
    'F16': '6aa66d260000000028039363',
    'F17': '69c5c3af000000002301f129',
    'L1': '69c60066000000002200f454',
    'L2': '69c24bdf000000002301fb7a',
    'L3': '6a03e4cb0000000037037613',
    'L4': '69f8ce56000000003701ca05',
}
rows = {}
for file in base.glob('xhs-*.json'):
    if not file.stat().st_size:
        continue
    data = json.loads(file.read_text())
    if not isinstance(data, list):
        continue
    for row in data:
        match = re.search(r'/(?:search_result|explore)/([a-f0-9]{24})', row.get('url', ''))
        if match:
            rows[match.group(1)] = row

index = []
definitions = []
catalog = json.loads((base / 'guide-sources.json').read_text())
for label, note_id in new_sources.items():
    row = rows[note_id]
    note_path = base / f'note-{note_id}.json'
    note = {x['field']: x['value'] for x in json.loads(note_path.read_text())}
    assert note.get('content') and note.get('author')
    title = note['title'].replace('[', r'\[').replace(']', r'\]')
    index.append(f'- **{label}** · {note["author"]}：[《{title}》][{label}]')
    definitions.append(f'[{label}]: {row["url"]}')
    catalog.append({'ref':label, 'note_id':note_id, 'title':note['title'], 'author':note['author'], 'url':row['url'], 'local_content':str(note_path)})

s = s.replace('## 八、阅读口径与保存记录', '\n'.join(index) + '\n\n## 八、阅读口径与保存记录', 1)
s += '\n'.join(definitions) + '\n'
required = ['小叫天', '莆田 PUTIEN', '烟伙 Yan Huo', '太二酸菜鱼', '亚坤 Ya Kun', '天天海南鸡饭', '了凡 Hawker Chan', 'Jigger & Pony', '近期仍可安排的活动']
assert all(name in s for name in required)
target.write_text(s)
(base / 'guide-sources.json').write_text(json.dumps(catalog,ensure_ascii=False,indent=2))
print(f'Updated {target}: {len(s)} characters, {len(s.splitlines())} lines, {len(catalog)} post references')
