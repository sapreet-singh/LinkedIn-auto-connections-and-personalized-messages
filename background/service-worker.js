// LinkedIn Automation Background Service Worker
class LinkedInAutomationBackground {
    constructor() {
        this.activeCampaigns = new Map();
        this.init();
    }

    init() {
        chrome.runtime.onInstalled.addListener(() => {
            this.onInstalled();
        });

        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
            return true;
        });

        setTimeout(() => {
            this.loadCampaigns();
        }, 100);
    }

    onInstalled() {
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

            if (!campaigns || !Array.isArray(campaigns)) {
                console.error('Invalid campaigns data:', campaigns);
                sendResponse({ error: 'Failed to load campaigns' });
                return;
            }

            const campaign = campaigns.find(c => c && c.id === campaignId);

            if (!campaign) {
                sendResponse({ error: 'Campaign not found' });
                return;
            }

            const { todayCount, dailyLimit } = await this.getSettings();
            if (todayCount >= dailyLimit) {
                sendResponse({ error: 'Daily limit reached' });
                return;
            }

            const linkedInTabs = await this.findLinkedInTabs();
            const targetUrl = campaign.targetUrl || 'https://www.linkedin.com/search/results/people/';

            if (linkedInTabs.length === 0) {
                chrome.tabs.create({ url: targetUrl }, (tab) => {
                    this.activeCampaigns.set(campaignId, { ...campaign, tabId: tab.id, status: 'running' });
                    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
                        if (tabId === tab.id && changeInfo.status === 'complete') {
                            this.executeAutomation(tab.id, campaign);
                        }
                    });
                });
            } else {
                const tab = linkedInTabs[0];
                chrome.tabs.update(tab.id, { url: targetUrl }, () => {
                    this.activeCampaigns.set(campaignId, { ...campaign, tabId: tab.id, status: 'running' });
                    setTimeout(() => this.executeAutomation(tab.id, campaign), 2000);
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
            const action = 'startAutomation';
            const targetUrl = campaign.targetUrl || campaign.targetData?.targetUrl;

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
            }
        });
    }
    
    pauseCampaign(campaignId, sendResponse) {
        const campaign = this.activeCampaigns.get(campaignId);
        
        if (campaign) {
            campaign.status = 'paused';
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
            chrome.tabs.sendMessage(campaign.tabId, {
                action: 'stopAutomation'
            });
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
        return new Promise((resolve, reject) => {
            chrome.storage.local.get(['campaigns'], (result) => {
                if (chrome.runtime.lastError) {
                    console.error('Chrome storage error in getCampaigns:', chrome.runtime.lastError);
                    reject(chrome.runtime.lastError);
                    return;
                }

                if (!result) {
                    console.error('Storage result is undefined in getCampaigns');
                    resolve([]);
                    return;
                }

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
        try {
            chrome.storage.local.get(['campaigns'], (result) => {
                if (chrome.runtime.lastError) {
                    console.error('Chrome storage error:', chrome.runtime.lastError);
                    return;
                }

                if (!result || !result.hasOwnProperty('campaigns')) {
                    chrome.storage.local.set({ campaigns: [] });
                    return;
                }

                const campaigns = result.campaigns || [];
                if (!Array.isArray(campaigns)) {
                    chrome.storage.local.set({ campaigns: [] });
                    return;
                }

                campaigns.forEach(campaign => {
                    if (campaign && campaign.status === 'running') {
                        campaign.status = 'paused';
                    }
                });

                chrome.storage.local.set({ campaigns });
            });
        } catch (error) {
            chrome.storage.local.set({ campaigns: [] });
        }
    }

}

new LinkedInAutomationBackground();
