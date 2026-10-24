import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserPool,
  CognitoUserSession,
} from "amazon-cognito-identity-js";

const pool = new CognitoUserPool({
  UserPoolId: import.meta.env.VITE_USER_POOL_ID,
  ClientId: import.meta.env.VITE_USER_POOL_CLIENT_ID,
});

export type Session = {
  email: string;
  idToken: string;
  adminGroup: boolean;
  mfa: boolean;
};

type SignInResult =
  | { status: "signedIn"; session: Session }
  | { status: "newPassword"; user: CognitoUser }
  | { status: "totp"; user: CognitoUser };

export function signIn(email: string, password: string): Promise<SignInResult> {
  const user = new CognitoUser({ Username: email, Pool: pool });
  return authenticate(user, email, password);
}

export function completeNewPassword(user: CognitoUser, email: string, password: string): Promise<SignInResult> {
  return new Promise((resolve, reject) => {
    user.completeNewPasswordChallenge(password, {}, callbacks(user, email, resolve, reject));
  });
}

export function submitTotp(user: CognitoUser, email: string, code: string): Promise<Session> {
  return new Promise((resolve, reject) => {
    user.sendMFACode(
      code,
      {
        onSuccess: (session) => resolve({ ...readSession(session, email), mfa: true }),
        onFailure: reject,
      },
      "SOFTWARE_TOKEN_MFA",
    );
  });
}

export function beginTotpSetup(email: string): Promise<string> {
  const user = currentUser(email);
  return new Promise((resolve, reject) => {
    user.getSession((error: Error | null) => {
      if (error) {
        reject(error);
        return;
      }
      user.associateSoftwareToken({
        associateSecretCode: (secret) => resolve(secret),
        onFailure: reject,
      });
    });
  });
}

export function confirmTotpSetup(email: string, code: string): Promise<void> {
  const user = currentUser(email);
  return new Promise((resolve, reject) => {
    user.getSession((sessionError: Error | null) => {
      if (sessionError) {
        reject(sessionError);
        return;
      }
      user.verifySoftwareToken(code, "One80Compass", {
        onSuccess: () => {
          user.setUserMfaPreference(
            null,
            { PreferredMfa: true, Enabled: true },
            (preferenceError) => (preferenceError ? reject(preferenceError) : resolve()),
          );
        },
        onFailure: reject,
      });
    });
  });
}

export function signOut(): void {
  pool.getCurrentUser()?.signOut();
}

function authenticate(user: CognitoUser, email: string, password: string): Promise<SignInResult> {
  const details = new AuthenticationDetails({ Username: email, Password: password });
  return new Promise((resolve, reject) => {
    user.authenticateUser(details, callbacks(user, email, resolve, reject));
  });
}

function callbacks(
  user: CognitoUser,
  email: string,
  resolve: (result: SignInResult) => void,
  reject: (reason: Error) => void,
) {
  return {
    onSuccess: (session: CognitoUserSession) => resolve({ status: "signedIn" as const, session: readSession(session, email) }),
    onFailure: (error: Error) => reject(error),
    newPasswordRequired: () => resolve({ status: "newPassword" as const, user }),
    totpRequired: () => resolve({ status: "totp" as const, user }),
  };
}

export function mfaIsEnrolled(email: string): Promise<boolean> {
  const user = currentUser(email);
  return new Promise((resolve, reject) => {
    user.getSession((error: Error | null) => {
      if (error) {
        reject(error);
        return;
      }
      user.getUserData((dataError, data) => {
        if (dataError || !data) {
          reject(dataError ?? new Error("Could not read MFA status."));
          return;
        }
        const settings = data.UserMFASettingList ?? [];
        resolve(settings.includes("SOFTWARE_TOKEN_MFA"));
      }, { bypassCache: true });
    });
  });
}

function readSession(session: CognitoUserSession, email: string): Session {
  const payload = session.getIdToken().payload;
  const groups = payload["cognito:groups"];
  const groupList = Array.isArray(groups) ? groups.map(String) : typeof groups === "string" ? [groups] : [];
  const accessPayload = decodeJwtPayload(session.getAccessToken().getJwtToken());
  return {
    email,
    idToken: session.getIdToken().getJwtToken(),
    adminGroup: groupList.includes("one80-admin"),
    mfa: claimHasMfa(payload) || claimHasMfa(accessPayload),
  };
}

function claimHasMfa(payload: { amr?: unknown }): boolean {
  const amr = payload.amr;
  if (Array.isArray(amr)) return amr.map(String).some((value) => value.toLowerCase().includes("mfa"));
  if (typeof amr === "string") return amr.toLowerCase().includes("mfa");
  return false;
}

function decodeJwtPayload(token: string): { amr?: unknown } {
  const segment = token.split(".")[1];
  if (!segment) return {};
  const json = atob(segment.replace(/-/g, "+").replace(/_/g, "/"));
  return JSON.parse(json) as { amr?: unknown };
}

function currentUser(email: string): CognitoUser {
  return pool.getCurrentUser() ?? new CognitoUser({ Username: email, Pool: pool });
}
