/**
 * Pravin Kitchens & Interiors - Realtime Firebase Cloud Sync
 * Automatically syncs rates, specifications, custom materials, custom items, divisions, deleted configurations, and saved quotes across all devices.
 * High-performance edition: debounced cloud pushes, loop prevention, and optimized memory footprint.
 */
const DEFAULT_FIREBASE_CONFIG_KEY = 'pks_firebase_config';
const DEFAULT_FIREBASE_DB_URL = 'https://pravin-quotes-default-rtdb.firebaseio.com';
window.PKSSync = {
    db: null,
    isInitialized: false,
    isSyncing: false,
    dbUrl: DEFAULT_FIREBASE_DB_URL,
    pollInterval: null,
    pushDebounceTimer: null,

    getConfig() {
        const stored = localStorage.getItem(DEFAULT_FIREBASE_CONFIG_KEY);
        if (stored) {
            try {
                return JSON.parse(stored);
            } catch (e) { }
        }
        return { databaseURL: DEFAULT_FIREBASE_DB_URL };
    },

    saveConfig(configObj) {
        localStorage.setItem(DEFAULT_FIREBASE_CONFIG_KEY, JSON.stringify(configObj));
        this.init();
    },

    cleanDbUrl(url) {
        if (!url) return '';
        let cleaned = url.trim();
        if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
            cleaned = 'https://' + cleaned;
        }
        cleaned = cleaned.replace(/\/+$/, '');
        return cleaned;
    },

    init() {
        const rawConfig = this.getConfig();
        let databaseURL = DEFAULT_FIREBASE_DB_URL;
        let apiKey = 'AIzaSyDummyKeyForPublicRealtimeDbSync';
        let projectId = 'pravin-quotes';

        if (typeof rawConfig === 'string') {
            databaseURL = this.cleanDbUrl(rawConfig);
        } else if (typeof rawConfig === 'object' && rawConfig !== null) {
            databaseURL = this.cleanDbUrl(rawConfig.databaseURL || rawConfig.url || DEFAULT_FIREBASE_DB_URL);
            if (rawConfig.apiKey) apiKey = rawConfig.apiKey;
            if (rawConfig.projectId) projectId = rawConfig.projectId;
        }

        this.dbUrl = databaseURL || DEFAULT_FIREBASE_DB_URL;

        const hostMatch = this.dbUrl.match(/https?:\/\/([^.]+)/);
        if (hostMatch && hostMatch[1]) {
            projectId = hostMatch[1].replace('-default-rtdb', '');
        }

        const fullConfig = {
            apiKey: apiKey,
            authDomain: `${projectId}.firebaseapp.com`,
            databaseURL: this.dbUrl,
            projectId: projectId,
            storageBucket: `${projectId}.appspot.com`
        };

        try {
            if (typeof firebase !== 'undefined' && firebase.initializeApp) {
                if (!firebase.apps || firebase.apps.length === 0) {
                    firebase.initializeApp(fullConfig);
                }
                this.db = firebase.database();
                this.isInitialized = true;
                this.updateStatusUI(true);
                console.log("Firebase sync: Connected via SDK to", this.dbUrl);

                this.attachRealtimeListeners();
                this.pullAllRest(true);
                this.syncInitialData();
            } else {
                this.isInitialized = true;
                this.updateStatusUI(true);
                this.startRestPolling();
                this.pullAllRest(true);
            }
        } catch (err) {
            console.warn("Firebase SDK init notice, activating REST sync fallback:", err);
            this.isInitialized = true;
            this.updateStatusUI(true);
            this.startRestPolling();
            this.pullAllRest(true);
        }
    },

    updateStatusUI(isConnected, errorMsg = '') {
        const badges = document.querySelectorAll('.cloud-sync-badge');
        badges.forEach(b => {
            if (isConnected) {
                b.innerHTML = '🟢 <span style="color:#2ecc71;">Cloud Synced (Live)</span>';
                b.title = `Connected to Cloud Database: ${this.dbUrl}`;
            } else {
                b.innerHTML = '⚪ <span style="color:#83a08d;">Local Mode</span>';
                b.title = errorMsg ? `Sync: ${errorMsg}` : 'Click Cloud Sync in Admin Panel to connect Firebase';
            }
        });
    },

    // Safely update localStorage from remote cloud without triggering outbound echo
    setLocalItemSilently(key, cloudStr) {
        const local = localStorage.getItem(key);
        if (local !== cloudStr) {
            this.isSyncing = true;
            try {
                localStorage.setItem(key, cloudStr);
            } finally {
                setTimeout(() => { this.isSyncing = false; }, 50);
            }
            return true;
        }
        return false;
    },

    attachRealtimeListeners() {
        if (!this.db) return;
        try {
            const syncKey = (path, storageKey) => {
                this.db.ref(path).on('value', snapshot => {
                    const data = snapshot.val();
                    if (data !== null && data !== undefined) {
                        const cloudStr = typeof data === 'string' ? data : JSON.stringify(data);
                        if (this.setLocalItemSilently(storageKey, cloudStr)) {
                            window.dispatchEvent(new CustomEvent('pks_cloud_synced', { detail: { key: storageKey } }));
                        }
                    }
                });
            };

            syncKey('pks/rates', 'pks_rates');
            syncKey('pks/item_specs', 'pks_item_specs');
            syncKey('pks/custom_specs_by_id', 'pks_custom_specs_by_id');
            syncKey('pks/custom_materials', 'pks_custom_materials');
            syncKey('pks/custom_items', 'pks_custom_items');
            syncKey('pks/divisions', 'pks_divisions');
            syncKey('pks/saved_quotes', 'pks_saved_quotes');
            syncKey('pks/deleted_standard_materials', 'pks_deleted_standard_materials');
            syncKey('pks/deleted_standard_items', 'pks_deleted_standard_items');
        } catch (e) {
            console.warn("Realtime listener attachment notice:", e.message);
        }
    },

    startRestPolling() {
        if (this.pollInterval) clearInterval(this.pollInterval);
        // Only run polling if Firebase SDK is NOT active
        if (this.db) return;
        this.pollInterval = setInterval(() => {
            if (!this.db) {
                this.pullAllRest(false);
            }
        }, 30000);
    },

    syncInitialData() {
        if (!this.db) return;
        try {
            this.db.ref('pks').once('value').then(snapshot => {
                const data = snapshot.val() || {};
                const updates = {};

                if (!data.rates && localStorage.getItem('pks_rates')) {
                    try { updates['pks/rates'] = JSON.parse(localStorage.getItem('pks_rates')); } catch (e) { }
                }
                if (!data.item_specs && localStorage.getItem('pks_item_specs')) {
                    try { updates['pks/item_specs'] = JSON.parse(localStorage.getItem('pks_item_specs')); } catch (e) { }
                }
                if (!data.custom_specs_by_id && localStorage.getItem('pks_custom_specs_by_id')) {
                    try { updates['pks/custom_specs_by_id'] = JSON.parse(localStorage.getItem('pks_custom_specs_by_id')); } catch (e) { }
                }
                if (!data.custom_materials && localStorage.getItem('pks_custom_materials')) {
                    try { updates['pks/custom_materials'] = JSON.parse(localStorage.getItem('pks_custom_materials')); } catch (e) { }
                }
                if (!data.custom_items && localStorage.getItem('pks_custom_items')) {
                    try { updates['pks/custom_items'] = JSON.parse(localStorage.getItem('pks_custom_items')); } catch (e) { }
                }
                if (!data.divisions && localStorage.getItem('pks_divisions')) {
                    try { updates['pks/divisions'] = JSON.parse(localStorage.getItem('pks_divisions')); } catch (e) { }
                }
                if (!data.saved_quotes && localStorage.getItem('pks_saved_quotes')) {
                    try { updates['pks/saved_quotes'] = JSON.parse(localStorage.getItem('pks_saved_quotes')); } catch (e) { }
                }
                if (!data.deleted_standard_materials && localStorage.getItem('pks_deleted_standard_materials')) {
                    try { updates['pks/deleted_standard_materials'] = JSON.parse(localStorage.getItem('pks_deleted_standard_materials')); } catch (e) { }
                }
                if (!data.deleted_standard_items && localStorage.getItem('pks_deleted_standard_items')) {
                    try { updates['pks/deleted_standard_items'] = JSON.parse(localStorage.getItem('pks_deleted_standard_items')); } catch (e) { }
                }

                if (Object.keys(updates).length > 0) {
                    this.db.ref().update(updates);
                }
            }).catch(err => {
                console.warn("Initial sync access notice:", err.message);
            });
        } catch (e) { }
    },

    debouncedPush(delayMs = 1200) {
        if (this.isSyncing) return;
        if (this.pushDebounceTimer) {
            clearTimeout(this.pushDebounceTimer);
        }
        this.pushDebounceTimer = setTimeout(() => {
            this.pushAllData().catch(() => { });
        }, delayMs);
    },

    pushRates(ratesObj) {
        try {
            if (this.db) {
                this.db.ref('pks/rates').set(ratesObj);
                return;
            }
        } catch (e) { }
        if (this.dbUrl) {
            fetch(`${this.dbUrl}/pks/rates.json`, { method: 'PUT', body: JSON.stringify(ratesObj) }).catch(() => { });
        }
    },

    pushItemSpecs(specsObj) {
        try {
            if (this.db) {
                this.db.ref('pks/item_specs').set(specsObj);
                return;
            }
        } catch (e) { }
        if (this.dbUrl) {
            fetch(`${this.dbUrl}/pks/item_specs.json`, { method: 'PUT', body: JSON.stringify(specsObj) }).catch(() => { });
        }
    },

    pushCustomMaterials(customMatsObj) {
        try {
            if (this.db) {
                this.db.ref('pks/custom_materials').set(customMatsObj);
                return;
            }
        } catch (e) { }
        if (this.dbUrl) {
            fetch(`${this.dbUrl}/pks/custom_materials.json`, { method: 'PUT', body: JSON.stringify(customMatsObj) }).catch(() => { });
        }
    },

    pushCustomItems(customItemsArr) {
        try {
            if (this.db) {
                this.db.ref('pks/custom_items').set(customItemsArr);
                return;
            }
        } catch (e) { }
        if (this.dbUrl) {
            fetch(`${this.dbUrl}/pks/custom_items.json`, { method: 'PUT', body: JSON.stringify(customItemsArr) }).catch(() => { });
        }
    },

    pushDivisions(divisionsArr) {
        try {
            if (this.db) {
                this.db.ref('pks/divisions').set(divisionsArr);
                return;
            }
        } catch (e) { }
        if (this.dbUrl) {
            fetch(`${this.dbUrl}/pks/divisions.json`, { method: 'PUT', body: JSON.stringify(divisionsArr) }).catch(() => { });
        }
    },

    pushSavedQuotes(quotesArr) {
        try {
            if (this.db) {
                this.db.ref('pks/saved_quotes').set(quotesArr);
                return;
            }
        } catch (e) { }
        if (this.dbUrl) {
            fetch(`${this.dbUrl}/pks/saved_quotes.json`, { method: 'PUT', body: JSON.stringify(quotesArr) }).catch(() => { });
        }
    },

    pushDeletedStandardMaterials(delMatsArr) {
        try {
            if (this.db) {
                this.db.ref('pks/deleted_standard_materials').set(delMatsArr);
                return;
            }
        } catch (e) { }
        if (this.dbUrl) {
            fetch(`${this.dbUrl}/pks/deleted_standard_materials.json`, { method: 'PUT', body: JSON.stringify(delMatsArr) }).catch(() => { });
        }
    },

    pushDeletedStandardItems(delItemsArr) {
        try {
            if (this.db) {
                this.db.ref('pks/deleted_standard_items').set(delItemsArr);
                return;
            }
        } catch (e) { }
        if (this.dbUrl) {
            fetch(`${this.dbUrl}/pks/deleted_standard_items.json`, { method: 'PUT', body: JSON.stringify(delItemsArr) }).catch(() => { });
        }
    },

    async pushAllData() {
        if (this.isSyncing) return;
        const payload = {};
        if (localStorage.getItem('pks_rates')) {
            try { payload.rates = JSON.parse(localStorage.getItem('pks_rates')); } catch (e) { }
        }
        if (localStorage.getItem('pks_item_specs')) {
            try { payload.item_specs = JSON.parse(localStorage.getItem('pks_item_specs')); } catch (e) { }
        }
        if (localStorage.getItem('pks_custom_specs_by_id')) {
            try { payload.custom_specs_by_id = JSON.parse(localStorage.getItem('pks_custom_specs_by_id')); } catch (e) { }
        }
        if (localStorage.getItem('pks_custom_materials')) {
            try { payload.custom_materials = JSON.parse(localStorage.getItem('pks_custom_materials')); } catch (e) { }
        }
        if (localStorage.getItem('pks_custom_items')) {
            try { payload.custom_items = JSON.parse(localStorage.getItem('pks_custom_items')); } catch (e) { }
        }
        if (localStorage.getItem('pks_divisions')) {
            try { payload.divisions = JSON.parse(localStorage.getItem('pks_divisions')); } catch (e) { }
        }
        if (localStorage.getItem('pks_saved_quotes')) {
            try { payload.saved_quotes = JSON.parse(localStorage.getItem('pks_saved_quotes')); } catch (e) { }
        }
        if (localStorage.getItem('pks_deleted_standard_materials')) {
            try { payload.deleted_standard_materials = JSON.parse(localStorage.getItem('pks_deleted_standard_materials')); } catch (e) { }
        }
        if (localStorage.getItem('pks_deleted_standard_items')) {
            try { payload.deleted_standard_items = JSON.parse(localStorage.getItem('pks_deleted_standard_items')); } catch (e) { }
        }

        try {
            if (this.db) {
                await this.db.ref('pks').set(payload);
                return true;
            }
        } catch (e) {
            console.warn("SDK push notice, using REST protocol:", e.message);
        }

        if (this.dbUrl) {
            await fetch(`${this.dbUrl}/pks.json`, { method: 'PUT', body: JSON.stringify(payload) }).catch(() => { });
        }
        return true;
    },

    async pullAllRest(triggerNotify = true) {
        if (!this.dbUrl) return null;
        try {
            const res = await fetch(`${this.dbUrl}/pks.json`);
            if (!res.ok) return null;
            const data = await res.json();
            if (data && typeof data === 'object') {
                let changed = false;
                if (data.rates && this.setLocalItemSilently('pks_rates', JSON.stringify(data.rates))) changed = true;
                if (data.item_specs && this.setLocalItemSilently('pks_item_specs', JSON.stringify(data.item_specs))) changed = true;
                if (data.custom_specs_by_id && this.setLocalItemSilently('pks_custom_specs_by_id', JSON.stringify(data.custom_specs_by_id))) changed = true;
                if (data.custom_materials && this.setLocalItemSilently('pks_custom_materials', JSON.stringify(data.custom_materials))) changed = true;
                if (data.custom_items && this.setLocalItemSilently('pks_custom_items', JSON.stringify(data.custom_items))) changed = true;
                if (data.divisions && this.setLocalItemSilently('pks_divisions', JSON.stringify(data.divisions))) changed = true;
                if (data.saved_quotes && this.setLocalItemSilently('pks_saved_quotes', JSON.stringify(data.saved_quotes))) changed = true;
                if (data.deleted_standard_materials && this.setLocalItemSilently('pks_deleted_standard_materials', JSON.stringify(data.deleted_standard_materials))) changed = true;
                if (data.deleted_standard_items && this.setLocalItemSilently('pks_deleted_standard_items', JSON.stringify(data.deleted_standard_items))) changed = true;

                if (changed && triggerNotify) {
                    window.dispatchEvent(new CustomEvent('pks_cloud_synced', { detail: { all: true } }));
                }
            }
            return data;
        } catch (e) {
            return null;
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    window.PKSSync.init();
});
