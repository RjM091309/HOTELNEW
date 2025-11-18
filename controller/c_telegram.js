const TelegramModel = require('../models/telegramModel');
const TelegramService = require('../services/telegramService');
const DailySettlementService = require('../services/dailySettlementService');

class TelegramController {
    
    static async getTelegramSettingsPage(req, res) {
        try {
            res.render('telegram/settings', {
                title: 'Telegram Settings',
                subTitle: 'Telegram Bot Configuration',
                activePage: 'telegram_settings',
                user: req.user
            });
        } catch (error) {
            console.error('Error rendering Telegram settings page:', error);
            res.status(500).render('error/500', {
                title: 'Server Error',
                subTitle: '500 Error'
            });
        }
    }

    static async getBotConfig(req, res) {
        try {
            const config = await TelegramModel.getBotConfig();
            if (!config) {
                return res.json({ success: true, data: null, message: 'No Telegram bot configured' });
            }
            // For settings page, send full token (it's a secure page)
            // For API calls, we can mask it if needed
            res.json({ success: true, data: config });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Failed to fetch Telegram bot config' });
        }
    }

    static async saveBotConfig(req, res) {
        try {
            const { botToken, chatId } = req.body;
            
            if (!botToken) {
                return res.status(400).json({ success: false, message: 'Bot token is required' });
            }

            // Test the bot token first
            const telegramService = new TelegramService(botToken);
            const testResult = await telegramService.testConnection();
            
            if (!testResult.success) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Invalid bot token: ' + testResult.message 
                });
            }

            // Get bot info
            const botInfo = testResult.data;
            const botFirstName = botInfo.first_name || '';
            const botUsername = botInfo.username || '';
            
            // Save both name and username in format: "Name (username)" or just "Name" if no username
            let botName = botFirstName;
            if (botUsername) {
                botName = botFirstName ? `${botFirstName} (@${botUsername})` : `@${botUsername}`;
            }
            if (!botName) {
                botName = 'Telegram Bot';
            }

            // Save to database
            await TelegramModel.saveBotConfig(
                botToken,
                botName,
                chatId || null,
                req.user?.userId || null
            );

            res.json({ 
                success: true, 
                message: 'Telegram bot configured successfully',
                data: {
                    botName: botName,
                    botId: botInfo.id,
                    username: botInfo.username,
                    chatId: chatId || null
                }
            });
        } catch (error) {
            console.error('Error saving Telegram bot config:', error);
            res.status(500).json({ 
                success: false, 
                message: error.message || 'Failed to save Telegram bot config' 
            });
        }
    }

    static async testBot(req, res) {
        try {
            const config = await TelegramModel.getBotConfig();
            
            if (!config || !config.BOT_TOKEN) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Telegram bot not configured' 
                });
            }

            const telegramService = new TelegramService(config.BOT_TOKEN);
            const result = await telegramService.testConnection();
            
            if (result.success) {
                res.json({ 
                    success: true, 
                    message: 'Bot connection successful',
                    data: result.data
                });
            } else {
                res.status(400).json({ 
                    success: false, 
                    message: 'Bot connection failed: ' + result.message 
                });
            }
        } catch (error) {
            console.error('Error testing Telegram bot:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Failed to test Telegram bot: ' + (error.message || 'Unknown error')
            });
        }
    }

    static async sendMessage(req, res) {
        try {
            const { chatId, message } = req.body;
            
            if (!chatId || !message) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Chat ID and message are required' 
                });
            }

            const config = await TelegramModel.getBotConfig();
            
            if (!config || !config.BOT_TOKEN) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Telegram bot not configured' 
                });
            }

            const telegramService = new TelegramService(config.BOT_TOKEN);
            const result = await telegramService.sendMessage(chatId, message);
            
            if (result.success) {
                res.json({ 
                    success: true, 
                    message: 'Message sent successfully',
                    data: result.data
                });
            } else {
                res.status(400).json({ 
                    success: false, 
                    message: 'Failed to send message: ' + result.message 
                });
            }
        } catch (error) {
            console.error('Error sending Telegram message:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Failed to send Telegram message: ' + (error.message || 'Unknown error')
            });
        }
    }

    static async getWebhookInfo(req, res) {
        try {
            const config = await TelegramModel.getBotConfig();
            
            if (!config || !config.BOT_TOKEN) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Telegram bot not configured' 
                });
            }

            const telegramService = new TelegramService(config.BOT_TOKEN);
            const result = await telegramService.getWebhookInfo();
            
            res.json({ 
                success: result.success, 
                data: result.data,
                message: result.success ? 'Webhook info retrieved' : result.message
            });
        } catch (error) {
            res.status(500).json({ 
                success: false, 
                message: 'Failed to get webhook info' 
            });
        }
    }

    static async setWebhook(req, res) {
        try {
            const { webhookUrl } = req.body;
            
            if (!webhookUrl) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Webhook URL is required' 
                });
            }

            const config = await TelegramModel.getBotConfig();
            
            if (!config || !config.BOT_TOKEN) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Telegram bot not configured' 
                });
            }

            const telegramService = new TelegramService(config.BOT_TOKEN);
            const result = await telegramService.setWebhook(webhookUrl);
            
            // Webhook is set via Telegram API, no need to save in database

            res.json({ 
                success: result.success, 
                message: result.success ? 'Webhook set successfully' : result.message,
                data: result.data
            });
        } catch (error) {
            res.status(500).json({ 
                success: false, 
                message: 'Failed to set webhook' 
            });
        }
    }

    static async deleteWebhook(req, res) {
        try {
            const config = await TelegramModel.getBotConfig();
            
            if (!config || !config.BOT_TOKEN) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Telegram bot not configured' 
                });
            }

            const telegramService = new TelegramService(config.BOT_TOKEN);
            const result = await telegramService.deleteWebhook();
            
            // Webhook deleted via Telegram API, no need to update database

            res.json({ 
                success: result.success, 
                message: result.success ? 'Webhook deleted successfully' : result.message
            });
        } catch (error) {
            res.status(500).json({ 
                success: false, 
                message: 'Failed to delete webhook' 
            });
        }
    }

    static async deleteBotConfig(req, res) {
        try {
            const deleted = await TelegramModel.deleteBotConfig(req.user?.userId || null);
            
            if (deleted) {
                res.json({ success: true, message: 'Telegram bot configuration deleted' });
            } else {
                res.status(404).json({ success: false, message: 'No configuration found to delete' });
            }
        } catch (error) {
            res.status(500).json({ success: false, message: 'Failed to delete configuration' });
        }
    }

    // Webhook Handler Methods
    static async handleWebhook(req, res) {
        try {
            const update = req.body;

            // Send 200 OK immediately to acknowledge receipt
            res.status(200).json({ ok: true });

            // Process the update asynchronously
            processTelegramUpdate(update).catch(error => {
                console.error('Error processing Telegram update:', error);
            });
        } catch (error) {
            console.error('Error handling Telegram webhook:', error);
            res.status(200).json({ ok: true }); // Always return 200 to Telegram
        }
    }

    static async processUpdate(update) {
        try {
            // Get bot configuration
            const config = await TelegramModel.getBotConfig();
            if (!config || !config.BOT_TOKEN) {
                console.error('Telegram bot not configured');
                return;
            }

            const telegramService = new TelegramService(config.BOT_TOKEN);

            // Handle different types of updates
            if (update.message) {
                await this.handleMessage(update.message, telegramService);
            } else if (update.callback_query) {
                await this.handleCallbackQuery(update.callback_query, telegramService);
            } else if (update.edited_message) {
                await this.handleEditedMessage(update.edited_message, telegramService);
            }
            // Add more update types as needed

        } catch (error) {
            console.error('Error processing update:', error);
        }
    }

    static async handleMessage(message, telegramService) {
        const chatId = message.chat.id;
        const text = message.text || '';
        const username = message.from?.username || 'Unknown';

        console.log(`Received message from ${username} (${chatId}): ${text}`);

        // Example: Handle /start command
        if (text.startsWith('/start')) {
            await telegramService.sendMessage(
                chatId,
                'Welcome to Hotel Management Bot! 🏨\n\n' +
                'Available commands:\n' +
                '/help - Show help message\n' +
                '/status - Check bot status'
            );
        }
        // Example: Handle /help command
        else if (text.startsWith('/help')) {
            await telegramService.sendMessage(
                chatId,
                'Hotel Management Bot Commands:\n\n' +
                '/start - Start the bot\n' +
                '/help - Show this help message\n' +
                '/status - Check bot status'
            );
        }
        // Example: Handle /status command
        else if (text.startsWith('/status')) {
            const botInfo = await telegramService.getMe();
            if (botInfo.success) {
                await telegramService.sendMessage(
                    chatId,
                    `Bot Status: ✅ Active\n` +
                    `Bot Name: ${botInfo.data.first_name}\n` +
                    `Username: @${botInfo.data.username}\n` +
                    `Bot ID: ${botInfo.data.id}`
                );
            }
        }
        // Handle other messages
        else if (text.trim()) {
            // Echo the message back (you can customize this)
            await telegramService.sendMessage(
                chatId,
                `You said: ${text}\n\nType /help for available commands.`
            );
        }
    }

    static async handleCallbackQuery(callbackQuery, telegramService) {
        const chatId = callbackQuery.message.chat.id;
        const data = callbackQuery.data;
        const queryId = callbackQuery.id;

        console.log(`Received callback query: ${data}`);

        // Answer the callback query to remove loading state
        await telegramService.sendMessage(chatId, `You selected: ${data}`);

        // You can add more callback query handling logic here
    }

    static async handleEditedMessage(message, telegramService) {
        const chatId = message.chat.id;
        console.log(`Message edited in chat ${chatId}`);
        // Add your logic for handling edited messages
    }

    // Daily Settlement Methods
    static async getDailySettlementPage(req, res) {
        try {
            res.render('telegram/settlement', {
                title: 'Daily Settlement',
                subTitle: 'Daily Settlement Report',
                activePage: 'daily_settlement',
                user: req.user
            });
        } catch (error) {
            console.error('Error rendering daily settlement page:', error);
            res.status(500).render('error/500', {
                title: 'Server Error',
                subTitle: '500 Error'
            });
        }
    }

    static async getDailySettlement(req, res) {
        try {
            const DailySettlementModel = require('../models/dailySettlementModel');
            const settlement = await DailySettlementModel.getDailySettlement();
            res.json({ success: true, data: settlement });
        } catch (error) {
            console.error('Error getting daily settlement:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Failed to get daily settlement: ' + (error.message || 'Unknown error')
            });
        }
    }

    static async sendDailySettlement(req, res) {
        try {
            // Get chatId from saved config
            const config = await TelegramModel.getBotConfig();
            
            if (!config || !config.CHAT_ID) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Chat ID not configured. Please save Chat ID in Telegram bot configuration first.' 
                });
            }

            // Get section from request body (booking, expected, availability, sales)
            const section = req.body?.section || null;

            const result = await DailySettlementService.sendReport(config.CHAT_ID, section);
            
            res.json({ 
                success: true, 
                message: 'Daily settlement report sent successfully',
                data: result.data
            });
        } catch (error) {
            console.error('Error sending daily settlement:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Failed to send daily settlement: ' + (error.message || 'Unknown error')
            });
        }
    }
}

// Helper function to process updates asynchronously
async function processTelegramUpdate(update) {
    await TelegramController.processUpdate(update);
}

module.exports = TelegramController;

