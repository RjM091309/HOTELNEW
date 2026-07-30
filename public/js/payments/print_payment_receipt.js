function fitPurposeBoxFonts(printDocument) {
  const doc = printDocument || document;
  const boxes = doc.querySelectorAll('.purpose-box:not(.blank)');
  const defaultMinFontPt = 6;
  const defaultMaxFontPt = 8.5;
  const plainMinFontPt = 9;
  const plainMaxFontPt = 14;
  const minLineHeight = 1.05;
  const defaultMaxLineHeight = 1.2;
  const plainMaxLineHeight = 1.45;

  boxes.forEach(function (box) {
    const field = box.closest('.purpose-field');
    const rightCol = box.closest('.receipt-col.right');
    if (!field || !rightCol) return;

    const isPlainPurpose = box.classList.contains('purpose-plain');
    const minFontPt = isPlainPurpose ? plainMinFontPt : defaultMinFontPt;
    const maxFontPt = isPlainPurpose ? plainMaxFontPt : defaultMaxFontPt;
    const maxLineHeight = isPlainPurpose ? plainMaxLineHeight : defaultMaxLineHeight;

    const label = field.querySelector('.field-label');
    const ackBox = rightCol.querySelector('.ack-box');

    box.style.display = 'block';
    box.style.overflow = 'hidden';
    box.style.width = '100%';

    const rightHeight = rightCol.offsetHeight;
    const labelHeight = (label ? label.offsetHeight : 0) + 2;
    const ackHeight = (ackBox ? ackBox.offsetHeight : 0) + 3;
    const available = rightHeight - labelHeight - ackHeight;
    if (available <= 16) return;

    box.style.height = available + 'px';
    box.style.maxHeight = available + 'px';
    box.style.minHeight = available + 'px';

    let fontSize = maxFontPt;
    box.style.fontSize = fontSize + 'pt';
    box.style.lineHeight = String(minLineHeight);

    while (fontSize > minFontPt && box.scrollHeight > box.clientHeight + 1) {
      fontSize -= 0.2;
      box.style.fontSize = fontSize + 'pt';
    }

    const fillRatio = box.scrollHeight / box.clientHeight;
    if (fillRatio < 0.75) {
      let lineHeight = minLineHeight;
      while (lineHeight < maxLineHeight) {
        const nextLh = lineHeight + 0.05;
        box.style.lineHeight = String(nextLh);
        if (box.scrollHeight > box.clientHeight + 1) {
          box.style.lineHeight = String(lineHeight);
          break;
        }
        lineHeight = nextLh;
      }
    }

    if (box.scrollHeight / box.clientHeight < 0.7 && fontSize < maxFontPt) {
      while (fontSize < maxFontPt) {
        const nextSize = fontSize + 0.2;
        box.style.fontSize = nextSize + 'pt';
        if (box.scrollHeight > box.clientHeight + 1) {
          box.style.fontSize = fontSize + 'pt';
          break;
        }
        fontSize = nextSize;
      }
    }
  });
}

function getPaymentReceiptPrintMaxHeightPx() {
  const printableHeightMm = 289;
  return printableHeightMm * (96 / 25.4);
}

function applyPaymentReceiptPrintFitScale(printDocument) {
  const fitRoot = printDocument.querySelector('.payment-print-fit') || printDocument.querySelector('.page');
  const html = printDocument.documentElement;
  const body = printDocument.body;
  if (!fitRoot) return;

  const maxHeightPx = getPaymentReceiptPrintMaxHeightPx();
  const minScale = 0.55;
  const maxScale = 1;

  function resetScale() {
    html.style.zoom = '1';
    body.style.zoom = '1';
    fitRoot.style.zoom = '1';
    fitRoot.style.transform = 'none';
    fitRoot.style.width = '100%';
    fitRoot.style.marginBottom = '0';
  }

  resetScale();

  const naturalHeight = fitRoot.scrollHeight;
  if (!naturalHeight || naturalHeight <= maxHeightPx + 2) return;

  let scale = maxHeightPx / naturalHeight;
  scale = Math.min(maxScale, Math.max(minScale, scale));

  const probe = printDocument.createElement('div');
  probe.style.zoom = '0.5';
  const canUseZoom = probe.style.zoom === '0.5';

  if (canUseZoom) {
    for (let pass = 0; pass < 4; pass++) {
      html.style.zoom = String(scale);
      body.style.zoom = String(scale);

      const measured = html.scrollHeight;
      if (measured <= maxHeightPx + 2) break;

      scale = Math.max(minScale, scale * (maxHeightPx / measured));
    }

    const dynamicPrintStyle = printDocument.getElementById('paymentReceiptPrintZoomStyle');
    if (dynamicPrintStyle) {
      dynamicPrintStyle.textContent = `@media print { html, body { zoom: ${scale} !important; } }`;
    }
  } else {
    fitRoot.style.transform = `scale(${scale})`;
    fitRoot.style.transformOrigin = 'top left';
    fitRoot.style.width = `${100 / scale}%`;
    fitRoot.style.marginBottom = `${naturalHeight * (scale - 1)}px`;
  }

  html.style.margin = '0';
  html.style.padding = '0';
  body.style.margin = '0';
  body.style.padding = '0';

  const scaledHeight = Math.min(Math.ceil(html.scrollHeight), maxHeightPx);
  html.style.height = `${scaledHeight}px`;
  html.style.maxHeight = `${maxHeightPx}px`;
  html.style.overflow = 'hidden';
  body.style.height = `${scaledHeight}px`;
  body.style.maxHeight = `${maxHeightPx}px`;
  body.style.overflow = 'hidden';
}

function waitForReceiptImages(root) {
  const images = root ? Array.from(root.querySelectorAll('img')) : [];
  if (!images.length) return Promise.resolve();

  return Promise.all(images.map((img) => {
    if (img.complete) return Promise.resolve();
    return new Promise((resolve) => {
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', resolve, { once: true });
    });
  }));
}

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
      iframe.setAttribute(
        'style',
        'position:fixed;top:0;left:0;width:794px;height:1123px;border:0;visibility:hidden;opacity:0;pointer-events:none;'
      );
      document.body.appendChild(iframe);

      const frameWindow = iframe.contentWindow;
      const frameDoc = iframe.contentDocument || frameWindow.document;
      frameDoc.open();

      const zoomStyleTag = '<style id="paymentReceiptPrintZoomStyle"></style>';
      const injectedHtml = html.includes('</head>')
        ? html.replace('</head>', zoomStyleTag + '</head>')
        : zoomStyleTag + html;

      frameDoc.write(injectedHtml);
      frameDoc.close();

      waitForReceiptImages(frameDoc.body).then(function () {
        requestAnimationFrame(function () {
          fitPurposeBoxFonts(frameDoc);
          requestAnimationFrame(function () {
            applyPaymentReceiptPrintFitScale(frameDoc);
            requestAnimationFrame(function () {
              frameWindow.focus();
              frameWindow.print();
              setTimeout(function () {
                if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
              }, 1000);
            });
          });
        });
      });
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

function printMultiplePaymentReceipts(ids) {
  const selectedIds = (ids || []).map(String).filter(Boolean);
  if (!selectedIds.length) {
    if (typeof Swal !== 'undefined') {
      Swal.fire('No selection', 'Please select at least one receipt to print.', 'info');
    }
    return;
  }

  const url = '/payments/receipts/print/bulk?ids=' + encodeURIComponent(selectedIds.join(',')) + '&embed=1';
  printPaymentReceipt(url);
}

window.printPaymentReceipt = printPaymentReceipt;
window.printBlankPaymentReceipt = printBlankPaymentReceipt;
window.printMultiplePaymentReceipts = printMultiplePaymentReceipts;
