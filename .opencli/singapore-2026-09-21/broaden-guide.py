import json
import re
from pathlib import Path

base = Path('/Users/jingwang/WORKSPACE/opencli/.opencli/singapore-2026-09-21')
target = Path('/Users/jingwang/WORKSPACE/singapore-guide-2026-09-21.md')
s = target.read_text()
assert '#### 锅匠 Guo Jiang' not in s

s = s.replace('外卖价格单独标注，不与堂食混用。', '所有价格与预算均按堂食整理；无法核实的堂食单价明确标注。')
s = s.replace('| 招牌大盘鸡，约2–3人份 | 原帖 S$42；当前外卖页 S$52.90 | 前者为历史堂食记录，后者是外卖价，不能直接互换 |', '| 招牌大盘鸡，约2–3人份 | S$42 | 原帖堂食消费记录 |')
s = s.replace('| 传统过油肉拌面 | S$24.90 | 当前公开外卖页，堂食价未核实 |', '| 手工面食 | 堂食单价待核实 | 原帖重点推荐面条口感，人均S$25–35可作参考 |')
s = s.replace('| 孜然炒烤肉拌面／米饭系列 | S$29.90 | 当前公开外卖页，堂食价未核实 |\n', '')
s = re.sub(r'^- \*\*当前外卖价格参照：\*\*.*\n', '', s, flags=re.M)
s = s.replace('规划预算 **S$2–3/个**；公开外卖页显示10个装S$22，仅作价位参照，不当所有分店零售价', '现场购买可预留 **S$2–3/个**的规划预算；具体门店单个售价待核实')
s = s.replace('价格补充：[安珍2026年5月报道](https://sethlui.com/ann-chin-popiah-new-outlet-toa-payoh-singapore-may-2026/)、[老曾记公开外卖菜单](https://www.foodpanda.sg/zh/restaurant/p2vh/old-chang-kee-shell-woodlands-ave-9)。', '价格补充：[安珍2026年5月堂食／门店价报道](https://sethlui.com/ann-chin-popiah-new-outlet-toa-payoh-singapore-may-2026/)。')

overview = '''## 按菜系和场景选店

主表共 **27家餐厅选择**，另有本地早餐／熟食小吃和4家酒吧。上海菜不单列；江浙菜保留。分类依据餐厅主打与实际菜单，跨菜系餐厅会标明风格。**湘聚、湘厨、阿里疆、锅匠、花婆婆**也纳入了你提供的推荐线索。

| 类别 | 同类选择 | 怎么挑 |
| --- | --- | --- |
| 川菜／川味／串串 | **骆老妈、小叫天、太二、锅匠、花婆婆** | 炒菜与烤鸡、酸菜鱼、芋儿鸡／鱼蛙锅、串串锅分别选 |
| 粤菜／点心 | **亚洲金阁、瑞春、红星** | 正式午市、宵夜、传统推车早茶三种场景 |
| 湘菜 | **湘野、湘聚、湘厨** | 相对温和、传统湘味、猛火小炒与鱼头分别比较 |
| 新疆／西北面食 | **新疆印象、阿里疆、伊尊** | Bugis面食、VivoCity聚餐、如切面与烤肉 |
| 东北家常／烧烤 | **中华爆鼎二店、东北人家、宴来居** | 牛车水两种选择，西部另有宴来居 |
| 福建／闽南菜 | **莆田、临家、班岚** | 日常与午市、闽南海鲜、较正式聚餐 |
| 江浙菜 | **椿花奶奶、龙井、南京大牌档、甬府** | 杭帮家常、浙江菜、南京菜、宁波高预算宴请 |
| 南洋煮炒／创意中餐 | **饱藏、烟伙、琼荣记KEK** | 分别是中式家常融合、创意餐酒馆、本地煮炒；不把三者说成同一种菜系 |
| 本地特色 | **亚坤、天天鸡饭、了凡原摊、1950年代咖啡、安珍、老曾记** | 单独安排早餐、熟食中心午餐与小吃 |
| 酒吧 | **Jigger & Pony、ATLAS、Last Word、LeVeL33** | 鸡尾酒、装潢、安静聊天、高空夜景 |

'''
start = s.index('## 先选你想要的体验')
end = s.index('## 一、中餐：按菜系整理')
s = s[:start] + overview + s[end:]

sichuan = '''#### 锅匠 Guo Jiang

**地址：38 Mosque Street，Chinatown。规划预算：S$30–50/人。你也推荐过这家。**

- **特色与价格：** 鱼锅的招牌麻辣豆花／鲜青椒等口味，公开堂食订位菜单标 **S$38.80**；蛙锅多种口味也标 **S$38.80**；咸蛋黄豆腐 **S$14.80**。份量和锅底请按门店菜单确认。
- **更有针对性的点菜线索：** [R21]反复点**烟笋芋儿鸡**，喜欢芋头的绵密口感、鸡肉和烟笋，认为并不特别辣；这道菜的单价本次待核实。可按喜好搭配快熟面，冰粉收尾。
- **帖子：** [R21]是具体点菜评价；[R1]提供同店地址。你提供的推荐也保留，未因原帖文字少而删除。
- **核对：** [锅匠公开堂食菜单与地址](https://www.quandoo.sg/place/guo-jiang-95282/menu)。

#### 花婆婆火锅串串 Hua Po Po／Huapopot

**已确认是你记得的串串店。** 三个地址分开记录：**35 Tyrwhitt Road**；**Bugis：87 Beach Road #01-02**；**Jurong East：2 Venture Drive #01-23，Vision Exchange**。

- **特色：** 老妈蹄花鸳鸯锅、串串、鲜切牛肉、雪花牛肉、手搓冰粉；Bugis的帖子还提到铁板烧串串。
- **堂食价格线索：** [R2]记录串串 **S$0.45/签**；[R3]记录Bugis **S$12.90单人午市工作餐**。这些是帖子的消费／活动记录，**不是任意时间、任意分店都可用的固定套餐价**。锅底、肉盘、蘸料等拆价待核实，不能只用串数推整餐账单。
- **帖子：** [R2]列了三家分店；[R3]是Bugis近期探店，提到9月11–25日蹄花快闪。活动是否仍接待及适用条款按店家当天说明，不跨分店套用。
- **怎么选：** 想边吃边涮选花婆婆；想一锅鱼、蛙或芋儿鸡配米饭，选锅匠。它们是不同用餐形式。

'''
s = s.replace('### 2. 粤菜／广式点心｜亚洲金阁 Asia Grand', sichuan + '### 2. 粤菜／广式点心\n\n#### 亚洲金阁 Asia Grand', 1)

cantonese = '''#### 同类再选：瑞春、红星

| 店与位置 | 特色菜、价格或人均 | 适合什么／帖子依据 |
| --- | --- | --- |
| **瑞春 Swee Choon**，Jalan Besar总店，183–193号一带 | 虾饺、烧卖、叉烧包、萝卜糕；**原帖堂食人均S$20–30**，本次未确认各点心的最新堂食单价 | 宵夜或多人分享。[R8]。官网现列周日至四07:00–02:00，周五、六及公假前夕至04:00；不是每天都到04:00 |
| **红星 Red Star**，54 Chin Swee Road #07-23 | 推车点心、虾饺、烧卖；2025年Eatbook堂食报道记录虾饺／烧卖 **S$5.70++/碟**，当前菜单价待核实；规划人均S$25–40 | 想体验传统推车早茶。[R9]重点讲的是环境与推车体验，未提供菜价，不把“怀旧”当成口味保证 |

核对：[瑞春总店及营业时间](https://www.sweechoon.com/pages/outlet-details)、[红星官网与地址](https://www.red-star.com.sg/)、[红星堂食价格旧报道](https://eatbook.sg/red-star-restaurant/amp/)。红星的旧价只作量级参考，未沿用已结束的节日套餐。

'''
s = s.replace('### 3. 湘菜｜湘野 Xiangyee', cantonese + '### 3. 湘菜\n\n#### 湘野 Xiangyee', 1)

hunan = '''#### 湘聚 Xiang Ju

**你推荐的店，已补入。** 官网列出 **牛车水42/43 Mosque Street #01-01**、**Bugis 20 Tan Quee Lan Street #01-10/11/12，Guoco Midtown II**。

- **特色：** 官网主厨推荐捞菜排骨、香辣腊青鱼尾、腊味火锅、古法甲鱼煲。已读取的[R4]图片另外展示**酸菜炒小笋、蒜蓉粉丝蒸扇贝**等。
- **大概价格：** **当前堂食单菜价和实际人均待核实**。原帖整体评价是好吃、香辣、但偏贵，未公布账单；因此不填未经确认的价格，也不把其他品牌的菜单套到湘聚。
- **帖子：** [R4]，一个80kg的吃货的单人晚餐；已读正文及三张菜品图。你的推荐与该帖整体正面评价相互补充。
- **核对：** [湘聚官网、分店和主厨推荐](https://www.xjgroup.com.sg/)。多人聚餐更便于分享，海鲜／甲鱼类先看具体规格。

#### 湘厨 Xiangchu

**地址：8 Smith Street。规划预算：S$30–50/人。你也推荐过这家。** 这里核对的是“湘厨”，没有与“湘香湖南菜”混用名称或门店。

| 菜品 | 官网列示价格 |
| --- | --- |
| 长沙辣椒炒肉 | S$22 |
| 鲜炒黄牛肉 | S$26 |
| 鸿运双色鱼头 | S$38 |
| 樟树港辣椒炒鳝鱼 | S$48 |

- **被哪些帖子推荐：** [R5]说近期吃了三回，推荐老坛晒辣椒、双色鱼头、开胃醋炒蛋、黑松露虾仁炒饭，也喜欢扣肉配馍。后几项堂食单价本次未核实。
- **怎么点：** 喜欢直接下饭选辣椒炒肉／黄牛肉；多人选鱼头，再配一两道炒菜。能否降辣先问，不按所有湘菜都“重辣”来判断。
- **核对：** [官网招牌价格与地址](https://www.xiangchu.sg/)。官网未在这些价目旁明确净价口径，结账以门店为准。

'''
s = s.replace('### 4. 新疆菜｜新疆印象 Tasty Xinjiang', hunan + '### 4. 新疆／西北面食\n\n#### 新疆印象 Tasty Xinjiang', 1)

xinjiang = '''#### 阿里疆 Alijiang

**你推荐的店，已补入。地址：VivoCity Sky Park #03-11B，1 HarbourFront Walk。规划预算：S$30–55/人。** 很适合与圣淘沙行程衔接。

| 特色菜 | 官网门店餐牌参考价 |
| --- | --- |
| 阿里疆大盘鸡 | **S$28.80/份**；加面S$3.80 |
| 鲍鱼大盘鸡 | S$48.80/份 |
| 椒麻鸡 | S$16.80／26.80，按规格 |
| 东乡手抓肉 | S$39.80／69.80，按规格 |
| 手工酸奶 | S$6.80 |

- **帖子：** [R6]记录VivoCity两人吃S$88套餐，喜欢缸缸羊肉、椒麻鸡、炒烤牛肉、羊肉串和酸奶凉糕，认为份量足。该套餐是否仍供应未核实，不作为当前承诺。
- **怎么点：** 普通聚餐先选大盘鸡／手抓肉之一，再补一两道小菜；不要把不同规格或“鲍鱼大盘鸡”当成普通大盘鸡同价。
- **核对：** [官方菜单](https://alijiang.com.sg/menu)，已核对其门店餐牌图片；[官网门店时间](https://alijiang.com.sg/)。午晚餐间有休息时段，不能按11点至晚间连续营业安排。

#### 伊尊 Yi Zun Noodle｜如切店

**地址：60 Joo Chiat Road #01-08/09。** 更适合面食、烤羊排、羊肉串的组合，顺路可逛如切与东海岸。

- **特色：** 牛肉拉面、羊肉串、烤羊排；[R7]尤其喜欢烤羊排与羊肉串，对川香鸡则认为鸡嫩但刚上桌不够入味。
- **价格：** **最新堂食单价待核实**；原帖未写金额，官网提供的如切菜单下载链接本次无法打开。可先按普通面食加烤肉一餐预留 **S$20–35/人作为规划估算**，这不是网友账单或店家套餐报价。
- **帖子与门店：** [R7]；[官网如切菜单入口与地址](https://www.yizunnoodle.com/menu/joo-chiat)。

'''
s = s.replace('### 5. 东北家常／烧烤｜中华爆鼎二店 Bao Ding BBQ', xinjiang + '### 5. 东北家常／烧烤\n\n#### 中华爆鼎二店 Bao Ding BBQ', 1)

dongbei = '''#### 同类再选：东北人家、宴来居

| 店与位置 | 特色菜与价格线索 | 帖子与选择提醒 |
| --- | --- | --- |
| **东北人家**，22 Upper Cross Street | 大拉皮、锅包肉、火爆腰花、辣子鸡、烤串；[R10]堂食人均 **S$20–30**，单菜最新价格待核实 | [R10]较正面；[R11]则不喜欢干煸四季豆和锅包肉，并记录两人S$40。保留这种分歧，不写成一致好评 |
| **宴来居 Yan Lai Ju**，2 Venture Drive #01-25/26，Vision Exchange | 公开堂食菜单：东坡肉 **S$20**、酸菜鱼片 **S$20**、重庆烤鱼 **S$28.80**、招牌烤羊排 **S$32.80**；规划S$25–40/人 | [R12]喜欢红烧肉、烤串、凉皮和炸酱面，适合住西部时选择。与同楼花婆婆不是同一个单位 |

核对：[宴来居堂食菜单与地址](https://www.quandoo.sg/place/yan-lai-ju-88858/menu)。东北人家的单菜没有完整堂食价格依据，因此仅保留网友实付人均。

'''
s = s.replace('### 6. 南洋中式家常／融合｜饱藏 Treasure Paradise', dongbei + '### 6. 南洋中式家常／融合｜饱藏 Treasure Paradise', 1)

fujian_start = s.index('### 7. 福建菜｜莆田 PUTIEN')
yanhuo_start = s.index('### 8. 创意中餐／中式餐酒馆｜烟伙 Yan Huo')
candidate_start = s.index('### 其他菜系线索：先确认，再决定')
fujian = s[fujian_start:yanhuo_start]
yanhuo = s[yanhuo_start:candidate_start]
s = s[:fujian_start] + s[candidate_start:]
s = s.replace('### 6. 南洋中式家常／融合｜饱藏 Treasure Paradise', '### 6. 南洋煮炒／创意中餐\n\n三家风格分别标注：饱藏偏中式家常融合，烟伙偏创意餐酒馆，琼荣记是南洋煮炒。\n\n#### 饱藏 Treasure Paradise', 1)
yanhuo = yanhuo.replace('### 8. 创意中餐／中式餐酒馆｜烟伙 Yan Huo', '#### 烟伙 Yan Huo', 1)
fujian = fujian.replace('### 7. 福建菜｜莆田 PUTIEN', '### 7. 福建／闽南菜\n\n#### 莆田 PUTIEN', 1)

kek = '''#### 琼荣记 Keng Eng Kee／KEK｜Alexandra、Bukit Merah

- **特色：** 咖啡排骨、辣椒螃蟹、月光河粉；更适合想体验本地煮炒的一桌分享菜。
- **大概价格：** 当前堂食单价待核实。2024年Time Out堂食介绍记录咖啡排骨 **S$15.80起**、月光河粉 **S$7.80起**；这些是旧价参考，不当2026报价。普通炒菜可按 **S$30–45/人规划**，若加螃蟹必须另外确认重量、时价和整只费用。
- **帖子：** [R20]是自费再访，喜欢辣椒蟹和咖啡排骨；觉得鹿肉偏咸，对咖喱鱼头和铁板豆腐评价较低。因此优先选该帖明确喜欢的两道。
- **核对：** [米其林店铺定位与招牌](https://guide.michelin.com/ph/en/singapore-region/singapore/restaurant/keng-eng-kee)、[旧堂食价参照](https://www.timeout.com/singapore/restaurants/keng-eng-kee-seafood)。本项是本地煮炒补充，不以“米其林”三个字代替口味判断。

'''

fujian_more = '''#### 临家 LINKUS

**选择：Suntec City #01-436；原帖[R14]探访的是义安城分店。** 两店体验和价格不要默认完全一致。

- **特色：** 泉州牛肉汤、大红袍花椒焗黄鱼、闽南米糕蒸红蟳、厦门花生汤配芋泥包。[R14]是二访记录，喜欢红蟳米糕和花生汤组合。
- **堂食价格参考：** 2026年2月Suntec媒体试吃记录：泉州牛肉汤 **S$9.90/位**、黄鱼 **S$55**、米糕蒸蟹 **S$89**、厦门沙茶海鲜锅 **S$39.90**。原帖没有拆价，上述不是义安城同日菜单。聚餐规划可按 **S$40–70/人**，海鲜选择会显著改变预算。
- **核对：** [Suntec堂食菜单与试吃记录](https://middleclass.sg/treats/linkus-restaurant-suntec-city/)。该价格来源是媒体试吃，不充当独立食客一致口碑。

#### 班岚 Ban Lan

**地址：6 Scotts Road #02-01/02，Scotts Square。** 更适合正式聚餐，预算高于普通家常菜馆。

- **特色：** 铁观音茶香酥皮鸡、泉州姜母鸭、响螺片拌乌鸡、青酱大卷、螃蟹蒸米糕、泡饭；[R13]为家庭聚餐记录，具体列出了这些菜中的多项。
- **已核对堂食套餐：** 官方菜单入口提供的“自在小园”**2–3位大厅套餐S$189++**，含茶香酥皮鸡、黄花鱼等；“山水清见”**4–5位大厅套餐S$329++**，含姜母鸭、醉猪小排、泡饭等。不能把套餐总价当单人价。
- **怎么选：** 喜欢福建菜但预算有限，优先比较莆田；想正式聚餐并分享海鲜，可把临家和班岚放在一起看。班岚原帖提到国内品牌荣誉，本文不据此写新加坡店当前获星。
- **核对：** [品牌官方菜单入口与地址](https://linktr.ee/sgbanlan)、[已核对的套餐PDF](https://drive.google.com/file/d/12Bm1DJGsAG2DpqmdZQH8ILxGP9mosFr2/view)。

'''

jiangzhe = '''### 8. 江浙菜｜保留，不单列上海菜

#### 椿花奶奶 Nai Nai Flavor｜杭州家常与江南小吃

**地址：i12 Katong #02-13/14，112 East Coast Road。规划预算：S$20–35/人。**

- **特色与堂食价参考：** 奶奶传承神仙鸡 **中份S$16.80／大份S$29.80**；东坡肉小菜 **S$8.80**。另有无锡酱排骨、游埠鸡子粿等，后两项单价待核实。
- **帖子：** [R15]具体喜欢神仙鸡、无锡酱排骨和鸡子粿，可与如切／东海岸行程搭配。
- **核对：** [2026年4月联合早报堂食报道](https://www.zaobao.com.sg/lifestyle/food/story20260425-8933032)、[堂食菜品与价位记录](https://ieatishootipost.sg/nai-nai-flavor-comfort-food/)。口味包含咸甜、炖煮和小吃，不把菜单上跨地区菜全部说成传统杭州菜。

#### 龙井 LONGJING｜浙江菜，商场聚餐

**可选Suntec City Tower 5 #01-384，或Velocity@Novena Square。原帖人均S$20–40++。**

- **特色／价格参考：** 2026年5月Novena堂食评测记录：绿茶烤鸡 **S$23.80**、东坡排骨 **S$20.80**、猪肉卷 **S$19.80**、杭州生煎包 **S$7.80**。不同门店和新菜单价格以现场为准。
- **帖子：** [R16]喜欢烤鸡、粉丝虾和饭类，但提醒组合会偏重口；[R17]对烤鸡和生煎不满意，却喜欢猪肉卷、茄子煲。点单时可以参考这种菜品层面的分歧，而非只看整店好评。
- **核对：** [Novena商场的品牌介绍](https://www.velocitynovena.com/tenant/longjing/)、[2026年5月堂食价格参照](https://oo-foodielicious.com/longjing-restaurant-novena/)。

#### 南京大牌档 Nanjing Impressions｜南京／江苏风味

**位置：Plaza Singapura，三楼。规划预算：S$20–35/人。**

- **特色与价格：** 阳春面 **S$4.80**、麻油素干丝 **S$8.80**、蜜汁糯米藕 **S$12.80**、糖醋排骨 **S$18.80**，来自公开堂食菜单。美龄粥是原帖更喜欢的一项，单价本次未核实。
- **帖子：** [R18]明确推荐美龄粥和S$4.80阳春面，对南京烤鸭和包菜粉丝则有保留，不照抄成“全菜单必点”。
- **核对：** [公开堂食菜单](https://www.quandoo.sg/place/nanjing-impressions-53163/menu)。

#### 甬府 Yongfu｜宁波菜，高预算备选

**地址：Suntec City Tower 5，3 Temasek Boulevard #01-444。** 以宁波菜分类；不因公司名称含“Shanghai”而另加上海菜一类。

- **特色：** 黄鱼鱼肚羹、沙蒜豆面、姜茸蒸鮸鱼、宁波汤圆等海鲜与宁波风味。菜单会随季节调整。
- **已核对价格：** 官网**双人午市套餐S$299++**，折合S$149.50++/人；套餐页面说明适用周一至五、公假除外。另一份双人晚市套餐B为 **S$499++**。这些不是全店固定最低消费，也不是单点价格。
- **帖子：** [R19]记录实际人均约S$250，认为环境和服务好于食物、性价比不符合期待。所以把它列为商务／正式聚餐备选，不列入平价或口味优先名单。
- **核对：** [官网菜单与2026一星说明](https://www.yongfusg.com/menu)、[双人套餐](https://www.yongfusg.com/_files/ugd/9c76fd_98c638200d2642458e12fb2731f94630.pdf)、[地址](https://www.yongfusg.com/contact)。

'''
s = s.replace('### 其他菜系线索：先确认，再决定', yanhuo + kek + fujian + fujian_more + jiangzhe + '### 其他菜系线索：先确认，再决定', 1)
s = s.replace('返程后在HarbourFront／花柏山附近吃饭。', '返程可在VivoCity吃阿里疆，或在HarbourFront／花柏山附近吃饭。')
s = s.replace('4. **本周节庆：裕廊湖一晚。** 17:00后可先在Jem吃太二，', '4. **本周节庆：裕廊湖一晚。** 可先选Jem太二，或Vision Exchange的宴来居／花婆婆，')

new_sources = {
 'R1':'69d667c200000000210078b5',
 'R2':'6a54b2af000000002103d82d',
 'R3':'6aa623960000000026016ee8',
 'R4':'6a92d8920000000037037dcc',
 'R5':'69cf87eb000000002301c295',
 'R6':'6a01d59b000000003802290b',
 'R7':'69e5aed1000000001a02087e',
 'R8':'6a0863e30000000008030270',
 'R9':'6a991687000000000f03a000',
 'R10':'69cc5b65000000001a02b19a',
 'R11':'6a94027d00000000030280b8',
 'R12':'69de3ac4000000001b021e83',
 'R13':'6a6946c0000000001c012848',
 'R14':'6a59e97b0000000008009c00',
 'R15':'6a8ea189000000002903e761',
 'R16':'6a9e0147000000000b0377e9',
 'R17':'6aa7e0b00000000019024fc8',
 'R18':'6a3f8a73000000001503f314',
 'R19':'6a73090d000000000502bd80',
 'R20':'6a682741000000000f01c0fe',
 'R21':'6a48600c00000000170282dd',
}
rows = {}
for file in base.glob('xhs-*.json'):
 if not file.stat().st_size: continue
 data = json.loads(file.read_text())
 if not isinstance(data,list): continue
 for row in data:
  match = re.search(r'/(?:search_result|explore)/([a-f0-9]{24})',row.get('url',''))
  if match: rows[match.group(1)] = row
catalog = json.loads((base/'guide-sources.json').read_text())
index=[]
definitions=[]
for label,nid in new_sources.items():
 row=rows[nid]
 path=base/f'note-{nid}.json'
 note={x['field']:x['value'] for x in json.loads(path.read_text())}
 assert note.get('content')
 title=note['title'].replace('[',r'\[').replace(']',r'\]')
 index.append(f'- **{label}** · {note["author"]}：[《{title}》][{label}]')
 definitions.append(f'[{label}]: {row["url"]}')
 catalog.append({'ref':label,'note_id':nid,'title':note['title'],'author':note['author'],'url':row['url'],'local_content':str(path)})
s=s.replace('## 八、阅读口径与保存记录','\n'.join(index)+'\n\n## 八、阅读口径与保存记录',1)
s+='\n'.join(definitions)+'\n'
s=s.replace('**[F1]、[L1]、[P1]、[B1]、[E1] 都可以直接点击打开原帖**','**[F1]、[R1]、[L1]、[P1]、[B1]、[E1] 都可以直接点击打开原帖**')
assert not re.search(r'外卖|外送|配送|foodpanda|deliveroo',s,re.I)
required=['湘聚','湘厨','阿里疆','锅匠','花婆婆','小叫天','莆田','烟伙','太二','亚坤','天天海南鸡饭','江浙菜']
assert all(name in s for name in required)
target.write_text(s)
(base/'guide-sources.json').write_text(json.dumps(catalog,ensure_ascii=False,indent=2))
print(f'Wrote {target}: {len(s)} characters, {len(s.splitlines())} lines, {len(catalog)} cited posts')
