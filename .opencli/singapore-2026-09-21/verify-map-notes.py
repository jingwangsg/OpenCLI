import json,subprocess,time
from pathlib import Path
b=Path(__file__).parent
notes=json.loads((b/'maps-rich-notes.json').read_text());by_title={n['map_title']:n for n in notes};seen={};mismatch={}
def cli(*args):
 r=subprocess.run(['opencli','browser','sg-guide-sync',*args],capture_output=True,text=True,timeout=40)
 if r.returncode:raise RuntimeError((r.stderr or r.stdout)[:300])
 try:return json.loads(r.stdout)
 except json.JSONDecodeError:return r.stdout
cli('open',json.loads((b/'maps-list.json').read_text())['url'],'--window','foreground')
owned_tab=cli('tab','list')[0]['page']
cli('tab','select',owned_tab)
js='''(() => ({heading:[...document.querySelectorAll('h1,h2')].map(e=>e.innerText),description:document.querySelector('textarea[aria-label="List description"]')?.value,notes:[...document.querySelectorAll('textarea[aria-label="Note"]')].map(e=>({value:e.value,title:e.closest('.BsJqK')?.querySelector('button')?.innerText.split('\\n')[0]}))}))()'''
for attempt in range(20):
 s=cli('eval',js)
 if len(s.get('notes',[]))>=20:break
 time.sleep(.5)
initial=s
for iteration in range(35):
 s=cli('eval',js)
 for e in s['notes']:
  n=by_title.get(e['title'])
  if not n:continue
  if e['value']!=n['note']:mismatch[n['key']]={'actual':e['value'],'expected':n['note']}
  else:seen[n['key']]=e['value'];mismatch.pop(n['key'],None)
 if len(set(seen)|set(mismatch))==len(notes):break
 cli('tab','select',owned_tab)
 f=cli('find','--css','textarea[aria-label="Note"]','--limit','120')
 cli('focus',str(f['entries'][-1]['ref']));cli('keys','Tab');time.sleep(.6)
result={'verified':len(seen),'expected':len(notes),'headings':initial['heading'],'description':initial.get('description'),'mismatches':mismatch,'missing':list(set(n['key'] for n in notes)-set(seen))}
(b/'maps-rich-notes-verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k!='mismatches'},ensure_ascii=False),'mismatch_count',len(mismatch),flush=True)
assert len(seen)==len(notes) and not mismatch
