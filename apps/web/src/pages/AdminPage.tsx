import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import FeedbackBanner from '../components/ui/FeedbackBanner';
import {
  createAdminAccount,
  createAdminMenuItem,
  deleteAdminMenuItem,
  fetchAdminAccounts,
  fetchAdminDashboard,
  fetchAdminSession,
  loginAdmin,
  updateAdminAccount,
  updateAdminBooking,
  updateAdminTable
} from '../api/site';
import type { AdminAccount, AdminDashboard, AdminSession, BookingEntry, BookingTable, FeedbackState } from '../types';

const ADMIN_TOKEN_KEY = 'cherdak-admin-token-v2';

const emptyMenuForm = {
  name: '',
  price: '',
  description: '',
  photo: '',
  category: ''
};

const emptyAccountForm = {
  username: '',
  password: '',
  role: 'host',
  displayName: '',
  telegramId: ''
};

type AdminTab = 'overview' | 'bookings' | 'tables' | 'menu' | 'team';
type StreamState = 'connecting' | 'live' | 'offline';

function AdminPage() {
  const [token, setToken] = useState(() => localStorage.getItem(ADMIN_TOKEN_KEY) || '');
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [session, setSession] = useState<AdminSession | null>(null);
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [feedback, setFeedback] = useState<FeedbackState>({ type: '', text: '' });
  const [loading, setLoading] = useState(false);
  const [menuForm, setMenuForm] = useState(emptyMenuForm);
  const [accountForm, setAccountForm] = useState(emptyAccountForm);
  const [editingAccountId, setEditingAccountId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [streamState, setStreamState] = useState<StreamState>('connecting');

  const canManageMenu = session?.role === 'admin' || session?.role === 'owner';
  const canManageAccounts = session?.role === 'owner';

  const tabs = useMemo(() => {
    const baseTabs: Array<{ id: AdminTab; label: string; badge?: number | string }> = [
      { id: 'overview', label: 'Обзор' },
      { id: 'bookings', label: 'Брони', badge: dashboard?.stats.pendingBookings ?? 0 },
      { id: 'tables', label: 'Столы', badge: dashboard?.stats.occupiedTables ?? 0 }
    ];

    if (canManageMenu) {
      baseTabs.push({ id: 'menu', label: 'Меню', badge: dashboard?.menuItems.length ?? 0 });
    }

    if (canManageAccounts) {
      baseTabs.push({ id: 'team', label: 'Команда', badge: accounts.length });
    }

    return baseTabs;
  }, [accounts.length, canManageAccounts, canManageMenu, dashboard]);

  useEffect(() => {
    if (!feedback.text) return undefined;
    const timeoutId = window.setTimeout(() => {
      setFeedback({ type: '', text: '' });
    }, 3200);
    return () => window.clearTimeout(timeoutId);
  }, [feedback]);

  useEffect(() => {
    if (!tabs.some((tab) => tab.id === activeTab)) {
      setActiveTab('overview');
    }
  }, [activeTab, tabs]);

  useEffect(() => {
    if (!token) {
      setDashboard(null);
      setSession(null);
      setAccounts([]);
      setStreamState('connecting');
      return;
    }

    let adminStream: EventSource | null = null;
    let cancelled = false;

    async function loadAdmin() {
      setLoading(true);
      setStreamState('connecting');

      try {
        const [dashboardResponse, sessionResponse] = await Promise.all([
          fetchAdminDashboard(token),
          fetchAdminSession(token)
        ]);

        if (cancelled) return;

        setDashboard(dashboardResponse);
        setSession(sessionResponse.admin);

        if (sessionResponse.admin.role === 'owner') {
          const accountsResponse = await fetchAdminAccounts(token);
          if (!cancelled) {
            setAccounts(accountsResponse.items);
          }
        } else {
          setAccounts([]);
        }

        adminStream = new EventSource(`/api/admin/stream?token=${encodeURIComponent(token)}`);
        adminStream.addEventListener('connected', () => {
          if (!cancelled) setStreamState('live');
        });
        adminStream.addEventListener('admin-dashboard', (event) => {
          const nextDashboard = JSON.parse((event as MessageEvent<string>).data) as AdminDashboard;
          if (!cancelled) {
            setDashboard(nextDashboard);
            setStreamState('live');
          }
        });
        adminStream.addEventListener('admin-accounts', (event) => {
          const payload = JSON.parse((event as MessageEvent<string>).data) as { items: AdminAccount[] };
          if (!cancelled) {
            setAccounts(payload.items);
            setStreamState('live');
          }
        });
        adminStream.onerror = () => {
          if (!cancelled) {
            setStreamState('offline');
          }
        };
      } catch (error) {
        if (!cancelled) {
          localStorage.removeItem(ADMIN_TOKEN_KEY);
          setToken('');
          setDashboard(null);
          setSession(null);
          setAccounts([]);
          setStreamState('offline');
          setFeedback({ type: 'error', text: (error as Error).message });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadAdmin();

    return () => {
      cancelled = true;
      adminStream?.close();
    };
  }, [token]);

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);

    try {
      const response = await loginAdmin(credentials.username, credentials.password);
      localStorage.setItem(ADMIN_TOKEN_KEY, response.token);
      setToken(response.token);
      setCredentials({ username: '', password: '' });
      setFeedback({ type: 'success', text: `Вход выполнен: ${response.admin.username}` });
    } catch (error) {
      setFeedback({ type: 'error', text: (error as Error).message });
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    setToken('');
    setFeedback({ type: 'success', text: 'Сессия завершена.' });
  }

  async function changeBookingStatus(bookingId: number, status: string) {
    if (!token) return;
    setLoading(true);

    try {
      const response = await updateAdminBooking(token, bookingId, status);
      setDashboard(response.dashboard);
      setFeedback({
        type: 'success',
        text: status === 'confirmed' ? `Бронь #${bookingId} подтверждена.` : `Бронь #${bookingId} отклонена.`
      });
    } catch (error) {
      setFeedback({ type: 'error', text: (error as Error).message });
    } finally {
      setLoading(false);
    }
  }

  async function changeTableStatus(tableCode: string, status: string) {
    if (!token) return;
    setLoading(true);

    try {
      const response = await updateAdminTable(token, tableCode, { status });
      setDashboard(response.dashboard);
      setFeedback({
        type: 'success',
        text: status === 'available' ? `Стол ${tableCode} отмечен как свободный.` : `Стол ${tableCode} отмечен как занятый.`
      });
    } catch (error) {
      setFeedback({ type: 'error', text: (error as Error).message });
    } finally {
      setLoading(false);
    }
  }

  async function changeTablePhoto(tableCode: string, photo: string) {
    if (!token) return;
    setLoading(true);

    try {
      const response = await updateAdminTable(token, tableCode, {
        photo: photo.trim() || null
      });
      setDashboard(response.dashboard);
      setFeedback({
        type: 'success',
        text: `Фото для стола ${tableCode} обновлено.`
      });
    } catch (error) {
      setFeedback({ type: 'error', text: (error as Error).message });
    } finally {
      setLoading(false);
    }
  }

  async function submitMenuItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;

    setLoading(true);
    try {
      const response = await createAdminMenuItem(token, menuForm);
      setDashboard(response.dashboard);
      setMenuForm(emptyMenuForm);
      setFeedback({ type: 'success', text: 'Позиция меню добавлена.' });
    } catch (error) {
      setFeedback({ type: 'error', text: (error as Error).message });
    } finally {
      setLoading(false);
    }
  }

  async function removeMenuItem(menuItemId: number) {
    if (!token) return;

    setLoading(true);
    try {
      const response = await deleteAdminMenuItem(token, menuItemId);
      setDashboard(response.dashboard);
      setFeedback({ type: 'success', text: `Позиция #${menuItemId} удалена.` });
    } catch (error) {
      setFeedback({ type: 'error', text: (error as Error).message });
    } finally {
      setLoading(false);
    }
  }

  async function submitAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;

    setLoading(true);
    try {
      const response = await createAdminAccount(token, accountForm);
      setAccounts(response.items);
      setAccountForm(emptyAccountForm);
      setFeedback({ type: 'success', text: `Аккаунт ${response.account.username} создан.` });
    } catch (error) {
      setFeedback({ type: 'error', text: (error as Error).message });
    } finally {
      setLoading(false);
    }
  }

  function startEditingAccount(account: AdminAccount) {
    setEditingAccountId(account.id);
    setActiveTab('team');
    setAccountForm({
      username: account.username,
      password: '',
      role: account.role,
      displayName: account.display_name || '',
      telegramId: account.telegram_id ? String(account.telegram_id) : ''
    });
  }

  function resetAccountForm() {
    setEditingAccountId(null);
    setAccountForm(emptyAccountForm);
  }

  async function submitAccountUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !editingAccountId) return;

    setLoading(true);
    try {
      const response = await updateAdminAccount(token, editingAccountId, accountForm);
      setAccounts(response.items);
      resetAccountForm();
      setFeedback({ type: 'success', text: `Аккаунт #${editingAccountId} обновлен.` });
    } catch (error) {
      setFeedback({ type: 'error', text: (error as Error).message });
    } finally {
      setLoading(false);
    }
  }

  const pendingBookings = dashboard?.bookings.filter((booking) => booking.status === 'pending') ?? [];
  const activeTables = dashboard?.tables.filter((table) => table.status === 'reserved') ?? [];

  return (
    <>
      <FeedbackBanner feedback={feedback} />
      <header className="page-header admin-page-header">
        <div>
          <Link to="/" className="back-link">
            {'<'} назад
          </Link>
          <h1>Админ-панель</h1>
          <p>Управление бронированиями, залом, меню и командой в одном рабочем пространстве.</p>
        </div>

        {session ? (
          <div className="admin-session-card">
            <strong>{session.displayName || session.username}</strong>
            <span>{session.role}</span>
            <div className={`admin-live-pill ${streamState}`}>
              {streamState === 'live' ? 'live' : streamState === 'connecting' ? 'подключение' : 'offline'}
            </div>
            <button type="button" onClick={logout}>
              Выйти
            </button>
          </div>
        ) : null}
      </header>

      {!session ? (
        <section className="admin-auth card admin-login-card">
          <h2>Вход для персонала</h2>
          <form className="admin-token-form" onSubmit={submitLogin}>
            <input
              value={credentials.username}
              onChange={(event) => setCredentials((current) => ({ ...current, username: event.target.value }))}
              placeholder="Логин"
              required
            />
            <input
              value={credentials.password}
              onChange={(event) => setCredentials((current) => ({ ...current, password: event.target.value }))}
              placeholder="Пароль"
              type="password"
              required
            />
            <button className="action-button" type="submit" disabled={loading}>
              Войти
            </button>
          </form>
          <p className="admin-note">По умолчанию создается владелец из `ADMIN_USERNAME` / `ADMIN_PASSWORD`.</p>
        </section>
      ) : dashboard ? (
        <div className="admin-workspace">
          <aside className="admin-sidebar-nav card">
            <div className="admin-sidebar-head">
              <span className="pill">Control Room</span>
              <h2>Разделы</h2>
            </div>

            <nav className="admin-tabs" aria-label="Навигация по админке">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`admin-tab ${activeTab === tab.id ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <span>{tab.label}</span>
                  {tab.badge ? <strong>{tab.badge}</strong> : null}
                </button>
              ))}
            </nav>

            <div className="admin-sidebar-note">
              <strong>{loading ? 'Синхронизация...' : 'Моментальные обновления'}</strong>
              <p>Данные приходят автоматически из live-канала и сразу обновляют интерфейс.</p>
            </div>
          </aside>

          <div className="admin-content">
            <section className="admin-stats card">
              <div className="admin-section-head">
                <div>
                  <h2>Сводка смены</h2>
                  <span>Ключевые показатели по залу и броням</span>
                </div>
              </div>

              <div className="admin-stat-grid">
                <div><strong>{dashboard.stats.pendingBookings}</strong><span>Ожидают</span></div>
                <div><strong>{dashboard.stats.confirmedBookings}</strong><span>Подтверждены</span></div>
                <div><strong>{dashboard.stats.rejectedBookings}</strong><span>Отклонены</span></div>
                <div><strong>{dashboard.stats.freeTables}</strong><span>Свободные столы</span></div>
                <div><strong>{dashboard.stats.occupiedTables}</strong><span>Занятые столы</span></div>
                <div><strong>{dashboard.menuItems.length}</strong><span>Позиций в меню</span></div>
              </div>
            </section>

            {activeTab === 'overview' ? (
              <div className="admin-board">
                <section className="card admin-panel">
                  <div className="admin-section-head">
                    <h2>Срочно обработать</h2>
                    <span>{pendingBookings.length} заявок</span>
                  </div>
                  <div className="admin-list">
                    {pendingBookings.length ? pendingBookings.slice(0, 5).map((booking) => (
                      <BookingRow
                        key={booking.id}
                        booking={booking}
                        compact
                        onConfirm={() => changeBookingStatus(booking.id, 'confirmed')}
                        onReject={() => changeBookingStatus(booking.id, 'rejected')}
                      />
                    )) : <div className="admin-empty">Новых заявок сейчас нет.</div>}
                  </div>
                </section>

                <section className="card admin-panel">
                  <div className="admin-section-head">
                    <h2>Зал сейчас</h2>
                    <span>{activeTables.length} активных столов</span>
                  </div>
                  <div className="admin-list">
                    {dashboard.tables.slice(0, 6).map((table) => (
                      <TableRow
                        key={table.code}
                        table={table}
                        compact
                        onSetAvailable={() => changeTableStatus(table.code, 'available')}
                        onSetReserved={() => changeTableStatus(table.code, 'reserved')}
                        onSavePhoto={(photo) => changeTablePhoto(table.code, photo)}
                      />
                    ))}
                  </div>
                </section>
              </div>
            ) : null}

            {activeTab === 'bookings' ? (
              <section className="admin-bookings card admin-panel">
                <div className="admin-section-head">
                  <h2>Брони</h2>
                  <span>Обновляется моментально</span>
                </div>
                <div className="admin-list">
                  {dashboard.bookings.slice(0, 20).map((booking) => (
                    <BookingRow
                      key={booking.id}
                      booking={booking}
                      onConfirm={() => changeBookingStatus(booking.id, 'confirmed')}
                      onReject={() => changeBookingStatus(booking.id, 'rejected')}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            {activeTab === 'tables' ? (
              <section className="admin-tables card admin-panel">
                <div className="admin-section-head">
                  <h2>Столы</h2>
                  <span>Live-статусы по SSE</span>
                </div>
                <div className="admin-list">
                  {dashboard.tables.map((table) => (
                    <TableRow
                      key={table.code}
                      table={table}
                      onSetAvailable={() => changeTableStatus(table.code, 'available')}
                      onSetReserved={() => changeTableStatus(table.code, 'reserved')}
                      onSavePhoto={(photo) => changeTablePhoto(table.code, photo)}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            {activeTab === 'menu' && canManageMenu ? (
              <section className="admin-menu card admin-panel">
                <div className="admin-section-head">
                  <h2>Меню</h2>
                  <span>Доступно ролям admin/owner</span>
                </div>
                <div className="admin-split">
                  <form className="admin-menu-form admin-form-card" onSubmit={submitMenuItem}>
                    <input
                      value={menuForm.name}
                      onChange={(event) => setMenuForm((current) => ({ ...current, name: event.target.value }))}
                      placeholder="Название"
                      required
                    />
                    <input
                      value={menuForm.price}
                      onChange={(event) => setMenuForm((current) => ({ ...current, price: event.target.value }))}
                      placeholder="Цена"
                      required
                    />
                    <input
                      value={menuForm.category}
                      onChange={(event) => setMenuForm((current) => ({ ...current, category: event.target.value }))}
                      placeholder="Категория"
                    />
                    <input
                      value={menuForm.photo}
                      onChange={(event) => setMenuForm((current) => ({ ...current, photo: event.target.value }))}
                      placeholder="URL фото"
                    />
                    <textarea
                      value={menuForm.description}
                      onChange={(event) => setMenuForm((current) => ({ ...current, description: event.target.value }))}
                      placeholder="Описание"
                      rows={4}
                    />
                    <button className="action-button" type="submit">
                      Добавить позицию
                    </button>
                  </form>

                  <div className="admin-list">
                    {dashboard.menuItems.map((item) => (
                      <article className="admin-row" key={item.id}>
                        <div>
                          <strong>#{item.id} {item.name}</strong>
                          <p>{item.category || 'Без категории'} · {item.price} ₽</p>
                          <small>{item.description || 'Без описания'}</small>
                        </div>
                        <div className="admin-actions">
                          <button type="button" onClick={() => removeMenuItem(item.id)}>
                            Удалить
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              </section>
            ) : null}

            {activeTab === 'team' && canManageAccounts ? (
              <section className="admin-accounts card admin-panel">
                <div className="admin-section-head">
                  <h2>Аккаунты команды</h2>
                  <span>Только owner</span>
                </div>
                <div className="admin-split">
                  <form className="admin-menu-form admin-form-card" onSubmit={editingAccountId ? submitAccountUpdate : submitAccount}>
                    <input
                      value={accountForm.displayName}
                      onChange={(event) => setAccountForm((current) => ({ ...current, displayName: event.target.value }))}
                      placeholder="Имя сотрудника"
                    />
                    <input
                      value={accountForm.username}
                      onChange={(event) => setAccountForm((current) => ({ ...current, username: event.target.value }))}
                      placeholder="Логин"
                      required
                    />
                    <input
                      value={accountForm.password}
                      onChange={(event) => setAccountForm((current) => ({ ...current, password: event.target.value }))}
                      placeholder={editingAccountId ? 'Новый пароль (необязательно)' : 'Пароль'}
                      type="password"
                      required={!editingAccountId}
                    />
                    <input
                      value={accountForm.telegramId}
                      onChange={(event) => setAccountForm((current) => ({ ...current, telegramId: event.target.value }))}
                      placeholder="Telegram ID (необязательно)"
                    />
                    <select
                      value={accountForm.role}
                      onChange={(event) => setAccountForm((current) => ({ ...current, role: event.target.value }))}
                    >
                      <option value="host">Host</option>
                      <option value="admin">Admin</option>
                      <option value="owner">Owner</option>
                    </select>
                    <button className="action-button" type="submit">
                      {editingAccountId ? 'Сохранить изменения' : 'Создать аккаунт'}
                    </button>
                    {editingAccountId ? (
                      <button className="action-button secondary-button" type="button" onClick={resetAccountForm}>
                        Отменить редактирование
                      </button>
                    ) : null}
                  </form>

                  <div className="admin-list">
                    {accounts.map((account) => (
                      <article className="admin-row" key={account.id}>
                        <div>
                          <strong>{account.display_name || account.username}</strong>
                          <p>@{account.username} · {account.role}</p>
                          <small>Создан: {account.created_at}{account.telegram_id ? ` · TG: ${account.telegram_id}` : ''}</small>
                        </div>
                        <div className="admin-actions">
                          <button type="button" onClick={() => startEditingAccount(account)}>
                            Редактировать
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              </section>
            ) : null}
          </div>
        </div>
      ) : (
        <section className="card">
          <p>{loading ? 'Загружаем админ-данные...' : 'Панель пока недоступна.'}</p>
        </section>
      )}
    </>
  );
}

function BookingRow({
  booking,
  onConfirm,
  onReject,
  compact = false
}: {
  booking: BookingEntry;
  onConfirm: () => void;
  onReject: () => void;
  compact?: boolean;
}) {
  return (
    <article className={`admin-row ${compact ? 'compact' : ''}`}>
      <div>
        <strong>#{booking.id} {booking.name || 'Гость'}</strong>
        <p>{booking.date || '—'} {booking.time || ''} · {booking.table_code || 'без стола'} · {booking.guests || 0} гостей</p>
        <small>{booking.comment || 'Без комментария'} · {booking.status}</small>
      </div>
      <div className="admin-actions">
        <button type="button" onClick={onConfirm}>
          Подтвердить
        </button>
        <button type="button" onClick={onReject}>
          Отклонить
        </button>
      </div>
    </article>
  );
}

function TableRow({
  table,
  onSetAvailable,
  onSetReserved,
  onSavePhoto,
  compact = false
}: {
  table: BookingTable;
  onSetAvailable: () => void;
  onSetReserved: () => void;
  onSavePhoto: (photo: string) => void;
  compact?: boolean;
}) {
  const [photo, setPhoto] = useState(table.photo || '');

  useEffect(() => {
    setPhoto(table.photo || '');
  }, [table.photo]);

  return (
    <article className={`admin-row ${compact ? 'compact' : ''}`}>
      <div>
        <strong>{table.label}</strong>
        <p>{table.seats} мест · {table.status}</p>
        <small>{table.reserved_until ? `Удержание до ${table.reserved_until}` : 'Без таймера'}</small>
        <div className="admin-inline-form">
          <input
            value={photo}
            onChange={(event) => setPhoto(event.target.value)}
            placeholder="URL фото стола"
          />
          <button type="button" onClick={() => onSavePhoto(photo)}>
            Сохранить фото
          </button>
        </div>
      </div>
      <div className="admin-actions">
        <button type="button" onClick={onSetAvailable}>
          Свободен
        </button>
        <button type="button" onClick={onSetReserved}>
          Занят
        </button>
      </div>
    </article>
  );
}

export default AdminPage;
