const DailySettlementModel = require('../models/dailySettlementModel');
const TelegramModel = require('../models/telegramModel');
const TelegramService = require('./telegramService');
const moment = require('moment');

class DailySettlementService {
    
    /**
     * Generate and format daily settlement report
     */
    static async generateReport() {
        try {
            const settlement = await DailySettlementModel.getDailySettlement();
            return this.formatReport(settlement);
        } catch (error) {
            console.error('Error generating daily settlement report:', error);
            throw error;
        }
    }
    
    /**
     * Format the report as text message for Telegram
     */
    static formatReport(settlement) {
        const { period, checkIns, checkOuts, pending, roomAvailability } = settlement;
        
        let report = `📊 *DAILY SETTLEMENT REPORT*\n\n`;
        report += `📅 *Period:*\n`;
        report += `${period.startFormatted} to ${period.endFormatted}\n\n`;
        
        // Check-Ins Section
        report += `✅ *CHECK-INS* : ${checkIns.count}\n`;
        report += `\n`;
        
        // Check-Outs Section
        report += `🚪 *CHECK-OUTS* : ${checkOuts.count}\n`;
        report += `\n`;
        
        // Pending Section
        report += `⏳ *PENDING* : ${pending.count}\n`;
        report += `\n`;

          // Expected Today
          report += `📋 *EXPECTED FOR TODAY*\n`;
          report += `Expected Check-Ins: ${roomAvailability.expectedCheckIns}\n`;
          report += `Expected Check-Outs: ${roomAvailability.expectedCheckOuts}\n\n`;
          
        
        // Room Availability Section
        report += `🏨 *EXPECTED ROOM AVAILABILITY FOR TODAY*\n`;
        report += `Total Rooms: ${roomAvailability.totalRooms}\n`;
        report += `✅ Available: ${roomAvailability.availableRooms}\n`;
        report += `🛏️ Occupied: ${roomAvailability.occupiedRooms}\n`;
        report += `🧹 Cleaning: ${roomAvailability.cleaningRooms}\n`;
        report += `🔧 Maintenance: ${roomAvailability.maintenanceRooms}\n`;
        report += `📈 Occupancy Rate: ${roomAvailability.occupancyRate}%\n\n`;
        
      
        report += `_Generated: ${moment().format('MMM DD, YYYY hh:mm A')}_`;
        
        return report;
    }
    
    /**
     * Send daily settlement report via Telegram
     * @param {string} chatId - Telegram chat ID to send to
     */
    static async sendReport(chatId = null) {
        try {
            // Get bot configuration
            const config = await TelegramModel.getBotConfig();
            
            if (!config || !config.BOT_TOKEN) {
                throw new Error('Telegram bot not configured');
            }
            
            // Generate report
            const report = await this.generateReport();
            
            // If chatId not provided, we need to get it from somewhere
            // For now, we'll require it as parameter
            if (!chatId) {
                throw new Error('Chat ID is required to send report');
            }
            
            // Send via Telegram
            const telegramService = new TelegramService(config.BOT_TOKEN);
            const result = await telegramService.sendMessage(chatId, report, {
                parse_mode: 'Markdown'
            });
            
            if (!result.success) {
                throw new Error(result.message || 'Failed to send report');
            }
            
            return {
                success: true,
                message: 'Daily settlement report sent successfully',
                data: result.data
            };
        } catch (error) {
            console.error('Error sending daily settlement report:', error);
            throw error;
        }
    }
}

module.exports = DailySettlementService;

