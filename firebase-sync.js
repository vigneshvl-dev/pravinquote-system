/**
 * Pravin Kitchens & Interiors - Realtime Firebase Cloud Sync
 * Automatically syncs rates, specifications, custom materials, divisions, and saved quotes across all devices.
 */

const DEFAULT_FIREBASE_CONFIG_KEY = 'pks_firebase_config';
const DEFAULT_FIREBASE_DB_URL = 'https://pravin-quotes-default-rtdb.firebaseio.com';

window.PKSSync = {
    db: null,
    isInitialized: false,
    dbUrl: '',
    pollInterval: null,

    getConfig() {
        const stored = localStorage.getItem(DEFAULT_FIREBASE_CONFIG_KEY);
        if (stored) {
            try {
                return JSON.parse(stored);
            } catch (e) {}
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
        // Remove trailing slashes and paths
        cleaned = cleaned.replace(/\/+$/, '');
        return cleaned;
    },

    init() {
        const rawConfig = this.getConfig();
        if (!rawConfig) {
            console.log("Firebase sync: No configuration found. Operating in local storage mode.");
            this.updateStatusUI(false);
            return;
        }

        let databaseURL = '';
        let apiKey = 'AIzaSyDummyKeyForPublicRealtimeDbSync';
        let projectId = 'pravin-quotes';

        if (typeof rawConfig === 'string') {
            databaseURL = this.cleanDbUrl(rawConfig);
        } else if (typeof rawConfig === 'object') {
            databaseURL = this.cleanDbUrl(rawConfig.databaseURL || rawConfig.url || '');
            if (rawConfig.apiKey) apiKey = rawConfig.apiKey;
            if (rawConfig.projectId) projectId = rawConfig.projectId;
        }

        if (!databaseURL) {
            this.updateStatusUI(false);
            return;
        }

        this.dbUrl = databaseURL;

        // Auto-extract Project ID if not set
        const hostMatch = databaseURL.match(/https?:\/\/([^.]+)/);
        if (hostMatch && hostMatch[1]) {
            projectId = hostMatch[1].replace('-default-rtdb', '');
        }

        const fullConfig = {
            apiKey: apiKey,
            authDomain: `${projectId}.firebaseapp.com`,
            databaseURL: databaseURL,
            projectId: projectId,
            storageBucket: `${projectId}.appspot.com`
        };

        try {
            if (typeof firebase !== 'undefined' && firebase.initializeApp) {
                // Delete existing default app if re-initializing with new URL
                if (firebase.apps && firebase.apps.length > 0) {
                    try {
                        firebase.app().delete();
                    } catch (e) {}
                }

                firebase.initializeApp(fullConfig);
                this.db = firebase.database();
                this.isInitialized = true;
                this.updateStatusUI(true);
                console.log("Firebase sync: Connected via SDK to", databaseURL);

                this.attachRealtimeListeners();
                this.pullAllRest(true);
                this.syncInitialData();
            } else {
                // Fallback to REST polling if SDK is not present
                this.isInitialized = true;
                this.updateStatusUI(true);
                this.startRestPolling();
                this.pullAllRest(true);
            }
        } catch (err) {
            console.warn("Firebase SDK initialization warning, activating REST sync fallback:", err);
            // Fallback to direct REST sync which always works with any valid Realtime DB URL
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

    attachRealtimeListeners() {
        if (!this.db) return;

        // 1. Rates Sync
        this.db.ref('pks/rates').on('value', snapshot => {
            const data = snapshot.val();
            if (data && typeof data === 'object') {
                const local = localStorage.getItem('pks_rates');
                const cloudStr = JSON.stringify(data);
                if (local !== cloudStr) {
                    localStorage.setItem('pks_rates', cloudStr);
                    window.dispatchEvent(new Event('storage'));
                }
            }
        });

        // 2. Specifications Sync
        this.db.ref('pks/item_specs').on('value', snapshot => {
            const data = snapshot.val();
            if (data && typeof data === 'object') {
                const local = localStorage.getItem('pks_item_specs');
                const cloudStr = JSON.stringify(data);
                if (local !== cloudStr) {
                    localStorage.setItem('pks_item_specs', cloudStr);
                    window.dispatchEvent(new Event('storage'));
                }
            }
        });

        // 3. Custom Materials Sync
        this.db.ref('pks/custom_materials').on('value', snapshot => {
            const data = snapshot.val();
            if (data && typeof data === 'object') {
                const local = localStorage.getItem('pks_custom_materials');
                const cloudStr = JSON.stringify(data);
                if (local !== cloudStr) {
                    localStorage.setItem('pks_custom_materials', cloudStr);
                    window.dispatchEvent(new Event('storage'));
                }
            }
        });

        // 4. Custom Items Sync
        this.db.ref('pks/custom_items').on('value', snapshot => {
            const data = snapshot.val();
            if (data && Array.isArray(data)) {
                const local = localStorage.getItem('pks_custom_items');
                const cloudStr = JSON.stringify(data);
                if (local !== cloudStr) {
                    localStorage.setItem('pks_custom_items', cloudStr);
                    window.dispatchEvent(new Event('storage'));
                }
            }
        });

        // 5. Divisions Sync
        this.db.ref('pks/divisions').on('value', snapshot => {
            const data = snapshot.val();
            if (data && Array.isArray(data)) {
                const local = localStorage.getItem('pks_divisions');
                const cloudStr = JSON.stringify(data);
                if (local !== cloudStr) {
                    localStorage.setItem('pks_divisions', cloudStr);
                    window.dispatchEvent(new Event('storage'));
                }
            }
        });

        // 6. Saved Quotes Sync
        this.db.ref('pks/saved_quotes').on('value', snapshot => {
            const data = snapshot.val();
            if (data && Array.isArray(data)) {
                const local = localStorage.getItem('pks_saved_quotes');
                const cloudStr = JSON.stringify(data);
                if (local !== cloudStr) {
                    localStorage.setItem('pks_saved_quotes', cloudStr);
                    window.dispatchEvent(new Event('storage'));
                }
            }
        });
    },

    startRestPolling() {
        if (this.pollInterval) clearInterval(this.pollInterval);
        this.pollInterval = setInterval(() => {
            this.pullAllRest(false);
        }, 15000); // Check for cloud updates every 15s in REST mode
    },

    syncInitialData() {
        if (!this.db) return;

        this.db.ref('pks').once('value').then(snapshot => {
            const data = snapshot.val() || {};
            const updates = {};

            if (!data.rates && localStorage.getItem('pks_rates')) {
                try { updates['pks/rates'] = JSON.parse(localStorage.getItem('pks_rates')); } catch(e){}
            }
            if (!data.item_specs && localStorage.getItem('pks_item_specs')) {
                try { updates['pks/item_specs'] = JSON.parse(localStorage.getItem('pks_item_specs')); } catch(e){}
            }
            if (!data.custom_materials && localStorage.getItem('pks_custom_materials')) {
                try { updates['pks/custom_materials'] = JSON.parse(localStorage.getItem('pks_custom_materials')); } catch(e){}
            }
            if (!data.custom_items && localStorage.getItem('pks_custom_items')) {
                try { updates['pks/custom_items'] = JSON.parse(localStorage.getItem('pks_custom_items')); } catch(e){}
            }
            if (!data.divisions && localStorage.getItem('pks_divisions')) {
                try { updates['pks/divisions'] = JSON.parse(localStorage.getItem('pks_divisions')); } catch(e){}
            }
            if (!data.saved_quotes && localStorage.getItem('pks_saved_quotes')) {
                try { updates['pks/saved_quotes'] = JSON.parse(localStorage.getItem('pks_saved_quotes')); } catch(e){}
            }

            if (Object.keys(updates).length > 0) {
                this.db.ref().update(updates);
            }
        }).catch(err => {
            console.warn("Realtime listener access notice:", err.message);
        });
    },

    pushRates(ratesObj) {
        if (this.db) {
            this.db.ref('pks/rates').set(ratesObj);
        } else if (this.dbUrl) {
            fetch(`${this.dbUrl}/pks/rates.json`, { method: 'PUT', body: JSON.stringify(ratesObj) });
        }
    },

    pushItemSpecs(specsObj) {
        if (this.db) {
            this.db.ref('pks/item_specs').set(specsObj);
        } else if (this.dbUrl) {
            fetch(`${this.dbUrl}/pks/item_specs.json`, { method: 'PUT', body: JSON.stringify(specsObj) });
        }
    },

    pushCustomMaterials(customMatsObj) {
        if (this.db) {
            this.db.ref('pks/custom_materials').set(customMatsObj);
        } else if (this.dbUrl) {
            fetch(`${this.dbUrl}/pks/custom_materials.json`, { method: 'PUT', body: JSON.stringify(customMatsObj) });
        }
    },

    pushCustomItems(customItemsArr) {
        if (this.db) {
            this.db.ref('pks/custom_items').set(customItemsArr);
        } else if (this.dbUrl) {
            fetch(`${this.dbUrl}/pks/custom_items.json`, { method: 'PUT', body: JSON.stringify(customItemsArr) });
        }
    },

    pushDivisions(divisionsArr) {
        if (this.db) {
            this.db.ref('pks/divisions').set(divisionsArr);
        } else if (this.dbUrl) {
            fetch(`${this.dbUrl}/pks/divisions.json`, { method: 'PUT', body: JSON.stringify(divisionsArr) });
        }
    },

    pushSavedQuotes(quotesArr) {
        if (this.db) {
            this.db.ref('pks/saved_quotes').set(quotesArr);
        } else if (this.dbUrl) {
            fetch(`${this.dbUrl}/pks/saved_quotes.json`, { method: 'PUT', body: JSON.stringify(quotesArr) });
        }
    },

    async pushAllData() {
        const payload = {};
        if (localStorage.getItem('pks_rates')) {
            try { payload.rates = JSON.parse(localStorage.getItem('pks_rates')); } catch(e){}
        }
        if (localStorage.getItem('pks_item_specs')) {
            try { payload.item_specs = JSON.parse(localStorage.getItem('pks_item_specs')); } catch(e){}
        }
        if (localStorage.getItem('pks_custom_materials')) {
            try { payload.custom_materials = JSON.parse(localStorage.getItem('pks_custom_materials')); } catch(e){}
        }
        if (localStorage.getItem('pks_custom_items')) {
            try { payload.custom_items = JSON.parse(localStorage.getItem('pks_custom_items')); } catch(e){}
        }
        if (localStorage.getItem('pks_divisions')) {
            try { payload.divisions = JSON.parse(localStorage.getItem('pks_divisions')); } catch(e){}
        }
        if (localStorage.getItem('pks_saved_quotes')) {
            try { payload.saved_quotes = JSON.parse(localStorage.getItem('pks_saved_quotes')); } catch(e){}
        }

        if (this.db) {
            await this.db.ref('pks').set(payload);
        } else if (this.dbUrl) {
            await fetch(`${this.dbUrl}/pks.json`, { method: 'PUT', body: JSON.stringify(payload) });
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
                if (data.rates) localStorage.setItem('pks_rates', JSON.stringify(data.rates));
                if (data.item_specs) localStorage.setItem('pks_item_specs', JSON.stringify(data.item_specs));
                if (data.custom_materials) localStorage.setItem('pks_custom_materials', JSON.stringify(data.custom_materials));
                if (data.custom_items) localStorage.setItem('pks_custom_items', JSON.stringify(data.custom_items));
                if (data.divisions) localStorage.setItem('pks_divisions', JSON.stringify(data.divisions));
                if (data.saved_quotes) localStorage.setItem('pks_saved_quotes', JSON.stringify(data.saved_quotes));
                if (triggerNotify) {
                    window.dispatchEvent(new Event('storage'));
                }
            }
            return data;
        } catch (e) {
            console.error("REST sync pull error:", e);
            return null;
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    window.PKSSync.init();
});
