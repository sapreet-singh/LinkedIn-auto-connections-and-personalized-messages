class SalesNavigatorFloatingUI {
    constructor() {
        this.isCollecting = false;
        this.profiles = [];
        this.observer = null;
        this.collectingInterval = null;
        this.ui = null;
        this.currentWorkflowStep = 'collecting';
        this.currentProfileIndex = 0;
        this.generatedMessage = null;

        if (this.isSalesNavigatorSearchPage()) {
            this.init();
        }
    }

    isSalesNavigatorSearchPage() {
        const url = window.location.href;
        return url.includes('/sales/search/people') && url.includes('linkedin.com');
    }

    init() {
        if (!this.isSalesNavigatorSearchPage()) {
            return;
        }

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
                this.generatedMessage = state.generatedMessage || null;
                this.showUI();
                this.updateProfilesList();
                this.updateProfilesCount();
                this.updateUI();
                if (this.currentWorkflowStep === 'processing') {
                    setTimeout(() => this.processNextProfile(), 1000);
                }
            } catch (e) {
                console.error('Error restoring workflow state:', e);
                localStorage.removeItem('salesNavWorkflow');
            }
        } else {
            setTimeout(() => {
                this.showUI();
            }, 1000);
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
        // Show UI on any LinkedIn Sales Navigator page (search or profile)
        if (window.location.href.includes('/sales/') || window.location.href.includes('/in/')) {
            setTimeout(() => this.showUI(), 2000);
        }

        let lastUrl = location.href;
        const urlObserver = new MutationObserver(() => {
            const url = location.href;
            if (url !== lastUrl) {
                lastUrl = url;
                if (url.includes('/sales/') || url.includes('/sales/search/people')) {
                    setTimeout(() => this.showUI(), 2000);
                }
            }
        });

        urlObserver.observe(document, { subtree: true, childList: true });

        window.addEventListener('popstate', () => {
            if (window.location.href.includes('/sales/') || window.location.href.includes('/sales/search/people')) {
                setTimeout(() => this.showUI(), 2000);
            }
        });

        setTimeout(() => {
            if (window.location.href.includes('/sales/') || window.location.href.includes('/sales/search/people')) {
                this.showUI();
            }
        }, 5000);
    }

    showUI() {
        if (this.ui) {
            this.ui.style.display = 'flex';
            this.ui.style.visibility = 'visible';
            this.ui.style.opacity = '1';
        }
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
        if (this.profiles.length === 0) {
            alert('No profiles to process');
            return;
        }


        this.currentWorkflowStep = 'processing';
        this.currentProfileIndex = 0;
        this.generatedMessage = null;
        
        this.updateWorkflowUI();
        this.processNextProfile();
    }

    updateWorkflowUI() {
        const workflowStatus = this.ui.querySelector('#workflow-status');
        const workflowText = this.ui.querySelector('#workflow-text');
        const nextBtn = this.ui.querySelector('#next-button');

        workflowStatus.style.display = 'block';
        nextBtn.style.display = 'none';

        if (this.currentWorkflowStep === 'processing') {
            const currentProfile = this.profiles[this.currentProfileIndex];
            workflowText.textContent = `Processing: ${currentProfile.name} (${this.currentProfileIndex + 1}/${this.profiles.length})`;
        }
    }

    async processNextProfile() {
        if (this.currentProfileIndex >= this.profiles.length) {
            this.completeWorkflow();
            return;
        }

        const profile = this.profiles[this.currentProfileIndex];
        this.updateWorkflowUI();

        try {
            // Check if we're already on the profile page
            const currentUrl = window.location.href;
            const isOnProfilePage = currentUrl.includes(profile.url) || 
                                  (currentUrl.includes('/in/') && currentUrl.includes(profile.name?.toLowerCase().replace(/\s+/g, '')));

            if (!isOnProfilePage) {
                await this.openProfileUrl(profile.url);
                return;
            } else {
                
                // Step 2: Wait for page to load
                await this.waitForPageLoad();
                
                // Step 3: Show three-dot menu and copy URL
                await this.showThreeDotMenu();
                
                // Step 4: Call API to generate message
                await this.generateMessageFromAPI(profile.url);
                
                // Step 5: Show three-dot menu again
                await this.showThreeDotMenu();
                
                // Step 6: Click connect button
                await this.clickConnectButton();
                
                // Step 7: Wait and move to next profile
                await this.wait(2000);
                this.currentProfileIndex++;
                this.processNextProfile();
            }

        } catch (error) {
            console.error('Error processing profile:', error);
            this.currentProfileIndex++;
            this.processNextProfile();
        }
    }

    async openProfileUrl(url) {
        const workflowText = this.ui.querySelector('#workflow-text');
        workflowText.textContent = 'Opening profile URL...';
        
        const state = {
            currentWorkflowStep: this.currentWorkflowStep,
            currentProfileIndex: this.currentProfileIndex,
            profiles: this.profiles,
            generatedMessage: this.generatedMessage
        };
        localStorage.setItem('salesNavWorkflow', JSON.stringify(state));
        
        window.location.href = url;
    }

    async waitForPageLoad() {
        const workflowText = this.ui.querySelector('#workflow-text');
        workflowText.textContent = 'Waiting for page to load...';
        
        return new Promise(resolve => {
            setTimeout(resolve, 3000);
        });
    }

    async showThreeDotMenu() {
        const workflowText = this.ui.querySelector('#workflow-text');
        workflowText.textContent = 'Looking for three-dot menu...';
        
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
                    'a:contains("Copy profile URL")',
                    'a:contains("copy profile url")',
                    'a:contains("Copy link")',
                    'a:contains("copy link")',
                    'a:contains("Copy profile link")',
                    'a:contains("copy profile link")'
                ];

                let copyUrlLink = null;
                for (const selector of copyUrlSelectors) {
                    copyUrlLink = document.querySelector(selector);
                    if (copyUrlLink) break;
                }

                if (copyUrlLink) {
                    copyUrlLink.click();
                    workflowText.textContent = 'Profile URL copied';
                    await this.wait(500);
                } else {
                    workflowText.textContent = 'Copy URL link not found';
                    await this.wait(500);
                }
            } else {
                workflowText.textContent = 'Three-dot menu not found';
                await this.wait(500);
            }
    }

    async generateMessageFromAPI(profileUrl) {
        const workflowText = this.ui.querySelector('#workflow-text');
        workflowText.textContent = 'Generating message from API...';

        try {
            const response = await fetch('http://localhost:7008/api/linkedin/messages', {
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
            
            // Store the message in message1 variable
            this.generatedMessage = data;
            
            workflowText.textContent = 'Message generated successfully';
            await this.wait(1000);

        } catch (error) {
            console.error('Error generating message:', error);
            workflowText.textContent = 'Failed to generate message';
            await this.wait(1000);
        }
    }

    async clickConnectButton() {
        const workflowText = this.ui.querySelector('#workflow-text');
        workflowText.textContent = 'Looking for connect button...';
        
        // Look for connect button with more comprehensive selectors
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
            'button:contains("Connect")',
            'button:contains("connect")',
            'button:contains("Invite")',
            'button:contains("invite")',
            'button[aria-label*="Invite"]',
            'button[aria-label*="invite"]',
            'button[aria-label*="Send invitation"]',
            'button[aria-label*="send invitation"]',
            'button[aria-label*="Send invite"]',
            'button[aria-label*="send invite"]'
        ];

        let connectButton = null;
        for (const selector of connectSelectors) {
            connectButton = document.querySelector(selector);
            if (connectButton) break;
        }

        if (connectButton) {
            connectButton.click();
            workflowText.textContent = 'Connect button clicked';
            await this.wait(1000);
        } else {
            workflowText.textContent = 'Connect button not found';
            await this.wait(1000);
        }
    }

    async wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    completeWorkflow() {
        const workflowStatus = this.ui.querySelector('#workflow-status');
        const workflowText = this.ui.querySelector('#workflow-text');
        const nextBtn = this.ui.querySelector('#next-button');

        workflowText.textContent = `Workflow completed! Processed ${this.profiles.length} profiles`;
        workflowStatus.style.background = '#d4edda';
        workflowStatus.style.borderColor = '#c3e6cb';
        workflowStatus.style.color = '#155724';

        // Clear workflow state
        localStorage.removeItem('salesNavWorkflow');

        setTimeout(() => {
            workflowStatus.style.display = 'none';
            nextBtn.style.display = 'block';
            nextBtn.textContent = `Next: Process Profiles (${this.profiles.length})`;
        }, 3000);
    }
}

window.SalesNavigatorFloatingUI = SalesNavigatorFloatingUI;
