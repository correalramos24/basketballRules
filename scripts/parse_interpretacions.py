#!/usr/bin/env python3
"""Parse the FIBA/FCBQ 2026 official interpretations text into a structured JSON model.

Usage:
    python3 scripts/parse_interpretacions.py /tmp/interp.txt scripts/interpretacions-2026.json

Reads the plain-text output of `pdftotext -layout docs/sources/interpretacions_2026.pdf`
and emits: document meta, the introduction, articles -> items (Situació/Exemple +
Interpretació) and appendixes (Apèndix B, Apèndix F).

Layout semantics of the -layout dump:
  * Page footers ("Agost de 2026 versió 1.0 ... Página N de 153"), form feeds,
    page numbers and punctuation-only artifact lines are dropped first, before
    any line joining.
  * Wrapped sentence lines are joined back into one paragraph: a line joins the
    previous one when that line reached the page width, or (after a blank line
    or a short line) it stays separate.
  * A trailing hyphen glues its next word without a space ("concedir-" + "se").
  * Sub-cases "(a) …" lines: when they directly precede the item's
    Interpretació they are lifted into `subcasos`; short low-case continuations
    ("… (aquest és el primer cop que" / "el partit s'atura …)") join the owning
    sub-case. When plain statement text follows the group, the group stays
    inline in `text` (schematic lines like "Amb (a) 16 segons (b) 12 segons restants …").
  * Appendix B holds sign tables: no line joining there, one table row per line.
"""
import json
import re
import sys
from collections import Counter

DOC = {
    "titol": "Interpretacions oficials de les Regles de Joc",
    "edicio": "2026",
    "versio": "1.0",
    "data": "Agost de 2026",
}

HEADER_RE = re.compile(r"^Articles?\s+(\d+(?:\s*/\s*\d+)?)\s+(.+)$")
APPX_RE = re.compile(r"^Ap[eè]ndix\s+([A-Z])\s*[-–—:]\s*(.+)$")
ITEM_RE = re.compile(r"^(\d+(?:/\d+)?)-(\d+)\s+(Situació|Exemples?)\s*:?\s*(.*)$")
APP_ITEM_RE = re.compile(r"^(B-\d+|F[\s.\-]?\d*(?:[.\-]\d+)+)\s+(Situació|Exemples?)\s*:?\s*(.*)$")
APP_SECT_RE = re.compile(r"^(B-\d+|F-\d+)\s+(.+)$")
SUBCASE_RE = re.compile(r"^\(([a-j])\)\s*(.*)$")
INTERP_RE = re.compile(r"^Interpretació\b[:.]?\s*(.*)$")
FIGURE_RE = re.compile(r"^Figura\s+(\d+)\s*:?\s+(.+)$")
FIGURE_LIST_RE = re.compile(r"^\s*Figura\s+\d+\s+.*\.{5,}")
BULLET_RE = re.compile(r"^•\s*(.*)$")
FOOTER_RE = re.compile(r"^Agost de 2026\s+versió")
NOISE_RE = re.compile(r"^[^A-Za-zÀ-ÿ0-9]*$")

# A -layout text line at or above this raw width probably wraps on the next line.
WRAP_THRESHOLD = 92
# While a sub-case group is open, a short lower-case line is its continuation
# ("(…) el primer cop que" + "el partit s'atura després dels tirs lliures).")
SUBCONT_MAX = 70


def is_noise(s: str) -> bool:
    return bool(NOISE_RE.match(s)) or re.fullmatch(r"\d+", s) is not None


def clean_lines(text: str):
    """Split the raw dump into kept lines, dropping form feeds, page footers,
    page numbers and punctuation-only artifact lines. Blank lines become ""."""
    out = []
    for raw in text.replace("\f", "\n").splitlines():
        line = raw.rstrip()
        s = line.strip()
        if FOOTER_RE.match(s):
            continue
        if not s or is_noise(s):
            out.append("")
            continue
        out.append(line)
    return out


def _join(prev, s, raw_len):
    """Append s to a [text, raw_len] pair following the wrap rules. `raw_len`
    stays the length of the last source line so the next join decision looks at
    the real column extent, not at the accumulated paragraph size."""
    if prev[1] >= WRAP_THRESHOLD:
        prev[0] = prev[0] + ("" if prev[0].endswith("-") else " ") + s
        prev[1] = raw_len
        return True
    if prev[0].endswith("-") and s[:1].islower():
        prev[0] = prev[0] + s
        prev[1] = raw_len
        return True
    return False


TERMINATORS = tuple(".:;!?”)")


def _terminal(text):
    return text.rstrip().endswith(TERMINATORS)


class Paragraphs:
    """Line collector that reconstructs paragraphs from a -layout text dump."""

    def __init__(self, wrap=True):
        self.wrap = wrap
        self.paras = []  # [ [text, raw_len], ... ]
        self.pbreak = False

    def add(self, raw, raw_len=None):
        s = raw.strip()
        if s == "":
            self.pbreak = True
            return
        if raw_len is None:
            raw_len = len(raw.rstrip())
        standalone = bool(SUBCASE_RE.match(s) or BULLET_RE.match(s))
        prev = self.paras[-1] if self.paras else None
        joinable = (
            prev is not None
            and not self.pbreak
            and self.wrap
            and not standalone
            and (
                prev[1] >= WRAP_THRESHOLD          # full-width wrapped line
                or not _terminal(prev[0])          # sentence continues anyway
            )
        )
        if joinable:
            if not _join(prev, s, raw_len):
                prev[0] = prev[0] + " " + s
                prev[1] += raw_len
        else:
            self.paras.append([s, raw_len])
        self.pbreak = False

    def text(self):
        return "\n".join(t for t, _ in self.paras)

    def empty(self):
        return not self.paras


class Coll:
    """Collects one item: statement (optional contiguous sub-case group) and
    its optional Interpretació."""

    def __init__(self, wrap=True):
        self.wrap = wrap
        self.pre = Paragraphs(wrap)
        self.run = []       # list of dicts {lletra, paras}
        self.post = Paragraphs(wrap)
        self.subopen = False
        self.interp = Paragraphs(wrap)

    def add_stmt_plain(self, raw):
        s = raw.strip()
        raw_len = len(raw.rstrip())
        if self.run and self.subopen:
            paras = self.run[-1]["paras"]
            ends_sentence = paras[-1][0].rstrip().endswith((".", ":", ";", "!", "?")) if paras else True
            first_lower = s[:1].islower()
            if (
                paras
                and not ends_sentence
                and first_lower
                and raw_len < SUBCONT_MAX
            ):
                paras[-1][0] = paras[-1][0] + " " + s
                paras[-1][1] = raw_len
                return
            self.subopen = False
        dest = self.post if self.run else self.pre
        dest.add(raw)

    def add_subcase(self, lletra, text, raw_len):
        """New "(x) …" line. Same letter continues, different letter starts a
        new sub-case."""
        if self.run and self.subopen and self.run[-1]["lletra"] == lletra:
            last = self.run[-1]["paras"][-1]
            _join(last, text, raw_len) or last.append([text, raw_len])
            return
        self.run.append({"lletra": lletra, "paras": [[text, raw_len]]})
        self.subopen = True

    def finish_stmt(self):
        """(text, subcasos): sub-cases are lifted out only when nothing but the
        Interpretació follows them; otherwise they stay inline in `text`."""
        if not self.run:
            return self.pre.text(), None
        if self.post.empty():
            return self.pre.text(), [{"lletra": r["lletra"], "text": "\n".join(t for t, _ in r["paras"])}
                                     for r in self.run]
        out = []
        if not self.pre.empty():
            out.extend(self.pre.text().split("\n"))
        for r in self.run:
            out.append(f"({r['lletra']}) " + "\n".join(t for t, _ in r["paras"]))
        if not self.post.empty():
            out.extend(self.post.text().split("\n"))
        return "\n".join(out), None


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(2)
    src, dst = sys.argv[1], sys.argv[2]
    with open(src, encoding="utf-8") as fh:
        raw = fh.read()
    lines = clean_lines(raw)

    # ---------------------------------------------------------------- intro
    # The introduction sits between the figure-list page and the first body
    # heading ("Article 2 …").
    fig_start = body_start = None
    for i, line in enumerate(lines):
        if line.strip() == "TAULA DE FIGURES" and fig_start is None:
            fig_start = i
        elif fig_start is not None and HEADER_RE.match(line):
            body_start = i
            break
    if body_start is None:
        print("no body heading found", file=sys.stderr)
        sys.exit(1)

    intro_zone = Paragraphs()
    for line in lines[fig_start + 1 : body_start]:
        s = line.strip()
        if FIGURE_LIST_RE.match(line) or s == "Introducció":
            continue
        intro_zone.add(line)
    introduccio = "\n\n".join(p for p in intro_zone.text().split("\n\n") if p)

    # ------------------------------------------------------------- articles
    articles = []
    art = None
    item = None
    coll = None
    zone = "stmt"

    def flush_item():
        nonlocal item, coll
        if item is None or coll is None:
            return
        text, subcasos = coll.finish_stmt()
        item["text"] = text
        item["interpretacio"] = coll.interp.text()
        if subcasos:
            item["subcasos"] = subcasos
        item, coll = None, None

    i = body_start
    while i < len(lines):
        line = lines[i]
        i += 1
        s = line.strip()

        if s == "":
            if coll is None:
                continue
            dest = coll.interp if zone == "interp" else (coll.post if coll.run else coll.pre)
            dest.add("")
            continue

        if APPX_RE.match(s):
            i -= 1  # let the appendix phase see the "Apèndix X - …" header
            break

        head_m = HEADER_RE.match(s)
        if head_m:
            flush_item()
            numero_raw = re.sub(r"\s*/\s*", "/", head_m.group(1))
            titulo = re.sub(r"\s*\.*\s*$", "", head_m.group(2).strip())
            art = {"numero": numero_raw, "titulo": titulo, "items": []}
            articles.append(art)
            zone = "stmt"
            continue

        item_m = ITEM_RE.match(s)
        if item_m:
            flush_item()
            item = {
                "num": f"{item_m.group(1)}-{item_m.group(2)}",
                "tipus": item_m.group(3),
                "text": "",
                "interpretacio": "",
                "figures": [],
            }
            coll = Coll()
            art["items"].append(item)
            zone = "stmt"
            if item_m.group(4):
                coll.pre.add(item_m.group(4), raw_len=len(line))
            continue

        if item is None or coll is None:
            continue  # nothing between the first heading and its first item

        fig_m = FIGURE_RE.match(s)
        if fig_m:
            item["figures"].append(f"Figura {fig_m.group(1)}: {fig_m.group(2)}")
            continue

        interp_m = INTERP_RE.match(s)
        if interp_m:
            zone = "interp"
            coll.interp.pbreak = True
            if interp_m.group(1):
                coll.interp.add(interp_m.group(1), raw_len=len(line))
            continue

        if zone == "interp":
            coll.interp.add(line)
            continue

        sub_m = SUBCASE_RE.match(s)
        if sub_m:
            if coll.run and not coll.subopen:
                # The group is closed; "(x)" lines now belong to trailing text.
                coll.post.add(f"({sub_m.group(1)}) {sub_m.group(2)}")
            else:
                coll.add_subcase(sub_m.group(1), sub_m.group(2), len(line.rstrip()))
            continue

        if BULLET_RE.match(s):
            coll.subopen = False
            dest = coll.post if coll.run else coll.pre
            dest.add(s)
            continue

        coll.add_stmt_plain(line)

    flush_item()

    # ----------------------------------------------------------- appendixes
    appendixes = []
    apx = None
    apx_item = None
    apx_coll = None
    apx_section = False

    def flush_apx_item():
        nonlocal apx_item, apx_coll
        if apx_item is None or apx_coll is None:
            return
        text, subcasos = apx_coll.finish_stmt()
        apx_item["text"] = text
        apx_item["interpretacio"] = apx_coll.interp.text()
        if subcasos:
            apx_item["subcasos"] = subcasos
        apx_item, apx_coll = None, None

    while i < len(lines):
        line = lines[i]
        i += 1
        s = line.strip()

        if s == "":
            if apx_coll is not None:
                apx_coll.pre.add("")
            elif apx is not None:
                apx.setdefault("_pre", Paragraphs(wrap=apx["wrap"])).add("")
            continue

        apx_m = APPX_RE.match(s)
        if apx_m:
            flush_apx_item()
            apx = {
                "id": apx_m.group(1),
                "titulo": apx_m.group(2).strip(),
                "text": "",
                "items": [],
                # Apèndix B is a table dump: keep every row on its own line.
                "wrap": apx_m.group(1) != "B",
            }
            appendixes.append(apx)
            apx_item = apx_coll = None
            apx_section = False
            continue

        item_m = APP_ITEM_RE.match(s)
        sect_m = None if item_m else APP_SECT_RE.match(s)
        if item_m or sect_m:
            flush_apx_item()
            if item_m:
                apx_item = {
                    "num": item_m.group(1),
                    "tipus": item_m.group(2),
                    "text": "",
                    "interpretacio": "",
                    "figures": [],
                }
                apx_coll = Coll(wrap=apx["wrap"])
                if item_m.group(3):
                    apx_coll.pre.add(item_m.group(3), raw_len=len(line))
            else:
                apx_item = {
                    "num": sect_m.group(1),
                    "tipus": "Secció",
                    "text": sect_m.group(2),
                    "interpretacio": "",
                    "figures": [],
                }
                apx_coll = Coll(wrap=apx["wrap"])
                apx_coll.pre.add(sect_m.group(2), raw_len=len(line))
            apx["items"].append(apx_item)
            apx_section = item_m is None
            apx_zone = "interp" if item_m is None else "stmt"
            continue

        fig_m = FIGURE_RE.match(s)
        if fig_m and apx_item is not None:
            apx_item["figures"].append(f"Figura {fig_m.group(1)}: {fig_m.group(2)}")
            continue

        interp_m = INTERP_RE.match(s)
        if interp_m and apx_coll is not None:
            apx_zone = "interp"
            apx_coll.interp.pbreak = True
            if interp_m.group(1):
                apx_coll.interp.add(interp_m.group(1), raw_len=len(line))
            continue

        sub_m = SUBCASE_RE.match(s)
        if sub_m and apx_coll is not None:
            if apx_zone == "interp":
                apx_coll.interp.add(line)
            elif apx_coll.run and not apx_coll.subopen:
                apx_coll.post.add(f"({sub_m.group(1)}) {sub_m.group(2)}")
            else:
                apx_coll.add_subcase(sub_m.group(1), sub_m.group(2), len(line.rstrip()))
            continue

        if apx_coll is not None:
            if apx_zone == "interp":
                apx_coll.interp.add(line)
            elif apx_section:
                apx_coll.pre.add(line)
            else:
                apx_coll.add_stmt_plain(line)
            continue

        if apx is not None:
            apx.setdefault("_pre", Paragraphs(wrap=apx["wrap"])).add(line)

    flush_apx_item()
    for apx in appendixes:
        pre = apx.pop("_pre", None)
        if pre is not None and not pre.empty():
            apx["text"] = pre.text()

    # ------------------------------------------------- numero normalization
    # Item prefixes are the reliable source for the article number: the body
    # header of Art. 29/51 reads "Article 29/50" while the items say 29/51.
    for a in articles:
        prefixes = Counter(it["num"].rsplit("-", 1)[0] for it in a["items"])
        if prefixes:
            a["numero"] = prefixes.most_common(1)[0][0]

    model = {
        "document": DOC,
        "introduccio": introduccio,
        "articles": articles,
        "apendixes": appendixes,
    }
    with open(dst, "w", encoding="utf-8") as fh:
        json.dump(model, fh, ensure_ascii=False, indent=2)

    total_items = sum(len(a["items"]) for a in articles)
    total_apx_items = sum(len(a["items"]) for a in appendixes)
    print(f"articles={len(articles)} items={total_items} "
          f"apendixes={len(appendixes)} apendix_items={total_apx_items}")


if __name__ == "__main__":
    main()
