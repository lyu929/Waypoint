export type Role = 'USER' | 'ADMIN';
export type TripStatus = 'PLANNED' | 'APPROVED' | 'REJECTED' | 'COMPLETED' | 'CANCELLED';
export type Category = 'FLIGHT' | 'LODGING' | 'FOOD' | 'TRANSPORT' | 'OTHER';
export type ReportStatus = 'GENERATED' | 'SUBMITTED' | 'APPROVED';
export type AvatarKey = 'initials' | 'compass' | 'plane' | 'leaf' | 'location';
export interface User {
  user_id: number;
  first_name: string;
  last_name: string;
  email: string;
  role: Role;
  phone_number: string;
  avatar_key?: AvatarKey;
  created_at?: string;
}
export type UserInput = Omit<User, 'user_id' | 'created_at'> & { password?: string };
export interface ProfileInput {
  first_name: string;
  last_name: string;
  phone_number: string;
  avatar_key: AvatarKey;
}
export interface BudgetSummary {
  remaining: number;
  overrun: number;
  used_percent: number | null;
  state: 'UNSET' | 'ON_TRACK' | 'NEAR' | 'OVER';
}
export interface Trip {
  trip_id?: number;
  user_id: number;
  destination: string;
  start_date: string;
  end_date: string;
  purpose: string;
  status: TripStatus;
  estimated_budget: number;
  spent?: number;
  user_name?: string;
  budget?: BudgetSummary;
}
export type ItineraryKind = 'ACTIVITY' | 'TRANSPORT' | 'STAY' | 'NOTE';
export interface ItineraryItem {
  item_id?: number;
  trip_id?: number;
  item_date: string;
  start_time: string | null;
  kind: ItineraryKind;
  title: string;
  location: string;
  notes: string;
}
export interface TripEvent {
  event_id: number;
  actor_name: string;
  actor_role: Role;
  event_type: string;
  from_status: TripStatus | null;
  to_status: TripStatus | null;
  comment: string;
  created_at: string;
}
export interface TripDetail {
  trip: Trip;
  expenses: Expense[];
  reports: Report[];
  itinerary: ItineraryItem[];
  history: TripEvent[];
}
export interface AiStatus {
  available: boolean;
  provider: string;
}
export interface AiItineraryDraft {
  summary: string;
  items: ItineraryItem[];
  generated_at: string;
}
export interface AiBudgetInsights {
  summary: string;
  suggestions: string[];
  snapshot: BudgetSummary & {
    budget_usd: number;
    spent: number;
    expense_count: number;
    categories: Record<Category, number>;
    currency: string;
  };
  generated_at: string;
}
export interface AiReceiptDraft {
  merchant: string | null;
  amount: number | null;
  currency: string | null;
  expense_date: string | null;
  category: Category;
  description: string;
  warnings: string[];
  receipt_sha256: string;
  expense_fingerprint: string;
}
export interface Expense {
  expense_id?: number;
  trip_id: number;
  user_id?: number;
  category: Category;
  amount: number;
  expense_date: string;
  description: string;
  receipt_url: string;
  receipt_id?: number;
  receipt_name?: string;
  receipt_type?: string;
  receipt_size?: number;
  destination?: string;
  user_name?: string;
}
export interface Report {
  report_id: number;
  trip_id: number | null;
  generated_by: number;
  owner_id: number;
  total_expenses: number;
  report_status: ReportStatus;
  destination?: string;
  generated_by_name?: string;
  generated_at: string;
  snapshot?: { trip: Trip; expenses: Expense[]; currency: string };
}
