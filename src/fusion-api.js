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
      let endpoint = this.apiVersion === 'v4' ? '/api/v1/marketing/clients' : '/api/v2/clients';
      const response = await this.client.get(endpoint, {
        params: { search: cleanPhone }
      });

      const clients = this.apiVersion === 'v4' ? response.data?.data : response.data;

      if (Array.isArray(clients)) {
        return clients.find(c => {
          const p = c.phone || '';
          return p.replace(/\D/g, '') === cleanPhone;
        }) || null;
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
          first_name: data.first_name,
          last_name: data.last_name || '',
          phone: data.phone,
          gender: data.gender || 'male'
        });
        return response.data;
      } else {
        // v2 (v3 doc)
        // Note: id_group is required in v2. We might need to fetch groups first or use a default.
        // For now, we assume the user might provide a default group ID in env.
        const response = await this.client.post('/api/v2/clients', {
          name: data.first_name,
          lastname: data.last_name || '',
          phone: data.phone,
          gender: data.gender || 'male',
          id_group: process.env.FUSION_DEFAULT_GROUP_ID || 1
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
  async getClientDetails(clientId) {
    try {
      let endpoint = this.apiVersion === 'v4'
        ? `/api/v1/marketing/clients/${clientId}`
        : `/api/v2/clients/${clientId}`;

      const response = await this.client.get(endpoint);
      return response.data;
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
    return {
      id: client.id,
      full_name: this.apiVersion === 'v4'
        ? `${client.first_name || ''} ${client.last_name || ''}`.trim()
        : `${client.name || ''} ${client.lastname || ''}`.trim(),
      phone: client.phone,
      total_spent: client.total_buy_sum || client.sum_orders || 0, // sum_orders might be used in v2
      discount: client.discount || 0
    };
  }
}

module.exports = new FusionAPI();
