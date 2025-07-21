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
    }
    
    loadSettings() {
        chrome.storage.local.get(['actionDelay', 'dailyLimit', 'todayCount'], (result) => {
            this.actionDelay = (result.actionDelay || 30) * 1000;
            this.dailyLimit = result.dailyLimit || 50;
            this.todayCount = result.todayCount || 0;
        });
    }
    
    handleMessage(message, sendResponse) {
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
                sendResponse({ error: 'Unknown action' });
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

        profileCards.forEach(card => {
            const profile = this.extractProfileFromCard(card);
            if (profile?.name && profile?.url) {
                profiles.push(profile);
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
                profile.name = nameLink.textContent.trim();
                profile.url = nameLink.href || '';
            } else {
                // Fallback: look for name in span elements
                const nameSpan = card.querySelector('span[aria-hidden="true"]') ||
                               card.querySelector('.t-16.t-black.t-bold') ||
                               card.querySelector('[data-anonymize="person-name"] span');

                if (nameSpan) {
                    profile.name = nameSpan.textContent.trim();
                    const parentLink = nameSpan.closest('a') || card.querySelector('a[href*="/in/"]');
                    if (parentLink) profile.url = parentLink.href;
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

            // Extract profile picture
            const imgSelectors = [
                '.entity-result__image img',
                '.presence-entity__image img',
                'img[alt*="profile"]',
                'img[alt*="Photo"]',
                'img'
            ];

            for (const selector of imgSelectors) {
                const imgElement = card.querySelector(selector);
                if (imgElement?.src) {
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

            // Validate profile
            if (!profile.name || !profile.url || !profile.url.includes('/in/')) {
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





    // Search network connections with auto-scrolling
    async searchNetwork(criteria) {
        try {
            console.log('Searching network with criteria:', criteria);
            console.log('Current URL:', window.location.href);

            const profiles = [];
            let scrollAttempts = 0;
            const maxScrollAttempts = 5;

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
                    if (index < 10) { // Only process first 10 to avoid overwhelming
                        const profile = this.extractProfileFromCard(card, true); // Use unified extraction
                        if (profile?.name && profile?.url) {
                            profile.source = 'connections';
                            profiles.push(profile);
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
console.log('LinkedIn content script loading...');

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('DOM loaded, initializing LinkedIn automation...');
        window.linkedInAutomation = new LinkedInAutomation();
    });
} else {
    console.log('DOM already loaded, initializing LinkedIn automation...');
    window.linkedInAutomation = new LinkedInAutomation();
}



} // End of injection guard
