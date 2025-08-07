class SalesNavigatorFloatingUI {
    constructor() {
        this.isCollecting = false;
        this.profiles = [];
        this.ui = null;
        this.currentWorkflowStep = 'collecting';
        this.currentProfileIndex = 0;
        this.generatedMessage = null;
        this.processedProfiles = [];
        this.workflowPaused = false;
        this.workflowPopup = null;
        this.currentLinkedInProfileUrl = null;

        if (this.isSalesNavigatorSearchPage()) {
            this.init();
        } else if (this.isLinkedInProfilePage() || this.isSalesNavigatorProfilePage()) {
            this.checkAndRestoreWorkflow();
        }
    }

    isSalesNavigatorSearchPage() {
        const url = window.location.href;
        return url.includes('/sales/search/people') && url.includes('linkedin.com');
    }

    isLinkedInProfilePage() {
        const url = window.location.href;
        return url.includes('/in/') && url.includes('linkedin.com');
    }

    isSalesNavigatorProfilePage() {
        const url = window.location.href;
        return url.includes('/sales/lead/') && url.includes('linkedin.com');
    }

    init() {
        if (!this.isSalesNavigatorSearchPage()) return;
        this.injectCSS();
        this.createUI();
        this.setupEventListeners();
        this.startAutoDetection();

        // Restore workflow state if present
        const saved = localStorage.getItem('salesNavWorkflow');
        if (saved) {
            try {
                const state = JSON.parse(saved);
                this.currentWorkflowStep = state.currentWorkflowStep || 'collecting';
                this.currentProfileIndex = state.currentProfileIndex || 0;
                this.profiles = state.profiles || [];
                this.generatedMessage = state.generatedMessage || "Hello dear";
                this.processedProfiles = state.processedProfiles || [];
                if (this.currentWorkflowStep === 'processing') {
                    this.hideCollectionUI();
                    if (window.location.href.includes('/sales/search/people')) {
                        setTimeout(() => this.processNextProfile(), 2000);
                    }
                } else {
                    this.showUI();
                    this.updateProfilesList();
                    this.updateProfilesCount();
                    this.updateUI();
                }
            } catch (e) {
                localStorage.removeItem('salesNavWorkflow');
            }
        } else {
            setTimeout(() => this.showUI(), 1000);
        }
    }

    injectCSS() {
        if (document.getElementById('sales-navigator-ui-styles')) return;

        const link = document.createElement('link');
        link.id = 'sales-navigator-ui-styles';
        link.rel = 'stylesheet';
        link.href = chrome.runtime.getURL('content/sales-navigator-ui.css');
        link.onerror = () => this.injectInlineCSS();
        document.head.appendChild(link);

        setTimeout(() => {
            if (!document.querySelector('.sales-navigator-floating-ui')) {
                this.injectInlineCSS();
            }
        }, 2000);
    }

    injectInlineCSS() {
        const style = document.createElement('style');
        style.id = 'sales-navigator-ui-inline-styles';
        style.textContent = `
            .sales-navigator-floating-ui {
                position: fixed !important;
                top: 20px !important;
                right: 20px !important;
                width: 420px !important;
                max-height: 80vh !important;
                background: white !important;
                border-radius: 12px !important;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15) !important;
                z-index: 10000 !important;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
                border: 1px solid #e1e5e9 !important;
                overflow: hidden !important;
                display: flex !important;
                flex-direction: column !important;
            }
            .sales-nav-header {
                background: linear-gradient(135deg, #0a66c2, #004182) !important;
                color: white !important;
                padding: 16px 20px !important;
                display: flex !important;
                justify-content: space-between !important;
                align-items: center !important;
            }
            .sales-nav-content {
                padding: 20px !important;
                flex: 1 !important;
                overflow-y: auto !important;
            }
            .sales-nav-btn {
                flex: 1 !important;
                padding: 12px 16px !important;
                border: none !important;
                border-radius: 8px !important;
                font-size: 14px !important;
                font-weight: 600 !important;
                cursor: pointer !important;
                margin: 0 6px !important;
            }
            .sales-nav-btn.start {
                background: #28a745 !important;
                color: white !important;
            }
            .sales-nav-btn.pause {
                background: #ffc107 !important;
                color: #212529 !important;
            }
            .sales-nav-btn.next {
                background: #007bff !important;
                color: white !important;
                margin-top: 12px !important;
            }
            .sales-nav-btn.next:hover {
                background: #0056b3 !important;
            }
            .workflow-status {
                background: #e3f2fd !important;
                border: 1px solid #bbdefb !important;
                border-radius: 8px !important;
                padding: 12px 16px !important;
                margin: 12px 0 !important;
                text-align: center !important;
                font-size: 14px !important;
                color: #1976d2 !important;
            }
            .three-dot-menu {
                position: relative !important;
                display: inline-block !important;
            }
            .three-dot-btn {
                background: #f8f9fa !important;
                border: 1px solid #dee2e6 !important;
                border-radius: 4px !important;
                padding: 4px 8px !important;
                cursor: pointer !important;
                font-size: 12px !important;
            }
            .three-dot-menu-content {
                display: none !important;
                position: absolute !important;
                right: 0 !important;
                background-color: white !important;
                min-width: 160px !important;
                box-shadow: 0 8px 16px rgba(0,0,0,0.2) !important;
                z-index: 10001 !important;
                border-radius: 4px !important;
                border: 1px solid #dee2e6 !important;
            }
            .three-dot-menu-content.show {
                display: block !important;
            }
            .three-dot-menu-content a {
                color: #333 !important;
                padding: 8px 12px !important;
                text-decoration: none !important;
                display: block !important;
                font-size: 12px !important;
            }
            .three-dot-menu-content a:hover {
                background-color: #f8f9fa !important;
            }
            .connect-btn {
                background: #28a745 !important;
                color: white !important;
                border: none !important;
                border-radius: 4px !important;
                padding: 6px 12px !important;
                cursor: pointer !important;
                font-size: 12px !important;
                margin-top: 8px !important;
            }
            .connect-btn:hover {
                background: #218838 !important;
            }
            .connect-btn:disabled {
                background: #6c757d !important;
                cursor: not-allowed !important;
            }
        `;
        document.head.appendChild(style);
    }

    createUI() {
        if (this.ui) return;

        this.ui = document.createElement('div');
        this.ui.className = 'sales-navigator-floating-ui';
        this.ui.innerHTML = `
            <div class="sales-nav-header">
                <h3 class="sales-nav-title">Sales Navigator</h3>
                <div class="sales-nav-controls">
                    <button class="sales-nav-minimize" title="Minimize">−</button>
                    <button class="sales-nav-close" title="Close">&times;</button>
                </div>
            </div>
            <div class="sales-nav-content">
                <div class="sales-nav-controls">
                    <button class="sales-nav-btn start" id="start-collecting">
                        Start Collecting
                    </button>
                    <button class="sales-nav-btn pause" id="pause-collecting" disabled>
                        Pause Collecting
                    </button>
                </div>
                
                <div class="sales-nav-status">
                    <div class="status-indicator">
                        <span class="status-dot" id="status-dot"></span>
                        <span id="status-text">Ready to collect profiles</span>
                    </div>
                </div>

                <div class="profiles-section">
                    <div class="profiles-header">
                        <span class="profiles-count">Profiles: <span id="profiles-count">0</span></span>
                        <button class="clear-profiles" id="clear-profiles">Clear All</button>
                    </div>
                    <div class="profiles-list" id="profiles-list">
                        <div class="empty-profiles">
                            No profiles collected yet. Click "Start Collecting" to begin.
                        </div>
                    </div>
                </div>

                <button class="sales-nav-btn next" id="next-button" style="display: none;">
                    Next: Process Profiles (0)
                </button>

                <div class="workflow-status" id="workflow-status" style="display: none;">
                    <div id="workflow-text">Ready to process profiles</div>
                </div>
            </div>
        `;

        document.body.appendChild(this.ui);
    }

    setupEventListeners() {
        const startBtn = this.ui.querySelector('#start-collecting');
        const pauseBtn = this.ui.querySelector('#pause-collecting');
        const nextBtn = this.ui.querySelector('#next-button');
        const closeBtn = this.ui.querySelector('.sales-nav-close');
        const minimizeBtn = this.ui.querySelector('.sales-nav-minimize');
        const clearBtn = this.ui.querySelector('#clear-profiles');
        const header = this.ui.querySelector('.sales-nav-header');

        startBtn.addEventListener('click', () => this.startCollecting());
        pauseBtn.addEventListener('click', () => this.pauseCollecting());
        nextBtn.addEventListener('click', () => this.startWorkflow());
        closeBtn.addEventListener('click', () => this.closeUI());
        minimizeBtn.addEventListener('click', () => this.toggleMinimize());
        clearBtn.addEventListener('click', () => this.clearProfiles());

        // Make the UI draggable
        this.makeDraggable(header);
    }

    makeDraggable(handle) {
        let isDragging = false;
        let currentX;
        let currentY;
        let initialX;
        let initialY;
        let xOffset = 0;
        let yOffset = 0;

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

                // Keep within viewport bounds
                const rect = this.ui.getBoundingClientRect();
                const maxX = window.innerWidth - rect.width;
                const maxY = window.innerHeight - rect.height;

                currentX = Math.max(0, Math.min(currentX, maxX));
                currentY = Math.max(0, Math.min(currentY, maxY));

                this.ui.style.transform = `translate(${currentX}px, ${currentY}px)`;
            }
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                this.ui.style.cursor = 'move';
            }
        });
    }

    startAutoDetection() {
        if (window.location.href.includes('/sales/') || window.location.href.includes('/in/')) {
            setTimeout(() => this.showUI(), 2000);
            this.checkAndRestoreWorkflow();
        }

        let lastUrl = location.href;
        const urlObserver = new MutationObserver(() => {
            const url = location.href;
            if (url !== lastUrl) {
                lastUrl = url;
                if (url.includes('/sales/') || url.includes('/sales/search/people')) {
                    setTimeout(() => {
                        this.showUI();
                        // Check if we need to continue workflow after returning to search page
                        const savedState = localStorage.getItem('salesNavWorkflow');
                        if (savedState) {
                            try {
                                const state = JSON.parse(savedState);
                                if (state.currentWorkflowStep === 'processing') {
                                    // Don't show workflow popup on search page
                                    // Just continue processing next profile
                                    setTimeout(() => this.processNextProfile(), 1000);
                                }
                            } catch (e) {
                                console.error('Error checking workflow state:', e);
                            }
                        }
                    }, 2000);
                } else if (url.includes('/in/') && url.includes('linkedin.com')) {
                    // We're on a LinkedIn profile page, check for workflow restoration
                    setTimeout(() => this.checkAndRestoreWorkflow(), 2000);
                }
            }
        });

        urlObserver.observe(document, { subtree: true, childList: true });

        setTimeout(() => {
            if (window.location.href.includes('/sales/') || window.location.href.includes('/sales/search/people')) {
                this.showUI();
            } else if (window.location.href.includes('/in/') && window.location.href.includes('linkedin.com')) {
                this.checkAndRestoreWorkflow();
            }
        }, 5000);
    }

    checkAndRestoreWorkflow() {
        const savedState = localStorage.getItem('salesNavWorkflow');
        if (!savedState) return;

        try {
            const state = JSON.parse(savedState);
            if (state.currentWorkflowStep === 'processing') {
                this.currentWorkflowStep = state.currentWorkflowStep;
                this.currentProfileIndex = state.currentProfileIndex;
                this.profiles = state.profiles || [];
                this.generatedMessage = state.generatedMessage || "Hello dear";
                this.processedProfiles = state.processedProfiles || [];
                this.currentLinkedInProfileUrl = null;

                this.showWorkflowPopup();
                setTimeout(() => this.processNextProfile(), 3000);
            }
        } catch (error) {
            localStorage.removeItem('salesNavWorkflow');
        }
    }

    showUI() {
        // Don't show collection UI if workflow is in progress
        if (this.currentWorkflowStep === 'processing') {
            return;
        }

        if (this.ui) {
            this.ui.style.display = 'flex';
            this.ui.style.visibility = 'visible';
            this.ui.style.opacity = '1';
        }
    }

    hideCollectionUI() {
        if (this.ui) {
            this.ui.style.display = 'none';
            this.ui.style.visibility = 'hidden';
            this.ui.style.opacity = '0';
        }
    }

    getCurrentProfileUrl() {
        if (this.currentProfileIndex < this.profiles.length) {
            return this.profiles[this.currentProfileIndex].url || 'No URL available';
        }
        return 'No profile selected';
    }

    closeUI() {
        if (this.ui) {
            this.ui.style.display = 'none';
        }
        this.pauseCollecting();
    }

    toggleMinimize() {
        const content = this.ui.querySelector('.sales-nav-content');
        const minimizeBtn = this.ui.querySelector('.sales-nav-minimize');

        if (content.style.display === 'none') {
            // Expand
            content.style.display = 'block';
            minimizeBtn.textContent = '−';
            minimizeBtn.title = 'Minimize';
            this.ui.style.height = 'auto';
        } else {
            // Minimize
            content.style.display = 'none';
            minimizeBtn.textContent = '+';
            minimizeBtn.title = 'Expand';
            this.ui.style.height = 'auto';
        }
    }

    startCollecting() {
        this.isCollecting = true;
        this.updateUI();
        this.setupProfileObserver();
        this.collectCurrentPageProfiles();
        
        // Start periodic collection
        this.collectingInterval = setInterval(() => {
            this.collectCurrentPageProfiles();
        }, 3000);
    }

    pauseCollecting() {
        this.isCollecting = false;
        this.updateUI();
        
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        
        if (this.collectingInterval) {
            clearInterval(this.collectingInterval);
            this.collectingInterval = null;
        }
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

        this.observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    isProfileElement(element) {
        const selectors = [
            '.artdeco-entity-lockup',
            '[data-chameleon-result-urn]',
            '.search-results__result-item',
            '.result-lockup'
        ];
        
        return selectors.some(selector => 
            element.matches && element.matches(selector) ||
            element.querySelector && element.querySelector(selector)
        );
    }

    collectCurrentPageProfiles() {
        if (!this.isCollecting) return;

        const selectors = [
            '.artdeco-entity-lockup',
            '[data-chameleon-result-urn]',
            '.search-results__result-item',
            '.result-lockup'
        ];

        let profileElements = [];
        for (const selector of selectors) {
            profileElements = document.querySelectorAll(selector);
            if (profileElements.length > 0) break;
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
            const nameElement = element.querySelector('a[href*="/sales/lead/"], a[href*="/in/"]');
            const titleBlock = element.querySelector('.artdeco-entity-lockup__subtitle');
            const locationElement = element.querySelector('.artdeco-entity-lockup__caption');
            const imageElement = element.querySelector('img[src*="profile"]');
    
            if (!nameElement) return null;
    
            let name = nameElement.textContent?.trim();
            // Remove "is reachable" text from names
            if (name && name.includes(' is reachable')) {
                name = name.replace(' is reachable', '').trim();
            }
            
            const url = nameElement.href.startsWith('http') ? nameElement.href : `https://www.linkedin.com${nameElement.getAttribute('href')}`;
            const location = locationElement?.textContent?.trim() || '';
            const profilePic = imageElement?.src || '';
            
            let title = '';
            let company = '';
    
            if (titleBlock) {
                const raw = titleBlock.innerText.trim();
    
                // Try to split title from company using " at " separator if present
                if (raw.includes(' at ')) {
                    const parts = raw.split(' at ');
                    title = parts[0]?.trim() || '';
                    company = parts[1]?.trim() || '';
                } else {
                    title = raw;
                }
            }
    
            return {
                name,
                url,
                title,
                company,
                location,
                profilePic,
                timestamp: Date.now(),
                source: 'sales-navigator'
            };
        } catch (error) {
            console.error('Error extracting profile data:', error);
            return null;
        }
    }

    isDuplicateProfile(newProfile) {
        return this.profiles.some(profile => 
            profile.url === newProfile.url || 
            (profile.name === newProfile.name && profile.title === newProfile.title)
        );
    }

    addProfile(profile) {
        this.profiles.push(profile);

        this.updateProfilesList();
        this.updateProfilesCount();
        this.sendProfileToExtension(profile);
    }

    sendProfileToExtension(profile) {
        try {
            chrome.runtime.sendMessage({
                action: 'profileCollected',
                profiles: [profile],
                source: 'sales-navigator-ui'
            });
        } catch (error) {

        }
    }

    updateUI() {
        const startBtn = this.ui.querySelector('#start-collecting');
        const pauseBtn = this.ui.querySelector('#pause-collecting');
        const nextBtn = this.ui.querySelector('#next-button');
        const statusDot = this.ui.querySelector('#status-dot');
        const statusText = this.ui.querySelector('#status-text');

        if (this.isCollecting) {
            startBtn.disabled = true;
            pauseBtn.disabled = false;
            statusDot.className = 'status-dot collecting';
            statusText.innerHTML = 'Collecting profiles... <span class="collecting-animation"></span>';
        } else {
            startBtn.disabled = false;
            pauseBtn.disabled = true;
            statusDot.className = 'status-dot paused';
            statusText.textContent = 'Collection paused';
            
            // Show Next button if profiles are collected
            if (this.profiles.length > 0) {
                nextBtn.style.display = 'block';
                nextBtn.textContent = `Next: Process Profiles (${this.profiles.length})`;
            } else {
                nextBtn.style.display = 'none';
            }
        }
    }

    updateProfilesCount() {
        const countElement = this.ui.querySelector('#profiles-count');
        const nextBtn = this.ui.querySelector('#next-button');
        
        countElement.textContent = this.profiles.length;
        
        // Show Next button if profiles are collected and not currently collecting
        if (this.profiles.length > 0 && !this.isCollecting) {
            nextBtn.style.display = 'block';
            nextBtn.textContent = `Next: Process Profiles (${this.profiles.length})`;
        } else if (this.profiles.length === 0) {
            nextBtn.style.display = 'none';
        }
    }

    updateProfilesList() {
        const listElement = this.ui.querySelector('#profiles-list');
        
        if (this.profiles.length === 0) {
            listElement.innerHTML = '<div class="empty-profiles">No profiles collected yet. Click "Start Collecting" to begin.</div>';
            return;
        }

        listElement.innerHTML = this.profiles.map(profile => `
            <div class="profile-item">
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
                    <div class="profile-url" title="${profile.url}" onclick="salesNavUI.copyProfileUrl('${profile.url}')" style="cursor: pointer;">${this.shortenUrl(profile.url)}</div>
                </div>
                <div class="profile-actions">
                    <button class="profile-action-btn remove-profile-btn" onclick="salesNavUI.removeProfile('${profile.url}')" title="Remove">✕</button>
                </div>
            </div>
        `).join('');
    }

    shortenUrl(url) {
        if (!url) return '';

        const match = url.match(/\/in\/([^\/\?]+)/);
        if (match) {
            return `linkedin.com/in/${match[1]}`;
        }
        return url.length > 30 ? url.substring(0, 30) + '...' : url;
    }

    copyProfileUrl(url) {
        navigator.clipboard.writeText(url).then(() => {

            const notification = document.createElement('div');
            notification.style.cssText = `
                position: fixed; top: 20px; right: 20px; background: #28a745; color: white; 
                padding: 10px 15px; border-radius: 5px; z-index: 10001; font-size: 12px;
            `;
            notification.textContent = 'Profile URL copied!';
            document.body.appendChild(notification);
            setTimeout(() => notification.remove(), 2000);
        }).catch(err => {
            console.error('Failed to copy URL:', err);
        });
    }

    removeProfile(url) {
        this.profiles = this.profiles.filter(profile => profile.url !== url);
        this.updateProfilesList();
        this.updateProfilesCount();
    }

    clearProfiles() {
        if (confirm('Are you sure you want to clear all collected profiles?')) {
            this.profiles = [];
            this.updateProfilesList();
            this.updateProfilesCount();
            this.updateUI();
        }
    }

    // New workflow methods
    startWorkflow() {
        console.log('startWorkflow() called with', this.profiles.length, 'profiles');
        if (this.profiles.length === 0) {
            alert('No profiles to process');
            return;
        }

        console.log('Starting workflow processing');
        this.currentWorkflowStep = 'processing';
        this.currentProfileIndex = 0;
        this.generatedMessage = "Hello dear";
        this.processedProfiles = [];

        console.log('Hiding collection UI and saving state');
        this.hideCollectionUI();
        this.saveState();

        if (this.workflowPopup) {
            console.log('Closing existing workflow popup');
            this.closeWorkflowPopup();
        }

        console.log('Starting profile processing in 500ms');
        setTimeout(() => {
            this.processNextProfile();
        }, 500);
    }

    saveState() {
        console.log('Saving workflow state');
        const state = {
            currentWorkflowStep: this.currentWorkflowStep,
            currentProfileIndex: this.currentProfileIndex,
            profiles: this.profiles,
            generatedMessage: this.generatedMessage,
            processedProfiles: this.processedProfiles || []
        };
        localStorage.setItem('salesNavWorkflow', JSON.stringify(state));
        console.log('State saved:', state);
    }

    showWorkflowPopup() {
        console.log('showWorkflowPopup called on:', window.location.href);

        // Only prevent popup on search pages, allow on profile pages
        if (window.location.href.includes('/sales/search/people')) {
            console.log('Preventing popup on search page');
            return;
        }

        console.log('Creating workflow popup');
        const overlay = document.createElement('div');
        overlay.id = 'workflow-popup-overlay';
        overlay.style.cssText = `
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            height: 100% !important;
            background: rgba(0, 0, 0, 0.8) !important;
            z-index: 999999 !important;
            display: flex !important;
            justify-content: center !important;
            align-items: center !important;
            pointer-events: auto !important;
        `;

        // Create popup content
        const popup = document.createElement('div');
        popup.id = 'workflow-popup';
        popup.style.cssText = `
            background: white !important;
            border-radius: 12px !important;
            padding: 24px !important;
            width: 500px !important;
            max-height: 80vh !important;
            overflow-y: auto !important;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3) !important;
            position: relative !important;
            z-index: 1000000 !important;
            pointer-events: auto !important;
        `;

        popup.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h2 style="margin: 0; color: #0073b1;">Processing Profiles</h2>
                <button id="close-workflow-popup" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #666;">&times;</button>
            </div>

            <div style="margin-bottom: 20px;">
                <div style="background: #f3f6f8; padding: 12px; border-radius: 8px; margin-bottom: 16px;">
                    <strong>Progress: </strong>
                    <span id="workflow-progress">0 / ${this.profiles.length}</span>
                </div>
                <div style="background: #e7f3ff; padding: 12px; border-radius: 8px; margin-bottom: 16px;">
                    <strong>Current Status: </strong>
                    <span id="workflow-current-status">Starting workflow...</span>
                </div>
                <div style="background: #fff3cd; padding: 12px; border-radius: 8px;">
                    <strong>Message: </strong>
                    <span id="workflow-message">${this.generatedMessage || 'Will be generated from LinkedIn profile URL'}</span>
                </div>
                <div style="background: #e3f2fd; padding: 12px; border-radius: 8px; margin-top: 8px;">
                    <strong>Current Profile URL: </strong>
                    <span id="workflow-profile-url" style="font-size: 12px; word-break: break-all;">${this.getCurrentProfileUrl()}</span>
                </div>
                <div style="background: #f3e5f5; padding: 12px; border-radius: 8px; margin-top: 8px;">
                    <strong>LinkedIn URL: </strong>
                    <span id="workflow-linkedin-url" style="font-size: 12px; word-break: break-all;">${this.currentLinkedInProfileUrl || 'Will be captured from profile'}</span>
                </div>
            </div>

            <div id="workflow-profiles-list" style="max-height: 300px; overflow-y: auto;">
                ${this.profiles.map((profile, index) => `
                    <div id="profile-${index}" style="display: flex; align-items: center; padding: 8px; border-bottom: 1px solid #eee;">
                        <div id="status-icon-${index}" style="width: 20px; height: 20px; border-radius: 50%; background: #ddd; margin-right: 12px; display: flex; align-items: center; justify-content: center; font-size: 12px;">⏳</div>
                        <div style="flex: 1;">
                            <div style="font-weight: 500;">${profile.name}</div>
                            <div style="font-size: 12px; color: #666;">${profile.title || ''}</div>
                        </div>
                        <div id="profile-status-${index}" style="font-size: 12px; color: #666;">Waiting</div>
                    </div>
                `).join('')}
            </div>

            <div style="margin-top: 20px; text-align: center;">
                <button id="pause-workflow" style="background: #f44336; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; margin-right: 10px;">Pause</button>
                <button id="resume-workflow" style="background: #4caf50; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; display: none;">Resume</button>
                <button id="force-continue" style="background: #ff9800; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; margin-left: 10px;">Force Continue</button>
            </div>
        `;

        // Prevent popup from closing when clicking on popup content
        popup.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        overlay.appendChild(popup);
        document.body.appendChild(overlay);

        // Add event listeners
        document.getElementById('close-workflow-popup').addEventListener('click', () => {
            this.closeWorkflowPopup();
        });

        document.getElementById('pause-workflow').addEventListener('click', () => {
            this.pauseWorkflow();
        });

        document.getElementById('resume-workflow').addEventListener('click', () => {
            this.resumeWorkflow();
        });

        document.getElementById('force-continue').addEventListener('click', () => {
            this.forceContinueWorkflow();
        });

        this.workflowPopup = overlay;

        // Hide the main floating UI when workflow popup is shown
        if (this.ui) {
            this.ui.style.display = 'none';
        }

        // Update the UI with current data
        this.updateWorkflowUI();
    }

    updateWorkflowUI() {
        if (!this.workflowPopup) return;

        const progressElement = document.getElementById('workflow-progress');
        const statusElement = document.getElementById('workflow-current-status');
        const messageElement = document.getElementById('workflow-message');
        const profileUrlElement = document.getElementById('workflow-profile-url');
        const linkedinUrlElement = document.getElementById('workflow-linkedin-url');

        if (progressElement) {
            progressElement.textContent = `${this.currentProfileIndex} / ${this.profiles.length}`;
        }

        if (this.currentWorkflowStep === 'processing' && this.currentProfileIndex < this.profiles.length) {
            const currentProfile = this.profiles[this.currentProfileIndex];
            if (statusElement) {
                statusElement.textContent = `Processing: ${currentProfile.name}`;
            }
        }

        // Update message display
        if (messageElement && this.generatedMessage) {
            messageElement.textContent = this.generatedMessage;
        }

        // Update Sales Navigator profile URL
        if (profileUrlElement) {
            profileUrlElement.textContent = this.getCurrentProfileUrl();
        }

        // Update LinkedIn URL display
        if (linkedinUrlElement) {
            linkedinUrlElement.textContent = this.currentLinkedInProfileUrl || 'Will be captured from profile';
        }
    }

    closeWorkflowPopup() {
        if (this.workflowPopup) {
            document.body.removeChild(this.workflowPopup);
            this.workflowPopup = null;
        }
        this.currentWorkflowStep = null;
        this.currentProfileIndex = 0;

        // Show the collection UI again when workflow is closed
        this.showUI();
    }

    pauseWorkflow() {
        this.workflowPaused = true;
        document.getElementById('pause-workflow').style.display = 'none';
        document.getElementById('resume-workflow').style.display = 'inline-block';
        this.updateProfileStatus(this.currentProfileIndex, 'Paused', '⏸️', '#ff9800');
    }

    resumeWorkflow() {
        this.workflowPaused = false;
        document.getElementById('pause-workflow').style.display = 'inline-block';
        document.getElementById('resume-workflow').style.display = 'none';
        this.processNextProfile();
    }

    forceContinueWorkflow() {
        this.workflowPaused = false;
        this.updateProfileStatus(this.currentProfileIndex, 'Force continuing...', '⚡', '#ff9800');
        setTimeout(() => this.showThreeDotMenu(), 1000);
    }

    updateProfileStatus(index, status, icon, color) {
        const statusIcon = document.getElementById(`status-icon-${index}`);
        const profileStatus = document.getElementById(`profile-status-${index}`);

        if (statusIcon) {
            statusIcon.textContent = icon;
            statusIcon.style.background = color;
            statusIcon.style.color = 'white';
        }

        if (profileStatus) {
            profileStatus.textContent = status;
        }
    }

    async processNextProfile() {
        if (this.workflowPaused) return;

        if (this.currentProfileIndex >= this.profiles.length) {
            this.completeWorkflow();
            return;
        }

        const profile = this.profiles[this.currentProfileIndex];
        this.currentLinkedInProfileUrl = null;

        try {
            const currentUrl = window.location.href;
            const isOnSalesNavPage = currentUrl.includes('/sales/search/people');
            const isOnLinkedInProfilePage = currentUrl.includes('/in/') && currentUrl.includes('linkedin.com');
            const isOnSalesNavProfilePage = currentUrl.includes('/sales/lead/') && currentUrl.includes('linkedin.com');

            if (isOnSalesNavPage) {
                if (this.workflowPopup) {
                    this.closeWorkflowPopup();
                }
                await this.openProfileUrl(profile.url);
                return;
            } else if (isOnLinkedInProfilePage || isOnSalesNavProfilePage) {
                if (!this.workflowPopup) {
                    this.showWorkflowPopup();
                }

                this.updateWorkflowUI();
                this.updateProfileStatus(this.currentProfileIndex, 'Processing...', '🔄', '#2196f3');

                // Step 1: Wait for page to load
                this.updateProfileStatus(this.currentProfileIndex, 'Page loading...', '🔄', '#2196f3');

                if (this.workflowPaused) {
                    this.updateProfileStatus(this.currentProfileIndex, 'Paused', '⏸️', '#ff9800');
                    return;
                }

                await this.waitForPageLoad();

                // Step 2: Show three-dot menu and copy LinkedIn profile URL
                this.updateProfileStatus(this.currentProfileIndex, 'Finding menu...', '🔍', '#2196f3');
                await this.showThreeDotMenu();

                // Step 3: Generate message using captured LinkedIn profile URL
                this.updateProfileStatus(this.currentProfileIndex, 'Generating message...', '💬', '#2196f3');
                await this.generateMessageFromAPI();

                // Step 4: Show three-dot menu again to access connect option
                this.updateProfileStatus(this.currentProfileIndex, 'Preparing connect...', '🔗', '#2196f3');
                await this.showThreeDotMenu();

                // Step 5: Click connect button
                this.updateProfileStatus(this.currentProfileIndex, 'Connecting...', '🤝', '#2196f3');
                await this.clickConnectButton();

                // Step 6: Mark as completed and navigate back to Sales Navigator
                this.updateProfileStatus(this.currentProfileIndex, 'Completed', '✅', '#4caf50');
                this.processedProfiles.push({...profile, status: 'completed', message: this.generatedMessage});

                await this.wait(2000);
                this.currentProfileIndex++;

                // Check if there are more profiles to process
                if (this.currentProfileIndex < this.profiles.length) {
                    // Navigate back to Sales Navigator search page to process next profile
                    await this.navigateBackToSalesNav();
                } else {
                    // All profiles completed
                    this.completeWorkflow();
                }
                return;
            } else {
                // We're on some other page, try to navigate back to Sales Navigator
                await this.navigateBackToSalesNav();
                return;
            }

        } catch (error) {
            console.error('Error processing profile:', error);

            if (!this.workflowPopup) {
                this.showWorkflowPopup();
            }

            this.updateProfileStatus(this.currentProfileIndex, 'Error', '❌', '#f44336');
            this.processedProfiles.push({...profile, status: 'error', error: error.message});

            await this.wait(1000);
            this.currentProfileIndex++;

            // Try to continue with next profile
            if (this.currentProfileIndex < this.profiles.length) {
                if (window.location.href.includes('/sales/search/people')) {
                    this.processNextProfile();
                } else {
                    await this.navigateBackToSalesNav();
                }
            } else {
                this.completeWorkflow();
            }
        }
    }

    async navigateBackToSalesNav() {
        // Update popup status
        const statusElement = document.getElementById('workflow-current-status');
        if (statusElement) {
            statusElement.textContent = 'Returning to search page...';
        }

        // Save workflow state
        const state = {
            currentWorkflowStep: this.currentWorkflowStep,
            currentProfileIndex: this.currentProfileIndex,
            profiles: this.profiles,
            generatedMessage: this.generatedMessage,
            processedProfiles: this.processedProfiles || []
        };
        localStorage.setItem('salesNavWorkflow', JSON.stringify(state));

        // Navigate back to Sales Navigator search page
        // Try to use browser history first, then fallback to direct navigation
        if (document.referrer && document.referrer.includes('/sales/search/people')) {
            window.history.back();
        } else {
            // Fallback: construct Sales Navigator search URL
            const salesNavUrl = 'https://www.linkedin.com/sales/search/people';
            window.location.href = salesNavUrl;
        }
    }

    async openProfileUrl(url) {
        // Update popup status
        const statusElement = document.getElementById('workflow-current-status');
        if (statusElement) {
            statusElement.textContent = 'Opening profile URL...';
        }

        const state = {
            currentWorkflowStep: this.currentWorkflowStep,
            currentProfileIndex: this.currentProfileIndex,
            profiles: this.profiles,
            generatedMessage: this.generatedMessage,
            processedProfiles: this.processedProfiles || []
        };
        localStorage.setItem('salesNavWorkflow', JSON.stringify(state));

        window.location.href = url;
    }

    async waitForPageLoad() {
        const statusElement = document.getElementById('workflow-current-status');
        if (statusElement) {
            statusElement.textContent = 'Waiting for page to load...';
        }

        return new Promise(resolve => {
            const maxTimeout = setTimeout(() => {
                resolve();
            }, 10000);

            if (document.readyState === 'complete') {
                clearTimeout(maxTimeout);
                setTimeout(resolve, 1000);
                return;
            }

            const checkLoaded = () => {
                if (document.readyState === 'complete') {
                    clearTimeout(maxTimeout);
                    setTimeout(resolve, 1000);
                } else {
                    setTimeout(checkLoaded, 500);
                }
            };

            checkLoaded();
        });
    }

    async showThreeDotMenu() {
        // Update popup status
        const statusElement = document.getElementById('workflow-current-status');
        if (statusElement) {
            statusElement.textContent = 'Looking for three-dot menu...';
        }

        // Look for three-dot menu button with more comprehensive selectors
        const threeDotSelectors = [
            'button[aria-label*="More"]',
            'button[aria-label*="more"]',
            'button[aria-label*="More actions"]',
            'button[aria-label*="more actions"]',
            '.artdeco-dropdown__trigger',
            '[data-control-name="profile_more_actions"]',
            'button[data-control-name="profile_more_actions"]',
            'button[data-control-name="more_actions"]',
            'button[aria-label*="More actions for"]',
            'button[aria-label*="more actions for"]',
            'button[data-control-name="profile_actions"]',
            'button[aria-label*="More options"]',
            'button[aria-label*="more options"]',
            '.artdeco-button[aria-label*="More"]',
            '.artdeco-button[aria-label*="more"]'
        ];

        let threeDotButton = null;
        for (const selector of threeDotSelectors) {
            threeDotButton = document.querySelector(selector);
            if (threeDotButton) break;
        }

        if (threeDotButton) {
            threeDotButton.click();
            await this.wait(1000);

            const copyUrlSelectors = [
                'a[href*="copy-profile-url"]',
                'a[aria-label*="Copy profile URL"]',
                'a[aria-label*="copy profile url"]',
                'a[data-control-name="copy_profile_url"]',
                'a[data-control-name="copy_profile_link"]',
                'a[aria-label*="Copy link"]',
                'a[aria-label*="copy link"]',
                'a[aria-label*="Copy profile link"]',
                'a[aria-label*="copy profile link"]',

            ];

            let copyUrlLink = null;

            // First try CSS selectors
            for (const selector of copyUrlSelectors) {
                try {
                    copyUrlLink = document.querySelector(selector);
                    if (copyUrlLink) break;
                } catch (e) {
                    console.log('Invalid selector:', selector, e);
                }
            }

            // If no link found, try finding by text content
            if (!copyUrlLink) {
                const allLinks = document.querySelectorAll('a');
                for (const link of allLinks) {
                    const text = link.textContent?.toLowerCase() || '';
                    if (text.includes('copy link') || text.includes('copy profile') || text.includes('copy linkedin')) {
                        copyUrlLink = link;
                        break;
                    }
                }
            }

            if (copyUrlLink) {
                // Clear clipboard first and set up listener to capture the copied URL
                await this.setupClipboardCapture();

                copyUrlLink.click();
                if (statusElement) {
                    statusElement.textContent = 'Copying LinkedIn profile URL...';
                }

                // Wait for clipboard to be populated
                await this.wait(1000);

                // Capture the copied URL from clipboard
                const copiedUrl = await this.getCopiedUrl();
                if (copiedUrl) {
                    this.currentLinkedInProfileUrl = copiedUrl;
                    if (statusElement) {
                        statusElement.textContent = 'LinkedIn profile URL captured';
                    }
                    // Update the popup UI with the captured URL
                    this.updateWorkflowUI();
                } else {
                    if (statusElement) {
                        statusElement.textContent = 'Failed to capture copied URL';
                    }
                }

                await this.wait(500);
            } else {
                if (statusElement) {
                    statusElement.textContent = 'Copy URL link not found';
                }
                await this.wait(500);
            }
        } else {
            if (statusElement) {
                statusElement.textContent = 'Three-dot menu not found';
            }
            await this.wait(500);
        }
    }

    async setupClipboardCapture() {
        // Clear any previous clipboard content
        try {
            await navigator.clipboard.writeText('');
        } catch (error) {
            console.log('Could not clear clipboard:', error);
        }
    }

    async getCopiedUrl() {
        try {
            const clipboardText = await navigator.clipboard.readText();

            // Check if the clipboard contains a LinkedIn profile URL
            if (clipboardText && (clipboardText.includes('linkedin.com/in/') || clipboardText.includes('linkedin.com/pub/'))) {
                return clipboardText.trim();
            }

            return null;
        } catch (error) {
            console.error('Error reading clipboard:', error);
            return null;
        }
    }

    async generateMessageFromAPI() {
        const statusElement = document.getElementById('workflow-current-status');

        // Use static message as per user preference
        this.generatedMessage = "Hello dear";

        if (statusElement) {
            statusElement.textContent = 'Using static message: "Hello dear"';
        }

        this.updateWorkflowUI();
        await this.wait(500);
    }

    async clickConnectButton() {
        // Update popup status
        const statusElement = document.getElementById('workflow-current-status');
        if (statusElement) {
            statusElement.textContent = 'Looking for connect button...';
        }

        // Look for connect button with valid CSS selectors
        const connectSelectors = [
            'button[aria-label*="Connect"]',
            'button[aria-label*="connect"]',
            'button[data-control-name="connect"]',
            'button[data-control-name="invite"]',
            '.artdeco-button[data-control-name="connect"]',
            '.artdeco-button[data-control-name="invite"]',
            'button[data-control-name="connect_with_message"]',
            'button[data-control-name="invite_with_message"]',
            '.artdeco-button[data-control-name="connect_with_message"]',
            '.artdeco-button[data-control-name="invite_with_message"]',
            'button[aria-label*="Invite"]',
            'button[aria-label*="invite"]',
            'button[aria-label*="Send invitation"]',
            'button[aria-label*="send invitation"]',
            'button[aria-label*="Send invite"]',
            'button[aria-label*="send invite"]'
        ];

        let connectButton = null;

        // First try CSS selectors
        for (const selector of connectSelectors) {
            try {
                connectButton = document.querySelector(selector);
                if (connectButton) break;
            } catch (e) {
                console.log('Invalid selector:', selector, e);
            }
        }

        // If no button found, try finding by text content
        if (!connectButton) {
            const allButtons = document.querySelectorAll('button');
            for (const button of allButtons) {
                const text = button.textContent?.toLowerCase() || '';
                if (text.includes('connect') || text.includes('invite')) {
                    connectButton = button;
                    break;
                }
            }
        }

        if (connectButton) {
            connectButton.click();
            if (statusElement) {
                statusElement.textContent = 'Connect button clicked';
            }
            await this.wait(1000);
        } else {
            if (statusElement) {
                statusElement.textContent = 'Connect button not found';
            }
            await this.wait(1000);
        }
    }

    async wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    completeWorkflow() {
        // Update popup to show completion
        const statusElement = document.getElementById('workflow-current-status');
        const progressElement = document.getElementById('workflow-progress');

        if (statusElement) {
            statusElement.textContent = `Workflow completed! Processed ${this.profiles.length} profiles`;
            statusElement.parentElement.style.background = '#d4edda';
            statusElement.parentElement.style.color = '#155724';
        }

        if (progressElement) {
            progressElement.textContent = `${this.profiles.length} / ${this.profiles.length} (Complete)`;
        }

        // Hide pause/resume buttons and show close button
        const pauseBtn = document.getElementById('pause-workflow');
        const resumeBtn = document.getElementById('resume-workflow');
        if (pauseBtn) pauseBtn.style.display = 'none';
        if (resumeBtn) resumeBtn.style.display = 'none';

        // Add completion summary
        const popup = document.getElementById('workflow-popup');
        if (popup) {
            const summaryDiv = document.createElement('div');
            summaryDiv.style.cssText = `
                margin-top: 20px;
                padding: 16px;
                background: #d4edda;
                border-radius: 8px;
                border: 1px solid #c3e6cb;
            `;

            const completedCount = this.processedProfiles.filter(p => p.status === 'completed').length;
            const errorCount = this.processedProfiles.filter(p => p.status === 'error').length;

            summaryDiv.innerHTML = `
                <h3 style="margin: 0 0 12px 0; color: #155724;">Workflow Summary</h3>
                <div style="color: #155724;">
                    <div>✅ Successfully processed: ${completedCount} profiles</div>
                    ${errorCount > 0 ? `<div>❌ Errors: ${errorCount} profiles</div>` : ''}
                    <div>💬 Message used: "${this.generatedMessage}"</div>
                </div>
            `;

            popup.appendChild(summaryDiv);
        }

        // Clear workflow state
        localStorage.removeItem('salesNavWorkflow');

        // Auto-close popup after 5 seconds
        setTimeout(() => {
            this.closeWorkflowPopup();

            // Show the collection UI again
            this.showUI();

            // Update main UI
            const workflowStatus = this.ui.querySelector('#workflow-status');
            const nextBtn = this.ui.querySelector('#next-button');

            if (workflowStatus) workflowStatus.style.display = 'none';
            if (nextBtn) {
                nextBtn.style.display = 'block';
                nextBtn.textContent = `Next: Process Profiles (${this.profiles.length})`;
            }
        }, 5000);
    }
}

window.SalesNavigatorFloatingUI = SalesNavigatorFloatingUI;

// Initialize the UI
console.log('Content script loaded, initializing SalesNavigatorFloatingUI');
if (typeof window.salesNavUI === 'undefined') {
    console.log('Creating new SalesNavigatorFloatingUI instance');
    window.salesNavUI = new SalesNavigatorFloatingUI();
} else {
    console.log('SalesNavigatorFloatingUI instance already exists');
}
