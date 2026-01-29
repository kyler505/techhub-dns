export interface LastSignature {
    dataUrl: string;
    width: number;
    height: number;
    createdAt: number;
}

const CACHE_KEY = 'dns_last_signature';

export const signatureCache = {
    save: (dataUrl: string, width: number, height: number) => {
        const entry: LastSignature = {
            dataUrl,
            width,
            height,
            createdAt: Date.now(),
        };
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
        } catch (e) {
            console.error('Failed to save signature to local storage', e);
        }
    },

    load: (): LastSignature | null => {
        try {
            const raw = localStorage.getItem(CACHE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (
                !parsed ||
                typeof parsed.dataUrl !== 'string' ||
                !parsed.dataUrl.startsWith('data:') ||
                typeof parsed.width !== 'number' ||
                typeof parsed.height !== 'number' ||
                !Number.isFinite(parsed.width) ||
                !Number.isFinite(parsed.height) ||
                parsed.width <= 0 ||
                parsed.height <= 0
            ) {
                localStorage.removeItem(CACHE_KEY);
                return null;
            }
            return parsed as LastSignature;
        } catch (e) {
            console.error('Failed to load signature from local storage', e);
            return null;
        }
    },

    clear: () => {
        localStorage.removeItem(CACHE_KEY);
    }
};
