import { useCallback, useEffect, useRef, useState } from "react";
import { isAxiosError } from "axios";
import { authService } from "@/services/authService";
import { blobToObjectUrl, safeRevokeObjectUrl } from "@/utils/avatar";

interface UseAvatarOptions {
  avatarUrl?: string;
  avatarVersion?: string | number;
}

export const useAvatar = ({ avatarUrl, avatarVersion }: UseAvatarOptions) => {
  const [avatarObjectUrl, setAvatarObjectUrl] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [hasAvatar, setHasAvatar] = useState(Boolean(avatarUrl));
  const currentObjectUrlRef = useRef<string>("");
  const loadSeqRef = useRef(0);

  const clearAvatar = useCallback(() => {
    safeRevokeObjectUrl(currentObjectUrlRef.current);
    currentObjectUrlRef.current = "";
    setAvatarObjectUrl("");
    setHasAvatar(false);
  }, []);

  const loadAvatar = useCallback(async () => {
    if (!avatarUrl) {
      clearAvatar();
      return;
    }

    const seq = loadSeqRef.current + 1;
    loadSeqRef.current = seq;
    setIsLoading(true);
    setHasAvatar(true);

    try {
      const blob = await authService.getAvatarBlob();
      const objectUrl = blobToObjectUrl(blob);
      if (loadSeqRef.current !== seq) {
        safeRevokeObjectUrl(objectUrl);
        return;
      }
      safeRevokeObjectUrl(currentObjectUrlRef.current);
      currentObjectUrlRef.current = objectUrl;
      setAvatarObjectUrl(objectUrl);
    } catch (error) {
      if (loadSeqRef.current !== seq) {
        return;
      }
      if (isAxiosError(error) && (error.response?.status === 404 || error.response?.status === 401)) {
        clearAvatar();
      } else {
        clearAvatar();
      }
    } finally {
      if (loadSeqRef.current === seq) {
        setIsLoading(false);
      }
    }
  }, [avatarUrl, clearAvatar]);

  useEffect(() => {
    void loadAvatar();
  }, [loadAvatar, avatarVersion]);

  useEffect(() => {
    return () => {
      safeRevokeObjectUrl(currentObjectUrlRef.current);
    };
  }, []);

  return {
    avatarObjectUrl,
    isLoading,
    hasAvatar,
    reloadAvatar: loadAvatar,
    clearAvatar,
  };
};
