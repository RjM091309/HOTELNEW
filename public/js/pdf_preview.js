/* PDF preview card: a voucher / quotation PDF is not downloaded or opened in a whole tab any more - it opens in a small card first, with Download and Print.
   Works for every place that already asks the server for these PDFs (a form posted to /booking/generate-voucher, /generate-group-voucher,
   /generate-quotation, or window.open('/booking/voucher/<id>')): they are intercepted here, so no screen had to change. */
(function () {
  if (window.PdfPreview) return;
  var PDF_FORMS = /\/booking\/(generate-voucher|generate-group-voucher|generate-quotation)(\?|$)/;
  var PDF_GET = /^\/booking\/voucher\/\d+/;

  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function nameFrom(res, fallback) {
    var cd = res.headers.get('Content-Disposition') || '', m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
    return m ? decodeURIComponent(m[1]) : fallback;
  }

  // load: () => Promise<Response>; title: what the card says while / after it loads
  function open(load, title) {
    var old = document.getElementById('pdfPreviewOverlay'); if (old) old.remove();
    var ov = document.createElement('div');
    ov.id = 'pdfPreviewOverlay';
    ov.style.cssText = 'position:fixed;inset:0;z-index:2000000;background:rgba(2,6,16,.62);display:flex;align-items:center;justify-content:center;padding:16px;';
    ov.innerHTML =
      '<div style="background:#1a2234;color:#e8ecef;border:1px solid rgba(255,255,255,.12);border-radius:14px;box-shadow:0 24px 70px rgba(0,0,0,.6);width:min(720px,96vw);height:min(92vh,980px);display:flex;flex-direction:column;overflow:hidden;font-family:Poppins,Arial,sans-serif;">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,.1);">' +
          '<b data-pp="title" style="font-size:15px;">' + esc(title || 'Preview') + '</b>' +
          '<button type="button" data-pp="close" style="background:none;border:0;color:#aab4c4;font-size:22px;line-height:1;cursor:pointer;">&times;</button></div>' +
        '<div data-pp="stage" style="flex:1 1 auto;position:relative;background:#0e1422;">' +
          '<div data-pp="msg" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#aab4c4;font-size:14px;text-align:center;padding:20px;">Making the PDF&hellip;</div>' +
          '<iframe data-pp="frame" title="PDF" style="display:none;position:absolute;inset:0;width:100%;height:100%;border:0;background:#fff;"></iframe></div>' +
        '<div style="display:flex;gap:10px;justify-content:flex-end;padding:12px 16px;border-top:1px solid rgba(255,255,255,.1);">' +
          '<button type="button" data-pp="close" style="padding:8px 16px;border-radius:8px;border:1px solid rgba(255,255,255,.2);background:transparent;color:#e8ecef;cursor:pointer;">Close</button>' +
          '<button type="button" data-pp="save" disabled style="padding:8px 16px;border-radius:8px;border:0;background:#4361ee;color:#fff;font-weight:600;cursor:pointer;opacity:.5;">Download PDF</button>' +
          '<button type="button" data-pp="print" disabled style="padding:8px 18px;border-radius:8px;border:0;background:#28a745;color:#fff;font-weight:600;cursor:pointer;opacity:.5;">Print</button></div></div>';
    document.body.appendChild(ov);
    var url = null, fileName = 'document.pdf';
    var frame = ov.querySelector('[data-pp="frame"]'), msg = ov.querySelector('[data-pp="msg"]');
    var save = ov.querySelector('[data-pp="save"]'), print = ov.querySelector('[data-pp="print"]');
    function close() { document.removeEventListener('keydown', onKey, true); if (url) URL.revokeObjectURL(url); ov.remove(); }
    function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }
    document.addEventListener('keydown', onKey, true);
    ov.addEventListener('click', function (e) { if (e.target === ov || e.target.closest('[data-pp="close"]')) close(); });
    save.addEventListener('click', function () {
      if (!url) return;
      var a = document.createElement('a'); a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); a.remove();
    });
    print.addEventListener('click', function () { try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch (e) { nativeOpen.call(window, url, '_blank'); } });
    Promise.resolve().then(load).then(function (res) {
      if (!res.ok) throw new Error('The PDF could not be made (' + res.status + ').');
      fileName = nameFrom(res, 'document.pdf');
      return res.blob();
    }).then(function (blob) {
      url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
      frame.src = url + '#toolbar=0&navpanes=0';
      frame.style.display = 'block'; msg.style.display = 'none';
      [save, print].forEach(function (b) { b.disabled = false; b.style.opacity = '1'; });
      var t = ov.querySelector('[data-pp="title"]'); if (t && (!title || title === 'Preview')) t.textContent = fileName.replace(/\.pdf$/i, '');
    }).catch(function (err) {
      msg.innerHTML = '<span style="color:#ff8a8a;">' + esc(err.message || 'The PDF could not be made.') + '</span>';
    });
  }

  function titleFor(action) { return /quotation/.test(action) ? 'Quotation' : (/group/.test(action) ? 'Group voucher' : 'Voucher'); }

  // 1) the forms that used to open / download the PDF
  var nativeSubmit = HTMLFormElement.prototype.submit;
  HTMLFormElement.prototype.submit = function () {
    var action = this.getAttribute('action') || '';
    if (String(this.method || '').toLowerCase() === 'post' && PDF_FORMS.test(action)) {
      var body = new URLSearchParams();
      new FormData(this).forEach(function (v, k) { body.append(k, v); });
      open(function () {
        return fetch(action, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
      }, titleFor(action));
      return;
    }
    return nativeSubmit.call(this);
  };

  // 2) window.open('/booking/voucher/<id>')
  var nativeOpen = window.open;
  window.open = function (u) {
    var path = '';
    try { path = new URL(u, window.location.origin).pathname; } catch (e) { path = ''; }
    if (PDF_GET.test(path)) {
      open(function () { return fetch(u, { credentials: 'same-origin' }); }, 'Voucher');
      return null;
    }
    return nativeOpen.apply(window, arguments);
  };

  window.PdfPreview = { open: open, openUrl: function (u, title) { open(function () { return fetch(u, { credentials: 'same-origin' }); }, title); } };
})();
