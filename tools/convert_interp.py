"""Convertidor PDF → markdown: Interpretacions oficials de les Regles de Joc (FCBQ).

Ús:
    python3 tools/convert_interp.py interpretacions_fcbq.pdf interpretacionsFCBQ.md

Estructura del markdown:
  # Article N Títol
  ### N-M                                           (cada interpretació numerada)
  Paràgrafs amb les etiquetes **Situació/**Exemple/**Interpretació:** en negreta.

Les figures incrustades del PDF s'exporten a images/interps/.
"""
import os
import re
import sys

import pymupdf

sys.path.insert(0, os.path.dirname(__file__))
from convert_fcbq import (Line, Run, clean_text, color_class, emit_heading,
                          is_bullet_span)

OUT_IMG_DIR = os.path.join(os.path.dirname(__file__), '..', 'images', 'interps')

DROP_LINE_PATS = [
    r'Octubre de 2024 versió',
    r'Página\s*\d+\s*de\s*\d+',
    r'Interpretacions oficials de les Regles de Joc',
]
DROP_PATS = []  # mantenim l'estructura; la comprovació es fa a nivell de línia


def parse_page(page):
    """Classifica els runs de la pàgina en línies."""
    d = page.get_text('dict')
    lines = []
    footer_y_start = page.rect.height - 26
    for block in d['blocks']:
        if block.get('type') != 0:
            continue
        for line in block['lines']:
            y0 = line['bbox'][1]
            y1 = line['bbox'][3]
            if y0 > footer_y_start:
                continue
            full = ''.join(s['text'] for s in line['spans']).strip()
            if any(re.search(p, full) for p in DROP_LINE_PATS):
                continue
            runs = []
            for span in line['spans']:
                txt = span['text']
                if txt.strip() == '':
                    continue
                cls = color_class(span['color'])
                bold = bool(span['flags'] & 16)
                size = span['size']
                if cls == 'R':
                    runs.append(Run(txt, 'heading', bold, size))
                elif cls == 'O':
                    runs.append(Run(txt, 'annex', bold, size))
                elif is_bullet_span(span):
                    runs.append(Run(txt, 'bullet'))
                else:
                    runs.append(Run(txt, 'body', bold, size))
            if runs and all(clean_text(r.text) == '' for r in runs):
                continue
            if runs:
                lines.append(Line(y0, runs, y1))
    return lines


ENTRY_RE = re.compile(r'^((?:\d+-\d+(?:\.\d+)*|[A-Za-z]+-\d+(?:\.\d+)*))(?:\s+(.*))?$')
LABEL_RE = re.compile(r'\b(Situació|Exemple|Interpretació):')


def split_entry(line_text):
    """Torna (num, resta) si la línia comença una interpretació numerada (ex. 4-1, F-4.1)."""
    m = ENTRY_RE.match(line_text)
    if not m:
        return None, None
    num = m.group(1)
    rest = (m.group(2) or '').strip()
    return num, rest


def render_lines(lines, fig_refs=None):
    """Converteix les línies classificades en markdown."""
    out = []
    annex_buf = []
    par = []
    fig_refs = list(fig_refs or [])
    fig_i = 0

    def take_fig():
        nonlocal fig_i
        if fig_i < len(fig_refs):
            ref = fig_refs[fig_i]
            fig_i += 1
            return ref
        return None

    def flush_annex():
        if annex_buf:
            content = '\n'.join(annex_buf).strip()
            out.append('\n<div class="annex">\n\n')
            out.append(content)
            out.append('\n\n</div>\n')
            annex_buf.clear()

    def flush_par():
        if par:
            text = ' '.join(par).strip()
            if text:
                text = LABEL_RE.sub(r'**\1:**', text)
                text = re.sub(r'(\([a-z]\))(?=\S)', r'\1 ', text)
                text = text.replace('\u00a0', ' ').strip()
                out.append(text + '\n')
            par.clear()

    i = 0
    n = len(lines)
    par_last_y1 = 0.0
    GAP = 6.0
    while i < n:
        line = lines[i]

        # ---- encapçalaments d'article (text vermell)
        if line.is_heading:
            flush_par()
            parts = []
            while i < n and lines[i].is_heading:
                t = clean_text(lines[i].text)
                if t:
                    parts.append(t)
                i += 1
            txt = ' '.join(parts).strip()
            m = re.match(r'^Article\s+(\d+(?:\s*/\s*\d+)?)\s*(.*)$', txt)
            if m:
                emit_heading(out, 1, [f'<span class="secnum">Article {m.group(1)}</span>', m.group(2)])
            else:
                emit_heading(out, 1, [txt])
            continue

        # ---- annexos (text taronja; pràcticament no n'hi ha en aquest document)
        if line.has_annex:
            flush_par()
            annex_buf.append(line.body_text)
            i += 1
            continue

        # ---- interpretacions numerades (ex. 4-1)
        num, rest = split_entry(line.body_text)
        if num:
            flush_par()
            emit_heading(out, 3, [f'<span class="secnum">{num}</span>'])
            if rest:
                par.append(rest)
            i += 1
            continue

        # ---- figures
        t = line.body_text
        if t.startswith('Figura') or t.startswith('Diagrama'):
            flush_par()
            ref = take_fig()
            if ref:
                out.append(f'\n![{t}]({ref})\n')
            else:
                out.append(f'\n*{t}*\n')
            i += 1
            continue

        # ---- cos de text
        if t and re.match(r'^\d{1,3}$', t):
            i += 1
            continue
        if t:
            if par and line.y0 - par_last_y1 > GAP:
                flush_par()
            par.append(t)
            par_last_y1 = line.y1 or line.y0
        i += 1

    flush_par()
    flush_annex()
    while fig_i < len(fig_refs):
        out.append(f'\n![Figura]({fig_refs[fig_i]})\n')
        fig_i += 1
    return '\n'.join(out)


def extract_figures(page, doc, page_no):
    """Extreu les imatges incrustades de la pàgina a images/interps/."""
    os.makedirs(OUT_IMG_DIR, exist_ok=True)
    refs = []
    seen = set()
    header_h = 60
    for img in page.get_images(full=True):
        xref = img[0]
        if xref in seen:
            continue
        seen.add(xref)
        try:
            rects = page.get_image_rects(xref)
            if not rects:
                continue
            rect = rects[0]
            if rect.width < 150 or rect.height < 80:
                continue
            if rect.y1 < header_h or rect.y0 > page.rect.height - 26:
                continue
            pix = pymupdf.Pixmap(doc, xref)
            if pix.n > 4:
                pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
            fname = f'page{page_no:03d}_{xref}.png'
            pix.save(os.path.join(OUT_IMG_DIR, fname))
            refs.append(f'images/interps/{fname}')
        except Exception as e:
            print(f'  !! imatge {xref} no extreta: {e}', file=sys.stderr)
    return refs


def find_content_start(doc):
    """Primera pàgina amb un encapçalament d'article (text vermell)."""
    for pno in range(len(doc)):
        d = doc[pno].get_text('dict')
        for block in d['blocks']:
            if block.get('type') != 0:
                continue
            for line in block['lines']:
                for span in line['spans']:
                    t = span['text'].strip()
                    if re.match(r'^(Article|Introducció|Apèndix|ANNEX)\b', t, re.I):
                        if color_class(span['color']) == 'R':
                            return pno
    return 0


def main():
    if len(sys.argv) < 3:
        print('Ús: python3 tools/convert_interp.py <input.pdf> <output.md>', file=sys.stderr)
        sys.exit(1)
    pdf_path, md_path = sys.argv[1:3]
    doc = pymupdf.open(pdf_path)

    start = find_content_start(doc)
    chunks = []
    for pno in range(start, len(doc)):
        page = doc[pno]
        lines = parse_page(page)
        figs = extract_figures(page, doc, pno + 1)
        rendered = render_lines(lines, figs)
        if rendered.strip():
            chunks.append(rendered)

    content = '\n'.join(chunks)
    content = re.sub(r'\n{3,}', '\n\n', content)
    with open(md_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f'S\'ha generat {md_path} ({len(content.splitlines())} línies)')


if __name__ == '__main__':
    main()