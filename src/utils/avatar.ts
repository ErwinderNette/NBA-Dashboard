export const blobToObjectUrl = (blob: Blob) => URL.createObjectURL(blob);

export const safeRevokeObjectUrl = (url?: string | null) => {
  if (!url) {
    return;
  }
  try {
    URL.revokeObjectURL(url);
  } catch {
    // ignore invalid URL references
  }
};
