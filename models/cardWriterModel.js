const { queryDatabasePromise } = require('../config/database');

class CardWriterModel {
  static async ensureTable() {
    const query = `
      CREATE TABLE IF NOT EXISTS card_writer_config (
        id INT NOT NULL AUTO_INCREMENT,
        device_seq VARCHAR(64) NULL,
        platform_url VARCHAR(512) NOT NULL,
        callback_url VARCHAR(512) NULL,
        username VARCHAR(128) NULL,
        password_hash VARCHAR(64) NULL,
        last_token VARCHAR(512) NULL,
        token_expires_at DATETIME NULL,
        last_connection_message TEXT NULL,
        last_connection_success TINYINT(1) NULL,
        last_connection_at DATETIME NULL,
        created_by INT NULL,
        updated_by INT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_card_writer_config_updated_at (updated_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;
    await queryDatabasePromise(query);
  }

  static async getConfig() {
    await this.ensureTable();
    const query = `
      SELECT 
        id,
        device_seq,
        platform_url,
        callback_url,
        username,
        password_hash,
        last_token,
        token_expires_at,
        last_connection_message,
        last_connection_success,
        last_connection_at,
        created_at,
        updated_at
      FROM card_writer_config
      ORDER BY id DESC
      LIMIT 1
    `;
    const rows = await queryDatabasePromise(query);
    return rows[0] || null;
  }

  static async createConfig(payload) {
    await this.ensureTable();
    const query = `
      INSERT INTO card_writer_config
        (device_seq, platform_url, callback_url, username, password_hash, created_by, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    await queryDatabasePromise(query, [
      payload.device_seq,
      payload.platform_url,
      payload.callback_url,
      payload.username || null,
      payload.password_hash || null,
      payload.updated_by,
      payload.updated_by,
    ]);
    return this.getConfig();
  }

  static async updateConfig(configId, payload) {
    await this.ensureTable();
    const query = `
      UPDATE card_writer_config
      SET
        device_seq = ?,
        platform_url = ?,
        callback_url = ?,
        username = ?,
        password_hash = ?,
        updated_by = ?,
        updated_at = NOW()
      WHERE id = ?
    `;
    await queryDatabasePromise(query, [
      payload.device_seq,
      payload.platform_url,
      payload.callback_url,
      payload.username || null,
      payload.password_hash || null,
      payload.updated_by,
      configId,
    ]);
    return this.getConfig();
  }

  static async upsertConfig(payload) {
    await this.ensureTable();
    const existing = await this.getConfig();
    if (existing) {
      return this.updateConfig(existing.id, payload);
    }
    return this.createConfig(payload);
  }

  static async recordConnection(configId, tokenId, expiresAt, message, success) {
    await this.ensureTable();
    if (!configId) return;
    const query = `
      UPDATE card_writer_config
      SET
        last_token = ?,
        token_expires_at = ?,
        last_connection_message = ?,
        last_connection_success = ?,
        last_connection_at = NOW()
      WHERE id = ?
    `;
    await queryDatabasePromise(query, [tokenId, expiresAt, message, success ? 1 : 0, configId]);
  }

  static async updateCredentials(configId, username, passwordHash, updatedBy) {
    await this.ensureTable();
    if (!configId) return false;
    const query = `
      UPDATE card_writer_config
      SET
        username = ?,
        password_hash = ?,
        updated_by = ?,
        updated_at = NOW()
      WHERE id = ?
    `;
    const result = await queryDatabasePromise(query, [
      username || null,
      passwordHash || null,
      updatedBy,
      configId,
    ]);
    return result.affectedRows > 0;
  }
}

module.exports = CardWriterModel;

