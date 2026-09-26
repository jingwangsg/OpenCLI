import json
import re
import subprocess
import time
from pathlib import Path

base = Path(__file__).parent
entries = json.loads((base / 'east-entries.json').read_text())
by_title = {entry['map_title']: entry for entry in entries}
previous = json.loads((base / 'maps-before.json').read_text())
total = len(previous['notes']) + len(entries)
list_url = json.loads((base.parent / 'singapore-2026-09-21/maps-list.json').read_text())['url']
snapshot_js = '''(() => ({heading:[...document.querySelectorAll('h2')].map(e=>e.innerText),description:document.querySelector('textarea[aria-label="List description"]')?.value,notes:[...document.querySelectorAll('textarea[aria-label="Note"]')].map(e=>({ref:e.getAttribute('data-opencli-ref'),note:e.value,hidden:e.getBoundingClientRect().height===0,add_ref:e.closest('.BsJqK')?.querySelector('button[aria-label="Add note"]')?.getAttribute('data-opencli-ref'),title:e.closest('.BsJqK')?.querySelector('button')?.innerText.split('\\n')[0]}))}))()'''


def cli(*args):
    result = subprocess.run(['opencli', '--profile', 'edge', 'browser', 'sg-east-list26', *args], capture_output=True, text=True, timeout=60)
    if result.returncode:
        raise RuntimeError(result.stderr or result.stdout)
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError:
        return result.stdout


def load_notes():
    page = cli('open', list_url, '--window', 'foreground')['page']
    for _ in range(20):
        cli('tab', 'select', page)
        fields = cli('find', '--css', '.BsJqK button.SMP2wb', '--limit', '160')
        state = cli('eval', snapshot_js)
        if len(state['notes']) >= total:
            assert len(state['notes']) == total, len(state['notes'])
            if any(note['hidden'] for note in state['notes']):
                cli('find', '--css', '.BsJqK button[aria-label="Add note"]', '--limit', '160')
            cli('find', '--css', 'textarea[aria-label="Note"]', '--limit', '160')
            return page, cli('eval', snapshot_js)
        # Empty note fields are hidden; place buttons can scroll into view.
        cli('focus', str(fields['entries'][-1]['ref']))
        cli('keys', 'Tab')
        time.sleep(.8)
        print('Loaded', len(state['notes']), flush=True)
    raise RuntimeError(f"Only loaded {len(state['notes'])} of {total} places")


page, state = load_notes()
assert len([note for note in state['notes'] if note['title'] in by_title]) == len(entries)
written = []
for note in state['notes']:
    if note['title'] not in by_title:
        continue
    entry = by_title[note['title']]
    cli('tab', 'select', page)
    if note['note'] != entry['note']:
        if note['hidden']:
            assert note['add_ref'], entry['key']
            cli('click', str(note['add_ref']))
            cli('find', '--css', 'textarea[aria-label="Note"]', '--limit', '160')
            note = next(item for item in cli('eval', snapshot_js)['notes'] if item['title'] == entry['map_title'])
            assert not note['hidden'], entry['key']
        cli('fill', str(note['ref']), entry['note'])
        cli('keys', 'Tab')
        time.sleep(1.5)
    written.append(entry['key'])
    print('Note', len(written), entry['key'], flush=True)

description = f'新加坡中餐、本地美食、酒吧与游玩。{total}个地点；餐厅备注菜系、区域、招牌菜、预算和电话。覆盖Bugis、Kallang、芽笼、Paya Lebar、Katong、Bedok、Tampines、Expo。东部餐饮核对2026-09-26；其他条目及18项活动资料核对2026-09-21。'
if state['description'] != description:
    field = cli('find', '--css', 'textarea[aria-label="List description"]')
    assert field['matches_n'] == 1
    cli('fill', str(field['entries'][0]['ref']), description)
    cli('keys', 'Tab')
    time.sleep(2)

page, state = load_notes()
actual = {note['title']: note['note'] for note in state['notes']}
mismatches = [entry['key'] for entry in entries if actual.get(entry['map_title']) != entry['note']]
changed_previous = [note['title'] for note in previous['notes'] if actual.get(note['title']) != note['note']]
excluded = [title for title in actual if re.search(r'湘香|xiang\s*xiang', title, re.I)]
report = {'total': len(actual), 'new_verified': len(entries) - len(mismatches), 'mismatches': mismatches, 'changed_previous': changed_previous, 'xiangxiang_entries': excluded, 'description_matches': state['description'] == description, 'heading': state['heading']}
(base / 'maps-final-verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
(base / 'maps-final-snapshot.json').write_text(json.dumps(state, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(report, ensure_ascii=False), flush=True)
assert not mismatches and not changed_previous and not excluded and report['description_matches']
