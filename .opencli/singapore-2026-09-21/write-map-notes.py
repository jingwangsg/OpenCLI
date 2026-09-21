import json,subprocess,time
from pathlib import Path
b=Path(__file__).parent
notes=json.loads((b/'maps-rich-notes.json').read_text())
by_title={n['map_title']:n for n in notes}
done={}
log_path=b/'maps-rich-notes-written.json'
js='''(() => ({notes:[...document.querySelectorAll('textarea[aria-label="Note"]')].map(e=>({ref:e.getAttribute('data-opencli-ref'),value:e.value,title:e.closest('.BsJqK')?.querySelector('button')?.innerText.split('\\n')[0]})),scrolls:[...document.querySelectorAll('[role=main] *')].filter(e=>e.scrollHeight>e.clientHeight+100&&getComputedStyle(e).overflowY!=='visible').map(e=>({top:e.scrollTop,height:e.scrollHeight,client:e.clientHeight}))}))()'''
def cli(*args):
 r=subprocess.run(['opencli','browser','sg-places',*args],capture_output=True,text=True,timeout=40)
 if r.returncode:raise RuntimeError((r.stderr or r.stdout)[:300])
 try:return json.loads(r.stdout)
 except json.JSONDecodeError:return r.stdout
f=cli('find','--css','textarea[aria-label="List description"]')
cli('fill',str(f['entries'][0]['ref']),'新加坡中餐、本地美食、酒吧与游玩。88个地点；餐厅按菜系备注招牌菜、人均预算和电话。重点：云雾林、花穹、天际滑车；另有9月21日至10月底18项活动精选。价格与活动核对：2026-09-21。')
cli('keys','Tab')
for batch in range(40):
 cli('find','--css','textarea[aria-label="Note"]','--limit','100')
 state=cli('eval',js)
 progress=0
 for e in state['notes']:
  n=by_title.get(e['title'])
  if not n:
   candidates=[n for n in notes if e['value'].startswith(n['old_prefix']) or e['value']==n['note']]
   if len(candidates)==1:n=candidates[0]
  if not n:print('UNMATCHED',e['title'],e['value'][:80],flush=True);continue
  if n['key'] in done:continue
  if e['value']!=n['note']:
   cli('fill',str(e['ref']),n['note']);cli('keys','Tab')
  done[n['key']]={'title':e['title'],'note':n['note']}
  progress+=1
  log_path.write_text(json.dumps(done,ensure_ascii=False,indent=2)+'\n')
 print('NOTES',len(done),'/',len(notes),'updated this pass',progress,'scroll',state['scrolls'],flush=True)
 if len(done)==len(notes):break
 cli('scroll','down','--amount','2300')
 time.sleep(.6)
else:raise RuntimeError('Missing notes '+str(set(n['key'] for n in notes)-set(done)))
print('All 88 detailed notes written; refresh verification remains.',flush=True)
