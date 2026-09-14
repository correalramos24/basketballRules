"""Convertidor PDF → markdown estructurat: Regles FIBA 2024 adaptades a l'FCBQ.

Ús:
    python3 tools/convert_fcbq.py regles_fcbq.pdf reglesFCBQ.md

Genera un fitxer markdown amb l'estructura:
  # Regla N — Títol
  ## Art. N Títol
  ### N.M Títol
  #### N.M.P Títol
El text taronja (modificacions/annexes FCBQ) es converteix en blocs <div class="annex">.
Les figures incrustades del PDF s'exporten a images/regles/.
"""
import os
import re
import sys

import pymupdf  # PyMuPDF

OUT_IMG_DIR = os.path.join(os.path.dirname(__file__), '..', 'images', 'regles')

HEADER_RE = re.compile(r'^Regles FIBA 2024 adaptades a l’FCBQ')
BULLET_CHARS = '•·\uf0b7\uf0b8\uf0a7\uf020\uf0b6'


def is_orange(r, g, b):
    return r > 0.85 and 0.4 < g < 0.75 and b < 0.5


def is_red(r, g, b):
    return r > 0.6 and g < 0.5 and b < 0.5


def color_class(color):
    r = ((color >> 16) & 255) / 255
    g = ((color >> 8) & 255) / 255
    b = (color & 255) / 255
    if is_orange(r, g, b):
        return 'O'
    if is_red(r, g, b):
        return 'R'
    return 'D'


def is_bullet_span(span):
    return span['font'] == 'SymbolMT'


def clean_text(t):
    for ch in BULLET_CHARS:
        t = t.replace(ch, '')
    return t.replace('\u2022', '').strip()


class Run:
    __slots__ = ('text', 'kind', 'bold', 'size', 'font')

    def __init__(self, text, kind, bold=False, size=0, font=''):
        self.text = text
        self.kind = kind
        self.bold = bold
        self.size = size
        self.font = font

    def __repr__(self):
        return f'Run({self.text[:20]!r}, {self.kind}, bold={self.bold})'


class Line:
    """Una línia visual del PDF amb els seus runs classificats."""

    def __init__(self, y0, runs, y1=None):
        self.y0 = y0
        self.y = y0
        self.y1 = y1 if y1 is not None else y0
        self.runs = runs

    @property
    def text(self):
        return ''.join(t.text for t in self.runs)

    @property
    def body_text(self):
        return clean_text(self.text)

    @property
    def is_heading(self):
        return any(r.kind == 'heading' for r in self.runs)

    @property
    def has_annex(self):
        return any(r.kind == 'annex' for r in self.runs)

    @property
    def has_secnum(self):
        return any(r.kind == 'secnum' for r in self.runs)

    @property
    def is_all_bold(self):
        return bool(self.runs) and all(r.bold for r in self.runs)

    @property
    def starts_bullet(self):
        for r in self.runs:
            if r.text.strip() == '':
                continue
            return r.kind == 'bullet'
        return False


def parse_page(page):
    """Retorna una llista de Line classificant els runs de la pàgina."""
    d = page.get_text('dict')
    lines = []
    footer_y_start = page.rect.height - 26
    header_y_end = 70
    for block in d['blocks']:
        if block.get('type') != 0:
            continue
        for line in block['lines']:
            y0 = line['bbox'][1]
            y1 = line['bbox'][3]
            if y0 > footer_y_start:
                continue
            runs = []
            for span in line['spans']:
                txt = span['text']
                if txt.strip() == '':
                    continue
                if HEADER_RE.match(txt):
                    runs.append(Run(txt, 'drop'))
                    continue
                if y0 < header_y_end and re.match(r'^\d+$', txt.strip()):
                    runs.append(Run(txt, 'drop'))
                    continue
                cls = color_class(span['color'])
                size = span['size']
                bold = bool(span['flags'] & 16)
                if cls == 'R' and size > 13:
                    runs.append(Run(txt, 'heading', bold, size))
                elif cls == 'O':
                    runs.append(Run(txt, 'annex', bold, size))
                elif is_bullet_span(span):
                    runs.append(Run(txt, 'bullet'))
                elif bold and re.match(r'^[A-Za-z]?\d+(\.\d+)*\.?\s*$', txt.strip()):
                    runs.append(Run(txt, 'secnum', bold, size))
                else:
                    runs.append(Run(txt, 'body', bold, size))
            # descarta línies que només contenen capçalera / número de pàgina
            if any(r.kind == 'drop' for r in runs):
                continue
            if runs and all(clean_text(r.text) == '' for r in runs):
                continue
            if runs:
                lines.append(Line(y0, runs, y1))
    return lines


SECNUM_RE = re.compile(r'^([A-Za-z]?\d+)(\.\d+)*\.?$')


def section_level(num):
    n = num.strip().rstrip('.')
    dots = n.count('.')
    return 3 if dots == 1 else 4


def split_first_secnum(runs):
    """Torna (num, resta) si el primer run és un número d'apartat."""
    for i, r in enumerate(runs):
        if r.kind == 'secnum':
            return r.text, runs[i + 1:]
    return None, runs


def emit_heading(out, level, parts, closing=True):
    htag = '#' * level
    content = ' '.join(p for p in parts if p and p.strip()).strip()
    out.append(f'\n{htag} {content}\n')


def render_lines(lines, fig_refs=None):
    """Converteix les línies classificades en markdown.

    Les captions `Figura N:` es converteixen en figures amb la imatge corresponent
    de `fig_refs` (una imatge per captió, en ordre).
    """
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
                out.append(text + '\n')
            par.clear()

    i = 0
    n = len(lines)
    par_last_y1 = 0.0
    GAP = 6.0
    while i < n:
        line = lines[i]

        # ---- encapçalaments REGLA / Art / ANNEX (fusiona línies continuades)
        if line.is_heading:
            flush_par()
            parts = []
            first_kind = None
            while i < n and lines[i].is_heading:
                ln = lines[i]
                t = clean_text(ln.text)
                if not t:
                    i += 1
                    continue
                if first_kind is None:
                    first_kind = 'regla' if re.match(r'^REGLA\b', t) else (
                        'annex' if re.match(r'^ANNEX\b', t) else (
                            'art' if re.match(r'^Art\.', t) else 'other'))
                # per REGLA/Art, només parem a línies SUBSEGUENTS de tipus diferent
                if first_kind in ('regla', 'art') and len(parts) > 0:
                    nxt = clean_text(ln.text)
                    if (first_kind == 'regla' and re.match(r'^(Art\.|REGLA\b|ANNEX\b)', nxt)):
                        break
                    if (first_kind == 'art' and re.match(r'^(Art\.|REGLA\b|ANNEX\b)', nxt)):
                        break
                parts.append(t)
                i += 1
            txt = ' '.join(parts).strip()
            if first_kind == 'regla':
                m = re.match(r'REGLA\s*(?:Núm\.\s*)?(\d+)\s*[-–]?\s*(.*)', txt, re.I)
                if m:
                    num = m.group(1)
                    title = m.group(2).strip()
                    emit_heading(out, 1, [f'<span class="secnum">Regla {num}</span>', title])
                else:
                    emit_heading(out, 1, [txt])
            elif first_kind == 'annex':
                emit_heading(out, 1, [txt])
            elif first_kind == 'art':
                m = re.match(r'Art\.\s*(\d+)\s*(.*)', txt, re.I)
                if m:
                    title = m.group(2).strip().lstrip('. ').strip()
                    emit_heading(out, 2, [f'<span class="secnum">Art. {m.group(1)}</span>', title])
                else:
                    emit_heading(out, 2, [txt])
            else:
                emit_heading(out, 2, [txt])
            continue

        # ---- annexos FCBQ (text taronja)
        if line.has_annex:
            flush_par()
            annex_buf.append(line.body_text)
            i += 1
            continue

        # ---- sub-apartats numerats
        if line.has_secnum:
            flush_par()
            num, rest_runs = split_first_secnum(line.runs)
            rest_text = ' '.join(r.text for r in rest_runs if r.kind != 'bullet').strip()
            # la línia següent, si és tota en negreta, és el títol de l'apartat
            title_parts = []
            if i + 1 < n:
                nxt = lines[i + 1]
                if (not nxt.is_heading and not nxt.has_annex and not nxt.has_secnum
                        and not nxt.starts_bullet and nxt.is_all_bold):
                    title_parts.append(nxt.body_text)
                    i += 1
            counter = clean_text(num).rstrip('.')
            title = ' '.join(p for p in [rest_text] + title_parts if p).strip().lstrip('. ').strip()
            # els números de les taules de l'acta (ex. "8 C", "1") no són encapçalaments
            if '.' not in counter and len(title) < 4:
                par.append((counter + ' ' + title).strip())
                i += 1
                continue
            parts = [f'<span class="secnum">{counter}</span>', title] if title else [f'<span class="secnum">{counter}</span>']
            emit_heading(out, section_level(num), parts)
            i += 1
            continue

        # ---- llistes
        if line.starts_bullet:
            flush_par()
            out.append(f'- {line.body_text}\n')
            i += 1
            continue

        # ---- figures (peu/caption)
        if line.body_text.startswith('Figura'):
            flush_par()
            cap = line.body_text
            ref = take_fig()
            if ref:
                out.append(f'\n![{cap}]({ref})\n')
            else:
                out.append(f'\n*{cap}*\n')
            i += 1
            continue

        # ---- cos de text
        t = line.body_text
        # descarta números de pàgina solts o línies que només són el peu d'ençapçalament
        if t and re.match(r'^\d{1,3}$', t):
            i += 1
            continue
        if t and ('Regles FIBA 2024 adaptades a l' in t):
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
    """Extreu les imatges incrustades (figures) de la pàgina a images/regles/.

    Descarta imatges petites (marques/logos) i les que cauen a la zona de capçalera.
    """
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
            refs.append(f'images/regles/{fname}')
        except Exception as e:
            print(f'  !! imatge {xref} no extreta: {e}', file=sys.stderr)
    return refs


def find_content_start(doc):
    """Primera pàgina que conté un encapçalament REGLA (text vermell gran)."""
    for pno in range(len(doc)):
        page = doc[pno]
        d = page.get_text('dict')
        found = False
        for block in d['blocks']:
            if block.get('type') != 0:
                continue
            for line in block['lines']:
                for span in line['spans']:
                    if span['size'] > 13 and re.match(r'^REGLA\b', span['text'].strip(), re.I):
                        c = color_class(span['color'])
                        if c == 'R':
                            found = True
        if found:
            return pno
    return 0


def main():
    if len(sys.argv) < 3:
        print('Ús: python3 tools/convert_fcbq.py <input.pdf> <output.md>', file=sys.stderr)
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