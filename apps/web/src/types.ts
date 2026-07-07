export type FeedbackType = '' | 'success' | 'error';

export interface FeedbackState {
  type: FeedbackType;
  text: string;
}

export interface MenuItem {
  id: number;
  name: string;
  price: number;
  description: string | null;
  photo: string | null;
  category: string | null;
}

export interface BookingEntry {
  id: number;
  name: string | null;
  phone: string | null;
  date: string | null;
  time: string | null;
  guests: number | null;
  table_code: string | null;
  comment: string | null;
  status: string;
  created_at?: string;
}

export interface BookingTable {
  code: string;
  label: string;
  seats: number;
  status: 'available' | 'reserved' | string;
  photo?: string | null;
  reserved_until?: string | null;
  occupied_until?: string | null;
  next_booking_at?: string | null;
}

export interface BookingLayoutPoint {
  left: string;
  top: string;
}

export interface BookingState {
  freeCount: number;
  takenCount: number;
  layout: Record<string, BookingLayoutPoint>;
  tables: BookingTable[];
}

export interface BookingForm {
  date: string;
  time: string;
  name: string;
  phone: string;
  guests: string;
  comment: string;
}

export interface MenuResponse {
  items: MenuItem[];
}

export interface BookingCreateResponse {
  success: boolean;
  bookingId: number;
  message: string;
  state: BookingState;
}

export interface AdminStats {
  totalBookings: number;
  pendingBookings: number;
  confirmedBookings: number;
  rejectedBookings: number;
  occupiedTables: number;
  freeTables: number;
}

export interface AdminDashboard {
  menuItems: MenuItem[];
  tables: BookingTable[];
  bookings: BookingEntry[];
  stats: AdminStats;
}

export interface AdminActionResponse {
  success: boolean;
  dashboard: AdminDashboard;
}

export interface AdminAccount {
  id: number;
  username: string;
  role: 'host' | 'admin' | 'owner' | string;
  display_name: string | null;
  telegram_id?: number | null;
  created_at: string;
}

export interface AdminSession {
  sub: number;
  username: string;
  role: 'host' | 'admin' | 'owner' | string;
  displayName: string | null;
  exp: number;
}

export interface AdminLoginResponse {
  token: string;
  admin: AdminAccount;
}

export interface AdminSessionResponse {
  admin: AdminSession;
}

export interface AdminAccountsResponse {
  items: AdminAccount[];
}

export interface AdminAccountCreateResponse {
  success: boolean;
  account: AdminAccount;
  items: AdminAccount[];
}

export interface AdminAccountUpdateResponse {
  success: boolean;
  account: AdminAccount;
  items: AdminAccount[];
}
