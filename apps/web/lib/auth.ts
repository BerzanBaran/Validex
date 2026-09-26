"use client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const SESSION_KEY = "validex.auth.session.v1";

export type AuthSession = {
  accessToken: string;
  expiresAt: string;
  userId: string;
  walletAddress: string;
  role: "customer" | "merchant" | "admin";
};

type ChallengeResponse = {
  challenge_id: string;
  message: string;
  expires_at: string;
};

type TokenResponse = {
  access_token: string;
  expires_at: string;
  user_id: string;
  wallet_address: string;
  role: AuthSession["role"];
};

async function readError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { detail?: string };
    return payload.detail ?? "Cüzdan doğrulaması tamamlanamadı.";
  } catch {
    return "Cüzdan doğrulaması tamamlanamadı.";
  }
}

export async function authenticateWallet(
  walletAddress: string,
  signMessage: (message: string) => Promise<string>,
): Promise<AuthSession> {
  const challengeResponse = await fetch(`${API_URL}/api/v1/auth/challenge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet_address: walletAddress }),
  });
  if (!challengeResponse.ok) throw new Error(await readError(challengeResponse));
  const challenge = (await challengeResponse.json()) as ChallengeResponse;

  const signature = await signMessage(challenge.message);
  const verifyResponse = await fetch(`${API_URL}/api/v1/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      challenge_id: challenge.challenge_id,
      wallet_address: walletAddress,
      signature,
    }),
  });
  if (!verifyResponse.ok) throw new Error(await readError(verifyResponse));
  const token = (await verifyResponse.json()) as TokenResponse;
  const session: AuthSession = {
    accessToken: token.access_token,
    expiresAt: token.expires_at,
    userId: token.user_id,
    walletAddress: token.wallet_address,
    role: token.role,
  };
  window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function getStoredSession(walletAddress: string): AuthSession | null {
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as AuthSession;
    if (session.walletAddress !== walletAddress || Date.parse(session.expiresAt) <= Date.now()) {
      window.sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    window.sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export function clearStoredSession(): void {
  window.sessionStorage.removeItem(SESSION_KEY);
}
