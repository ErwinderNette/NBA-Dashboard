export type UploadListSortOrder = "newest" | "oldest" | "publisher";

export function uploadDateMs(u: { upload_date?: string }): number {
  if (!u.upload_date) return 0;
  const t = new Date(u.upload_date).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** Sortiert Uploads nach Upload-Datum bzw. Publisher-E-Mail (`uploaded_by`). */
export function sortUploads<T extends { upload_date?: string; uploaded_by?: string; id?: number }>(
  items: T[],
  order: UploadListSortOrder
): T[] {
  const copy = [...items];
  if (order === "newest") {
    copy.sort((a, b) => uploadDateMs(b) - uploadDateMs(a) || (b.id ?? 0) - (a.id ?? 0));
  } else if (order === "oldest") {
    copy.sort((a, b) => uploadDateMs(a) - uploadDateMs(b) || (a.id ?? 0) - (b.id ?? 0));
  } else {
    const pub = (s: string | undefined) => (s || "").toLowerCase().trim();
    copy.sort((a, b) => {
      const cmp = pub(a.uploaded_by).localeCompare(pub(b.uploaded_by), "de");
      if (cmp !== 0) return cmp;
      return uploadDateMs(b) - uploadDateMs(a);
    });
  }
  return copy;
}
