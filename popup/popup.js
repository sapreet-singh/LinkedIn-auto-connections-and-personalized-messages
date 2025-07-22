// LinkedIn Automation Popup
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
    },
    API: {
        BASE_URL: 'http://localhost:7008/api/linkedin',
        ENDPOINTS: {
            MESSAGES: '/messages'
        }
    }
};

// API Service for LinkedIn message generation
const APIService = {
    async generateMessage(profileUrl) {
        try {
            const response = await fetch(`${CONSTANTS.API.BASE_URL}${CONSTANTS.API.ENDPOINTS.MESSAGES}`, {
                method: 'POST',
                headers: {
                    'accept': '*/*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    url: profileUrl
                })
            });

            if (!response.ok) {
                throw new Error(`API request failed: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.error('API call failed:', error);
            throw error;
        }
    },

    async generateMessagesForProfiles(profiles, maxProfiles = 10) {
        const limitedProfiles = profiles.slice(0, maxProfiles);
        const results = [];

        for (const profile of limitedProfiles) {
            try {
                const messageData = await this.generateMessage(profile.url);
                results.push({
                    profile,
                    messageData,
                    success: true
                });
            } catch (error) {
                results.push({
                    profile,
                    error: error.message,
                    success: false
                });
            }
        }

        return results;
    }
};

// Message Generator for AI-powered personalized messages
const MessageGenerator = {
    async generateMessages() {
        const generateBtn = DOMCache.get('generate-messages');
        const statusDiv = DOMCache.get('generation-status');
        const messagesDiv = DOMCache.get('generated-messages');
        const messagesList = DOMCache.get('messages-list');
        const summaryDiv = DOMCache.get('generation-summary');

        // Show loading state
        generateBtn.disabled = true;
        generateBtn.textContent = 'GENERATING...';
        statusDiv.style.display = 'flex';
        messagesDiv.style.display = 'none';

        try {
            // Get collected profiles (limit to 10)
            const profiles = AppState.collectedProfiles.slice(0, 10);

            if (profiles.length === 0) {
                Utils.showNotification('No profiles available for message generation', 'warning');
                return;
            }

            // Generate messages using API
            const results = await APIService.generateMessagesForProfiles(profiles);

            // Display results
            this.displayGeneratedMessages(results, messagesList);

            // Show results section
            statusDiv.style.display = 'none';
            messagesDiv.style.display = 'block';

            // Update summary
            const successCount = results.filter(r => r.success).length;
            const totalCount = results.length;

            summaryDiv.innerHTML = `
                <strong>Generation Complete:</strong>
                ${successCount}/${totalCount} messages generated successfully
            `;

            Utils.showNotification(`Generated ${successCount} personalized messages`, 'success');

        } catch (error) {
            console.error('Message generation failed:', error);
            Utils.showNotification('Failed to generate messages. Please check your API connection.', 'error');
            statusDiv.style.display = 'none';
        } finally {
            generateBtn.disabled = false;
            generateBtn.textContent = '🤖 ANALYZE & GENERATE MESSAGES';
        }
    },

    displayGeneratedMessages(results, container) {
        container.innerHTML = '';

        results.forEach((result) => {
            const messageItem = document.createElement('div');
            messageItem.className = 'message-item';

            const profileName = result.profile.name || 'Unknown Profile';

            if (result.success) {
                // Display successful message generation
                const data = result.messageData.data || result.messageData;
                const messageContent = data.message || 'Generated message content';
                const confidence = data.confidence || 'N/A';
                const followUpMessage = data.followUpMessage || '';

                messageItem.innerHTML = `
                    <div class="message-profile">${profileName}</div>
                    <div class="message-content">${messageContent}</div>
                    ${followUpMessage ? `<div class="message-content" style="margin-top: 8px; border-left-color: #28a745;"><strong>Follow-up:</strong> ${followUpMessage}</div>` : ''}
                    <div class="message-status success">✅ Generated (Confidence: ${confidence}%)</div>
                `;
            } else {
                // Display error
                messageItem.innerHTML = `
                    <div class="message-profile">${profileName}</div>
                    <div class="message-content" style="color: #e74c3c;">
                        Failed to generate message: ${result.error}
                    </div>
                    <div class="message-status error">❌ Generation failed</div>
                `;
            }

            container.appendChild(messageItem);
        });
    }
};

const AppState = {
    currentStep: 1, isAutoCollectionEnabled: true, collectedProfiles: [], duplicateProfiles: [],
    wizardInitialized: false, selectedProfiles: [], selectedMessages: []
};

const DOMCache = {
    elements: new Map(),
    get(id) {
        const cached = this.elements.get(id);
        if (cached) return cached;
        return this.cache(id);
    },
    cache(id) {
        const el = document.getElementById(id);
        this.elements.set(id, el);
        return el;
    },
    getAll(selector) { return document.querySelectorAll(selector); }
};

const Utils = {
    showNotification: (message, type = 'success') => {
        const status = DOMCache.get('status');
        status.textContent = message;
        status.className = `status ${type}`;
        setTimeout(() => { status.textContent = 'Ready'; status.className = 'status'; }, 3000);
    },

    updateCollectedCount: (count) => {
        ['collected-number', 'main-collected-number'].forEach(id => {
            const element = DOMCache.get(id);
            if (element) element.textContent = count;
        });
    },

    show: (element) => {
        if (element) {
            element.classList.remove('hidden');
            // Special handling for modals
            if (element.classList.contains('modal')) {
                element.style.display = 'block';
            }
        }
    },

    hide: (element) => {
        if (element) {
            element.classList.add('hidden');
            // Special handling for modals
            if (element.classList.contains('modal')) {
                element.style.display = 'none';
            }
        }
    },

    showById: (id) => {
        const element = DOMCache.get(id);
        if (element) {
            element.classList.remove('hidden');
            // Special handling for modals
            if (element.classList.contains('modal')) {
                element.style.display = 'block';
            }
        }
    },

    hideById: (id) => {
        const element = DOMCache.get(id);
        if (element) {
            element.classList.add('hidden');
            // Special handling for modals
            if (element.classList.contains('modal')) {
                element.style.display = 'none';
            }
        }
    },

    isVisible: (element) => {
        return element && !element.classList.contains('hidden');
    },

    extractCleanName: (profile) => {
        if ((!profile.name ||
             profile.name === 'Status is reachable' ||
             profile.name === 'Status is offline' ||
             profile.name.includes('Status is') ||
             profile.name.includes('View') ||
             profile.name.includes('•')) &&
            profile.location) {
            const nameMatch = profile.location.match(/^([A-Za-z\s]+?)(?:View|•|\n)/);
            if (nameMatch && nameMatch[1].trim().length > 2) {
                const extractedName = nameMatch[1].trim();
                return extractedName;
            }
        }

        if (profile.name && profile.name.trim() &&
            profile.name !== 'Status is reachable' &&
            profile.name !== 'Status is offline' &&
            !profile.name.includes('Status is') &&
            !profile.name.includes('View') &&
            !profile.name.includes('•')) {
            return profile.name.trim();
        }

        if (profile.title && profile.title.trim() &&
            !profile.title.includes('Status') &&
            !profile.title.includes('degree connection')) {
            return profile.title.split(' at ')[0].trim();
        }

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

const ModalManager = {
    init() {
        const campaignModal = DOMCache.get('campaign-modal');
        const profilesModal = DOMCache.get('profiles-modal');

        const createCampaignBtn = DOMCache.get('create-campaign');
        console.log('ModalManager.init - create-campaign button found:', createCampaignBtn);

        if (createCampaignBtn) {
            createCampaignBtn.addEventListener('click', () => {
                console.log('🚀 Create Campaign button clicked!');
                this.openCampaignModal();
            });
        } else {
            console.error('❌ create-campaign button not found!');
        }

        DOMCache.getAll('.close').forEach(btn => btn.addEventListener('click', (e) => this.handleCloseClick(e)));
        DOMCache.get('close-profiles')?.addEventListener('click', () => this.closeModal('profiles-modal'));

        window.addEventListener('click', (e) => {
            if (e.target === campaignModal || e.target === profilesModal) {
            }
        });
    },

    openCampaignModal() {
        console.log('openCampaignModal called');
        const modal = DOMCache.get('campaign-modal');
        console.log('Campaign modal element:', modal);

        if (modal) {
            // Remove hidden class and set display to block for modal
            modal.classList.remove('hidden');
            modal.style.display = 'block';
            console.log('Modal display set to block and hidden class removed');
        }

        WizardManager.initialize();
        console.log('WizardManager initialized');

        WizardManager.showStep(CONSTANTS.STEPS.CAMPAIGN_NAME);
        console.log('Showing step:', CONSTANTS.STEPS.CAMPAIGN_NAME);
    },

    closeCampaignModal() {
        const modal = DOMCache.get('campaign-modal');
        if (modal) {
            modal.classList.add('hidden');
            modal.style.display = 'none';
        }
        WizardManager.reset();
    },

    handleCloseClick(e) {
        e.preventDefault();
        e.stopPropagation();
        Utils.showNotification('Close button is disabled. Modal will remain open.', 'info');
        return false;
    },

    closeModal(modalIdOrEvent) {
        const modalId = typeof modalIdOrEvent === 'string' ? modalIdOrEvent :
                       modalIdOrEvent.target.closest('#campaign-modal') ? 'campaign-modal' : null;
        if (modalId) {
            const modal = DOMCache.get(modalId);
            if (modal) {
                modal.classList.add('hidden');
                modal.style.display = 'none';
            }
            if (modalId === 'campaign-modal') WizardManager.reset();
        }
    },

    forceCloseAll() {
        ['campaign-modal', 'profiles-modal', 'profile-urls-modal'].forEach(modalId => {
            const modal = DOMCache.get(modalId);
            if (modal) {
                modal.classList.add('hidden');
                modal.style.display = 'none';
            }
        });
        WizardManager.reset();
        AppState.selectedProfiles = [];
        Utils.showNotification('All modals have been closed.', 'success');
    }
};

const WizardManager = {
    initialize() {
        console.log('WizardManager.initialize called, wizardInitialized:', AppState.wizardInitialized);
        if (AppState.wizardInitialized) {
            console.log('Wizard already initialized, skipping');
            return;
        }
        AppState.wizardInitialized = true;
        console.log('Setting up wizard event listeners');
        this.setupEventListeners();
    },

    reset() {
        console.log('WizardManager.reset called');
        AppState.currentStep = 1;
        AppState.collectedProfiles = [];
        AppState.duplicateProfiles = [];
        AppState.wizardInitialized = false; // Reset initialization flag
        const campaignNameInput = DOMCache.get('campaign-name');
        if (campaignNameInput) campaignNameInput.value = '';
        const elements = ['collected-number', 'collected-profiles-list'];
        elements.forEach(id => {
            const el = DOMCache.get(id);
            if (el) el.textContent = id === 'collected-number' ? '0' : '';
        });
    },

    showStep(stepNumber, subStep = null) {
        console.log(`🔄 Showing step ${stepNumber}, subStep: ${subStep}`);

        // Get all wizard steps and log them
        const allSteps = DOMCache.getAll('.wizard-step');
        console.log('All wizard steps found:', allSteps.length, Array.from(allSteps).map(s => s.id));

        // Remove active class from all steps
        allSteps.forEach(step => {
            console.log(`Removing active from step: ${step.id}`);
            step.classList.remove('active');
        });

        const stepMap = {
            1: 'step-1', 2: 'step-2', 4: 'step-4-messaging',
            3: subStep ? `step-3-${subStep}` : 'step-3-collecting'
        };

        const targetStepId = stepMap[stepNumber];
        console.log(`Target step ID: ${targetStepId}`);

        const stepElement = DOMCache.get(targetStepId);
        console.log(`Step element for ${stepNumber} (${targetStepId}):`, stepElement);

        if (stepElement) {
            stepElement.classList.add('active');
            console.log(`✅ Added active class to step: ${targetStepId}`);
        } else {
            console.error(`❌ Step element not found: ${targetStepId}`);
        }

        AppState.currentStep = stepNumber;

        // Initialize Step 4 when showing it
        if (stepNumber === 4) {
            console.log('Initializing Step 4');
            Step4Manager.init();
            Step4Manager.showProfileSelection();
        }
    },

    setupEventListeners() {
        const eventMap = {
            'next-step-1': () => this.validateAndProceed(),
            'back-to-step-1': () => this.showStep(1),
            'back-to-step-2': () => this.showStep(2),
            'back-to-search': () => this.showStep(3, 'search'),
            'back-to-step-2-from-network': () => this.showStep(2),
            'back-to-collecting': () => this.showStep(3, 'collecting'),
            'next-to-messaging': () => {
                console.log('Next button clicked, going to step 4');
                this.showStep(4);
            },
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
            'create-campaign-final': () => this.handleFinalStep(),
            'exclude-duplicates': () => DuplicateManager.exclude(),
            'cancel-duplicates': () => DuplicateManager.cancel(),
            'single-message-radio': () => Utils.hideById('follow-up-config'),
            'multi-step-radio': () => Utils.showById('follow-up-config'),
            'generate-messages': () => MessageGenerator.generateMessages()
        };

        console.log('🔧 Setting up wizard event listeners');
        Object.entries(eventMap).forEach(([id, handler]) => {
            const element = DOMCache.get(id);
            if (element) {
                console.log(`✅ Adding event listener for: ${id}`);
                element.addEventListener('click', handler);
            } else {
                console.log(`❌ Element not found for: ${id}`);
            }
        });

        const csvInput = DOMCache.get('csv-file-input');
        if (csvInput) {
            console.log('✅ Adding CSV input change listener');
            csvInput.addEventListener('change', CSVHandler.upload);
        } else {
            console.log('❌ CSV input not found');
        }
    },

    validateAndProceed() {
        console.log('🔍 validateAndProceed called');
        const campaignNameInput = DOMCache.get('campaign-name');
        console.log('Campaign name input element:', campaignNameInput);

        const campaignName = campaignNameInput?.value.trim();
        console.log('Campaign name value:', campaignName);

        if (!campaignName) {
            console.log('❌ No campaign name provided');
            Utils.showNotification('Please enter a campaign name', 'error');
            campaignNameInput?.focus();
            return;
        }

        console.log('✅ Campaign name valid, proceeding to step 2');
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

const CSVHandler = {
    upload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const profiles = this.parseCSV(e.target.result).map(profile => ({
                ...profile,
                collectedAt: new Date().toISOString()
            }));
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

        Utils.showById('duplicates-modal');
    },

    exclude() {
        AppState.collectedProfiles = AppState.collectedProfiles.filter(profile =>
            !AppState.duplicateProfiles.some(dup => dup.url === profile.url)
        );
        Utils.hideById('duplicates-modal');
        CampaignManager.finalize();
    },

    cancel() {
        Utils.hideById('duplicates-modal');
        CampaignManager.finalize();
    }
};

const RealTimeProfileHandler = {
    init() {
        chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
            if (message.action === 'addProfilesRealTime' && message.profiles) {
                this.handleRealTimeProfiles(message.profiles);
                sendResponse({ success: true });
                return true;
            }
        });
    },

    handleRealTimeProfiles(profiles) {
        if (!AppState.isAutoCollectionEnabled) {
            return;
        }

        const validProfiles = profiles.filter(profile => {
            const hasName = profile.name && profile.name.trim() &&
                           !profile.name.includes('Status is') &&
                           profile.name !== 'Unknown Name';
            const hasUrl = profile.url && profile.url.includes('/in/');

            return hasName && hasUrl;
        });

        if (validProfiles.length > 0) {
            const newProfiles = validProfiles.filter(newProfile => {
                return !AppState.collectedProfiles.some(existingProfile =>
                    existingProfile.url === newProfile.url
                );
            });

            if (newProfiles.length > 0) {
                const processedProfiles = newProfiles.map(profile => ({
                    ...profile,
                    collectedAt: new Date().toISOString()
                }));
                AppState.collectedProfiles.push(...processedProfiles);
                const campaignModal = DOMCache.get('campaign-modal');
                if (campaignModal && !Utils.isVisible(campaignModal)) {
                    Utils.show(campaignModal);
                    WizardManager.showStep(3, 'collecting');
                    setTimeout(() => {
                        this.updateUIAfterModalOpen(newProfiles.length);
                    }, 100);
                } else {
                    this.updateUIAfterModalOpen(newProfiles.length);
                }
            }
        }
    },

    updateUIAfterModalOpen(newProfileCount) {
        ProfileManager.updateList();
        const counterElement = DOMCache.get('collected-number');
        if (counterElement) {
            counterElement.textContent = AppState.collectedProfiles.length;
        }
        Utils.showNotification(`✅ Added ${newProfileCount} new profiles (Total: ${AppState.collectedProfiles.length})`, 'success');
    }
};

document.addEventListener('DOMContentLoaded', async function() {
    TabManager.init();
    ModalManager.init();
    RealTimeProfileHandler.init();
    AutoCollectionHandler.init();

    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && e.key === 'X') {
            e.preventDefault();
            ModalManager.forceCloseAll();
        }
    });

    const eventMap = {
        'collect-profiles': ProfileCollector.collectFromPage,
        'view-collected': ProfileManager.view,
        'export-profiles': ProfileManager.export,
        'create-campaign-from-profiles': ProfileManager.createCampaign,
        'close-profile-urls': ProfileURLModal.close,
        'select-all-profiles': ProfileURLModal.selectAll,
        'add-profiles-to-campaign': ProfileURLModal.addSelected,
        'save-settings': StorageAPI.saveSettings,
        'save-messages': StorageAPI.saveMessages,
        'pause-collection': ProfileCollector.toggleAutoCollection,
        'main-pause-collection': ProfileCollector.toggleAutoCollection
    };

    Object.entries(eventMap).forEach(([id, handler]) => {
        const element = DOMCache.get(id);
        if (element) {
            element.addEventListener('click', handler);
        }
    });

    await Promise.all([
        StorageAPI.loadSettings(),
        StorageAPI.loadMessages(),
        CampaignManager.load(),
        ProfileManager.loadCount()
    ]);

    AppState.isAutoCollectionEnabled = true;
    ProfileCollector.updateAutoCollectionButtons([DOMCache.get('pause-collection'), DOMCache.get('main-pause-collection')], true);
    AutoCollectionHandler.hideAutoIndicator();
});

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
            <div class="campaign-messaging">
                Strategy: ${campaign.messagingStrategy?.type === 'multi' ? 'Multi-Step Follow-Up' : 'Single Message'}
                ${campaign.messagingStrategy?.hasGeneratedMessages ? ' | 🤖 AI Messages Generated' : ''}
                ${campaign.messagingStrategy?.type === 'multi' ? ` | ${campaign.messagingStrategy.followUpCount} follow-ups` : ''}
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

        // Check if messages were generated
        const generatedMessagesDiv = DOMCache.get('generated-messages');
        const hasGeneratedMessages = generatedMessagesDiv && generatedMessagesDiv.style.display !== 'none';

        const newCampaign = {
            id: Date.now(), name: campaignName, profiles: AppState.collectedProfiles,
            maxConnections: AppState.collectedProfiles.length, progress: 0, status: 'ready',
            createdAt: new Date().toISOString(),
            messagingStrategy: {
                type: messagingStrategy, followUpCount: messagingStrategy === 'multi' ? followUpCount : 0,
                followUpDelay,
                hasGeneratedMessages: hasGeneratedMessages,
                generatedAt: hasGeneratedMessages ? new Date().toISOString() : null
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

const AutoCollectionHandler = {
    init() {
        chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
            if (message.action === 'autoCollectionStarted') {
                this.handleAutoCollectionStarted();
                sendResponse({ success: true });
            }
        });
        this.checkAutoStart();
    },

    async checkAutoStart() {
        try {
            const tabs = await new Promise(resolve => chrome.tabs.query({ active: true, currentWindow: true }, resolve));
            const tab = tabs[0];

            if (tab.url.includes('linkedin.com')) {
                try {
                    await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        files: ['content/linkedin-content.js']
                    });
                } catch (error) {
                    console.error('Error injecting content script:', error);
                }
            }
        } catch (error) {
            console.error('Error checking auto-start:', error);
        }
    },

    handleAutoCollectionStarted() {
        // Only show modal if user is actively creating a campaign
        const campaignModal = DOMCache.get('campaign-modal');
        if (campaignModal && Utils.isVisible(campaignModal)) {
            WizardManager.showStep(3, 'collecting');
        }

        // Initialize profile list if empty
        if (AppState.collectedProfiles.length === 0) {
            AppState.collectedProfiles = [];
            ProfileManager.updateList();
            Utils.updateCollectedCount('0');
        }

        // Show that auto collection is working
        Utils.showNotification('🔄 Auto-collecting profiles from this page...', 'info');
    },

    hideAutoIndicator() {
        Utils.hideById('auto-detection-indicator');
        Utils.hideById('main-auto-detection-indicator');
    },

    showAutoIndicator() {
        const indicator = DOMCache.get('auto-detection-indicator');
        const mainIndicator = DOMCache.get('main-auto-detection-indicator');
        if (indicator) {
            indicator.classList.remove('hidden');
            indicator.style.display = 'flex'; // Keep flex display for layout
        }
        if (mainIndicator) {
            mainIndicator.classList.remove('hidden');
            mainIndicator.style.display = 'flex'; // Keep flex display for layout
        }
    }
};

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
                ).map(profile => ({
                    ...profile,
                    collectedAt: new Date().toISOString()
                }));

                const updated = [...existingProfiles, ...newProfiles];
                await StorageAPI.set({ collectedProfiles: updated });
                AppState.collectedProfiles = updated; // Update app state
                ProfileManager.updateList(); // This will trigger API calls
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
        AppState.isAutoCollectionEnabled = true;
        this.updateAutoCollectionButtons([DOMCache.get('pause-collection'), DOMCache.get('main-pause-collection')], true);
        AutoCollectionHandler.showAutoIndicator();
        this.startRealTimeCollection();
        Utils.showNotification('🔄 Auto collection enabled! Profiles will be collected automatically.', 'info');
    },

    async startRealTimeCollection() {
        const tabs = await new Promise(resolve => chrome.tabs.query({ active: true, currentWindow: true }, resolve));
        const tab = tabs[0];

        if (!tab.url.includes('linkedin.com')) {
            Utils.showNotification('Please navigate to a LinkedIn page first', 'error');
            return;
        }

        const campaignModal = DOMCache.get('campaign-modal');
        if (campaignModal) {
            Utils.show(campaignModal);
            WizardManager.showStep(3, 'collecting');
        }

        try {
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content/linkedin-content.js']
            });

            await chrome.tabs.sendMessage(tab.id, { action: 'startRealTimeCollection' });
            Utils.showNotification('Real-time collection started! Profiles will appear as found.', 'success');
        } catch (error) {
            console.error('Error starting real-time collection:', error);
            this.collectFromCurrentPage();
        }
    },

    toggleAutoCollection() {
        const pauseBtn = DOMCache.get('pause-collection');
        const mainPauseBtn = DOMCache.get('main-pause-collection');

        if (AppState.isAutoCollectionEnabled) {
            AppState.isAutoCollectionEnabled = false;
            this.updateAutoCollectionButtons([pauseBtn, mainPauseBtn], false);
            AutoCollectionHandler.hideAutoIndicator();
            this.sendAutoCollectionMessage('disableAutoCollection');
            Utils.showNotification('🔴 Auto collection disabled. Profiles will not be collected automatically.', 'info');
        } else {
            AppState.isAutoCollectionEnabled = true;
            this.updateAutoCollectionButtons([pauseBtn, mainPauseBtn], true);
            AutoCollectionHandler.showAutoIndicator();
            this.sendAutoCollectionMessage('enableAutoCollection');
            Utils.showNotification('🟢 Auto collection enabled! Profiles will be collected automatically on LinkedIn pages.', 'success');
        }
    },

    updateAutoCollectionButtons(buttons, enabled) {
        buttons.forEach(btn => {
            if (btn) {
                btn.textContent = enabled ? 'AUTO ON' : 'AUTO OFF';
                btn.className = enabled ? 'btn btn-success' : 'btn btn-secondary';
            }
        });
    },

    sendAutoCollectionMessage(action) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, { action });
            }
        });
    },

    continue() {
        if (AppState.isCollecting) this.collectFromCurrentPage();
    },

    // Removed duplicate collectFromCurrentPage() - functionality exists in collectFromPage()
};

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

        Utils.showById('profiles-modal');
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

        Utils.hideById('profiles-modal');
        ModalManager.openCampaignModal();

        AppState.collectedProfiles = profiles.map(profile => ({
            ...profile,
            collectedAt: new Date().toISOString()
        }));
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
        AppState.collectedProfiles.forEach((profile) => {
            listElement.appendChild(Utils.createProfileCard(profile));
        });

        // Show/hide NEXT button based on collected profiles
        const nextButton = DOMCache.get('next-to-messaging');
        console.log('UpdateList called, profiles:', AppState.collectedProfiles.length, 'nextButton:', nextButton);
        if (nextButton) {
            if (AppState.collectedProfiles.length > 0) {
                Utils.show(nextButton);
                nextButton.disabled = false;
                console.log('NEXT button shown');
            } else {
                Utils.hide(nextButton);
                console.log('NEXT button hidden');
            }
        }
    },



    async loadCount() {
        const result = await StorageAPI.get([CONSTANTS.STORAGE_KEYS.PROFILES]);
        const profiles = result.collectedProfiles || [];
        DOMCache.get('profile-count').textContent = profiles.length;
    }
};

// New Step 4 Profile Selection Manager
const Step4Manager = {
    selectedProfiles: [],
    generatedMessages: [],

    init() {
        this.setupEventListeners();
    },

    setupEventListeners() {
        const selectAllBtn = DOMCache.get('select-all-step4');
        const deselectAllBtn = DOMCache.get('deselect-all-step4');
        const generateBtn = DOMCache.get('generate-selected-messages');
        const useMessagesBtn = DOMCache.get('use-selected-messages');
        const regenerateBtn = DOMCache.get('regenerate-messages');

        if (selectAllBtn) selectAllBtn.addEventListener('click', () => this.selectAll());
        if (deselectAllBtn) deselectAllBtn.addEventListener('click', () => this.deselectAll());
        if (generateBtn) generateBtn.addEventListener('click', () => this.generateMessages());
        if (useMessagesBtn) useMessagesBtn.addEventListener('click', () => this.useSelectedMessages());
        if (regenerateBtn) regenerateBtn.addEventListener('click', () => this.regenerateMessages());
    },

    showProfileSelection() {
        const container = DOMCache.get('profiles-selection-list');
        if (!container) return;

        container.innerHTML = '';
        this.selectedProfiles = [];

        AppState.collectedProfiles.forEach((profile, index) => {
            const item = document.createElement('div');
            item.className = 'profile-selection-item';
            item.innerHTML = `
                <input type="checkbox" id="profile-${index}" data-index="${index}">
                <div class="profile-selection-info">
                    <div class="profile-selection-name">${profile.name}</div>
                    <a href="${profile.url}" class="profile-selection-url" target="_blank">${profile.url}</a>
                </div>
            `;

            const checkbox = item.querySelector('input[type="checkbox"]');
            checkbox.addEventListener('change', () => this.toggleProfile(index, checkbox.checked));

            container.appendChild(item);
        });

        this.updateSelectedCount();
    },

    toggleProfile(index, selected) {
        if (selected) {
            if (!this.selectedProfiles.includes(index)) {
                this.selectedProfiles.push(index);
            }
        } else {
            this.selectedProfiles = this.selectedProfiles.filter(i => i !== index);
        }
        this.updateSelectedCount();
        this.updateGenerateButton();
    },

    selectAll() {
        this.selectedProfiles = AppState.collectedProfiles.map((_, index) => index);
        this.updateCheckboxes();
        this.updateSelectedCount();
        this.updateGenerateButton();
    },

    deselectAll() {
        this.selectedProfiles = [];
        this.updateCheckboxes();
        this.updateSelectedCount();
        this.updateGenerateButton();
    },

    updateCheckboxes() {
        AppState.collectedProfiles.forEach((_, index) => {
            const checkbox = document.getElementById(`profile-${index}`);
            if (checkbox) {
                checkbox.checked = this.selectedProfiles.includes(index);
            }
        });
    },

    updateSelectedCount() {
        const countElement = DOMCache.get('selected-count-step4');
        if (countElement) {
            countElement.textContent = this.selectedProfiles.length;
        }
    },

    updateGenerateButton() {
        const generateBtn = DOMCache.get('generate-selected-messages');
        if (generateBtn) {
            generateBtn.disabled = this.selectedProfiles.length === 0;
        }
    },

    async generateMessages() {
        if (this.selectedProfiles.length === 0) {
            Utils.showNotification('Please select at least one profile', 'warning');
            return;
        }

        const generateBtn = DOMCache.get('generate-selected-messages');
        if (generateBtn) {
            generateBtn.disabled = true;
            generateBtn.textContent = 'Generating Messages...';
        }

        this.generatedMessages = [];

        try {
            for (const index of this.selectedProfiles) {
                const profile = AppState.collectedProfiles[index];
                console.log(`Calling API for: ${profile.url}`);

                try {
                    const response = await APIService.generateMessage(profile.url);
                    this.generatedMessages.push({
                        profile: profile,
                        message: response,
                        selected: true,
                        index: index
                    });
                    console.log(`API response for ${profile.url}:`, response);
                } catch (error) {
                    console.error(`API call failed for ${profile.url}:`, error);
                    this.generatedMessages.push({
                        profile: profile,
                        message: { error: error.message },
                        selected: false,
                        index: index
                    });
                }
            }

            // Automatically switch to message selection view
            console.log('About to call showMessageSelection()');
            console.log('Generated messages:', this.generatedMessages);
            this.showMessageSelection();
            Utils.showNotification(`Generated ${this.generatedMessages.length} messages`, 'success');

        } catch (error) {
            console.error('Message generation error:', error);
            Utils.showNotification('Error generating messages', 'error');
        } finally {
            if (generateBtn) {
                generateBtn.disabled = false;
                generateBtn.textContent = '🤖 Generate Messages for Selected Profiles';
            }
        }
    },

    showGeneratedMessages() {
        console.log('showGeneratedMessages called with:', this.generatedMessages);
        const resultsContainer = DOMCache.get('message-results');
        const messagesContainer = DOMCache.get('messages-container');

        console.log('Results container:', resultsContainer);
        console.log('Messages container:', messagesContainer);

        if (!resultsContainer || !messagesContainer) {
            console.log('Missing containers, returning');
            return;
        }

        messagesContainer.innerHTML = '';

        // Add a test message first to verify container is working
        messagesContainer.innerHTML = '<div style="background: lime; padding: 20px; margin: 10px; border: 2px solid green; font-weight: bold;">🧪 TEST: Container is working! Messages should appear below...</div>';

        this.generatedMessages.forEach((item, profileIndex) => {
            console.log(`Processing profile ${profileIndex}:`, item);
            const profileDiv = document.createElement('div');
            profileDiv.className = 'profile-messages-section';

            if (item.message.error) {
                // Handle error case
                profileDiv.innerHTML = `
                    <div class="profile-header">
                        <h4>${item.profile.name}</h4>
                        <span class="error-badge">Error</span>
                    </div>
                    <div class="error-message">Error: ${item.message.error}</div>
                `;
            } else {
                // Parse messages from API response
                const messages = this.parseMessagesFromResponse(item.message);
                console.log(`Parsed ${messages.length} messages for ${item.profile.name}:`, messages);

                if (messages.length === 0) {
                    console.error('No messages parsed for profile:', item.profile.name);
                    profileDiv.innerHTML = `
                        <div class="profile-header">
                            <h4>${item.profile.name}</h4>
                            <span class="error-badge">No Messages</span>
                        </div>
                        <div class="error-message">Failed to parse messages from API response</div>
                        <pre style="font-size: 11px; background: #f5f5f5; padding: 10px; margin: 10px; border-radius: 4px;">${JSON.stringify(item.message, null, 2)}</pre>
                    `;
                } else {
                    profileDiv.innerHTML = `
                    <div class="profile-header">
                        <h4>${item.profile.name}</h4>
                        <span class="message-count">${messages.length} messages generated</span>
                    </div>
                    <div class="messages-list">
                        ${messages.map((msg, msgIndex) => `
                            <div class="individual-message">
                                <div class="message-option">
                                    <input type="radio" name="profile-${profileIndex}-message"
                                           value="${msgIndex}" id="msg-${profileIndex}-${msgIndex}"
                                           ${msgIndex === 0 ? 'checked' : ''}>
                                    <label for="msg-${profileIndex}-${msgIndex}">
                                        <div class="message-text">${msg}</div>
                                    </label>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    <div class="profile-meta">
                        <span>Profile: ${item.profile.url}</span>
                        <span>Generated: ${new Date().toLocaleTimeString()}</span>
                    </div>
                `;

                // Add event listeners for radio buttons
                const radioButtons = profileDiv.querySelectorAll('input[type="radio"]');
                radioButtons.forEach(radio => {
                    radio.addEventListener('change', () => {
                        if (radio.checked) {
                            const selectedMessageIndex = parseInt(radio.value);
                            item.selectedMessage = messages[selectedMessageIndex];
                            item.selectedMessageIndex = selectedMessageIndex;
                            console.log(`Selected message ${selectedMessageIndex + 1} for ${item.profile.name}:`, item.selectedMessage);
                        }
                    });
                });

                // Set default selected message (first one)
                item.selectedMessage = messages[0];
                item.selectedMessageIndex = 0;
                }
            }

            messagesContainer.appendChild(profileDiv);
        });

        // Force the container to be visible with aggressive styling
        resultsContainer.style.display = 'block';
        resultsContainer.style.visibility = 'visible';
        resultsContainer.style.opacity = '1';
        resultsContainer.style.backgroundColor = '#ffeb3b'; // Bright yellow for debugging
        resultsContainer.style.border = '3px solid red'; // Red border for debugging
        resultsContainer.style.minHeight = '100px';
        resultsContainer.style.padding = '20px';
        resultsContainer.style.margin = '20px 0';

        console.log('Message results container should now be visible');
        console.log('Container styles applied:', resultsContainer.style.cssText);

        // Add a test message to verify the container is working
        if (messagesContainer.children.length === 0) {
            const noMessagesDiv = document.createElement('div');
            noMessagesDiv.className = 'no-messages-placeholder';
            noMessagesDiv.textContent = 'No messages generated or parsing failed';
            messagesContainer.appendChild(noMessagesDiv);
        }
    },

    parseMessagesFromResponse(apiResponse) {
        const messages = [];
        console.log('Parsing API response:', apiResponse);

        // Check if response has messages object
        if (apiResponse.messages) {
            console.log('Found messages object:', apiResponse.messages);
            // Extract messages from the messages object, excluding 'id' field
            Object.keys(apiResponse.messages).forEach(key => {
                if (key.startsWith('message') && apiResponse.messages[key] && key !== 'id') {
                    messages.push(apiResponse.messages[key]);
                    console.log(`Found ${key}:`, apiResponse.messages[key]);
                }
            });
        }

        // If no messages found, try to extract from root level
        if (messages.length === 0) {
            console.log('No messages in messages object, checking root level');
            Object.keys(apiResponse).forEach(key => {
                if (key.startsWith('message') && apiResponse[key]) {
                    messages.push(apiResponse[key]);
                    console.log(`Found root level ${key}:`, apiResponse[key]);
                }
            });
        }

        // If still no messages, return the whole response as a single message
        if (messages.length === 0) {
            console.log('No messages found, using full response');
            messages.push(JSON.stringify(apiResponse, null, 2));
        }

        console.log('Final parsed messages:', messages);
        return messages;
    },

    showMessageSelection() {
        console.log('🚀 showMessageSelection() called');
        console.log('Generated messages data:', this.generatedMessages);

        // Hide the profile selection step
        const profileSelectionStep = document.querySelector('.step[data-step="4"]');
        console.log('Profile selection step found:', profileSelectionStep);
        if (profileSelectionStep) {
            profileSelectionStep.style.display = 'none';
            console.log('Profile selection step hidden');
        }

        // Create and show message selection UI
        const container = document.querySelector('.container');
        console.log('Main container found:', container);
        if (!container) {
            console.error('Main container not found');
            return;
        }

        // Prepare messages data for display
        const messagesData = this.generatedMessages.map(item => {
            const messages = this.parseMessagesFromResponse(item.message);
            return {
                profile: item.profile,
                messages: messages,
                hasError: item.message.error || messages.length === 0
            };
        });

        // Create message selection interface
        const messageSelectionHTML = `
            <div class="message-selection-step" id="message-selection-step">
                <div class="step-header">
                    <button class="back-btn" id="back-to-profiles">← Back to Profile Selection</button>
                    <h3>Select Messages for Campaign</h3>
                    <p>Choose one message for each selected profile</p>
                </div>

                <div class="messages-container" id="message-selection-container">
                    ${messagesData.map((item, profileIndex) => `
                        <div class="profile-message-card">
                            <div class="profile-header">
                                <div class="profile-info">
                                    <h4>${item.profile.name}</h4>
                                    <p class="profile-title">${item.profile.title || 'LinkedIn Member'}</p>
                                    <a href="${item.profile.url}" target="_blank" class="profile-link">View Profile</a>
                                </div>
                            </div>

                            ${item.hasError ? `
                                <div class="error-section">
                                    <p class="error-text">❌ Failed to generate messages for this profile</p>
                                    <button class="btn-small btn-retry" onclick="retryProfile(${profileIndex})">🔄 Retry</button>
                                </div>
                            ` : `
                                <div class="message-options">
                                    <h5>Choose a message:</h5>
                                    ${item.messages.map((msg, msgIndex) => `
                                        <div class="message-option">
                                            <input type="radio"
                                                   name="message-${profileIndex}"
                                                   value="${msgIndex}"
                                                   id="msg-${profileIndex}-${msgIndex}"
                                                   ${msgIndex === 0 ? 'checked' : ''}>
                                            <label for="msg-${profileIndex}-${msgIndex}" class="message-label">
                                                <div class="message-text">${msg}</div>
                                            </label>
                                        </div>
                                    `).join('')}
                                </div>
                            `}
                        </div>
                    `).join('')}
                </div>

                <div class="selection-actions">
                    <button class="btn btn-secondary" id="regenerate-all-messages">🔄 Regenerate All Messages</button>
                    <button class="btn btn-primary" id="create-campaign-with-messages">✅ Create Campaign with Selected Messages</button>
                </div>
            </div>
        `;

        // Add the message selection interface to the container
        console.log('About to insert HTML into container');
        console.log('HTML length:', messageSelectionHTML.length);
        container.insertAdjacentHTML('beforeend', messageSelectionHTML);
        console.log('HTML inserted successfully');

        // Add event listeners
        this.setupMessageSelectionListeners();

        console.log('✅ Message selection interface created and should be visible');
    },

    setupMessageSelectionListeners() {
        // Back button
        const backBtn = document.getElementById('back-to-profiles');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                document.getElementById('message-selection-step').remove();
                const profileStep = document.querySelector('.step[data-step="4"]');
                if (profileStep) {
                    profileStep.style.display = 'block';
                }
            });
        }

        // Create campaign button
        const createBtn = document.getElementById('create-campaign-with-messages');
        if (createBtn) {
            createBtn.addEventListener('click', () => {
                this.createCampaignWithSelectedMessages();
            });
        }

        // Regenerate all button
        const regenerateBtn = document.getElementById('regenerate-all-messages');
        if (regenerateBtn) {
            regenerateBtn.addEventListener('click', () => {
                // Go back to profile selection and regenerate
                document.getElementById('message-selection-step').remove();
                const profileStep = document.querySelector('.step[data-step="4"]');
                if (profileStep) {
                    profileStep.style.display = 'block';
                }
                this.generateMessages();
            });
        }
    },

    createCampaignWithSelectedMessages() {
        const selectedMessages = [];

        this.generatedMessages.forEach((item, profileIndex) => {
            const selectedRadio = document.querySelector(`input[name="message-${profileIndex}"]:checked`);
            if (selectedRadio) {
                const messageIndex = parseInt(selectedRadio.value);
                const messages = this.parseMessagesFromResponse(item.message);
                if (messages[messageIndex]) {
                    selectedMessages.push({
                        profile: item.profile,
                        message: messages[messageIndex]
                    });
                }
            }
        });

        console.log('Selected messages for campaign:', selectedMessages);

        if (selectedMessages.length === 0) {
            Utils.showNotification('Please select at least one message', 'warning');
            return;
        }

        // Store selected messages and proceed to create campaign
        this.selectedCampaignMessages = selectedMessages;

        // Show success and redirect to campaign creation
        Utils.showNotification(`Campaign created with ${selectedMessages.length} personalized messages!`, 'success');

        // Finalize campaign
        this.finalizeCampaign();
    },

    finalizeCampaign() {
        // Hide message selection
        const messageSelection = document.getElementById('message-selection-step');
        if (messageSelection) {
            messageSelection.remove();
        }

        // Show campaign success
        const container = document.querySelector('.container');
        container.innerHTML = `
            <div class="campaign-success">
                <div class="success-icon">✅</div>
                <h2>Campaign Created Successfully!</h2>
                <p>Your campaign with ${this.selectedCampaignMessages.length} personalized messages is ready.</p>

                <div class="campaign-summary">
                    <h4>Campaign Summary:</h4>
                    ${this.selectedCampaignMessages.map(item => `
                        <div class="summary-item">
                            <strong>${item.profile.name}</strong>
                            <p class="message-preview">"${item.message.substring(0, 100)}..."</p>
                        </div>
                    `).join('')}
                </div>

                <div class="final-actions">
                    <button class="btn btn-primary" onclick="window.close()">Close</button>
                    <button class="btn btn-secondary" onclick="location.reload()">Create Another Campaign</button>
                </div>
            </div>
        `;
    },

    useSelectedMessages() {
        // Get profiles that have generated messages (excluding errors)
        const profilesWithMessages = this.generatedMessages.filter(item =>
            !item.message.error && item.selectedMessage
        );

        if (profilesWithMessages.length === 0) {
            Utils.showNotification('No messages available to select', 'warning');
            return;
        }

        // Prepare final messages for campaign
        const finalMessages = profilesWithMessages.map(item => ({
            profile: item.profile,
            selectedMessage: item.selectedMessage,
            selectedMessageIndex: item.selectedMessageIndex,
            fullApiResponse: item.message
        }));

        // Store selected messages in AppState for campaign creation
        AppState.selectedMessages = finalMessages;

        Utils.showNotification(`Selected ${finalMessages.length} messages for campaign`, 'success');
        console.log('Final selected messages:', finalMessages);

        // Enable campaign creation
        const createBtn = DOMCache.get('create-campaign-final');
        if (createBtn) {
            createBtn.disabled = false;
            Utils.show(createBtn);
        }
    },

    regenerateMessages() {
        this.generateMessages();
    }
};

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

            const campaignModal = DOMCache.get('campaign-modal');
            if (campaignModal) {
                Utils.show(campaignModal);
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

            setTimeout(async () => {
                try {
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
        const validProfiles = profiles.filter(profile => {
            const hasName = profile.name && profile.name.trim() &&
                           !profile.name.includes('Status is') &&
                           profile.name !== 'Unknown Name';
            const hasUrl = profile.url && profile.url.includes('/in/');

            if (!hasName || !hasUrl) {
                return false;
            }
            return true;
        }).map(profile => ({
            ...profile,
            collectedAt: new Date().toISOString()
        }));

        AppState.collectedProfiles.push(...validProfiles);
        ProfileManager.updateList();
        DOMCache.get('collected-number').textContent = AppState.collectedProfiles.length;
        Utils.showNotification(`Added ${validProfiles.length} profiles to campaign automatically`, 'success');
        const campaignModal = DOMCache.get('campaign-modal');
        if (campaignModal) {
            Utils.show(campaignModal);
            WizardManager.showStep(3, 'collecting');
        }
    }
};

const ProfileURLModal = {
    show(profiles) {
        const campaignModal = DOMCache.get('campaign-modal');
        if (campaignModal) Utils.hide(campaignModal);
        AppState.selectedProfiles = profiles.map(profile => ({ ...profile, selected: true }));
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
        Utils.showNotification('Close button is disabled. Modal will remain open.', 'info');
        return false;
    },

    forceClose() {
        Utils.hideById('profile-urls-modal');
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

        const processedProfiles = profilesToAdd.map(profile => ({
            ...profile,
            collectedAt: new Date().toISOString()
        }));
        AppState.collectedProfiles.push(...processedProfiles);
        ProfileManager.updateList();
        DOMCache.get('collected-number').textContent = AppState.collectedProfiles.length;
        this.forceClose();
        Utils.showNotification(`Added ${profilesToAdd.length} profiles to campaign`, 'success');
        const campaignModal = DOMCache.get('campaign-modal');
        if (campaignModal) {
            Utils.show(campaignModal);
            WizardManager.showStep(3, 'collecting');
        }
    }
};