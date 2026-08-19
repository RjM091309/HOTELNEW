const axios = require('axios');

class ChannexService {
    constructor(apiKey, baseURL) {
        this.apiKey = apiKey;
        this.baseURL = baseURL || 'https://staging.channex.io/api/v1';
    }

    get headers() {
        return {
            'user-api-key': this.apiKey,
            'Content-Type': 'application/vnd.api+json'
        };
    }

    /**
     * Verify the API key works by listing properties visible to it
     */
    async testConnection() {
        return this.listProperties();
    }

    async listProperties() {
        try {
            const response = await axios.get(`${this.baseURL}/properties`, {
                headers: this.headers
            });
            return { success: true, data: response.data.data };
        } catch (error) {
            return {
                success: false,
                message: error.response?.data?.errors?.[0]?.detail || error.response?.data || error.message
            };
        }
    }

    async listRoomTypes(propertyId) {
        try {
            const response = await axios.get(`${this.baseURL}/room_types`, {
                headers: this.headers,
                params: { 'filter[property_id]': propertyId }
            });
            return { success: true, data: response.data.data };
        } catch (error) {
            return {
                success: false,
                message: error.response?.data?.errors?.[0]?.detail || error.response?.data || error.message
            };
        }
    }

    /**
     * Create a room type on Channex
     * @param {string} propertyId
     * @param {object} attrs - { title, count_of_rooms, occ_adults }
     */
    async createRoomType(propertyId, attrs) {
        try {
            const response = await axios.post(`${this.baseURL}/room_types`, {
                room_type: {
                    property_id: propertyId,
                    occ_adults: 2,
                    occ_children: 0,
                    occ_infants: 0,
                    ...attrs
                }
            }, { headers: this.headers });
            return { success: true, data: response.data.data };
        } catch (error) {
            return {
                success: false,
                message: error.response?.data?.errors?.[0]?.detail || error.response?.data || error.message
            };
        }
    }

    /**
     * Update an existing Channex room type
     * @param {string} channexRoomTypeId
     * @param {object} attrs - { title, count_of_rooms }
     */
    async updateRoomType(channexRoomTypeId, attrs) {
        try {
            const response = await axios.put(`${this.baseURL}/room_types/${channexRoomTypeId}`, {
                room_type: attrs
            }, { headers: this.headers });
            return { success: true, data: response.data.data };
        } catch (error) {
            return {
                success: false,
                message: error.response?.data?.errors?.[0]?.detail || error.response?.data || error.message
            };
        }
    }
}

module.exports = ChannexService;
