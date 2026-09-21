import json,subprocess,time,re
from pathlib import Path
b=Path(__file__).parent
a=json.loads((b/'maps-ratings.json').read_text());captures={}
def cli(*args):
 r=subprocess.run(['opencli','browser','sg-ratings',*args],capture_output=True,text=True,timeout=40)
 if r.returncode:raise RuntimeError((r.stderr or r.stdout)[:250])
 try:return json.loads(r.stdout)
 except json.JSONDecodeError:return r.stdout
js='''(() => ({url:location.href,name:document.querySelector('h1')?.innerText,summary:document.querySelector('h1')?.parentElement.parentElement.innerText,main:document.querySelector('[role=main]')?.innerText.slice(0,2400),labels:[...document.querySelectorAll('button[aria-label]')].map(e=>e.getAttribute('aria-label')).filter(s=>/price|person|review/i.test(s)).slice(0,12)}))()'''
for x in a:
 if x['rating'] is not None and x['google_price'] is not None:continue
 cli('open',x['url'],'--window','background')
 for _ in range(12):
  v=cli('eval',js)
  if v.get('summary'):break
  time.sleep(.5)
 captures[x['key']]=v
 print(x['key'],json.dumps(v,ensure_ascii=False),flush=True)
(b/'maps-rating-details.json').write_text(json.dumps(captures,ensure_ascii=False,indent=2)+'\n')
