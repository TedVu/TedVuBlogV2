import type { APIRoute } from 'astro';
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

export const GET: APIRoute = async () => {

  const { items } = await contentfulClient.getEntries<BlogPost>({
    content_type: "blogPost",
  });

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