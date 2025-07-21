// LinkedIn Content Script - Handles automation on LinkedIn pages

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
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sendResponse);
        });
        
        // Load settings
        this.loadSettings();
        
        // Check if we're on a search results page
        if (this.isSearchResultsPage()) {
            this.addAutomationUI();
        }
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
                (async () => {
                    try {
                        const profiles = await this.searchNetwork(message.criteria);
                        console.log('Sending response with profiles:', profiles);
                        sendResponse({ profiles: profiles || [] });
                    } catch (error) {
                        console.error('Error in searchNetwork:', error);
                        sendResponse({ profiles: [], error: error.message });
                    }
                })();
                return true;
            default:
                sendResponse({ error: 'Unknown action' });
        }
    }
    
    isSearchResultsPage() {
        return window.location.href.includes('/search/people/') || 
               window.location.href.includes('/search/results/people/');
    }
    
    addAutomationUI() {
        // Add a floating button to start automation
        const automationButton = document.createElement('div');
        automationButton.id = 'linkedin-automation-btn';
        automationButton.innerHTML = `
            <div class="automation-panel">
                <button id="start-automation">Start Auto Connect</button>
                <button id="stop-automation" style="display: none;">Stop</button>
                <div class="automation-status">Ready</div>
            </div>
        `;
        
        document.body.appendChild(automationButton);
        
        // Add event listeners
        document.getElementById('start-automation').addEventListener('click', () => {
            this.startAutomationFromPage();
        });
        
        document.getElementById('stop-automation').addEventListener('click', () => {
            this.stopAutomation();
        });
    }
    
    startAutomationFromPage() {
        if (this.todayCount >= this.dailyLimit) {
            this.updateStatus('Daily limit reached!', 'error');
            return;
        }
        
        this.isRunning = true;
        this.updateStatus('Starting automation...', 'running');
        
        document.getElementById('start-automation').style.display = 'none';
        document.getElementById('stop-automation').style.display = 'block';
        
        this.processConnections();
    }
    
    async processConnections() {
        if (!this.isRunning) return;
        
        const connectButtons = this.findConnectButtons();
        
        if (connectButtons.length === 0) {
            this.updateStatus('No connect buttons found', 'warning');
            this.stopAutomation();
            return;
        }
        
        for (let i = 0; i < connectButtons.length && this.isRunning; i++) {
            if (this.todayCount >= this.dailyLimit) {
                this.updateStatus('Daily limit reached!', 'error');
                break;
            }
            
            const button = connectButtons[i];
            const personInfo = this.extractPersonInfo(button);
            
            this.updateStatus(`Connecting to ${personInfo.name}...`, 'running');
            
            try {
                await this.sendConnectionRequest(button, personInfo);
                this.todayCount++;
                
                // Update storage
                chrome.storage.local.set({ todayCount: this.todayCount });
                
                this.updateStatus(`Connected to ${personInfo.name}. Waiting...`, 'success');
                
                // Wait before next action
                if (i < connectButtons.length - 1) {
                    await this.delay(this.actionDelay);
                }
            } catch (error) {
                console.error('Error sending connection request:', error);
                this.updateStatus(`Error connecting to ${personInfo.name}`, 'error');
            }
        }
        
        this.updateStatus('Automation completed', 'success');
        this.stopAutomation();
    }
    
    findConnectButtons() {
        // Find all "Connect" buttons on the page
        const buttons = [];
        
        // Different selectors for different LinkedIn layouts
        const selectors = [
            'button[aria-label*="Connect"]',
            'button[data-control-name="connect"]',
            'button:contains("Connect")',
            '.search-result__actions button[aria-label*="Invite"]'
        ];
        
        selectors.forEach(selector => {
            try {
                const elements = document.querySelectorAll(selector);
                elements.forEach(el => {
                    if (el.textContent.includes('Connect') || el.getAttribute('aria-label')?.includes('Connect')) {
                        buttons.push(el);
                    }
                });
            } catch (e) {
                // Ignore selector errors
            }
        });
        
        return buttons.filter(btn => btn.offsetParent !== null); // Only visible buttons
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
            // Check if AI should be used and get messaging strategy
            chrome.storage.local.get(['openaiKey', 'messageStyle', 'connectionMessage'], async (result) => {
                let personalizedMessage;
                const messagingStrategy = this.currentCampaign?.messagingStrategy || {};

                if (result.openaiKey && this.currentCampaign?.useAI) {
                    // Use AI to generate message with enhanced analysis
                    try {
                        // Perform enhanced profile analysis if enabled
                        let enhancedData = null;
                        if (messagingStrategy.analyzeProfile || messagingStrategy.analyzePosts) {
                            enhancedData = await this.extractEnhancedProfileData(personInfo.profileUrl);
                        }

                        // Combine basic and enhanced data
                        const fullPersonData = {
                            ...personInfo,
                            ...enhancedData
                        };

                        personalizedMessage = await this.generateAIMessage(
                            result.openaiKey,
                            fullPersonData,
                            messagingStrategy.messageStyle || result.messageStyle || 'professional'
                        );
                    } catch (error) {
                        console.error('AI message generation failed, using template:', error);
                        const messageTemplate = result.connectionMessage || 'Hi {firstName}, I\'d love to connect with you!';
                        personalizedMessage = this.personalizeMessage(messageTemplate, personInfo);
                    }
                } else {
                    // Use template
                    const messageTemplate = result.connectionMessage || 'Hi {firstName}, I\'d love to connect with you!';
                    personalizedMessage = this.personalizeMessage(messageTemplate, personInfo);
                }

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
    
    stopAutomation() {
        this.isRunning = false;
        
        const startBtn = document.getElementById('start-automation');
        const stopBtn = document.getElementById('stop-automation');
        
        if (startBtn && stopBtn) {
            startBtn.style.display = 'block';
            stopBtn.style.display = 'none';
        }
        
        this.updateStatus('Automation stopped', 'ready');
    }
    
    updateStatus(message, type = 'ready') {
        const statusElement = document.querySelector('.automation-status');
        if (statusElement) {
            statusElement.textContent = message;
            statusElement.className = `automation-status ${type}`;
        }
        
        console.log(`LinkedIn Automation: ${message}`);
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

        // Find all profile cards on the page
        const profileCards = document.querySelectorAll('.search-result') ||
                           document.querySelectorAll('.reusable-search__result-container') ||
                           document.querySelectorAll('[data-chameleon-result-urn]');

        profileCards.forEach(card => {
            const profile = this.extractProfileFromCard(card);
            if (profile.name && profile.url) {
                profiles.push(profile);
            }
        });

        return profiles;
    }

    // Extract profile information from a profile card
    extractProfileFromCard(card) {
        const profile = {
            name: '',
            url: '',
            company: '',
            title: '',
            location: '',
            industry: ''
        };

        try {
            // Extract name and profile URL with multiple selectors
            let nameLink = card.querySelector('.entity-result__title-text a') ||
                          card.querySelector('.search-result__result-link') ||
                          card.querySelector('[data-anonymize="person-name"]') ||
                          card.querySelector('a[href*="/in/"]') ||
                          card.querySelector('a[href*="linkedin.com/in/"]');

            // If no direct link found, look for name in span elements
            if (!nameLink) {
                const nameSpan = card.querySelector('span[aria-hidden="true"]') ||
                               card.querySelector('.entity-result__title-text span') ||
                               card.querySelector('.t-16.t-black.t-bold') ||
                               card.querySelector('[data-anonymize="person-name"] span');

                if (nameSpan) {
                    profile.name = nameSpan.textContent.trim();

                    // Try to find the profile URL in parent elements
                    const parentLink = nameSpan.closest('a') ||
                                     card.querySelector('a[href*="/in/"]') ||
                                     card.querySelector('a[href*="linkedin.com/in/"]');

                    if (parentLink) {
                        profile.url = parentLink.href;
                    }
                }
            } else {
                profile.name = nameLink.textContent.trim();
                profile.url = nameLink.href || '';
            }

            // Extract title and company with multiple selectors
            const subtitleElement = card.querySelector('.entity-result__primary-subtitle') ||
                                   card.querySelector('.search-result__truncate') ||
                                   card.querySelector('.t-14.t-normal') ||
                                   card.querySelector('.entity-result__summary');

            if (subtitleElement) {
                const subtitle = subtitleElement.textContent.trim();
                const atIndex = subtitle.toLowerCase().indexOf(' at ');

                if (atIndex !== -1) {
                    profile.title = subtitle.substring(0, atIndex).trim();
                    profile.company = subtitle.substring(atIndex + 4).trim();
                } else {
                    profile.title = subtitle;
                }
            }

            // Extract location with multiple selectors
            const locationElement = card.querySelector('.entity-result__secondary-subtitle') ||
                                   card.querySelector('[data-anonymize="location"]') ||
                                   card.querySelector('.t-12.t-black--light');

            if (locationElement) {
                profile.location = locationElement.textContent.trim();
            }

            // Only return profile if we have at least name and URL
            if (!profile.name || !profile.url) {
                return null;
            }

            // Clean up the URL to ensure it's a proper LinkedIn profile URL
            if (profile.url && !profile.url.includes('linkedin.com/in/')) {
                return null;
            }

            // Add timestamp
            profile.collectedAt = new Date().toISOString();

            console.log('Extracted search profile:', profile);
            return profile;

        } catch (error) {
            console.error('Error extracting profile data:', error);
            return null;
        }
    }

    // Enhanced profile analysis for comprehensive data extraction
    async extractEnhancedProfileData(profileUrl) {
        try {
            const enhancedData = {
                name: '',
                headline: '',
                summary: '',
                experience: [],
                education: [],
                skills: [],
                recentPosts: [],
                connections: '',
                profileUrl: profileUrl,
                analyzedAt: new Date().toISOString()
            };

            // For now, we'll extract what we can from the current search results
            // In a full implementation, this would navigate to the profile page
            // But due to LinkedIn's restrictions, we'll work with available data

            console.log('Enhanced profile analysis requested for:', profileUrl);
            return enhancedData;
        } catch (error) {
            console.error('Error in enhanced profile extraction:', error);
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

    // AI Message Generation
    async generateAIMessage(apiKey, personData, style = 'professional') {
        try {
            const prompt = this.buildAIPrompt(personData, style);

            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-3.5-turbo',
                    messages: [
                        {
                            role: 'system',
                            content: 'You are a professional LinkedIn messaging assistant. Generate personalized, engaging messages that help build meaningful professional connections.'
                        },
                        {
                            role: 'user',
                            content: prompt
                        }
                    ],
                    max_tokens: 150,
                    temperature: 0.7
                })
            });

            if (!response.ok) {
                throw new Error(`OpenAI API error: ${response.status}`);
            }

            const data = await response.json();
            return data.choices[0].message.content.trim();
        } catch (error) {
            console.error('AI message generation failed:', error);
            return `Hi ${personData.name?.split(' ')[0] || 'there'}, I'd love to connect with you!`;
        }
    }

    buildAIPrompt(personData, style) {
        const styleInstructions = {
            professional: 'Write in a professional, respectful tone. Be concise and business-focused.',
            casual: 'Write in a casual, friendly tone. Be approachable and personable.',
            direct: 'Write in a direct, brief tone. Get straight to the point.',
            consultative: 'Write in a consultative tone. Focus on potential collaboration and mutual benefit.'
        };

        let prompt = `Write a personalized LinkedIn connection request message (max 200 characters) for:

Name: ${personData.name || 'Unknown'}
Company: ${personData.company || 'Unknown'}
Title: ${personData.title || 'Unknown'}`;

        if (personData.headline) {
            prompt += `\nHeadline: ${personData.headline}`;
        }

        if (personData.experience && personData.experience.length > 0) {
            prompt += `\nRecent Experience: ${personData.experience[0].title} at ${personData.experience[0].company}`;
        }

        if (personData.education && personData.education.length > 0) {
            prompt += `\nEducation: ${personData.education[0].degree} from ${personData.education[0].school}`;
        }

        if (personData.skills && personData.skills.length > 0) {
            prompt += `\nKey Skills: ${personData.skills.slice(0, 3).join(', ')}`;
        }

        if (personData.recentPosts && personData.recentPosts.length > 0) {
            prompt += `\nRecent Activity: ${personData.recentPosts[0].text.substring(0, 100)}...`;
        }

        prompt += `\n\nStyle: ${styleInstructions[style] || styleInstructions.professional}

Return only the message text, nothing else.`;

        return prompt;
    }

    // Enhanced automation for company-based campaigns
    async startCompanyCampaign(companyName) {
        this.updateStatus(`Starting campaign for ${companyName}...`, 'running');

        // First, navigate to company search
        await this.searchByCompany(companyName);

        // Wait for page to load
        setTimeout(() => {
            this.processConnections();
        }, 3000);
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
                                    console.log(`Extracted profile ${profiles.length}:`, profile.name, profile.url);
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
                        const profile = this.extractNetworkProfile(card);
                        if (profile && profile.name && profile.url) {
                            profile.source = 'connections';
                            profiles.push(profile);
                            console.log('Successfully extracted profile:', profile);
                        } else if (index < 3) {
                            console.log(`Failed to extract from card ${index}:`, card.outerHTML.substring(0, 200));
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

    // Extract profile from network connection card
    extractNetworkProfile(card) {
        try {
            const profile = {
                name: '',
                url: '',
                company: '',
                title: '',
                location: '',
                industry: '',
                connectionLevel: '1st',
                source: 'network'
            };

            // Try multiple selectors for name and profile URL
            let nameLink = card.querySelector('.mn-connection-card__name') ||
                          card.querySelector('.connection-card__name') ||
                          card.querySelector('a[data-control-name="connection_profile"]') ||
                          card.querySelector('a[href*="/in/"]') ||
                          card.querySelector('a[href*="linkedin.com/in/"]');

            // If no direct link found, look for name in span elements
            if (!nameLink) {
                const nameSpan = card.querySelector('span[aria-hidden="true"]') ||
                               card.querySelector('.t-16.t-black.t-bold') ||
                               card.querySelector('.mn-connection-card__name') ||
                               card.querySelector('.artdeco-entity-lockup__title');

                if (nameSpan) {
                    profile.name = nameSpan.textContent.trim();

                    // Try to find the profile URL in parent elements
                    const parentLink = nameSpan.closest('a') ||
                                     card.querySelector('a[href*="/in/"]') ||
                                     card.querySelector('a[href*="linkedin.com/in/"]');

                    if (parentLink) {
                        profile.url = parentLink.href;
                    }
                }
            } else {
                profile.name = nameLink.textContent.trim();
                profile.url = nameLink.href || '';
            }

            // Extract title and company with multiple selectors
            const occupationElement = card.querySelector('.mn-connection-card__occupation') ||
                                    card.querySelector('.connection-card__occupation') ||
                                    card.querySelector('.t-14.t-black--light') ||
                                    card.querySelector('.t-14.t-normal') ||
                                    card.querySelector('.artdeco-entity-lockup__subtitle');

            if (occupationElement) {
                const occupation = occupationElement.textContent.trim();
                const atIndex = occupation.toLowerCase().indexOf(' at ');

                if (atIndex !== -1) {
                    profile.title = occupation.substring(0, atIndex).trim();
                    profile.company = occupation.substring(atIndex + 4).trim();
                } else {
                    profile.title = occupation;
                }
            }

            // Only return profile if we have at least name and URL
            if (!profile.name || !profile.url) {
                return null;
            }

            // Clean up the URL to ensure it's a proper LinkedIn profile URL
            if (profile.url && !profile.url.includes('linkedin.com/in/')) {
                return null;
            }

            // Add timestamp
            profile.collectedAt = new Date().toISOString();

            console.log('Extracted profile:', profile);
            return profile;
        } catch (error) {
            console.error('Error extracting network profile:', error);
            return null;
        }
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

// Add a simple test function to verify script is working
window.testLinkedInScript = function() {
    console.log('LinkedIn script is working!');
    return 'Script is active';
};
