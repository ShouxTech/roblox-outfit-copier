const copyOutfitBtn = document.getElementById('copy-outfit-btn');
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

async function isAssetPartOfBundle(assetId) {
    const endpointURL = `https://asset-to-bundle-api.herokuapp.com/?id=${assetId}`;

    const res = await (await fetch(endpointURL)).json();

    if (res.success) return res;

    return false;
}

async function buyFreeAssets(assets) {
    const postHeaders = await getPostHeaders();

    for (const assetId of assets) {
        const bundleDetails = await isAssetPartOfBundle(assetId);

        let productId;
        let sellerId;

        // Check if asset is a part of a bundle.
        if (bundleDetails) {
            const bundleAssetId = bundleDetails.bundle.id;

            const infoEndpointURL = `https://catalog.roblox.com/v1/bundles/${bundleAssetId}/details`;
            const res = await (await fetch(infoEndpointURL)).json();

            const isFree = (res.product.isFree == true);
            productId = res.product.id;
            sellerId = res.creator.id;

            if (!isFree) continue;
        } else {
            const infoEndpointURL = `https://api.roblox.com/marketplace/productinfo?assetId=${assetId}`;
            const res = await (await fetch(infoEndpointURL)).json();

            const isFree = ((res.PriceInRobux === null) && !res.IsLimited && !res.IsLimitedUnique);
            productId = res.ProductId;
            sellerId = res.Creator.Id;

            if (!isFree) continue;
            if (!productId) continue;
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