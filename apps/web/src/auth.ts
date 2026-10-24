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
        onSuccess: (session) => resolve(readSession(session, email)),
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
    user.verifySoftwareToken(code, "One80Compass", {
      onSuccess: () => {
        user.setUserMfaPreference(
          null,
          { PreferredMfa: true, Enabled: true },
          (error) => (error ? reject(error) : resolve()),
        );
      },
      onFailure: reject,
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

function readSession(session: CognitoUserSession, email: string): Session {
  const payload = session.getIdToken().payload;
  const groups = payload["cognito:groups"];
  const groupList = Array.isArray(groups) ? groups.map(String) : typeof groups === "string" ? [groups] : [];
  const amr = payload.amr;
  const mfa = Array.isArray(amr) && amr.map(String).includes("mfa");
  return {
    email,
    idToken: session.getIdToken().getJwtToken(),
    adminGroup: groupList.includes("one80-admin"),
    mfa,
  };
}

function currentUser(email: string): CognitoUser {
  return pool.getCurrentUser() ?? new CognitoUser({ Username: email, Pool: pool });
}
