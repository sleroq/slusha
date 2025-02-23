import ky from 'ky';

export interface CharacterResult {
    id: number;
    name: string;
    fullPath: string;
    description: string;
    starCount: number;
    lastActivityAt: string;
    createdAt: string;
    labels: Label[];
    topics: string[];
    forksCount: number;
    rating: number;
    ratingCount: number;
    projectSpace: string;
    creatorId: number;
    nTokens: number;
    tagline: string;
    primaryFormat: string;
    related_characters: number[];
    related_lorebooks: number[];
    related_prompts: number[];
    related_extensions: number[];
    forks: number[];
    hasGallery: boolean;
    nChats: number;
    nMessages: number;
    definition: string;
    permissions: string;
    is_public: boolean;
    is_favorite: boolean;
    nsfw_image: boolean;
    n_public_chats: number;
    n_favorites: number;
    is_unlisted: boolean;
    avatar_url: string;
    bound_preset: string;
    project_uuid: string;
    verified: boolean;
    recommended: boolean;
    ratings_disabled: boolean;
}

interface Label {
    title: string;
    description: string;
}

export interface SearchResult {
    nodes: CharacterResult[];
}

export const pageSize = 20;

export async function getCharacters(query = '', page = 1) {
    const url = new URL('https://api.chub.ai/api/characters/search');
    url.searchParams.set('excludetopics', 'nsfw');
    url.searchParams.set('first', String(pageSize));
    url.searchParams.set('page', String(page));
    url.searchParams.set('namespace', 'characters');
    url.searchParams.set('search', query);
    url.searchParams.set('include_forks', 'true');
    url.searchParams.set('nsfw', 'true');
    url.searchParams.set('nsfw_only', 'false');
    url.searchParams.set('require_custom_prompt', 'false');
    url.searchParams.set('require_images', 'false');
    url.searchParams.set('require_expressions', 'false');
    url.searchParams.set('nsfl', 'true');
    url.searchParams.set('asc', 'false');
    url.searchParams.set('min_tokens', '50');
    url.searchParams.set('max_tokens', '100000');
    url.searchParams.set('chub', 'true');
    url.searchParams.set('require_lore', 'false');
    url.searchParams.set('exclude_mine', 'true');
    url.searchParams.set('require_lore_embedded', 'false');
    url.searchParams.set('require_lore_linked', 'false');
    url.searchParams.set('sort', 'star_count');
    url.searchParams.set('topics', '');
    url.searchParams.set('venus', 'true');
    url.searchParams.set('count', 'false');

    const results = await ky.get(url, {
        headers: {
            'Content-Type': 'application/json',
            'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36',
        },
    }).json<SearchResult>();

    return results.nodes;
}

interface Extensions {
    chub: Record<string, unknown>;
    depth_prompt: Record<string, unknown>;
    fav: boolean;
    talkativeness: string;
    world: string;
}

interface CharacterResponse {
    alternate_greetings: string[];
    character_book: string;
    character_version: string;
    creator: string;
    creator_notes: string;
    description: string;
    extensions: Extensions;
    first_mes: string;
    mes_example: string;
    name: string;
    personality: string[];
    post_history_instructions: string;
    scenario: string;
    system_prompt: string;
    tags: string[];
}

export interface Character extends CharacterResponse {
    id: number;
}

interface DownloadResponse {
    data: Character;
}

export async function getCharacter(id: number) {
    const url = new URL(
        `https://api.chub.ai/api/v4/projects/${id}/repository/files/raw%252Ftavern_raw.json/raw?ref=main&response_type=blob`,
    );

    const response = await ky.get(url, {
        credentials: 'omit',
        headers: {
            'User-Agent':
                'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0',
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.5',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-site',
            'Priority': 'u=0',
        },
        referrer: 'https://venus.chub.ai/',
        method: 'GET',
        mode: 'cors',
    }).json<DownloadResponse>();

    return { ...response.data, id };
}
