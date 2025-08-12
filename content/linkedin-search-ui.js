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

        // Initialize automation state
        this.automationState = {
            currentProfileIndex: 0,
            totalProfiles: this.collectedProfiles.length,
            isRunning: false,
            customPrompt: '',
            promptSet: false
        };

        this.updateAutomationProgress();
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
            if (progressEl) progressEl.textContent = `0 / ${this.collectedProfiles.length}`;
            if (profileUrlEl) profileUrlEl.textContent = this.collectedProfiles[0]?.url || 'None selected';

            this.setupAutomationEventListeners(automationUI);

            return automationUI;

        } catch (error) {
            console.warn('Failed to load automation UI template, using fallback:', error);
            return this.createFallbackAutomationUI();
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

                // Hide prompt input, show prompt display
                const promptSection = document.getElementById('prompt-section');
                const promptDisplay = document.getElementById('prompt-display');
                const currentPromptText = document.getElementById('current-prompt-text');

                if (promptSection) promptSection.style.display = 'none';
                if (promptDisplay) promptDisplay.style.display = 'block';
                if (currentPromptText) currentPromptText.textContent = promptValue;

                // Enable start button
                if (startAutomationBtn) {
                    startAutomationBtn.disabled = false;
                    startAutomationBtn.textContent = '🚀 Start Automation';
                }
            });
        }

        if (changePromptBtn && customPromptTextarea) {
            changePromptBtn.addEventListener('click', () => {
                this.automationState.promptSet = false;
                this.automationState.customPrompt = '';

                // Show prompt input, hide prompt display
                const promptSection = document.getElementById('prompt-section');
                const promptDisplay = document.getElementById('prompt-display');

                if (promptSection) promptSection.style.display = 'block';
                if (promptDisplay) promptDisplay.style.display = 'none';
                customPromptTextarea.value = '';

                // Disable start button
                if (startAutomationBtn) {
                    startAutomationBtn.disabled = true;
                    startAutomationBtn.textContent = '🚀 Start Automation (Set Prompt First)';
                }
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

        if (progressElement) {
            progressElement.textContent = `${this.automationState.currentProfileIndex} / ${this.automationState.totalProfiles}`;
        }

        if (progressFillElement) {
            const percentage = (this.automationState.currentProfileIndex / this.automationState.totalProfiles) * 100;
            progressFillElement.style.width = `${percentage}%`;
        }

        if (currentStatusElement) {
            const currentProfile = this.collectedProfiles[this.automationState.currentProfileIndex];
            if (currentProfile) {
                currentStatusElement.textContent = `Processing: ${currentProfile.name}`;
            }
        }

        if (currentProfileUrlElement) {
            const currentProfile = this.collectedProfiles[this.automationState.currentProfileIndex];
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

            for (let i = 0; i < this.automationState.currentProfileIndex; i++) {
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
        container.innerHTML = this.collectedProfiles.map((profile, index) => {
            let status = 'Waiting';
            let statusClass = 'waiting';
            let statusIcon = '⏳';

            if (index < this.automationState.currentProfileIndex) {
                status = 'Completed';
                statusClass = 'completed';
                statusIcon = '✅';
            } else if (index === this.automationState.currentProfileIndex && this.automationState.isRunning) {
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

        for (let i = this.automationState.currentProfileIndex; i < this.collectedProfiles.length; i++) {
            if (!this.automationState.isRunning) break; // Allow pausing/stopping

            this.automationState.currentProfileIndex = i;
            const profile = this.collectedProfiles[i];

            this.updateAutomationProgress();
            this.updateAutomationProfileStatus(i, 'Processing', '🔄', '#ffc107');

            try {
                // Step 1: Generate message from API
                const currentStatusElement = document.querySelector('#current-status');
                if (currentStatusElement) {
                    currentStatusElement.textContent = `Generating message for ${profile.name}`;
                }

                const messageData = await this.generateMessageForProfile(profile.url, this.automationState.customPrompt);

                if (!this.automationState.isRunning) break; // Check again after async operation

                // Step 2: Open profile and send connection request
                if (currentStatusElement) {
                    currentStatusElement.textContent = `Opening profile for ${profile.name}`;
                }

                const result = await this.openProfileAndConnect(profile.url, messageData.message, profile.name);

                if (!this.automationState.isRunning) break; // Check again after async operation

                // Step 3: Update status based on result
                if (result.success) {
                    this.updateAutomationProfileStatus(i, 'Connected', '✅', '#28a745');
                    if (currentStatusElement) {
                        currentStatusElement.textContent = `Successfully connected to ${profile.name}`;
                    }
                } else {
                    this.updateAutomationProfileStatus(i, 'Failed', '❌', '#dc3545');
                    if (currentStatusElement) {
                        currentStatusElement.textContent = `Failed to connect to ${profile.name}: ${result.error}`;
                    }

                    // Show popup blocker notification if needed
                    if (result.error && result.error.includes('Popup blocked')) {
                        this.showPopupBlockerNotification();
                    }
                }

                // Step 4: Wait before next profile (with interruption check)
                for (let wait = 0; wait < 3000; wait += 500) {
                    if (!this.automationState.isRunning) break;
                    await new Promise(resolve => setTimeout(resolve, 500));
                }

            } catch (error) {
                console.log(`Failed to process ${profile.name}`);
                this.updateAutomationProfileStatus(i, 'Error', '⚠️', '#dc3545');
                const currentStatusElement = document.querySelector('#current-status');
                if (currentStatusElement) {
                    currentStatusElement.textContent = `Error processing ${profile.name}: ${error.message}`;
                }
            }
        }

        // Automation completed or stopped
        if (this.automationState.isRunning) {
            // Completed successfully
            this.automationState.isRunning = false;
            startBtn.textContent = 'Automation Completed ✓';
            startBtn.style.backgroundColor = '#28a745';
            startBtn.style.display = 'inline-block';
            pauseBtn.style.display = 'none';
            stopBtn.style.display = 'none';

            const currentStatusElement = document.querySelector('#current-status');
            if (currentStatusElement) {
                currentStatusElement.textContent = 'All profiles processed successfully!';
            }
        }
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
            // Store current page URL and automation context
            const currentUrl = window.location.href;

            // Store automation state for same-tab navigation
            const automationState = {
                currentUrl: currentUrl,
                profileUrl: profileUrl,
                message: message,
                profileName: profileName,
                timestamp: Date.now(),
                isAutomation: true,
                returnCallback: true
            };

            sessionStorage.setItem('linkedinAutomationState', JSON.stringify(automationState));

            // Store the resolve function reference for when we return
            window.automationResolve = resolve;

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

        // If we have an existing UI instance and automation result, handle it
        if (window['linkedInSearchUI'] && automationResult && window.automationResolve) {
            try {
                const result = JSON.parse(automationResult);
                sessionStorage.removeItem('automationResult');

                // Resolve the promise from openProfileAndConnect
                window.automationResolve(result);
                window.automationResolve = null;

                console.log('Automation result processed successfully');
                return; // Don't create new UI instance
            } catch (error) {
                console.log('Failed to process automation result');
                if (window.automationResolve) {
                    window.automationResolve({ success: false, error: 'Failed to process result' });
                    window.automationResolve = null;
                }
            }
        }

        // Create new UI instance if one doesn't exist
        if (!document.querySelector('.linkedin-search-floating-ui') &&
            !document.querySelector('.automation-starter-ui') &&
            !window['linkedInSearchUI']) {

            // Wait for page to load
            setTimeout(() => {
                window['linkedInSearchUI'] = new LinkedInSearchFloatingUI();

                // Handle automation result if we returned from profile (for new instances)
                if (automationResult && window.automationResolve) {
                    try {
                        const result = JSON.parse(automationResult);
                        sessionStorage.removeItem('automationResult');

                        // Resolve the promise from openProfileAndConnect
                        window.automationResolve(result);
                        window.automationResolve = null;

                        console.log('Automation result processed successfully');
                    } catch (error) {
                        console.log('Failed to process automation result');
                        if (window.automationResolve) {
                            window.automationResolve({ success: false, error: 'Failed to process result' });
                            window.automationResolve = null;
                        }
                    }
                }
            }, 2000);
        }
    }
}

// Main initialization function
function initializeLinkedInAutomation() {
    if (window.location.href.includes('linkedin.com/search')) {
        // Initialize search UI
        initLinkedInSearchUI();
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
