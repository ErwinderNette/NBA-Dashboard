const LAST_ACTION_KEY = "userLastAction";

export const sessionMeta = {
  setLastAction(action: string) {
    localStorage.setItem(
      LAST_ACTION_KEY,
      JSON.stringify({
        action,
        at: new Date().toISOString(),
      })
    );
  },

  getLastAction(): { action: string; at: string } | null {
    const raw = localStorage.getItem(LAST_ACTION_KEY);
    if (!raw) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw);
      if (
        parsed &&
        typeof parsed === "object" &&
        typeof parsed.action === "string" &&
        typeof parsed.at === "string"
      ) {
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  },
};
