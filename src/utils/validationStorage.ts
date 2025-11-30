// src/utils/validationStorage.ts

const VALIDATION_STORAGE_KEY = 'nba_validation_results';

export const validationStorage = {
  // Speichere Validierungsergebnisse
  save: (uploadId: number, validationData: any) => {
    try {
      const allValidations = validationStorage.loadAll();
      allValidations[uploadId] = {
        ...validationData,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(VALIDATION_STORAGE_KEY, JSON.stringify(allValidations));
      console.log(`[validationStorage] Gespeichert für UploadID ${uploadId}`);
    } catch (err) {
      console.error('[validationStorage] Fehler beim Speichern:', err);
      // Falls localStorage voll ist, versuche alte Einträge zu löschen
      try {
        const all = validationStorage.loadAll();
        const sorted = Object.entries(all).sort((a, b) => {
          const aTime = a[1]?.savedAt || '';
          const bTime = b[1]?.savedAt || '';
          return aTime.localeCompare(bTime);
        });
        // Lösche die ältesten 50% der Einträge
        const toKeep = sorted.slice(Math.floor(sorted.length / 2));
        const cleaned: Record<number, any> = {};
        toKeep.forEach(([key, value]) => {
          cleaned[parseInt(key, 10)] = value;
        });
        localStorage.setItem(VALIDATION_STORAGE_KEY, JSON.stringify(cleaned));
        // Versuche erneut zu speichern
        allValidations[uploadId] = {
          ...validationData,
          savedAt: new Date().toISOString(),
        };
        localStorage.setItem(VALIDATION_STORAGE_KEY, JSON.stringify(allValidations));
      } catch (retryErr) {
        console.error('[validationStorage] Fehler beim Retry:', retryErr);
      }
    }
  },

  // Lade alle Validierungsergebnisse
  loadAll: (): Record<number, any> => {
    try {
      const stored = localStorage.getItem(VALIDATION_STORAGE_KEY);
      if (!stored) return {};
      
      const parsed = JSON.parse(stored);
      // Konvertiere String-Keys zu Numbers
      const result: Record<number, any> = {};
      for (const [key, value] of Object.entries(parsed)) {
        const uploadId = parseInt(key, 10);
        if (!isNaN(uploadId)) {
          result[uploadId] = value;
        }
      }
      return result;
    } catch (err) {
      console.error('[validationStorage] Fehler beim Laden:', err);
      return {};
    }
  },

  // Lade Validierungsergebnisse für einen Upload
  load: (uploadId: number): any | null => {
    const all = validationStorage.loadAll();
    return all[uploadId] || null;
  },

  // Lösche Validierungsergebnisse für einen Upload
  remove: (uploadId: number) => {
    const all = validationStorage.loadAll();
    delete all[uploadId];
    localStorage.setItem(VALIDATION_STORAGE_KEY, JSON.stringify(all));
  },

  // Lösche alle Validierungsergebnisse
  clear: () => {
    localStorage.removeItem(VALIDATION_STORAGE_KEY);
  },
};

