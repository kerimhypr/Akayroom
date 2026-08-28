import type { GithubCard, MusicCard, UserProfile } from "./types";

export function normalizeRepoArg(arg: string): string | null {
  const repo = arg
    .trim()
    .split(/\s+/)[0]
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/\.git\/?$/, "")
    .split("#")[0]
    .split("?")[0]
    .replace(/\/$/, "");
  return /^[^\/\s]+\/[^\/\s]+$/.test(repo) ? repo : null;
}

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  let data: any = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    const message = data?.message || data?.error?.message;
    throw new Error(message ? String(message) : `HTTP ${res.status}`);
  }
  return data;
}

export async function fetchGithubRepo(repo: string): Promise<GithubCard> {
  const j = await fetchJson(`https://api.github.com/repos/${encodeURIComponent(repo).replace("%2F", "/")}`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  return {
    fullName: j.full_name,
    description: j.description ?? null,
    stars: Number(j.stargazers_count ?? 0),
    forks: Number(j.forks_count ?? 0),
    language: j.language ?? null,
    htmlUrl: j.html_url,
    ownerAvatar: j.owner?.avatar_url ?? "",
    ownerLogin: j.owner?.login ?? "",
  };
}

async function fetchItunesTrack(q: string) {
  if (!q.trim()) throw new Error("arama boş olamaz");
  const data = await fetchJson(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&entity=song&limit=1`);
  const first = data?.results?.[0];
  if (!first) throw new Error("sonuç yok");
  return first;
}

export async function fetchMusicCard(q: string): Promise<MusicCard> {
  const first = await fetchItunesTrack(q);
  return {
    trackName: first.trackName,
    artistName: first.artistName,
    artworkUrl: (first.artworkUrl100 as string | undefined)?.replace("100x100", "300x300") ?? "",
    previewUrl: first.previewUrl ?? null,
    trackViewUrl: first.trackViewUrl,
    collectionName: first.collectionName,
    primaryGenre: first.primaryGenreName,
  };
}

export async function fetchNowPlaying(q: string): Promise<NonNullable<UserProfile["nowPlaying"]>> {
  const first = await fetchItunesTrack(q);
  return {
    track: first.trackName,
    artist: first.artistName,
    artwork: (first.artworkUrl100 as string | undefined)?.replace("100x100", "300x300") ?? undefined,
    previewUrl: first.previewUrl ?? null,
    url: first.trackViewUrl,
    genre: first.primaryGenreName,
    updatedAt: Date.now(),
  };
}

export async function searchGifs(q: string): Promise<string[]> {
  const key = process.env.NEXT_PUBLIC_GIPHY_API_KEY;
  if (!key || !q.trim()) return [];
  const data = await fetchJson(`https://api.giphy.com/v1/gifs/search?api_key=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}&limit=6`);
  return Array.isArray(data?.data)
    ? data.data.map((x: any) => x?.images?.fixed_height?.url).filter((url: unknown): url is string => typeof url === "string" && url.length > 0)
    : [];
}
