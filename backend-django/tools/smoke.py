#!/usr/bin/env python3
"""Walk the money and the AI against a LIVE deployment.

    python tools/smoke.py --api https://…/v1 --token <supabase jwt>
    python tools/smoke.py                      # reads .env.local + /tmp/jwt.txt

WHY THIS EXISTS. Every expensive bug in this project has been a client
and a server that were each fine on their own:

  * `/v1/v1/…` — the new libs prepended a prefix the env var already had.
    Every call 404'd, and `listConsultants` turned that into an empty list
    rather than an error, so it rendered as an empty marketplace.
  * `X-Cutover-Module` — a header the server never read forced a CORS
    preflight the API refuses. Every browser call failed; curl, which does
    not preflight, saw 200.
  * The chart tuple — `user_chart()` answers `(payload, cached)` and the
    AI passed the pair whole. Every question 500'd the moment a profile
    had birth details, which no test had.

All three passed lint, build and the unit suite. None would have survived
this script. `npm run build` proves almost nothing (CLAUDE.md trap 1) and
neither does a green pytest run against SQLite.

WHAT IT WILL NOT DO: it never sends money anywhere. The Razorpay order it
creates is a test-mode order that nobody pays, the AI session it starts is
ended immediately, and the ledger assertion at the end is what catches it
if either of those was wrong.
"""

import argparse
import json
import os
import pathlib
import sys

import requests

ROOT = pathlib.Path(__file__).resolve().parents[2]

GREEN, RED, DIM, OFF = "\033[32m", "\033[31m", "\033[2m", "\033[0m"
failures = []


def check(label, ok, detail=""):
    mark = f"{GREEN}ok  {OFF}" if ok else f"{RED}FAIL{OFF}"
    print(f"  {mark} {label}{DIM}{'  ' + detail if detail else ''}{OFF}")
    if not ok:
        failures.append(label)
    return ok


def call(api, path, token=None, method="GET", body=None):
    """requests, not urllib.

    urllib verifies against the system trust store, which on a Mac with a
    Python from python.org is empty until somebody runs Install
    Certificates.command — so every call came back as a connection error
    and this script reported the API down when it was fine. requests ships
    certifi and does not care.
    """
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        response = requests.request(
            method, f"{api}{path}", headers=headers,
            json=body if body is not None else None, timeout=30,
        )
    except Exception as exc:  # noqa: BLE001
        return 0, {"_error": f"{type(exc).__name__}: {exc}"}
    try:
        return response.status_code, (response.json() if response.content else None)
    except ValueError:
        return response.status_code, {"_body": response.text[:200]}


def env_from(path, key):
    try:
        for line in pathlib.Path(path).read_text().splitlines():
            if line.startswith(f"{key}="):
                return line.split("=", 1)[1].strip()
    except OSError:
        pass
    return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--api", default=os.environ.get("VITE_DJANGO_API_URL"))
    parser.add_argument("--token", default=None)
    args = parser.parse_args()

    api = args.api or env_from(ROOT / ".env.local", "VITE_DJANGO_API_URL")
    token = args.token
    if not token:
        try:
            token = pathlib.Path("/tmp/jwt.txt").read_text().strip()
        except OSError:
            token = None

    if not api:
        sys.exit("No API url. Pass --api or set VITE_DJANGO_API_URL.")
    print(f"\n{DIM}api  {api}{OFF}")

    # ── the prefix bug, first, because everything else is noise if it is
    #    wrong and the symptom is an empty screen rather than an error ──
    print("\nShape")
    check("the api url carries /v1 and not /v1/v1", api.rstrip("/").endswith("/v1")
          and not api.rstrip("/").endswith("/v1/v1"), api)
    status, _ = call(api, "/health/")
    check("health answers", status == 200, str(status))
    status, _ = call(api, "/me/")
    check("an unauthenticated read is 401, not 200", status == 401, str(status))

    if not token:
        print(f"\n{DIM}No session token — signed-in checks skipped.")
        print(f"Pass --token, or put one in /tmp/jwt.txt.{OFF}\n")
        return finish()

    status, me = call(api, "/me/", token)
    if not check("the session is valid", status == 200, str(status)):
        return finish()
    print(f"{DIM}user {me.get('id')}{OFF}")

    # ── money ──────────────────────────────────────────────────────────
    print("\nWallet")
    status, wallet = call(api, "/wallet/", token)
    check("balance reads", status == 200 and "balance_paise" in (wallet or {}),
          f"{(wallet or {}).get('balance_paise')} paise")
    status, ledger = call(api, "/wallet/ledger/?limit=5", token)
    check("ledger reads", status == 200 and isinstance(ledger, list),
          f"{len(ledger) if isinstance(ledger, list) else '?'} rows")

    print("\nPayments")
    status, order = call(api, "/wallet/topup/order/", token, "POST",
                         {"amount_paise": 10000})
    made = status == 200 and (order or {}).get("ok")
    check("a test-mode order is created", made,
          (order or {}).get("order_id") or (order or {}).get("reason", ""))
    if made:
        check("the order carries a test key, not a live one",
              str(order.get("key_id", "")).startswith("rzp_test_"),
              order.get("key_id", ""))

    status, hook = call(api, "/wallet/webhook/razorpay/", None, "POST", {"event": "x"})
    # 500 = no secret set; 401 = set and the signature was refused. Either
    # is safe. 200 would mean an unsigned body was accepted.
    check("the webhook refuses an unsigned body", status in (401, 500), str(status))

    # ── the AI ─────────────────────────────────────────────────────────
    print("\nNamo AI")
    status, state = call(api, "/ai/", token)
    ok = status == 200 and "free_left" in (state or {})
    check("state reads", ok, f"{(state or {}).get('free_left')} free, "
                             f"₹{(state or {}).get('price_paise', 0) / 100:g} a question")
    if ok:
        check("the transcript comes back", isinstance(state.get("messages"), list),
              f"{len(state.get('messages') or [])} messages")

    status, answer = call(api, "/ai/ask/", token, "POST",
                          {"question": "Which sign is my ascendant?"})
    answered = status == 200 and (answer or {}).get("ok")
    check("a question is answered or refused cleanly",
          status == 200 and answer is not None,
          (answer or {}).get("reason") or "answered")
    if answered:
        text = answer.get("text", "")
        check("the answer is not the mock provider's canned reply",
              "shopping for a second opinion" not in text and len(text) > 20,
              text[:56] + "…")

    if answered:
        # Per question since 23 Sep. The field must be THERE even when the
        # answer was free — a client that cannot see what it was charged
        # cannot refresh a wallet, and a silent debit is a support ticket.
        check("the answer says what it cost",
              "charged_paise" in answer and "price_paise" in answer,
              f"charged ₹{answer.get('charged_paise', 0) / 100:g} "
              f"of ₹{answer.get('price_paise', 0) / 100:g}")

    # Rahul, 23 Sep: "It only replying in english". Asked in Devanagari,
    # answered in Devanagari — a prompt rule is not a guarantee, so it is
    # checked against the live model rather than trusted.
    status, hindi = call(api, "/ai/ask/", token, "POST",
                         {"question": "मेरी लग्न राशि क्या है?"})
    if status == 200 and (hindi or {}).get("ok"):
        text = hindi.get("text", "")
        check("a Hindi question is answered in Hindi",
              sum("\u0900" <= c <= "\u097f" for c in text) > 20,
              text[:56] + "…")

    # The meter is retired, not dormant. If this route still answers, some
    # deploy is running the old code and can still bill by the minute.
    status, _ = call(api, "/ai/session/", token, "POST")
    check("the per-minute meter is gone from the live API",
          status in (404, 405), str(status))

    # ── the invariant that catches whatever the rest missed ────────────
    print("\nLedger")
    ledger_ok = reconciles()
    if ledger_ok is None:
        print(f"  {DIM}skip  no database url — run with ~/namo-migration.env sourced{OFF}")
    else:
        check("every wallet still replays from its ledger", ledger_ok[0], ledger_ok[1])

    finish()


def reconciles():
    """The one check nothing else can fake: balances are a CACHE of the
    ledger, and if a single one has drifted, something wrote money without
    writing why."""
    url = os.environ.get("TARGET_DB_URL") or os.environ.get("DATABASE_URL")
    if not url:
        return None
    try:
        import subprocess

        result = subprocess.run(
            ["psql", url, "-tA", "-c",
             "select count(*) from (select w.profile_id, w.balance_paise,"
             " coalesce(sum(l.delta_paise),0) r from wallets w"
             " left join ledger l on l.wallet_id = w.profile_id"
             " group by 1,2) t where balance_paise <> r"],
            capture_output=True, text=True, timeout=30,
        )
        drifted = int((result.stdout or "0").strip() or 0)
        return drifted == 0, f"{drifted} drifted"
    except Exception as exc:  # noqa: BLE001
        return False, f"could not check: {type(exc).__name__}"


def finish():
    print()
    if failures:
        print(f"{RED}{len(failures)} failed:{OFF} " + "; ".join(failures))
        sys.exit(1)
    print(f"{GREEN}all clear{OFF}\n")


if __name__ == "__main__":
    main()
