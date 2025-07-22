// LinkedIn Content Script - Handles automation on LinkedIn pages

// Prevent multiple injections
if (window.linkedInAutomationInjected) {
    console.log('LinkedIn Automation already injected, skipping...');
} else {
    window.linkedInAutomationInjected = true;

class LinkedInAutomation {
    constructor() {
        this.isRunning = false;
        this.currentCampaign = null;
        this.actionDelay = 30000; // 30 seconds default
        this.dailyLimit = 50;
        this.todayCount = 0;
        
        this.init();
    }
    
    init() {
        console.log('LinkedIn Automation initialized');

        // Listen for messages from background script
        chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
            this.handleMessage(message, sendResponse);
        });

        // Load settings
        this.loadSettings();

        // Auto-detect and start collection when on LinkedIn pages
        this.setupAutoDetection();
    }
    
    loadSettings() {
        chrome.storage.local.get(['actionDelay', 'dailyLimit', 'todayCount'], (result) => {
            this.actionDelay = (result.actionDelay || 30) * 1000;
            this.dailyLimit = result.dailyLimit || 50;
            this.todayCount = result.todayCount || 0;
        });
    }

    setupAutoDetection() {
        console.log('🔥 AUTO-DETECT: Setting up automatic profile detection...');

        // Check if we're on a LinkedIn page that has profiles
        if (this.isProfilePage()) {
            console.log('🔥 AUTO-DETECT: Profile page detected, starting auto-collection...');

            // Wait a moment for page to fully load
            setTimeout(() => {
                this.startAutoCollection();
            }, 2000);
        }

        // Monitor for page changes (SPA navigation)
        this.setupPageChangeMonitoring();
    }

    isProfilePage() {
        const url = window.location.href;
        return url.includes('linkedin.com/search/results/people') ||
               url.includes('linkedin.com/search/people') ||
               url.includes('linkedin.com/mynetwork') ||
               url.includes('linkedin.com/connections') ||
               (url.includes('linkedin.com') && document.querySelector('.reusable-search__result-container, [data-chameleon-result-urn], .search-result, .entity-result'));
    }

    setupPageChangeMonitoring() {
        // Monitor URL changes for SPA navigation
        let currentUrl = window.location.href;

        const urlObserver = new MutationObserver(() => {
            if (window.location.href !== currentUrl) {
                currentUrl = window.location.href;
                console.log('🔥 AUTO-DETECT: Page changed to:', currentUrl);

                // Check if new page has profiles
                setTimeout(() => {
                    if (this.isProfilePage() && !this.isAutoCollecting) {
                        console.log('🔥 AUTO-DETECT: New profile page detected, starting auto-collection...');
                        this.startAutoCollection();
                    }
                }, 2000);
            }
        });

        urlObserver.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Also listen for popstate events
        window.addEventListener('popstate', () => {
            setTimeout(() => {
                if (this.isProfilePage() && !this.isAutoCollecting) {
                    console.log('🔥 AUTO-DETECT: Profile page detected via popstate, starting auto-collection...');
                    this.startAutoCollection();
                }
            }, 2000);
        });
    }

    async startAutoCollection() {
        if (this.isAutoCollecting) {
            console.log('🔥 AUTO-DETECT: Auto-collection already running, skipping...');
            return;
        }

        this.isAutoCollecting = true;
        console.log('🔥 AUTO-DETECT: Starting automatic profile collection...');

        // Notify popup that auto-collection started
        try {
            chrome.runtime.sendMessage({
                action: 'autoCollectionStarted',
                url: window.location.href
            });
        } catch (error) {
            console.log('🔥 AUTO-DETECT: Could not notify popup:', error);
        }

        // Start collecting profiles immediately
        this.collectAndSendProfiles();

        // Set up continuous monitoring for new profiles
        this.setupContinuousMonitoring();
    }

    async collectAndSendProfiles() {
        console.log('🔥 AUTO-COLLECT: Collecting profiles from current page...');

        const profiles = await this.collectCurrentPageOnly();

        if (profiles.length > 0) {
            console.log(`🔥 AUTO-COLLECT: Found ${profiles.length} profiles, sending to popup...`);
            this.sendProfilesRealTime(profiles);
        } else {
            console.log('🔥 AUTO-COLLECT: No profiles found on current page');
        }
    }

    setupContinuousMonitoring() {
        console.log('🔥 AUTO-MONITOR: Setting up continuous profile monitoring...');

        // Set up observer to watch for new profiles being loaded
        const observer = new MutationObserver((mutations) => {
            let hasNewProfiles = false;

            mutations.forEach((mutation) => {
                if (mutation.addedNodes.length > 0) {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            // Check if new profile cards were added
                            const newProfileCards = node.querySelectorAll ?
                                node.querySelectorAll('.reusable-search__result-container, [data-chameleon-result-urn], .search-result, .entity-result') : [];

                            if (newProfileCards.length > 0) {
                                hasNewProfiles = true;
                            }
                        }
                    });
                }
            });

            if (hasNewProfiles) {
                // Debounce the collection to avoid too many calls
                clearTimeout(this.autoCollectionTimeout);
                this.autoCollectionTimeout = setTimeout(() => {
                    this.collectNewProfilesAuto();
                }, 1500);
            }
        });

        // Start observing
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Store observer reference for cleanup
        this.autoProfileObserver = observer;
    }

    async collectNewProfilesAuto() {
        if (!this.isAutoCollecting) return;

        console.log('🔥 AUTO-MONITOR: Collecting new profiles...');

        const profileCards = document.querySelectorAll('.reusable-search__result-container, [data-chameleon-result-urn], .search-result, .entity-result');
        const newProfiles = [];

        profileCards.forEach((card) => {
            // Skip if already processed
            if (card.dataset.autoProcessed) return;

            const profile = this.extractProfileFromCard(card);
            if (profile?.name && profile?.url) {
                newProfiles.push(profile);
                card.dataset.autoProcessed = 'true'; // Mark as processed
            }
        });

        if (newProfiles.length > 0) {
            console.log(`🔥 AUTO-MONITOR: Found ${newProfiles.length} new profiles`);
            this.sendProfilesRealTime(newProfiles);
        }
    }

    stopAutoCollection() {
        console.log('🔥 AUTO-COLLECT: Stopping auto-collection...');

        this.isAutoCollecting = false;

        // Clean up observers
        if (this.autoProfileObserver) {
            this.autoProfileObserver.disconnect();
            this.autoProfileObserver = null;
        }

        // Clear timeouts
        if (this.autoCollectionTimeout) {
            clearTimeout(this.autoCollectionTimeout);
            this.autoCollectionTimeout = null;
        }

        console.log('🔥 AUTO-COLLECT: Auto-collection stopped');
    }
    
    handleMessage(message, sendResponse) {
        console.log('🚀 CONTENT: Received message:', message);

        if (!message || !message.action) {
            console.log('🚀 CONTENT: Invalid message format');
            sendResponse({ error: 'Invalid message format' });
            return;
        }

        switch (message.action) {
            case 'startAutomation':
                this.startAutomation(message.campaign);
                sendResponse({ success: true });
                break;
            case 'stopAutomation':
                this.stopAutomation();
                sendResponse({ success: true });
                break;
            case 'getPageInfo':
                sendResponse(this.getPageInfo());
                break;
            case 'collectProfiles':
                this.collectProfiles().then(profiles => {
                    sendResponse({ profiles });
                });
                return true; // Keep message channel open for async response
            case 'startRealTimeCollection':
                console.log('🚀 CONTENT: Starting real-time collection mode');
                this.isRealTimeMode = true;
                this.currentPageCollected = false;

                // Wait a moment for page to load, then collect
                setTimeout(() => {
                    this.collectCurrentPageOnly().then(profiles => {
                        console.log('🚀 CONTENT: Current page collection found:', profiles.length, 'profiles');
                        if (profiles.length > 0) {
                            this.sendProfilesRealTime(profiles);
                            this.currentPageCollected = true;
                        } else {
                            console.log('🚀 CONTENT: No profiles found on current page, trying alternative methods...');
                            // Try alternative collection methods
                            const alternativeProfiles = this.extractProfilesAlternative();
                            if (alternativeProfiles.length > 0) {
                                console.log('🚀 CONTENT: Alternative method found:', alternativeProfiles.length, 'profiles');
                                this.sendProfilesRealTime(alternativeProfiles.slice(0, 10));
                            }
                        }
                    }).catch(error => {
                        console.error('🚀 CONTENT: Error in real-time collection:', error);
                    });
                }, 1000);

                sendResponse({ success: true });
                return true;
            case 'stopRealTimeCollection':
                console.log('🚀 CONTENT: Stopping real-time collection mode');
                this.isRealTimeMode = false;
                this.currentPageCollected = false;
                sendResponse({ success: true });
                return true;
            case 'stopAutoCollection':
                console.log('🔥 AUTO-COLLECT: Stopping auto-collection mode');
                this.stopAutoCollection();
                sendResponse({ success: true });
                return true;
            case 'startAutoCollection':
                console.log('🔥 AUTO-COLLECT: Starting auto-collection mode via message');
                if (!this.isAutoCollecting) {
                    this.startAutoCollection();
                }
                sendResponse({ success: true });
                return true;
            case 'searchByCompany':
                this.searchByCompany(message.companyName).then(result => {
                    sendResponse(result);
                });
                return true;
            case 'searchNetwork':
                console.log('Received searchNetwork message:', message);
                // Handle async response properly
                this.searchNetwork(message.criteria).then(profiles => {
                    console.log('Sending response with profiles:', profiles);
                    sendResponse({ profiles: profiles || [] });
                }).catch(error => {
                    console.error('Error in searchNetwork:', error);
                    sendResponse({ profiles: [], error: error.message });
                });
                return true;
            default:
                console.log('🚀 CONTENT: Received unknown action:', message.action);
                sendResponse({ error: 'Unknown action: ' + message.action });
        }
    }
    
    isSearchResultsPage() {
        return window.location.href.includes('/search/people/') ||
               window.location.href.includes('/search/results/people/');
    }
    
    startAutomationFromPage() {
        if (this.todayCount >= this.dailyLimit) {
            console.log('Daily limit reached!');
            return;
        }

        this.isRunning = true;
        console.log('Starting automation...');

        this.processConnections();
    }
    
    async processConnections() {
        if (!this.isRunning) return;
        
        const connectButtons = this.findConnectButtons();
        
        if (connectButtons.length === 0) {
            console.log('No connect buttons found');
            this.stopAutomation();
            return;
        }

        for (let i = 0; i < connectButtons.length && this.isRunning; i++) {
            if (this.todayCount >= this.dailyLimit) {
                console.log('Daily limit reached!');
                break;
            }

            const button = connectButtons[i];
            const personInfo = this.extractPersonInfo(button);

            console.log(`Connecting to ${personInfo.name}...`);
            
            try {
                await this.sendConnectionRequest(button, personInfo);
                this.todayCount++;

                // Update storage
                chrome.storage.local.set({ todayCount: this.todayCount });

                console.log(`Connected to ${personInfo.name}. Waiting...`);

                // Wait before next action
                if (i < connectButtons.length - 1) {
                    await this.delay(this.actionDelay);
                }
            } catch (error) {
                console.error('Error sending connection request:', error);
                console.log(`Error connecting to ${personInfo.name}`);
            }
        }

        console.log('Automation completed');
        this.stopAutomation();
    }
    
    findConnectButtons() {
        // Find all "Connect" buttons on the page
        const selectors = [
            'button[aria-label*="Connect"]',
            'button[data-control-name="connect"]',
            '.search-result__actions button[aria-label*="Invite"]'
        ];

        const buttons = [];
        selectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
                if ((el.textContent.includes('Connect') || el.getAttribute('aria-label')?.includes('Connect'))
                    && el.offsetParent !== null) {
                    buttons.push(el);
                }
            });
        });

        return buttons;
    }
    
    extractPersonInfo(connectButton) {
        // Try to extract person information from the search result
        const resultCard = connectButton.closest('.search-result') || 
                           connectButton.closest('.reusable-search__result-container') ||
                           connectButton.closest('[data-chameleon-result-urn]');
        
        let name = 'Unknown';
        let company = '';
        let title = '';
        
        if (resultCard) {
            // Try different selectors for name
            const nameElement = resultCard.querySelector('.entity-result__title-text a') ||
                               resultCard.querySelector('.search-result__result-link') ||
                               resultCard.querySelector('[data-anonymize="person-name"]');
            
            if (nameElement) {
                name = nameElement.textContent.trim();
            }
            
            // Try to get company and title
            const subtitleElement = resultCard.querySelector('.entity-result__primary-subtitle') ||
                                   resultCard.querySelector('.search-result__truncate');
            
            if (subtitleElement) {
                title = subtitleElement.textContent.trim();
            }
        }
        
        return { name, company, title };
    }
    
    async sendConnectionRequest(button, personInfo) {
        return new Promise((resolve, reject) => {
            try {
                // Click the connect button
                button.click();
                
                // Wait for modal to appear
                setTimeout(() => {
                    // Look for "Send without a note" or "Send" button
                    const sendButton = document.querySelector('button[aria-label*="Send without a note"]') ||
                                     document.querySelector('button[data-control-name="send_invite"]') ||
                                     document.querySelector('.send-invite__actions button[aria-label*="Send"]');
                    
                    if (sendButton) {
                        sendButton.click();
                        resolve();
                    } else {
                        // Try to find and use custom message option
                        const addNoteButton = document.querySelector('button[aria-label*="Add a note"]');
                        if (addNoteButton) {
                            addNoteButton.click();
                            
                            setTimeout(() => {
                                this.sendCustomMessage(personInfo, resolve, reject);
                            }, 1000);
                        } else {
                            reject(new Error('Could not find send button'));
                        }
                    }
                }, 1000);
            } catch (error) {
                reject(error);
            }
        });
    }
    
    async sendCustomMessage(personInfo, resolve, reject) {
        try {
            // Get connection message template
            chrome.storage.local.get(['connectionMessage'], async (result) => {
                const messageTemplate = result.connectionMessage || 'Hi {firstName}, I\'d love to connect with you!';
                const personalizedMessage = this.personalizeMessage(messageTemplate, personInfo);

                // Find message textarea
                const messageTextarea = document.querySelector('#custom-message') ||
                                       document.querySelector('textarea[name="message"]') ||
                                       document.querySelector('.send-invite__custom-message textarea');

                if (messageTextarea) {
                    messageTextarea.value = personalizedMessage;
                    messageTextarea.dispatchEvent(new Event('input', { bubbles: true }));

                    // Find and click send button
                    setTimeout(() => {
                        const sendButton = document.querySelector('button[aria-label*="Send invitation"]') ||
                                         document.querySelector('.send-invite__actions button[aria-label*="Send"]');

                        if (sendButton) {
                            sendButton.click();
                            resolve();
                        } else {
                            reject(new Error('Could not find send button for custom message'));
                        }
                    }, 500);
                } else {
                    reject(new Error('Could not find message textarea'));
                }
            });
        } catch (error) {
            reject(error);
        }
    }
    
    personalizeMessage(template, personInfo) {
        const firstName = personInfo.name.split(' ')[0];
        const lastName = personInfo.name.split(' ').slice(1).join(' ');
        
        return template
            .replace(/{firstName}/g, firstName)
            .replace(/{lastName}/g, lastName)
            .replace(/{fullName}/g, personInfo.name)
            .replace(/{company}/g, personInfo.company)
            .replace(/{title}/g, personInfo.title);
    }
    
    // Start automation with campaign data (called from popup)
    startAutomation(campaign) {
        console.log('Starting automation with campaign:', campaign);
        this.currentCampaign = campaign;
        this.startAutomationFromPage();
    }

    stopAutomation() {
        this.isRunning = false;
        console.log('Automation stopped');
    }
    

    
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    getPageInfo() {
        return {
            url: window.location.href,
            title: document.title,
            isSearchPage: this.isSearchResultsPage(),
            connectButtonsCount: this.findConnectButtons().length
        };
    }

    // Collect profiles from current page
    async collectProfiles() {
        const profiles = [];

        // Check if we're on My Network page
        if (window.location.href.includes('/mynetwork/')) {
            return this.collectNetworkProfiles();
        }

        // Find profile cards using common selectors
        const selectors = [
            '.reusable-search__result-container',
            '[data-chameleon-result-urn]',
            '.search-result',
            '.entity-result'
        ];

        let profileCards = [];
        for (const selector of selectors) {
            profileCards = document.querySelectorAll(selector);
            if (profileCards.length > 0) break;
        }

        profileCards.forEach((card) => {
            const profile = this.extractProfileFromCard(card);
            if (profile?.name && profile?.url) {
                profiles.push(profile);
                // Note: Real-time sending is handled separately in collectCurrentPageOnly()
            }
        });

        // If no profiles found with main selectors, try alternative approach
        if (profiles.length === 0) {
            console.log('No profiles found with main selectors, trying alternative approach...');
            const alternativeProfiles = this.extractProfilesAlternative();
            profiles.push(...alternativeProfiles);
            // Note: Real-time sending is handled separately in collectCurrentPageOnly()
        }

        return profiles;
    }

    // Collect only current page profiles (max 10) - for page-by-page collection
    async collectCurrentPageOnly() {
        console.log('🚀 CONTENT: Collecting current page only (max 10 profiles)...');
        console.log('🚀 CONTENT: Current URL:', window.location.href);

        const profiles = [];

        // Check if we're on My Network page
        if (window.location.href.includes('/mynetwork/')) {
            console.log('🚀 CONTENT: Detected My Network page');
            const networkProfiles = await this.collectNetworkProfiles();
            return networkProfiles.slice(0, 10); // Limit to 10
        }

        // Find profile cards using common selectors
        const selectors = [
            '.reusable-search__result-container',
            '[data-chameleon-result-urn]',
            '.search-result',
            '.entity-result',
            'li[data-reusable-search-result]',
            '.search-results-container li'
        ];

        let profileCards = [];
        for (const selector of selectors) {
            profileCards = document.querySelectorAll(selector);
            console.log(`🚀 CONTENT: Selector "${selector}" found ${profileCards.length} elements`);
            if (profileCards.length > 0) break;
        }

        // If no cards found with main selectors, try to find any elements with profile links
        if (profileCards.length === 0) {
            console.log('🚀 CONTENT: No cards found with main selectors, trying profile links...');
            const profileLinks = document.querySelectorAll('a[href*="/in/"]');
            console.log(`🚀 CONTENT: Found ${profileLinks.length} profile links`);

            // Group profile links by their parent containers
            const containers = new Set();
            profileLinks.forEach(link => {
                const container = link.closest('li, div[class*="result"], article');
                if (container) containers.add(container);
            });
            profileCards = Array.from(containers);
            console.log(`🚀 CONTENT: Grouped into ${profileCards.length} containers`);
        }

        // Limit to 10 profiles per page (LinkedIn's standard)
        const maxProfiles = Math.min(profileCards.length, 10);
        console.log(`🚀 CONTENT: Found ${profileCards.length} cards, limiting to ${maxProfiles}`);

        for (let i = 0; i < maxProfiles; i++) {
            const card = profileCards[i];
            console.log(`🚀 CONTENT: Processing card ${i + 1}/${maxProfiles}`);

            const profile = this.extractProfileFromCard(card);
            if (profile?.name && profile?.url) {
                console.log(`🚀 CONTENT: Successfully extracted profile: ${profile.name}`);
                profiles.push(profile);

                // Send each profile immediately for real-time updates
                this.sendProfilesRealTime([profile]);
            } else {
                console.log(`🚀 CONTENT: Failed to extract profile from card ${i + 1}`);
            }
        }

        console.log(`🚀 CONTENT: Collected ${profiles.length} profiles from current page`);
        return profiles;
    }

    // Send profiles to popup in real-time
    sendProfilesRealTime(profiles) {
        if (profiles.length > 0) {
            console.log('🚀 CONTENT: Sending profiles in real-time:', profiles.length);
            console.log('🚀 CONTENT: Profile sample:', profiles[0]);

            // Send message to popup to add profiles immediately
            try {
                chrome.runtime.sendMessage({
                    action: 'addProfilesRealTime',
                    profiles: profiles
                }).then(response => {
                    console.log('🚀 CONTENT: Popup responded successfully:', response);
                }).catch(error => {
                    console.log('🚀 CONTENT: Could not send real-time update to popup:', error);
                    // Try alternative method - store in local storage for popup to pick up
                    this.storeProfilesForPopup(profiles);
                });
            } catch (error) {
                console.error('🚀 CONTENT: Error sending message:', error);
                this.storeProfilesForPopup(profiles);
            }
        }
    }

    // Alternative method to communicate with popup via storage
    storeProfilesForPopup(profiles) {
        try {
            chrome.storage.local.get(['realTimeProfiles'], (result) => {
                const existingProfiles = result.realTimeProfiles || [];
                const updatedProfiles = [...existingProfiles, ...profiles];
                chrome.storage.local.set({
                    realTimeProfiles: updatedProfiles,
                    lastProfileUpdate: Date.now()
                });
                console.log('🚀 CONTENT: Stored profiles in local storage as fallback');
            });
        } catch (error) {
            console.error('🚀 CONTENT: Error storing profiles:', error);
        }
    }

    // Start continuous profile collection (monitors page changes)
    startContinuousCollection() {
        console.log('Starting continuous profile collection...');

        // Set up observer to watch for new profiles being loaded
        const observer = new MutationObserver((mutations) => {
            let hasNewProfiles = false;

            mutations.forEach((mutation) => {
                if (mutation.addedNodes.length > 0) {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            // Check if new profile cards were added
                            const newProfileCards = node.querySelectorAll ?
                                node.querySelectorAll('.reusable-search__result-container, [data-chameleon-result-urn], .search-result, .entity-result') : [];

                            if (newProfileCards.length > 0) {
                                hasNewProfiles = true;
                            }
                        }
                    });
                }
            });

            if (hasNewProfiles) {
                // Debounce the collection to avoid too many calls
                clearTimeout(this.collectionTimeout);
                this.collectionTimeout = setTimeout(() => {
                    this.collectNewProfiles();
                }, 1000);
            }
        });

        // Start observing
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Store observer reference for cleanup
        this.profileObserver = observer;
    }

    // Collect only new profiles that haven't been processed
    async collectNewProfiles() {
        console.log('Collecting new profiles...');

        const profileCards = document.querySelectorAll('.reusable-search__result-container, [data-chameleon-result-urn], .search-result, .entity-result');
        const newProfiles = [];

        profileCards.forEach((card) => {
            // Skip if already processed
            if (card.dataset.processed) return;

            const profile = this.extractProfileFromCard(card);
            if (profile?.name && profile?.url) {
                newProfiles.push(profile);
                card.dataset.processed = 'true'; // Mark as processed
            }
        });

        if (newProfiles.length > 0) {
            console.log(`Found ${newProfiles.length} new profiles`);
            this.sendProfilesRealTime(newProfiles);
        }
    }

    // Fix profile data by extracting correct information from mixed fields
    fixProfileData(profile) {
        // If name is "Status is offline" or similar, try to extract from location
        if (!profile.name ||
            profile.name.includes('Status is') ||
            profile.name.includes('offline') ||
            profile.name.includes('reachable') ||
            profile.name.length < 3) {

            // Try to extract name from location field
            if (profile.location) {
                // Look for pattern: "Name View Name's profile"
                const nameMatch = profile.location.match(/^([A-Za-z\s]+?)(?:View|•|\n)/);
                if (nameMatch && nameMatch[1].trim().length > 2) {
                    profile.name = nameMatch[1].trim();
                }

                // Extract title if it's in the location field
                const titleMatch = profile.location.match(/Full Stack Developer|Software Engineer|Developer|Engineer|Manager|Director|CEO|CTO|VP|President/i);
                if (titleMatch && !profile.title) {
                    profile.title = titleMatch[0];
                }

                // Extract location (city, country) from the mixed content
                const locationMatch = profile.location.match(/([A-Za-z\s]+,\s*[A-Za-z\s]+)(?:\n|$)/);
                if (locationMatch) {
                    const cleanLocation = locationMatch[1].trim();
                    // Only update if it looks like a real location
                    if (cleanLocation.includes(',') && !cleanLocation.includes('View')) {
                        profile.location = cleanLocation;
                    }
                }
            }
        }

        // Clean up title field if it contains connection info
        if (profile.title && profile.title.includes('degree connection')) {
            // Try to find actual title in the location field
            if (profile.location) {
                const titleMatch = profile.location.match(/\n\s*([A-Za-z\s]+(?:Developer|Engineer|Manager|Director|CEO|CTO|VP|President|Analyst|Consultant|Specialist)[A-Za-z\s]*)/i);
                if (titleMatch) {
                    profile.title = titleMatch[1].trim();
                } else {
                    profile.title = ''; // Clear invalid title
                }
            } else {
                profile.title = ''; // Clear invalid title
            }
        }

        // Extract company from title if format is "Title at Company"
        if (profile.title && profile.title.includes(' at ') && !profile.company) {
            const parts = profile.title.split(' at ');
            if (parts.length === 2) {
                profile.title = parts[0].trim();
                profile.company = parts[1].trim();
            }
        }
    }

    // Alternative profile extraction method when main selectors fail
    extractProfilesAlternative() {
        const profiles = [];

        // Look for any links that contain LinkedIn profile URLs
        const profileLinks = document.querySelectorAll('a[href*="/in/"]');
        console.log(`Found ${profileLinks.length} profile links using alternative method`);

        profileLinks.forEach(link => {
            // Skip if this link is already processed or doesn't look like a profile link
            if (!link.href.includes('/in/') || link.href.includes('?') || link.closest('.processed')) {
                return;
            }

            // Mark as processed to avoid duplicates
            link.classList.add('processed');

            const profile = {
                name: '',
                url: link.href,
                company: '',
                title: '',
                location: '',
                industry: '',
                profilePic: '',
                collectedAt: new Date().toISOString()
            };

            // Extract name from link text or nearby elements
            let nameText = link.textContent.trim();
            if (!nameText || nameText.includes('View') || nameText.includes('Status') || nameText.length < 3) {
                // Look for name in parent or sibling elements
                const parent = link.closest('li, div, article');
                if (parent) {
                    const nameElements = parent.querySelectorAll('span, h3, h4, .name, [data-anonymize="person-name"]');
                    for (const el of nameElements) {
                        const text = el.textContent.trim();
                        if (text && text.length > 2 && !text.includes('Status') && !text.includes('View') && text.split(' ').length >= 2) {
                            nameText = text;
                            break;
                        }
                    }
                }
            }

            if (nameText && nameText.length > 2) {
                profile.name = nameText;

                // Clean URL
                if (profile.url.includes('?')) {
                    profile.url = profile.url.split('?')[0];
                }
                profile.url = profile.url.replace(/\/$/, '');

                // Try to find profile picture
                const parent = link.closest('li, div, article');
                if (parent) {
                    const img = parent.querySelector('img[src*="http"]');
                    if (img && img.src && !img.src.includes('data:image')) {
                        profile.profilePic = img.src;
                    }
                }

                profiles.push(profile);
                console.log('Alternative extraction found profile:', profile.name);
            }
        });

        return profiles;
    }

    // Collect profiles specifically from My Network page
    async collectNetworkProfiles() {
        const profiles = [];

        // Selectors for My Network page
        const selectors = [
            '.discover-entity-type-card',
            '.mn-person-card',
            '[data-test-id="person-card"]',
            '.artdeco-entity-lockup',
            '.discover-person-card'
        ];

        let profileCards = [];
        for (const selector of selectors) {
            profileCards = document.querySelectorAll(selector);
            if (profileCards.length > 0) break;
        }

        profileCards.forEach(card => {
            const profile = this.extractProfileFromCard(card, true); // Use unified extraction with network flag
            if (profile?.name && profile?.url) {
                profiles.push(profile);
            }
        });

        return profiles;
    }

    // Extract profile information from a profile card (unified for all page types)
    extractProfileFromCard(card, isNetworkPage = false) {
        const profile = {
            name: '',
            url: '',
            company: '',
            title: '',
            location: '',
            industry: '',
            profilePic: '',
            collectedAt: new Date().toISOString()
        };

        try {
            // Common selectors for name and URL
            const nameSelectors = isNetworkPage ? [
                'a[href*="/in/"]',
                '.discover-entity-type-card__link',
                '.mn-person-card__link',
                '.artdeco-entity-lockup__title a'
            ] : [
                '.entity-result__title-text a',
                '.search-result__result-link',
                'a[href*="/in/"]',
                '.app-aware-link'
            ];

            let nameLink = null;
            for (const selector of nameSelectors) {
                nameLink = card.querySelector(selector);
                if (nameLink) break;
            }

            if (nameLink) {
                let nameText = nameLink.textContent.trim();

                // Clean the name text - remove unwanted parts
                if (nameText.includes('View') && nameText.includes('profile')) {
                    // Extract name before "View" text
                    const match = nameText.match(/^(.+?)(?:View|•|\n)/);
                    if (match) {
                        nameText = match[1].trim();
                    }
                }

                profile.name = nameText;
                profile.url = nameLink.href || '';
            } else {
                // Fallback: look for name in span elements with better selectors
                const nameSelectors = [
                    'span[aria-hidden="true"]',
                    '.t-16.t-black.t-bold',
                    '[data-anonymize="person-name"] span',
                    '.entity-result__title-text span',
                    '.search-result__result-link span',
                    '.artdeco-entity-lockup__title span',
                    'span.t-16',
                    'span.t-bold'
                ];

                let nameSpan = null;
                for (const selector of nameSelectors) {
                    nameSpan = card.querySelector(selector);
                    if (nameSpan && nameSpan.textContent.trim() &&
                        !nameSpan.textContent.includes('Status') &&
                        !nameSpan.textContent.includes('View') &&
                        nameSpan.textContent.length > 2) {
                        break;
                    }
                    nameSpan = null;
                }

                if (nameSpan) {
                    profile.name = nameSpan.textContent.trim();
                    const parentLink = nameSpan.closest('a') || card.querySelector('a[href*="/in/"]');
                    if (parentLink) profile.url = parentLink.href;
                } else {
                    // Last resort: try to find any text that looks like a name
                    const allLinks = card.querySelectorAll('a[href*="/in/"]');
                    for (const link of allLinks) {
                        const text = link.textContent.trim();
                        if (text && text.length > 2 &&
                            !text.includes('Status') &&
                            !text.includes('View') &&
                            !text.includes('•') &&
                            text.split(' ').length >= 2) {
                            profile.name = text;
                            profile.url = link.href;
                            break;
                        }
                    }
                }
            }

            // Clean and normalize the profile URL
            if (profile.url) {
                if (profile.url.startsWith('/')) {
                    profile.url = 'https://www.linkedin.com' + profile.url;
                }
                if (profile.url.includes('?')) {
                    profile.url = profile.url.split('?')[0];
                }
                profile.url = profile.url.replace(/\/$/, '');
            }

            // Extract profile picture with better selectors
            const imgSelectors = [
                '.entity-result__image img',
                '.presence-entity__image img',
                '.discover-entity-type-card__image img',
                '.mn-person-card__picture img',
                '.artdeco-entity-lockup__image img',
                'img[alt*="profile"]',
                'img[alt*="Photo"]',
                'img[data-ghost-classes]',
                'img[src*="profile"]',
                'img'
            ];

            for (const selector of imgSelectors) {
                const imgElement = card.querySelector(selector);
                if (imgElement?.src &&
                    !imgElement.src.includes('data:image') &&
                    !imgElement.src.includes('ghost') &&
                    imgElement.src.includes('http')) {
                    profile.profilePic = imgElement.src;
                    break;
                }
            }

            // Extract title and company
            const subtitleSelectors = isNetworkPage ? [
                '.discover-entity-type-card__occupation',
                '.mn-person-card__occupation',
                '.artdeco-entity-lockup__subtitle'
            ] : [
                '.entity-result__primary-subtitle',
                '.search-result__truncate',
                '.t-14.t-normal'
            ];

            for (const selector of subtitleSelectors) {
                const subtitleElement = card.querySelector(selector);
                if (subtitleElement) {
                    const subtitle = subtitleElement.textContent.trim();
                    const atIndex = subtitle.toLowerCase().indexOf(' at ');
                    if (atIndex !== -1) {
                        profile.title = subtitle.substring(0, atIndex).trim();
                        profile.company = subtitle.substring(atIndex + 4).trim();
                    } else {
                        profile.title = subtitle;
                    }
                    break;
                }
            }

            // Extract location
            const locationSelectors = [
                '.entity-result__secondary-subtitle',
                '[data-anonymize="location"]',
                '.t-12.t-black--light'
            ];

            for (const selector of locationSelectors) {
                const locationElement = card.querySelector(selector);
                if (locationElement) {
                    profile.location = locationElement.textContent.trim();
                    break;
                }
            }

            // Post-process and fix the extracted data
            this.fixProfileData(profile);

            // Debug logging
            console.log('Extracted profile data:', {
                name: profile.name,
                url: profile.url,
                title: profile.title,
                company: profile.company,
                location: profile.location ? profile.location.substring(0, 100) + '...' : '',
                profilePic: profile.profilePic ? 'Yes' : 'No'
            });

            // Validate profile
            if (!profile.name || !profile.url || !profile.url.includes('/in/')) {
                console.log('Profile validation failed:', { name: profile.name, url: profile.url });
                return null;
            }

            return profile;

        } catch (error) {
            console.error('Error extracting profile data:', error);
            return null;
        }
    }



    // Search for people by company name
    async searchByCompany(companyName) {
        try {
            // Construct LinkedIn search URL for company employees
            const searchUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(companyName)}&origin=GLOBAL_SEARCH_HEADER`;

            // Navigate to search results
            window.location.href = searchUrl;

            return { success: true, message: `Searching for employees at ${companyName}` };
        } catch (error) {
            console.error('Error searching by company:', error);
            return { success: false, message: error.message };
        }
    }





    // Search network connections with auto-scrolling and real-time updates
    async searchNetwork(criteria) {
        try {
            console.log('Searching network with criteria:', criteria);
            console.log('Current URL:', window.location.href);

            const profiles = [];
            let scrollAttempts = 0;
            const maxScrollAttempts = 5;

            // Start continuous collection for real-time updates
            this.startContinuousCollection();

            if (criteria.type === 'search' || window.location.href.includes('search/results/people')) {
                console.log('Processing search results page...');

                // First, collect profiles from current view
                let searchResults = this.getSearchResultElements();
                console.log(`Initial scan: Found ${searchResults.length} search result elements`);

                searchResults.forEach((card) => {
                    if (profiles.length < 20) {
                        const profile = this.extractProfileFromCard(card);
                        if (profile && profile.name && profile.url) {
                            profile.source = 'network-search';
                            profiles.push(profile);
                            console.log(`Extracted profile ${profiles.length}:`, profile.name, profile.url);
                        }
                    }
                });

                console.log(`Initial collection: ${profiles.length} profiles`);

                // Auto-scroll down first, then up
                while (scrollAttempts < maxScrollAttempts && profiles.length < 20) {
                    scrollAttempts++;
                    console.log(`Scroll attempt ${scrollAttempts}/${maxScrollAttempts}`);

                    const initialCount = profiles.length;

                    if (scrollAttempts <= 3) {
                        // First 3 attempts: Scroll DOWN
                        console.log('Scrolling DOWN to load more results...');
                        window.scrollBy(0, window.innerHeight);
                        await this.delay(2000);

                        // Scroll to bottom to trigger infinite scroll
                        window.scrollTo(0, document.body.scrollHeight);
                        console.log('Scrolled to bottom');
                    } else {
                        // Last 2 attempts: Scroll UP
                        console.log('Scrolling UP to check earlier results...');
                        window.scrollBy(0, -window.innerHeight);
                        await this.delay(2000);

                        if (scrollAttempts === maxScrollAttempts) {
                            // Final attempt: scroll to top
                            window.scrollTo(0, 0);
                            console.log('Scrolled to top');
                        }
                    }

                    // Wait for content to load
                    await this.delay(2000);

                    // Get updated search results
                    searchResults = this.getSearchResultElements();
                    console.log(`After scroll: Found ${searchResults.length} search result elements`);

                    // Extract profiles from current view
                    searchResults.forEach((card) => {
                        if (profiles.length < 20) {
                            const profile = this.extractProfileFromCard(card);
                            if (profile && profile.name && profile.url) {
                                // Check for duplicates
                                const isDuplicate = profiles.some(p => p.url === profile.url);
                                if (!isDuplicate) {
                                    profile.source = 'network-search';
                                    profiles.push(profile);
                                    console.log(`Extracted profile ${profiles.length}:`, profile.name);
                                    console.log(`Profile URL: ${profile.url}`);
                                }
                            }
                        }
                    });

                    const newProfilesCount = profiles.length - initialCount;
                    console.log(`Extracted ${newProfilesCount} new profiles in this scroll`);

                    // If no new profiles found in last 2 attempts, stop
                    if (newProfilesCount === 0 && scrollAttempts >= 2) {
                        console.log('No new profiles found, stopping scroll attempts');
                        break;
                    }
                }

                console.log(`Completed auto-scroll. Total profiles collected: ${profiles.length}`);
            } else if (criteria.type === 'connections' || window.location.href.includes('mynetwork') || window.location.href.includes('connections')) {
                // We're on connections page - extract connection cards
                let connectionCards = document.querySelectorAll('.mn-connection-card');

                // Try different selectors if first one doesn't work
                if (connectionCards.length === 0) {
                    connectionCards = document.querySelectorAll('.connection-card');
                }
                if (connectionCards.length === 0) {
                    connectionCards = document.querySelectorAll('[data-control-name="connection_profile"]');
                }
                if (connectionCards.length === 0) {
                    connectionCards = document.querySelectorAll('.artdeco-entity-lockup');
                }
                if (connectionCards.length === 0) {
                    // Try to find any li elements that contain profile links
                    connectionCards = document.querySelectorAll('li');
                }

                console.log(`Found ${connectionCards.length} potential connection cards`);

                // Debug: Log some sample elements to understand the structure
                if (connectionCards.length > 0) {
                    console.log('Sample card HTML:', connectionCards[0].outerHTML.substring(0, 500));
                }

                connectionCards.forEach((card, index) => {
                    if (index < 20) { // Process more profiles for better real-time experience
                        const profile = this.extractProfileFromCard(card, true); // Use unified extraction
                        if (profile?.name && profile?.url) {
                            profile.source = 'connections';
                            profiles.push(profile);

                            // Send profiles in real-time (every 2 profiles or immediately for first few)
                            if (profiles.length <= 3 || profiles.length % 2 === 0) {
                                this.sendProfilesRealTime([profile]);
                            }
                        }
                    }
                });
            }

            console.log(`Collected ${profiles.length} profiles from network`);
            return profiles;
        } catch (error) {
            console.error('Error searching network:', error);
            return [];
        }
    }

    // Helper method to get search result elements
    getSearchResultElements() {
        // Try different selectors for search results
        let elements = document.querySelectorAll('.search-result');
        if (elements.length > 0) return elements;

        elements = document.querySelectorAll('.reusable-search__result-container');
        if (elements.length > 0) return elements;

        elements = document.querySelectorAll('[data-chameleon-result-urn]');
        if (elements.length > 0) return elements;

        elements = document.querySelectorAll('li[data-reusable-search-result]');
        if (elements.length > 0) return elements;

        elements = document.querySelectorAll('.entity-result');
        if (elements.length > 0) return elements;

        // Fallback to any li elements that might contain profile data
        elements = document.querySelectorAll('li');
        return Array.from(elements).filter(li => {
            return li.querySelector('a[href*="/in/"]') || li.querySelector('a[href*="linkedin.com/in/"]');
        });
    }




}

// Initialize the automation when the page loads
console.log('🚀 CONTENT: LinkedIn content script loading...');

// Suppress permission policy violation errors (these are normal LinkedIn security restrictions)
const originalError = console.error;
console.error = function(...args) {
    const message = args.join(' ');
    if (message.includes('Permissions policy violation') ||
        message.includes('unload is not allowed')) {
        // Suppress these specific LinkedIn security errors
        return;
    }
    originalError.apply(console, args);
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('🚀 CONTENT: DOM loaded, initializing LinkedIn automation...');
        window.linkedInAutomation = new LinkedInAutomation();
    });
} else {
    console.log('🚀 CONTENT: DOM already loaded, initializing LinkedIn automation...');
    window.linkedInAutomation = new LinkedInAutomation();
}



} // End of injection guard
