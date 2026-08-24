(function (w, $) {
  var CHANNELS = ['Phone', 'KakaoTalk', 'Viber', 'Telegram'];
  var PREFIX_RE = /^(KakaoTalk|Viber|Telegram|Phone)\s*:\s*(.*)$/i;
  var PLACEHOLDERS = {
    Phone: 'Enter phone number',
    KakaoTalk: 'Enter KakaoTalk ID / number',
    Viber: 'Enter Viber number',
    Telegram: 'Enter Telegram username / number'
  };

  function parse(raw) {
    var value = (raw == null ? '' : String(raw)).trim();
    var match = value.match(PREFIX_RE);
    if (match) {
      var found = CHANNELS.find(function (c) {
        return c.toLowerCase() === match[1].toLowerCase();
      });
      return { channel: found || 'Phone', number: (match[2] || '').trim() };
    }
    return { channel: 'Phone', number: value };
  }

  function format(channel, number) {
    var raw = parse(number).number;
    var ch = channel || 'Phone';
    if (!raw) return '';
    if (ch === 'Phone') return raw;
    return ch + ': ' + raw;
  }

  function updatePlaceholder(numberSelector, channel) {
    $(numberSelector).attr('placeholder', PLACEHOLDERS[channel] || PLACEHOLDERS.Phone);
  }

  function setFields(channelSelector, numberSelector, raw) {
    var parsed = parse(raw);
    $(channelSelector).val(parsed.channel);
    $(numberSelector).val(parsed.number);
    updatePlaceholder(numberSelector, parsed.channel);
  }

  function getValue(channelSelector, numberSelector) {
    return format($(channelSelector).val(), $(numberSelector).val());
  }

  function reset(channelSelector, numberSelector) {
    $(channelSelector).val('Phone').prop('disabled', false);
    $(numberSelector).val('').prop('readonly', false);
    updatePlaceholder(numberSelector, 'Phone');
  }

  function bind(channelSelector, numberSelector) {
    $(document).off('change.contactChannel', channelSelector);
    $(document).on('change.contactChannel', channelSelector, function () {
      updatePlaceholder(numberSelector, $(this).val());
    });
    updatePlaceholder(numberSelector, $(channelSelector).val() || 'Phone');
  }

  function ensureStyles() {
    var css = [
      '.contact-channel-group {',
      '  display: flex;',
      '  flex-wrap: nowrap;',
      '  width: 100%;',
      '}',
      '.contact-channel-group > .form-select {',
      '  max-width: 96px;',
      '  flex: 0 0 96px;',
      '  width: 96px;',
      '  padding-left: 6px;',
      '  padding-right: 22px;',
      '  font-size: 12px;',
      '}',
      '.contact-channel-group > .form-control {',
      '  flex: 1 1 auto;',
      '  width: 1%;',
      '  min-width: 0;',
      '}'
    ].join('\n');

    var style = document.getElementById('contact-channel-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'contact-channel-style';
      document.head.appendChild(style);
    }
    style.textContent = css;
  }

  w.ContactChannel = {
    parse: parse,
    format: format,
    setFields: setFields,
    getValue: getValue,
    reset: reset,
    bind: bind
  };

  function ready(fn) {
    if ($) {
      $(fn);
      return;
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  ready(function () {
    $ = $ || w.jQuery;
    if (!$) return;
    ensureStyles();
    bind('#contactChannel', '#txtNumber');
    bind('#edit_contactChannel', '#edit_txtNumber');
    bind('#groupContactChannel', '#groupContact');
    bind('#editGroupContactChannel', '#editGroupContact');
  });
})(window, window.jQuery);