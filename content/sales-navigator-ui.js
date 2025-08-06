if (typeof window.SalesNavigatorFloatingUI === 'undefined') {
class SalesNavigatorFloatingUI {
    constructor() {
        this.isCollecting = false;
        this.profiles = [];
        this.observer = null;
        this.collectingInterval = null;
        this.ui = null;
        this.init();
    }

    init() {
        this.injectCSS();
        this.createUI();
        this.setupEventListeners();
        this.startAutoDetection();

        setTimeout(() => {
            this.showUI();
        }, 1000);
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
            </div>
        `;

        document.body.appendChild(this.ui);
    }

    setupEventListeners() {
        const startBtn = this.ui.querySelector('#start-collecting');
        const pauseBtn = this.ui.querySelector('#pause-collecting');
        const closeBtn = this.ui.querySelector('.sales-nav-close');
        const minimizeBtn = this.ui.querySelector('.sales-nav-minimize');
        const clearBtn = this.ui.querySelector('#clear-profiles');
        const header = this.ui.querySelector('.sales-nav-header');

        startBtn.addEventListener('click', () => this.startCollecting());
        pauseBtn.addEventListener('click', () => this.pauseCollecting());
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
        if (window.location.href.includes('/sales/search/people')) {
            setTimeout(() => this.showUI(), 2000);
        }

        let lastUrl = location.href;
        const urlObserver = new MutationObserver(() => {
            const url = location.href;
            if (url !== lastUrl) {
                lastUrl = url;
                if (url.includes('/sales/search/people')) {
                    setTimeout(() => this.showUI(), 2000);
                }
            }
        });

        urlObserver.observe(document, { subtree: true, childList: true });

        window.addEventListener('popstate', () => {
            if (window.location.href.includes('/sales/search/people')) {
                setTimeout(() => this.showUI(), 2000);
            }
        });

        setTimeout(() => {
            if (window.location.href.includes('/sales/search/people')) {
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
        }
    }

    updateProfilesCount() {
        const countElement = this.ui.querySelector('#profiles-count');
        countElement.textContent = this.profiles.length;
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
        }
    }
}

// Create global instance
window.SalesNavigatorFloatingUI = SalesNavigatorFloatingUI;
window.salesNavUI = new SalesNavigatorFloatingUI();
}
