import { baseApi as api } from "../../shared/api/baseApi";
export const addTagTypes = ["Notification"] as const;
const injectedRtkApi = api
  .enhanceEndpoints({
    addTagTypes,
  })
  .injectEndpoints({
    endpoints: (build) => ({
      listNotifications: build.query<
        ListNotificationsApiResponse,
        ListNotificationsApiArg
      >({
        query: (queryArg) => ({
          url: `/api/notifications`,
          params: {
            page: queryArg.page,
            pageSize: queryArg.pageSize,
            unread: queryArg.unread,
          },
        }),
        providesTags: ["Notification"],
      }),
      getUnreadNotificationCount: build.query<
        GetUnreadNotificationCountApiResponse,
        GetUnreadNotificationCountApiArg
      >({
        query: () => ({ url: `/api/notifications/unread-count` }),
        providesTags: ["Notification"],
      }),
      markAllNotificationsRead: build.mutation<
        MarkAllNotificationsReadApiResponse,
        MarkAllNotificationsReadApiArg
      >({
        query: () => ({ url: `/api/notifications/read-all`, method: "POST" }),
        invalidatesTags: ["Notification"],
      }),
      markNotificationRead: build.mutation<
        MarkNotificationReadApiResponse,
        MarkNotificationReadApiArg
      >({
        query: (queryArg) => ({
          url: `/api/notifications/${queryArg.id}/read`,
          method: "POST",
        }),
        invalidatesTags: ["Notification"],
      }),
      deleteNotification: build.mutation<
        DeleteNotificationApiResponse,
        DeleteNotificationApiArg
      >({
        query: (queryArg) => ({
          url: `/api/notifications/${queryArg.id}`,
          method: "DELETE",
        }),
        invalidatesTags: ["Notification"],
      }),
    }),
    overrideExisting: false,
  });
export { injectedRtkApi as enhancedApi };
export type ListNotificationsApiResponse =
  /** status 200 Success */ NotificationPage;
export type ListNotificationsApiArg = {
  page?: number;
  pageSize?: number;
  unread?: "true" | "false";
};
export type GetUnreadNotificationCountApiResponse =
  /** status 200 Success */ NotificationUnread;
export type GetUnreadNotificationCountApiArg = void;
export type MarkAllNotificationsReadApiResponse =
  /** status 200 Success */ NotificationUnread;
export type MarkAllNotificationsReadApiArg = void;
export type MarkNotificationReadApiResponse =
  /** status 200 Success */ NotificationUnread;
export type MarkNotificationReadApiArg = {
  id: number;
};
export type DeleteNotificationApiResponse =
  /** status 200 Success */ NotificationUnread;
export type DeleteNotificationApiArg = {
  id: number;
};
export type Notification = {
  id: number;
  title: string;
  detail: string | null;
  href: string | null;
  actorName: string | null;
  entityType: string;
  action: string;
  createdAt: string;
  readAt: string | null;
};
export type NotificationPage = {
  items: Notification[];
  total: number;
  page: number;
  pageSize: number;
  unread: number;
};
export type ApiError = {
  error: {
    code: string;
    message: string;
    details?: any | null;
  };
};
export type NotificationUnread = {
  unread: number;
};
export const {
  useListNotificationsQuery,
  useLazyListNotificationsQuery,
  useGetUnreadNotificationCountQuery,
  useLazyGetUnreadNotificationCountQuery,
  useMarkAllNotificationsReadMutation,
  useMarkNotificationReadMutation,
  useDeleteNotificationMutation,
} = injectedRtkApi;
