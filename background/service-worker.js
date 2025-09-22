class LinkedInAutomationBackground {
  constructor() {
    this.activeCampaigns = new Map();
    this.init();
  }

  init() {
    const now = new Date().toISOString();
    console.log(`Service worker initialized at ${now}`);

    chrome.runtime.onInstalled.addListener(() => {
      this.onInstalled();
    });

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true;
    });

    chrome.alarms.create("monitorConnections", { periodInMinutes: 60 });
    chrome.alarms.create("followUpScheduler", { periodInMinutes: 1440 });
    //chrome.alarms.create("followUpScheduler", { periodInMinutes: 1 });


    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === "monitorConnections") {
        console.log(
          `Monitoring connections triggered at ${new Date().toISOString()}`
        );
        this.monitorConnections();
      } else if (alarm.name === "followUpScheduler") {
        console.log(
          `Follow-up scheduler triggered at ${new Date().toISOString()}`
        );
        this.performFollowUpCycle();
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
      case "triggerFollowUpNow":
        this.performFollowUpCycle()
          .then(() => sendResponse({ success: true }))
          .catch((err) => sendResponse({ success: false, error: err?.message || String(err) }));
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

  async performFollowUpCycle() {
    try {
      const apiUrl = "https://localhost:7120/api/linkedin/Get-Connection";
      console.log("[FollowUp] Fetching next connection from:", apiUrl);
      const res = await fetch(apiUrl, {
        method: "GET",
        headers: { Accept: "*/*" },
      });

      if (!res.ok) {
        throw new Error(`[FollowUp] Get-Connection failed: ${res.status}`);
      }

      let profileData = null;
      try {
        profileData = await res.json();
      } catch (e) {
        console.warn("[FollowUp] Response not JSON, attempting text parse");
        const text = await res.text();
        try {
          profileData = JSON.parse(text);
        } catch (e2) {
          throw new Error("[FollowUp] Could not parse profile data from API");
        }
      }

      let selected = null;
      if (Array.isArray(profileData)) {
        console.log(`[FollowUp] API returned ${profileData.length} items; selecting first valid with seleLeadUrl.`);
        selected = profileData.find((p) => p && typeof p === "object" && p.seleLeadUrl) || null;
      } else if (profileData && typeof profileData === "object") {
        selected = profileData;
      }

      if (!selected) {
        console.log("[FollowUp] No usable profile item returned, skipping this cycle.");
        return;
      }

      const leadUrl = selected.seleLeadUrl;
      if (!leadUrl) {
        console.warn("[FollowUp] Invalid or missing LinkedIn URL in selected profile:", selected);
        return;
      }

      const profileForContent = {
        name: selected.name || "",
        title: selected.title || "",
        url: selected.linkedinUrl || selected.url || selected.profileUrl || "",
        location: selected.location || "",
        interests: selected.interests || "",
        previousMessage: selected.message || "",
        leadUrl: leadUrl,
        profilePicUrl: selected.profilePicUrl || "",
        source: selected.source || "",
        status: selected.status || "",
        createdAt: selected.createdAt || null,
      };

      const tab = await new Promise((resolve) => {
        chrome.tabs.create({ url: leadUrl, active: false }, resolve);
      });

      const onUpdated = async (tabId, changeInfo) => {
        if (tabId === tab.id && changeInfo.status === "complete") {
          try {
            chrome.tabs.onUpdated.removeListener(onUpdated);
            console.log("[FollowUp] Page loaded. Sending startFollowUp to content script.");
            chrome.tabs.sendMessage(
              tab.id,
              { action: "startFollowUp", profile: profileForContent },
              (response) => {
                if (chrome.runtime.lastError) {
                  console.error("[FollowUp] Error sending message to content script:", chrome.runtime.lastError);
                } else {
                  console.log("[FollowUp] Content script acknowledged:", response);
                  const wasSent = !!(response && response.success && response.result && response.result.success);
                  if (wasSent) {
                    console.log("[FollowUp] Message sent. Closing tab.");
                    try { chrome.tabs.remove(tab.id); } catch (e) { console.warn("[FollowUp] Failed to close tab:", e); }
                  }
                }
              }
            );
          } catch (err) {
            console.error("[FollowUp] onUpdated handler error:", err);
          }
        }
      };
      chrome.tabs.onUpdated.addListener(onUpdated);
    } catch (error) {
      console.error("[FollowUp] performFollowUpCycle error:", error);
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
