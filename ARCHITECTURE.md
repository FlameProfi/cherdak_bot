# Архитектура системы лояльности

## Общая схема
Система состоит из четырех основных компонентов:
1. **Telegram Bot (Telegraf):** Интерфейс взаимодействия с гостем.
2. **Fusion POS API Client:** Модуль для взаимодействия с внешним API Fusion POS.
3. **Webhook Server (Express):** Прием уведомлений от Fusion POS о закрытии чеков.
4. **Database (SQLite):** Хранение связок идентификаторов и кэширование данных.

## Компоненты

### 1. Telegram Bot
- Обработка команды `/start`.
- Получение и верификация контакта (`contact`).
- Генерация QR-кодов (библиотека `qrcode`).
- Отображение главного меню и информации о лояльности.
- Админ-панель для владельца.

### 2. API Client (src/fusion-api.js)
- Инкапсулирует запросы к `https://{domain}.fusionpos.ru/api/v1/`.
- Методы:
    - `findClientByPhone(phone)` - поиск клиента.
    - `createClient(data)` - регистрация нового гостя.
    - `getClientDetails(clientId)` - получение баланса и группы скидок.
    - `getLoyaltyLevels()` - получение настроек порогов.

### 3. Webhook Server (src/server.js)
- Endpoint: `POST /webhooks/fusionpos`.
- Обработка события `order.closed`.
- Извлечение `client_id` и суммы чека.
- Поиск `telegram_id` в БД.
- Отправка уведомления гостю через Bot Instance.

### 4. База данных
Таблица `users`:
- `telegram_id` (INTEGER, PK)
- `fusion_client_id` (INTEGER)
- `phone` (TEXT)
- `full_name` (TEXT)
- `total_spent` (REAL)
- `current_level` (TEXT)

## Поток данных (Data Flow)

### Регистрация:
1. Гость -> Поделиться контактом -> Bot.
2. Bot -> API Client (findClientByPhone).
3. API Client -> Fusion POS API.
4. Если не найден: Bot -> API Client (createClient).
5. Результат -> Сохранение в DB -> Bot (Главный экран).

### Начисление (Покупка):
1. Кальянщик закрывает чек во Fusion POS.
2. Fusion POS -> Webhook Server.
3. Webhook Server -> DB (найти telegram_id).
4. Webhook Server -> Bot (отправить сообщение гостю).
5. Bot -> Гость: "Спасибо за визит! Начислено... До следующего уровня..."
