import request from "@/utils/request";

export const userApi = {
  login: (data: { username: string; password: string }) => {
    return request.post<{ token: string }>("/api/user/login", data);
  },
};
