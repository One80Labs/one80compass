/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USER_POOL_ID: string;
  readonly VITE_USER_POOL_CLIENT_ID: string;
  readonly VITE_API_URL: string;
  /** Set to "true" when the deployed pool requires an authenticator. Dev leaves it unset. */
  readonly VITE_MFA_REQUIRED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
