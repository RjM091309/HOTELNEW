// Paying ONE room of a group that shares one bill (Master Billing, group_booking.BILLING_TYPE = 1).
//
// Until now every payment of such a group went through the MAIN booking and covered the whole group. Now each room can be paid on its own:
//   - a room that is not the main one pays only its own room, extension, services and penalty;
//   - the main room chooses "this room only" or "the whole group" (the whole group is the old flow, see BookingModel.processPayment).
//
// How the money is recorded (so every report / bill that already reads the group keeps working):
//   - room charges: still on the MAIN booking (payments.BOOKING_ID = main), with payments.ROOM_BOOKING_ID = the room that was paid. A room payment
//     without ROOM_BOOKING_ID (an old one, or a "whole group" payment) is a pool that fills the rooms in order: the main room first, then the others.
//   - services / extended nights / penalty: on the room's own booking, like before.
const { queryDatabasePromise, pool } = require('../config/database');
const { getMasterGroupMates } = require('../helpers/masterBilling');

const METHODS = ['cash', 'bank_transfer', 'credit_card', 'korean_bank', 'agoda', 'expedia'];
const num = (v) => parseFloat(v) || 0;
const r2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;

// Every room that carries a share of the group's room bill: the main booking and the rooms whose own ROOM_CHARGE is 0 (the main carries them).
// Returns null when the booking is not part of such a group (or is a room with a bill of its own, e.g. one that joined later).
async function getRoomLedger(bookingId) {
  const info = await getMasterGroupMates(bookingId);
  if (!info.isMain && !info.isMateOfMaster) return null;
  const mainId = info.main.id;
  const rows = await queryDatabasePromise(
    `SELECT b.IDNo AS id, r.ROOM_NUMBER AS roomNo, bill.IDNo AS billingId, bill.ROOM_PRICE AS price, bill.QTY AS qty, bill.ROOM_CHARGE AS charge,
            bill.RESERVATION_FEE AS fee, bill.DISCOUNT_AMOUNT AS discount, b.BOOKING_STATUS AS status
       FROM booking b LEFT JOIN room r ON r.IDNo = b.ROOM_ID LEFT JOIN billing bill ON bill.BOOKING_ID = b.IDNo AND bill.ACTIVE = 1
      WHERE b.GROUP_BOOKING_ID = ? AND b.ACTIVE = 1 AND COALESCE(b.IS_CANCELLED, 0) = 0
      ORDER BY b.IDNo`,
    [info.groupId]
  );
  const rooms = rows
    .filter((x) => x.id === mainId || num(x.charge) === 0)
    .map((x) => ({
      id: x.id, roomNo: x.roomNo, billingId: x.billingId, isMain: x.id === mainId, status: x.status,
      share: x.id === mainId ? Math.max(0, r2(num(x.price) * (num(x.qty) || 1) - num(x.fee) - num(x.discount))) : r2(num(x.price) * (num(x.qty) || 1))
    }));
  if (!rooms.some((x) => x.id === parseInt(bookingId, 10))) return null;
  const mainRoom = rooms.find((x) => x.isMain);
  if (!mainRoom) return null;
  const pays = await queryDatabasePromise(
    `SELECT ROOM_BOOKING_ID AS rb, COALESCE(SUM(AMOUNT_PAID), 0) AS amt FROM payments WHERE BOOKING_ID = ? AND PAYMENT_TYPE = 'room' GROUP BY ROOM_BOOKING_ID`,
    [mainId]
  );
  const att = {}; let pool_ = 0;
  pays.forEach((p) => { if (p.rb == null) pool_ += num(p.amt); else att[p.rb] = (att[p.rb] || 0) + num(p.amt); });
  // what a room was paid beyond its share (or for a room that is not listed any more) goes back to the pool
  rooms.forEach((x) => { const a = att[x.id] || 0; x.own = Math.min(a, x.share); pool_ += Math.max(0, a - x.share); });
  Object.keys(att).forEach((k) => { if (!rooms.some((x) => String(x.id) === String(k))) pool_ += att[k]; });
  rooms.forEach((x) => {
    const need = x.share - x.own, take = Math.min(need, pool_);
    pool_ -= take;
    x.paid = r2(x.own + take); x.remaining = Math.max(0, r2(x.share - x.paid));
  });
  return { groupId: info.groupId, mainId, rooms, mainRoomNo: mainRoom.roomNo };
}

// extension / services / penalty of one booking: what is owed and what is still to pay
async function otherCharges(bookingId) {
  const ext = await queryDatabasePromise(
    `SELECT be.IDNo AS id, (be.QTY * be.COST) AS total,
            COALESCE((SELECT SUM(p.AMOUNT_PAID) FROM payments p WHERE p.BOOKING_EXTENSION_ID = be.IDNo AND p.PAYMENT_TYPE = 'extended'), 0) AS paid
       FROM booking_extension be WHERE be.BOOKING_ID = ? AND be.ACTIVE = 1 AND be.QTY > 0 ORDER BY be.IDNo`, [bookingId]);
  const svc = await queryDatabasePromise(
    `SELECT bs.IDNo AS id, bs.SERVICE_ID AS serviceId, bs.TOTAL_COST AS total,
            COALESCE((SELECT SUM(p.AMOUNT_PAID) FROM payments p WHERE p.BOOKING_SERVICE_ID = bs.IDNo AND p.PAYMENT_TYPE = 'service'), 0) AS paid
       FROM booking_service bs WHERE bs.BOOKING_ID = ? AND bs.ACTIVE = 1 AND COALESCE(bs.STATUS, '') <> 'cancelled' ORDER BY bs.IDNo`, [bookingId]);
  const pen = await queryDatabasePromise(
    `SELECT bill.IDNo AS billingId, COALESCE(bill.CANCELLATION_PENALTY, 0) AS total,
            COALESCE((SELECT SUM(p.AMOUNT_PAID) FROM payments p WHERE p.BOOKING_ID = bill.BOOKING_ID AND p.PAYMENT_TYPE = 'cancellation_fee'), 0) AS paid
       FROM billing bill WHERE bill.BOOKING_ID = ? AND bill.ACTIVE = 1 LIMIT 1`, [bookingId]);
  const sum = (list) => ({ total: r2(list.reduce((s, x) => s + num(x.total), 0)), paid: r2(list.reduce((s, x) => s + Math.min(num(x.paid), num(x.total)), 0)) });
  const e = sum(ext), s = sum(svc), p = pen[0] ? sum([pen[0]]) : { total: 0, paid: 0 };
  return { ext, svc, pen: pen[0] || null, extTotals: e, svcTotals: s, penTotals: p };
}

// The bill of ONE room of a shared-bill group (and, for the main room, the group's too).
async function roomBill(bookingId) {
  const ledger = await getRoomLedger(bookingId);
  if (!ledger) return { isMaster: false };
  const id = parseInt(bookingId, 10);
  const group = await queryDatabasePromise('SELECT GROUP_NAME FROM group_booking WHERE IDNo = ?', [ledger.groupId]);
  const per = [];
  for (const room of ledger.rooms) {
    const o = await otherCharges(room.id);
    const total = r2(room.share + o.extTotals.total + o.svcTotals.total + o.penTotals.total);
    const paid = r2(room.paid + o.extTotals.paid + o.svcTotals.paid + o.penTotals.paid);
    per.push({
      id: room.id, roomNo: room.roomNo, isMain: room.isMain, status: room.status,
      room: { total: room.share, paid: room.paid, remaining: room.remaining },
      extension: { total: o.extTotals.total, paid: o.extTotals.paid, remaining: Math.max(0, r2(o.extTotals.total - o.extTotals.paid)) },
      services: { total: o.svcTotals.total, paid: o.svcTotals.paid, remaining: Math.max(0, r2(o.svcTotals.total - o.svcTotals.paid)) },
      penalty: { total: o.penTotals.total, paid: o.penTotals.paid, remaining: Math.max(0, r2(o.penTotals.total - o.penTotals.paid)) },
      total, paid, balance: (total - paid) < 1 ? 0 : Math.max(0, r2(total - paid))
    });
  }
  const own = per.find((x) => x.id === id);
  const grp = per.reduce((a, x) => ({ total: r2(a.total + x.total), paid: r2(a.paid + x.paid), balance: r2(a.balance + x.balance) }), { total: 0, paid: 0, balance: 0 });
  return {
    isMaster: true, isMain: own.isMain, groupId: ledger.groupId, groupName: (group[0] && group[0].GROUP_NAME) || '', mainBookingId: ledger.mainId, mainRoomNo: ledger.mainRoomNo,
    roomNo: own.roomNo, own, group: grp, rooms: per
  };
}

// Pay ONE room of the group. Order: room, extended nights, services (a custom service / an upgrade first, then the smaller ones), penalty.
async function payRoomOnly({ bookingId, amount, paymentMethod, paymentNotes, encodedBy }) {
  if (!METHODS.includes(String(paymentMethod))) return { error: 'Pick how the guest pays.' };
  const id = parseInt(bookingId, 10);
  // The group is locked (its main booking row) BEFORE the balances are read: a second payment of the same room (a double click, another cashier)
  // waits here until the first one is saved, then reads the new balance instead of the old one.
  const conn = await pool.promise().getConnection();
  try {
    await conn.beginTransaction();
    const info = await getMasterGroupMates(id);
    const lockId = info.main ? info.main.id : id;
    await conn.query('SELECT IDNo FROM booking WHERE IDNo = ? FOR UPDATE', [lockId]);
    const result = await payRoomLocked(conn, { id, amount, paymentMethod, paymentNotes, encodedBy });
    if (result.error) { await conn.rollback(); return result; }
    await conn.commit();
    // the room statuses of the group (paid / partial / unpaid) follow the new ledger
    await syncRoomStatuses(id);
    const after = await roomBill(id);
    const [who] = await queryDatabasePromise('SELECT COALESCE(FULLNAME, USERNAME) AS name FROM user_info WHERE IDno = ?', [encodedBy]);
    return { success: true, paid: result.paid, balance: after.own.balance, groupBalance: after.group.balance, paidBy: who ? who.name : null };
  } catch (e) {
    try { await conn.rollback(); } catch (er) { /* already rolled back */ }
    throw e;
  } finally {
    conn.release();
  }
}

async function payRoomLocked(conn, { id, amount, paymentMethod, paymentNotes, encodedBy }) {
  const bill = await roomBill(id);
  if (!bill.isMaster) return { error: 'This booking does not share a bill with a group.' };
  const own = bill.own;
  if (own.balance <= 0.004) return { error: 'This room has nothing left to pay.' };
  const want = amount == null || amount === '' ? own.balance : parseFloat(amount);
  if (!(want > 0)) return { error: 'Enter the amount to pay.' };
  let left = Math.min(own.balance, r2(want));
  const paying = left;
  const ledger = await getRoomLedger(id);
  const mainBillingId = (ledger.rooms.find((x) => x.isMain) || {}).billingId || null;
  const ownBillingId = (ledger.rooms.find((x) => x.id === id) || {}).billingId || null;
  const o = await otherCharges(id);

  {
    const add = async (sql, params) => conn.query(sql, params);
    const notes = paymentNotes || null;
    // 1. the room (recorded on the main booking, for this room)
    if (left > 0 && own.room.remaining > 0) {
      const pay = Math.min(left, own.room.remaining);
      await add(`INSERT INTO payments (BOOKING_ID, BILLING_ID, ROOM_BOOKING_ID, AMOUNT_PAID, PAYMENT_METHOD, PAYMENT_TYPE, PAYMENT_DATE, ENCODED_BY, REMARKS)
                 VALUES (?, ?, ?, ?, ?, 'room', NOW(), ?, ?)`, [ledger.mainId, mainBillingId, id, pay, paymentMethod, encodedBy, notes]);
      left = r2(left - pay);
    }
    // 2. extended nights
    for (const e of o.ext) {
      const rem = r2(num(e.total) - num(e.paid));
      if (left <= 0) break;
      if (rem <= 0) continue;
      const pay = Math.min(left, rem);
      await add(`INSERT INTO payments (BOOKING_ID, BOOKING_EXTENSION_ID, AMOUNT_PAID, PAYMENT_METHOD, PAYMENT_TYPE, PAYMENT_DATE, ENCODED_BY, REMARKS)
                 VALUES (?, ?, ?, ?, 'extended', NOW(), ?, ?)`, [id, e.id, pay, paymentMethod, encodedBy, notes]);
      await add(`UPDATE booking_extension SET PAYMENT_STATUS = ? WHERE IDNo = ? AND ACTIVE = 1`, [pay >= rem - 0.005 ? 'paid' : 'partial', e.id]);
      left = r2(left - pay);
    }
    // 3. services
    const svc = o.svc.map((x) => ({ ...x, rem: r2(num(x.total) - num(x.paid)) })).filter((x) => x.rem > 0);
    const special = [-1, 71];
    svc.sort((a, b) => {
      const sa = special.includes(parseInt(a.serviceId, 10)), sb = special.includes(parseInt(b.serviceId, 10));
      return sa !== sb ? (sa ? -1 : 1) : a.rem - b.rem;
    });
    for (const s of svc) {
      if (left <= 0) break;
      const pay = Math.min(left, s.rem);
      await add(`INSERT INTO payments (BOOKING_ID, BOOKING_SERVICE_ID, AMOUNT_PAID, PAYMENT_METHOD, PAYMENT_TYPE, PAYMENT_DATE, ENCODED_BY, REMARKS)
                 VALUES (?, ?, ?, ?, 'service', NOW(), ?, ?)`, [id, s.id, pay, paymentMethod, encodedBy, notes]);
      await add(`UPDATE booking_service SET STATUS = ? WHERE IDNo = ? AND ACTIVE = 1`, [pay >= s.rem - 0.005 ? 'paid' : 'partial', s.id]);
      left = r2(left - pay);
    }
    // 4. the penalty of an early check-out
    if (left > 0 && own.penalty.remaining > 0 && ownBillingId) {
      const pay = Math.min(left, own.penalty.remaining);
      await add(`INSERT INTO payments (BOOKING_ID, BILLING_ID, AMOUNT_PAID, PAYMENT_METHOD, PAYMENT_TYPE, PAYMENT_DATE, ENCODED_BY, REMARKS)
                 VALUES (?, ?, ?, ?, 'cancellation_fee', NOW(), ?, ?)`, [id, ownBillingId, pay, paymentMethod, encodedBy, notes]);
      left = r2(left - pay);
    }
    if (paymentNotes && String(paymentNotes).trim()) {
      await add(`INSERT INTO remarks (BOOKING_ID, CATEGORY, REMARK_TEXT, ENCODED_BY, ENCODED_DT, ACTIVE) VALUES (?, 'Payment', ?, ?, NOW(), 1)`, [id, String(paymentNotes).trim(), encodedBy]);
    }
  }
  return { paid: r2(paying - left) };
}

// billing.PAYMENT_STATUS of every room of the group from the ledger: a room is paid when its share is covered; the main room carries the GROUP'S
// status (it is paid only when every room's room charge is), like the rest of the system reads it.
async function syncRoomStatuses(bookingId) {
  const ledger = await getRoomLedger(bookingId);
  if (!ledger) return;
  const status = (paid, share) => (share <= 0.004 || paid >= share - 0.004 ? 'paid' : paid > 0.004 ? 'partial' : 'unpaid');
  const groupShare = ledger.rooms.reduce((s, x) => s + x.share, 0), groupPaid = ledger.rooms.reduce((s, x) => s + x.paid, 0);
  for (const room of ledger.rooms) {
    const st = room.isMain ? status(groupPaid, groupShare) : status(room.paid, room.share);
    await queryDatabasePromise(`UPDATE billing SET PAYMENT_STATUS = ? WHERE BOOKING_ID = ? AND ACTIVE = 1 AND COALESCE(PAYMENT_STATUS, '') <> ?`, [st, room.id, st]);
  }
}

// The calendar bars of a group where rooms were paid on their own: every bar shows ITS OWN room's balance and colour (paid / partial / unpaid), not the group's.
// Only groups that have such a payment are touched (the others keep showing the group's balance, as before), and a group with unsettled credit keeps the old numbers.
async function applyPerRoomStatus(rows) {
  const groups = {};
  (rows || []).forEach((r) => { if (r.groupBookingId) (groups[r.groupBookingId] = groups[r.groupBookingId] || []).push(r); });
  const gids = Object.keys(groups);
  if (!gids.length) return;
  const own = await queryDatabasePromise(
    `SELECT DISTINCT b.GROUP_BOOKING_ID AS g FROM payments p JOIN booking b ON b.IDNo = p.BOOKING_ID WHERE p.ROOM_BOOKING_ID IS NOT NULL AND b.GROUP_BOOKING_ID IN (?)`, [gids]);
  for (const { g } of own) {
    const list = groups[g];
    if (!list || !list.length) continue;
    const credit = await queryDatabasePromise(
      `SELECT 1 FROM payments p JOIN booking b ON b.IDNo = p.BOOKING_ID WHERE b.GROUP_BOOKING_ID = ? AND p.PAYMENT_METHOD IN ('credit', 'marker') AND p.SETTLED_DATE IS NULL AND p.AMOUNT_PAID > 0 LIMIT 1`, [g]);
    if (credit.length) continue;
    let bill = { isMaster: false };
    for (const r of list) { bill = await roomBill(r.id); if (bill.isMaster) break; }   // (the first bar may be a room that is not part of the shared bill)
    if (!bill.isMaster) continue;
    const byId = {};
    bill.rooms.forEach((x) => { byId[x.id] = x; });
    list.forEach((row) => {
      const room = byId[row.id];
      if (!room) return;
      row.outstandingBalance = room.balance;
      row.billedTotal = room.total;
      row.balanceIsGroup = 0;
      row.paymentStatus = room.balance <= 0.009 ? 'paid' : (room.paid > 0.009 ? 'partial' : 'unpaid');
      if (row.bookingStatus === 'check-Out') row.backgroundColor = room.balance > 0.009 ? '#0b3d91' : '#B3B3B3';
    });
  }
}

module.exports = { getRoomLedger, roomBill, payRoomOnly, syncRoomStatuses, applyPerRoomStatus };
