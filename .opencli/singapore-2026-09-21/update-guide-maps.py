from pathlib import Path
import json,re,csv
base=Path(__file__).parent
p=Path('/Users/jingwang/WORKSPACE/singapore-guide-2026-09-21.md')
s=p.read_text()
assert '[M01]:' not in s,'Already updated'
items=json.loads((base/'maps-places.json').read_text())
overrides=json.loads((base/'maps-contact-overrides.json').read_text())
list_info=json.loads((base/'maps-list.json').read_text())
saved=json.loads((base/'maps-saved.json').read_text())
by_section={}
contacts={}
for n,x in enumerate(items,1):
    x['map_ref']=f'M{n:02d}'
    override=overrides.get(x['key'],{})
    phone=override.get('phone',x.get('phone',''))
    digits=re.sub(r'\D','',phone)
    if len(digits)==8 and not phone.startswith('+'):phone='+65 '+digits[:4]+' '+digits[4:]
    label=override.get('phone_label','电话' if phone else '未查到公开联系电话')
    source=override.get('source')
    text=(label+'：'+phone if phone else label)+' · [Google Maps]['+x['map_ref']+']'
    if source:text+=' · ['+('电话来源' if phone else '联系渠道')+']('+source+')'
    contacts[x['key']]=text
    x['display_phone']=phone
    x['phone_label']=label
    x['phone_source']=source or x['maps_url']
    by_section.setdefault(x['section'],[]).append(x)
by_section['滨海湾花园中秋灯会｜截至9月27日']=[next(x for x in items if x['key']=='gardens')]
lines=s.splitlines()
out=[]
attached=set()
for line in lines:
    if re.match(r'^#{3,4} ',line):
        title=re.sub(r'^#{3,4} (?:\d+\. )?','',line)
        group=by_section.get(title)
        out.append(line)
        if group:
            out.append('')
            if len(group)==1:out.append('**电话／地图：** '+contacts[group[0]['key']])
            else:
                for x in group:out.append('- **'+x['name']+'：** '+contacts[x['key']])
            attached.update(x['key'] for x in group)
        continue
    if line.startswith('| '):
        first=line.split('|')[1].replace('**','').strip()
        group=None
        for section,candidate in by_section.items():
            if first.startswith(section):
                group=candidate
                break
        if group:
            parts=[(x['name']+'：' if len(group)>1 else '')+contacts[x['key']] for x in group]
            line=line.rstrip().removesuffix('|').rstrip()+'；**联系与地图：** '+'；'.join(parts)+' |'
            attached.update(x['key'] for x in group)
    out.append(line)
missing={x['key'] for x in items}-attached
assert not missing,missing
s='\n'.join(out)+'\n'
intro='**[Google Maps 收藏列表：'+list_info['name']+']('+list_info['url']+')**。私人列表，使用保存该列表的Google账号查看。电话以地图页公开资料为主；公园管理热线和独立门店电话分别标注，未公布的号码不作推测。\n\n'
s=s.replace('## 餐厅与本地美食速查',intro+'## 餐厅与本地美食速查',1)
s=s.replace('**宴来居 Yan Lai Ju**，2 Venture Drive #01-25/26，Vision Exchange','**宴来居 Yan Lai Ju**，2 Venture Drive，Vision Exchange')
s=s.replace('与同楼花婆婆不是同一个单位','地图标注#01-22，订位资料仍有#01-25/26，出发前电话确认单位；与同楼花婆婆不同')
s=s.replace('**1950年代咖啡 The 1950\'s Coffee**','**1950年代咖啡 The 1950\'s Coffee**，Chinatown Complex #02-048',1)
s=s.replace('**安珍薄饼 Ann Chin Popiah**','**安珍薄饼 Ann Chin Popiah**，Chinatown Complex #02-112',1)
s=s.replace('**老曾记 Old Chang Kee**','**老曾记 Old Chang Kee**，Chinatown Point #B1-47A',1)
for x in items:
    s+='\n['+x['map_ref']+']: '+x['maps_url']+'\n'
p.write_text(s)
items_path=base/'maps-places-final.json'
items_path.write_text(json.dumps(items,ensure_ascii=False,indent=2)+'\n')
with Path('/Users/jingwang/WORKSPACE/singapore-places-2026-09-21.csv').open('w',encoding='utf-8-sig',newline='') as f:
    writer=csv.writer(f)
    writer.writerow(['名称','类别','地址','电话','电话口径','Google Maps','电话来源','已收藏'])
    for x in items:writer.writerow([x['name'],x['category'],x.get('address','').removeprefix('Address: '),x['display_phone'],x['phone_label'],x['maps_url'],x['phone_source'],'是' if saved.get(x['key'],{}).get('saved') else '否'])
print(json.dumps({'attached':len(attached),'phones':sum(bool(x['display_phone']) for x in items),'saved':sum(saved.get(x['key'],{}).get('saved',False) for x in items)},ensure_ascii=False))
