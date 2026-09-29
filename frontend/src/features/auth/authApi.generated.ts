import { baseApi as api } from "../../shared/api/baseApi";
export const addTagTypes = ["Auth"] as const;
const injectedRtkApi = api
  .enhanceEndpoints({
    addTagTypes,
  })
  .injectEndpoints({
    endpoints: (build) => ({
      login: build.mutation<LoginApiResponse, LoginApiArg>({
        query: (queryArg) => ({
          url: `/api/auth/login`,
          method: "POST",
          body: queryArg.loginRequest,
        }),
        invalidatesTags: ["Auth"],
      }),
      refreshSession: build.mutation<
        RefreshSessionApiResponse,
        RefreshSessionApiArg
      >({
        query: () => ({ url: `/api/auth/refresh`, method: "POST" }),
        invalidatesTags: ["Auth"],
      }),
      logout: build.mutation<LogoutApiResponse, LogoutApiArg>({
        query: () => ({ url: `/api/auth/logout`, method: "POST" }),
        invalidatesTags: ["Auth"],
      }),
      getMe: build.query<GetMeApiResponse, GetMeApiArg>({
        query: () => ({ url: `/api/auth/me` }),
        providesTags: ["Auth"],
      }),
      updateProfile: build.mutation<
        UpdateProfileApiResponse,
        UpdateProfileApiArg
      >({
        query: (queryArg) => ({
          url: `/api/auth/me`,
          method: "PATCH",
          body: queryArg.profileUpdate,
        }),
        invalidatesTags: ["Auth"],
      }),
      changePassword: build.mutation<
        ChangePasswordApiResponse,
        ChangePasswordApiArg
      >({
        query: (queryArg) => ({
          url: `/api/auth/change-password`,
          method: "POST",
          body: queryArg.changePasswordRequest,
        }),
        invalidatesTags: ["Auth"],
      }),
      devLogin: build.mutation<DevLoginApiResponse, DevLoginApiArg>({
        query: (queryArg) => ({
          url: `/api/auth/dev-login`,
          method: "POST",
          body: queryArg.devLoginRequest,
        }),
        invalidatesTags: ["Auth"],
      }),
      listDevAccounts: build.query<
        ListDevAccountsApiResponse,
        ListDevAccountsApiArg
      >({
        query: () => ({ url: `/api/auth/dev-accounts` }),
        providesTags: ["Auth"],
      }),
    }),
    overrideExisting: false,
  });
export { injectedRtkApi as enhancedApi };
export type LoginApiResponse = /** status 200 Success */ TokenResponse;
export type LoginApiArg = {
  loginRequest: LoginRequest;
};
export type RefreshSessionApiResponse = /** status 200 Success */ TokenResponse;
export type RefreshSessionApiArg = void;
export type LogoutApiResponse = unknown;
export type LogoutApiArg = void;
export type GetMeApiResponse = /** status 200 Success */ Me;
export type GetMeApiArg = void;
export type UpdateProfileApiResponse = /** status 200 Success */ Me;
export type UpdateProfileApiArg = {
  profileUpdate: ProfileUpdate;
};
export type ChangePasswordApiResponse = /** status 200 Success */ TokenResponse;
export type ChangePasswordApiArg = {
  changePasswordRequest: ChangePasswordRequest;
};
export type DevLoginApiResponse = /** status 200 Success */ TokenResponse;
export type DevLoginApiArg = {
  devLoginRequest: DevLoginRequest;
};
export type ListDevAccountsApiResponse = /** status 200 Success */ {
  email: string;
  fullName: string;
}[];
export type ListDevAccountsApiArg = void;
export type Me = {
  user: {
    id: number;
    email: string;
    fullName: string;
    phone: string | null;
  };
  permissions: {
    code: string;
    global: boolean;
    dealershipIds: number[];
    branchIds: number[];
  }[];
  dealerships: {
    id: number;
    code: string;
    name: string;
    brand: string;
  }[];
  branches: {
    id: number;
    dealershipId: number;
    code: string;
    name: string;
  }[];
};
export type TokenResponse = {
  accessToken: string;
  expiresIn: number;
  me: Me;
};
export type ApiError = {
  error: {
    code: string;
    message: string;
    details?: any | null;
  };
};
export type LoginRequest = {
  email: string;
  password: string;
};
export type ProfileUpdate = {
  fullName?: string;
  phone?: string | null;
};
export type ChangePasswordRequest = {
  currentPassword: string;
  newPassword: string;
};
export type DevLoginRequest = {
  email?: string;
};
export const {
  useLoginMutation,
  useRefreshSessionMutation,
  useLogoutMutation,
  useGetMeQuery,
  useLazyGetMeQuery,
  useUpdateProfileMutation,
  useChangePasswordMutation,
  useDevLoginMutation,
  useListDevAccountsQuery,
  useLazyListDevAccountsQuery,
} = injectedRtkApi;
