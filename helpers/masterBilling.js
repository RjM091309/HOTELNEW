// Master Billing (group_booking.BILLING_TYPE = 1): every charge of the group settles on the MAIN booking
// (the first room), so paying the main room pays the whole group. A room's own services stay on its own
// booking (so they can be listed / removed room by room); the main room's bill just includes them.
const { queryDatabasePromise } = require('../config/database');

/**
 * If `bookingId` is the MAIN booking of a Master-Billing group, returns the group's other (not cancelled)
 * rooms: { isMain: true, mates: [{ id, roomNo }] }. Otherwise { isMain: false, mates: [] }.
 * "Main" = the lowest booking id of the group, same rule the rest of the system uses.
 */
async function getMasterGroupMates(bookingId) {
  const none = { isMain: false, mates: [] };
  if (!bookingId) return none;
  const rows = await queryDatabasePromise(
    `SELECT b.GROUP_BOOKING_ID AS g, gb.BILLING_TYPE AS bt
       FROM booking b LEFT JOIN group_booking gb ON gb.IDNo = b.GROUP_BOOKING_ID
      WHERE b.IDNo = ? AND b.ACTIVE = 1 LIMIT 1`,
    [bookingId]
  );
  const g = rows[0];
  if (!g || !g.g || parseInt(g.bt, 10) !== 1) return none;
  const group = await queryDatabasePromise(
    `SELECT b.IDNo AS id, r.ROOM_NUMBER AS roomNo, COALESCE(b.IS_CANCELLED, 0) AS cancelled
       FROM booking b LEFT JOIN room r ON r.IDNo = b.ROOM_ID
      WHERE b.GROUP_BOOKING_ID = ? AND b.ACTIVE = 1 ORDER BY b.IDNo`,
    [g.g]
  );
  if (!group.length) return none;
  const main = { id: group[0].id, roomNo: group[0].roomNo };
  const mates = group.slice(1).filter((x) => !x.cancelled).map((x) => ({ id: x.id, roomNo: x.roomNo }));
  if (parseInt(group[0].id, 10) !== parseInt(bookingId, 10)) return { isMain: false, mates: [], isMateOfMaster: true, groupId: g.g, main };
  return { isMain: true, mates, groupId: g.g, main };
}

module.exports = { getMasterGroupMates };
