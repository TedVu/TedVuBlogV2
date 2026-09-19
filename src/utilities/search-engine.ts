import Fuse, { type IFuseOptions, type Expression } from 'fuse.js';

/**
 * Shape of one entry in /search-index.json, as produced by
 * src/pages/search-index.json.ts.
 */
export interface SearchablePost {
    title: string;
    slug: string;
    body: string;
}

/** Tokens shorter than this can't match, given `minMatchCharLength` below. */
const MIN_TOKEN_LENGTH = 2;

let fuse: Fuse<SearchablePost> | null = null;
let pending: Promise<Fuse<SearchablePost>> | null = null;

async function loadSearchEngine(): Promise<Fuse<SearchablePost>> {
    const response = await fetch('/search-index.json');

    if(!response.ok){
        throw new Error(`Failed to fetch search index: ${response.statusText}`);
    }

    const searchIndex: SearchablePost[] = await response.json();

    const options: IFuseOptions<SearchablePost> = {
        keys: [
            { name: 'title', weight: 2 },
            { name: 'body', weight: 1 },
        ],
        includeScore: true,
        threshold: 0.1,
        // Match anywhere in the field. Without this, Fuse only accepts matches
        // within ~100 characters of the start of the field, which makes the
        // body effectively unsearchable.
        ignoreLocation: true,
        // Stop long bodies from flattening every score toward the threshold.
        ignoreFieldNorm: true,
        minMatchCharLength: MIN_TOKEN_LENGTH,
    };

    fuse = new Fuse(searchIndex, options);
    return fuse;
}

export async function getSearchEngine(): Promise<Fuse<SearchablePost>> {

    if(fuse){
        return fuse;
    }

    // Share one in-flight request so rapid keystrokes can't each start a fetch.
    // Cleared either way, so a failed load is retried on the next search rather
    // than reusing a rejected promise forever.
    if(!pending){
        pending = loadSearchEngine().finally(() => {
            pending = null;
        });
    }

    return pending;
}

/** A token matches if it appears in either indexed field. */
function matchesAnyField(token: string): Expression {
    return { $or: [{ title: token }, { body: token }] };
}

/**
 * Fuse matches a query as a single pattern, so "ngrok tutorial" fails against a
 * post titled "...with Ngrok" whose body says "tutorial". Split the query and
 * require every token to match somewhere.
 */
export function searchPosts(
    engine: Fuse<SearchablePost>,
    query: string
): SearchablePost[] {
    const normalizedQuery = query.trim();

    if(!normalizedQuery){
        return [];
    }

    const tokens = normalizedQuery
        .split(/\s+/)
        .filter((token) => token.length >= MIN_TOKEN_LENGTH);

    // Nothing long enough to match on its own: search the raw query so a short
    // one-off still behaves predictably instead of silently matching everything.
    if(tokens.length === 0){
        return engine.search(normalizedQuery).map(({ item }) => item);
    }

    if(tokens.length === 1){
        return engine.search(tokens[0]).map(({ item }) => item);
    }

    const expression: Expression = { $and: tokens.map(matchesAnyField) };

    return engine.search(expression).map(({ item }) => item);
}
