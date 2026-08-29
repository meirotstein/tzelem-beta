import { DISCOVERY_DOCS, GOOGLE_API_KEY, GOOGLE_CLIENT_ID, GOOGLE_SCOPES } from './config';

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing?.dataset.loaded === 'true') {
      resolve();
      return;
    }
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', reject, { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function initGapi(): Promise<void> {
  return new Promise((resolve, reject) => {
    gapi.load('client:auth2', async () => {
      try {
        await gapi.client.init({
          apiKey: GOOGLE_API_KEY,
          discoveryDocs: DISCOVERY_DOCS,
          clientId: GOOGLE_CLIENT_ID,
          scope: GOOGLE_SCOPES,
        });
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
}

export class GoogleAuthService {
  private accessToken = '';

  async init(): Promise<void> {
    await loadScript('https://apis.google.com/js/api.js');
    await initGapi();
  }

  isSignedIn(): boolean {
    return Boolean(gapi.auth2?.getAuthInstance()?.isSignedIn.get());
  }

  async restoreSession(): Promise<string> {
    if (!this.isSignedIn()) throw new Error('not_signed_in');
    return this.applyCurrentToken();
  }

  async signIn(loginHint = ''): Promise<string> {
    const auth = gapi.auth2.getAuthInstance();
    if (!auth.isSignedIn.get()) {
      await auth.signIn({ prompt: 'consent', login_hint: loginHint || undefined });
    }
    return this.applyCurrentToken();
  }

  private applyCurrentToken(): string {
    const response = gapi.auth2.getAuthInstance().currentUser.get().getAuthResponse(true);
    this.accessToken = response.access_token || '';
    if (!this.accessToken) throw new Error('missing_access_token');
    gapi.client.setToken({ access_token: this.accessToken });
    return this.accessToken;
  }

  signOut(): void {
    const token = this.accessToken;
    this.accessToken = '';
    gapi.client.setToken(null);
    if (gapi.auth2?.getAuthInstance()) void gapi.auth2.getAuthInstance().signOut();
    if (token && window.google?.accounts?.oauth2) {
      window.google.accounts.oauth2.revoke(token, () => undefined);
    }
  }
}
