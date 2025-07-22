// ===== OPTIMIZED LINKEDIN AUTOMATION POPUP =====

// === CONSTANTS ===
const CONSTANTS = {
    STEPS: { CAMPAIGN_NAME: 1, SOURCE_SELECTION: 2, PROFILE_COLLECTION: 3, MESSAGING: 4 },
    SUBSTEPS: { SEARCH: 'search', NETWORK: 'network', COLLECTING: 'collecting' },
    STORAGE_KEYS: {
        CAMPAIGNS: 'campaigns', PROFILES: 'collectedProfiles', SETTINGS: ['dailyLimit', 'actionDelay', 'followupDelay'],
        MESSAGES: ['connectionMessage', 'followup1', 'followup2'], STATS: ['todayCount', 'totalCount']
    },
    URLS: {
        NETWORK_SEARCH: 'https://www.linkedin.com/search/results/people/?network=%5B%22F%22%5D&origin=FACETED_SEARCH',
        CONNECTIONS: 'https://www.linkedin.com/mynetwork/invite-connect/connections/',
        PEOPLE_SEARCH: 'https://www.linkedin.com/search/people/'
    }
};

// === STATE MANAGEMENT ===
const AppState = {
    currentStep: 1, isCollecting: false, collectedProfiles: [], duplicateProfiles: [],
    wizardInitialized: false, selectedProfiles: []
};

// === DOM CACHE ===
const DOMCache = {
    elements: new Map(),
    get(id) { return this.elements.get(id) || this.cache(id); },
    cache(id) { const el = document.getElementById(id); this.elements.set(id, el); return el; },
    getAll(selector) { return document.querySelectorAll(selector); }
};

// === UTILITY FUNCTIONS ===
const Utils = {
    showNotification: (message, type = 'success') => {
        const status = DOMCache.get('status');
        status.textContent = message;
        status.className = `status ${type}`;
        setTimeout(() => { status.textContent = 'Ready'; status.className = 'status'; }, 3000);
    },

    extractCleanName: (profile) => {

        // First, try extracting from location field if name is invalid
        if ((!profile.name ||
             profile.name === 'Status is reachable' ||
             profile.name === 'Status is offline' ||
             profile.name.includes('Status is') ||
             profile.name.includes('View') ||
             profile.name.includes('•')) &&
            profile.location) {

            // Extract name from location field pattern: "Name View Name's profile"
            const nameMatch = profile.location.match(/^([A-Za-z\s]+?)(?:View|•|\n)/);
            if (nameMatch && nameMatch[1].trim().length > 2) {
                const extractedName = nameMatch[1].trim();

                return extractedName;
            }
        }

        // Try the original name field if it's valid
        if (profile.name && profile.name.trim() &&
            profile.name !== 'Status is reachable' &&
            profile.name !== 'Status is offline' &&
            !profile.name.includes('Status is') &&
            !profile.name.includes('View') &&
            !profile.name.includes('•')) {
            return profile.name.trim();
        }

        // Try extracting from title if name is not good
        if (profile.title && profile.title.trim() &&
            !profile.title.includes('Status') &&
            !profile.title.includes('degree connection')) {
            return profile.title.split(' at ')[0].trim();
        }

        // Try extracting from URL as last resort
        if (profile.url && profile.url.includes('/in/')) {
            const urlMatch = profile.url.match(/\/in\/([^\/\?]+)/);
            if (urlMatch) {
                const nameFromUrl = urlMatch[1].replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

                return nameFromUrl;
            }
        }

        return 'LinkedIn User';
    },

    createProfileCard: (profile, index = null) => {
        const cleanName = Utils.extractCleanName(profile);
        const profilePic = profile.profilePic || '';
        const title = profile.title || '';
        const company = profile.company || '';
        const url = profile.url || '';

        const card = document.createElement('div');
        card.className = 'profile-card';
        card.innerHTML = `
            ${index !== null ? `<input type="checkbox" class="profile-checkbox" data-index="${index}" checked>` : ''}
            <div class="profile-pic">
                ${profilePic ?
                    `<img src="${profilePic}" alt="${cleanName}" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover;">` :
                    `<div class="profile-avatar" style="width: 50px; height: 50px; border-radius: 50%; background: #0073b1; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 18px;">${cleanName.charAt(0).toUpperCase()}</div>`
                }
            </div>
            <div class="profile-info">
                <div class="profile-name" style="font-weight: bold; color: #333;">${cleanName}</div>
                <div class="profile-details" style="color: #666; font-size: 12px;">
                    ${title && company ? `${title} at ${company}` : title || company || '• 1st degree connection'}
                </div>
                ${url ? `<div class="profile-url" style="color: #0073b1; font-size: 11px; word-break: break-all;">${url}</div>` : ''}
            </div>
        `;
        return card;
    }
};

// === STORAGE API ===
const StorageAPI = {
    get: (keys) => new Promise(resolve => chrome.storage.local.get(keys, resolve)),
    set: (data) => new Promise(resolve => chrome.storage.local.set(data, resolve)),

    async loadSettings() {
        const result = await this.get(CONSTANTS.STORAGE_KEYS.SETTINGS);
        CONSTANTS.STORAGE_KEYS.SETTINGS.forEach(key => {
            const element = DOMCache.get(key.replace(/([A-Z])/g, '-$1').toLowerCase());
            if (element && result[key]) element.value = result[key];
        });

        const stats = await this.get([...CONSTANTS.STORAGE_KEYS.STATS, CONSTANTS.STORAGE_KEYS.PROFILES]);
        DOMCache.get('today-count').textContent = stats.todayCount || 0;
        DOMCache.get('total-count').textContent = stats.totalCount || 0;
        DOMCache.get('profile-count').textContent = (stats.collectedProfiles || []).length;
    },

    async saveSettings() {
        const data = {};
        CONSTANTS.STORAGE_KEYS.SETTINGS.forEach(key => {
            const element = DOMCache.get(key.replace(/([A-Z])/g, '-$1').toLowerCase());
            if (element) data[key] = key.includes('Delay') || key.includes('Limit') ? parseInt(element.value) : element.value;
        });
        await this.set(data);
        Utils.showNotification('Settings saved successfully!');
    },

    async loadMessages() {
        const result = await this.get(CONSTANTS.STORAGE_KEYS.MESSAGES);
        CONSTANTS.STORAGE_KEYS.MESSAGES.forEach(key => {
            const element = DOMCache.get(key.replace(/([A-Z])/g, '-$1').toLowerCase());
            if (element && result[key]) element.value = result[key];
        });
    },

    async saveMessages() {
        const data = {};
        CONSTANTS.STORAGE_KEYS.MESSAGES.forEach(key => {
            const element = DOMCache.get(key.replace(/([A-Z])/g, '-$1').toLowerCase());
            if (element) data[key] = element.value;
        });
        await this.set(data);
        Utils.showNotification('Messages saved successfully!');
    }
};

// === TAB MANAGEMENT ===
const TabManager = {
    init() {
        DOMCache.getAll('.tab-btn').forEach(button => {
            button.addEventListener('click', () => this.switchTab(button.getAttribute('data-tab'), button));
        });
    },

    switchTab(tabName, activeButton) {
        DOMCache.getAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        DOMCache.getAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === tabName);
        });
        activeButton.classList.add('active');
    }
};

// === MODAL MANAGEMENT ===
const ModalManager = {
    init() {
        const campaignModal = DOMCache.get('campaign-modal');
        const profilesModal = DOMCache.get('profiles-modal');

        DOMCache.get('create-campaign')?.addEventListener('click', () => this.openCampaignModal());
        DOMCache.getAll('.close').forEach(btn => btn.addEventListener('click', (e) => this.handleCloseClick(e)));
        DOMCache.get('close-profiles')?.addEventListener('click', () => this.closeModal('profiles-modal'));

        window.addEventListener('click', (e) => {
            // Prevent automatic closing when clicking outside modal
            // if (e.target === campaignModal) this.closeCampaignModal();
            // if (e.target === profilesModal) this.closeModal('profiles-modal');

            // Optional: Add confirmation dialog for outside clicks
            if (e.target === campaignModal || e.target === profilesModal) {

                // if (confirm('Are you sure you want to close this modal?')) {
                //     if (e.target === campaignModal) this.closeCampaignModal();
                //     if (e.target === profilesModal) this.closeModal('profiles-modal');
                // }
            }
        });
    },

    openCampaignModal() {
        DOMCache.get('campaign-modal').style.display = 'block';
        WizardManager.initialize();
        WizardManager.showStep(CONSTANTS.STEPS.CAMPAIGN_NAME);
    },

    closeCampaignModal() {
        DOMCache.get('campaign-modal').style.display = 'none';
        WizardManager.reset();
    },

    handleCloseClick(e) {
        // Prevent automatic closing - just show a message or do nothing
        e.preventDefault();
        e.stopPropagation();

        // Show a notification to the user

        Utils.showNotification('Close button is disabled. Modal will remain open.', 'info');

        // You can add a confirmation dialog here if needed:
        // if (confirm('Are you sure you want to close this modal?')) {
        //     this.closeModal(e);
        // }

        // For now, we just prevent the default close behavior
        return false;
    },

    closeModal(modalIdOrEvent) {
        const modalId = typeof modalIdOrEvent === 'string' ? modalIdOrEvent :
                       modalIdOrEvent.target.closest('#campaign-modal') ? 'campaign-modal' : null;
        if (modalId) {
            DOMCache.get(modalId).style.display = 'none';
            if (modalId === 'campaign-modal') WizardManager.reset();
        }
    },

    // Method to force close all modals (can be called from console if needed)
    forceCloseAll() {

        DOMCache.get('campaign-modal').style.display = 'none';
        DOMCache.get('profiles-modal').style.display = 'none';
        DOMCache.get('profile-urls-modal').style.display = 'none';
        WizardManager.reset();
        AppState.selectedProfiles = [];
        Utils.showNotification('All modals have been closed.', 'success');
    }
};

// === WIZARD MANAGEMENT ===
const WizardManager = {
    initialize() {
        if (AppState.wizardInitialized) return;
        AppState.wizardInitialized = true;
        this.setupEventListeners();
    },

    reset() {
        AppState.currentStep = 1;
        AppState.collectedProfiles = [];
        AppState.duplicateProfiles = [];
        AppState.isCollecting = false;

        const campaignNameInput = DOMCache.get('campaign-name');
        if (campaignNameInput) campaignNameInput.value = '';

        const elements = ['collected-number', 'collected-profiles-list'];
        elements.forEach(id => {
            const el = DOMCache.get(id);
            if (el) el.textContent = id === 'collected-number' ? '0' : '';
        });
    },

    showStep(stepNumber, subStep = null) {
        DOMCache.getAll('.wizard-step').forEach(step => step.classList.remove('active'));

        const stepMap = {
            1: 'step-1', 2: 'step-2', 4: 'step-4-messaging',
            3: subStep ? `step-3-${subStep}` : 'step-3-collecting'
        };

        const stepElement = DOMCache.get(stepMap[stepNumber]);
        if (stepElement) stepElement.classList.add('active');
        AppState.currentStep = stepNumber;
    },

    setupEventListeners() {
        const eventMap = {
            'next-step-1': () => this.validateAndProceed(),
            'back-to-step-1': () => this.showStep(1),
            'back-to-step-2': () => this.showStep(2),
            'back-to-search': () => this.showStep(3, 'search'),
            'back-to-step-2-from-network': () => this.showStep(2),
            'back-to-collecting': () => this.showStep(3, 'collecting'),
            'next-to-messaging': () => this.showStep(4),
            'linkedin-search-option': () => this.showStep(3, 'search'),
            'sales-navigator-option': () => Utils.showNotification('Sales Navigator integration coming soon!', 'info'),
            'network-option': () => this.showStep(3, 'network'),
            'csv-upload-btn': () => DOMCache.get('csv-file-input')?.click(),
            'csv-upload-btn-2': () => DOMCache.get('csv-file-input')?.click(),
            'show-filters': () => chrome.tabs.create({ url: CONSTANTS.URLS.PEOPLE_SEARCH }),
            'start-collecting': () => { this.showStep(3, 'collecting'); ProfileCollector.start(); },
            'show-network-filters': () => NetworkManager.openSearch(),
            'start-network-collecting': () => { this.showStep(3, 'collecting'); NetworkManager.startCollecting(); },
            'browse-connections': () => NetworkManager.browseConnections(),
            'pause-collection': () => ProfileCollector.togglePause(),
            'create-campaign-final': () => this.handleFinalStep(),
            'exclude-duplicates': () => DuplicateManager.exclude(),
            'cancel-duplicates': () => DuplicateManager.cancel(),
            'single-message-radio': () => DOMCache.get('follow-up-config').style.display = 'none',
            'multi-step-radio': () => DOMCache.get('follow-up-config').style.display = 'block'
        };

        Object.entries(eventMap).forEach(([id, handler]) => {
            const element = DOMCache.get(id);
            if (element) element.onclick = handler;
        });

        const csvInput = DOMCache.get('csv-file-input');
        if (csvInput) csvInput.onchange = CSVHandler.upload;
    },

    validateAndProceed() {
        const campaignNameInput = DOMCache.get('campaign-name');
        const campaignName = campaignNameInput?.value.trim();
        if (!campaignName) {
            Utils.showNotification('Please enter a campaign name', 'error');
            campaignNameInput?.focus();
            return;
        }
        this.showStep(2);
    },

    handleFinalStep() {
        const currentActiveStep = document.querySelector('.wizard-step.active');
        if (currentActiveStep?.id === 'step-3-collecting') {
            if (AppState.collectedProfiles.length === 0) {
                Utils.showNotification('Please collect some profiles first', 'warning');
                return;
            }
            this.showStep(4);
        } else {
            DuplicateManager.check();
        }
    }
};

// === CSV HANDLER ===
const CSVHandler = {
    upload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const profiles = this.parseCSV(e.target.result);
            if (profiles.length > 0) {
                AppState.collectedProfiles = profiles;
                ProfileManager.updateList();
                WizardManager.showStep(3, 'collecting');
                DOMCache.get('collected-number').textContent = profiles.length;
            } else {
                Utils.showNotification('No valid profiles found in CSV file', 'error');
            }
        };
        reader.readAsText(file);
    },

    parseCSV(csv) {
        const lines = csv.split('\n');
        const profiles = [];

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const columns = line.split(',').map(col => col.replace(/"/g, '').trim());
            if (columns.length >= 2) {
                profiles.push({
                    name: columns[0], url: columns[1],
                    company: columns[2] || '', title: columns[3] || ''
                });
            }
        }
        return profiles;
    }
};

// === DUPLICATE MANAGER ===
const DuplicateManager = {
    async check() {
        const result = await StorageAPI.get([CONSTANTS.STORAGE_KEYS.CAMPAIGNS]);
        const existingCampaigns = result.campaigns || [];
        const allExistingProfiles = existingCampaigns.flatMap(campaign => campaign.profiles || []);

        AppState.duplicateProfiles = AppState.collectedProfiles.filter(profile =>
            allExistingProfiles.some(existing => existing.url === profile.url)
        );

        if (AppState.duplicateProfiles.length > 0) {
            this.showModal();
        } else {
            CampaignManager.finalize();
        }
    },

    showModal() {
        DOMCache.get('duplicate-count').textContent = AppState.duplicateProfiles.length;
        const list = DOMCache.get('duplicate-profiles-list');
        list.innerHTML = '';

        AppState.duplicateProfiles.forEach(profile => {
            list.appendChild(Utils.createProfileCard(profile));
        });

        DOMCache.get('duplicates-modal').style.display = 'block';
    },

    exclude() {
        AppState.collectedProfiles = AppState.collectedProfiles.filter(profile =>
            !AppState.duplicateProfiles.some(dup => dup.url === profile.url)
        );
        DOMCache.get('duplicates-modal').style.display = 'none';
        CampaignManager.finalize();
    },

    cancel() {
        DOMCache.get('duplicates-modal').style.display = 'none';
        CampaignManager.finalize();
    }
};

// === REAL-TIME PROFILE HANDLER ===
const RealTimeProfileHandler = {
    init() {

        // Listen for real-time profile updates from content script
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

            if (message.action === 'addProfilesRealTime' && message.profiles) {

                this.handleRealTimeProfiles(message.profiles);
                sendResponse({ success: true });
                return true; // Keep message channel open
            }
        });
    },

    handleRealTimeProfiles(profiles) {

        // Filter and validate profiles
        const validProfiles = profiles.filter(profile => {
            const hasName = profile.name && profile.name.trim() &&
                           !profile.name.includes('Status is') &&
                           profile.name !== 'Unknown Name';
            const hasUrl = profile.url && profile.url.includes('/in/');

            return hasName && hasUrl;
        });

        if (validProfiles.length > 0) {
            // Filter out duplicates before adding
            const newProfiles = validProfiles.filter(newProfile => {
                return !AppState.collectedProfiles.some(existingProfile =>
                    existingProfile.url === newProfile.url
                );
            });

            if (newProfiles.length > 0) {
                // Add only new profiles to campaign
                AppState.collectedProfiles.push(...newProfiles);

                // Ensure campaign modal is visible FIRST
                const campaignModal = DOMCache.get('campaign-modal');
                if (campaignModal && campaignModal.style.display !== 'block') {

                    campaignModal.style.display = 'block';
                    WizardManager.showStep(3, 'collecting');

                    // Wait a moment for DOM to update
                    setTimeout(() => {
                        this.updateUIAfterModalOpen(newProfiles.length);
                    }, 100);
                } else {
                    // Modal already open, update immediately
                    this.updateUIAfterModalOpen(newProfiles.length);
                }
            }
        } else {

        }
    },

    updateUIAfterModalOpen(newProfileCount) {

        // Update UI in real-time
        ProfileManager.updateList();

        // Update counter
        const counterElement = DOMCache.get('collected-number');
        if (counterElement) {
            counterElement.textContent = AppState.collectedProfiles.length;

        } else {

        }

        // Show notification for new profiles
        Utils.showNotification(`✅ Added ${newProfileCount} new profiles (Total: ${AppState.collectedProfiles.length})`, 'success');

        // Keep collection active - user can manually pause if needed
    }
};

// === MAIN INITIALIZATION ===
document.addEventListener('DOMContentLoaded', async function() {
    // Initialize all managers
    TabManager.init();
    ModalManager.init();
    RealTimeProfileHandler.init(); // Initialize real-time handler
    AutoCollectionHandler.init(); // Initialize auto-collection handler

    // Add keyboard shortcut to force close modals (Ctrl+Shift+X)
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && e.key === 'X') {
            e.preventDefault();
            ModalManager.forceCloseAll();
        }
    });

    // Setup main event listeners
    const eventMap = {
        'collect-profiles': ProfileCollector.collectFromPage,
        'view-collected': ProfileManager.view,
        'export-profiles': ProfileManager.export,
        'create-campaign-from-profiles': ProfileManager.createCampaign,
        'close-profile-urls': ProfileURLModal.close,
        'select-all-profiles': ProfileURLModal.selectAll,
        'add-profiles-to-campaign': ProfileURLModal.addSelected,
        'save-settings': StorageAPI.saveSettings,
        'save-messages': StorageAPI.saveMessages
    };

    Object.entries(eventMap).forEach(([id, handler]) => {
        const element = DOMCache.get(id);
        if (element) element.addEventListener('click', handler);
    });

    // Load initial data
    await Promise.all([
        StorageAPI.loadSettings(),
        StorageAPI.loadMessages(),
        CampaignManager.load(),
        ProfileManager.loadCount()
    ]);

    // Initialize button state - default to stopped (red STOP button)
    const pauseBtn = DOMCache.get('pause-collection');
    if (pauseBtn) {
        pauseBtn.textContent = 'STOP';
        pauseBtn.className = 'btn btn-danger';
    }
    AppState.isCollecting = false;
});

// === CAMPAIGN MANAGER ===
const CampaignManager = {
    async load() {
        const result = await StorageAPI.get([CONSTANTS.STORAGE_KEYS.CAMPAIGNS]);
        const campaignList = DOMCache.get('campaign-list');

        if (result.campaigns?.length > 0) {
            campaignList.innerHTML = '';
            result.campaigns.forEach((campaign, index) => {
                campaignList.appendChild(this.createCampaignItem(campaign, index));
            });

            DOMCache.getAll('[data-action]').forEach(button => {
                button.addEventListener('click', this.handleAction);
            });
        } else {
            campaignList.innerHTML = '<div class="empty-state">No campaigns yet. Create your first campaign!</div>';
        }
    },

    createCampaignItem(campaign, index) {
        const item = document.createElement('div');
        item.className = 'campaign-item';
        item.innerHTML = `
            <div class="campaign-header">
                <div class="campaign-title">${campaign.name}</div>
                <div class="campaign-actions">
                    <button class="btn btn-secondary btn-sm" data-action="pause" data-index="${index}">
                        ${campaign.status === 'running' ? 'Pause' : 'Resume'}
                    </button>
                    <button class="btn btn-secondary btn-sm" data-action="delete" data-index="${index}">Delete</button>
                </div>
            </div>
            <div class="campaign-stats">
                Progress: ${campaign.progress}/${campaign.maxConnections} | Status: ${campaign.status}
            </div>
        `;
        return item;
    },

    async handleAction(event) {
        const action = event.target.getAttribute('data-action');
        const index = parseInt(event.target.getAttribute('data-index'));

        const result = await StorageAPI.get([CONSTANTS.STORAGE_KEYS.CAMPAIGNS]);
        const campaigns = result.campaigns || [];

        if (action === 'pause') {
            campaigns[index].status = campaigns[index].status === 'running' ? 'paused' : 'running';
            await StorageAPI.set({ campaigns });
            CampaignManager.load();

            chrome.runtime.sendMessage({
                action: campaigns[index].status === 'running' ? 'resumeCampaign' : 'pauseCampaign',
                campaignId: campaigns[index].id
            });
        } else if (action === 'delete' && confirm('Are you sure you want to delete this campaign?')) {
            const campaignId = campaigns[index].id;
            campaigns.splice(index, 1);
            await StorageAPI.set({ campaigns });
            CampaignManager.load();

            chrome.runtime.sendMessage({ action: 'deleteCampaign', campaignId });
        }
    },

    async finalize() {
        const campaignName = DOMCache.get('campaign-name').value.trim();
        const messagingStrategy = document.querySelector('input[name="messaging-strategy"]:checked')?.value || 'single';
        const followUpCount = parseInt(DOMCache.get('follow-up-count')?.value || '1');
        const followUpDelay = parseInt(DOMCache.get('follow-up-delay')?.value || '3');

        const newCampaign = {
            id: Date.now(), name: campaignName, profiles: AppState.collectedProfiles,
            maxConnections: AppState.collectedProfiles.length, progress: 0, status: 'ready',
            createdAt: new Date().toISOString(),
            messagingStrategy: {
                type: messagingStrategy, followUpCount: messagingStrategy === 'multi' ? followUpCount : 0,
                followUpDelay
            }
        };

        const result = await StorageAPI.get([CONSTANTS.STORAGE_KEYS.CAMPAIGNS]);
        const campaigns = result.campaigns || [];
        campaigns.push(newCampaign);

        await StorageAPI.set({ campaigns });
        ModalManager.closeCampaignModal();
        this.load();
        Utils.showNotification(`Campaign "${campaignName}" created with ${AppState.collectedProfiles.length} profiles!`);
    }
};

// === AUTO COLLECTION HANDLER ===
const AutoCollectionHandler = {
    init() {

        // Listen for messages from content script
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.action === 'autoCollectionStarted') {
                this.handleAutoCollectionStarted(message, sender);
                sendResponse({ success: true });
            }
        });

        // Check if we should auto-start when popup opens
        this.checkAutoStart();
    },

    async checkAutoStart() {
        try {
            const tabs = await new Promise(resolve => chrome.tabs.query({ active: true, currentWindow: true }, resolve));
            const tab = tabs[0];

            if (tab.url.includes('linkedin.com')) {

                // Inject content script to enable auto-detection
                try {
                    await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        files: ['content/linkedin-content.js']
                    });

                } catch (error) {

                }
            }
        } catch (error) {

        }
    },

    handleAutoCollectionStarted(message, sender) {

        // Show notification that auto-collection started
        Utils.showNotification('🔄 Auto-detection started! Profiles will appear automatically.', 'success');

        // Show auto-detection indicator only if collection is active
        if (AppState.isCollecting) {
            const indicator = DOMCache.get('auto-detection-indicator');
            if (indicator) {
                indicator.style.display = 'flex';
            }
        }

        // Open campaign modal automatically
        const campaignModal = DOMCache.get('campaign-modal');
        if (campaignModal) {
            campaignModal.style.display = 'block';
            WizardManager.showStep(3, 'collecting');
        }

        // Update button state to show collection is active
        const pauseBtn = DOMCache.get('pause-collection');
        if (pauseBtn) {
            pauseBtn.textContent = 'PAUSE';
            pauseBtn.className = 'btn btn-secondary';
        }

        // Set app state
        AppState.isCollecting = true;

        // Clear existing profiles to start fresh
        AppState.collectedProfiles = [];
        ProfileManager.updateList();
        DOMCache.get('collected-number').textContent = '0';
    },

    hideAutoIndicator() {
        const indicator = DOMCache.get('auto-detection-indicator');
        if (indicator) {
            indicator.style.display = 'none';
        }
    },

    showAutoIndicator() {
        const indicator = DOMCache.get('auto-detection-indicator');
        if (indicator) {
            indicator.style.display = 'flex';
        }
    }
};

// === PROFILE COLLECTOR ===
const ProfileCollector = {
    async collectFromPage() {
        const tabs = await new Promise(resolve => chrome.tabs.query({ active: true, currentWindow: true }, resolve));
        const tab = tabs[0];

        if (!tab.url.includes('linkedin.com')) {
            Utils.showNotification('Please navigate to a LinkedIn page first', 'error');
            return;
        }

        const result = await StorageAPI.get([CONSTANTS.STORAGE_KEYS.PROFILES]);
        const existingProfiles = result.collectedProfiles || [];

        try {
            const response = await chrome.tabs.sendMessage(tab.id, { action: 'collectProfiles' });

            if (response?.profiles?.length > 0) {
                const newProfiles = response.profiles.filter(profile =>
                    !existingProfiles.some(existing => existing.url === profile.url)
                );

                const updated = [...existingProfiles, ...newProfiles];
                await StorageAPI.set({ collectedProfiles: updated });
                DOMCache.get('profile-count').textContent = updated.length;
                Utils.showNotification(`Collected ${newProfiles.length} new profiles`);
            } else {
                if (existingProfiles.length > 0) {
                    DOMCache.get('profile-count').textContent = existingProfiles.length;
                    Utils.showNotification(`Showing ${existingProfiles.length} previously collected profiles`, 'info');
                } else {
                    Utils.showNotification('No profiles found. Please navigate to LinkedIn search results page.', 'warning');
                }
            }
        } catch (error) {
            console.error('Error collecting profiles:', error);
            if (existingProfiles.length > 0) {
                DOMCache.get('profile-count').textContent = existingProfiles.length;
                Utils.showNotification(`Showing ${existingProfiles.length} previously collected profiles`, 'info');
            } else {
                Utils.showNotification('Please refresh the LinkedIn page and try again.', 'error');
            }
        }
    },

    start() {
        AppState.isCollecting = true;

        // Update button to show PAUSE when collecting starts
        const pauseBtn = DOMCache.get('pause-collection');
        if (pauseBtn) {
            pauseBtn.textContent = 'PAUSE';
            pauseBtn.className = 'btn btn-secondary';
        }

        // Start immediate collection and real-time monitoring
        this.startRealTimeCollection();

        Utils.showNotification('🔄 Collection started! Navigate to LinkedIn and profiles will appear.', 'info');
    },

    async startRealTimeCollection() {
        const tabs = await new Promise(resolve => chrome.tabs.query({ active: true, currentWindow: true }, resolve));
        const tab = tabs[0];

        if (!tab.url.includes('linkedin.com')) {
            Utils.showNotification('Please navigate to a LinkedIn page first', 'error');
            return;
        }

        // Open campaign modal immediately

        const campaignModal = DOMCache.get('campaign-modal');
        if (campaignModal) {
            campaignModal.style.display = 'block';
            WizardManager.showStep(3, 'collecting');
        }

        try {
            // Inject content script
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content/linkedin-content.js']
            });

            // Start real-time collection
            await chrome.tabs.sendMessage(tab.id, { action: 'startRealTimeCollection' });

            Utils.showNotification('Real-time collection started! Profiles will appear as found.', 'success');

        } catch (error) {
            console.error('Error starting real-time collection:', error);
            // Fallback to regular collection
            this.collectFromCurrentPage();
        }
    },

    togglePause() {
        const pauseBtn = DOMCache.get('pause-collection');

        if (!AppState.isCollecting) {
            // Currently stopped, start collecting
            AppState.isCollecting = true;

            // Change button to PAUSE (gray)
            pauseBtn.textContent = 'PAUSE';
            pauseBtn.className = 'btn btn-secondary';

            // Show auto-detection indicator when starting
            AutoCollectionHandler.showAutoIndicator();

            // Clear existing profiles to avoid duplicate detection issues

            AppState.collectedProfiles = [];
            ProfileManager.updateList();
            DOMCache.get('collected-number').textContent = '0';

            // Start collection and auto-detection
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                chrome.tabs.sendMessage(tabs[0].id, { action: 'startRealTimeCollection' });
                chrome.tabs.sendMessage(tabs[0].id, { action: 'startAutoCollection' });
            });

            Utils.showNotification('🔄 Auto-detection started! Profiles will appear automatically.', 'success');
        } else {
            // Currently collecting, pause it
            AppState.isCollecting = false;

            // Change button to STOP (red)
            pauseBtn.textContent = 'STOP';
            pauseBtn.className = 'btn btn-danger';

            // Hide auto-detection indicator when stopping
            AutoCollectionHandler.hideAutoIndicator();

            // Stop collection (including auto-collection)
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                chrome.tabs.sendMessage(tabs[0].id, { action: 'stopRealTimeCollection' });
                chrome.tabs.sendMessage(tabs[0].id, { action: 'stopAutoCollection' });
            });

            Utils.showNotification('⏸️ Auto-detection stopped. Click STOP to resume.', 'info');
        }
    },

    continue() {
        if (AppState.isCollecting) this.collectFromCurrentPage();
    },

    async collectFromCurrentPage() {
        const tabs = await new Promise(resolve => chrome.tabs.query({ active: true, currentWindow: true }, resolve));
        const tab = tabs[0];

        if (!tab.url.includes('linkedin.com')) {
            Utils.showNotification('Please navigate to a LinkedIn page first', 'error');
            return;
        }

        try {
            const response = await chrome.tabs.sendMessage(tab.id, { action: 'collectProfiles' });
            if (response?.profiles?.length > 0) {
                AppState.collectedProfiles.push(...response.profiles);
                ProfileManager.updateList();
                DOMCache.get('collected-number').textContent = AppState.collectedProfiles.length;
                Utils.showNotification(`Collected ${response.profiles.length} profiles`);
            }
        } catch (error) {
            console.error('Error collecting profiles:', error);
            Utils.showNotification('Error collecting profiles. Please refresh the page.', 'error');
        }
    }
};

// === PROFILE MANAGER ===
const ProfileManager = {
    async view() {
        const result = await StorageAPI.get([CONSTANTS.STORAGE_KEYS.PROFILES]);
        const profiles = result.collectedProfiles || [];
        const profilesList = DOMCache.get('profiles-list');

        if (profiles.length === 0) {
            profilesList.innerHTML = '<div class="empty-state">No profiles collected yet</div>';
        } else {
            profilesList.innerHTML = profiles.map(profile => `
                <div class="profile-item">
                    <div class="profile-name">${profile.name}</div>
                    <div class="profile-details">${profile.title} at ${profile.company}</div>
                    <div class="profile-url">${profile.url}</div>
                </div>
            `).join('');
        }

        DOMCache.get('profiles-modal').style.display = 'block';
    },

    async export() {
        const result = await StorageAPI.get([CONSTANTS.STORAGE_KEYS.PROFILES]);
        const profiles = result.collectedProfiles || [];

        if (profiles.length === 0) {
            Utils.showNotification('No profiles to export', 'warning');
            return;
        }

        const csvContent = [
            'name,profile_url,company,title',
            ...profiles.map(p => `"${p.name}","${p.url}","${p.company}","${p.title}"`)
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `linkedin_profiles_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        Utils.showNotification('Profiles exported successfully!');
    },

    async createCampaign() {
        const result = await StorageAPI.get([CONSTANTS.STORAGE_KEYS.PROFILES]);
        const profiles = result.collectedProfiles || [];

        if (profiles.length === 0) {
            Utils.showNotification('No profiles to create campaign from', 'warning');
            return;
        }

        DOMCache.get('profiles-modal').style.display = 'none';
        ModalManager.openCampaignModal();

        AppState.collectedProfiles = profiles;
        DOMCache.get('campaign-name').value = `Campaign from ${profiles.length} profiles`;
        WizardManager.showStep(3, 'collecting');
        this.updateList();
        DOMCache.get('collected-number').textContent = profiles.length;
    },

    updateList() {

        const listElement = DOMCache.get('collected-profiles-list');
        if (!listElement) {

            return;
        }

        listElement.innerHTML = '';

        AppState.collectedProfiles.forEach((profile, index) => {

            listElement.appendChild(Utils.createProfileCard(profile));
        });

    },

    async loadCount() {
        const result = await StorageAPI.get([CONSTANTS.STORAGE_KEYS.PROFILES]);
        const profiles = result.collectedProfiles || [];
        DOMCache.get('profile-count').textContent = profiles.length;
    }
};

// === NETWORK MANAGER ===
const NetworkManager = {
    openSearch() {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.tabs.update(tabs[0].id, { url: CONSTANTS.URLS.NETWORK_SEARCH }, () => {
                Utils.showNotification('LinkedIn network search opened. Use the filters to refine your search, then click "Start Collecting People"', 'info');
            });
        });
    },

    browseConnections() {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.tabs.update(tabs[0].id, { url: CONSTANTS.URLS.CONNECTIONS }, () => {
                Utils.showNotification('LinkedIn connections page opened. You can browse and then click "Start Collecting People"', 'info');
            });
        });
    },

    startCollecting() {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tab = tabs[0];

            if (!tab.url.includes('linkedin.com')) {
                Utils.showNotification('Please navigate to LinkedIn first', 'error');
                return;
            }

            // Enable real-time mode and show campaign modal immediately
            const campaignModal = DOMCache.get('campaign-modal');
            if (campaignModal) {
                campaignModal.style.display = 'block';
                WizardManager.showStep(3, 'collecting');
            }

            Utils.showNotification('Starting real-time profile collection...', 'info');

            if (tab.url.includes('search/results/people') && tab.url.includes('network')) {
                this.startSearch(tab.id, { type: 'search', realTime: true });
            } else if (tab.url.includes('mynetwork') || tab.url.includes('connections')) {
                this.startSearch(tab.id, { type: 'connections', realTime: true });
            } else {
                this.openSearch();
                setTimeout(() => this.startSearch(tab.id, { type: 'search', realTime: true }), 3000);
            }
        });
    },

    async startSearch(tabId, searchCriteria) {
        try {
            await chrome.scripting.executeScript({
                target: { tabId }, files: ['content/linkedin-content.js']
            });

            // Start real-time monitoring (but don't collect existing profiles immediately)
            setTimeout(async () => {
                try {

                    // Start continuous real-time collection (without immediate collection)
                    chrome.tabs.sendMessage(tabId, {
                        action: 'startRealTimeCollection',
                        criteria: searchCriteria
                    });

                    Utils.showNotification('Real-time collection started! Profiles will appear as they are found.', 'info');

                } catch (error) {
                    console.error('Message sending error:', error);
                    Utils.showNotification('Collection started. Profiles will appear as they are found.', 'info');
                }
            }, 500);
        } catch (error) {
            console.error('Script injection error:', error);
            Utils.showNotification('Please refresh the LinkedIn page and try again.', 'error');
        }
    },

    addProfilesDirectly(profiles) {

        // Filter and clean profiles before adding
        const validProfiles = profiles.filter(profile => {
            const hasName = profile.name && profile.name.trim() &&
                           !profile.name.includes('Status is') &&
                           profile.name !== 'Unknown Name';
            const hasUrl = profile.url && profile.url.includes('/in/');

            if (!hasName || !hasUrl) {

                return false;
            }
            return true;
        });

        // Add valid profiles to collected profiles for the campaign
        AppState.collectedProfiles.push(...validProfiles);

        // Update the campaign wizard
        ProfileManager.updateList();
        DOMCache.get('collected-number').textContent = AppState.collectedProfiles.length;

        // Show success message
        Utils.showNotification(`Added ${validProfiles.length} profiles to campaign automatically`, 'success');

        // Ensure campaign modal is visible and show step 3
        const campaignModal = DOMCache.get('campaign-modal');
        if (campaignModal) {
            campaignModal.style.display = 'block';
            WizardManager.showStep(3, 'collecting');
        }

        // Keep collection active - user can manually pause if needed
    }
};

// === PROFILE URL MODAL ===
const ProfileURLModal = {
    show(profiles) {

        // Force close any existing modals first
        const campaignModal = DOMCache.get('campaign-modal');
        if (campaignModal) campaignModal.style.display = 'none';

        // Store profiles for later use
        AppState.selectedProfiles = profiles.map(profile => ({ ...profile, selected: true }));

        // Update count and populate list
        DOMCache.get('profile-count-display').textContent = profiles.length;
        this.populateList(profiles);
        this.setupEventListeners();
        this.forceShow();
    },

    populateList(profiles) {
        const profilesList = DOMCache.get('profile-urls-list');
        profilesList.innerHTML = '';

        profiles.forEach((profile, index) => {
            const cleanName = Utils.extractCleanName(profile);
            const profileItem = document.createElement('div');
            profileItem.className = 'profile-item';

            const profilePicUrl = profile.profilePic || '';
            profileItem.innerHTML = `
                <input type="checkbox" class="profile-checkbox" data-index="${index}" checked>
                <div class="profile-pic">
                    ${profilePicUrl ?
                        `<img src="${profilePicUrl}" alt="${cleanName}" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover; border: 2px solid #0073b1;">` :
                        `<div style="width: 50px; height: 50px; border-radius: 50%; background: #0073b1; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 18px;">${cleanName.charAt(0).toUpperCase()}</div>`
                    }
                </div>
                <div class="profile-info">
                    <div class="profile-name" style="font-weight: bold; color: #333;">${cleanName}</div>
                    <div class="profile-connection" style="color: #666; font-size: 12px;">• 1st degree connection</div>
                </div>
            `;
            profilesList.appendChild(profileItem);
        });
    },

    setupEventListeners() {
        DOMCache.getAll('.profile-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                const index = parseInt(checkbox.getAttribute('data-index'));
                AppState.selectedProfiles[index].selected = checkbox.checked;
                this.updateSelectedCount();
            });
        });
    },

    forceShow() {
        const modal = DOMCache.get('profile-urls-modal');
        if (modal) {
            modal.style.cssText = `
                display: block !important; position: fixed !important; z-index: 999999 !important;
                top: 0 !important; left: 0 !important; width: 100% !important; height: 100% !important;
                background: rgba(0,0,0,0.5) !important; visibility: visible !important; opacity: 1 !important;
            `;

            const modalContent = modal.querySelector('.modal-content');
            if (modalContent) {
                modalContent.style.cssText = `
                    background: white !important; margin: 5% auto !important; padding: 20px !important;
                    border-radius: 8px !important; width: 90% !important; max-width: 800px !important;
                    max-height: 80% !important; overflow-y: auto !important; position: relative !important;
                    z-index: 1000000 !important;
                `;
            }
        }
        this.updateSelectedCount();
    },

    close() {
        // Prevent automatic closing - just show a message or do nothing

        Utils.showNotification('Close button is disabled. Modal will remain open.', 'info');

        // Optional: Show a message to user about how to close
        // You can add a confirmation dialog here if needed:
        // if (confirm('Are you sure you want to close this modal?')) {
        //     DOMCache.get('profile-urls-modal').style.display = 'none';
        //     AppState.selectedProfiles = [];
        // }

        // For now, we just prevent the default close behavior
        return false;
    },

    // Add a new method for programmatic closing when needed
    forceClose() {
        DOMCache.get('profile-urls-modal').style.display = 'none';
        AppState.selectedProfiles = [];
    },

    selectAll() {
        const checkboxes = DOMCache.getAll('.profile-checkbox');
        const allChecked = Array.from(checkboxes).every(cb => cb.checked);

        checkboxes.forEach((checkbox, index) => {
            checkbox.checked = !allChecked;
            AppState.selectedProfiles[index].selected = !allChecked;
        });
        this.updateSelectedCount();
    },

    updateSelectedCount() {
        const selectedCount = AppState.selectedProfiles.filter(p => p.selected).length;
        const button = DOMCache.get('add-profiles-to-campaign');
        button.textContent = `Add Selected to Campaign (${selectedCount})`;
        button.disabled = selectedCount === 0;
    },

    addSelected() {
        const profilesToAdd = AppState.selectedProfiles.filter(p => p.selected);

        if (profilesToAdd.length === 0) {
            Utils.showNotification('Please select at least one profile', 'warning');
            return;
        }

        AppState.collectedProfiles.push(...profilesToAdd);
        ProfileManager.updateList();
        DOMCache.get('collected-number').textContent = AppState.collectedProfiles.length;

        this.forceClose();
        Utils.showNotification(`Added ${profilesToAdd.length} profiles to campaign`, 'success');

        const campaignModal = DOMCache.get('campaign-modal');
        if (campaignModal) {
            campaignModal.style.display = 'block';
            WizardManager.showStep(3, 'collecting');
        }
    }
};

function startNetworkSearch(tabId, searchCriteria) {

    // First ensure content script is injected (Manifest V3 way)
    chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content/linkedin-content.js']
    }).then(() => {

        // Wait a moment for script to initialize
        setTimeout(() => {
            // Send message with timeout handling
            const messageTimeout = setTimeout(() => {

                showNotification('Collecting profiles... This may take a moment.', 'info');
            }, 5000);

            chrome.tabs.sendMessage(tabId, {
                action: 'searchNetwork',
                criteria: searchCriteria
            }).then(response => {
                clearTimeout(messageTimeout);

                if (response && response.profiles && response.profiles.length > 0) {

                    // Add profiles directly to campaign without approval modal
                    NetworkManager.addProfilesDirectly(response.profiles);
                } else {

                    if (response && response.error) {
                        Utils.showNotification(`Error: ${response.error}`, 'error');
                    } else {
                        // Try fallback with collectProfiles

                        chrome.tabs.sendMessage(tabId, { action: 'collectProfiles' }).then(fallbackResponse => {

                            if (fallbackResponse && fallbackResponse.profiles && fallbackResponse.profiles.length > 0) {

                                NetworkManager.addProfilesDirectly(fallbackResponse.profiles);
                            } else {
                                Utils.showNotification('No profiles found matching your criteria', 'warning');
                            }
                        }).catch(fallbackError => {
                            console.error('Fallback error:', fallbackError);
                            Utils.showNotification('No profiles found matching your criteria', 'warning');
                        });
                    }
                }
            }).catch(error => {
                clearTimeout(messageTimeout);
                console.error('Message sending error:', error);
                showNotification('Profiles collected! Check the list below.', 'success');

                // Try to get any profiles that might have been collected
                chrome.storage.local.get(['collectedProfiles'], function(result) {
                    if (result.collectedProfiles && result.collectedProfiles.length > 0) {
                        collectedProfiles = result.collectedProfiles;
                        updateCollectedProfilesList();
                        document.getElementById('collected-number').textContent = result.collectedProfiles.length;
                    }
                });
            });
        }, 1000);
    }).catch(error => {
        console.error('Script injection error:', error);
        // Try without injection - script might already be there
        chrome.tabs.sendMessage(tabId, {
            action: 'searchNetwork',
            criteria: searchCriteria
        }, function(response) {
            if (chrome.runtime.lastError) {
                console.error('Message sending error:', chrome.runtime.lastError);
                showNotification('Please refresh the LinkedIn page and try again.', 'error');
                return;
            }

            if (response && response.profiles) {

                // Add collected profiles
                chrome.storage.local.get(['collectedProfiles'], function(result) {
                    const existing = result.collectedProfiles || [];
                    const newProfiles = response.profiles.filter(profile =>
                        !existing.some(existing => existing.url === profile.url)
                    );

                    const updated = [...existing, ...newProfiles];

                    chrome.storage.local.set({ collectedProfiles: updated }, function() {
                        collectedProfiles = updated;
                        updateCollectedProfilesList();
                        document.getElementById('collected-number').textContent = updated.length;
                        showNotification(`Collected ${newProfiles.length} profiles from your network`);
                    });
                });
            } else {

                showNotification('No profiles found. Try scrolling down to load more results.', 'warning');
            }
        });
    });
}

// Load collected profiles
function loadCollectedProfiles() {
    chrome.storage.local.get(['collectedProfiles'], function(result) {
        const profiles = result.collectedProfiles || [];
        document.getElementById('profile-count').textContent = profiles.length;
    });
}

// Profile URLs Popup Functions
let selectedProfiles = [];

function showProfileUrlsPopup(profiles) {

    // Force close any existing modals first
    const campaignModal = document.getElementById('campaign-modal');
    if (campaignModal) {
        campaignModal.style.display = 'none';

    }

    // Store profiles for later use
    selectedProfiles = profiles.map(profile => ({ ...profile, selected: true }));

    // Update count
    document.getElementById('profile-count-display').textContent = profiles.length;

    // Populate the list
    const profilesList = document.getElementById('profile-urls-list');
    profilesList.innerHTML = '';

    profiles.forEach((profile, index) => {
        const profileItem = document.createElement('div');
        profileItem.className = 'profile-item';
        // Extract clean name - try multiple sources
        let cleanName = 'Unknown Name';

        // First try the name field directly
        if (profile.name && profile.name !== 'Status is reachable') {
            cleanName = profile.name.trim();
        }
        // If name field is not useful, try extracting from location
        else if (profile.location) {
            // Extract just the name part before "View" or other text
            const nameMatch = profile.location.match(/^([^V•\n]+?)(?:View|•|\n|$)/);
            if (nameMatch) {
                cleanName = nameMatch[1].trim();
            }
        }

        // Clean up any remaining artifacts
        cleanName = cleanName.replace(/\s+/g, ' ').trim();

        const profilePicUrl = profile.profilePic || '';

        profileItem.innerHTML = `
            <input type="checkbox" class="profile-checkbox" data-index="${index}" checked>
            <div class="profile-pic">
                ${profilePicUrl ?
                    `<img src="${profilePicUrl}" alt="${cleanName}" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover; border: 2px solid #0073b1;">` :
                    `<div style="width: 50px; height: 50px; border-radius: 50%; background: #0073b1; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 18px;">${cleanName.charAt(0).toUpperCase()}</div>`
                }
            </div>
            <div class="profile-info">
                <div class="profile-name" style="font-weight: bold; color: #333;">${cleanName}</div>
                <div class="profile-connection" style="color: #666; font-size: 12px;">• 1st degree connection</div>
            </div>
        `;
        profilesList.appendChild(profileItem);
    });

    // Add event listeners to checkboxes
    document.querySelectorAll('.profile-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            const index = parseInt(this.getAttribute('data-index'));
            selectedProfiles[index].selected = this.checked;
            updateSelectedCount();
        });
    });

    // Show the modal with maximum visibility
    const modal = document.getElementById('profile-urls-modal');
    if (modal) {
        // Force show with all possible overrides
        modal.style.cssText = `
            display: block !important;
            position: fixed !important;
            z-index: 999999 !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            height: 100% !important;
            background: rgba(0,0,0,0.5) !important;
            visibility: visible !important;
            opacity: 1 !important;
        `;

        // Also ensure modal content is visible
        const modalContent = modal.querySelector('.modal-content');
        if (modalContent) {
            modalContent.style.cssText = `
                background: white !important;
                margin: 5% auto !important;
                padding: 20px !important;
                border-radius: 8px !important;
                width: 90% !important;
                max-width: 800px !important;
                max-height: 80% !important;
                overflow-y: auto !important;
                position: relative !important;
                z-index: 1000000 !important;
            `;
        }
    } else {
        console.error('Profile URLs modal not found!');
    }
    updateSelectedCount();
}

function closeProfileUrlsPopup() {
    // Prevent automatic closing - just show a message or do nothing

    // Optional: Show a message to user about how to close
    // You can add a confirmation dialog here if needed:
    // if (confirm('Are you sure you want to close this modal?')) {
    //     document.getElementById('profile-urls-modal').style.display = 'none';
    //     selectedProfiles = [];
    // }

    // For now, we just prevent the default close behavior
    return false;
}

// Add a new function for programmatic closing when needed
function forceCloseProfileUrlsPopup() {
    document.getElementById('profile-urls-modal').style.display = 'none';
    selectedProfiles = [];
}

function selectAllProfiles() {
    const checkboxes = document.querySelectorAll('.profile-checkbox');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);

    checkboxes.forEach((checkbox, index) => {
        checkbox.checked = !allChecked;
        selectedProfiles[index].selected = !allChecked;
    });

    updateSelectedCount();
}

function updateSelectedCount() {
    const selectedCount = selectedProfiles.filter(p => p.selected).length;
    const button = document.getElementById('add-profiles-to-campaign');
    button.textContent = `Add Selected to Campaign (${selectedCount})`;
    button.disabled = selectedCount === 0;
}

// This function is now replaced by NetworkManager.addProfilesDirectly()
// Keeping for backward compatibility but redirecting to new implementation
function addProfilesDirectlyToCampaign(profiles) {
    NetworkManager.addProfilesDirectly(profiles);
}

function addSelectedProfilesToCampaign() {
    // This function is now handled by ProfileURLModal.addSelected()
    // Keeping for backward compatibility
    ProfileURLModal.addSelected();
}
