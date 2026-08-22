export function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

export function usernameEmail(username: string) {
  return `${normalizeUsername(username)}@poseidon.local`;
}

export function validUsername(username: string) {
  return /^[a-z0-9_-]{3,24}$/.test(normalizeUsername(username));
}
