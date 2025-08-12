const CONSTANTS = {
    STEPS: { CAMPAIGN_NAME: 1, SOURCE_SELECTION: 2, PROFILE_COLLECTION: 3, MESSAGING: 4 },
    SUBSTEPS: { SEARCH: 'search', NETWORK: 'network', COLLECTING: 'collecting' },
    URLS: {
        NETWORK_SEARCH: 'https://www.linkedin.com/search/results/people/?network=%5B%22F%22%5D&origin=FACETED_SEARCH',
        CONNECTIONS: 'https://www.linkedin.com/mynetwork/invite-connect/connections/',
        PEOPLE_SEARCH: 'https://www.linkedin.com/search/results/people/',
        SALES_NAVIGATOR: 'https://www.linkedin.com/sales/search/people'
    },
    API: {
        BASE_URL: 'http://localhost:7008/api/linkedin',
        ENDPOINTS: { MESSAGES: '/messages' }
    }
};


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

    // Centralized event listener setup to eliminate duplication
    setupEventListeners: (eventMap) => {
        Object.entries(eventMap).forEach(([id, handler]) => {
            const element = DOMCache.get(id);
            if (element && !element.dataset.listenerAttached) {
                element.addEventListener('click', handler);
                element.dataset.listenerAttached = 'true';
            }
        });
    },

    // Centralized message handling to eliminate duplication
    sendTabMessage: async (tabId, message, retries = 3) => {
        for (let i = 0; i < retries; i++) {
            try {
                return await chrome.tabs.sendMessage(tabId, message);
            } catch (error) {
                if (i === retries - 1) {
                    console.error('Error sending tab message after retries:', error);
                    throw error;
                }
                // Wait before retrying
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    },

    sendCurrentTabMessage: async (message) => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab) {
                return await Utils.sendTabMessage(tab.id, message);
            }
            throw new Error('No active tab found');
        } catch (error) {
            console.error('Error sending message to current tab:', error);
            throw error;
        }
    },

    // Consolidated show/hide methods to eliminate duplication
    toggleElement: (element, show) => {
        if (!element) return;

        if (show) {
            element.classList.remove('hidden');
            if (element.classList.contains('modal')) {
                element.style.display = 'block';
            }
        } else {
            element.classList.add('hidden');
            if (element.classList.contains('modal')) {
                element.style.display = 'none';
            }
        }
    },

    show: (element) => Utils.toggleElement(element, true),
    hide: (element) => Utils.toggleElement(element, false),
    showById: (id) => Utils.toggleElement(DOMCache.get(id), true),
    hideById: (id) => Utils.toggleElement(DOMCache.get(id), false),

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



const ModalManager = {
    init() {
        const campaignModal = DOMCache.get('campaign-modal');
        const profilesModal = DOMCache.get('profiles-modal');

        const createCampaignBtn = DOMCache.get('create-campaign');

        if (createCampaignBtn) {
            createCampaignBtn.addEventListener('click', () => {
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
        Utils.showById('campaign-modal');
        WizardManager.initialize();
        WizardManager.showStep(CONSTANTS.STEPS.CAMPAIGN_NAME);
    },

    closeCampaignModal() {
        Utils.hideById('campaign-modal');
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
            Utils.hideById(modalId);
            if (modalId === 'campaign-modal') WizardManager.reset();
        }
    },

    forceCloseAll() {
        ['campaign-modal', 'profiles-modal', 'profile-urls-modal'].forEach(modalId => {
            Utils.hideById(modalId);
        });
        WizardManager.reset();
        AppState.selectedProfiles = [];
        Utils.showNotification('All modals have been closed.', 'success');
    }
};

const WizardManager = {
    initialize() {
        if (AppState.wizardInitialized) {
            return;
        }
        AppState.wizardInitialized = true;
        this.setupEventListeners();
    },

    reset() {
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
        // Get all wizard steps
        const allSteps = DOMCache.getAll('.wizard-step');

        // Remove active class from all steps
        allSteps.forEach(step => {
            step.classList.remove('active');
        });

        const stepMap = {
            1: 'step-1', 2: 'step-2', 4: 'step-4-messaging',
            3: subStep ? `step-3-${subStep}` : 'step-3-collecting'
        };

        const targetStepId = stepMap[stepNumber];
        const stepElement = DOMCache.get(targetStepId);

        if (stepElement) {
            stepElement.classList.add('active');
        } else {
            console.error(`❌ Step element not found: ${targetStepId}`);
        }

        AppState.currentStep = stepNumber;

        // Initialize Step 4 when showing it
        if (stepNumber === 4) {
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
            'back-to-step-2-from-sales-navigator': () => this.showStep(2),
            'back-to-collecting': () => this.showStep(3, 'collecting'),
            'next-to-messaging': () => {
                this.showStep(4);
            },
            'linkedin-search-option': () => this.showStep(3, 'search'),
            'sales-navigator-option': () => this.showStep(3, 'sales-navigator'),
            'network-option': () => this.showStep(3, 'network'),
            'csv-upload-btn': () => DOMCache.get('csv-file-input')?.click(),
            'csv-upload-btn-2': () => DOMCache.get('csv-file-input')?.click(),
            'show-filters': () => chrome.tabs.create({ url: CONSTANTS.URLS.PEOPLE_SEARCH }),
            'start-collecting': () => { this.showStep(3, 'collecting'); ProfileCollector.start(); },
             'start-multi-page-collecting': () => { this.showStep(3, 'collecting'); ProfileCollector.startMultiPage(); },
            'show-network-filters': () => NetworkManager.openSearch(),
            'start-network-collecting': () => { this.showStep(3, 'collecting'); NetworkManager.startCollecting(); },
            'start-network-multi-page-collecting': () => { this.showStep(3, 'collecting'); NetworkManager.startMultiPageCollecting(); },
            'browse-connections': () => NetworkManager.browseConnections(),
            'show-sales-navigator-filters': () => SalesNavigatorManager.openSearch(),
            'start-sales-navigator-collecting': () => { this.showStep(3, 'collecting'); SalesNavigatorManager.startCollecting(); },

            'create-campaign-final': () => this.handleFinalStep(),
            'exclude-duplicates': () => DuplicateManager.exclude(),
            'cancel-duplicates': () => DuplicateManager.cancel(),
            'single-message-radio': () => Utils.hideById('follow-up-config'),
            'multi-step-radio': () => Utils.showById('follow-up-config'),
            'generate-messages': () => MessageGenerator.generateMessages(),
            'collecting-profile': () => {
                NetworkManager.openSearch();
                setTimeout(() => NetworkManager.startMultiPageCollecting(), 1000); // Delay to allow filters to open
            },
            'pause-collection': () => CollectionManager.togglePause(),
        };

        Utils.setupEventListeners(eventMap);

        const csvInput = DOMCache.get('csv-file-input');
        if (csvInput && !csvInput.dataset.listenerAttached) {
            csvInput.addEventListener('change', CSVHandler.upload);
            csvInput.dataset.listenerAttached = 'true';
        }
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
    check() {
        // Simplified - no storage check, just proceed to finalize
        CampaignManager.finalize();
    },

    exclude() {
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
            } else if (message.action === 'collectionStatusUpdate' && message.message) {
                this.handleCollectionStatus(message.message);
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
    },

    handleCollectionStatus(statusMessage) {
        // Update the collection status indicator
        const autoDetectionIndicator = DOMCache.get('auto-detection-indicator');
        if (autoDetectionIndicator) {
            const statusSpan = autoDetectionIndicator.querySelector('span:last-child');
            if (statusSpan) {
                statusSpan.textContent = `🔄 ${statusMessage}`;
            }
            Utils.show(autoDetectionIndicator);
        }

        // Update page progress display
        this.updatePageProgress(statusMessage);

        // Also show as notification for important status updates
        if (statusMessage.includes('complete') || statusMessage.includes('error')) {
            const notificationType = statusMessage.includes('error') ? 'error' : 'success';
            Utils.showNotification(statusMessage, notificationType);
        }
    },

    updatePageProgress(statusMessage) {
        const currentPageElement = DOMCache.get('current-page-number');
        const totalPagesElement = DOMCache.get('total-pages');
        const progressFill = DOMCache.get('page-progress-fill');
        const pageProgress = DOMCache.get('page-progress');

        // Show page progress container
        if (pageProgress) {
            pageProgress.classList.add('visible');
            Utils.show(pageProgress);
        }

        // Parse status message for page information
        const pageMatch = statusMessage.match(/page (\d+)/i);
        if (pageMatch && currentPageElement && progressFill) {
            const currentPage = parseInt(pageMatch[1]);
            const totalPages = 4; // Always 4 pages for multi-page collection

            currentPageElement.textContent = currentPage;
            if (totalPagesElement) {
                totalPagesElement.textContent = totalPages;
            }

            // Update progress bar based on page progress
            const progressPercentage = (currentPage / totalPages) * 100;
            progressFill.style.width = `${progressPercentage}%`;
        }
    }
};

// Launch Interface Manager
const LaunchManager = {
    init() {
        this.setupLaunchButton();
        setTimeout(() => {
            this.checkCurrentState();
        }, 100);
    },

    async checkCurrentState() {
        try {
            if (typeof chrome !== 'undefined' && chrome.tabs) {
                const tabs = await chrome.tabs.query({ url: 'https://www.linkedin.com/*' });
                if (tabs.length > 0) {
                    this.showMainInterface();
                } else {
                    this.showLaunchInterface();
                }
            } else {
                this.showLaunchInterface();
            }
        } catch (error) {
            console.error('Error checking current state:', error);
            this.showLaunchInterface();
        }
    },

    showLaunchInterface() {
        const launchInterface = document.getElementById('launch-interface');
        const mainInterface = document.getElementById('main-interface');

        if (launchInterface && mainInterface) {
            launchInterface.classList.remove('hidden');
            mainInterface.classList.add('hidden');
        } else {
            console.error('Could not find interface elements');
        }
    },

    showMainInterface() {
        const launchInterface = document.getElementById('launch-interface');
        const mainInterface = document.getElementById('main-interface');

        if (launchInterface && mainInterface) {
            launchInterface.classList.add('hidden');
            mainInterface.classList.remove('hidden');
            this.setupMainInterfaceListeners();
        } else {
            console.error('Could not find interface elements');
        }
    },

    setupMainInterfaceListeners() {
        // Setup Sales Navigator button
        const salesNavBtn = document.getElementById('sales-navigator-btn');
        if (salesNavBtn && !salesNavBtn.dataset.listenerAttached) {
            salesNavBtn.addEventListener('click', () => {
                SalesNavigatorFloatingManager.launch();
            });
            salesNavBtn.dataset.listenerAttached = 'true';
        }

        // Setup Create Campaign button
        const createCampaignBtn = document.getElementById('create-campaign');
        if (createCampaignBtn && !createCampaignBtn.dataset.listenerAttached) {
            createCampaignBtn.addEventListener('click', () => {
                ModalManager.openCampaignModal();
            });
            createCampaignBtn.dataset.listenerAttached = 'true';
        }
    },

    setupLaunchButton() {
        console.log('Setting up launch button...');
        const launchBtn = document.getElementById('launch-linkedin');
        console.log('Launch button element:', launchBtn);

        if (launchBtn) {
            console.log('Adding click event listener to launch button');
            launchBtn.addEventListener('click', () => {
                console.log('Launch button clicked!');
                this.launchLinkedIn();
            });
        } else {
            console.error('Launch button not found! Available elements:');
            console.error('All elements with IDs:', Array.from(document.querySelectorAll('[id]')).map(el => el.id));
        }
    },

    async launchLinkedIn() {
        console.log('launchLinkedIn called');
        try {
            // Check if chrome.tabs API is available
            if (typeof chrome === 'undefined' || !chrome.tabs) {
                console.error('Chrome tabs API not available');
                this.showMainInterface();
                return;
            }

            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            const currentTab = tabs[0];

            if (currentTab && currentTab.url && currentTab.url.includes('linkedin.com')) {
                this.showMainInterface();
            } else {
                await chrome.tabs.update(currentTab.id, {
                    url: 'https://www.linkedin.com/feed/'
                });

                this.showMainInterface();

                // Set up listener for when LinkedIn loads to auto-open popup
                this.setupLinkedInAutoPopup(currentTab.id);
            }
        } catch (error) {
            console.error('Error launching LinkedIn:', error);
            this.showMainInterface();
        }
    },

    setupLinkedInAutoPopup(tabId) {
        // Listen for tab updates to detect when LinkedIn loads
        const listener = (updatedTabId, changeInfo, tab) => {
            if (updatedTabId === tabId &&
                changeInfo.status === 'complete' &&
                tab.url &&
                tab.url.includes('linkedin.com')) {

                // Remove listener
                chrome.tabs.onUpdated.removeListener(listener);

                // Auto-open popup by sending message to content script
                setTimeout(() => {
                    this.triggerAutoPopup(tabId);
                }, 2000);
            }
        };

        chrome.tabs.onUpdated.addListener(listener);
    },

    async triggerAutoPopup(tabId) {
        try {
            // Inject content script if needed
            await chrome.scripting.executeScript({
                target: { tabId },
                files: ['content/linkedin-content.js']
            });

            // Wait for content script to initialize
            await new Promise(resolve => setTimeout(resolve, 1500));

            // Send message to show auto popup
            await Utils.sendTabMessage(tabId, {
                action: 'showAutoPopup'
            });
        } catch (error) {
            console.error('Error triggering auto popup:', error);
        }
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeExtension);
} else {
    initializeExtension();
}

function initializeExtension() {
    LaunchManager.init();
    ModalManager.init();
    RealTimeProfileHandler.init();

    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && e.key === 'X') {
            e.preventDefault();
            ModalManager.forceCloseAll();
        }
    });

    const eventMap = {
        'export-profiles': ProfileManager.export,
        'create-campaign-from-profiles': ProfileManager.createCampaign,
        'close-profile-urls': ProfileURLModal.close,
        'select-all-profiles': ProfileURLModal.selectAll,
        'add-profiles-to-campaign': ProfileURLModal.addSelected
    };

    Utils.setupEventListeners(eventMap);

    // Initialize without storage
    CampaignManager.load();
}

const CampaignManager = {
    load() {
        const campaignList = DOMCache.get('campaign-list');
        // Show empty state - no persistent storage
        campaignList.innerHTML = '<div class="empty-state">No campaigns yet. Create your first campaign!</div>';
    },

    create() {
        // Open the campaign creation modal
        ModalManager.openCampaignModal();
    },

    finalize() {
        const campaignName = DOMCache.get('campaign-name').value.trim();

        // Simplified campaign creation without storage
        ModalManager.closeCampaignModal();
        this.load();
        Utils.showNotification(`Campaign "${campaignName}" created with ${AppState.collectedProfiles.length} profiles!`);

        // Reset collected profiles for next campaign
        AppState.collectedProfiles = [];
    }
};



const ProfileManager = {
    view() {
        const profiles = AppState.collectedProfiles;
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

    export() {
        const profiles = AppState.collectedProfiles;

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

    createCampaign() {
        const profiles = AppState.collectedProfiles;

        if (profiles.length === 0) {
            Utils.showNotification('No profiles to create campaign from', 'warning');
            return;
        }

        Utils.hideById('profiles-modal');
        ModalManager.openCampaignModal();

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
        if (nextButton) {
            if (AppState.collectedProfiles.length > 0) {
                Utils.show(nextButton);
                nextButton.disabled = false;
            } else {
                Utils.hide(nextButton);
            }
        }
    },




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
        const skipToBulkBtn = DOMCache.get('skip-to-bulk-send');

        if (selectAllBtn) selectAllBtn.addEventListener('click', () => this.selectAll());
        if (deselectAllBtn) deselectAllBtn.addEventListener('click', () => this.deselectAll());
        if (generateBtn) generateBtn.addEventListener('click', () => this.generateMessages());
        if (useMessagesBtn) useMessagesBtn.addEventListener('click', () => this.useSelectedMessages());
        if (regenerateBtn) regenerateBtn.addEventListener('click', () => this.regenerateMessages());
        if (skipToBulkBtn) skipToBulkBtn.addEventListener('click', () => this.skipToBulkSend());
    },

    showProfileSelection() {
        const container = DOMCache.get('profiles-selection-list');
        if (!container) return;

        container.innerHTML = '';
        this.selectedProfiles = AppState.collectedProfiles.map((_, index) => index);

        AppState.collectedProfiles.forEach((profile, index) => {
            const item = document.createElement('div');
            item.className = 'profile-selection-item';
            item.innerHTML = `
                <input type="checkbox" id="profile-${index}" data-index="${index}" checked>
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
        this.updateGenerateButton();
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
        const skipToBulkBtn = DOMCache.get('skip-to-bulk-send');

        if (generateBtn) {
            generateBtn.disabled = this.selectedProfiles.length === 0;
        }
        if (skipToBulkBtn) {
            skipToBulkBtn.disabled = this.selectedProfiles.length === 0;
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

                try {
                    const response = await APIService.generateMessage(profile.url);
        

                    // Extract message from API response
                    let message = "Hello dear"; // Default fallback message

                    if (response) {
                        if (typeof response === 'string') {
                            message = response;
                        } else if (response.messages && response.messages.message1) {
                            message = response.messages.message1;
                        } else if (response.message) {
                            message = response.message;
                        } else if (response.content) {
                            message = response.content;
                        } else if (response.text) {
                            message = response.text;
                        } else if (response.data && response.data.message) {
                            message = response.data.message;
                        } else {
                            console.warn('API response structure unclear for', profile.name, '- using default message');
                        }
                    }

                    this.generatedMessages.push({
                        profile: profile,
                        message: message,
                        selected: true,
                        index: index
                    });

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
        const resultsContainer = DOMCache.get('message-results');
        const messagesContainer = DOMCache.get('messages-container');

        if (!resultsContainer || !messagesContainer) {
            return;
        }

        messagesContainer.innerHTML = '';

        // Add a test message first to verify container is working
        messagesContainer.innerHTML = '<div style="background: lime; padding: 20px; margin: 10px; border: 2px solid green; font-weight: bold;">🧪 TEST: Container is working! Messages should appear below...</div>';

        this.generatedMessages.forEach((item, profileIndex) => {
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

                if (messages.length === 0) {
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


        // Check if response has messages object
        if (apiResponse.messages) {
            // Extract messages from the messages object, excluding 'id' field
            Object.keys(apiResponse.messages).forEach(key => {
                if (key.startsWith('message') && apiResponse.messages[key] && key !== 'id') {
                    messages.push(apiResponse.messages[key]);
                }
            });
        }

        // If no messages found, try to extract from root level
        if (messages.length === 0) {
            Object.keys(apiResponse).forEach(key => {
                if (key.startsWith('message') && apiResponse[key]) {
                    messages.push(apiResponse[key]);
                }
            });
        }

        // If still no messages, return the whole response as a single message
        if (messages.length === 0) {
            messages.push(JSON.stringify(apiResponse, null, 2));
        }
        return messages;
    },

    showMessageSelection() {
        // Hide the profile selection step
        const profileSelectionStep = document.querySelector('.step[data-step="4"]');
        if (profileSelectionStep) {
            profileSelectionStep.style.display = 'none';
        }

        // Prepare messages data and automatically select first message for each profile
        const selectedMessages = [];
        this.generatedMessages.forEach(item => {
            const messages = this.parseMessagesFromResponse(item.message);
            if (messages.length > 0) {
                selectedMessages.push({
                    profile: item.profile,
                    message: messages[0] // Automatically select first message
                });
            }
        });

        // Store selected messages
        this.selectedCampaignMessages = selectedMessages;

        // Show send message interface directly
        this.showSendMessageInterface();
    },





    finalizeCampaign() {
        // Hide message selection
        const messageSelection = document.getElementById('message-selection-step');
        if (messageSelection) {
            messageSelection.remove();
        }

        // Show send message interface
        this.showSendMessageInterface();
    },

    showSendMessageInterface() {
        const container = document.querySelector('.container');

        // Show interface for selected profiles (not pre-generated messages)
        const selectedProfiles = Step4Manager.selectedProfiles.map(index => AppState.collectedProfiles[index]);

        container.innerHTML = `
            <div class="send-message-interface">
                <div class="interface-header">
                    <div class="step-indicator">Step 6: Bulk Message Automation</div>
                    <div class="success-icon">�</div>
                    <h2>Ready for Bulk Processing</h2>
                    <p>Selected profiles will be processed one by one: Generate message → Open profile → Send message → Close chat → Next profile</p>
                </div>

                <div class="bulk-actions">
                    <div class="bulk-controls">
                        <button class="btn btn-success bulk-send-btn" id="bulk-send-messages">
                            🚀 Start Bulk Processing (${selectedProfiles.length} profiles)
                        </button>
                        <div class="bulk-progress hidden" id="bulk-progress">
                            <div class="progress-bar">
                                <div class="progress-fill" id="progress-fill"></div>
                            </div>
                            <div class="progress-text" id="progress-text">Processing 0 of 0 profiles...</div>
                        </div>
                    </div>
                </div>

                <div class="profiles-list">
                    <h3>Selected Profiles (${selectedProfiles.length})</h3>
                    ${selectedProfiles.map((profile, index) => `
                        <div class="profile-item" data-index="${index}">
                            <div class="profile-info">
                                <div class="profile-details">
                                    <h4>${profile.name}</h4>
                                    <p class="profile-title">${profile.title || 'LinkedIn Member'}</p>
                                    <a href="${profile.url}" target="_blank" class="profile-link">View Profile</a>
                                </div>
                            </div>
                            <div class="profile-status">
                                <span class="status-indicator">⏳ Waiting</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        // Add event listeners for bulk send button
        this.setupBulkSendListeners();
    },

    setupBulkSendListeners() {
        // Add event listener for bulk send button
        const bulkSendBtn = document.querySelector('#bulk-send-messages');
        if (bulkSendBtn) {
            bulkSendBtn.addEventListener('click', () => {
                this.startBulkMessageSending();
            });
        }
    },

    async startBulkMessageSending() {
        const bulkSendBtn = document.querySelector('#bulk-send-messages');
        const bulkProgress = document.querySelector('#bulk-progress');
        const progressFill = document.querySelector('#progress-fill');
        const progressText = document.querySelector('#progress-text');

        // Check if we have selected profiles instead of pre-generated messages
        if (!Step4Manager.selectedProfiles || Step4Manager.selectedProfiles.length === 0) {
            Utils.showNotification('No profiles selected', 'warning');
            return;
        }

        // Disable bulk send button and show progress
        bulkSendBtn.disabled = true;
        bulkSendBtn.textContent = '⏳ Processing Profiles...';
        bulkProgress.classList.remove('hidden');

        const totalProfiles = Step4Manager.selectedProfiles.length;
        let completedProfiles = 0;

        try {
            // Process each selected profile sequentially - one complete workflow at a time
            for (let i = 0; i < Step4Manager.selectedProfiles.length; i++) {
                const profileIndex = Step4Manager.selectedProfiles[i];
                const profile = AppState.collectedProfiles[profileIndex];

                // Update progress
                progressText.textContent = `Processing ${i + 1} of ${totalProfiles} profiles: ${profile.name}`;
                progressFill.style.width = `${(i / totalProfiles) * 100}%`;

                try {
                    // Step 1: Generate message for this profile using API
                    progressText.textContent = `Step 1/4: Generating message for ${profile.name}`;
                    const response = await APIService.generateMessage(profile.url);
        

                    // Extract message from API response
                    let message = "Hello dear"; // Default fallback message

                    if (response) {
                        if (typeof response === 'string') {
                            message = response;
                        } else if (response.messages && response.messages.message1) {
                            // Use message1 from the API response structure
                            message = response.messages.message1;
                        } else if (response.message) {
                            message = response.message;
                        } else if (response.content) {
                            message = response.content;
                        } else if (response.text) {
                            message = response.text;
                        } else if (response.data && response.data.message) {
                            message = response.data.message;
                        } else {
                            console.warn('Bulk API response structure unclear for', profile.name, '- using default message');
                        }
                    }

                    // Step 2: Open profile URL
                    progressText.textContent = `Step 2/4: Opening profile for ${profile.name}`;
                    await this.openProfileAndSendMessage(profile.url, message, profile.name);

                    completedProfiles++;

                    // Step 3: Wait before processing next profile
                    progressText.textContent = `Step 4/4: Completed ${profile.name}, moving to next...`;
                    await new Promise(resolve => setTimeout(resolve, 2000));

                } catch (error) {
                    console.error(`Failed to process ${profile.name}:`, error);
                    // Continue with next profile even if this one fails
                }
            }

            // Update final progress
            progressFill.style.width = '100%';
            progressText.textContent = `Completed! Processed ${completedProfiles} of ${totalProfiles} profiles`;

            // Show completion notification
            Utils.showNotification(`Bulk processing completed! ${completedProfiles}/${totalProfiles} profiles processed successfully`, 'success');

        } catch (error) {
            console.error('Bulk processing error:', error);
            Utils.showNotification('Error during bulk processing', 'error');
        } finally {
            // Re-enable bulk send button
            setTimeout(() => {
                bulkSendBtn.disabled = false;
                bulkSendBtn.textContent = '🚀 Send All Messages Automatically';
                bulkProgress.classList.add('hidden');
            }, 3000);
        }
    },

    async openProfileAndSendMessage(profileUrl, message, profileName) {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

            if (tab) {
                // Step 1: Navigate to profile URL
                await chrome.tabs.update(tab.id, { url: profileUrl });

                // Step 2: Wait for page to load
                await new Promise(resolve => setTimeout(resolve, 3000));

                // Step 3: Send message through content script
                await Utils.sendTabMessage(tab.id, {
                    action: 'sendDirectMessage',
                    message: message,
                    profileName: profileName,
                    profileUrl: profileUrl
                });

                // Step 4: Wait for message to be sent and chat to close
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        } catch (error) {
            console.error('Error in complete profile workflow:', error);
            throw error;
        }
    },

    async sendMessageToProfileDirect(profileUrl, message, profileName) {
        try {
            // Send message directly to content script (legacy method)
            await Utils.sendCurrentTabMessage({
                action: 'sendDirectMessage',
                message: message,
                profileName: profileName,
                profileUrl: profileUrl
            });
        } catch (error) {
            console.error('Error sending message to profile:', error);
            throw error;
        }
    },

    async sendMessageToProfile(profileUrl, message, profileName, buttonElement) {
        try {
            const statusDiv = buttonElement.parentElement.querySelector('.message-status');
            const statusText = statusDiv.querySelector('.status-text');

            // Show status and update button
            statusDiv.style.display = 'block';
            buttonElement.disabled = true;
            buttonElement.textContent = '⏳ Step 1: Navigating to Profile...';
            statusText.textContent = 'Navigating to LinkedIn profile in current tab...';

            // Get current active tab
            const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });

            // Navigate to profile in current tab
            await chrome.tabs.update(currentTab.id, { url: profileUrl });

            // Wait for navigation and page load
            setTimeout(async () => {
                try {
                    buttonElement.textContent = '⏳ Step 2: Preparing Automation...';
                    statusText.textContent = 'Injecting automation script...';

                    // First, try to inject the content script if it's not already loaded
                    try {
                        await chrome.scripting.executeScript({
                            target: { tabId: currentTab.id },
                            files: ['content/linkedin-content.js']
                        });
                    } catch (injectionError) {
                    }

                    // Wait a bit for script to initialize
                    await new Promise(resolve => setTimeout(resolve, 1000));

                    buttonElement.textContent = '⏳ Step 3: Finding Message Button...';
                    statusText.textContent = 'Locating message button on profile...';

                    // Send message to content script in current tab
                    await Utils.sendTabMessage(currentTab.id, {
                        action: 'sendDirectMessage',
                        message: message,
                        profileName: profileName
                    });

                    buttonElement.textContent = '✅ Message Sent Successfully!';
                    buttonElement.classList.add('btn-success');
                    buttonElement.classList.remove('btn-primary');
                    statusText.textContent = `Message sent to ${profileName} automatically!`;
                    statusText.style.color = '#28a745';

                } catch (error) {
                    console.error('Error sending message:', error);
                    buttonElement.textContent = '❌ Error - Try Again';
                    buttonElement.disabled = false;
                    statusText.textContent = 'Failed to send message. Please try again.';
                    statusText.style.color = '#dc3545';
                }
            }, 4000); // Increased wait time for navigation

        } catch (error) {
            console.error('Error navigating to profile:', error);
            buttonElement.textContent = '❌ Error - Try Again';
            buttonElement.disabled = false;
            const statusText = buttonElement.parentElement.querySelector('.status-text');
            statusText.textContent = 'Failed to navigate to profile. Please try again.';
            statusText.style.color = '#dc3545';
        }
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

        // Enable campaign creation
        const createBtn = DOMCache.get('create-campaign-final');
        if (createBtn) {
            createBtn.disabled = false;
            Utils.show(createBtn);
        }
    },

    regenerateMessages() {
        this.generateMessages();
    },

    skipToBulkSend() {
        if (this.selectedProfiles.length === 0) {
            Utils.showNotification('Please select at least one profile', 'warning');
            return;
        }

        // Skip message generation and go directly to bulk send interface
        this.showSendMessageInterface();
        Utils.showNotification(`Ready to process ${this.selectedProfiles.length} profiles`, 'success');
    }
};

const ProfileCollector = {
    start() {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tab = tabs[0];

            if (!tab.url.includes('linkedin.com')) {
                Utils.showNotification('Please navigate to LinkedIn first', 'error');
                return;
            }

            Utils.showNotification('Starting single page profile collection...', 'info');
            this.startSearch(tab.id, { type: 'single-page', realTime: true });
        });
    },

    startMultiPage() {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tab = tabs[0];

            if (!tab.url.includes('linkedin.com')) {
                Utils.showNotification('Please navigate to LinkedIn first', 'error');
                return;
            }

            // Initialize page progress display
            this.initializePageProgress();

            Utils.showNotification('Starting multi-page profile collection (1-4 pages)...', 'info');
            this.startMultiPageSearch(tab.id, { type: 'multi-page', maxPages: 4, realTime: true });
        });
    },

    initializePageProgress() {
        const currentPageElement = DOMCache.get('current-page-number');
        const totalPagesElement = DOMCache.get('total-pages');
        const progressFill = DOMCache.get('page-progress-fill');
        const pageProgress = DOMCache.get('page-progress');

        // Show and initialize page progress
        if (pageProgress) {
            pageProgress.classList.add('visible');
            Utils.show(pageProgress);
        }

        if (currentPageElement) currentPageElement.textContent = '1';
        if (totalPagesElement) totalPagesElement.textContent = '4';
        if (progressFill) progressFill.style.width = '0%';

        // Show auto-detection indicator
        const autoDetectionIndicator = DOMCache.get('auto-detection-indicator');
        if (autoDetectionIndicator) {
            Utils.show(autoDetectionIndicator);
        }
    },

    async startSearch(tabId, searchCriteria) {
        try {
            await chrome.scripting.executeScript({
                target: { tabId }, files: ['content/linkedin-content.js']
            });

            setTimeout(async () => {
                try {
                    await Utils.sendTabMessage(tabId, {
                        action: 'startRealTimeCollection',
                        criteria: searchCriteria
                    });
                    Utils.showNotification('Real-time collection started! Profiles will appear as they are found.', 'info');
                } catch (error) {
                    console.error('Message sending error:', error);
                    Utils.showNotification('Collection started. Profiles will appear as they are found.', 'info');
                }
            }, 1500);
        } catch (error) {
            console.error('Script injection error:', error);
            Utils.showNotification('Please refresh the LinkedIn page and try again.', 'error');
        }
    },

    async startMultiPageSearch(tabId, searchCriteria) {
        try {
            await chrome.scripting.executeScript({
                target: { tabId }, files: ['content/linkedin-content.js']
            });

            setTimeout(async () => {
                try {
                    await Utils.sendTabMessage(tabId, {
                        action: 'startMultiPageCollection',
                        maxPages: searchCriteria.maxPages || 4,
                        criteria: searchCriteria
                    });
                    Utils.showNotification('Multi-page collection started! This may take a few minutes...', 'info');
                } catch (error) {
                    console.error('Message sending error:', error);
                    Utils.showNotification('Multi-page collection started. Profiles will appear as they are found.', 'info');
                }
            }, 1500);
        } catch (error) {
            console.error('Script injection error:', error);
            Utils.showNotification('Please refresh the LinkedIn page and try again.', 'error');
        }
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

    startMultiPageCollecting() {
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

            // Initialize page progress display
            ProfileCollector.initializePageProgress();

            Utils.showNotification('Starting multi-page profile collection (1-4 pages)...', 'info');

            if (tab.url.includes('search/results/people') && tab.url.includes('network')) {
                this.startMultiPageSearch(tab.id, { type: 'search', maxPages: 4, realTime: true });
            } else if (tab.url.includes('mynetwork') || tab.url.includes('connections')) {
                this.startMultiPageSearch(tab.id, { type: 'connections', maxPages: 4, realTime: true });
            } else {
                this.openSearch();
                setTimeout(() => this.startMultiPageSearch(tab.id, { type: 'search', maxPages: 4, realTime: true }), 3000);
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
                    await Utils.sendTabMessage(tabId, {
                        action: 'startRealTimeCollection',
                        criteria: searchCriteria
                    });
                    Utils.showNotification('Real-time collection started! Profiles will appear as they are found.', 'info');
                } catch (error) {
                    console.error('Message sending error:', error);
                    Utils.showNotification('Collection started. Profiles will appear as they are found.', 'info');
                }
            }, 1500);
        } catch (error) {
            console.error('Script injection error:', error);
            Utils.showNotification('Please refresh the LinkedIn page and try again.', 'error');
        }
    },

    async startMultiPageSearch(tabId, searchCriteria) {
        try {
            await chrome.scripting.executeScript({
                target: { tabId }, files: ['content/linkedin-content.js']
            });

            setTimeout(async () => {
                try {
                    await Utils.sendTabMessage(tabId, {
                        action: 'startMultiPageCollection',
                        maxPages: searchCriteria.maxPages || 4,
                        criteria: searchCriteria
                    });
                    Utils.showNotification('Multi-page collection started! This may take a few minutes...', 'info');
                } catch (error) {
                    console.error('Message sending error:', error);
                    Utils.showNotification('Multi-page collection started. Profiles will appear as they are found.', 'info');
                }
            }, 1500);
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

const SalesNavigatorFloatingManager = {
    async launch() {
        try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            const currentTab = tabs[0];

            // Navigate to Sales Navigator search page
            await chrome.tabs.update(currentTab.id, {
                url: 'https://www.linkedin.com/sales/search/people?viewAllFilters=true'
            });

            Utils.showNotification('Opening Sales Navigator...', 'info');

            // Wait for page to load, then the content script will automatically detect
            // it's on a Sales Navigator page and load the UI
            setTimeout(() => {
                Utils.showNotification('Sales Navigator opened! The floating UI will appear automatically.', 'success');
            }, 3000);

        } catch (error) {
            Utils.showNotification('Error launching Sales Navigator', 'error');
        }
    }
};

const SalesNavigatorManager = {
    openSearch() {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.tabs.update(tabs[0].id, { url: CONSTANTS.URLS.SALES_NAVIGATOR }, () => {
                Utils.showNotification('Sales Navigator search opened. Use the advanced filters to refine your search, then click "Start Collecting People"', 'info');
            });
        });
    },

    startCollecting() {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tab = tabs[0];

            if (!tab.url.includes('linkedin.com/sales')) {
                Utils.showNotification('Please navigate to Sales Navigator first', 'error');
                return;
            }

            const campaignModal = DOMCache.get('campaign-modal');
            if (campaignModal) {
                Utils.show(campaignModal);
                WizardManager.showStep(3, 'collecting');
            }
            Utils.showNotification('Starting real-time profile collection...', 'info');

            if (tab.url.includes('sales/search/people')) {
                this.startSearch(tab.id, { type: 'sales-navigator', realTime: true });
            } else {
                this.openSearch();
                setTimeout(() => this.startSearch(tab.id, { type: 'sales-navigator', realTime: true }), 3000);
            }
        });
    },

    startMultiPageCollecting() {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tab = tabs[0];

            if (!tab.url.includes('linkedin.com/sales')) {
                Utils.showNotification('Please navigate to Sales Navigator first', 'error');
                return;
            }

            const campaignModal = DOMCache.get('campaign-modal');
            if (campaignModal) {
                Utils.show(campaignModal);
                WizardManager.showStep(3, 'collecting');
            }

            // Initialize page progress display
            ProfileCollector.initializePageProgress();

            Utils.showNotification('Starting multi-page profile collection (1-4 pages)...', 'info');

            // DISABLE multi-page collection for Sales Navigator
            if (tab.url.includes('sales/search/people')) {
                Utils.showNotification('Multi-page collection is disabled for Sales Navigator. Only collecting from the current page.', 'warning');
                this.startSearch(tab.id, { type: 'sales-navigator', realTime: true });
            } else {
                this.openSearch();
                setTimeout(() => this.startMultiPageSearch(tab.id, { type: 'sales-navigator', maxPages: 4, realTime: true }), 3000);
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
                    await Utils.sendTabMessage(tabId, {
                        action: 'startRealTimeCollection',
                        criteria: searchCriteria
                    });
                    Utils.showNotification('Real-time collection started! Profiles will appear as they are found.', 'info');
                } catch (error) {
                    console.error('Message sending error:', error);
                    Utils.showNotification('Collection started. Profiles will appear as they are found.', 'info');
                }
            }, 1500);
        } catch (error) {
            console.error('Script injection error:', error);
            Utils.showNotification('Please refresh the Sales Navigator page and try again.', 'error');
        }
    },

    async startMultiPageSearch(tabId, searchCriteria) {
        try {
            await chrome.scripting.executeScript({
                target: { tabId }, files: ['content/linkedin-content.js']
            });

            setTimeout(async () => {
                try {
                    await Utils.sendTabMessage(tabId, {
                        action: 'startMultiPageCollection',
                        maxPages: searchCriteria.maxPages || 4,
                        criteria: searchCriteria
                    });
                    Utils.showNotification('Multi-page collection started! This may take a few minutes...', 'info');
                } catch (error) {
                    console.error('Message sending error:', error);
                    Utils.showNotification('Multi-page collection started. Profiles will appear as they are found.', 'info');
                }
            }, 1500);
        } catch (error) {
            console.error('Script injection error:', error);
            Utils.showNotification('Please refresh the Sales Navigator page and try again.', 'error');
        }
    },

    addProfilesToCampaign(profiles) {
        const validProfiles = profiles.filter(p => p.name && p.url);
        if (validProfiles.length === 0) return;

        const processedProfiles = validProfiles.map(profile => ({
            ...profile,
            collectedAt: new Date().toISOString(),
            source: 'sales-navigator'
        }));

        AppState.collectedProfiles.push(...processedProfiles);
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

// Collection Manager for pause/resume functionality
const CollectionManager = {
    isPaused: false,

    togglePause() {
        this.isPaused = !this.isPaused;
        this.updatePauseButton();
        this.sendPauseMessage();
    },

    updatePauseButton() {
        const pauseBtn = DOMCache.get('pause-collection');
        if (pauseBtn) {
            if (this.isPaused) {
                pauseBtn.textContent = 'RESUME';
                pauseBtn.className = 'btn btn-success';
            } else {
                pauseBtn.textContent = 'PAUSE';
                pauseBtn.className = 'btn btn-secondary';
            }
        }
    },

    sendPauseMessage() {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    action: this.isPaused ? 'pauseCollection' : 'resumeCollection'
                }).catch(() => {});
            }
        });
    }
};