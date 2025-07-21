// Background Service Worker for LinkedIn Automation Extension
class LinkedInAutomationBackground {
    constructor() {
        this.activeCampaigns = new Map();
        this.init();
    }
    
    init() {
        console.log('LinkedIn Automation Background Service Worker initialized');
        
        // Listen for extension installation
        chrome.runtime.onInstalled.addListener(() => {
            this.onInstalled();
        });
        
        // Listen for messages from popup and content scripts
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
            return true; // Keep the message channel open for async responses
        });
        
        // Set up daily reset alarm
        chrome.alarms.onAlarm.addListener((alarm) => {
            if (alarm.name === 'dailyReset') {
                this.resetDailyCounters();
            }
        });
        
        // Create daily reset alarm
        chrome.alarms.create('dailyReset', {
            when: this.getNextMidnight(),
            periodInMinutes: 24 * 60 // 24 hours
        });
        
        // Load existing campaigns
        this.loadCampaigns();
    }
    
    onInstalled() {
        // Initialize default settings
        chrome.storage.local.set({
            dailyLimit: 50,
            actionDelay: 30,
            followupDelay: 3,
            connectionMessage: 'Hi {firstName}, I\'d love to connect with you!',
            followup1: 'Thanks for connecting, {firstName}!',
            followup2: 'Hope you\'re doing well, {firstName}!',
            todayCount: 0,
            totalCount: 0,
            campaigns: []
        });
    }
    
    handleMessage(message, sender, sendResponse) {
        switch (message.action) {
            case 'startCampaign':
                this.startCampaign(message.campaignId, sendResponse);
                break;
            case 'pauseCampaign':
                this.pauseCampaign(message.campaignId, sendResponse);
                break;
            case 'resumeCampaign':
                this.resumeCampaign(message.campaignId, sendResponse);
                break;
            case 'deleteCampaign':
                this.deleteCampaign(message.campaignId, sendResponse);
                break;
            case 'getCampaignStatus':
                this.getCampaignStatus(message.campaignId, sendResponse);
                break;
            default:
                sendResponse({ error: 'Unknown action' });
        }
    }
    
    async startCampaign(campaignId, sendResponse) {
        try {
            const campaigns = await this.getCampaigns();
            const campaign = campaigns.find(c => c.id === campaignId);
            
            if (!campaign) {
                sendResponse({ error: 'Campaign not found' });
                return;
            }
            
            // Check if we're already at daily limit
            const { todayCount, dailyLimit } = await this.getSettings();
            
            if (todayCount >= dailyLimit) {
                sendResponse({ error: 'Daily limit reached' });
                return;
            }
            
            // Find LinkedIn tabs
            const linkedInTabs = await this.findLinkedInTabs();
            
            if (linkedInTabs.length === 0) {
                // Open LinkedIn search page
                chrome.tabs.create({ url: campaign.targetUrl }, (tab) => {
                    this.activeCampaigns.set(campaignId, {
                        ...campaign,
                        tabId: tab.id,
                        status: 'running'
                    });
                    
                    // Wait for tab to load then start automation
                    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
                        if (tabId === tab.id && changeInfo.status === 'complete') {
                            this.executeAutomation(tab.id, campaign);
                        }
                    });
                });
            } else {
                // Use existing LinkedIn tab
                const tab = linkedInTabs[0];
                chrome.tabs.update(tab.id, { url: campaign.targetUrl }, () => {
                    this.activeCampaigns.set(campaignId, {
                        ...campaign,
                        tabId: tab.id,
                        status: 'running'
                    });
                    
                    setTimeout(() => {
                        this.executeAutomation(tab.id, campaign);
                    }, 2000);
                });
            }
            
            sendResponse({ success: true });
        } catch (error) {
            console.error('Error starting campaign:', error);
            sendResponse({ error: error.message });
        }
    }
    
    async executeAutomation(tabId, campaign) {
        try {
            let action = 'startAutomation';
            let targetUrl = '';

            // Handle different campaign types
            if (campaign.targetData) {
                switch (campaign.targetData.type) {
                    case 'company':
                        // Search for company employees
                        targetUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(campaign.targetData.companyName)}&origin=GLOBAL_SEARCH_HEADER`;
                        break;
                    case 'search':
                        targetUrl = campaign.targetData.targetUrl;
                        break;
                    case 'list':
                        // Use collected profiles
                        action = 'startListCampaign';
                        break;
                }
            } else {
                // Legacy campaign format
                targetUrl = campaign.targetUrl;
            }

            // Navigate to target URL if needed
            if (targetUrl) {
                chrome.tabs.update(tabId, { url: targetUrl }, () => {
                    setTimeout(() => {
                        this.sendAutomationMessage(tabId, action, campaign);
                    }, 3000);
                });
            } else {
                this.sendAutomationMessage(tabId, action, campaign);
            }
        } catch (error) {
            console.error('Error executing automation:', error);
        }
    }

    sendAutomationMessage(tabId, action, campaign) {
        chrome.tabs.sendMessage(tabId, {
            action: action,
            campaign: campaign
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('Error communicating with content script:', chrome.runtime.lastError);
            } else {
                console.log('Automation started:', response);
            }
        });
    }
    
    pauseCampaign(campaignId, sendResponse) {
        const campaign = this.activeCampaigns.get(campaignId);
        
        if (campaign) {
            campaign.status = 'paused';
            
            // Send message to content script to stop
            chrome.tabs.sendMessage(campaign.tabId, {
                action: 'stopAutomation'
            });
            
            sendResponse({ success: true });
        } else {
            sendResponse({ error: 'Campaign not found' });
        }
    }
    
    resumeCampaign(campaignId, sendResponse) {
        const campaign = this.activeCampaigns.get(campaignId);
        
        if (campaign) {
            campaign.status = 'running';
            this.executeAutomation(campaign.tabId, campaign);
            sendResponse({ success: true });
        } else {
            sendResponse({ error: 'Campaign not found' });
        }
    }
    
    deleteCampaign(campaignId, sendResponse) {
        const campaign = this.activeCampaigns.get(campaignId);
        
        if (campaign) {
            // Stop automation
            chrome.tabs.sendMessage(campaign.tabId, {
                action: 'stopAutomation'
            });
            
            // Remove from active campaigns
            this.activeCampaigns.delete(campaignId);
        }
        
        sendResponse({ success: true });
    }
    
    getCampaignStatus(campaignId, sendResponse) {
        const campaign = this.activeCampaigns.get(campaignId);
        sendResponse({ campaign: campaign || null });
    }
    
    async findLinkedInTabs() {
        return new Promise((resolve) => {
            chrome.tabs.query({ url: 'https://www.linkedin.com/*' }, (tabs) => {
                resolve(tabs);
            });
        });
    }
    
    async getCampaigns() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['campaigns'], (result) => {
                resolve(result.campaigns || []);
            });
        });
    }
    
    async getSettings() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['todayCount', 'dailyLimit', 'actionDelay'], (result) => {
                resolve({
                    todayCount: result.todayCount || 0,
                    dailyLimit: result.dailyLimit || 50,
                    actionDelay: result.actionDelay || 30
                });
            });
        });
    }
    
    loadCampaigns() {
        chrome.storage.local.get(['campaigns'], (result) => {
            const campaigns = result.campaigns || [];
            
            // Restore running campaigns (if any)
            campaigns.forEach(campaign => {
                if (campaign.status === 'running') {
                    // Note: We don't auto-restart campaigns on extension reload
                    // User needs to manually restart them for safety
                    campaign.status = 'paused';
                }
            });
            
            // Update storage with corrected statuses
            chrome.storage.local.set({ campaigns });
        });
    }
    
    resetDailyCounters() {
        chrome.storage.local.set({ todayCount: 0 }, () => {
            console.log('Daily counters reset');
        });
    }
    
    getNextMidnight() {
        const now = new Date();
        const midnight = new Date(now);
        midnight.setHours(24, 0, 0, 0);
        return midnight.getTime();
    }
}

// Initialize the background service
new LinkedInAutomationBackground();
