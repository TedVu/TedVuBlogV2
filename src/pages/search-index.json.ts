import type { APIRoute } from 'astro';
import type { EntriesQueries } from 'contentful';
import type { Document, Node } from '@contentful/rich-text-types';
import {contentfulClient, type BlogPost} from '../lib/contentful';

function extractText(node: Node): string {
  const value = (node as any).value;
  const content = (node as any).content;

  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(content)) {
    return content.map(extractText).join(' ');
  }

  return '';
}

// Keep this in sync with the listing query in src/pages/blog/index.astro so the
// index never contains a post that has no row to reveal (and vice versa).
const query: EntriesQueries<BlogPost, undefined> & Record<string, any> = {
  content_type: "blogPost",
  "sys.publishedAt[exists]": true,
  "fields.slug[exists]": true,
  order: "-fields.publishedDate",
  limit: 1000,
};

export const GET: APIRoute = async () => {

  const { items, total } = await contentfulClient.getEntries<BlogPost>(query);

  if (total > items.length) {
    console.warn(
      `search-index: only indexed ${items.length} of ${total} posts; paginate this query.`
    );
  }

  const searchIndex = items.map((item) => ({
    title: item.fields.title,
    slug: item.fields.slug,
    body: extractText(item.fields.body as unknown as Document),
  }));

  return new Response(JSON.stringify(searchIndex), {
    headers: {
        "Content-Type": "application/json",
    },
  });
}