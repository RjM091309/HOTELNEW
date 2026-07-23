const { queryDatabasePromise } = require('../config/database');

class FlightScheduleModel {
  static async getAll() {
    const query = `
      SELECT
        IDNo,
        FLIGHT_NUMBER,
        ARRIVAL,
        DEPARTURE,
        ENCODED_BY,
        ENCODED_DT,
        EDITED_BY,
        EDITED_DT,
        ACTIVE
      FROM flight_schedule
      WHERE ACTIVE = 1
      ORDER BY FLIGHT_NUMBER ASC, IDNo DESC
    `;
    return await queryDatabasePromise(query);
  }

  static async getById(id) {
    const query = `
      SELECT
        IDNo,
        FLIGHT_NUMBER,
        ARRIVAL,
        DEPARTURE,
        ENCODED_BY,
        ENCODED_DT,
        EDITED_BY,
        EDITED_DT,
        ACTIVE
      FROM flight_schedule
      WHERE IDNo = ? AND ACTIVE = 1
    `;
    const results = await queryDatabasePromise(query, [id]);
    return results[0] || null;
  }

  static async create(data) {
    const query = `
      INSERT INTO flight_schedule
      (FLIGHT_NUMBER, ARRIVAL, DEPARTURE, ENCODED_BY, ENCODED_DT, ACTIVE)
      VALUES (?, ?, ?, ?, ?, 1)
    `;
    const result = await queryDatabasePromise(query, [
      data.FLIGHT_NUMBER,
      data.ARRIVAL,
      data.DEPARTURE,
      data.ENCODED_BY,
      data.ENCODED_DT
    ]);
    return { id: result.insertId, ...data };
  }

  static async update(data) {
    const query = `
      UPDATE flight_schedule
      SET FLIGHT_NUMBER = ?, ARRIVAL = ?, DEPARTURE = ?, EDITED_BY = ?, EDITED_DT = ?
      WHERE IDNo = ? AND ACTIVE = 1
    `;
    return await queryDatabasePromise(query, [
      data.FLIGHT_NUMBER,
      data.ARRIVAL,
      data.DEPARTURE,
      data.EDITED_BY,
      data.EDITED_DT,
      data.IDNo
    ]);
  }

  static async delete(id, editedBy) {
    const query = `
      UPDATE flight_schedule
      SET ACTIVE = 0, EDITED_BY = ?, EDITED_DT = NOW()
      WHERE IDNo = ? AND ACTIVE = 1
    `;
    return await queryDatabasePromise(query, [editedBy, id]);
  }
}

module.exports = FlightScheduleModel;
