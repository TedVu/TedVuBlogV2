import * as contentful from "contentful";
import { BLOCKS, type Document, type Node } from "@contentful/rich-text-types";

export const contentfulClient = contentful.createClient({
  space: import.meta.env.CONTENTFUL_SPACE_ID,
  accessToken: import.meta.env.DEV
    ? import.meta.env.CONTENTFUL_PREVIEW_TOKEN
    : import.meta.env.CONTENTFUL_DELIVERY_TOKEN,
  host: import.meta.env.DEV ? "preview.contentful.com" : "cdn.contentful.com",
});

export interface BlogPost {
  contentTypeId: "blogPost";
  fields: {
    title: contentful.EntryFieldTypes.Text;
    body: contentful.EntryFieldTypes.RichText;
    publishedDate: contentful.EntryFieldTypes.Date;
    isPublished: contentful.EntryFieldTypes.Boolean;
    slug: contentful.EntryFieldTypes.Text;
  };
}

type RichNode = Node & { value?: string; content?: RichNode[] };

/**
 * The opening of a rich-text body as plain text, for meta descriptions.
 * Cut at a word boundary to at most `max` characters, with "…" when cut.
 * Returns undefined when the body has no text.
 */
export function plainTextExcerpt(
  document: Document | undefined,
  max = 160,
): string | undefined {
  if (!document) return undefined;

  const walk = (node: RichNode): string => {
    if (node.nodeType === "text") return node.value ?? "";
    // A space at each block boundary keeps paragraphs from running together.
    return (node.content ?? []).map(walk).join("") + " ";
  };

  const text = walk(document as RichNode).replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  if (text.length <= max) return text;

  const cut = text.lastIndexOf(" ", max - 1);
  // A first word longer than `max` has no space to cut at, so cut it hard.
  const head = (cut > 0 ? text.slice(0, cut) : text.slice(0, max - 1)).trimEnd();
  return `${head}…`;
}

const PREVIEW_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export interface EmbeddedImageAsset {
  url: string;
  title?: string;
  description?: string;
}

/**
 * The first embedded raster image (JPEG, PNG, WebP or GIF) in document order.
 * SVGs and other files are skipped.
 */
export function firstImageAsset(
  document: Document | undefined,
): EmbeddedImageAsset | undefined {
  if (!document) return undefined;

  const find = (node: RichNode): EmbeddedImageAsset | undefined => {
    if (node.nodeType === BLOCKS.EMBEDDED_ASSET) {
      const fields = node.data?.target?.fields;
      const file = fields?.file;
      if (file?.url && PREVIEW_IMAGE_TYPES.has(file.contentType)) {
        return {
          url: file.url,
          title: fields.title,
          description: fields.description,
        };
      }
    }
    for (const child of node.content ?? []) {
      const found = find(child);
      if (found) return found;
    }
    return undefined;
  };

  return find(document as RichNode);
}
