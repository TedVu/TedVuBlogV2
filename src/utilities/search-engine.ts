import Fuse, { type IFuseOptions } from 'fuse.js';
import type { BlogPost } from '../lib/contentful';

let fuse: Fuse<BlogPost> | null = null;
export async function getSearchEngine(): Promise<Fuse<BlogPost>> {

    if(fuse){
        return fuse;
    }

    const response = await fetch('/search-index.json');

    if(!response.ok){
        throw new Error(`Failed to fetch search index: ${response.statusText}`);
    }

    const searchIndex: BlogPost[] = await response.json();

    const options: IFuseOptions<BlogPost> = {
        keys: ['title'],
        includeScore: true,
        threshold: 0.3,
    };

    fuse = new Fuse(searchIndex, options);
    return fuse;
}