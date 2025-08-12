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
            startConnecting: 'Next: Start Connecting',
            clearAll: 'Clear All'
        },
        empty: {
            profiles: 'No profiles collected yet. Click "START COLLECTING" to begin.'
        }
    },

    stats: {
        sendConnectRatio: 0.7,
        fieldConnectRatio: 0.3
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = LinkedInSearchConfig;
} else {
    window.LinkedInSearchConfig = LinkedInSearchConfig;
}
