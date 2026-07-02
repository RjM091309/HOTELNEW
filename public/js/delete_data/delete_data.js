$(document).ready(function () {
  $('#navDeleteTestData').on('click', function (e) {
    e.preventDefault();

    Swal.fire({
      title: 'Delete Data?',
      html: `Are you sure you want to delete data?
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Yes, delete data',
      cancelButtonText: 'Cancel',
      reverseButtons: true
    }).then(function (result) {
      if (!result.isConfirmed) {
        return;
      }

      Swal.fire({
        title: 'Final Confirmation',
        text: 'Are you absolutely sure you want to delete data?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Yes, proceed',
        cancelButtonText: 'No, go back',
        reverseButtons: true
      }).then(function (finalResult) {
        if (!finalResult.isConfirmed) {
          return;
        }

        Swal.fire({
          title: 'Deleting...',
          text: 'Please wait while data is being removed.',
          allowOutsideClick: false,
          allowEscapeKey: false,
          didOpen: function () {
            Swal.showLoading();
          }
        });

        $.ajax({
          url: '/delete-data/purge',
          type: 'POST',
          success: function (response) {
            if (response.success) {
              Swal.fire({
                icon: 'success',
                title: 'Deleted',
                text: response.message || 'data deleted successfully.',
                confirmButtonText: 'OK'
              }).then(function () {
                window.location.reload();
              });
              return;
            }

            Swal.fire({
              icon: 'error',
              title: 'Failed',
              text: response.message || 'Failed to delete test data.'
            });
          },
          error: function (xhr) {
            const message = xhr.responseJSON?.message || 'An unexpected error occurred.';
            Swal.fire({
              icon: 'error',
              title: 'Error',
              text: message
            });
          }
        });
      });
    });
  });
});
