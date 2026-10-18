export type RangeKey = "24h" | "7d" | "30d" | "90d" | "YTD" | "All";

export type ChartSeries = {
  name: string;
  data: number[];
  color: string;
};

export type DonutSlice = {
  label: string;
  value: number;
  color: string;
};
