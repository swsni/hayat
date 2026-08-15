export interface Shift {
  id?: string;
  staffId: string;
  staffName: string;
  branch: string;
  openedAt: string;
  closedAt?: string;
  status: 'Open' | 'Closed';
  startingCash: number;
  actualCash?: number;
  expectedCash?: number;
  overageShortage?: number;
  totals?: {
    cash: number;
    card: number;
    benefit: number;
    storeCredit: number;
    refunds: number;
  };
}
