/// <reference types="vite/client" />

declare const gapi: any;

interface Window {
  google?: {
    accounts?: {
      oauth2?: {
        revoke: (token: string, done: () => void) => void;
      };
    };
  };
}
