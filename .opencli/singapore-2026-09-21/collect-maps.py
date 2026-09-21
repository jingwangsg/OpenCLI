import json,subprocess,sys,time
from pathlib import Path
from urllib.parse import urlencode
base=Path(__file__).parent
path=base/'maps-places.json'
items=json.loads(path.read_text())
start=int(sys.argv[1]) if len(sys.argv)>1 else 0
end=int(sys.argv[2]) if len(sys.argv)>2 else len(items)
js='''(() => ({url:location.href,title:document.title,headings:[...document.querySelectorAll('h1')].map(e=>e.innerText),items:[...document.querySelectorAll('[data-item-id]')].filter(e=>/address|phone|authority/.test(e.getAttribute('data-item-id'))).map(e=>({id:e.getAttribute('data-item-id'),text:e.innerText,label:e.getAttribute('aria-label'),href:e.getAttribute('href')})),results:[...document.querySelectorAll('a[href*="/maps/place/"]')].map(e=>({name:e.getAttribute('aria-label')||e.innerText,url:e.href})).slice(0,8),saveButtons:[...document.querySelectorAll('button[aria-label]')].map(e=>e.getAttribute('aria-label')).filter(s=>/^(Save|Saved)$/.test(s))}))()'''
def cli(*args):
    r=subprocess.run(['opencli','browser','sg-places',*args],capture_output=True,text=True,timeout=40)
    if r.returncode: raise RuntimeError(r.stderr or r.stdout)
    return r.stdout
for i in range(start,end):
    x=items[i]
    if x.get('map_data') and '--redo' not in sys.argv: continue
    try:
        cli('open','https://www.google.com/maps/search/?'+urlencode({'api':1,'query':x['query'],'hl':'en'}),'--window','background')
        for attempt in range(12):
            data=json.loads(cli('eval',js))
            if data['headings'] or data['results']: break
            time.sleep(.7)
        x['map_data']=data
        x['maps_url']=data['url'].split('&entry=')[0]
        phone=[v['text'].replace('\ue0b0','').strip() for v in data['items'] if v['id'].startswith('phone:')]
        x['phone']=' / '.join(phone)
        x['address']='; '.join(v['label'] or v['text'] for v in data['items'] if v['id']=='address')
        x['matched']=bool(data['headings'] and data['saveButtons'] and '/maps/place/' in data['url'])
        print(i,x['key'],data['headings'],x['address'],x['phone'],'OK' if x['matched'] else 'REVIEW',flush=True)
    except Exception as e:
        x['error']=str(e)[:500]
        print(i,x['key'],'ERROR',str(e)[:200],flush=True)
    path.write_text(json.dumps(items,ensure_ascii=False,indent=2)+'\n')
