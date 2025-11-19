const axios = require('axios');
const querystring = require('querystring');

class KakaoTalkService {
    constructor(accessToken, refreshToken = null, restApiKey = null) {
        this.accessToken = accessToken;
        this.refreshToken = refreshToken;
        this.restApiKey = restApiKey;
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

    /**
     * Refresh access token using refresh token
     * @returns {Promise<{success: boolean, accessToken?: string, refreshToken?: string, message?: string}>}
     */
    async refreshAccessToken() {
        try {
            if (!this.refreshToken || this.refreshToken.trim() === '') {
                return {
                    success: false,
                    message: 'Refresh token is required. Please re-authenticate.'
                };
            }

            if (!this.restApiKey || this.restApiKey.trim() === '') {
                return {
                    success: false,
                    message: 'REST API Key is required for token refresh.'
                };
            }

            const tokenParams = querystring.stringify({
                grant_type: 'refresh_token',
                client_id: this.restApiKey,
                refresh_token: this.refreshToken
            });

            const response = await axios.post(
                'https://kauth.kakao.com/oauth/token',
                tokenParams,
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8'
                    }
                }
            );

            const { access_token, refresh_token } = response.data;

            // Update tokens
            this.accessToken = access_token;
            if (refresh_token) {
                this.refreshToken = refresh_token; // New refresh token (optional, may not be returned)
            }

            return {
                success: true,
                accessToken: access_token,
                refreshToken: refresh_token || this.refreshToken
            };
        } catch (error) {
            console.error('Error refreshing KakaoTalk token:', {
                message: error.message,
                status: error.response?.status,
                data: error.response?.data
            });

            return {
                success: false,
                message: error.response?.data?.error_description || error.response?.data?.msg || error.message || 'Failed to refresh token'
            };
        }
    }

    /**
     * Send message with automatic token refresh on expiration
     */
    async sendMessageToSelfWithRefresh(message, options = {}) {
        // Try sending message first
        let result = await this.sendMessageToSelf(message, options);

        // If token expired (401), try to refresh and retry
        if (!result.success && result.message && (
            result.message.includes('this access token does not exist') ||
            result.message.includes('expired') ||
            result.message.includes('invalid')
        )) {
            console.log('Access token expired, attempting to refresh...');
            const refreshResult = await this.refreshAccessToken();

            if (refreshResult.success) {
                // Retry sending message with new token
                result = await this.sendMessageToSelf(message, options);
                
                // Return refresh info if successful
                if (result.success) {
                    return {
                        ...result,
                        tokenRefreshed: true,
                        newAccessToken: refreshResult.accessToken,
                        newRefreshToken: refreshResult.refreshToken
                    };
                }
            } else {
                return {
                    success: false,
                    message: `Token expired and refresh failed: ${refreshResult.message}. Please re-authenticate.`
                };
            }
        }

        return result;
    }
}

module.exports = KakaoTalkService;

