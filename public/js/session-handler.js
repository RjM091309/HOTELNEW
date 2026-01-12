// ========================================
// SESSION EXPIRATION HANDLER
// ========================================
// Global handler for session expiration when user logs in on another device

(function($) {
    'use strict';

    // Flag to prevent multiple redirects
    let isRedirecting = false;

    // Setup global AJAX error handler
    $(document).ajaxError(function(event, xhr, settings) {
        // Check if this is a 401 Unauthorized error
        if (xhr.status === 401) {
            try {
                const response = xhr.responseJSON || JSON.parse(xhr.responseText);
                
                // Check if the error is due to session expiration
                if (response && (
                    response.message === 'Session expired. Please login again.' ||
                    response.message.includes('Session expired') ||
                    response.message.includes('session=expired')
                )) {
                    // Prevent multiple redirects
                    if (isRedirecting) {
                        return;
                    }
                    isRedirecting = true;

                    // Show notification using Swal.fire
                    handleSessionExpired();
                }
            } catch (e) {
                // If response is not JSON or parsing fails, check status code only
                if (xhr.status === 401 && !isRedirecting) {
                    isRedirecting = true;
                    // Generic 401 handler - might be session expired
                    handleSessionExpired();
                }
            }
        }
    });

    // Periodic session check interval (every 5 seconds)
    let sessionCheckInterval = null;
    let lastSessionCheck = null;

    // Flag to prevent concurrent checks
    let isChecking = false;
    
    // Function to check session validity
    function checkSessionValidity() {
        // Skip if already checking or redirecting
        if (isChecking || isRedirecting) {
            return;
        }
        
        const token = document.cookie.split('; ').find(row => row.startsWith('token='));
        if (!token) {
            // No token, no need to check
            return;
        }

        isChecking = true;

        // Make a lightweight API call to check session validity
        $.ajax({
            url: '/user_info/api/current-user',
            method: 'GET',
            dataType: 'json',
            timeout: 2000, // 2 second timeout
            cache: false,
            beforeSend: function(xhr) {
                // Get token from cookie
                const tokenCookie = document.cookie.split('; ').find(row => row.startsWith('token='));
                if (tokenCookie) {
                    const tokenValue = tokenCookie.split('=')[1];
                    xhr.setRequestHeader('Authorization', 'Bearer ' + tokenValue);
                }
            },
            success: function(response) {
                isChecking = false;
                // Session is still valid
                lastSessionCheck = new Date();
                // Check response for success
                if (response && !response.success) {
                    if (response.message && (response.message.includes('Session expired') || response.message.includes('Invalid token'))) {
                        handleSessionExpired();
                    }
                }
            },
            error: function(xhr) {
                isChecking = false;
                if (xhr.status === 401) {
                    // Always handle 401 as session expired
                    handleSessionExpired();
                }
            }
        });
    }

    // Function to handle session expiration
    function handleSessionExpired() {
        // Stop checking
        if (sessionCheckInterval) {
            clearInterval(sessionCheckInterval);
            sessionCheckInterval = null;
        }

        // Prevent multiple redirects
        if (isRedirecting) {
            return;
        }
        isRedirecting = true;

        // Always use Swal.fire for notifications
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                title: '<div style="font-size: 24px; font-weight: 600; color: #2c3e50; margin-bottom: 10px;">Session Terminated</div>',
                html: '<div style="text-align: center; padding: 20px 0;">' +
                      '<div style="font-size: 64px; margin-bottom: 20px;">🔒</div>' +
                      '<p style="font-size: 16px; color: #34495e; line-height: 1.6; margin-bottom: 15px; font-weight: 500;">' +
                      'Your session has been terminated</p>' +
                      '<p style="font-size: 14px; color: #7f8c8d; line-height: 1.5; margin: 0;">' +
                      'You logged in on another device. For security, only one active session is allowed per account.</p>' +
                      '</div>',
                icon: 'warning',
                iconColor: '#f39c12',
                confirmButtonText: '<span style="font-size: 14px; font-weight: 600; padding: 0 20px;">Go to Login</span>',
                confirmButtonColor: '#3085d6',
                buttonsStyling: true,
                allowOutsideClick: false,
                allowEscapeKey: false,
                showCancelButton: false,
                focusConfirm: true,
                customClass: {
                    popup: 'session-terminated-popup',
                    title: 'session-terminated-title',
                    htmlContainer: 'session-terminated-content',
                    confirmButton: 'session-terminated-button'
                },
                width: '450px',
                padding: '2rem'
            }).then(function() {
                // Clear both cookie and localStorage
                document.cookie = 'token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
                localStorage.removeItem('auth_token');
                window.location.href = '/login?session=expired';
            });
        } else {
            // If Swal is not loaded, just redirect (no alert)
            document.cookie = 'token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
            localStorage.removeItem('auth_token');
            window.location.href = '/login?session=expired';
        }
    }

    // Function to update socket ID in database
    function updateSocketIdInDatabase(socketId, tokenValue) {
        if (!socketId || !tokenValue) {
            console.warn('⚠️ Cannot update socket ID: missing socketId or token');
            return;
        }
        
        console.log('📡 Attempting to update socket ID:', socketId);
        
        $.ajax({
            url: '/auth/api/update-socket-id',
            method: 'POST',
            contentType: 'application/json',
            headers: {
                'Authorization': 'Bearer ' + tokenValue
            },
            data: JSON.stringify({
                socketId: socketId
            }),
            success: function(response) {
                if (response && response.success) {
                    console.log('✅ Socket ID updated successfully in database:', socketId);
                } else {
                    console.error('❌ Failed to update socket ID - response:', response);
                }
            },
            error: function(xhr, status, error) {
                console.error('❌ Error updating socket ID:', {
                    status: xhr.status,
                    statusText: xhr.statusText,
                    responseText: xhr.responseText,
                    error: error
                });
                
                // Try to parse error response
                try {
                    const errorResponse = JSON.parse(xhr.responseText);
                    console.error('Error details:', errorResponse);
                } catch (e) {
                    // Ignore parse errors
                }
            }
        });
    }

    // Setup Socket.IO listener for real-time session invalidation
    let sessionSocket = null;
    function setupSocketIOListener() {
        // Wait for Socket.IO to be available
        if (typeof io === 'undefined') {
            // Retry after 500ms
            setTimeout(setupSocketIOListener, 500);
            return;
        }

        // If already connected, don't reconnect
        if (sessionSocket && sessionSocket.connected) {
            return;
        }

        try {
            sessionSocket = io({
                transports: ['websocket', 'polling'],
                upgrade: true,
                timeout: 10000,
                reconnection: true,
                reconnectionDelay: 1000,
                reconnectionAttempts: 5
            });

            sessionSocket.on('connect', () => {
                console.log('🔌 Session monitoring connected:', sessionSocket.id);
                
                // Small delay to ensure socket is fully connected
                setTimeout(() => {
                    // Get token from localStorage (stored during login) or try cookies as fallback
                    let tokenValue = null;
                    
                    // Try localStorage first (preferred - token is stored there after login)
                    const storedToken = localStorage.getItem('auth_token');
                    if (storedToken) {
                        tokenValue = storedToken;
                        console.log('📦 Token found in localStorage');
                    } else {
                        // Fallback: try to get from cookies (might not work if httpOnly)
                        const token = document.cookie.split('; ').find(row => row.startsWith('token='));
                        if (token) {
                            tokenValue = token.split('=')[1];
                            console.log('📦 Token found in cookies');
                        }
                    }
                    
                    if (tokenValue) {
                        try {
                            // Decode JWT to get user ID (basic decode without verification)
                            const payload = JSON.parse(atob(tokenValue.split('.')[1]));
                            if (payload.userId) {
                                sessionSocket.emit('join-user-session', { userId: payload.userId });
                                console.log('🔐 Joined session room for user:', payload.userId);
                                
                                // Update socket ID in database
                                updateSocketIdInDatabase(sessionSocket.id, tokenValue);
                            }
                        } catch (e) {
                            console.error('⚠️ Could not parse token for Socket.IO room:', e);
                        }
                    } else {
                        console.warn('⚠️ No token found in localStorage or cookies');
                    }
                }, 500); // 500ms delay to ensure connection is stable
            });

            // Listen for session invalidation event
            sessionSocket.on('session-invalidated', (data) => {
                console.log('⚠️ Session invalidated via Socket.IO:', data);
                handleSessionExpired();
            });

            sessionSocket.on('disconnect', (reason) => {
                console.log('🔌 Session monitoring disconnected:', reason);
                // Reconnect attempt will happen automatically
            });

            sessionSocket.on('connect_error', (error) => {
                console.log('⚠️ Session monitoring connection error:', error.message);
                // Polling will handle as fallback
            });

            sessionSocket.on('reconnect', (attemptNumber) => {
                console.log('🔌 Session monitoring reconnected after', attemptNumber, 'attempts');
                // Rejoin room after reconnection and update socket ID
                setTimeout(() => {
                    // Get token from localStorage (preferred) or cookies (fallback)
                    let tokenValue = localStorage.getItem('auth_token');
                    if (!tokenValue) {
                        const token = document.cookie.split('; ').find(row => row.startsWith('token='));
                        if (token) {
                            tokenValue = token.split('=')[1];
                        }
                    }
                    
                    if (tokenValue) {
                        try {
                            const payload = JSON.parse(atob(tokenValue.split('.')[1]));
                            if (payload.userId) {
                                sessionSocket.emit('join-user-session', { userId: payload.userId });
                                console.log('🔐 Rejoined session room for user:', payload.userId);
                                
                                // Update socket ID in database after reconnection
                                updateSocketIdInDatabase(sessionSocket.id, tokenValue);
                            }
                        } catch (e) {
                            console.error('⚠️ Could not parse token after reconnect:', e);
                        }
                    } else {
                        console.warn('⚠️ No token found after reconnect');
                    }
                }, 300);
            });
        } catch (error) {
            console.error('❌ Error setting up Socket.IO:', error);
        }
    }

    // Function to ensure token is in localStorage
    function ensureTokenInLocalStorage(callback) {
        // Check if token exists in localStorage
        if (localStorage.getItem('auth_token')) {
            if (callback) callback(localStorage.getItem('auth_token'));
            return;
        }
        
        // If not, try to get it from server
        console.log('📦 Token not in localStorage, fetching from server...');
        $.ajax({
            url: '/auth/api/current-token',
            method: 'GET',
            dataType: 'json',
            success: function(response) {
                if (response && response.success && response.token) {
                    localStorage.setItem('auth_token', response.token);
                    console.log('✅ Token stored in localStorage');
                    if (callback) callback(response.token);
                } else {
                    console.warn('⚠️ Failed to get token from server');
                }
            },
            error: function(xhr) {
                console.warn('⚠️ Could not fetch token from server:', xhr.status);
            }
        });
    }

    // Start periodic session checking (only on pages that require auth)
    function startSessionMonitoring() {
        // Don't monitor on login page
        if (window.location.pathname === '/login' || window.location.pathname === '/') {
            return;
        }

        // Ensure token is in localStorage before setting up Socket.IO
        ensureTokenInLocalStorage(function(token) {
            // Setup Socket.IO listener after token is available
            setupSocketIOListener();
        });

        // Start polling as fallback (every 1 second for immediate detection)
        if (!sessionCheckInterval) {
            // Initial check immediately
            checkSessionValidity();
            
            // Then check every 1 second for immediate detection
            sessionCheckInterval = setInterval(function() {
                // Only check if page is visible (not in background tab)
                if (!document.hidden && !isRedirecting) {
                    checkSessionValidity();
                }
            }, 1000); // Check every 1 second for immediate detection
        }
    }

    // Check for session expiration on page load (for page routes)
    $(document).ready(function() {
        // Check if redirected from session expiration
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('session') === 'expired') {
            // Show notification using Swal.fire (if not already shown by login page)
            if (typeof Swal !== 'undefined' && window.location.pathname !== '/login') {
                Swal.fire({
                    title: '<div style="font-size: 22px; font-weight: 600; color: #2c3e50;">Session Expired</div>',
                    html: '<div style="text-align: center; padding: 15px 0;">' +
                          '<div style="font-size: 56px; margin-bottom: 15px;">⚠️</div>' +
                          '<p style="font-size: 15px; color: #34495e; line-height: 1.6; margin: 0;">' +
                          'Your session has been terminated because you logged in on another device.</p>' +
                          '</div>',
                    icon: 'info',
                    iconColor: '#3498db',
                    confirmButtonText: 'OK',
                    confirmButtonColor: '#3085d6',
                    buttonsStyling: true,
                    allowOutsideClick: false,
                    allowEscapeKey: false,
                    width: '420px',
                    padding: '2rem'
                });
            }
        } else {
            // Start session monitoring if not on login page
            startSessionMonitoring();
        }

        // Resume checking when page becomes visible
        document.addEventListener('visibilitychange', function() {
            if (!document.hidden && !sessionCheckInterval) {
                startSessionMonitoring();
            }
        });
    });

})(jQuery);

