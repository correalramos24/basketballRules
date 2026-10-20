import { getCollection } from 'astro:content';

type SearchDoc = {
  id: string;
  type: string;
  tipus: string;
  url: string;
  titulo: string;
  numero: string;
  context: string;
  text: string;
};

/** Strip Markdown/HTML so the search index holds clean prose. */
function clean(md: string): string {
  return md
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_#>`~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const GET = async () => {
  const docs: SearchDoc[] = [];

  // The rules articles collection (Reglament FIBA/FCBQ).
  const articles = await getCollection('articles', ({ data }) => !data.draft);
  for (const entry of articles) {
    docs.push({
      id: entry.id,
      type: 'article',
      tipus: 'Reglament',
      url: `/articles/${entry.id}`,
      titulo: entry.data.titulo,
      numero: String(entry.data.numero),
      context: entry.data.reglaTitol
        ? `Regla ${entry.data.regla} · ${entry.data.reglaTitol}`
        : `Regla ${entry.data.regla}`,
      text: clean(entry.body ?? ''),
    });
  }

  // The interpretations collection — only indexed once it is defined
  // (the digitalization pipeline may not have generated it yet).
  try {
    const interp = await getCollection('interpretacions', ({ data }) => !data.draft);
    for (const entry of interp) {
      docs.push({
        id: entry.id,
        type: 'interpretacio',
        tipus: 'Interpretacions',
        url: `/interpretacions/${entry.id}`,
        titulo: entry.data.titulo,
        numero: String(entry.data.numero ?? entry.id),
        context: 'Interpretacions oficials',
        text: clean(entry.body ?? ''),
      });
    }
  } catch {
    // Collection not registered yet — skip it.
  }

  return new Response(JSON.stringify(docs), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
