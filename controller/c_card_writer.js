const axios = require('axios');
const crypto = require('crypto');
const CardWriterModel = require('../models/cardWriterModel');

class CardWriterController {
  static async getCardWriterPage(req, res) {
    res.render('integration/card_writer', {
      title: 'Card Writer Integration',
      subTitle: 'Encoder Connection',
      activePage: 'card_writer',
      user: req.user,
    });
  }

  static async getCardWriterConfig(req, res) {
    try {
      const config = await CardWriterModel.getConfig();
      res.json({ success: true, data: config });
    } catch (error) {
      console.error('CardWriterController.getCardWriterConfig', error);
      res
        .status(500)
        .json({ success: false, message: 'Failed to load card writer configuration' });
    }
  }

  static async saveCardWriterConfig(req, res) {
    try {
      const { platformUrl, deviceSeq, callbackUrl } = req.body;
      if (!platformUrl) {
        return res.status(400).json({ success: false, message: 'Platform URL is required' });
      }

      const existing = await CardWriterModel.getConfig();

      const payload = {
        platform_url: platformUrl.trim(),
        device_seq: deviceSeq ? deviceSeq.trim() : null,
        callback_url: callbackUrl ? callbackUrl.trim() : null,
        username: existing?.username || null,
        password_hash: existing?.password_hash || null,
        updated_by: req.user?.userId || null,
      };

      const config = await CardWriterModel.upsertConfig(payload);
      res.json({ success: true, data: config });
    } catch (error) {
      console.error('CardWriterController.saveCardWriterConfig', error);
      res.status(500).json({ success: false, message: 'Failed to save card writer configuration' });
    }
  }

  static async saveCredentials(req, res) {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Username and password are required' });
      }

      const config = await CardWriterModel.getConfig();
      if (!config) {
        return res
          .status(400)
          .json({ success: false, message: 'Please save the card writer configuration first' });
      }

      const passwordHash = CardWriterController.hashPassword(password.trim());
      const updated = await CardWriterModel.updateCredentials(
        config.id,
        username.trim(),
        passwordHash,
        req.user?.userId || null
      );

      if (!updated) {
        return res.status(500).json({ success: false, message: 'Failed to save credentials' });
      }

      const refreshed = await CardWriterModel.getConfig();
      res.json({ success: true, data: refreshed });
    } catch (error) {
      console.error('CardWriterController.saveCredentials', error);
      res.status(500).json({ success: false, message: 'Failed to store credentials' });
    }
  }

  static async testConnection(req, res) {
    try {
      const config = await CardWriterModel.getConfig();
      if (!config) {
        return res
          .status(400)
          .json({ success: false, message: 'Please save the card writer configuration first' });
      }

      const result = await CardWriterController.platformLoginRequest(config);
      await CardWriterModel.recordConnection(
        config.id,
        result.success ? result.tokenId : null,
        result.expiresAt,
        result.success ? 'Connection successful' : result.reason,
        result.success
      );

      res.json({
        success: result.success,
        message: result.success ? 'Connected to card writer cloud successfully' : result.reason,
        data: result.data,
      });
    } catch (error) {
      console.error('CardWriterController.testConnection', error);
      try {
        const config = await CardWriterModel.getConfig();
        await CardWriterModel.recordConnection(config?.id || null, null, null, error.message, false);
      } catch (recordError) {
        console.error('CardWriterController.testConnection recordConnection failed', recordError);
      }
      res.status(500).json({
        success: false,
        message: 'Failed to reach the card writer cloud',
        detail: error.message,
      });
    }
  }

  static async registerCard(req, res) {
    try {
      const { bookingId, roomId, cardUid } = req.body;
      if (!bookingId || !cardUid) {
        return res.status(400).json({ success: false, message: 'Booking ID and Card UID are required' });
      }

      const config = await CardWriterModel.getConfig();
      if (!config) {
        return res.status(400).json({ success: false, message: 'Card writer configuration not found' });
      }

      if (CardWriterController.shouldRefreshToken(config)) {
        const refreshResult = await CardWriterController.platformLoginRequest(config);
        if (refreshResult.success) {
          await CardWriterModel.recordConnection(
            config.id,
            refreshResult.tokenId,
            refreshResult.expiresAt,
            'Token auto-renewed during registration',
            true
          );
          config.last_token = refreshResult.tokenId;
        } else {
          return res
            .status(400)
            .json({ success: false, message: 'Failed to refresh token: ' + refreshResult.reason });
        }
      }

      const BookingModel = require('../models/bookingModel');
      const booking = await BookingModel.getBookingById(bookingId);
      if (!booking) {
        return res.status(404).json({ success: false, message: 'Booking not found' });
      }

      let decimalUid = '';
      const match = cardUid.match(/\(([^)]+)\)/);
      if (match) {
        decimalUid = match[1];
      } else if (/^[0-9A-Fa-f]{8}$/.test(cardUid.trim())) {
        decimalUid = parseInt(cardUid.trim(), 16).toString();
      } else {
        decimalUid = cardUid.replace(/[^0-9]/g, '');
      }

      decimalUid = decimalUid.trim();
      if (decimalUid.length > 0 && decimalUid.length < 10) {
        decimalUid = decimalUid.padStart(10, '0');
      }

      const md5Hash = crypto.createHash('md5').update(config.last_token).digest('hex').toUpperCase();
      const aesKey = md5Hash.substring(8, 24);
      const cipher = crypto.createCipheriv('aes-128-cbc', aesKey, aesKey);
      let encrypted = cipher.update(decimalUid, 'utf8', 'base64');
      encrypted += cipher.final('base64');

      const wisRoomId = 'pbkx5ziaIPs=';

      const beginTime = Math.floor(new Date(booking.CHECK_IN_DATE).getTime() / 1000);
      const endTime = Math.floor(new Date(booking.CHECK_OUT_DATE).getTime() / 1000);

      const payload = {
        method: 'apartmentAddCardKey',
        tokenId: config.last_token,
        data: {
          roomId: wisRoomId,
          phoneNo: '18925008157',
          beginTime: beginTime,
          endTime: endTime,
          cardNum: encrypted,
          addType: 1,
          lockKeyId: 11,
        },
      };

      console.log('--- WISAPARTMENT API REQUEST ---');
      console.log('Payload:', JSON.stringify(payload, null, 2));

      const { data } = await axios.post(config.platform_url, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000,
      });

      console.log('Response:', JSON.stringify(data, null, 2));
      console.log('--- END OF REQUEST ---');

      if (data.resultCode === 0) {
        res.json({ success: true, message: 'Card registered successfully!', data: data.data });
      } else {
        res.status(400).json({ success: false, message: 'API Error: ' + data.reason, code: data.resultCode });
      }
    } catch (error) {
      console.error('CardWriterController.registerCard', error);
      res.status(500).json({ success: false, message: 'Internal server error', detail: error.message });
    }
  }

  static async readCard(req, res) {
    try {
      const config = await CardWriterModel.getConfig();
      if (!config) return res.status(400).json({ success: false, message: 'Card writer configuration not found' });
      if (!config.device_seq) return res.status(400).json({ success: false, message: 'Device S/N is not configured' });

      if (CardWriterController.shouldRefreshToken(config)) {
        const refreshResult = await CardWriterController.platformLoginRequest(config);
        if (refreshResult.success) {
          await CardWriterModel.recordConnection(
            config.id,
            refreshResult.tokenId,
            refreshResult.expiresAt,
            'Token auto-renewed during read',
            true
          );
          config.last_token = refreshResult.tokenId;
        }
      }

      const payload = {
        method: 'apartmentReadCardNo',
        tokenId: config.last_token,
        data: { deviceSeq: config.device_seq },
      };

      const { data } = await axios.post(config.platform_url, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000,
      });

      if (data.resultCode === 0) {
        let cardNo = data.data.cardNo || '';
        let decimalValue = '';
        const match = cardNo.match(/\(([^)]+)\)/);
        if (match) {
          decimalValue = match[1];
        } else if (/^[0-9A-Fa-f]{8}$/.test(cardNo.trim())) {
          decimalValue = parseInt(cardNo.trim(), 16).toString();
        } else {
          decimalValue = cardNo;
        }
        res.json({ success: true, cardNo: decimalValue, message: 'Card read successfully' });
      } else {
        res.status(400).json({ success: false, message: 'Encoder Error: ' + data.reason, code: data.resultCode });
      }
    } catch (error) {
      console.error('CardWriterController.readCard', error);
      res.status(500).json({ success: false, message: 'Failed to communicate with encoder', detail: error.message });
    }
  }

  static hashPassword(password) {
    return crypto.createHash('md5').update(password, 'utf8').digest('hex').toUpperCase();
  }

  static shouldRefreshToken(config) {
    if (!config || !config.token_expires_at) return true;
    const expiresAt = new Date(config.token_expires_at);
    if (Number.isNaN(expiresAt.getTime())) return true;
    const msLeft = expiresAt.getTime() - Date.now();
    const refreshThreshold = 2 * 24 * 60 * 60 * 1000;
    return msLeft <= refreshThreshold;
  }

  static async platformLoginRequest(config) {
    if (!config.username || !config.password_hash) {
      throw new Error('Credentials required for apartmentLogin');
    }
    const payload = {
      method: 'apartmentLogin',
      data: { accountName: config.username, password: config.password_hash },
    };
    const { data } = await axios.post(config.platform_url, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
    });
    const resultCode = data?.resultCode;
    const reason = data?.reason || 'No details provided';
    const tokenId = data?.data?.tokenId;
    const expireSeconds = data?.data?.expireTime;
    let expiresAt = null;
    if (tokenId && expireSeconds) {
      const ttl = Number(expireSeconds);
      if (!Number.isNaN(ttl)) {
        expiresAt = new Date(Date.now() + ttl * 1000);
      }
    }
    return { success: resultCode === 0 && Boolean(tokenId), reason, tokenId, expiresAt, data };
  }

  static async renewToken(req, res) {
    try {
      const config = await CardWriterModel.getConfig();
      if (!config) return res.status(400).json({ success: false, message: 'Please save configuration first' });
      if (!CardWriterController.shouldRefreshToken(config)) return res.json({ success: true, data: config, renewed: false });
      const result = await CardWriterController.platformLoginRequest(config);
      await CardWriterModel.recordConnection(
        config.id,
        result.success ? result.tokenId : null,
        result.expiresAt,
        result.success ? 'Token auto-renewed' : result.reason,
        result.success
      );
      if (!result.success) return res.status(400).json({ success: false, message: 'Auto-renew failed: ' + result.reason });
      const updated = await CardWriterModel.getConfig();
      res.json({ success: true, data: updated, renewed: true });
    } catch (error) {
      console.error('CardWriterController.renewToken', error);
      res.status(500).json({ success: false, message: 'Failed to refresh token', detail: error.message });
    }
  }
}

module.exports = CardWriterController;

