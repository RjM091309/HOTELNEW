/* Whole-peso money everywhere: a price that has centavos (4,766.67 x 6 = 28,600.02) is rounded off when it is FORMATTED with Number.toLocaleString
   (the way every receipt, voucher, quotation, list and window of the system writes its amounts). Only amounts are touched: a number that is
   formatted as a percent / unit, or with more than 2 decimals on purpose, keeps its decimals. Same rule on the server (utils/moneyRound.js). */
(function () {
  if (Number.prototype.__pesoRound) return;
  var orig = Number.prototype.toLocaleString;
  Number.prototype.toLocaleString = function (loc, opt) {
    var v = this.valueOf(), o = opt || {};
    var isAmount = (!o.style || o.style === 'currency') && (opt === undefined || o.maximumFractionDigits === 2 || o.minimumFractionDigits === 2);
    if (isAmount && Number.isFinite(v)) v = Math.round(v);
    return orig.call(v, loc, opt);
  };
  Number.prototype.__pesoRound = true;
})();
