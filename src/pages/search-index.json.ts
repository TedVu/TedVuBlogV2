import type { APIRoute } from 'astro';
import {contentfulClient, type BlogPost} from '../lib/contentful';

export const GET: APIRoute = async () => {
    
  const { items } = await contentfulClient.getEntries<BlogPost>({
    content_type: "blogPost",
  });

  const searchIndex = items.map((item) => ({
    title: item.fields.title,
    slug: item.fields.slug,
    body: item.fields.body.content.map((contentItem) => contentItem.content.map((textItem) => textItem.value).join(' ')).join(' '),
  }));

  return new Response(JSON.stringify(searchIndex), {
    headers: {
        "Content-Type": "application/json",
    },
  });
}