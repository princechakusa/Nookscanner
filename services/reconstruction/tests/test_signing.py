import unittest

from nookscanner_reconstruction.signing import sign_payload, verify_payload

# Same vector as packages/shared/src/signing.test.ts
SECRET = "nookscanner-test-secret-0123456789abcdef"
TIMESTAMP = 1763510400
BODY = '{"jobId":"x"}'
EXPECTED = "v1=cb4e09d32bf90c6683c8f0a37601a33dabab01c9e8c6116d1d6990034f61adcb"


class SigningTest(unittest.TestCase):
    def test_cross_language_vector(self):
        self.assertEqual(sign_payload(SECRET, TIMESTAMP, BODY), EXPECTED)

    def test_verify_ok(self):
        self.assertEqual(verify_payload(SECRET, TIMESTAMP, BODY, EXPECTED, now_seconds=TIMESTAMP + 10), (True, None))

    def test_tampered_body(self):
        self.assertEqual(
            verify_payload(SECRET, TIMESTAMP, '{"jobId":"y"}', EXPECTED, now_seconds=TIMESTAMP),
            (False, "BAD_SIGNATURE"),
        )

    def test_stale(self):
        self.assertEqual(
            verify_payload(SECRET, TIMESTAMP, BODY, EXPECTED, now_seconds=TIMESTAMP + 301),
            (False, "STALE_TIMESTAMP"),
        )

    def test_short_secret(self):
        with self.assertRaises(ValueError):
            sign_payload("short", TIMESTAMP, BODY)


if __name__ == "__main__":
    unittest.main()
