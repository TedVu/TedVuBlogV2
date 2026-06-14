import {contentfulClient, type BlogPost} from '../lib/contentful';

export async function GET() {
    
  const { items } = await contentfulClient.getEntries<BlogPost>({
    content_type: "blogPost",
  });

  const searchIndex = items.map((item) => ({
    title: item.fields.title,
    slug: item.fields.slug,
    body: item.fields.body,
  }));

  return new Response(JSON.stringify(searchIndex), {
    headers: {
        "Content-Type": "application/json",
    },
  });
}