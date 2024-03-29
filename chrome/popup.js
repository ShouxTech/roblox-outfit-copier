const copyOutfitBtn = document.getElementById('copy-outfit-btn');
const openPaidItemsCheckbox = document.getElementById('open-paid-items-checkbox');
const copyBodyColorsCheckbox = document.getElementById('copy-skin-color-checkbox');
const statusText = document.getElementById('status-text');

const PROFILE_PREFIX = 'roblox.com/users/';

async function getCurrentTab() {
    const queryOptions = { active: true, currentWindow: true };
    const [tab] = await chrome.tabs.query(queryOptions);
    return tab;
}

async function getROBLOSECURITY() {
    const ROBLOSECURITY = (await chrome.cookies.get({
        url: 'https://www.roblox.com',
        name: '.ROBLOSECURITY'
    })).value;
    return ROBLOSECURITY;
}

async function getXCSRFToken(cookie) {
    const res = await fetch('https://avatar.roblox.com/v1/avatar/set-wearing-assets', {
        method: 'POST',
        headers: {
            'cookie': `.ROBLOSECURITY=${cookie}`,
            'Content-Type': 'application/json',
        },
    });
    return res.headers.get('x-csrf-token');
}

async function getPostHeaders() {
    const cookie = await getROBLOSECURITY();
    const xCSRFToken = await getXCSRFToken(cookie);
    return {
        'cookie': `.ROBLOSECURITY=${cookie}`,
        'x-csrf-token': xCSRFToken,
    };
}

async function getWearingAssets(userId) {
    const endpointURL = `https://avatar.roblox.com/v1/users/${userId}/currently-wearing`;
    const data = await (await fetch(endpointURL)).json();
    return data;
}

async function setWearingAssets(assets) {
    const endpointURL = 'https://avatar.roblox.com/v1/avatar/set-wearing-assets';

    const res = await fetch(endpointURL, {
        method: 'POST',
        headers: {
            ...(await getPostHeaders()),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(assets),
    });
}

async function getBodyColors(userId) {
    const endpointURL = `https://avatar.roblox.com/v1/users/${userId}/avatar`;
    const data = await (await fetch(endpointURL)).json();
    return data.bodyColors;
}

async function setBodyColors(colors) {
    const endpointURL = 'https://avatar.roblox.com/v1/avatar/set-body-colors';

    const res = await fetch(endpointURL, {
        method: 'POST',
        headers: {
            ...(await getPostHeaders()),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(colors),
    });
}

async function getBundleData(assetId) {
    const bundlesRes = await fetch(`https://catalog.roblox.com/v1/assets/${assetId}/bundles?sortOrder=Asc&limit=10`);

    const bundles = (await bundlesRes.json()).data;

    if (bundles.length == 0) return;

    const bundle = bundles[0];

    return {
        id: bundle.product.id,
        isFree: bundle.product.isFree,
        creator: {
            id: bundle.creator.id,
        },
    };
}

async function buyFreeAssets(assets) {
    const postHeaders = await getPostHeaders();

    for (const assetId of assets) {
        const bundleData = await getBundleData(assetId);

        let isFree;
        let productId;
        let sellerId;

        // Check if asset is a part of a bundle.
        if (bundleData) {
            isFree = bundleData.isFree;
            productId = bundleData.id;
            sellerId = bundleData.creator.id;
        } else {
            const infoEndpointURL = `https://economy.roblox.com/v2/developer-products/${assetId}/info`;
            const res = await (await fetch(infoEndpointURL, {credentials: 'omit'})).json(); // Have to use {credentials: 'omit'} because of a Roblox bug.

            isFree = ((res.PriceInRobux === null) && !res.IsLimited && !res.IsLimitedUnique);
            productId = res.ProductId;
            sellerId = res.Creator.Id;

            if (!productId) continue;
        }

        if (!isFree) {
            if (openPaidItemsCheckbox.checked) {
                chrome.tabs.create({ url: `https://www.roblox.com/catalog/${assetId}`, active: false });
            }
            continue;
        }

        const purchaseEndpointURL = `https://economy.roblox.com/v1/purchases/products/${productId}`;
        const purchaseRes = await fetch(purchaseEndpointURL, {
            method: 'POST',
            headers: {
                ...postHeaders,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                'expectedCurrency': 1,
                'expectedPrice': 0,
                'expectedSellerId': sellerId,
            }),
        });
    }
}

copyOutfitBtn.onclick = async () => {
    const currentTab = await getCurrentTab();

    const url = currentTab.url;

    // Check if the page that the user is on is a valid Roblox profile page.
    const startPos = url.search(PROFILE_PREFIX);
    const endPos = url.search('/profile');

    if ((startPos == -1) || (endPos == -1)) {
        statusText.innerText = 'Invalid Roblox profile.';
        return;
    };

    // Get the user's ID from the URL.
    const userId = url.substring(startPos + PROFILE_PREFIX.length, endPos);
    
    // Get an array of the user's currently worn assets.
    statusText.innerText = 'Getting assets...';
    const wearingAssets = await getWearingAssets(userId);

    if (copyBodyColorsCheckbox.checked) {
        statusText.innerText = 'Getting body colors...';
        const bodyColors = await getBodyColors(userId);
        statusText.innerText = 'Setting body colors...';
        await setBodyColors(bodyColors);
    }

    // Buy any free assets that the user is wearing.
    statusText.innerText = 'Buying free assets...';
    await buyFreeAssets(wearingAssets.assetIds);

    // Wear the assets.
    statusText.innerText = 'Wearing assets...';
    await setWearingAssets(wearingAssets);

    // Done.
    statusText.innerText = 'Complete!';
    setTimeout(() => {
        statusText.innerText = '';
    }, 3000);
};