function printPaymentReceipt(url) {
  const existingFrame = document.getElementById('paymentReceiptPrintFrame');
  if (existingFrame) existingFrame.remove();

  fetch(url, { credentials: 'same-origin' })
    .then(function (response) {
      if (!response.ok) throw new Error('Failed to load receipt');
      return response.text();
    })
    .then(function (html) {
      const iframe = document.createElement('iframe');
      iframe.id = 'paymentReceiptPrintFrame';
      iframe.setAttribute('style', 'position:fixed;top:0;left:0;width:0;height:0;border:0;visibility:hidden;');
      document.body.appendChild(iframe);

      const frameWindow = iframe.contentWindow;
      const frameDoc = iframe.contentDocument || frameWindow.document;
      frameDoc.open();
      frameDoc.write(html);
      frameDoc.close();

      setTimeout(function () {
        frameWindow.focus();
        frameWindow.print();
        setTimeout(function () {
          if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        }, 1000);
      }, 200);
    })
    .catch(function () {
      if (typeof Swal !== 'undefined') {
        Swal.fire('Error', 'Failed to load payment receipt for printing', 'error');
      }
    });
}

function printBlankPaymentReceipt() {
  printPaymentReceipt('/payments/receipt/blank?embed=1');
}

window.printPaymentReceipt = printPaymentReceipt;
window.printBlankPaymentReceipt = printBlankPaymentReceipt;
