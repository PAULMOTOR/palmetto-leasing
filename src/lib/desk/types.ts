import type { DeskBucket } from "@/lib/desk/buckets";

export type DeskDeal = {
  id: string;
  clientName: string;
  email?: string;
  phone?: string;
  vin: string;
  year: number | null;
  make: string;
  model: string;
  trim: string;
  vehicle: string;
  bucket: DeskBucket;
  bucketLabel: string;
  docsMissing: string[];
  complianceHold: boolean;
  updatedAt: string;
  quote?: {
    price?: number;
    down?: number;
    residual?: number;
    term?: number;
    monthly?: number;
    rate?: number;
  };
};

export type DeskBoard = {
  dealer: string;
  dealerName?: string;
  gauges: Record<DeskBucket, number>;
  deals: DeskDeal[];
  live: boolean;
  error?: string;
};
