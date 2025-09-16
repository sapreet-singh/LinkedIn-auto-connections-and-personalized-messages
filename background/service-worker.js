class LinkedInAutomationBackground {
  constructor() {
    this.activeCampaigns = new Map();
    this.init();
  }

  init() {
    const now = new Date().toISOString(); // Current time: 2025-09-15T13:21:00Z (06:51 PM IST)
    console.log(`Service worker initialized at ${now}`);

    chrome.runtime.onInstalled.addListener(() => {
      this.onInstalled();
    });

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true; // Keep message channel open for async responses
    });

    // Set up 1-minute alarm for monitoring connections
    chrome.alarms.create("monitorConnections", { periodInMinutes: 1 });

    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === "monitorConnections") {
        console.log(
          `Monitoring connections triggered at ${new Date().toISOString()}`
        );
        this.monitorConnections();
      }
    });

    setTimeout(() => {
      this.loadCampaigns();
    }, 100);
  }

  onInstalled() {}

  handleMessage(message, sender, sendResponse) {
    const now = new Date().toISOString();
    console.log(`Received message ${message.action} at ${now}`);
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

  async normalizeDateString(dateInput) {
    try {
      const d = new Date(dateInput);
      if (isNaN(d)) {
        console.warn("⚠️ Could not parse date:", dateInput);
        return null;
      }
      return (
        d.getFullYear() +
        "-" +
        String(d.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(d.getDate()).padStart(2, "0")
      );
    } catch (err) {
      console.error("❌ Error normalizing date:", dateInput, err);
      return null;
    }
  }

  async monitorConnections() {
    try {
      const connectionsUrl =
        "https://www.linkedin.com/mynetwork/invite-connect/connections/?sort=RECENT";

      const tab = await new Promise((resolve) => {
        chrome.tabs.create({ url: connectionsUrl, active: false }, resolve);
      });

      await new Promise((resolve) => setTimeout(resolve, 10000));

      const response = await new Promise((resolve) => {
        chrome.tabs.sendMessage(
          tab.id,
          { action: "scrapeConnections" },
          resolve
        );
      });
      await chrome.tabs.remove(tab.id);

      console.log("🔎 Raw scrape response:", response);

      if (!response || !response.connections) {
        console.error(
          `❌ Failed to scrape connections at ${new Date().toISOString()}:`,
          response
        );
        return;
      }

      const today = await this.normalizeDateString(new Date());
      const connections = response.connections;

      for (const connection of connections) {
        if (!connection.date) {
          console.warn("⚠️ Skipping connection with no date:", connection);
          continue;
        }

        const connectionDate = await this.normalizeDateString(connection.date);
        if (connectionDate === today) {
          console.log(`🎉 Found connection from today:`, connection);
          this.sendToAPI(connection.url, connection.date);
        } else {
          console.log(
            `⏳ Skipping (connection=${connectionDate}, today=${today})`
          );
        }
      }
    } catch (error) {
      console.error(
        `💥 Error monitoring connections at ${new Date().toISOString()}:`,
        error
      );
    }
  }

  async sendToAPI(url, rawDate) {
    try {
      const payload = {
        url: url,
        date: rawDate
      };
      const response = await fetch(
        "https://localhost:7120/api/linkedin/accepted-request",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      console.log("✅ Successfully sent connection to API:", url);
    } catch (err) {
      console.error(
        `❌ Failed to send accepted connection ${url} to API:`,
        err.message
      );
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
              this.executeAutomation(tabId, campaign);
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
      chrome.action.openPopup();
      sendResponse({ success: true });
    } catch (error) {
      console.error("Error opening popup:", error);
      sendResponse({ error: error.message });
    }
  }

  handleProfilesRealTime(profiles, sender, sendResponse) {
    try {
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
