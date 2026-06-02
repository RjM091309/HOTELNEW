/**
 * Card Writer Registration Logic for PMS
 * This handles the interaction between the Room Modal and the Card Writer API.
 */

async function registerGuestCard(bookingId, roomId, roomNumber, guestName) {
    console.log(`Starting card registration for Booking: ${bookingId}, Room: ${roomNumber}`);

    const { value: cardUid } = await Swal.fire({
        title: 'Register Key Card',
        html: `
            <div class="text-start mb-3">
                <p><strong>Guest:</strong> ${guestName}</p>
                <p><strong>Room:</strong> ${roomNumber}</p>
            </div>
            <div class="form-group text-start">
                <label for="swal-card-uid" class="form-label">Card UID / Decimal Number</label>
                <div class="input-group">
                    <input id="swal-card-uid" class="form-control" placeholder="e.g. 9E3507DD(2654275549)">
                    <button type="button" class="btn btn-primary" id="btnReadFromEncoder">
                        <i class="fas fa-sync-alt"></i> Read
                    </button>
                </div>
                <small class="text-muted">Place the card on the encoder and click "Read".</small>
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Register Card',
        confirmButtonColor: '#6f9c40',
        didOpen: () => {
            const readBtn = document.getElementById('btnReadFromEncoder');
            const uidInput = document.getElementById('swal-card-uid');

            readBtn.addEventListener('click', function () {
                readBtn.disabled = true;
                readBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

                $.ajax({
                    url: '/integration/api/card-writer/read',
                    method: 'POST',
                    contentType: 'application/json',
                    data: JSON.stringify({})
                }).done(function (response) {
                    if (response.success && response.cardNo) {
                        uidInput.value = response.cardNo;
                        uidInput.focus();

                        readBtn.classList.replace('btn-primary', 'btn-success');
                        setTimeout(() => {
                            readBtn.classList.replace('btn-success', 'btn-primary');
                        }, 1500);
                    } else {
                        Swal.showValidationMessage(response.message || 'No card detected on encoder');
                    }
                }).fail(function (xhr) {
                    const message = xhr.responseJSON?.message || 'Encoder error';
                    Swal.showValidationMessage(message);
                }).always(function () {
                    readBtn.disabled = false;
                    readBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Read';
                });
            });
        },
        preConfirm: () => {
            const uid = document.getElementById('swal-card-uid').value;
            if (!uid) {
                Swal.showValidationMessage('Please enter the Card UID or Decimal Number');
            }
            return uid;
        }
    });

    if (!cardUid) return;

    Swal.fire({
        title: 'Registering...',
        text: 'Please wait while we authorize the card with the cloud server.',
        allowOutsideClick: false,
        didOpen: () => {
            Swal.showLoading();
        }
    });

    $.ajax({
        url: '/integration/api/card-writer/register',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({
            bookingId: bookingId,
            roomId: roomId,
            cardUid: cardUid
        })
    }).done(function (response) {
        if (response.success) {
            Swal.fire({
                title: 'Success!',
                text: 'Key card registered and authorized successfully.',
                icon: 'success',
                confirmButtonColor: '#6f9c40'
            });
        } else {
            Swal.fire({
                title: 'Registration Failed',
                text: response.message || 'An error occurred during registration.',
                icon: 'error'
            });
        }
    }).fail(function (xhr) {
        const message = xhr.responseJSON?.message || 'A server error occurred. Please check logs.';
        Swal.fire({
            title: 'Error',
            text: message,
            icon: 'error'
        });
    });
}

window.registerGuestCard = registerGuestCard;

