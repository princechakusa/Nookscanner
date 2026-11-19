import unittest

from nooktour_reconstruction.signing import sign_payload, verify_payload

# Same vector as packages/shared/src/signing.test.ts
SECRET = "nooktour-test-secret-0123456789abcdef"
TIMESTAMP = 1763510400
BODY = '{"jobId":"x"}'
EXPECTED = "v1=501734ef2194d71b17e3f00506c1d96e1b77111b2fd05d9bc3edb0fb994ef8fd"


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
