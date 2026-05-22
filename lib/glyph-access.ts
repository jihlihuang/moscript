import type { AuthUser } from "@/lib/auth";
import { isAdminAllowed } from "@/lib/auth";
import type { GlyphRow } from "@/lib/db";

export type GlyphResultScope = "library" | "all" | "liked" | "personal" | "public";

export type GlyphAccessRow = Pick<GlyphRow, "owner_user_id" | "visibility">;

export function canAccessGlyph(glyph: GlyphAccessRow, user: AuthUser | null) {
  if (isAdminAllowedForGlyph(user)) return true;
  if (!glyph.owner_user_id) return true;
  if ((glyph.visibility ?? "public") === "public") return true;
  return Boolean(user && glyph.owner_user_id === user.id);
}

export function isAdminAllowedForGlyph(user: AuthUser | null) {
  return Boolean(user && isAdminAllowed(user));
}

export function glyphAccessWhereSql({
  glyphAlias = "g",
  userId,
  includeAllPersonal = false,
  resultScope = "library",
}: {
  glyphAlias?: string;
  userId?: string | null;
  includeAllPersonal?: boolean;
  resultScope?: GlyphResultScope;
}): { sql: string; params: unknown[] } {
  if (includeAllPersonal) return { sql: "1 = 1", params: [] };

  const ownerColumn = `${glyphAlias}.owner_user_id`;
  const visibilityColumn = `${glyphAlias}.visibility`;
  const publiclyAccessible = `(${ownerColumn} IS NULL OR ${visibilityColumn} = 'public')`;

  if (resultScope === "personal") {
    if (!userId) return { sql: "1 = 0", params: [] };
    return { sql: `${ownerColumn} = ?`, params: [userId] };
  }
  if (resultScope === "public") {
    return { sql: publiclyAccessible, params: [] };
  }
  if (resultScope === "all" || resultScope === "liked") {
    if (!userId) return { sql: publiclyAccessible, params: [] };
    return { sql: `(${publiclyAccessible} OR ${ownerColumn} = ?)`, params: [userId] };
  }
  return { sql: `${ownerColumn} IS NULL`, params: [] };
}

export function glyphAccessWhereSqlForUnaliasedGlyphs(options: Omit<Parameters<typeof glyphAccessWhereSql>[0], "glyphAlias">) {
  return glyphAccessWhereSql({ ...options, glyphAlias: "glyphs" });
}

export function glyphImageUrlForAccess(
  glyph: Pick<GlyphRow, "id" | "owner_user_id" | "visibility" | "image_url" | "thumbnail_url">,
  variant: "image" | "thumbnail" = "image"
) {
  const sourceUrl = variant === "thumbnail" ? glyph.thumbnail_url : glyph.image_url;
  if (!sourceUrl) return null;
  if (glyph.owner_user_id && (glyph.visibility ?? "public") === "private") {
    return `/api/glyphs/${glyph.id}/asset${variant === "thumbnail" ? "?variant=thumbnail" : ""}`;
  }
  return sourceUrl;
}
