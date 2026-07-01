const axios = require('axios');
require('dotenv').config();

class FusionAPI {
  constructor() {
    this.baseURL = process.env.FUSION_BASE_URL || `https://${process.env.FUSION_DOMAIN}.fusionpos.ru/api/v1`;
    this.apiKey = process.env.FUSION_API_KEY;
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
  }

  async findClientByPhone(phone) {
    try {
      const cleanPhone = phone.replace(/\D/g, '');
      const response = await this.client.get('/marketing/clients', {
        params: { search: cleanPhone }
      });
      if (response.data && response.data.data) {
        return response.data.data.find(c => c.phone.replace(/\D/g, '') === cleanPhone) || null;
      }
      return null;
    } catch (error) {
      console.error('FusionAPI findClientByPhone Error:', error.response?.data || error.message);
      return null;
    }
  }

  async createClient(data) {
    try {
      const response = await this.client.post('/marketing/clients', {
        first_name: data.first_name,
        last_name: data.last_name || '',
        phone: data.phone,
        gender: data.gender || 'male'
      });
      return response.data;
    } catch (error) {
      console.error('FusionAPI createClient Error:', error.response?.data || error.message);
      throw error;
    }
  }

  async getClientDetails(clientId) {
    try {
      const response = await this.client.get(`/marketing/clients/${clientId}`);
      return response.data;
    } catch (error) {
      console.error('FusionAPI getClientDetails Error:', error.response?.data || error.message);
      return null;
    }
  }
}

module.exports = new FusionAPI();
