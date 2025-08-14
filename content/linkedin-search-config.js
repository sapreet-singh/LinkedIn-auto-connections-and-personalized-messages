const LinkedInSearchConfig = {
    ui: {
        title: 'LinkedIn Search',
        stats: {
            sendConnect: 'Send Connect:',
            fieldConnect: 'Field Connect:'
        },
        profiles: {
            label: 'Profiles:'
        }
    },

    timing: {
        profileCollectionDelay: 500,
        pageLoadWait: 2000,
        statusUpdateDelay: 1000
    },

    messages: {
        status: {
            ready: 'Ready to start collecting profiles',
            collecting: 'Collecting profiles...',
            paused: 'Collection paused. Click "START COLLECTING" to resume.',
            collected: 'profiles collected. Ready to connect!',
            connecting: 'Starting connection requests...'
        },
        buttons: {
            startCollecting: 'START COLLECTING',
            pauseCollecting: 'PAUSE COLLECTING',
            startConnecting: 'Process Profiles',
            clearAll: 'Clear All'
        },
        empty: {
            profiles: 'No profiles collected yet. Click "START COLLECTING" to begin.'
        }
    },

    stats: {
        sendConnectRatio: 0.7,
        fieldConnectRatio: 0.3
    },

    // LinkedIn automation selectors and settings
    automation: {
        selectors: {
            connectButton: {
                primary: [
                    'button[aria-label*="to connect"]',  // "Invite [Name] to connect"
                    'button[aria-label*="Connect"]',
                    'button.artdeco-button--primary:has(.artdeco-button__text)',
                    'button.artdeco-button--primary'
                ],
                fallback: [
                    'button[data-control-name="connect"]',
                    '.pv-s-profile-actions button[aria-label*="Connect"]',
                    '.pvs-profile-actions button[aria-label*="Connect"]',
                    '.pv-top-card-v2-ctas button'
                ]
            },
            addNoteButton: {
                primary: [
                    'button[aria-label="Add a note"]',
                    'button.artdeco-button--muted',
                    'button.artdeco-button--secondary'
                ]
            },
            messageTextarea: {
                primary: [
                    'textarea[name="message"]',
                    'textarea#custom-message',
                    '.connect-button-send-invite__custom-message',
                    '.connect-button-send-invite__custom-message-box textarea'
                ]
            },
            sendButton: {
                primary: [
                    'button[aria-label="Send invitation"]',
                    'button.ml1.artdeco-button--primary'
                ],
                fallback: [
                    'button[aria-label*="Send invitation"]',
                    'button[aria-label*="Send"]',
                    '.artdeco-button--primary:has(.artdeco-button__text)'
                ]
            }
        },
        timing: {
            pageLoadWait: 3000,
            popupWait: 1500,
            buttonClickDelay: 1000,
            retryDelay: 1000,
            maxRetries: 5,
            typeDelay: 10,
            typingDuration: 40000,
            sendDelay: 2000,
            postSendDelay: 10000
        },
        messages: {
            processing: 'LinkedIn Automation Active - Processing profile...',
            lookingForConnect: 'Looking for Connect button...',
            clickingConnect: 'Clicking Connect button...',
            lookingForPopup: 'Looking for connection popup...',
            clickingAddNote: 'Clicking "Add a note"...',
            addingMessage: 'Adding custom message...',
            lookingForSend: 'Looking for Send button...',
            sendingRequest: 'Sending connection request...',
            success: 'Connection sent successfully!',
            connectNotFound: 'Connect button not found',
            popupNotFound: 'Connection popup not found',
            sendNotFound: 'Send button not found'
        }
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = LinkedInSearchConfig;
} else {
    window.LinkedInSearchConfig = LinkedInSearchConfig;
}
