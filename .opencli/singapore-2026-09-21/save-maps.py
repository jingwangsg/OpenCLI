import json,subprocess,time,sys
from pathlib import Path
from urllib.parse import urlencode
base=Path(__file__).parent
path=base/'maps-places.json'
items=json.loads(path.read_text())
saved_path=base/'maps-saved.json'
saved=json.loads(saved_path.read_text()) if saved_path.exists() else {'luo':{'saved':True},'cloud':{'saved':True}}
list_name='新加坡吃喝玩乐 · 2026年9月'
js='''(() => ({url:location.href,title:document.title,headings:[...document.querySelectorAll('h1')].map(e=>e.innerText),items:[...document.querySelectorAll('[data-item-id]')].filter(e=>/address|phone|authority/.test(e.getAttribute('data-item-id'))).map(e=>({id:e.getAttribute('data-item-id'),text:e.innerText,label:e.getAttribute('aria-label'),href:e.getAttribute('href')})),saveButtons:[...document.querySelectorAll('button[aria-label]')].map(e=>e.getAttribute('aria-label')).filter(s=>/^(Save|Saved)$/.test(s)),saved:[...document.querySelectorAll('button[aria-label="Show place lists details"]')].map(e=>e.parentElement.innerText),notice:document.body.innerText.slice(0,180)}))()'''
def cli(*args,allow_error=False):
    r=subprocess.run(['opencli','browser','sg-places',*args],capture_output=True,text=True,timeout=45)
    if r.returncode and not allow_error: raise RuntimeError((r.stderr or r.stdout)[:350])
    try:return json.loads(r.stdout)
    except json.JSONDecodeError:return r.stdout
indices=[53,52]+[i for i in range(len(items)) if i not in [51,52,53]]
for i in indices:
    x=items[i]
    if saved.get(x['key'],{}).get('saved'): continue
    try:
        old=x.get('map_data',{})
        expected=x.get('selected_result') or (old.get('headings') or [''])[0]
        expected=expected.replace(' · Visited link','')
        url=x.get('query_url') or x.get('maps_url') or 'https://www.google.com/maps/search/?'+urlencode({'api':1,'query':x['query'],'hl':'en'})
        cli('open',url,'--window','foreground')
        for attempt in range(20):
            d=cli('eval',js)
            if isinstance(d,dict) and d.get('saveButtons') and expected in d.get('headings',[]) and '/maps/place/' in d.get('url',''): break
            time.sleep(.6)
        else: raise RuntimeError('Place not ready or identity mismatch: '+str(d.get('headings',[])))
        x['map_data']=d
        x['maps_url']=d['url'].split('?')[0]+'?hl=en'
        x['address']='; '.join(v['label'] or v['text'] for v in d['items'] if v['id']=='address')
        x['phone']=' / '.join(v['text'].replace('\ue0b0','').strip() for v in d['items'] if v['id'].startswith('phone:'))
        x['matched']=True
        f=cli('find','--css','button[aria-label="Save"],button[aria-label="Saved"]')
        if f['matches_n']!=1:raise RuntimeError('Ambiguous Save button')
        cli('click',str(f['entries'][0]['ref']))
        cli('wait','selector','[role="menuitemradio"]','--timeout','12000')
        f=cli('find','--role','menuitemradio','--name',list_name)
        if f['matches_n']!=1:raise RuntimeError('List not uniquely found')
        ref=str(f['entries'][0]['ref'])
        attrs=cli('get','attributes',ref)
        checked=attrs.get('value',{}).get('aria-checked')=='true'
        if checked:
            cli('keys','Escape')
        else:
            cli('click',ref)
            for attempt in range(15):
                v=cli('eval',js)
                if ('Saved to '+list_name) in v.get('notice','') or any(list_name in t for t in v.get('saved',[])):break
                time.sleep(.4)
            else:raise RuntimeError('Save confirmation missing')
        saved[x['key']]={'saved':True,'name':x['name'],'maps_url':x['maps_url'],'phone':x['phone'],'address':x['address']}
        # The place card expands the new list's note field after saving.
        if not checked:
            f=cli('find','--css','textarea[aria-label="Add note"]',allow_error=True)
            if isinstance(f,dict) and f.get('matches_n')==1:
                note=x['category']+'｜'+x['name']
                if x['key']=='luge':note='重点推荐｜圣淘沙天际滑车。三次票S$31–42；9月23日17:30提前关闭、16:30末次入场。'
                if x['key']=='flower':note='重点推荐｜花穹，与云雾林组合游览。双温室非居民成人S$46，本地居民成人S$34。'
                if x['phone']:note+=' 电话 '+x['phone']+'。'
                if x['category']=='备选餐厅':note+=' 出发前确认营业状态与价格。'
                note+=' 核对：2026-09-21。'
                cli('fill',str(f['entries'][0]['ref']),note)
                cli('keys','Tab')
        print('SAVED',sum(v.get('saved',False) for v in saved.values()),x['key'],d['headings'],x['address'],x['phone'],flush=True)
    except Exception as e:
        saved[x['key']]={'saved':False,'error':str(e)[:500]}
        print('REVIEW',x['key'],str(e)[:220],flush=True)
    path.write_text(json.dumps(items,ensure_ascii=False,indent=2)+'\n')
    saved_path.write_text(json.dumps(saved,ensure_ascii=False,indent=2)+'\n')
