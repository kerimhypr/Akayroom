import type { GithubCard, MusicCard, UserProfile } from "./types";

export function normalizeRepoArg(arg: string): string | null {
  const repo = arg.split(/\s+/)[0].replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "");
  return /^[^\/\s]+\/[^\/\s]+$/.test(repo) ? repo : null;
}

export async function fetchGithubRepo(repo: string): Promise<GithubCard> {
  const res = await fetch(`https://api.github.com/repos/${repo}`, { headers: { Accept: "application/vnd.github+json" } });
  if (!res.ok) throw new Error(res.status === 404 ? "repo bulunamadı" : `github ${res.status}`);
  const j = await res.json();
  return {
    fullName: j.full_name,
    description: j.description ?? null,
    stars: j.stargazers_count,
    forks: j.forks_count,
    language: j.language ?? null,
    htmlUrl: j.html_url,
    ownerAvatar: j.owner?.avatar_url,
    ownerLogin: j.owner?.login,
  };
}

async function fetchItunesTrack(q: string) {
  const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&entity=song&limit=1`);
  const data = await res.json();
  const first = data.results?.[0];
  if (!first) throw new Error("sonuç yok");
  return first;
}

export async function fetchMusicCard(q: string): Promise<MusicCard> {
  const first = await fetchItunesTrack(q);
  return {
    trackName: first.trackName,
    artistName: first.artistName,
    artworkUrl: (first.artworkUrl100 as string)?.replace("100x100", "300x300") ?? first.artworkUrl100,
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
    artwork: (first.artworkUrl100 as string)?.replace("100x100", "300x300") ?? first.artworkUrl100,
    previewUrl: first.previewUrl ?? null,
    url: first.trackViewUrl,
    genre: first.primaryGenreName,
    updatedAt: Date.now(),
  };
}

export async function searchGifs(q: string): Promise<string[]> {
  const key = process.env.NEXT_PUBLIC_GIPHY_API_KEY;
  if (!key || !q.trim()) return [];
  const res = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=${key}&q=${encodeURIComponent(q)}&limit=6`);
  const data = await res.json();
  return data.data?.map((x: any) => x.images?.fixed_height?.url).filter(Boolean) ?? [];
}
