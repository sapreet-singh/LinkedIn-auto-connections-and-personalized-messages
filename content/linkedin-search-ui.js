class LinkedInSearchFloatingUI {
    constructor() {
        this.ui = null;
        this.isCollecting = false;
        this.collectedProfiles = [];
        this.config = window.LinkedInSearchConfig || {};
        this.collectionInterval = null;
        this.observer = null;
        this.init();
    }

    async init() {
        await this.loadDependencies();
        this.injectCSS();
        await this.loadHTMLTemplate();
        this.setupEventListeners();
        this.showUI();
    }

    async loadDependencies() {
        if (!window.LinkedInSearchConfig) {
            await this.loadScript('content/linkedin-search-config.js');
            this.config = window.LinkedInSearchConfig || {};
        }
    }

    loadScript(src) {
        return new Promise((resolve, reject) => {
            if (document.querySelector(`script[src*="${src}"]`)) {
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = chrome.runtime.getURL(src);
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    injectCSS() {
        if (document.getElementById('linkedin-search-ui-styles')) return;
        const link = document.createElement('link');
        link.id = 'linkedin-search-ui-styles';
        link.rel = 'stylesheet';
        link.href = chrome.runtime.getURL('content/linkedin-search-ui.css');
        link.onerror = () => {
            console.warn('Failed to load external CSS, falling back to inline styles');
            this.injectInlineCSS();
        };
        document.head.appendChild(link);
    }

    injectInlineCSS() {
        const style = document.createElement('style');
        style.id = 'linkedin-search-ui-inline-styles';
        style.textContent = `
            .linkedin-search-floating-ui {
                position: fixed !important;
                top: 80px !important;
                right: 20px !important;
                width: 420px !important;
                background: white !important;
                border-radius: 12px !important;
                box-shadow: 0 8px 32px rgba(0,0,0,0.15) !important;
                z-index: 999999 !important;
                display: flex !important;
                flex-direction: column !important;
            }
            .linkedin-search-header {
                background: linear-gradient(135deg, #0a66c2, #004182) !important;
                color: white !important;
                padding: 16px 20px !important;
                display: flex !important;
                justify-content: space-between !important;
                align-items: center !important;
            }
            .linkedin-search-btn {
                padding: 12px 16px !important;
                border: none !important;
                border-radius: 8px !important;
                font-weight: 600 !important;
                cursor: pointer !important;
            }
        `;
        document.head.appendChild(style);
    }

    async loadHTMLTemplate() {
        try {
            const response = await fetch(chrome.runtime.getURL('content/linkedin-search-ui.html'));
            const htmlContent = await response.text();
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = htmlContent;
            this.ui = tempDiv.firstElementChild;
            this.applyConfigurationToTemplate();

            document.body.appendChild(this.ui);

        } catch (error) {
            console.warn('Failed to load HTML template, using fallback:', error);
            this.createFallbackUI();
        }
    }

    applyConfigurationToTemplate() {
        if (!this.ui || !this.config) return;
        const elementsWithDataText = this.ui.querySelectorAll('[data-text]');

        elementsWithDataText.forEach(element => {
            const configPath = element.getAttribute('data-text');
            const configValue = this.getConfigValue(configPath);

            if (configValue) {
                if (element.id === 'start-connecting-btn') {
                    element.textContent = `${configValue} (0)`;
                } else if (element.classList.contains('profiles-count')) {
                    element.innerHTML = `${configValue} <span id="profile-count">0</span>`;
                } else {
                    element.textContent = configValue;
                }
            }
        });
    }

    getConfigValue(path) {
        const keys = path.split('.');
        let value = this.config;

        for (const key of keys) {
            if (value && typeof value === 'object' && key in value) {
                value = value[key];
            } else {
                return null;
            }
        }

        return value;
    }

    createFallbackUI() {
        console.error('Failed to load external HTML template. Creating minimal fallback UI.');

        this.ui = document.createElement('div');
        this.ui.className = 'linkedin-search-floating-ui';
        this.ui.innerHTML = `
            <div class="linkedin-search-header">
                <h3 class="linkedin-search-title">LinkedIn Search</h3>
                <button class="linkedin-search-close" title="Close">&times;</button>
            </div>
            <div class="linkedin-search-content">
                <p style="text-align: center; color: #dc3545; padding: 20px;">
                    Failed to load UI template. Please refresh the page.
                </p>
                <button class="linkedin-search-btn start" onclick="window.location.reload()">
                    Refresh Page
                </button>
            </div>
        `;
        document.body.appendChild(this.ui);

        this.ui.querySelector('.linkedin-search-close').addEventListener('click', () => {
            this.closeUI();
        });
    }

    setupEventListeners() {
        const collectBtn = this.ui.querySelector('#collect-profiles-btn');
        const connectBtn = this.ui.querySelector('#start-connecting-btn');
        const clearBtn = this.ui.querySelector('#clear-profiles');
        const closeBtn = this.ui.querySelector('.linkedin-search-close');
        const minimizeBtn = this.ui.querySelector('.linkedin-search-minimize');
        const header = this.ui.querySelector('.linkedin-search-header');

        collectBtn.addEventListener('click', () => this.toggleCollecting());
        connectBtn.addEventListener('click', async () => await this.startConnecting());
        clearBtn.addEventListener('click', () => this.clearProfiles());
        closeBtn.addEventListener('click', () => this.closeUI());
        minimizeBtn.addEventListener('click', () => this.toggleMinimize());

        this.makeDraggable(header);
    }

    makeDraggable(handle) {
        let isDragging = false;
        let currentX, currentY, initialX, initialY;
        let xOffset = 0, yOffset = 0;

        handle.addEventListener('mousedown', (e) => {
            initialX = e.clientX - xOffset;
            initialY = e.clientY - yOffset;
            if (e.target === handle || handle.contains(e.target)) {
                isDragging = true;
                this.ui.style.cursor = 'grabbing';
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                e.preventDefault();
                currentX = e.clientX - initialX;
                currentY = e.clientY - initialY;
                xOffset = currentX;
                yOffset = currentY;
                this.ui.style.transform = `translate(${currentX}px, ${currentY}px)`;
            }
        });

        document.addEventListener('mouseup', () => {
            initialX = currentX;
            initialY = currentY;
            isDragging = false;
            this.ui.style.cursor = 'move';
        });
    }



    toggleCollecting() {
        if (this.isCollecting) {
            this.pauseCollecting();
        } else {
            this.startCollecting();
        }
    }

    startCollecting() {
        this.updateStatus('status', this.config.messages?.status?.collecting || 'Collecting profiles...', true);
        this.isCollecting = true;

        const collectBtn = this.ui.querySelector('#collect-profiles-btn');
        collectBtn.textContent = 'PAUSE COLLECTING';
        collectBtn.classList.remove('start');
        collectBtn.classList.add('pause');

        this.setupProfileObserver();
        this.collectCurrentPageProfiles();
        this.collectionInterval = setInterval(() => {
            this.collectCurrentPageProfiles();
        }, 3000);
    }

    pauseCollecting() {
        this.updateStatus('status', 'Collection paused. Click "START COLLECTING" to resume.', false);
        this.isCollecting = false;

        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }

        if (this.collectionInterval) {
            clearInterval(this.collectionInterval);
            this.collectionInterval = null;
        }

        const collectBtn = this.ui.querySelector('#collect-profiles-btn');
        collectBtn.textContent = 'START COLLECTING';
        collectBtn.classList.remove('pause');
        collectBtn.classList.add('start');
    }

    setupProfileObserver() {
        if (this.observer) return;
        this.observer = new MutationObserver((mutations) => {
            if (!this.isCollecting) return;
            let hasNewProfiles = false;
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1 && this.isProfileElement(node)) {
                        hasNewProfiles = true;
                    }
                });
            });
            if (hasNewProfiles) {
                setTimeout(() => this.collectCurrentPageProfiles(), 500);
            }
        });
        this.observer.observe(document.body, { childList: true, subtree: true });
    }

    isProfileElement(element) {
        const selectors = ['.entity-result', '[data-chameleon-result-urn]', '.reusable-search__result-container', '.search-results__result-item', '[componentkey]'];
        return selectors.some(selector =>
            element.matches && element.matches(selector) ||
            element.querySelector && element.querySelector(selector)
        );
    }

    collectCurrentPageProfiles() {
        if (!this.isCollecting) return;
        const selectors = ['.entity-result', '[data-chameleon-result-urn]', '.reusable-search__result-container', '.search-results__result-item', 'div[componentkey]:has(a[href*="/in/"])', 'div:has(> div > figure img[alt]) div:has(a[href*="/in/"])'];
        let profileElements = [];
        for (const selector of selectors) {
            try {
                profileElements = document.querySelectorAll(selector);
                if (profileElements.length > 0) break;
            } catch (e) {
                continue;
            }
        }
        profileElements.forEach(element => {
            const profile = this.extractProfileData(element);
            if (profile && !this.isDuplicateProfile(profile)) {
                this.addProfile(profile);
            }
        });
    }

    extractProfileData(element) {
        try {
            const nameElement = element.querySelector('a[href*="/in/"][data-view-name="search-result-lockup-title"]') ||
                               element.querySelector('.entity-result__title-text a') ||
                               element.querySelector('.actor-name a') ||
                               element.querySelector('a[href*="/in/"]');
            if (!nameElement) return null;

            let name = nameElement.textContent?.trim();
            if (name && name.includes(' is reachable')) {
                name = name.replace(' is reachable', '').trim();
            }

            const url = nameElement.href.startsWith('http') ? nameElement.href : `https://www.linkedin.com${nameElement.getAttribute('href')}`;
            let title = '', company = '', location = '';
            const parentContainer = nameElement.closest('div[componentkey]') || element;
            const textElements = parentContainer.querySelectorAll('p');

            textElements.forEach((p) => {
                const text = p.textContent?.trim();
                if (!text || text.includes(name)) return;
                if (!title && text && !text.includes('•') && !text.includes(',')) {
                    title = text;
                } else if (!location && text && (text.includes(',') || text.includes('India') || text.includes('USA') || text.includes('UK'))) {
                    location = text;
                }
            });

            if (title && title.includes(' at ')) {
                const parts = title.split(' at ');
                title = parts[0]?.trim() || '';
                company = parts[1]?.trim() || '';
            }

            const imageElement = parentContainer.querySelector('img[alt="' + name + '"]') ||
                               parentContainer.querySelector('img[src*="profile"]') ||
                               parentContainer.querySelector('figure img');
            const profilePic = imageElement?.src || '';

            return { name, url, title, company, location, profilePic, timestamp: Date.now(), source: 'linkedin-search' };
        } catch (error) {
            console.log('Failed to extract profile data');
            return null;
        }
    }

    isDuplicateProfile(newProfile) {
        return this.collectedProfiles.some(profile =>
            profile.url === newProfile.url ||
            (profile.name === newProfile.name && profile.title === newProfile.title)
        );
    }

    addProfile(profile) {
        this.collectedProfiles.push(profile);
        this.updateProfilesList();
        this.updateProfileCount();
        this.showNextButton();
    }



    updateProfileCount() {
        const countElement = this.ui.querySelector('#profile-count');
        countElement.textContent = this.collectedProfiles.length;

        const nextBtn = this.ui.querySelector('#start-connecting-btn');
        nextBtn.textContent = `Next: Start Connecting (${this.collectedProfiles.length})`;
    }

    updateProfilesList() {
        const profilesList = this.ui.querySelector('#profiles-list');
        const emptyMessage = this.config.messages?.empty?.profiles || 'No profiles collected yet. Click "START COLLECTING" to begin.';

        if (this.collectedProfiles.length === 0) {
            profilesList.innerHTML = `<div class="empty-profiles">${emptyMessage}</div>`;
        } else {
            profilesList.innerHTML = this.collectedProfiles.map((profile, index) => `
                <div class="profile-item" data-profile-index="${index}">
                    <div class="profile-image">
                        ${profile.profilePic ?
                            `<img src="${profile.profilePic}" alt="${profile.name}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;">` :
                            `<div class="profile-initial">${profile.name ? profile.name.charAt(0).toUpperCase() : '?'}</div>`
                        }
                    </div>
                    <div class="profile-info">
                        <div class="profile-name" title="${profile.name}">${profile.name}</div>
                        <div class="profile-title" title="${profile.title}">${profile.title}</div>
                        ${profile.company ? `<div class="profile-company" title="${profile.company}">${profile.company}</div>` : ''}
                        <div class="profile-url" title="${profile.url}" data-url="${profile.url}" style="cursor: pointer;">${this.shortenUrl(profile.url)}</div>
                    </div>
                    <div class="profile-actions">
                        <button class="profile-action-btn remove-profile-btn" data-url="${profile.url}" title="Remove">✕</button>
                    </div>
                </div>
            `).join('');

            // Add event listeners for profile actions
            profilesList.querySelectorAll('.profile-url').forEach(urlElement => {
                urlElement.addEventListener('click', (e) => {
                    const url = e.target.getAttribute('data-url');
                    this.copyProfileUrl(url);
                });
            });

            profilesList.querySelectorAll('.remove-profile-btn').forEach(removeBtn => {
                removeBtn.addEventListener('click', (e) => {
                    const url = e.target.getAttribute('data-url');
                    this.removeProfile(url);
                });
            });
        }
    }

    shortenUrl(url) {
        // Extract LinkedIn profile ID for cleaner display
        const match = url.match(/\/in\/([^\/\?]+)/);
        if (match) return `linkedin.com/in/${match[1]}`;
        return url.length > 30 ? url.substring(0, 30) + '...' : url;
    }

    copyProfileUrl(url) {
        navigator.clipboard.writeText(url).then(() => {
            const notification = document.createElement('div');
            notification.className = 'linkedin-notification linkedin-notification-success';
            notification.textContent = 'Profile URL copied!';
            document.body.appendChild(notification);
            setTimeout(() => notification.remove(), 2000);
        }).catch(err => console.error('Failed to copy URL:', err));
    }

    removeProfile(url) {
        this.collectedProfiles = this.collectedProfiles.filter(profile => profile.url !== url);
        this.updateProfilesList();
        this.updateProfileCount();
    }

    showNextButton() {
        const nextBtn = this.ui.querySelector('#start-connecting-btn');
        const buttonText = this.config.messages?.buttons?.startConnecting || 'Next: Start Connecting';

        nextBtn.style.display = 'block';
        nextBtn.disabled = this.collectedProfiles.length === 0;
        nextBtn.textContent = `${buttonText} (${this.collectedProfiles.length})`;

        const statusMessage = `${this.config.messages?.status?.collected || 'profiles collected. Ready to connect!'}`;
        this.updateStatus('status', `Collected ${this.collectedProfiles.length} ${statusMessage}`, false);
    }

    async startConnecting() {
        // Check if automation UI is already open
        if (document.querySelector('.automation-starter-ui')) {
            console.log('Automation UI already open');
            return;
        }

        await this.showAutomationStarterUI();
    }

    async showAutomationStarterUI() {
        // Remove any existing automation UI first
        const existingAutomationUI = document.querySelector('.automation-starter-ui');
        if (existingAutomationUI) {
            existingAutomationUI.remove();
        }

        // Create automation starter UI
        const automationUI = await this.createAutomationUI();
        console.log('Automation UI to append:', automationUI, 'Type:', typeof automationUI, 'Is Node:', automationUI instanceof Node);

        if (automationUI && automationUI instanceof Node) {
            document.body.appendChild(automationUI);
        } else {
            console.error('Invalid automation UI element:', automationUI);
            throw new Error('Failed to create valid automation UI element');
        }

        // Hide the main search UI completely
        if (this.ui) {
            this.ui.style.display = 'none';
            this.ui.style.visibility = 'hidden';
        }

        // Initialize automation state if not already set
        if (!this.automationState) {
            this.automationState = {
                currentProfileIndex: 0,
                totalProfiles: this.collectedProfiles.length,
                isRunning: false,
                customPrompt: '',
                promptSet: false
            };
        }

        this.updateAutomationProgress();
    }

    async restoreAutomationUI() {
        console.log('Restoring automation UI after profile processing...');

        // Check if automation UI already exists
        if (document.querySelector('.automation-starter-ui')) {
            console.log('Automation UI already exists, no need to restore');
            return;
        }

        // Try to restore automation state from session storage
        const uiAutomationState = sessionStorage.getItem('linkedinUIAutomationState');
        if (uiAutomationState) {
            try {
                const savedState = JSON.parse(uiAutomationState);
                console.log('Restoring automation state:', savedState);

                // Restore the automation state and profiles
                this.automationState = savedState.automationState;
                this.collectedProfiles = savedState.collectedProfiles || [];

                console.log('Restored automation state:', this.automationState);
                console.log('Restored profiles count:', this.collectedProfiles.length);
                console.log('Prompt set status:', this.automationState.promptSet);
                console.log('Custom prompt:', this.automationState.customPrompt);

            } catch (error) {
                console.error('Failed to restore automation state:', error);
            }
        }

        // Restore the automation UI
        await this.showAutomationStarterUI();

        // Make sure the search UI is hidden
        if (this.ui) {
            this.ui.style.display = 'none';
            this.ui.style.visibility = 'hidden';
        }

        console.log('Automation UI restored successfully');
    }

    async createAutomationUI() {
        try {
            console.log('Loading automation UI template...');
            // Load automation UI template from external HTML file
            const response = await fetch(chrome.runtime.getURL('content/linkedin-search-ui.html'));
            const htmlContent = await response.text();
            console.log('HTML content loaded, length:', htmlContent.length);

            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = htmlContent;

            // Get the automation UI template
            const automationTemplate = tempDiv.querySelector('#automation-ui-template');
            console.log('Automation template found:', !!automationTemplate);

            if (!automationTemplate) {
                console.error('Available elements in template:', tempDiv.querySelectorAll('[id]'));
                throw new Error('Automation UI template not found');
            }

            // Clone the template and make it visible
            const automationUI = automationTemplate.cloneNode(true);
            automationUI.id = 'active-automation-ui';
            automationUI.style.display = 'block';
            console.log('Automation UI created:', automationUI);

            // Update dynamic content
            const totalProfilesEl = automationUI.querySelector('#total-profiles');
            const progressEl = automationUI.querySelector('#automation-progress');
            const profileUrlEl = automationUI.querySelector('#current-profile-url');

            if (totalProfilesEl) totalProfilesEl.textContent = this.collectedProfiles.length;
            if (progressEl) progressEl.textContent = `${this.automationState?.currentIndex || 0} / ${this.collectedProfiles.length}`;
            if (profileUrlEl) profileUrlEl.textContent = this.collectedProfiles[this.automationState?.currentIndex || 0]?.url || 'None selected';

            // Handle prompt state restoration
            this.setupPromptState(automationUI);

            // Update profile list with status
            this.updateProfileListInUI(automationUI);

            this.setupAutomationEventListeners(automationUI);

            return automationUI;

        } catch (error) {
            console.warn('Failed to load automation UI template, using fallback:', error);
            return this.createFallbackAutomationUI();
        }
    }

    setupPromptState(automationUI) {
        const promptSection = automationUI.querySelector('#prompt-section');
        const promptDisplay = automationUI.querySelector('#prompt-display');
        const currentPromptText = automationUI.querySelector('#current-prompt-text');
        const customPromptTextarea = automationUI.querySelector('#custom-prompt');
        const startAutomationBtn = automationUI.querySelector('#start-automation-btn');

        console.log('Setting up prompt state. Has saved prompt:', !!this.automationState?.customPrompt);
        console.log('Prompt set status:', this.automationState?.promptSet);
        console.log('Saved prompt:', this.automationState?.customPrompt);

        if (this.automationState && this.automationState.promptSet && this.automationState.customPrompt) {
            // Show prompt display, hide prompt input
            if (promptSection) promptSection.style.display = 'none';
            if (promptDisplay) promptDisplay.style.display = 'block';
            if (currentPromptText) currentPromptText.textContent = this.automationState.customPrompt;
            if (customPromptTextarea) customPromptTextarea.value = this.automationState.customPrompt;

            // Enable start button if not running
            if (startAutomationBtn) {
                if (this.automationState.isRunning) {
                    startAutomationBtn.textContent = '🔄 Running...';
                    startAutomationBtn.disabled = true;
                } else {
                    startAutomationBtn.disabled = false;
                    startAutomationBtn.textContent = '🚀 Start Automation';
                }
            }
        } else {
            // Show prompt input, hide prompt display
            if (promptSection) promptSection.style.display = 'block';
            if (promptDisplay) promptDisplay.style.display = 'none';
            if (startAutomationBtn) {
                startAutomationBtn.disabled = true;
                startAutomationBtn.textContent = '🚀 Start Automation (Set Prompt First)';
            }
        }
    }

    updateProfileListInUI(automationUI) {
        const profilesListElement = automationUI.querySelector('#profiles-list-automation');
        if (!profilesListElement) return;

        const currentIndex = this.automationState?.currentIndex || 0;
        const isRunning = this.automationState?.isRunning || false;

        const profilesHTML = this.collectedProfiles.map((profile, index) => {
            let status = '⏳'; // Waiting
            let statusClass = 'waiting';

            if (index < currentIndex) {
                status = '✅'; // Completed
                statusClass = 'completed';
            } else if (index === currentIndex && isRunning) {
                status = '🔄'; // Processing
                statusClass = 'processing';
            }

            return `
                <div class="profile-item ${statusClass}">
                    <span class="profile-status">${status}</span>
                    <span class="profile-name">${profile.name}</span>
                    <a href="${profile.url}" target="_blank" class="profile-url">View</a>
                </div>
            `;
        }).join('');

        profilesListElement.innerHTML = profilesHTML;
    }

    saveAutomationState() {
        if (this.automationState && this.collectedProfiles) {
            const stateToSave = {
                automationState: this.automationState,
                collectedProfiles: this.collectedProfiles
            };
            sessionStorage.setItem('linkedinUIAutomationState', JSON.stringify(stateToSave));
            console.log('Automation state saved to session storage');
        }
    }

    createFallbackAutomationUI() {
        // Create a minimal fallback UI if external template fails to load
        const automationUI = document.createElement('div');
        automationUI.className = 'automation-starter-ui';
        automationUI.innerHTML = `
            <div class="automation-header">
                <h3>Processing Profiles</h3>
                <button class="automation-close" title="Close">&times;</button>
            </div>
            <div class="automation-content">
                <div class="automation-controls">
                    <button id="start-automation-btn" class="start-automation-btn" disabled>🚀 Start Automation</button>
                </div>
            </div>
        `;

        this.setupAutomationEventListeners(automationUI);
        return automationUI;
    }

    processConnectionRequests() {
        console.log('Processing connection requests for:', this.collectedProfiles);

        const sendRatio = this.config.stats?.sendConnectRatio || 0.7;
        const fieldRatio = this.config.stats?.fieldConnectRatio || 0.3;

        const sendConnectCount = this.ui.querySelector('#send-connect-count');
        const fieldConnectCount = this.ui.querySelector('#field-connect-count');

        sendConnectCount.textContent = Math.floor(this.collectedProfiles.length * sendRatio);
        fieldConnectCount.textContent = Math.floor(this.collectedProfiles.length * fieldRatio);
    }

    setupAutomationEventListeners(automationUI) {
        const closeBtn = automationUI.querySelector('.automation-close');
        const setPromptBtn = automationUI.querySelector('#set-prompt-btn');
        const changePromptBtn = automationUI.querySelector('#change-prompt-btn');
        const startAutomationBtn = automationUI.querySelector('#start-automation-btn');
        const pauseAutomationBtn = automationUI.querySelector('#pause-automation-btn');
        const stopAutomationBtn = automationUI.querySelector('#stop-automation-btn');
        const customPromptTextarea = automationUI.querySelector('#custom-prompt');

        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                if (this.automationState.isRunning) {
                    if (confirm('Automation is running. Are you sure you want to close?')) {
                        this.stopAutomation();
                        automationUI.remove();
                        if (this.ui) {
                            this.ui.style.display = 'flex';
                            this.ui.style.visibility = 'visible';
                        }
                    }
                } else {
                    automationUI.remove();
                    if (this.ui) {
                        this.ui.style.display = 'flex';
                        this.ui.style.visibility = 'visible';
                    }
                }
            });
        }

        if (setPromptBtn && customPromptTextarea) {
            setPromptBtn.addEventListener('click', () => {
                const promptValue = customPromptTextarea.value.trim();
                if (!promptValue) {
                    alert('Please enter a custom prompt!');
                    return;
                }

                this.automationState.customPrompt = promptValue;
                this.automationState.promptSet = true;

                // Save the updated automation state
                this.saveAutomationState();

                // Hide prompt input, show prompt display
                const promptSection = automationUI.querySelector('#prompt-section');
                const promptDisplay = automationUI.querySelector('#prompt-display');
                const currentPromptText = automationUI.querySelector('#current-prompt-text');

                if (promptSection) promptSection.style.display = 'none';
                if (promptDisplay) promptDisplay.style.display = 'block';
                if (currentPromptText) currentPromptText.textContent = promptValue;

                // Enable start button
                if (startAutomationBtn) {
                    startAutomationBtn.disabled = false;
                    startAutomationBtn.textContent = '🚀 Start Automation';
                }

                console.log('Prompt set and saved:', promptValue);
            });
        }

        if (changePromptBtn && customPromptTextarea) {
            changePromptBtn.addEventListener('click', () => {
                this.automationState.promptSet = false;
                this.automationState.customPrompt = '';

                // Save the updated automation state
                this.saveAutomationState();

                // Show prompt input, hide prompt display
                const promptSection = automationUI.querySelector('#prompt-section');
                const promptDisplay = automationUI.querySelector('#prompt-display');

                if (promptSection) promptSection.style.display = 'block';
                if (promptDisplay) promptDisplay.style.display = 'none';
                customPromptTextarea.value = '';

                // Disable start button
                if (startAutomationBtn) {
                    startAutomationBtn.disabled = true;
                    startAutomationBtn.textContent = '🚀 Start Automation (Set Prompt First)';
                }

                console.log('Prompt cleared and state saved');
            });
        }

        if (startAutomationBtn) {
            startAutomationBtn.addEventListener('click', () => {
                if (!this.automationState.promptSet || !this.automationState.customPrompt) {
                    alert('Please set a custom prompt first!');
                    return;
                }
                this.startAutomationProcess(automationUI);
            });
        }

        if (pauseAutomationBtn) {
            pauseAutomationBtn.addEventListener('click', () => {
                this.pauseAutomation();
            });
        }

        if (stopAutomationBtn) {
            stopAutomationBtn.addEventListener('click', () => {
                if (confirm('Are you sure you want to stop the automation?')) {
                    this.stopAutomation();
                }
            });
        }
    }

    updateAutomationProgress() {
        const progressElement = document.querySelector('#automation-progress');
        const progressFillElement = document.querySelector('#progress-fill');
        const currentStatusElement = document.querySelector('#current-status');
        const currentProfileUrlElement = document.querySelector('#current-profile-url');
        const profilesListElement = document.querySelector('#profiles-list-automation');

        // Use currentIndex or currentProfileIndex, whichever is available
        const currentIndex = this.automationState?.currentIndex ?? this.automationState?.currentProfileIndex ?? 0;
        const totalProfiles = this.automationState?.totalProfiles ?? this.collectedProfiles?.length ?? 0;

        if (progressElement) {
            progressElement.textContent = `${currentIndex} / ${totalProfiles}`;
        }

        if (progressFillElement) {
            const percentage = totalProfiles > 0 ? (currentIndex / totalProfiles) * 100 : 0;
            progressFillElement.style.width = `${percentage}%`;
        }

        if (currentStatusElement && this.collectedProfiles) {
            const currentProfile = this.collectedProfiles[currentIndex];
            if (currentProfile) {
                currentStatusElement.textContent = `Processing: ${currentProfile.name}`;
            }
        }

        if (currentProfileUrlElement && this.collectedProfiles) {
            const currentProfile = this.collectedProfiles[currentIndex];
            if (currentProfile) {
                currentProfileUrlElement.textContent = currentProfile.url;
            }
        }

        if (profilesListElement) {
            this.updateAutomationProfilesList(profilesListElement);
        }

        // Update stats
        this.updateAutomationStats();
    }

    updateAutomationStats() {
        const successCount = document.querySelector('#success-count');
        const failedCount = document.querySelector('#failed-count');

        if (successCount && failedCount) {
            let successful = 0;
            let failed = 0;

            // Use currentIndex or currentProfileIndex, whichever is available
            const currentIndex = this.automationState?.currentIndex ?? this.automationState?.currentProfileIndex ?? 0;

            for (let i = 0; i < currentIndex; i++) {
                const statusElement = document.getElementById(`profile-status-${i}`);
                if (statusElement) {
                    const status = statusElement.textContent.toLowerCase();
                    if (status.includes('connected') || status.includes('completed')) {
                        successful++;
                    } else if (status.includes('failed') || status.includes('error')) {
                        failed++;
                    }
                }
            }

            successCount.textContent = successful;
            failedCount.textContent = failed;
        }
    }

    pauseAutomation() {
        this.automationState.isRunning = false;

        const startBtn = document.querySelector('#start-automation-btn');
        const pauseBtn = document.querySelector('#pause-automation-btn');
        const stopBtn = document.querySelector('#stop-automation-btn');

        if (startBtn) {
            startBtn.style.display = 'inline-block';
            startBtn.textContent = '▶️ Resume Automation';
            startBtn.disabled = false;
        }
        if (pauseBtn) pauseBtn.style.display = 'none';
        if (stopBtn) stopBtn.style.display = 'inline-block';

        const currentStatusElement = document.querySelector('#current-status');
        if (currentStatusElement) {
            currentStatusElement.textContent = 'Automation paused. Click Resume to continue.';
        }
    }

    stopAutomation() {
        this.automationState.isRunning = false;
        this.automationState.currentProfileIndex = 0;

        const startBtn = document.querySelector('#start-automation-btn');
        const pauseBtn = document.querySelector('#pause-automation-btn');
        const stopBtn = document.querySelector('#stop-automation-btn');

        if (startBtn) {
            startBtn.style.display = 'inline-block';
            startBtn.textContent = '🚀 Start Automation';
            startBtn.disabled = !this.automationState.promptSet;
        }
        if (pauseBtn) pauseBtn.style.display = 'none';
        if (stopBtn) stopBtn.style.display = 'none';

        const currentStatusElement = document.querySelector('#current-status');
        if (currentStatusElement) {
            currentStatusElement.textContent = 'Automation stopped.';
        }
    }

    showPopupBlockerNotification() {
        // Remove any existing notification
        const existingNotification = document.querySelector('.popup-blocker-notification');
        if (existingNotification) {
            existingNotification.remove();
        }

        const notification = document.createElement('div');
        notification.className = 'popup-blocker-notification';
        notification.innerHTML = `
            <div class="linkedin-notification linkedin-notification-error popup-blocker-content">
                <div class="notification-title">⚠️ Popup Blocked</div>
                <div class="notification-message">
                    Please allow popups for LinkedIn to enable automatic profile opening.
                </div>
                <div class="notification-details">
                    Click the popup blocker icon in your browser's address bar and select "Always allow popups from linkedin.com"
                </div>
                <button class="notification-close" onclick="this.parentElement.parentElement.remove()">&times;</button>
            </div>
        `;

        document.body.appendChild(notification);

        // Auto-remove after 10 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 10000);
    }

    updateAutomationProfilesList(container) {
        // Use currentIndex or currentProfileIndex, whichever is available
        const currentIndex = this.automationState?.currentIndex ?? this.automationState?.currentProfileIndex ?? 0;

        container.innerHTML = this.collectedProfiles.map((profile, index) => {
            let status = 'Waiting';
            let statusClass = 'waiting';
            let statusIcon = '⏳';

            if (index < currentIndex) {
                status = 'Completed';
                statusClass = 'completed';
                statusIcon = '✅';
            } else if (index === currentIndex && this.automationState.isRunning) {
                status = 'Processing';
                statusClass = 'processing';
                statusIcon = '🔄';
            }

            return `
                <div class="automation-profile-item ${statusClass}" id="profile-item-${index}">
                    <div class="profile-avatar" id="profile-icon-${index}">${statusIcon}</div>
                    <div class="profile-info">
                        <div class="profile-name">${profile.name}</div>
                        <div class="profile-title">${profile.title}</div>
                        <div class="profile-company">${profile.company}</div>
                    </div>
                    <div class="profile-status" id="profile-status-${index}">${status}</div>
                </div>
            `;
        }).join('');
    }

    updateAutomationProfileStatus(index, status, icon, color) {
        const profileItem = document.getElementById(`profile-item-${index}`);
        const profileIcon = document.getElementById(`profile-icon-${index}`);
        const profileStatus = document.getElementById(`profile-status-${index}`);

        if (profileItem) {
            profileItem.className = `automation-profile-item ${status.toLowerCase()}`;
        }

        if (profileIcon) {
            profileIcon.textContent = icon;
            profileIcon.style.backgroundColor = color;
            profileIcon.style.color = 'white';
        }

        if (profileStatus) {
            profileStatus.textContent = status;
        }
    }

    clearProfiles() {
        if (this.isCollecting) {
            this.pauseCollecting();
        }
        this.collectedProfiles = [];
        this.updateProfileCount();
        this.updateProfilesList();
        const collectBtn = this.ui.querySelector('#collect-profiles-btn');
        const nextBtn = this.ui.querySelector('#start-connecting-btn');
        collectBtn.disabled = false;
        collectBtn.textContent = 'START COLLECTING';
        collectBtn.classList.remove('pause');
        collectBtn.classList.add('start');
        nextBtn.style.display = 'none';
        this.ui.querySelector('#send-connect-count').textContent = '0';
        this.ui.querySelector('#field-connect-count').textContent = '0';
        this.updateStatus('status', this.config.messages?.status?.ready || 'Ready to start collecting profiles', false);
    }

    async startAutomationProcess(automationUI) {
        this.automationState.isRunning = true;

        // Show notification about same-tab automation with popup preservation
        this.showNotification('Starting same-tab automation. The popup will be preserved during navigation.', 'info');

        // Update button states
        const startBtn = automationUI.querySelector('#start-automation-btn');
        const pauseBtn = automationUI.querySelector('#pause-automation-btn');
        const stopBtn = automationUI.querySelector('#stop-automation-btn');

        startBtn.style.display = 'none';
        pauseBtn.style.display = 'inline-block';
        stopBtn.style.display = 'inline-block';

        // Process profiles sequentially
        await this.processProfilesSequentially();

        // Automation completed or stopped
        if (this.automationState.isRunning) {
            // Completed successfully
            this.automationState.isRunning = false;
            
            const currentStatusElement = document.querySelector('#current-status');
            if (currentStatusElement) {
                currentStatusElement.textContent = 'All profiles processed successfully!';
            }

            // Clean up session storage
            sessionStorage.removeItem('linkedinUIAutomationState');
            console.log('Automation completed successfully!');
            
            // Close automation UI and show completion notification
            setTimeout(() => {
                this.closeAutomationUI();
            }, 2000);
        }
    }

    async processProfilesSequentially() {
        for (let i = this.automationState.currentProfileIndex; i < this.collectedProfiles.length; i++) {
            if (!this.automationState.isRunning) {
                console.log('Automation stopped by user, breaking loop');
                break; // Allow pausing/stopping
            }

            this.automationState.currentProfileIndex = i;
            const profile = this.collectedProfiles[i];

            console.log(`Processing profile ${i + 1}/${this.collectedProfiles.length}: ${profile.name}`);

            this.updateAutomationProgress();
            this.updateAutomationProfileStatus(i, 'Processing', '🔄', '#ffc107');

            try {
                // Step 1: Generate message from API
                const currentStatusElement = document.querySelector('#current-status');
                if (currentStatusElement) {
                    currentStatusElement.textContent = `Generating message for ${profile.name}`;
                }

                const messageData = await this.generateMessageForProfile(profile.url, this.automationState.customPrompt);

                if (!this.automationState.isRunning) {
                    console.log('Automation stopped during message generation');
                    break; // Check again after async operation
                }

                // Step 2: Open profile and send connection request
                if (currentStatusElement) {
                    currentStatusElement.textContent = `Opening profile for ${profile.name}`;
                }

                console.log(`About to open profile and connect for: ${profile.name}`);
                console.log(`Profile ${i + 1}/${this.collectedProfiles.length} - Opening: ${profile.url}`);
                const result = await this.openProfileAndConnect(profile.url, messageData.message, profile.name);
                console.log(`Received result for ${profile.name}:`, result);
                console.log(`Automation still running: ${this.automationState.isRunning}`);

                if (!this.automationState.isRunning) {
                    console.log('Automation stopped after profile processing');
                    break; // Check again after async operation
                }

                // Step 3: Update status based on result
                if (result.success) {
                    this.updateAutomationProfileStatus(i, 'Connected', '✅', '#28a745');
                    if (currentStatusElement) {
                        currentStatusElement.textContent = `Successfully connected to ${profile.name}`;
                    }
                    console.log(`Successfully processed profile ${i + 1}: ${profile.name}`);
                } else {
                    this.updateAutomationProfileStatus(i, 'Failed', '❌', '#dc3545');
                    if (currentStatusElement) {
                        currentStatusElement.textContent = `Failed to connect to ${profile.name}: ${result.error}`;
                    }
                    console.log(`Failed to process profile ${i + 1}: ${profile.name} - ${result.error}`);

                    // Show popup blocker notification if needed
                    if (result.error && result.error.includes('Popup blocked')) {
                        this.showPopupBlockerNotification();
                    }
                }

                // Step 4: Wait before next profile (with interruption check)
                if (i < this.collectedProfiles.length - 1) { // Don't wait after the last profile
                    console.log(`Waiting before next profile... (${i + 1}/${this.collectedProfiles.length})`);
                    console.log(`Next profile will be: ${this.collectedProfiles[i + 1]?.name}`);

                    for (let wait = 0; wait < 3000; wait += 500) {
                        if (!this.automationState.isRunning) {
                            console.log('Automation stopped during wait, breaking...');
                            break;
                        }
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }

                    console.log(`Finished waiting, continuing to next profile...`);
                } else {
                    console.log(`This was the last profile (${i + 1}/${this.collectedProfiles.length})`);
                }

            } catch (error) {
                console.error(`Failed to process ${profile.name}:`, error);
                this.updateAutomationProfileStatus(i, 'Error', '⚠️', '#dc3545');
                const currentStatusElement = document.querySelector('#current-status');
                if (currentStatusElement) {
                    currentStatusElement.textContent = `Error processing ${profile.name}: ${error.message}`;
                }

                // Continue to next profile even if this one failed
                console.log('Continuing to next profile after error...');
            }
        }

        console.log('Profile processing loop completed');
        
        // If we completed all profiles and automation is still running, complete it
        if (this.automationState.isRunning) {
            console.log('All profiles processed, completing automation');
            this.automationState.isRunning = false;
            this.updateAutomationProgress();
            
            // Close automation UI after a short delay
            setTimeout(() => {
                this.closeAutomationUI();
            }, 2000);
        }
    }

    async continueAutomationAfterProfile() {
        console.log('Continuing automation after profile processing...');
        console.log('Current automation state:', this.automationState);
        console.log('Current profile index:', this.automationState?.currentIndex || this.automationState?.currentProfileIndex);
        console.log('Total profiles collected:', this.collectedProfiles.length);

        if (!this.automationState?.isRunning) {
            console.log('Automation is not running, cannot continue');
            return;
        }

        // Get the current index (the profile we just processed)
        const currentIndex = this.automationState.currentIndex || this.automationState.currentProfileIndex || 0;
        console.log('Current index:', currentIndex, 'Total profiles:', this.collectedProfiles.length, 'Last index:', this.collectedProfiles.length - 1);

        // Check if we just processed the last profile
        if (currentIndex >= this.collectedProfiles.length) {
            console.log('All profiles processed, completing automation');
            console.log('Reason: currentIndex', currentIndex, '>=', this.collectedProfiles.length);
            this.automationState.isRunning = false;
            this.updateAutomationProgress();

            // Show completion message
            const currentStatusElement = document.querySelector('#current-status');
            if (currentStatusElement) {
                currentStatusElement.textContent = 'All profiles processed successfully!';
            }

            // Clean up
            sessionStorage.removeItem('linkedinUIAutomationState');
            return;
        }

        // Check if there are more profiles to process
        if (currentIndex + 1 < this.collectedProfiles.length) {
            // Move to the next profile
            const nextIndex = currentIndex + 1;
            console.log(`Moving from profile ${currentIndex} to profile ${nextIndex}`);

            // Update the automation state
            this.automationState.currentIndex = nextIndex;
            this.automationState.currentProfileIndex = nextIndex;

            // Save the updated state
            this.saveAutomationState();

            // Continue processing from the next profile
            console.log(`Continuing with profile ${nextIndex + 1}/${this.collectedProfiles.length}`);
            await this.processNextProfileInSequence(nextIndex);
        } else {
            // No more profiles to process, complete automation
            console.log('No more profiles to process, completing automation');
            this.automationState.isRunning = false;
            this.updateAutomationProgress();

            // Show completion message
            const currentStatusElement = document.querySelector('#current-status');
            if (currentStatusElement) {
                currentStatusElement.textContent = 'All profiles processed successfully!';
            }

            // Clean up
            sessionStorage.removeItem('linkedinUIAutomationState');
            
            // Close the automation UI and return to search UI
            this.closeAutomationUI();
        }
    }

    async processNextProfileInSequence(startIndex) {
        console.log(`Processing profiles starting from index ${startIndex}`);

        // Check if startIndex is valid
        if (startIndex >= this.collectedProfiles.length) {
            console.log(`Start index ${startIndex} is out of bounds (total profiles: ${this.collectedProfiles.length}), completing automation`);
            this.automationState.isRunning = false;
            this.updateAutomationProgress();
            this.closeAutomationUI();
            return;
        }

        for (let i = startIndex; i < this.collectedProfiles.length; i++) {
            if (!this.automationState.isRunning) {
                console.log('Automation stopped by user, breaking loop');
                break;
            }

            this.automationState.currentIndex = i;
            this.automationState.currentProfileIndex = i;
            const profile = this.collectedProfiles[i];

            console.log(`Processing profile ${i + 1}/${this.collectedProfiles.length}: ${profile.name}`);

            this.updateAutomationProgress();
            this.updateAutomationProfileStatus(i, 'Processing', '🔄', '#ffc107');

            try {
                // Step 1: Generate message from API
                const currentStatusElement = document.querySelector('#current-status');
                if (currentStatusElement) {
                    currentStatusElement.textContent = `Generating message for ${profile.name}`;
                }

                const messageData = await this.generateMessageForProfile(profile.url, this.automationState.customPrompt);

                if (!this.automationState.isRunning) {
                    console.log('Automation stopped during message generation');
                    break;
                }

                // Step 2: Open profile and send connection request
                if (currentStatusElement) {
                    currentStatusElement.textContent = `Opening profile for ${profile.name}`;
                }

                console.log(`About to open profile and connect for: ${profile.name}`);
                console.log(`Profile ${i + 1}/${this.collectedProfiles.length} - Opening: ${profile.url}`);
                const result = await this.openProfileAndConnect(profile.url, messageData.message, profile.name);
                console.log(`Received result for ${profile.name}:`, result);
                console.log(`Automation still running: ${this.automationState.isRunning}`);

                if (!this.automationState.isRunning) {
                    console.log('Automation stopped after profile processing');
                    break;
                }

                // Step 3: Update status based on result
                if (result.success) {
                    this.updateAutomationProfileStatus(i, 'Connected', '✅', '#28a745');
                    if (currentStatusElement) {
                        currentStatusElement.textContent = `Successfully connected to ${profile.name}`;
                    }
                    console.log(`Successfully processed profile ${i + 1}: ${profile.name}`);
                } else {
                    this.updateAutomationProfileStatus(i, 'Failed', '❌', '#dc3545');
                    if (currentStatusElement) {
                        currentStatusElement.textContent = `Failed to connect to ${profile.name}: ${result.error}`;
                    }
                    console.log(`Failed to process profile ${i + 1}: ${profile.name} - ${result.error}`);
                }

                // Step 4: Wait before next profile (with interruption check)
                if (i < this.collectedProfiles.length - 1) {
                    console.log(`Waiting before next profile... (${i + 1}/${this.collectedProfiles.length})`);
                    console.log(`Next profile will be: ${this.collectedProfiles[i + 1]?.name}`);

                    for (let wait = 0; wait < 3000; wait += 500) {
                        if (!this.automationState.isRunning) {
                            console.log('Automation stopped during wait, breaking...');
                            break;
                        }
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }

                    console.log(`Finished waiting, continuing to next profile...`);
                } else {
                    console.log(`This was the last profile (${i + 1}/${this.collectedProfiles.length})`);
                }

            } catch (error) {
                console.error(`Failed to process ${profile.name}:`, error);
                this.updateAutomationProfileStatus(i, 'Error', '⚠️', '#dc3545');
                const currentStatusElement = document.querySelector('#current-status');
                if (currentStatusElement) {
                    currentStatusElement.textContent = `Error processing ${profile.name}: ${error.message}`;
                }

                console.log('Continuing to next profile after error...');
            }
        }

        console.log('Profile processing sequence completed');
    }

    async generateMessageForProfile(profileUrl, customPrompt) {
        try {
            const response = await fetch('https://localhost:7007/api/linkedin/messages', {
                method: 'POST',
                headers: {
                    'accept': '*/*',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    url: profileUrl,
                    prompt: customPrompt
                })
            });

            if (!response.ok) {
                throw new Error(`API request failed: ${response.status}`);
            }

            const apiData = await response.json();
            console.log('API Data:', apiData);
            const message = apiData?.messages?.message1 || 'Hi, I\'m Ishu, a full-stack developer with expertise in .NET, Angular, and React. I\'d love to support your development needs. Let\'s connect and explore how I can add value to your team.';
            return { message };
        } catch (error) {
            console.log('Using default message (API unavailable)');
            return { message: 'Hi, I\'m Ishu, a full-stack developer with expertise in .NET, Angular, and React. I\'d love to support your development needs. Let\'s connect and explore how I can add value to your team.' };
        }
    }

    async openProfileAndConnect(profileUrl, message, profileName) {
        return new Promise((resolve) => {
            console.log(`Opening profile for automation: ${profileName}`);
            console.log(`Profile URL: ${profileUrl}`);

            // Store current page URL and automation context
            const currentUrl = window.location.href;

            // Store complete automation state for same-tab navigation
            const automationState = {
                currentUrl: currentUrl,
                profileUrl: profileUrl,
                message: message,
                profileName: profileName,
                timestamp: Date.now(),
                isAutomation: true,
                returnCallback: true,
                currentProfileIndex: this.automationState.currentProfileIndex,
                totalProfiles: this.automationState.totalProfiles,
                isRunning: this.automationState.isRunning,
                customPrompt: this.automationState.customPrompt,
                promptSet: this.automationState.promptSet,
                collectedProfiles: this.collectedProfiles // Store the profiles list
            };

            sessionStorage.setItem('linkedinAutomationState', JSON.stringify(automationState));

            // Also store the UI automation state separately for restoration
            const uiAutomationState = {
                automationState: this.automationState,
                collectedProfiles: this.collectedProfiles,
                timestamp: Date.now()
            };
            sessionStorage.setItem('linkedinUIAutomationState', JSON.stringify(uiAutomationState));

            // Store the resolve function reference for when we return
            window.automationResolve = resolve;

            console.log('Automation state stored, navigating to profile...');

            // Navigate to profile in same tab
            window.location.href = profileUrl;
        });
    }

    updateStatus(statusType, message, isActive = false) {
        const statusText = this.ui.querySelector(`#${statusType}-text`);
        const statusDot = this.ui.querySelector(`#${statusType}-dot`);

        if (statusText) statusText.textContent = message;
        if (statusDot) {
            statusDot.classList.toggle('active', isActive);
        }
    }

    showNotification(message, type = 'info') {
        // Remove existing notifications
        const existingNotifications = document.querySelectorAll('.linkedin-automation-notification');
        existingNotifications.forEach(notification => notification.remove());

        const notification = document.createElement('div');
        notification.className = `linkedin-automation-notification linkedin-notification linkedin-notification-${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);

        // Auto-remove after 5 seconds for same-tab workflow
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 5000);
    }



    // Utility method to update any element text using configuration
    updateElementText(elementId, configPath, fallbackText = '') {
        const element = this.ui.querySelector(`#${elementId}`);
        if (element) {
            const configValue = this.getConfigValue(configPath);
            element.textContent = configValue || fallbackText;
        }
    }

    // Utility method to update button text using configuration
    updateButtonText(buttonId, configPath, fallbackText = '', suffix = '') {
        const button = this.ui.querySelector(`#${buttonId}`);
        if (button) {
            const configValue = this.getConfigValue(configPath);
            button.textContent = `${configValue || fallbackText}${suffix}`;
        }
    }

    showUI() {
        if (this.ui) {
            this.ui.style.display = 'flex';
            this.ui.style.visibility = 'visible';
            this.ui.style.opacity = '1';
        }
    }

    closeUI() {
        if (this.isCollecting) {
            this.pauseCollecting();
        }
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        if (this.ui) {
            this.ui.remove();
        }
    }

    closeAutomationUI() {
        // Remove the automation UI
        const automationUI = document.querySelector('.automation-starter-ui');
        if (automationUI) {
            automationUI.remove();
        }

        // Show the search UI again
        if (this.ui) {
            this.ui.style.display = 'flex';
            this.ui.style.visibility = 'visible';
        }

        // Reset automation state
        this.automationState = {
            currentProfileIndex: 0,
            totalProfiles: this.collectedProfiles.length,
            isRunning: false,
            customPrompt: '',
            promptSet: false
        };

        // Show completion notification with options
        this.showCompletionNotification();
        
        console.log('Automation UI closed, returned to search UI');
    }

    showCompletionNotification() {
        // Remove any existing notifications
        const existingNotifications = document.querySelectorAll('.linkedin-automation-notification');
        existingNotifications.forEach(notification => notification.remove());

        const notification = document.createElement('div');
        notification.className = 'linkedin-automation-notification linkedin-notification linkedin-notification-success';
        notification.innerHTML = `
            <div class="notification-title">✅ Automation Completed!</div>
            <div class="notification-message">All profiles processed successfully.</div>
            <div class="notification-actions">
                <button class="notification-btn" onclick="window['linkedInSearchUI'].startNewAutomationWithSameProfiles()">🔄 Restart with Same Profiles</button>
                <button class="notification-btn" onclick="window['linkedInSearchUI'].startNewAutomation()">🆕 Start Fresh</button>
                <button class="notification-btn" onclick="this.parentElement.parentElement.remove()">✕ Close</button>
            </div>
        `;
        document.body.appendChild(notification);

        // Auto-remove after 15 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 15000);
    }

    startNewAutomation() {
        // Remove completion notification
        const notifications = document.querySelectorAll('.linkedin-automation-notification');
        notifications.forEach(notification => notification.remove());

        // Reset automation state for new run
        this.resetAutomation();
        
        // Start a new automation
        this.startConnecting();
    }

    startNewAutomationWithSameProfiles() {
        // Remove completion notification
        const notifications = document.querySelectorAll('.linkedin-automation-notification');
        notifications.forEach(notification => notification.remove());

        // Reset automation state but keep profiles
        this.automationState = {
            currentProfileIndex: 0,
            totalProfiles: this.collectedProfiles.length,
            isRunning: false,
            customPrompt: this.automationState.customPrompt || '',
            promptSet: this.automationState.promptSet || false
        };
        
        // Start a new automation
        this.startConnecting();
    }

    resetAutomation() {
        // Reset automation state
        this.automationState = {
            currentProfileIndex: 0,
            totalProfiles: this.collectedProfiles.length,
            isRunning: false,
            customPrompt: '',
            promptSet: false
        };

        // Clear session storage
        sessionStorage.removeItem('linkedinUIAutomationState');
        
        // Update UI
        this.updateAutomationProgress();
        
        console.log('Automation reset, ready to start fresh');
    }

    toggleMinimize() {
        const content = this.ui.querySelector('.linkedin-search-content');
        if (content.style.display === 'none') {
            content.style.display = 'block';
        } else {
            content.style.display = 'none';
        }
    }
}

// Profile automation is now handled by linkedin-profile-automation.js









// Auto-initialize when on LinkedIn search pages
function initLinkedInSearchUI() {
    if (window.location.href.includes('linkedin.com/search')) {

        // Check if we returned from profile automation first
        const automationResult = sessionStorage.getItem('automationResult');
        console.log('Checking for automation result:', !!automationResult);
        console.log('Existing UI instance:', !!window['linkedInSearchUI']);
        console.log('Automation resolve function:', !!window.automationResolve);

        // Handle automation result first - this is the key fix
        if (automationResult) {
            try {
                const result = JSON.parse(automationResult);
                sessionStorage.removeItem('automationResult');

                console.log('Processing automation result:', result);

                // If we have an existing UI instance and resolve function, handle it
                if (window['linkedInSearchUI'] && window.automationResolve) {
                    console.log('Found existing UI instance and resolve function');
                    console.log('Current automation state:', window['linkedInSearchUI'].automationState);

                    // Ensure automation UI is visible
                    const automationUI = document.querySelector('.automation-starter-ui');
                    if (!automationUI) {
                        console.log('Automation UI not found, restoring it...');
                        setTimeout(async () => {
                            await window['linkedInSearchUI'].restoreAutomationUI();
                            // Resolve after UI is restored and continue automation
                            if (window.automationResolve) {
                                window.automationResolve(result);
                                window.automationResolve = null;
                                console.log('Automation result processed after UI restoration');

                                // Continue automation if still running
                                if (window['linkedInSearchUI'].automationState?.isRunning) {
                                    console.log('Continuing automation after profile processing...');
                                    setTimeout(() => {
                                        window['linkedInSearchUI'].continueAutomationAfterProfile();
                                    }, 1000);
                                }
                            }
                        }, 500);
                        return;
                    }

                    // Resolve the promise from openProfileAndConnect
                    window.automationResolve(result);
                    window.automationResolve = null;
                    console.log('Automation result processed successfully, automation should continue...');

                    // Continue automation if still running
                    if (window['linkedInSearchUI'].automationState?.isRunning) {
                        console.log('Continuing automation after profile processing...');
                        setTimeout(() => {
                            window['linkedInSearchUI'].continueAutomationAfterProfile();
                        }, 1000);
                    }
                    return; // Don't create new UI instance
                }

                // If we don't have a UI instance but have automation result,
                // we need to restore the automation UI
                if (!window['linkedInSearchUI']) {
                    console.log('Restoring automation UI after profile processing...');
                    setTimeout(async () => {
                        window['linkedInSearchUI'] = new LinkedInSearchFloatingUI();

                        // Wait a bit for the UI to be created, then restore automation UI
                        setTimeout(async () => {
                            await window['linkedInSearchUI'].restoreAutomationUI();

                            // After restoring the UI, process the automation result
                            if (window.automationResolve) {
                                window.automationResolve(result);
                                window.automationResolve = null;
                                console.log('Automation result processed for restored UI');
                            }

                            // Continue automation if still running
                            if (window['linkedInSearchUI'].automationState?.isRunning) {
                                console.log('Continuing automation after UI restoration...');
                                setTimeout(() => {
                                    window['linkedInSearchUI'].continueAutomationAfterProfile();
                                }, 1000);
                            }
                        }, 500);
                    }, 1000);
                    return;
                }

            } catch (error) {
                console.error('Failed to process automation result:', error);
                if (window.automationResolve) {
                    window.automationResolve({ success: false, error: 'Failed to process result' });
                    window.automationResolve = null;
                }
            }
        }

        // Create new UI instance if one doesn't exist and no automation result
        if (!document.querySelector('.linkedin-search-floating-ui') &&
            !document.querySelector('.automation-starter-ui') &&
            !window['linkedInSearchUI'] &&
            !automationResult) {

            console.log('Creating new LinkedIn Search UI instance...');

            // Wait for page to load
            setTimeout(() => {
                window['linkedInSearchUI'] = new LinkedInSearchFloatingUI();
            }, 2000);
        } else {
            console.log('UI already exists or automation result being processed, skipping creation');
        }
    }
}

// Main initialization function
function initializeLinkedInAutomation() {
    console.log('Initializing LinkedIn automation for URL:', window.location.href);

    if (window.location.href.includes('linkedin.com/search')) {
        console.log('LinkedIn search page detected, initializing search UI...');
        // Initialize search UI
        initLinkedInSearchUI();
    } else {
        console.log('Not a LinkedIn search page, skipping search UI initialization');
    }
    // Note: Profile automation is handled by linkedin-profile-automation.js
}

// Initialize on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeLinkedInAutomation);
} else {
    initializeLinkedInAutomation();
}

// Re-initialize on navigation changes
if (!window.linkedInLastUrl) {
    window.linkedInLastUrl = location.href;
    new MutationObserver(() => {
        const url = location.href;
        if (url !== window.linkedInLastUrl) {
            window.linkedInLastUrl = url;
            console.log('Navigation detected:', url);
            setTimeout(initializeLinkedInAutomation, 1000);
        }
    }).observe(document, { subtree: true, childList: true });
}

// Also listen for popstate events (back/forward navigation)
window.addEventListener('popstate', () => {
    console.log('Popstate navigation detected');
    setTimeout(initializeLinkedInAutomation, 1000);
});

window.LinkedInSearchFloatingUI = LinkedInSearchFloatingUI;
