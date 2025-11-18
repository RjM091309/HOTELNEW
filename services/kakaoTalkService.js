const axios = require('axios');
const querystring = require('querystring');

class KakaoTalkService {
    constructor(accessToken) {
        this.accessToken = accessToken;
        this.baseURL = 'https://kapi.kakao.com';
    }

    /**
     * Send message to yourself (내게 메시지 보내기)
     * @param {string} message - Message text to send
     * @param {object} options - Additional options (link, etc.)
     */
    async sendMessageToSelf(message, options = {}) {
        try {
            // Validate access token
            if (!this.accessToken || this.accessToken.trim() === '') {
                return {
                    success: false,
                    message: 'Access token is required. Please complete OAuth authentication first.'
                };
            }

            // Create template object
            const templateObject = {
                object_type: 'text',
                text: message || 'Hotel update',
                link: {
                    web_url: (options.link && options.link.web_url) || 'https://yourwebsite.com',
                    mobile_web_url: (options.link && options.link.mobile_web_url) || 'https://yourwebsite.com'
                }
            };

            if (options.link) {
                templateObject.link = {
                    ...templateObject.link,
                    ...options.link
                };
            }

            // Convert to JSON string
            const templateObjectJson = JSON.stringify(templateObject);

            // Create form data using querystring
            const formData = querystring.stringify({
                template_object: templateObjectJson
            });

            // Send request with axios
            const response = await axios.post(
                `${this.baseURL}/v2/api/talk/memo/default/send`,
                formData,
                {
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`,
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Content-Length': Buffer.byteLength(formData)
                    },
                    // Prevent axios from transforming the data
                    transformRequest: [(data) => {
                        // Data is already a string, return as-is
                        return data;
                    }]
                }
            );

            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            console.error('KakaoTalk error:', {
                message: error.message,
                status: error.response?.status,
                data: error.response?.data,
                requestData: error.config?.data ? error.config.data.substring(0, 200) : 'N/A'
            });
            
            return {
                success: false,
                message: error.response?.data?.msg || error.response?.data?.error_description || error.message || 'Unknown error'
            };
        }
    }

    /**
     * Get user information
     */
    async getUserInfo() {
        try {
            const response = await axios.get(
                `${this.baseURL}/v2/user/me`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`
                    }
                }
            );

            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            return {
                success: false,
                message: error.response?.data?.msg || error.response?.data?.error_description || error.message
            };
        }
    }

    /**
     * Check if access token is valid
     */
    async validateToken() {
        try {
            const result = await this.getUserInfo();
            return result.success;
        } catch (error) {
            return false;
        }
    }
}

module.exports = KakaoTalkService;

