import json
import re
from pathlib import Path

base = Path(__file__).parent
original = base / 'guide-before-east.md'
text = original.read_text()
entries = json.loads((base / 'east-entries.json').read_text())
sources = json.loads((base / 'east-sources.json').read_text())
assert entries and all(entry.get('saved') for entry in entries)
total = len(json.loads((base / 'maps-before.json').read_text())['notes']) + len(entries)
max_ref = max(map(int, re.findall(r'^\[M(\d+)\]:', text, re.M)))
for index, entry in enumerate(entries, max_ref + 1):
    entry['map_ref'] = f'M{index:02}'
refs = {entry['key']: entry['map_ref'] for entry in entries}

regions = [
    ('Bugis / Kampong Glam', [('苏杭湘伴', 'suhang'), ('三人行', 'sanren_bugis'), ('西北香', 'aisyah'), ('最云南', 'zui')], '江浙湘融合、福建川菜、西北面食、云南米线；另有[湘聚][M14]、[花婆婆][M07]、[新疆印象][M16]'),
    ('Kallang / Geylang', [('川羊记', 'chuanyang'), ('利宝饭店', 'tonny'), ('嘻记', 'heykee'), ('东北饺子王', 'dongbei'), ('新山亚明', 'jb_ahmeng'), ('明辉田鸡粥', 'eminent'), ('旺角点心', 'mongkok')], '羊肉锅、粤菜、海鲜煮炒、饺子、田鸡粥与点心'),
    ('Lavender / Jalan Besar', [('民众菜馆', 'mingchung')], '兴化卤面与传统福建小炒'),
    ('Paya Lebar', [('莆田 SingPost Centre', 'putien_singpost')], '福建菜与午市套餐'),
    ('Katong / Joo Chiat', [('加东美味鸡饭', 'katongchicken'), ('328叻沙', 'laksa'), ('新兴肉骨茶', 'sinheng')], '另有[椿花奶奶 i12 Katong][M30]的江浙家常、[伊尊如切][M18]的西北面食与烤肉、[莆田 Parkway][M26]'),
    ('Kembangan / Upper East Coast', [('成基', 'sengkee'), ('华友园', 'huayuwee')], '药材汤面、焦米粉、本地海鲜煮炒'),
    ('Bedok', [('巴蜀演义', 'bashu'), ('三人行', 'sanren_bedok'), ('深利', 'chinlee'), ('兴记肉脞面', 'xingji')], '川菜、福建川菜、传统潮州菜、汤肉脞面'),
    ('Tampines / Expo', [('莆田 Tampines', 'putien_tampines'), ('琼荣记 Tampines', 'kek_tampines'), ('农耕记 Changi City Point', 'nonggeng')], '福建菜、煮炒、湘菜；按地铁站和所在商场分别选店'),
    ('Changi Airport T2', [('瑞春 T2', 'sweechoon_t2')], '24小时点心，抵达大厅公共区域'),
]
lines = [
    '## 东部与 Bugis／Kallang：按菜系选店', '',
    '**本节门店资料核对：2026年9月26日。小红书检索范围：2026年3月26日至9月26日。** 从 Bugis、Kallang 向东覆盖 Geylang、Paya Lebar、Katong、Bedok、Tampines 与 Expo；行政区划上不都属于东区。', '',
    '| 区域 | 餐厅 | 主要选择 |', '| --- | --- | --- |',
]
for area, places, description in regions:
    links = '、'.join(f'[{name}][{refs[key]}]' for name, key in places)
    lines.append(f'| {area} | {links} | {description} |')
lines += ['', '以下按菜系列出招牌、预算、地图与来源。**商家自荐、其他分店体验和公开资料补充均分别注明。** 规划预算用于安排开销；未核实的单菜价格不作为现行报价。', '']

existing_options = {
    '湘菜': '**Bugis附近也可选[湘聚 Bugis][M14]**：捞菜排骨、腊味火锅、古法甲鱼煲；电话 +65 9696 7096。地图4.7/5（221条评价），价位S$30-60，2026年9月26日核对；详细帖子见[R4]。',
    '新疆／西北面食': '**Bugis另一选择是[新疆印象][M16]**：大盘鸡原帖S$42，人均S$25-35，来源[F4]；电话 +65 9838 5679。如切还有[伊尊][M18]的牛肉拉面、羊肉串和烤羊排，规划S$20-35/人，来源[R7]；电话 +65 6909 9287。两店均已收藏，详细介绍见后文。',
    '江浙菜／江浙湘融合': '**Katong可选[椿花奶奶 Nai Nai Flavor｜i12 Katong][M30]**：杭州家常与江南小吃，电话 +65 6222 0535。菜品和堂食价格参照见后文及[R15]，此店已在收藏夹。',
    '福建／兴化／闽南': '**东海岸另有[莆田 Parkway Parade][M26]**：电话 +65 6970 5811；2026年9月26日地图4.8/5（1,611条评价），价位S$30-40。该店具体消费记录见[F17]。',
}
for cuisine in dict.fromkeys(entry['cuisine'] for entry in entries):
    lines += ['### ' + cuisine, '']
    if cuisine in existing_options:
        lines += [existing_options[cuisine], '']
    for entry in entries:
        if entry['cuisine'] != cuisine:
            continue
        price = entry['google_price'].replace('$', 'S$').replace('–', '-') if entry['google_price'] else '未显示统一价位'
        evidence = re.sub(r'(?<!\[)\b(D\d{2})\b(?!\])', r'[\1]', entry['xhs'])
        lines += [
            '#### ' + entry['name'], '',
            f"**{entry['area']}｜地址：{entry['address']}**", '',
            f"**电话／地图：** {entry['phone']} · [Google Maps][{entry['map_ref']}] · **Google评分：{entry['rating']:.1f}/5（{entry['review_count']:,}条评价）** · 地图价位：{price}", '',
            f"- **特色菜：** {entry['dishes']}。", f"- **价格：** {entry['price']}",
            f"- **怎么选：** {entry['why']}", '- **帖子与依据：** ' + evidence,
            f"- **注意：** {entry['tips']}",
        ]
        if entry['web']:
            lines.append('- **核对来源：** ' + '、'.join(f"[{source['title']}]({source['url']})" for source in entry['web']) + '。')
        lines.append('')
block = '\n'.join(lines) + '\n'
text = text.replace('## 一、中餐：按菜系整理', block + '## 一、中餐：按菜系整理', 1)
text = text.replace('**核对日期：2026年9月21日｜小红书范围：近半年｜货币：新加坡元 S$**', '**东部餐饮核对：2026年9月26日｜其余餐饮、酒吧与游玩资料：2026年9月21日｜货币：新加坡元 S$**', 1)
text = text.replace('文中的 **[F1]', '文中的 **[D01]、[F1]', 1)
text = text.replace('**Google Maps 数据查询日：2026年9月21日。**', '**Google Maps 数据查询日：东部餐饮为2026年9月26日，其余条目为2026年9月21日；个别另行复核条目单独注明。**', 1)
text = text.replace('共87个地点', f'共{total}个地点', 1)
text = text.replace('主表共 **27家餐厅选择**，另有本地早餐／熟食小吃和4家酒吧。', f'下表概览主要餐厅与本地小吃；东部专章列出{len(entries)}个门店，并提供各区域索引。', 1)
text = text.replace('## 餐厅与本地美食速查', (base / 'opening-tonight.md').read_text() + '\n## 餐厅与本地美食速查', 1)
text = text.replace('；它与“湘香湖南菜”不是同一家品牌', '').replace(' 湘厨与“湘香湖南菜”为不同品牌。', '')
text = text.replace('- 核对日期为2026年9月21日。', '- 东部餐饮核对日期为2026年9月26日，其余条目为2026年9月21日。', 1)

old_places = json.loads((base.parent / 'singapore-2026-09-21/maps-places-final.json').read_text())
old_refs = {place['key']: place['map_ref'] for place in old_places}
for entry in json.loads((base / 'maps-existing-east.json').read_text()):
    assert not re.search('temporarily closed|permanently closed', entry['main'], re.I), entry['key']
    stars = next(re.search(r'([0-9]+\.[0-9]+) stars', label)[1] for label in entry['labels'] if re.search(r'([0-9]+\.[0-9]+) stars', label))
    count = next(re.search(r'^([\d,]+) reviews', label)[1] for label in entry['labels'] if re.search(r'^([\d,]+) reviews', label))
    pattern = r'(\[Google Maps\]\[' + old_refs[entry['key']] + r'\] · \*\*Google评分：)[^*]+'
    text = re.sub(pattern, lambda match: match[1] + stars + '/5（' + count + '条评价）', text)

bibliography = ['### 东部餐饮原帖｜2026年3月26日至9月26日', '']
for source in sources:
    label = '商家账号' if source['author'] in ['东北饺子王刘姐', '新加坡苏杭湘伴', '三人行'] else '公开笔记'
    bibliography.append(f"- **{source['ref']}** · {source['published_at']} · {source['author']} · {label}：[《{source['title']}》][{source['ref']}]")
text = text.replace('## 八、来源与时效说明', '\n'.join(bibliography) + '\n\n## 八、来源与时效说明', 1)
text += '\n' + '\n'.join(f"[{source['ref']}]: {source['url']}" for source in sources) + '\n'
text += '\n' + '\n\n'.join(f"[{entry['map_ref']}]: <{entry['maps_url']}>" for entry in entries) + '\n'
assert '湘香' not in text
assert not any(term in block for term in ['外卖', '约会', '你提到', '按你的'])
definitions = set(re.findall(r'^\[([A-Z]+\d+)\]:', text, re.M))
references = set(re.findall(r'\[([A-Z]+\d+)\](?!:)', text))
assert not references - definitions, references - definitions
(base / 'guide-east-draft.md').write_text(text)
(base / 'east-entries.json').write_text(json.dumps(entries, ensure_ascii=False, indent=2) + '\n')
print(f'Draft: {len(entries)} places, {len(sources)} XHS sources, {len(text)} characters')
