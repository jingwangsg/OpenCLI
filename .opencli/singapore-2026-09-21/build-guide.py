from pathlib import Path
import json,html,re
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import BaseDocTemplate,PageTemplate,Frame,Paragraph,Spacer,PageBreak,LongTable,TableStyle,CondPageBreak
from reportlab.platypus.tableofcontents import TableOfContents

ROOT=Path('/Users/jingwang/WORKSPACE')
OUT=ROOT/'output/pdf/singapore-guide-2026-09-21.pdf'
tokens=json.loads((ROOT/'tmp/pdfs/guide-tokens.json').read_text())
fonts=[('CJK','/System/Library/Fonts/STHeiti Light.ttc'),('CJKBold','/System/Library/Fonts/STHeiti Medium.ttc'),('Unicode','/Library/Fonts/Arial Unicode.ttf')]
for name,path in fonts:pdfmetrics.registerFont(TTFont(name,path,subfontIndex=0))
pdfmetrics.registerFontFamily('CJK',normal='CJK',bold='CJKBold',italic='CJK',boldItalic='CJKBold')
coverage=pdfmetrics.getFont('CJK').face.charWidths
fallback=pdfmetrics.getFont('Unicode').face.charWidths
omitted=set()

def text_markup(text):
    text=re.sub('[\u2010-\u2015\u2212]','-',text)
    result=[]
    for c in text:
        if c in '\n\r\t':result.append(' ')
        elif ord(c) in coverage:result.append(html.escape(c))
        elif ord(c) in fallback:result.append('<font name="Unicode">'+html.escape(c)+'</font>')
        elif ord(c) in (0xfe0f,0x200d):continue
        elif 0x3400<=ord(c)<=0x9fff:raise ValueError('Missing Chinese glyph '+c)
        else:omitted.add(c)
    return ''.join(result)

def inline(children):
    out=[]
    for t in children or []:
        kind=t['type']
        if kind=='text':out.append(text_markup(t['content']))
        elif kind in ('softbreak','hardbreak'):out.append('<br/>')
        elif kind=='strong_open':out.append('<b>')
        elif kind=='strong_close':out.append('</b>')
        elif kind=='em_open':out.append('<i>')
        elif kind=='em_close':out.append('</i>')
        elif kind=='code_inline':out.append(text_markup(t['content']))
        elif kind=='link_open':
            attrs=dict(t.get('attrs') or [])
            out.append('<link href="'+html.escape(attrs['href'],quote=True)+'" color="#166477">')
        elif kind=='link_close':out.append('</link>')
        elif kind=='image':out.append(text_markup(t.get('content','')))
        else:out.append(text_markup(t.get('content','')))
    return ''.join(out)

NAVY=colors.HexColor('#15384a')
TEAL=colors.HexColor('#166477')
GRAY=colors.HexColor('#596976')
body=ParagraphStyle('Body',fontName='CJK',fontSize=10.2,leading=15.5,spaceAfter=7,wordWrap='CJK',splitLongWords=True,textColor=colors.HexColor('#233342'))
styles={
 1:ParagraphStyle('Title',parent=body,fontName='CJKBold',fontSize=25,leading=35,textColor=NAVY,spaceBefore=26,spaceAfter=18,keepWithNext=True),
 2:ParagraphStyle('H2',parent=body,fontName='CJKBold',fontSize=19,leading=27,textColor=NAVY,spaceBefore=0,spaceAfter=14,keepWithNext=True),
 3:ParagraphStyle('H3',parent=body,fontName='CJKBold',fontSize=14,leading=21,textColor=TEAL,spaceBefore=15,spaceAfter=10,keepWithNext=True),
 4:ParagraphStyle('H4',parent=body,fontName='CJKBold',fontSize=12,leading=18,textColor=NAVY,spaceBefore=12,spaceAfter=8,keepWithNext=True)
}
cell=ParagraphStyle('Cell',parent=body,fontSize=9.1,leading=13.4,spaceAfter=0)
cell_head=ParagraphStyle('CellHead',parent=cell,fontName='CJKBold',textColor=colors.white)
list_style=ParagraphStyle('List',parent=body,leftIndent=10,firstLineIndent=-8,spaceAfter=7)
source_style=ParagraphStyle('Source',parent=list_style,fontSize=9.6,leading=14.8,spaceAfter=5)
W,H=A4
MARGIN=43
WIDTH=W-2*MARGIN

def page_decoration(canvas,doc):
    canvas.saveState()
    canvas.setFillColor(GRAY)
    canvas.setFont('CJK',8)
    if doc.page>1:
        canvas.drawString(MARGIN,H-29,'新加坡吃喝玩乐攻略')
        canvas.drawRightString(W-MARGIN,H-29,'2026年9月21日')
        canvas.setStrokeColor(colors.HexColor('#d9e2e7'))
        canvas.line(MARGIN,H-36,W-MARGIN,H-36)
    canvas.setFont('CJK',8)
    canvas.drawString(MARGIN,25,'中餐 · 本地美食 · 酒吧 · 地标与活动')
    canvas.drawRightString(W-MARGIN,25,str(doc.page))
    canvas.restoreState()

class GuideDoc(BaseDocTemplate):
    def afterFlowable(self,f):
        if hasattr(f,'toc_key'):
            self.canv.bookmarkHorizontalAbsolute(f.toc_key,self.frame._y+f.height)
            self.canv.addOutlineEntry(f.toc_text,f.toc_key,level=f.toc_level,closed=f.toc_level>0)
            self.notify('TOCEntry',(f.toc_level,text_markup(f.toc_text),self.page,f.toc_key))

pdf=GuideDoc(str(OUT),pagesize=A4,rightMargin=MARGIN,leftMargin=MARGIN,topMargin=52,bottomMargin=43,title='新加坡吃喝玩乐攻略',author='新加坡旅行攻略',subject='餐厅、电话、Google Maps、近期活动与小红书来源',allowSplitting=1)
frame=Frame(MARGIN,43,WIDTH,H-95,leftPadding=0,rightPadding=0,topPadding=0,bottomPadding=0)
pdf.addPageTemplates(PageTemplate(id='Guide',frames=[frame],onPage=page_decoration))
toc=TableOfContents()
toc.dotsMinLevel=0
toc.levelStyles=[
 ParagraphStyle('Toc0',fontName='CJKBold',fontSize=11,leading=18,leftIndent=0,firstLineIndent=0,spaceBefore=9,wordWrap='CJK',textColor=NAVY),
 ParagraphStyle('Toc1',fontName='CJK',fontSize=10.2,leading=16,leftIndent=15,firstLineIndent=0,spaceBefore=4,wordWrap='CJK'),
 ParagraphStyle('Toc2',fontName='CJK',fontSize=9.7,leading=15,leftIndent=30,firstLineIndent=0,spaceBefore=2,wordWrap='CJK',textColor=GRAY)
]
story=[]
stack=[]
marker=''
heading_count=0
inserted_toc=False
in_sources=False
i=0
while i<len(tokens):
    t=tokens[i];typ=t['type']
    if typ=='heading_open':
        level=int(t['tag'][1:]);children=tokens[i+1].get('children',[])
        raw=''.join(c.get('content','') for c in children if c['type'] in ('text','code_inline'))
        if level==2:
            if not inserted_toc:
                story.extend([PageBreak(),Paragraph('目录',styles[2]),Paragraph('点击目录条目跳转；PDF书签也可用于快速导航。',body),Spacer(1,5),toc,PageBreak()])
                inserted_toc=True
            else:story.append(PageBreak())
        elif raw.startswith('重点推荐二：') or raw=='其他地标与玩法速查':story.append(PageBreak())
        elif level>=3:story.append(CondPageBreak(100 if level==4 else 125))
        p=Paragraph(inline(children),styles[level])
        if level>=2:
            p.toc_key=f'section-{heading_count}';p.toc_text=raw;p.toc_level=level-2;heading_count+=1
        story.append(p)
        if level==1:story.append(Spacer(1,10))
        in_sources='小红书原帖索引' in raw if level==2 else in_sources
        i+=3;continue
    if typ in ('bullet_list_open','ordered_list_open'):
        attrs=dict(t.get('attrs') or [])
        stack.append({'ordered':typ=='ordered_list_open','next':int(attrs.get('start',1))})
    elif typ in ('bullet_list_close','ordered_list_close'):
        stack.pop();marker=''
    elif typ=='list_item_open':
        state=stack[-1];marker=f"{state['next']}. " if state['ordered'] else '- '
        state['next']+=1
    elif typ=='paragraph_open':
        children=tokens[i+1].get('children',[])
        text=inline(children)
        style=(source_style if in_sources else list_style) if stack else body
        story.append(Paragraph(text_markup(marker)+text,style));marker=''
        i+=3;continue
    elif typ=='table_open':
        rows=[];row=[];headers=[]
        j=i+1
        while tokens[j]['type']!='table_close':
            q=tokens[j]
            if q['type']=='tr_open':row=[]
            elif q['type'] in ('th_open','td_open'):
                child=tokens[j+1].get('children',[])
                row.append(Paragraph(inline(child),cell_head if q['type']=='th_open' else cell))
                if q['type']=='th_open':headers.append(tokens[j+1].get('content',''))
            elif q['type']=='tr_close':rows.append(row)
            j+=1
        n=len(rows[0])
        if n==2:ratios=[.5,.5]
        elif n==3:ratios=[.28,.29,.43]
        elif n==4:ratios=[.21,.24,.18,.37] if '地标' in headers[0] else [.23,.26,.29,.22]
        else:ratios=[1/n]*n
        table=LongTable(rows,colWidths=[WIDTH*r for r in ratios],repeatRows=1,hAlign='LEFT',splitByRow=1,splitInRow=0,spaceBefore=3,spaceAfter=11)
        table.setStyle(TableStyle([
            ('BACKGROUND',(0,0),(-1,0),NAVY),('VALIGN',(0,0),(-1,-1),'TOP'),
            ('LEFTPADDING',(0,0),(-1,-1),7),('RIGHTPADDING',(0,0),(-1,-1),7),
            ('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7),
            ('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.HexColor('#f0f5f7'),colors.white]),
            ('LINEBELOW',(0,0),(-1,0),.6,TEAL),('LINEBELOW',(0,1),(-1,-1),.3,colors.HexColor('#d7e1e7'))
        ]))
        story.append(table);i=j+1;continue
    elif typ=='hr':story.append(Spacer(1,12))
    i+=1
pdf.multiBuild(story)
print('Created',OUT)
print('TOC/bookmarks:',heading_count)
print('Decorative unsupported glyphs omitted:', ''.join(sorted(omitted)))
