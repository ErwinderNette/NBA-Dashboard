import api from "./api";

export type AuthRole = "admin" | "publisher" | "advertiser" | "pending";

export interface AuthResponse {
  token: string;
  role: AuthRole;
  name: string;
  email: string;
  must_complete_profile?: boolean;
  avatar_url?: string;
}

interface LoginPayload {
  email: string;
  password: string;
}

interface RegisterPayload {
  company: string;
  contact_name?: string;
  email: string;
  password: string;
  role: "publisher" | "advertiser";
}

interface GooglePayload {
  idToken: string;
  name?: string;
}

interface CompleteProfilePayload {
  role: "publisher" | "advertiser";
  company: string;
  contact_name?: string;
}

interface AvatarResponse {
  message: string;
  avatar_url: string;
}

interface CompanyOption {
  value: string;
}

const persistAuth = (data: AuthResponse) => {
  localStorage.setItem("isLoggedIn", "true");
  localStorage.setItem("userRole", data.role);
  localStorage.setItem("userEmail", data.email);
  localStorage.setItem("userName", data.name);
  localStorage.setItem("auth_token", data.token);
  localStorage.setItem("userLastLoginAt", new Date().toISOString());
  localStorage.setItem("userAvatarUrl", data.avatar_url || "");
  localStorage.setItem("userAvatarUpdatedAt", String(Date.now()));
  localStorage.setItem(
    "userMustCompleteProfile",
    data.must_complete_profile ? "true" : "false"
  );
};

const clearAuthStorage = () => {
  localStorage.removeItem("isLoggedIn");
  localStorage.removeItem("userRole");
  localStorage.removeItem("userEmail");
  localStorage.removeItem("userName");
  localStorage.removeItem("auth_token");
  localStorage.removeItem("userMustCompleteProfile");
  localStorage.removeItem("userAvatarUrl");
  localStorage.removeItem("userAvatarUpdatedAt");
  localStorage.removeItem("userLastLoginAt");
};

export const authService = {
  login: async (payload: LoginPayload): Promise<AuthResponse> => {
    const response = await api.post<AuthResponse>("/auth/login", payload);
    persistAuth(response.data);
    return response.data;
  },

  register: async (payload: RegisterPayload): Promise<AuthResponse> => {
    const response = await api.post<AuthResponse>("/auth/register", payload);
    persistAuth(response.data);
    return response.data;
  },

  getCompanyOptions: async (): Promise<CompanyOption[]> => {
    const response = await api.get<CompanyOption[]>("/auth/company-options");
    return Array.isArray(response.data) ? response.data : [];
  },

  googleAuth: async (payload: GooglePayload): Promise<AuthResponse> => {
    const response = await api.post<AuthResponse>("/auth/google", payload);
    persistAuth(response.data);
    return response.data;
  },

  forgotPassword: async (email: string): Promise<void> => {
    await api.post("/auth/forgot-password", { email });
  },

  resetPassword: async (token: string, newPassword: string): Promise<void> => {
    await api.post("/auth/reset-password", { token, new_password: newPassword });
  },

  completeProfile: async (payload: CompleteProfilePayload): Promise<AuthResponse> => {
    const response = await api.post<AuthResponse>("/auth/complete-profile", payload);
    persistAuth(response.data);
    return response.data;
  },

  getMe: async (): Promise<{ email: string; role: AuthRole; must_complete_profile: boolean; avatar_url?: string }> => {
    const response = await api.get<{ email: string; role: AuthRole; must_complete_profile: boolean; avatar_url?: string }>("/auth/me");
    return response.data;
  },

  getAvatarBlob: async (): Promise<Blob> => {
    const response = await api.get<Blob>("/users/me/avatar", {
      responseType: "blob",
    });
    return response.data;
  },

  uploadAvatar: async (file: File): Promise<AvatarResponse> => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await api.post<AvatarResponse>("/users/me/avatar", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    localStorage.setItem("userAvatarUrl", response.data.avatar_url || "");
    localStorage.setItem("userAvatarUpdatedAt", String(Date.now()));
    return response.data;
  },

  deleteAvatar: async (): Promise<AvatarResponse> => {
    const response = await api.delete<AvatarResponse>("/users/me/avatar");
    localStorage.setItem("userAvatarUrl", "");
    localStorage.setItem("userAvatarUpdatedAt", String(Date.now()));
    return response.data;
  },

  logout: () => {
    clearAuthStorage();
  },
};

export { clearAuthStorage };
