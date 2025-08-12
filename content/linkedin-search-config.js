// LinkedIn Search UI Configuration
const LinkedInSearchConfig = {
    // UI Settings
    ui: {
        title: 'LinkedIn Search',
        position: {
            top: '80px',
            right: '20px'
        },
        dimensions: {
            width: '420px',
            maxHeight: '80vh'
        },
        zIndex: 999999,
        stats: {
            sendConnect: 'Send Connect:',
            fieldConnect: 'Field Connect:'
        },
        profiles: {
            label: 'Profiles:'
        }
    },

    // Profile Selectors for different LinkedIn layouts
    selectors: {
        profiles: [
            '[data-chameleon-result-urn]',
            '.reusable-search__result-container',
            '.entity-result',
            '.search-result__wrapper',
            '.actor-result'
        ],
        profileName: [
            '.entity-result__title-text a',
            '.actor-name a',
            '.search-result__result-link',
            '.result-card__title a'
        ],
        profileTitle: [
            '.entity-result__primary-subtitle',
            '.actor-occupation',
            '.search-result__snippet',
            '.result-card__subtitle'
        ],
        profileLocation: [
            '.entity-result__secondary-subtitle',
            '.actor-meta',
            '.search-result__location',
            '.result-card__location'
        ],
        connectButton: [
            'button[aria-label*="Connect"]',
            'button[data-control-name="srp_profile_actions"]',
            '.search-result__actions button'
        ]
    },

    // URLs and Navigation
    urls: {
        linkedinSearch: 'https://www.linkedin.com/search/results/people/?origin=FACETED_SEARCH',
        linkedinSearchWithFilters: 'https://www.linkedin.com/search/results/people/?origin=FACETED_SEARCH&viewAllFilters=true'
    },

    // Timing Configuration
    timing: {
        profileCollectionDelay: 500, // ms between each profile collection
        pageLoadWait: 2000, // ms to wait for page load
        uiInitDelay: 1000, // ms to wait before initializing UI
        statusUpdateDelay: 1000 // ms for status updates
    },

    // Messages and Text
    messages: {
        status: {
            ready: 'Ready to show LinkedIn filters',
            openingFilters: 'Opening LinkedIn search filters...',
            filtersOpened: 'LinkedIn filters opened. Now click "COLLECT PROFILES"',
            collecting: 'Collecting profiles...',
            collected: 'profiles collected. Ready to connect!',
            connecting: 'Starting connection requests...'
        },
        buttons: {
            showFilters: 'SHOW LINKEDIN FILTERS',
            collectProfiles: 'COLLECT PROFILES',
            collecting: 'COLLECTING...',
            startConnecting: 'Next: Start Connecting',
            clearAll: 'Clear All'
        },
        empty: {
            profiles: 'No profiles collected yet. Click "Show LinkedIn Filters" to begin.'
        }
    },

    // Statistics Configuration
    stats: {
        sendConnectRatio: 0.7, // 70% of profiles for send connect
        fieldConnectRatio: 0.3  // 30% of profiles for field connect
    },

    // Feature Flags
    features: {
        autoCollection: true,
        realTimeUpdates: true,
        profilePreview: true,
        statisticsTracking: true,
        dragAndDrop: true,
        minimizable: true
    },

    // Error Messages
    errors: {
        profileCollectionFailed: 'Failed to collect profiles. Please try again.',
        navigationFailed: 'Failed to navigate to LinkedIn search.',
        connectionFailed: 'Failed to send connection request.',
        uiLoadFailed: 'Failed to load LinkedIn Search UI.'
    }
};

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LinkedInSearchConfig;
} else {
    window.LinkedInSearchConfig = LinkedInSearchConfig;
}
