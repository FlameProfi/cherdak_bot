const axios = require('axios');
require('dotenv').config();

class FusionAPI {
  constructor() {
    this.baseURL = process.env.FUSION_BASE_URL;
    this.apiKey = process.env.FUSION_API_KEY;
    this.apiVersion = process.env.FUSION_API_VERSION || 'v4'; // 'v2' or 'v4'

    // Default base URLs if not provided
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
    const cleanPhone = phone.replace(/\D/g, '');
    try {
      if (this.apiVersion === 'v4') {
        const response = await this.client.get('/api/v1/marketing/clients', {
          params: { search: cleanPhone }
        });
        const clients = response.data?.data;
        if (Array.isArray(clients)) {
          return clients.find(c => (c.phone || '').replace(/\D/g, '') === cleanPhone) || null;
        }
      } else {
        // v2 (v3 doc refers to /api/v1/client/by-phone or /api/v2/clients)
        // Trying by-phone first as it is more specific
        try {
          const response = await this.client.get('/api/v1/client/by-phone', {
            params: { phone: cleanPhone }
          });
          if (response.data?.success && response.data?.data) {
            return response.data.data;
          }
        } catch (e) {
          // Fallback to general search if by-phone is not available
          const response = await this.client.get('/api/v2/clients', {
            params: { search: cleanPhone }
          });
          const clients = Array.isArray(response.data) ? response.data : (response.data?.data?.items || []);
          return clients.find(c => (c.phone || '').replace(/\D/g, '') === cleanPhone) || null;
        }
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
    try {
      if (this.apiVersion === 'v4') {
        const response = await this.client.post('/api/v1/marketing/clients', {
          first_name: data.first_name || data.name,
          last_name: data.last_name || data.lastname || '',
          phone: data.phone,
          gender: data.gender || 'male'
        });
        return response.data?.data || response.data;
      } else {
        // v2 (v3 doc refers to /api/v1/client)
        // Note: id_group is often required in v2.
        try {
          const response = await this.client.post('/api/v1/client', {
            name: data.first_name || data.name,
            lastname: data.last_name || data.lastname || '',
            phone: data.phone,
            id_group: data.id_group || process.env.FUSION_DEFAULT_GROUP_ID || 1
          });
          return response.data?.data || response.data;
        } catch (e) {
          // Fallback to /api/v2/clients
          const response = await this.client.post('/api/v2/clients', {
            name: data.first_name || data.name,
            lastname: data.last_name || data.lastname || '',
            phone: data.phone,
            gender: data.gender || 'male',
            id_group: data.id_group || process.env.FUSION_DEFAULT_GROUP_ID || 1
          });
          return response.data;
        }
      }
    } catch (error) {
      console.error(`FusionAPI (${this.apiVersion}) createClient Error:`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Получение деталей клиента
   */
  async getClientDetails(clientId) {
    try {
      if (this.apiVersion === 'v4') {
        const response = await this.client.get(`/api/v1/marketing/clients/${clientId}`);
        return response.data?.data || response.data;
      } else {
        // v2 (v3 doc refers to /api/v1/client/{id})
        try {
          const response = await this.client.get(`/api/v1/client/${clientId}`);
          return response.data?.data || response.data;
        } catch (e) {
          // Fallback to /api/v2/clients/{id}
          const response = await this.client.get(`/api/v2/clients/${clientId}`);
          return response.data;
        }
      }
    } catch (error) {
      console.error(`FusionAPI (${this.apiVersion}) getClientDetails Error:`, error.response?.data || error.message);
      return null;
    }
  }

  /**
   * Нормализация данных клиента для бота
   */
  normalizeClient(client) {
    if (!client) return null;

    // Total spent extraction
    let totalSpent = 0;
    if (this.apiVersion === 'v4') {
      totalSpent = client.total_buy_sum || 0;
    } else {
      // In v2/v3, it might be in total_buy_sum or sum_orders
      totalSpent = client.total_buy_sum || client.sum_orders || 0;
    }

    // Discount extraction
    let discount = 0;
    if (client.discount !== undefined) {
      discount = client.discount;
    } else if (client.id_discount_type_value !== undefined) {
      discount = client.id_discount_type_value;
    }

    return {
      id: client.id,
      full_name: this.apiVersion === 'v4'
        ? `${client.first_name || client.name || ''} ${client.last_name || client.lastname || ''}`.trim()
        : `${client.name || client.first_name || ''} ${client.lastname || client.last_name || ''}`.trim(),
      phone: client.phone,
      total_spent: totalSpent,
      discount: discount
    };
  }
}

module.exports = new FusionAPI();
