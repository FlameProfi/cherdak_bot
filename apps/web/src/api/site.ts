import type {
  AdminAccountCreateResponse,
  AdminAccountUpdateResponse,
  AdminAccountsResponse,
  AdminActionResponse,
  AdminDashboard,
  AdminLoginResponse,
  AdminSessionResponse,
  BookingCreateResponse,
  BookingForm,
  BookingState,
  MenuResponse
} from '../types';

async function readJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  const data = (await response.json()) as { error?: string } & T;
  if (!response.ok) {
    throw new Error(data.error || fallbackMessage);
  }
  return data;
}

export async function fetchMenu(): Promise<MenuResponse> {
  const response = await fetch('/api/menu');
  return readJson<MenuResponse>(response, 'Не удалось загрузить меню.');
}

export async function fetchBookingState(): Promise<BookingState> {
  const response = await fetch('/api/booking');
  return readJson<BookingState>(response, 'Не удалось загрузить схему бронирования.');
}

export async function createBooking(
  payload: BookingForm & { table: string }
): Promise<BookingCreateResponse> {
  const response = await fetch('/api/bookings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  return readJson<BookingCreateResponse>(response, 'Не удалось отправить заявку.');
}

async function adminFetch<T>(
  endpoint: string,
  token: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(endpoint, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-admin-token': token,
      ...(init?.headers || {})
    }
  });

  return readJson<T>(response, 'Не удалось выполнить админский запрос.');
}

export function fetchAdminDashboard(token: string): Promise<AdminDashboard> {
  return adminFetch<AdminDashboard>('/api/admin/dashboard', token);
}

export function loginAdmin(username: string, password: string): Promise<AdminLoginResponse> {
  return fetch('/api/admin/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ username, password })
  }).then((response) => readJson<AdminLoginResponse>(response, 'Не удалось войти в админ-панель.'));
}

export function fetchAdminSession(token: string): Promise<AdminSessionResponse> {
  return adminFetch<AdminSessionResponse>('/api/admin/session', token);
}

export function updateAdminBooking(
  token: string,
  bookingId: number,
  status: string
): Promise<AdminActionResponse> {
  return adminFetch<AdminActionResponse>(`/api/admin/bookings/${bookingId}`, token, {
    method: 'PATCH',
    body: JSON.stringify({ status })
  });
}

export function updateAdminTable(
  token: string,
  tableCode: string,
  payload: { status?: string; photo?: string | null }
): Promise<AdminActionResponse> {
  return adminFetch<AdminActionResponse>(`/api/admin/tables/${tableCode}`, token, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

export function createAdminMenuItem(
  token: string,
  payload: { name: string; price: string; description: string; photo: string; category: string }
): Promise<AdminActionResponse> {
  return adminFetch<AdminActionResponse>('/api/admin/menu', token, {
    method: 'POST',
    body: JSON.stringify({
      ...payload,
      price: Number(payload.price),
      description: payload.description || null,
      photo: payload.photo || null,
      category: payload.category || null
    })
  });
}

export function deleteAdminMenuItem(
  token: string,
  menuItemId: number
): Promise<AdminActionResponse> {
  return adminFetch<AdminActionResponse>(`/api/admin/menu/${menuItemId}`, token, {
    method: 'DELETE'
  });
}

export function fetchAdminAccounts(token: string): Promise<AdminAccountsResponse> {
  return adminFetch<AdminAccountsResponse>('/api/admin/accounts', token);
}

export function createAdminAccount(
  token: string,
  payload: { username: string; password: string; role: string; displayName: string; telegramId: string }
): Promise<AdminAccountCreateResponse> {
  return adminFetch<AdminAccountCreateResponse>('/api/admin/accounts', token, {
    method: 'POST',
    body: JSON.stringify({
      ...payload,
      telegramId: payload.telegramId || null
    })
  });
}

export function updateAdminAccount(
  token: string,
  accountId: number,
  payload: { username: string; password: string; role: string; displayName: string; telegramId: string }
): Promise<AdminAccountUpdateResponse> {
  return adminFetch<AdminAccountUpdateResponse>(`/api/admin/accounts/${accountId}`, token, {
    method: 'PATCH',
    body: JSON.stringify({
      ...payload,
      telegramId: payload.telegramId || null,
      password: payload.password || ''
    })
  });
}
