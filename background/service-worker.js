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

  onInstalled() {}

  handleMessage(message, sender, sendResponse) {
    switch (message.action) {
      case "startCampaign":
        this.startCampaign(message.campaignId, sendResponse);
        break;
      case "pauseCampaign":
        this.pauseCampaign(message.campaignId, sendResponse);
        break;
      case "resumeCampaign":
        this.resumeCampaign(message.campaignId, sendResponse);
        break;
      case "deleteCampaign":
        this.deleteCampaign(message.campaignId, sendResponse);
        break;
      case "getCampaignStatus":
        this.getCampaignStatus(message.campaignId, sendResponse);
        break;
      case "openPopup":
        this.openExtensionPopup(sendResponse);
        break;
      case "addProfilesRealTime":
        this.handleProfilesRealTime(message.profiles, sender, sendResponse);
        break;
      case "collectionStatus":
        this.handleCollectionStatus(message.message, sender, sendResponse);
        break;
      default:
        sendResponse({ error: "Unknown action" });
    }
  }

  async startCampaign(campaignId, sendResponse) {
    try {
      const campaigns = await this.getCampaigns();

      if (!campaigns || !Array.isArray(campaigns)) {
        console.error("Invalid campaigns data:", campaigns);
        sendResponse({ error: "Failed to load campaigns" });
        return;
      }

      const campaign = campaigns.find((c) => c && c.id === campaignId);

      if (!campaign) {
        sendResponse({ error: "Campaign not found" });
        return;
      }

      const { todayCount, dailyLimit } = await this.getSettings();
      if (todayCount >= dailyLimit) {
        sendResponse({ error: "Daily limit reached" });
        return;
      }

      const linkedInTabs = await this.findLinkedInTabs();
      const targetUrl =
        campaign.targetUrl || "https://www.linkedin.com/search/results/people/";

      if (linkedInTabs.length === 0) {
        chrome.tabs.create({ url: targetUrl }, (tab) => {
          this.activeCampaigns.set(campaignId, {
            ...campaign,
            tabId: tab.id,
            status: "running",
          });
          chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
            if (tabId === tab.id && changeInfo.status === "complete") {
              this.executeAutomation(tab.id, campaign);
            }
          });
        });
      } else {
        const tab = linkedInTabs[0];
        chrome.tabs.update(tab.id, { url: targetUrl }, () => {
          this.activeCampaigns.set(campaignId, {
            ...campaign,
            tabId: tab.id,
            status: "running",
          });
          setTimeout(() => this.executeAutomation(tab.id, campaign), 2000);
        });
      }

      sendResponse({ success: true });
    } catch (error) {
      console.error("Error starting campaign:", error);
      sendResponse({ error: error.message });
    }
  }

  async executeAutomation(tabId, campaign) {
    try {
      const action = "startAutomation";
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
      console.error("Error executing automation:", error);
    }
  }

  sendAutomationMessage(tabId, action, campaign) {
    chrome.tabs.sendMessage(
      tabId,
      {
        action: action,
        campaign: campaign,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error(
            "Error communicating with content script:",
            chrome.runtime.lastError
          );
        }
      }
    );
  }

  pauseCampaign(campaignId, sendResponse) {
    const campaign = this.activeCampaigns.get(campaignId);

    if (campaign) {
      campaign.status = "paused";
      chrome.tabs.sendMessage(campaign.tabId, {
        action: "stopAutomation",
      });
      sendResponse({ success: true });
    } else {
      sendResponse({ error: "Campaign not found" });
    }
  }

  resumeCampaign(campaignId, sendResponse) {
    const campaign = this.activeCampaigns.get(campaignId);

    if (campaign) {
      campaign.status = "running";
      this.executeAutomation(campaign.tabId, campaign);
      sendResponse({ success: true });
    } else {
      sendResponse({ error: "Campaign not found" });
    }
  }

  deleteCampaign(campaignId, sendResponse) {
    const campaign = this.activeCampaigns.get(campaignId);

    if (campaign) {
      chrome.tabs.sendMessage(campaign.tabId, {
        action: "stopAutomation",
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
      chrome.tabs.query({ url: "https://www.linkedin.com/*" }, (tabs) => {
        resolve(tabs);
      });
    });
  }

  async getCampaigns() {
    // No storage - return empty array
    return [];
  }

  async getSettings() {
    // Return default settings without storage
    return {
      todayCount: 0,
      dailyLimit: 50,
      actionDelay: 30,
    };
  }

  loadCampaigns() {
    // No storage operations needed
  }

  openExtensionPopup(sendResponse) {
    try {
      // Open the extension popup programmatically
      chrome.action.openPopup();
      sendResponse({ success: true });
    } catch (error) {
      console.error("Error opening popup:", error);
      sendResponse({ error: error.message });
    }
  }

  handleProfilesRealTime(profiles, sender, sendResponse) {
    try {
      // Forward profiles to popup if it's open
      chrome.runtime
        .sendMessage({
          action: "profilesCollected",
          profiles: profiles,
          source: "realtime",
        })
        .catch(() => {});

      sendResponse({ success: true });
    } catch (error) {
      console.error("Error handling real-time profiles:", error);
      sendResponse({ error: error.message });
    }
  }

  handleCollectionStatus(message, sender, sendResponse) {
    try {
      // Forward status to popup if it's open
      chrome.runtime
        .sendMessage({
          action: "collectionStatusUpdate",
          message: message,
          source: "content",
        })
        .catch(() => {});

      sendResponse({ success: true });
    } catch (error) {
      console.error("Error handling collection status:", error);
      sendResponse({ error: error.message });
    }
  }
}

new LinkedInAutomationBackground();
