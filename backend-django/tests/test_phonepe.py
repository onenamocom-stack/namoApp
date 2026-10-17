"""The PhonePe client against a recorded-shape session: the token is
asked for once and reused, each call carries it as `O-Bearer`, the
requests have the shape PhonePe's v2 documentation gives, and a refusal
never leaks PhonePe's body (17 Oct 2026)."""

import pytest

from apps.wallet import phonepe


class Response:
    def __init__(self, status, body):
        self.status_code, self._body = status, body

    def json(self):
        return self._body


class Session:
    def __init__(self, pay=None, status=None):
        self.calls = []
        self.pay = pay or Response(200, {"orderId": "OMO1", "state": "PENDING", "redirectUrl": "https://mercury/t/1"})
        self.status = status or Response(200, {"orderId": "OMO1", "state": "COMPLETED", "amount": 10000})

    def post(self, url, **kw):
        self.calls.append(("POST", url, kw))
        if url.endswith("/oauth/token"):
            return Response(200, {"access_token": "tok-1", "expires_at": 4102444800})
        return self.pay

    def get(self, url, **kw):
        self.calls.append(("GET", url, kw))
        return self.status


@pytest.fixture(autouse=True)
def fresh_tokens():
    phonepe._token_cache.clear()


def _client(session, env="production"):
    return phonepe.PhonePeClient("CID", "SECRET", "1", env=env, session=session)


def test_the_token_is_asked_once_and_sent_as_o_bearer():
    session = Session()
    client = _client(session)
    client.create_payment("Nabc", 10000, "https://1namo.com/wallet", meta={"udf1": "p"})
    client.order_status("Nabc")
    tokens = [c for c in session.calls if c[1].endswith("/oauth/token")]
    assert len(tokens) == 1
    assert tokens[0][1] == "https://api.phonepe.com/apis/identity-manager/v1/oauth/token"
    assert tokens[0][2]["data"] == {
        "client_id": "CID", "client_version": "1", "client_secret": "SECRET",
        "grant_type": "client_credentials",
    }
    for method, url, kw in session.calls[1:]:
        assert kw["headers"]["Authorization"] == "O-Bearer tok-1"


def test_create_payment_shape():
    session = Session()
    got = _client(session).create_payment("Nabc", 10000, "https://1namo.com/wallet", meta={"udf1": "p"})
    assert got == {"order_id": "OMO1", "url": "https://mercury/t/1"}
    _, url, kw = session.calls[-1]
    assert url == "https://api.phonepe.com/apis/pg/checkout/v2/pay"
    assert kw["json"] == {
        "merchantOrderId": "Nabc", "amount": 10000, "expireAfter": 1200,
        "paymentFlow": {"type": "PG_CHECKOUT", "merchantUrls": {"redirectUrl": "https://1namo.com/wallet"}},
        "metaInfo": {"udf1": "p"},
    }


def test_status_url_and_sandbox_hosts():
    session = Session()
    assert _client(session, env="sandbox").order_status("Nabc")["state"] == "COMPLETED"
    assert session.calls[0][1] == "https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token"
    assert session.calls[-1][1] == "https://api-preprod.phonepe.com/apis/pg-sandbox/checkout/v2/order/Nabc/status"


def test_a_refusal_is_generic():
    session = Session(pay=Response(400, {"code": "BAD_REQUEST", "message": "secret detail"}))
    with pytest.raises(phonepe.PhonePeError) as exc:
        _client(session).create_payment("Nabc", 10000, "https://x")
    assert exc.value.status == 400 and exc.value.code == "BAD_REQUEST"
    assert "secret detail" not in str(exc.value)


def test_an_unknown_environment_is_refused():
    with pytest.raises(ValueError):
        phonepe.PhonePeClient("a", "b", "1", env="staging")
