const axios = require('axios');
require('dotenv').config();

function formatPhoneForFusion(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (!digits) return '';

  if (digits.length === 11 && digits.startsWith('8')) {
    return `+7${digits.slice(1)}`;
  }

  if (digits.length === 10 && digits.startsWith('9')) {
    return `+7${digits}`;
  }

  if (digits.length === 11 && digits.startsWith('7')) {
    return `+${digits}`;
  }

  return `+${digits}`;
}

class FusionAPI {
  constructor() {
    this.baseURL = process.env.FUSION_BASE_URL;
    this.apiKey = process.env.FUSION_API_KEY;
    // Принудительно выставляем v2, раз в v4 нет работы с клиентами
    this.apiVersion = 'v2'; 

    if (!this.baseURL) {
      const domain = process.env.FUSION_DOMAIN;
      this.baseURL = `https://${domain}.fusionpos.ru`;
    }

    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
  }

  /**
   * Поиск клиента по номеру телефона
   */
  async findClientByPhone(phone) {
    const cleanPhone = formatPhoneForFusion(phone);
    const phoneDigits = String(cleanPhone).replace(/\D/g, '');
    try {
      // Пробуем сначала точечный поиск по телефону
      try {
        const response = await this.client.get('/api/v1/client/by-phone', {
          params: { phone: cleanPhone }
        });
        if (response.data?.success && response.data?.data) {
          return response.data.data;
        }
      } catch (e) {
        // Если v1/client/by-phone недоступен, делаем поиск через v2/clients
        const response = await this.client.get('/api/v2/clients', {
          params: { search: cleanPhone }
        });
        const clients = Array.isArray(response.data) ? response.data : (response.data?.data?.items || []);
        return clients.find(c => String(c.phone || '').replace(/\D/g, '') === phoneDigits) || null;
      }
      return null;
    } catch (error) {
      console.error(`FusionAPI (${this.apiVersion}) findClientByPhone Error:`, error.response?.data || error.message);
      return null;
    }
  }

  /**
   * Создание нового клиента
   */
  async createClient(data) {
    const idNetwork = data.id_network !== undefined ? data.id_network : (Number(process.env.FUSION_NETWORK_ID) || 1);
    const phone = formatPhoneForFusion(data.phone);

    try {
      try {
        // Пробуем через v1/client
        const response = await this.client.post('/api/v1/client', {
          id_network: idNetwork,
          name: data.first_name || data.name,
          lastname: data.last_name || data.lastname || '',
          phone,
          id_group: data.id_group || process.env.FUSION_DEFAULT_GROUP_ID || 1
        });
        return response.data?.data || response.data;
      } catch (e) {
        // Если v1 упал, бьем в v2/clients (куда прилетал лог ошибки 422)
        const response = await this.client.post('/api/v2/clients', {
          id_network: idNetwork, // Передаем обязательный ID сети для прохождения валидации
          name: data.first_name || data.name,
          lastname: data.last_name || data.lastname || '',
          phone,
          gender: data.gender || 'male',
          id_group: data.id_group || process.env.FUSION_DEFAULT_GROUP_ID || 1
        });
        return response.data;
      }
    } catch (error) {
      console.error(`FusionAPI (${this.apiVersion}) createClient Error:`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Получение деталей клиента
   */
  /**
   * Получение деталей клиента по ID
   */
  async getClientDetails(clientId) {
    // На всякий случай проверяем, что ID передан и это число
    const id = Number(clientId);
    if (!id || isNaN(id)) {
      console.error(`FusionAPI getClientDetails Error: Невалидный clientId: ${clientId}`);
      return null;
    }

    // Попытка №1: Пробуем старый эндпоинт v1
    try {
      console.log(`[FusionAPI] Попытка получить клиента через v1 (ID: ${id})...`);
      const response = await this.client.get(`/api/v1/client/${id}`);
      console.log(`[FusionAPI] Ответ от v1:`, response.data);
      // Если данные пришли, возвращаем их
      if (response.data) {
        return response.data?.data || response.data;
      }
    } catch (v1Error) {
      console.warn(`[FusionAPI] Сбой запроса к v1: ${v1Error.response?.status || v1Error.message}. Пробуем эндпоинт v2...`);
    }

    // Попытка №2: Если v1 упал, пробуем эндпоинт v2
    try {
      const response = await this.client.get(`/api/v2/clients/${id}`);
      return response.data?.data || response.data;
    } catch (v2Error) {
      // Если упали оба эндпоинта, выводим подробный лог финальной ошибки
      console.error(
        `[FusionAPI] Финальная ошибка getClientDetails для ID ${id}:`, 
        v2Error.response?.data || v2Error.message
      );
      return null;
    }
  }

  /**
   * Нормализация данных клиента для бота
   */
  normalizeClient(client) {
    if (!client) return null;

    // Вытаскиваем сумму из total_money_spent, total_buy_sum или sum_orders
    // и принудительно переводим в число через Number()
    const totalSpent = Number(client.total_money_spent || client.total_buy_sum || client.sum_orders || 0);
    
    let discount = 0;
    if (client.discount !== undefined) {
      discount = client.discount;
    } else if (client.id_discount_type_value !== undefined) {
      discount = client.id_discount_type_value;
    }

    return {
      id: client.id,
      full_name: `${client.name || client.first_name || ''} ${client.lastname || client.last_name || ''}`.trim(),
      phone: client.phone,
      total_spent: totalSpent, // Теперь здесь всегда будет число, например: 450000
      discount: discount
    };
  }
}

const fusionAPI = new FusionAPI();
fusionAPI.formatPhoneForFusion = formatPhoneForFusion;
module.exports = fusionAPI;
