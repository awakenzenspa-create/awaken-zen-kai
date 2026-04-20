// ── Google Business Profile Client ───────────────────────────────────────────
// Reuses GMAIL_CLIENT_ID + GMAIL_CLIENT_SECRET with GBP_REFRESH_TOKEN
// Handles token refresh automatically

const { google } = require('googleapis');

let cachedAccessToken = null;
let tokenExpiry = 0;

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    'http://localhost'
  );
}

async function getAccessToken() {
  if (cachedAccessToken && Date.now() < tokenExpiry - 60000) {
    return cachedAccessToken;
  }
  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials({ refresh_token: process.env.GBP_REFRESH_TOKEN });
  const { credentials } = await oauth2Client.refreshAccessToken();
  cachedAccessToken = credentials.access_token;
  tokenExpiry = credentials.expiry_date;
  return cachedAccessToken;
}

// Fetch accountId and locationId from GBP API
async function getLocationName() {
  // Cache in memory — these never change
  if (getLocationName._cached) return getLocationName._cached;

  const token = await getAccessToken();

  // 1. Get account list
  const accountsRes = await fetch(
    'https://mybusinessaccountmanagement.googleapis.com/v1/accounts',
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const accountsData = await accountsRes.json();
  if (!accountsData.accounts?.length) {
    console.error('[gbp] Accounts API response:', JSON.stringify(accountsData));
    throw new Error('No GBP accounts found');
  }

  // Find the account that owns AZS location
  const account = accountsData.accounts.find(a =>
    a.type === 'PERSONAL' || a.type === 'LOCATION_GROUP'
  ) || accountsData.accounts[0];

  const accountId = account.name; // e.g. "accounts/123456789"

  // 2. Get locations for this account
  const locsRes = await fetch(
    `https://mybusinessbusinessinformation.googleapis.com/v1/${accountId}/locations?readMask=name,title`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const locsData = await locsRes.json();
  if (!locsData.locations?.length) throw new Error('No GBP locations found');

  // Find Awaken Zen Spa
  const loc = locsData.locations.find(l =>
    l.title?.toLowerCase().includes('awaken') ||
    l.title?.toLowerCase().includes('zen')
  ) || locsData.locations[0];

  const locationName = loc.name; // e.g. "locations/987654321"
  console.log(`[gbp] Using location: ${locationName} (${loc.title})`);
  getLocationName._cached = locationName;
  return locationName;
}

// Create a GBP post
// type: 'STANDARD' | 'OFFER' | 'EVENT'
async function createPost({ summary, callToActionType = 'BOOK', callToActionUrl, offerDetails, eventDetails } = {}) {
  const token = await getAccessToken();
  const locationName = await getLocationName();

  const body = {
    languageCode: 'en-US',
    summary,
    callToAction: {
      actionType: callToActionType,
      url: callToActionUrl || 'https://awakenzenspa.com/booking'
    }
  };

  if (offerDetails) {
    body.offer = offerDetails; // { couponCode, redeemOnlineUrl, termsConditions }
  }

  if (eventDetails) {
    body.event = eventDetails; // { title, schedule: { startDate, endDate } }
  }

  const res = await fetch(
    `https://mybusiness.googleapis.com/v4/${locationName}/localPosts`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    }
  );

  const data = await res.json();
  if (!res.ok) throw new Error(`GBP post failed: ${JSON.stringify(data)}`);
  return data;
}

// Upload a photo to GBP
// category: 'COVER' | 'PROFILE' | 'INTERIOR' | 'EXTERIOR' | 'PRODUCT' | 'AT_WORK' | 'FOOD_AND_DRINK' | 'MENU' | 'COMMON_AREA' | 'ROOMS' | 'TEAMS' | 'ADDITIONAL'
async function uploadPhoto({ imageBuffer, mimeType = 'image/jpeg', category = 'INTERIOR' } = {}) {
  const token = await getAccessToken();
  const locationName = await getLocationName();

  // Step 1: Create media item metadata
  const metaRes = await fetch(
    `https://mybusiness.googleapis.com/v4/${locationName}/media`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        mediaFormat: 'PHOTO',
        locationAssociation: { category },
        sourceUrl: null
      })
    }
  );

  const metaData = await metaRes.json();
  if (!metaRes.ok) throw new Error(`GBP media create failed: ${JSON.stringify(metaData)}`);

  // Step 2: Upload the actual bytes to the upload URI
  if (metaData.dataRef?.resourceName) {
    // Use media upload endpoint
    const uploadRes = await fetch(
      `https://mybusiness.googleapis.com/v4/${metaData.dataRef.resourceName}:startUpload`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      }
    );
    const uploadData = await uploadRes.json();

    // Upload bytes
    await fetch(uploadData.uploadUri, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': mimeType,
        'X-Goog-Upload-Protocol': 'raw'
      },
      body: imageBuffer
    });
  }

  return metaData;
}

module.exports = { getAccessToken, getLocationName, createPost, uploadPhoto };
