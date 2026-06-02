$(function () {
    const $form = $('#cardWriterForm');
    const $status = $('#cardWriterStatus');
    const $testButton = $('#testConnectionButton');
    const $indicator = $('#cardWriterConnectionIndicator');
    const $credentialHelper = $('#cardWriterCredentialHelper');
    const $credentialButton = $('#cardWriterCredentialsButton');
    const $credentialModal = $('#cardWriterCredentialsModal');
    const $credentialForm = $('#cardWriterCredentialsForm');
    const $credentialUsername = $('#cardWriterUsername');
    const $credentialPassword = $('#cardWriterPassword');
    let latestConfig = null;

    function formatDate(value) {
        if (!value) return 'Never';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return value;
        return date.toLocaleString();
    }

    function populateForm(config) {
        $('#cardWriterPlatformUrl').val(config.platform_url || '');
        $('#cardWriterDeviceSeq').val(config.device_seq || '');
        $('#cardWriterCallback').val(config.callback_url || '');
        $('#cardWriterToken').val(config.last_token || '');
        updateCredentialHelper(config);
        latestConfig = config;
    }

    function renderStatus(config) {
        if (!config) {
            setIndicator(null);
            $status.html('<div class="alert alert-warning">No card writer configuration saved yet.</div>');
            $('#cardWriterToken').val('');
            updateCredentialHelper(null);
            latestConfig = null;
            return;
        }

        const lastUpdated = formatDate(config.updated_at);
        const lastConnection = formatDate(config.last_connection_at);
        const message = config.last_connection_message || 'Connection has not been tested yet.';
        const token = config.last_token ? `<div><strong>Last token:</strong> ${config.last_token}</div>` : '';
        const expires = config.token_expires_at ? `<div><strong>Token exp:</strong> ${formatDate(config.token_expires_at)}</div>` : '';
        const successClass = config.last_connection_success === 1 ? 'success' : 'secondary';

        $status.html(`
            <div class="alert alert-${successClass}">
                <p><strong>Config updated:</strong> ${lastUpdated}</p>
                <p><strong>Last connection:</strong> ${lastConnection}</p>
                <p><strong>Status message:</strong> ${message}</p>
                ${token}
                ${expires}
            </div>
        `);
        updateCredentialHelper(config);
        latestConfig = config;
        setIndicator(config.last_connection_success === 1);
    }

    function setIndicator(success) {
        $indicator.removeClass('connected disconnected unknown');
        if (success === true) {
            $indicator.addClass('connected');
            $indicator.find('.label').text('Connected');
        } else if (success === false) {
            $indicator.addClass('disconnected');
            $indicator.find('.label').text('Disconnected');
        } else {
            $indicator.addClass('unknown');
            $indicator.find('.label').text('Unknown');
        }
    }

    function updateCredentialHelper(config) {
        latestConfig = config;
        if (config && config.username) {
            $credentialHelper.text(`Using account ${config.username}`);
        } else {
            $credentialHelper.text('Credentials not set');
        }
    }

    function loadConfig() {
        $.get('/integration/api/card-writer')
            .done(function (response) {
                if (!response.success) return;
                const data = response.data;
                if (!data) {
                    renderStatus(null);
                    return;
                }
                populateForm(data);
                renderStatus(data);
            })
            .fail(function () {
                $status.html('<div class="alert alert-danger">Unable to load the current configuration.</div>');
                setIndicator(null);
            });
    }

    function ensureTokenRenewal() {
        $.ajax({
            url: '/integration/api/card-writer/renew',
            method: 'POST',
            contentType: 'application/json'
        }).done(function (response) {
            if (response.success && response.data) {
                populateForm(response.data);
                renderStatus(response.data);
            } else {
                loadConfig();
            }
        }).fail(function () {
            loadConfig();
        });
    }

    $form.on('submit', function (event) {
        event.preventDefault();
        const payload = {
            platformUrl: $('#cardWriterPlatformUrl').val(),
            deviceSeq: $('#cardWriterDeviceSeq').val(),
            callbackUrl: $('#cardWriterCallback').val()
        };

        $.ajax({
            url: '/integration/api/card-writer',
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(payload)
        }).done(function (response) {
            if (response.success) {
                Swal.fire('Saved', 'Card writer configuration updated.', 'success');
                renderStatus(response.data);
            } else {
                Swal.fire('Oops', response.message || 'Unable to process configuration.', 'error');
            }
        }).fail(function (xhr) {
            const message = xhr.responseJSON?.message || 'An unexpected server error occurred.';
            Swal.fire('Error', message, 'error');
        });
    });

    $testButton.on('click', function () {
        $testButton.prop('disabled', true).text('Testing...');
        $status.html('<div class="alert alert-info">Testing connection…</div>');
        $.ajax({
            url: '/integration/api/card-writer/test',
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({})
        }).done(function (response) {
            const type = response.success ? 'success' : 'warning';
            Swal.fire('Test Connection', response.message || (response.success ? 'Connected.' : 'Something went wrong.'), type);
            loadConfig();
        }).fail(function (xhr) {
            const message = xhr.responseJSON?.message || xhr.responseText || 'Connection failed.';
            Swal.fire('Test failed', message, 'error');
            loadConfig();
        }).always(function () {
            $testButton.prop('disabled', false).text('Test Connection');
        });
    });

    ensureTokenRenewal();
    $credentialButton.on('click', function () {
        $credentialUsername.val(latestConfig?.username || '');
        $credentialPassword.val('');
        $credentialModal.modal('show');
    });

    $credentialForm.on('submit', function (event) {
        event.preventDefault();
        const payload = {
            username: $credentialUsername.val(),
            password: $credentialPassword.val()
        };

        $.ajax({
            url: '/integration/api/card-writer/credentials',
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(payload)
        }).done(function (response) {
            if (response.success && response.data) {
                populateForm(response.data);
                renderStatus(response.data);
                $credentialModal.modal('hide');
                $credentialPassword.val('');
                Swal.fire('Saved', 'Credentials stored securely.', 'success');
            } else {
                Swal.fire('Error', response.message || 'Unable to save credentials.', 'error');
            }
        }).fail(function (xhr) {
            const message = xhr.responseJSON?.message || 'Failed to save credentials.';
            Swal.fire('Error', message, 'error');
        });
    });

    $('#cardWriterCredentialsModal').on('click', '#cardWriterCredentialsClose, .btn-secondary', function () {
        $credentialModal.modal('hide');
    });

    $credentialModal.on('hidden.bs.modal', function () {
        $credentialPassword.val('');
    });
});

