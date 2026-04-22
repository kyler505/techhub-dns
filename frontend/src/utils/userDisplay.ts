import type { User } from "../contexts/AuthContext";

export function getUserDisplayName(user: User | null | undefined, fallback = "Unknown User"): string {
  const displayName = user?.display_name?.trim();
  if (displayName) return displayName;

  const email = user?.email?.trim();
  if (email) return email;

  return fallback;
}
