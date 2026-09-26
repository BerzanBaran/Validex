"""Exercise the complete wallet challenge flow against a running local API."""

import base64
import json
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import base58
from nacl.signing import SigningKey

API_URL = "http://127.0.0.1:8000/api/v1"


def post(path: str, payload: dict[str, str]) -> tuple[int, dict[str, object]]:
    request = Request(
        f"{API_URL}{path}",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=10) as response:  # noqa: S310 - fixed localhost URL
            return response.status, json.loads(response.read())
    except HTTPError as error:
        return error.code, json.loads(error.read())


def get(path: str, token: str | None = None) -> tuple[int, dict[str, object]]:
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    request = Request(f"{API_URL}{path}", headers=headers, method="GET")
    try:
        with urlopen(request, timeout=10) as response:  # noqa: S310 - fixed localhost URL
            return response.status, json.loads(response.read())
    except HTTPError as error:
        return error.code, json.loads(error.read())


def main() -> None:
    signing_key = SigningKey.generate()
    wallet_address = base58.b58encode(signing_key.verify_key.encode()).decode("ascii")
    challenge_status, challenge = post("/auth/challenge", {"wallet_address": wallet_address})
    assert challenge_status == 200, challenge

    message = str(challenge["message"])
    signature = base64.b64encode(signing_key.sign(message.encode()).signature).decode("ascii")
    verify_payload = {
        "challenge_id": str(challenge["challenge_id"]),
        "wallet_address": wallet_address,
        "signature": signature,
    }
    verify_status, token = post("/auth/verify", verify_payload)
    assert verify_status == 200, token
    assert token["wallet_address"] == wallet_address
    assert token["role"] == "customer"

    unauthenticated_status, _ = get("/auth/me")
    assert unauthenticated_status == 401
    me_status, me = get("/auth/me", str(token["access_token"]))
    assert me_status == 200, me
    assert me["wallet_address"] == wallet_address

    replay_status, replay = post("/auth/verify", verify_payload)
    assert replay_status == 409, replay
    print("Wallet auth smoke test passed; /auth/me works and replay returned HTTP 409.")


if __name__ == "__main__":
    main()
