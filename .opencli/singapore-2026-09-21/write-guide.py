import json
import re
from pathlib import Path

base = Path('/Users/jingwang/WORKSPACE/opencli/.opencli/singapore-2026-09-21')
target = Path('/Users/jingwang/WORKSPACE/singapore-guide-2026-09-21.md')
sources = {
    'F1': '69ef0cfe000000002003bf87',
    'F2': '6a70afff00000000280004ba',
    'F3': '6ab0ada50000000026014c1b',
    'F4': '69d3be25000000001b020b74',
    'F5': '6a9fe82700000000270084c3',
    'F6': '6a772d320000000028032640',
    'F7': '6aabac50000000001401e848',
    'F8': '69ea178e000000001b022a13',
    'F9': '6aaff48e00000000280030be',
    'F10': '6aafda7a000000001203f7a2',
    'F11': '6aafdde9000000002a0050c7',
    'P1': '69ea3cda0000000023006f40',
    'P2': '6a1a98d70000000036019d13',
    'P3': '6a27dc6e000000001700aad9',
    'P4': '6a450b5d0000000011015b56',
    'P5': '6a82a482000000003300d492',
    'P6': '6a65fa56000000000f01f6d6',
    'E1': '6aaff63d0000000019026d20',
    'E2': '6ab09ee2000000002b01d5fb',
    'E3': '6aafde320000000027008c80',
    'E4': '6aacacc000000000100002d9',
    'B1': '69ca33ec000000002200e0dd',
    'B2': '6a85b7f2000000003301a6e4',
    'B3': '69d33021000000001a0235f2',
    'B4': '6a53ba51000000001603e964',
    'B5': '69f3377d000000001b021006',
    'B6': '6a393e2d000000001503f87b',
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

body = '''# 新加坡中餐、酒吧与游玩攻略

**核对日期：2026年9月21日｜小红书范围：近半年｜货币：新加坡元 S$**

这份攻略以通过 OpenCLI 实际读取的小红书正文和部分评论为线索，再用餐厅菜单、商场资料和景点／活动官网核对价格、地址与时效。餐厅评价属于作者体验，我没有实地试吃；推荐顺序综合考虑菜品、预算、地点和信息完整度。

文中的 **[F1]、[P1]、[B1]、[E1] 都可以直接点击打开原帖**，末尾另列作者与完整标题。多数查询使用平台“半年内”筛选，少量近期查询使用“一周内”，均在近半年范围内。帖子标题里的“最好吃”“民间米其林”和酒吧排名保留为原始标题，不当作已核实的客观结论。

价格分为三种：**公开菜单价、帖子历史消费价、规划预算**。`++` 表示另加服务费和税。餐厅人均规划预算按2–4人分享普通菜、不点酒和高价海鲜估算；不是店家套餐报价。外卖价格单独标注，不与堂食混用。

## 先选你想要的体验

| 想要什么 | 优先看哪里 | 选择理由 |
| --- | --- | --- |
| 川菜、下饭、菜价较明确 | 骆老妈 | 有烤鸡、水煮鱼、蹄花等可核对的菜单价格 |
| 清淡一点、吃点心 | 亚洲金阁 | 点心单价明确，适合午餐，之后可逛 City Hall |
| 湘菜、朋友聚餐 | 湘野 | 黄牛肉和菌汤在笔记中有具体评价，但作者也觉得略贵 |
| 大盘鸡、面食 | 新疆印象 | 原帖提供人均和大盘鸡消费记录，靠近 Bugis |
| 牛车水平价聚餐 | 中华爆鼎二店 | 有具体到菜名、份数和单价的近半年食客记录 |
| 家常中餐、花柏山附近 | 饱藏 | 菜脯豆腐、糖醋肉价格可核对，适合多人分享 |
| 喝酒更看重酒本身 | Jigger & Pony | 多篇笔记重复推荐，Happy Hour 有明确价格 |
| 安静聊天 | Last Word | 笔记强调安静、日式经典调酒，早场价格较低 |
| 装潢和拍照 | ATLAS | 空间体验突出，原帖对酒的口味也有保留意见 |
| 高空夜景 | LeVeL33 | 看滨海湾，但露台低消要先确认 |

## 一、中餐：按菜系整理

### 1. 川菜｜骆老妈 Luo Lao Ma

**地址：30 Prinsep Street，#01-02。规划预算：S$30–45/人。** 适合2–4人点几道菜分享，之后可去 Bras Basah、Bugis 一带。

| 菜品 | 大概价格 | 依据与点菜建议 |
| --- | --- | --- |
| 骆老妈烤鸡 | S$26 | 小红书作者明确推荐，公开菜单也有同名菜 |
| 非遗黑豆花水煮鱼 | S$36 | 公开菜单的招牌菜；想吃川味鱼可作为主菜 |
| 老妈蹄花 | S$16 | 公开菜单价，适合与辣菜搭配 |
| 麻婆豆腐／家常回锅肉 | S$12／16 | 公开菜单中的家常菜选项 |

- **被哪些帖子推荐：** [F1]，5heeran 的川菜探店。正文提到烤鸡、芥末虾球、话梅年糕排骨和怪味里脊。
- **注意：** 原帖后面三道菜与目前可读取的公开菜单并不完全重合，不能替它们编价格；到店先确认是否供应。这里没有把“民间米其林”当作正式评级。
- **价格与地址核对：** [公开菜单](https://www.quandoo.sg/place/luo-lao-ma-109279/menu)、[菜单PDF](https://quandoo-assets-partner.s3-eu-west-1.amazonaws.com/partner/uploads/08fe12d0-7307-4865-bf07-ce716889ddaf/MD-document-41d9bd41-2bd9-4437-9158-808f74308ef0.pdf)、[餐厅订位资料](https://www.tablecheck.com/en/luo-lao-ma)。菜单标价不自动代表最终净价。

### 2. 粤菜／广式点心｜亚洲金阁 Asia Grand

**地址：Fairmont Singapore 南楼3层，252 North Bridge Road，#03-22B。点心午餐规划预算：S$30–45/人。** 适合不想吃辣、想坐下来慢慢吃的一餐。

| 点心 | 官网菜单价 |
| --- | --- |
| 冬笋鲜虾饺 | S$8.80++／份 |
| 北菇烧卖皇 | S$8.80++／份 |
| 豉汁蒸排骨 | S$8.80++／份 |
| 蜜汁叉烧包 | S$7.80++／份 |
| 脆皮虾肠粉 | S$9.80++／份 |
| 蛋挞仔 | S$7.80++／份 |

- **被哪些帖子推荐：** [F2]，一只兔宝叽的粤菜笔记；重点是手工点心、环境和服务，作者提醒提前订位。
- **怎么点：** 两人可先点虾饺、烧卖、排骨、肠粉，再按食量加包点或甜点；这是依据菜单组成的点单建议，不是原帖列出的固定套餐。
- **注意：点心只在午市供应。** 周末午市分两个时段，不要晚上专程去吃点心。茶水、其他加点会增加账单。
- **核对来源：** [官方菜单与午市时间](https://asiagrand.com.sg/menu/)。已逐页核对官网当前链接的2026年6月点心菜单。

### 3. 湘菜｜湘野 Xiangyee

**地址：101 Killiney Road。规划预算：S$30–50/人。** 适合想吃湘味、又不只追求辣度的聚餐。

| 菜品 | 价格参考 | 来源时间 |
| --- | --- | --- |
| 鲜炒黄牛肉 | S$26.80 | 2026年7月餐饮评测记录 |
| 辣椒炒肉 | S$21.80 | 同上 |
| 杂菌锅 | S$22 | 同上 |
| 湖南炒米粉 | S$14.80 | 同上 |

- **被哪些帖子推荐：** [F3]，露仔的湘菜探店。作者喜欢黄牛肉、炒鸡杂和菌汤，形容整体更偏香辣、没有那么油，也明确说“有点小贵”。
- **我的选择：** 黄牛肉加菌汤，一荤一汤，再加蔬菜或主食，比全部点重口味炒菜更容易搭配。
- **注意：** 表中是近期评测记录，未取得同日堂食菜单；不要把它写成保证不变的现价。炒鸡杂的单价本次未核实。
- **价格及店址：** [DanielFoodDiary 2026年7月评测](https://danielfooddiary.com/2026/07/05/xiangyeehunan/)。湘野入选2026年必比登名单可由[米其林官方名单](https://guide.michelin.com/sg/en/article/michelin-guide-ceremony/full-list-michelin-guide-sg-2026)交叉核对；它与“湘香湖南菜”不是同一家品牌。

### 4. 新疆菜｜新疆印象 Tasty Xinjiang

**地址：2 Tan Quee Lan Street，#01-01，Bugis。原帖人均：S$25–35。** 更适合喜欢鸡肉、牛羊肉和面食的人。

| 菜品 | 大概价格 | 价格口径 |
| --- | --- | --- |
| 招牌大盘鸡，约2–3人份 | 原帖 S$42；当前外卖页 S$52.90 | 前者为历史堂食记录，后者是外卖价，不能直接互换 |
| 传统过油肉拌面 | S$24.90 | 当前公开外卖页，堂食价未核实 |
| 孜然炒烤肉拌面／米饭系列 | S$29.90 | 当前公开外卖页，堂食价未核实 |

- **被哪些帖子推荐：** [F4]，一只兔宝叽的新疆菜笔记。正文重点推荐面食口感和大盘鸡份量，给出上述堂食人均与大盘鸡记录。
- **怎么点：** 2–3人先围绕一份大盘鸡搭配主食，确认是否已经含面，再决定加点，避免重复点过多碳水。
- **注意：** 原帖声称无GST和服务费，本次未从店家条款确认，不能当作现行承诺。
- **当前外卖价格参照：** [Foodpanda商家菜单](https://www.foodpanda.sg/restaurant/l943/xin-jiang-yin-xiang-tasty-xinjiang-tan-quee-lan-street/reviews)。以上外卖价不含配送相关费用。

### 5. 东北家常／烧烤｜中华爆鼎二店 Bao Ding BBQ

**本节对应：34 Pagoda Street，Chinatown。原帖人均：S$20–30。** 适合朋友聚餐，先选家常菜，再按偏好加烤串。

| 菜品 | 帖子中的价格 |
| --- | --- |
| 风味茄子 | S$8.80 |
| 锅包肉 | S$14.80 |
| 芹菜猪肉水饺 | S$6.80 |
| 肉末粉丝煲 | S$8.80 |
| 爆鼎酸菜鱼，小份 | S$28 |
| 烤牛肉串／烤羊肉串 | 记录折合 S$1.20／串 |

- **被哪些帖子推荐：** [F5]，小明《吃完再说 #010》，给出完整点单和费用；[F6]，zx 的二店笔记，也推荐风味茄子和锅包肉。
- **价格时效：** F5明确注明菜单和价格拍摄于**2026年8月**，所以这里按历史消费记录使用。
- **评价分歧：** F5对烤串较正面，F6不喜欢羊肉串，觉得辣子鸡不够入味。综合两篇，我会优先点茄子、锅包肉、水饺，烤串少量尝试。
- **分店注意：** 另有帖子作者给出邮编059496，对应16 Mosque Street的另一处店址。本节不把两家门店的地址或消费记录混用。

### 6. 南洋中式家常／融合｜饱藏 Treasure Paradise

**地址：2 Telok Blangah Way，SAFRA Mount Faber，#01-09。普通单点规划预算：S$30–45/人。** 适合多人围桌吃饭，和花柏山附近行程搭配。

| 菜品 | 大概价格 | 依据 |
| --- | --- | --- |
| 秘制菜脯滑豆腐 | S$18／份 | 官网公开菜单 |
| 荔枝糖醋肉 | S$20／份 | 官网公开菜单 |
| 红斑鱼炉 | 单点价未核实 | 原帖称其出现在S$69++四人套餐中 |

- **被哪些帖子推荐：** [F7]，AB 的饱藏探店，重点提到红斑鱼炉、菜脯豆腐、牛油奶皇鸡、糖醋肉，认为适合三五好友聚餐。
- **我会怎么选：** 先点豆腐和糖醋肉，再看人数及当天菜单决定鱼类；不把鱼的时价与普通小炒放在同一预算档。
- **套餐注意：** S$69++四人套餐目前只有原帖佐证，未确认适用时段、资格或是否仍供应。不要按这个价格直接预计整桌账单；牛油奶皇鸡的单点价也未核实。
- **核对来源：** [餐厅地址](https://treasureparadise.com.sg/)、[官网菜单](https://treasureparadise.com.sg/wp-content/uploads/2025/12/%E9%A5%B1%E8%97%8F%E8%8F%9C%E5%8D%95-Treasure-Paradise-Food-Menu.pdf)。官网定位为中式融合餐厅，本节不把它归成纯粤菜。

### 其他菜系线索：先确认，再决定

| 菜系／店 | 帖子推荐什么 | 为什么暂不列为优先推荐 |
| --- | --- | --- |
| 北方铜锅涮肉：三锅先生，61 Jalan Sultan | 羊肉、麻酱、麻酱烧饼。[F8] | 未核实完整菜单价格；评论对价格和口味分歧明显，有读者报告两人消费S$288。该数字是个人消费案例，不能当标准人均，也不能承诺它是平价火锅 |
| 云贵川风味：椒哩 Jolly Chilli，30 Purvis St #01-01 | 牛胸膘、醋炒蛋、包浆豆腐、牛肋条。[F9]、[F10] | 评论有人称地图显示暂时关闭，作者回复称试营业；尚无一致营业状态，也无可靠单价。去之前先确认店是否接待 |
| 云南米线：唐大小姐，Junction 8 | 野生菌鸡汤米线、番茄肥牛米线。[F11] | 原帖称9月21日至10月1日单点米线可免费升套餐，但未获得店家正式条款和单价；可作附近尝新线索，不据此承诺优惠 |

## 二、酒吧：按体验选择

### 1. Jigger & Pony｜优先喝鸡尾酒

**地址：Amara Singapore，165 Tanjong Pagar Road。** 小红书中有多篇独立作者重复提到，适合第一次在新加坡认真选一家鸡尾酒吧。

- **特色与口味：** Yuzu Whisky Sour偏清爽柚子酸味；Ugly Tomatoes在笔记中因番茄风味受到好评；Espresso Martini适合喜欢咖啡味的人。不同酒款是否仍在当日菜单，以BLOOM酒单为准。
- **已核实价格：** 官网当前链接的2026年8月版Happy Hour菜单中，**Yuzu Whisky Sour、Negroni、Godfather、Pear & Tonic均为S$19++／杯**。Happy Hour为每日 **18:00–19:30**；不要理解为所有酒款都参加。常规时段及Ugly Tomatoes单价本次未核实。
- **注意：** 建议提前订位，尤其周末；店家采用非现金支付。官网写明仅接待18岁以上客人。
- **被哪些帖子推荐：** [B1]具体比较多杯酒；[B2]推荐服务和Yuzu Whisky Sour；[B4]提到Espresso Martini；[B5]喝过Happy Hour的Godfather。
- **核对来源：** [官网／订位](https://www.jiggerandpony.com/)、[官网当前Happy Hour菜单](https://www.jiggerandpony.com/s/Happy-Hour-Menu-Aug-2026.pdf)。当月轮换款不沿用旧月份名称。

### 2. ATLAS｜看装潢、拍照和约会

**地址：Parkview Square，600 North Bridge Road。** 适合把空间体验放在前面的人，也方便和Bugis晚餐安排在一起。

- **喝什么／价格：** **ATLAS Martini S$28++**、**Orange Blossom Martini S$28++**；想比较不同Martini，可看菜单中的三小杯组合 **An ATLAS Suite，S$46++**。Martini酒感较强，点单时可说明自己的口味偏好。
- **被哪些帖子推荐：** [B3]的2026酒吧合集。作者赞赏环境，但对酒的口味评价一般，因此我把它归为“空间体验优先”，而非口味一致好评。
- **注意：** **17:00后执行Smart Casual；男士须长裤和包头鞋。** 官网列明不接受短裤、运动服、拖鞋等。周日通常休息，预约前看当天安排。
- **核对来源：** [当前酒单](https://atlasbar.sg/storage/app/uploads/public/69d/332/f55/69d332f5526c7253694601.pdf)、[着装要求](https://atlasbar.sg/dresscode)、[订位入口](https://atlasbar.sg/drinking)。

### 3. Last Word｜安静聊天、经典调酒

**地址：8 Purvis Street，#02-01。** 和Bugis中餐很容易组合，不以高空景观为卖点。

- **特色酒／价格：** **Bloody Mary S$28++**，菜单带新鲜番茄、芹菜、芥末等咸鲜风味；同名 **Last Word S$30++**，以草本、柑橘酸味和琴酒为主要方向。
- **省预算时段：** 官网列示 **17:00–19:00 Happy Hour**，指定Daiquiri、Singapore Sling Fizz、Rob Roy、Shochu Negroni **S$16++／杯**；不是所有酒款半价。
- **被哪些帖子推荐：** [B2]把它归为安静舒服的日式经典酒吧，具体推荐Bloody Mary，并提到里面的Last Stop空间。
- **注意：** 想安静聊天，预约时说明；座位和当晚客流会影响实际氛围。
- **核对来源：** [官网地址、时间和菜单](https://www.lastword.sg/cocktail-menu)、[常规酒单](https://www.lastword.sg/_files/ugd/39dbee_ef6529ed9a7544ec947d2a81c5f5ca05.pdf)、[Happy Hour酒单](https://www.lastword.sg/_files/ugd/39dbee_90d3aa0a02d44745bb730602e072745f.pdf)。

### 4. LeVeL33｜滨海湾夜景、精酿啤酒

**地址：8 Marina Boulevard，MBFC Tower 1，#33-01。** 想从高处看金沙和滨海湾，优先考虑它。

- **特色与价格：** **Beer Tasting Paddle S$29.90++**，包含5款各100ml精酿；单杯精酿 **300ml S$16.90++／500ml S$19.90++**。不想喝啤酒，Singapore Sling为 **S$27++**。
- **被哪些帖子推荐：** [B5]特别认可景观，也认为它是所去几家中最贵的一家；[B6]记录从18:00等到夜景的体验，并称当时露台低消为 **S$100/人**。
- **重要条件：** 官网确认**露台预约有最低消费和信用卡担保**，但未公开统一固定金额。因此S$100只能当该作者的历史预订记录，最终看你选择的日期和座位条款。下雨后转室内也取决于有无空桌。
- **核对来源：** [2026年7月官方酒单](https://level33.com.sg/wp-content/uploads/2026/07/Beverage-Bkt-July2026-1.pdf)、[预约、露台及着装FAQ](https://level33.com.sg/questions-answers)。旧菜单的S$26.90品鉴板价格没有继续沿用。

## 三、地标与常设玩法

下列时长是行程规划建议，不是官方规定。街区、公园和景点内收费项目分别列示。

| 地标／区域 | 为什么值得去、怎么玩 | 大概费用／建议时长 | 注意事项与帖子 |
| --- | --- | --- | --- |
| **鱼尾狮公园＋滨海湾步道** | 看经典城市天际线，适合傍晚散步，从白天走到亮灯 | 户外步道通常免费；1–2小时 | 建议避开正午；以现场开放范围为准，雕像维修时拍照可能受影响。地点线索来自[P1]；该帖含支付活动推广，本文不采用其优惠信息 |
| **滨海湾花园 Gardens by the Bay** | 巨树、花园夜景；喜欢植物再加入温室，近期还可看中秋灯会 | 户外花园与温室／空中步道分开计费；2–4小时 | 不要把“户外免费”理解成所有设施免费；关注温室维修日。常设地点见[P1]，当前灯会见[E3]及下一节 |
| **Jewel星耀樟宜** | 室内瀑布和森林景观，适合安排在抵达或离境当天 | 看瀑布和公共区域可不买游乐项目票；1–2小时 | 瀑布目前每日10:00–22:00运行；不是全天都有水。光影秀周一至四20:00、21:00，周五至日等增22:00场；给航班预留时间。[P1]、[P2]；[官网](https://www.jewelchangiairport.com/en/attractions/rain-vortex.html) |
| **Kampong Gelam：苏丹回教堂＋哈芝巷** | 金色穹顶、壁画、小店，适合慢逛和拍建筑 | 街区散步免费；1.5–2小时 | 宗教场所按访客开放时间和现场着装要求进入；逛街与参观宗教建筑分开安排。[P1]；[旅游局街区介绍](https://www.visitsingapore.com/neighbourhood/featured-neighbourhood/kampong-gelam/) |
| **牛车水 Chinatown** | 老街、店屋和中餐密集，可把逛街与东北菜晚餐放一起 | 街区免费；1–2小时加吃饭 | 寺庙内部按现场规则参观；吃饭认准分店门牌，不只看中文店名。[P1]，中餐可接[F5]、[F6] |
| **国家美术馆 National Gallery** | 看建筑空间和东南亚艺术，适合炎热或下雨时安排 | 普通展馆标准票S$20；新加坡公民／PR普通门票免费；2–3小时 | 特展票另有规则，部分公共区域免费；不要把公共走廊免费理解成所有展览免费。目前每日10:00–19:00，闭馆前30分钟停止入场。[P2]；[官方票价](https://www.nationalgallery.sg/sg/en/visit/visitor-information.html) |
| **福康宁＋旧禧街＋克拉码头** | 公园树荫、彩色窗建筑、河边晚景，适合一条步行路线 | 户外部分免费；2–3小时 | 有坡道台阶；热门树洞机位排队时可直接继续逛公园。建议傍晚把河边作为终点。[P1]、[P2] |
| **如切／加东＋东海岸** | 彩色店屋和海边散步组合，比密集打卡更轻松 | 街区与公园散步免费；半天 | 街区到海边并非一个小广场，按体力安排交通；别坐上住户门阶拍照，注意自行车道。[P2]、[P3] |
| **圣淘沙三大海滩** | Palawan看吊桥和观景点；Siloso设施较多；Tanjong偏安静 | 从Boardwalk步行上岛免费，岛内公共交通免费；半天 | 先分清免费海滩与付费设施；从VivoCity搭车上岛不是同一个收费口径。带水、防晒，夜间看公共交通班次。[P5]；[官方交通说明](https://www.sentosa.com.sg/en/getting-around)、[官方玩法指南](https://www.sentosa.com.sg/en/get-inspired/sentosa-guides/is-sentosa-worth-it/) |
| **新加坡环球影城 USS** | 如果更喜欢游乐设施，重点看木乃伊、变形金刚、双轨过山车等 | 单独购票，票价随日期／身份／产品不同；建议整天 | 原帖写10:00–20:00，但不把它当每天固定营业时间；按出行日查看官方运营日历。也要看身高限制、项目停运和快通适用范围。[P6]；[官方票务](https://www.rwsentosa.com/en/play/universal-studios-singapore/tickets) |
| **MacRitchie／TreeTop Walk** | 在森林和树冠高度看自然景观，适合愿意走路的人 | 无需景点门票；官方Windsor起点往返路线约7km、3–4小时 | **周一通常关闭，公假例外；末次入场16:45。** 与湖边短散步不是同一体力需求，带水、防蚊，雷雨时不进森林。[P4]；[NParks路线与开放说明](https://www.nparks.gov.sg/visit/parks/central-catchment-nature-reserve/activities) |
| **万态Exploria** | 自然主题沉浸式多媒体装置和互动手环，适合室内体验 | 非居民成人S$38、儿童S$28；本地居民WildPass另有价；建议1.5–2小时 | 含声光变化；The Giants Show虽包含在门票内，仍需预约时段。不要把河川生态园、Exploria当成一张票。[P3]；[票价](https://www.mandai.com/en/tickets-and-passes/single-attractions/exploria.html)、[访客须知](https://www.mandai.com/en/plan-your-visit/know-before-you-go/exploria.html) |

**半年前攻略中需要更新的一处：** [P3]推荐了河川生态园的Amazon River Quest乘船体验，但[万态官方当前公告](https://buy.mandai.com/web-storefront)显示它在**2026年8月31日至9月30日维护关闭**。若近期去，不要为这一个项目买票。

## 四、近期仍可安排的活动

### 1. 裕廊湖花园 Lights by the Lake｜优先安排本周

- **为什么好玩：** 白蛇传主题灯组、湖边夜景和宝塔光影，适合边走边看，不只停在一个拍照点。
- **日期与时间：** 主要节庆活动 **9月19–27日**；灯饰展示延续至 **10月4日**，每天 **18:30–22:30**。宝塔常规光影秀的日程与灯饰不同，不要认为10月4日前都能看完整节目。
- **费用：** 公共灯饰免费，消费及个别活动另计。
- **被哪些帖子推荐：** [E1]区分了活动期与灯饰期；[E2]介绍免费盖章，提到牌坊附近、石舫、双塔、入云塔、蕴秀园五处线索。
- **注意：** 盖章和纪念品兑换以当日现场安排为准；9月21日宝塔有特别灯光安排。按想看的区域选择Chinese Garden或Lakeside入口，少走回头路。
- **官方核对：** [灯饰／光影秀日程](https://lightsbythelake.nparks.gov.sg/lantern-displays/)、[NParks活动介绍](https://lightsbythelake.nparks.gov.sg/about/)、[晚晴园免费活动说明](https://www.sysnmh.org.sg/ch/whats-on/events/wan-qing-mid-autumn-festival-2026)。

### 2. 滨海湾花园中秋灯会｜截至9月27日

- **为什么好玩：** 灯组、巨树夜景和市集可以同晚安排；如果已经在市中心吃饭，这条路线方便。
- **日期与时间：** **9月12–27日，18:00–22:00。**
- **费用：** 户外中秋灯会免费；餐饮、游乐、温室等另计。
- **被哪些帖子推荐：** [E3]是近期现场体验，认为灯效保持水准，也认为今年缺少大IP联名。这是带保留意见的评价，不是单向宣传。
- **注意：** 想看特定表演先查当天节目；下雨可能取消演出。Borealis在活动期间调整为 **21:00–21:15**。
- **官方核对：** [活动官网及特别安排](https://www.gardensbythebay.com.sg/en/things-to-do/calendar-of-events/mid-autumn-festival-2026.html)。

### 3. 华族文化中心巨型兔灯｜日期最宽松

- **为什么好玩：** 广场和天台花园的巨型兔装置，适合饭后拍照和短时间散步，可与Tanjong Pagar晚餐／Jigger & Pony搭配。
- **日期与时间：** **9月11日至12月13日，每天10:00–22:00。** 想看亮灯效果，建议傍晚后到。
- **费用与位置：** 免费；**1 Straits Boulevard，SCCC广场与天台花园**。
- **被哪些帖子推荐：** [E4]，作者为“新加坡华族文化中心”的活动发布，与机构官网内容一致。
- **注意：** **9月19–20日的“中秋合家FUN”集中活动已经结束**，但兔灯装置仍在。不要把已结束的摊位、集章领奖或工作坊当成每天都有。
- **官方核对：** [装置活动页面](https://singaporeccc.org.sg/events/bit-bit-forest-mid-autumn-light-up-maff-2026/)、[集中活动与装置日期说明](https://singaporeccc.org.sg/media_room/sccc-scos-mid-autumn-family-fun-2026-brings-mid-autumn-traditions-to-life-with-giant-rabbit-inflatables-lantern-walks-moongazing-activities-and-more/)。

## 五、可以直接组合的半日／一日路线

以下路线是我按位置和时段重新组合的建议，不是照抄某一篇帖子。

1. **中餐＋鸡尾酒：Bugis半日。** 下午哈芝巷／苏丹回教堂 → 新疆印象晚餐 → Last Word，或提前约ATLAS。想用Last Word的Happy Hour，把酒吧安排在17:00–19:00，再吃晚饭。
2. **点心＋文化＋夜景：City Hall半日。** 亚洲金阁午市点心 → 国家美术馆 → 鱼尾狮／滨海湾步道 → LeVeL33。露台最低消费确认后再订；当天不想久坐，直接走夜景路线也成立。
3. **平价中餐＋老街：牛车水一晚。** 老街散步 → 中华爆鼎二店家常菜 → 另择一天专门安排酒吧，不必把一顿平价晚餐自动扩成高预算夜生活。
4. **本周节庆：裕廊湖一晚。** 先吃饭，再于18:30后入园，按入口方向串联白蛇灯组、裕华园和盖章点；想看完整主要节目，优先9月27日前。
5. **海边放松：圣淘沙半天。** VivoCity经Boardwalk步行上岛 → Palawan → 按喜好选择Siloso或Tanjong → 返程后在HarbourFront／花柏山附近吃饭。若改去USS，则把当天主要时间留给乐园。

## 六、小红书原帖索引

以下都已实际读取正文；在正文引用评论结论的地方，也读取了对应评论。标题保持原样便于查找。P1含明确支付活动推广，本文只采用地点线索；各帖排名与“最佳”等用语均属于作者表述。

'''

index = []
definitions = []
catalog = []
for label, note_id in sources.items():
    row = rows[note_id]
    note_path = base / f'note-{note_id}.json'
    note = {entry['field']: entry['value'] for entry in json.loads(note_path.read_text())}
    assert note.get('content') and note.get('author'), (label, note_id)
    title = note['title'].replace('[', r'\[').replace(']', r'\]')
    author = note['author'].replace('[', r'\[').replace(']', r'\]')
    index.append(f'- **{label}** · {author}：[《{title}》][{label}]')
    definitions.append(f'[{label}]: {row["url"]}')
    catalog.append({'ref': label, 'note_id': note_id, 'title': note['title'], 'author': note['author'], 'url': row['url'], 'local_content': str(note_path)})

body += '\n'.join(index) + '\n\n'
body += '''## 七、阅读口径与保存记录

- 小红书用于发现店、菜品和体验；菜单价格、票价、营业条件及活动日期尽量由官方来源补充核对。
- 收集时使用“半年内”及“最多收藏／最新”等筛选。本文不把搜索卡片上的计数直接作为质量排名，也不把笔记ID推算日期当正式发布日期。
- 没有完整价格或营业状态存在矛盾的店，放在“先确认”名单；正文明确区分网友评价、历史报价和当前官网信息。
- 已排除五一优惠、9月19–20日已结束的集中活动等过期安排。将来使用本文件时，先复查第四节活动日期。
- 本次原始搜索、笔记正文、相关评论、菜单及来源映射保存在本机：`/Users/jingwang/WORKSPACE/opencli/.opencli/singapore-2026-09-21/`。它们是本次采集的快照，不会自动更新。
- 小红书链接保留搜索结果原有参数，便于打开；平台可能要求登录，链接的访问参数也可能过期。遇到失效，可按索引中的完整标题和作者在小红书内搜索。

'''
body += '\n'.join(definitions) + '\n'
used = set(re.findall(r'\[([FPBE]\d+)\]', body))
assert used == set(sources), (used - set(sources), set(sources) - used)
assert not target.exists(), f'Refusing to overwrite {target}'
target.write_text(body)
(base / 'guide-sources.json').write_text(json.dumps(catalog, ensure_ascii=False, indent=2))
print(f'Wrote {target}: {len(body)} characters, {len(body.splitlines())} lines, {len(sources)} retrieved post references')
