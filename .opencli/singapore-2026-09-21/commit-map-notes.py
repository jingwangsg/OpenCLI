import json,subprocess,time,base64,re
from urllib.parse import unquote
from pathlib import Path
b=Path(__file__).parent
notes=json.loads((b/'maps-rich-notes.json').read_text());by_title={n['map_title']:n for n in notes};acked={}
def cli(*args):
 r=subprocess.run(['opencli','browser','sg-guide-sync',*args],capture_output=True,text=True,timeout=40)
 if r.returncode:raise RuntimeError((r.stderr or r.stdout)[:300])
 try:return json.loads(r.stdout)
 except json.JSONDecodeError:return r.stdout
js='''(() => [...document.querySelectorAll('textarea[aria-label="Note"]')].map(e=>({ref:e.getAttribute('data-opencli-ref'),value:e.value,title:e.closest('.BsJqK')?.querySelector('button')?.innerText.split('\\n')[0]})))()'''
cli('find','--css','textarea[aria-label="Note"]','--limit','120')
state=cli('eval',js)
assert len(state)==88,len(state)
for e in state:
 n=by_title[e['title']]
 if e['value']==n['note']:continue
 network=cli('network')
 old=None
 cli('focus',str(e['ref']))
 cli('fill',str(e['ref']),n['note'])
 cli('keys','Tab')
 time.sleep(2)
 for attempt in range(1):
  net=cli('network')
  fresh=[]
  for v in net['entries']:
   if '/maps/preview/entitylist/updateitem' not in v['url'] or v['status']!=200:continue
   encoded=re.search(r'!2z([^!]+)',unquote(v['url']))
   if encoded:
    value=encoded.group(1)
    decoded=base64.urlsafe_b64decode(value+'='*((-len(value))%4)).decode('utf-8')
    if decoded==n['note']:fresh.append(v['key'])
  if fresh:break
  time.sleep(.35)
 else:fresh=['pending-refresh-verification']
 acked[n['key']]={'request':fresh[-1],'note':n['note']}
 (b/'maps-rich-notes-acknowledged.json').write_text(json.dumps(acked,ensure_ascii=False,indent=2)+'\n')
 print('ACK',len(acked),n['key'],flush=True)
print('Pending notes submitted; verify persisted values after reload.',flush=True)
