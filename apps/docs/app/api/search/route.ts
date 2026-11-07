import { createFromSource } from 'fumadocs-core/search/server';
import { source } from '@/lib/source';

// Statically exported: the search index is generated at build time.
export const revalidate = false;

export const { staticGET: GET } = createFromSource(source);
