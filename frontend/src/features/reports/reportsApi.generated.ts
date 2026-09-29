import { baseApi as api } from "../../shared/api/baseApi";
export const addTagTypes = ["Dashboard"] as const;
const injectedRtkApi = api
  .enhanceEndpoints({
    addTagTypes,
  })
  .injectEndpoints({
    endpoints: (build) => ({
      listDashboards: build.query<
        ListDashboardsApiResponse,
        ListDashboardsApiArg
      >({
        query: () => ({ url: `/api/reports/dashboards` }),
        providesTags: ["Dashboard"],
      }),
      getDashboard: build.query<GetDashboardApiResponse, GetDashboardApiArg>({
        query: (queryArg) => ({
          url: `/api/reports/dashboards/${queryArg.key}`,
          params: {
            dealershipId: queryArg.dealershipId,
            from: queryArg["from"],
            to: queryArg.to,
          },
        }),
        providesTags: ["Dashboard"],
      }),
    }),
    overrideExisting: false,
  });
export { injectedRtkApi as enhancedApi };
export type ListDashboardsApiResponse = /** status 200 Success */ DashboardList;
export type ListDashboardsApiArg = void;
export type GetDashboardApiResponse = /** status 200 Success */ Dashboard;
export type GetDashboardApiArg = {
  key: "sales" | "service" | "parts" | "accounts";
  dealershipId?: number;
  from?: string;
  to?: string;
};
export type DashboardList = {
  key: "sales" | "service" | "parts" | "accounts";
  title: string;
  mode: "group" | "dealership" | "own";
}[];
export type ApiError = {
  error: {
    code: string;
    message: string;
    details?: any | null;
  };
};
export type DashboardMetric = {
  key: string;
  label: string;
  format: "number" | "money" | "percent" | "hours";
  value: string | number | (any | null);
  hint: string | null;
  to: string | null;
};
export type DashboardChart = {
  key: string;
  title: string;
  format: "number" | "money" | "percent" | "hours";
  data: {
    label: string;
    value: number;
  }[];
  to: string | null;
};
export type DashboardTable = {
  key: string;
  title: string;
  columns: {
    key: string;
    header: string;
    format: "text" | "number" | "money" | "percent" | "hours";
  }[];
  rows: {
    [key: string]: string | number | (any | null);
  }[];
};
export type Dashboard = {
  key: "sales" | "service" | "parts" | "accounts";
  title: string;
  mode: "group" | "dealership" | "own";
  period: {
    from: string;
    to: string;
  };
  metrics: DashboardMetric[];
  charts: DashboardChart[];
  tables: DashboardTable[];
};
export const {
  useListDashboardsQuery,
  useLazyListDashboardsQuery,
  useGetDashboardQuery,
  useLazyGetDashboardQuery,
} = injectedRtkApi;
