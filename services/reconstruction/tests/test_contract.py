import copy
import unittest

from nookscanner_reconstruction.contract import ContractError, parse_job_request
from nookscanner_reconstruction.providers import get_provider

VALID = {
    "contractVersion": 1,
    "jobId": "0b9f5c1e-8a51-4c5e-9d43-2f0c7b1a8e11",
    "attempt": 1,
    "organizationId": "2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f",
    "apartmentId": "7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d",
    "provider": "self_hosted_gsplat",
    "inputs": [
        {
            "uploadId": "11111111-2222-4333-8444-555555555555",
            "downloadUrl": "https://example.supabase.co/storage/v1/object/sign/raw-footage/x.mov?token=t",
            "sha256": "a" * 64,
            "sizeBytes": 1024,
        }
    ],
    "outputs": {
        "uploadUrls": {
            "ply": "https://example.test/ply",
            "sog": "https://example.test/sog",
            "spz": "https://example.test/spz",
            "preview": "https://example.test/preview",
        }
    },
    "callbackUrl": "https://example.supabase.co/functions/v1/job-callback",
    "parameters": {"maxGaussians": 3_000_000, "trainingSteps": 30_000, "frameSampleFps": 2},
}


class ContractTest(unittest.TestCase):
    def test_valid(self):
        job = parse_job_request(VALID)
        self.assertEqual(job.provider, "self_hosted_gsplat")
        self.assertEqual(len(job.inputs), 1)
        self.assertEqual(job.frame_sample_fps, 2.0)

    def _bad(self, mutate):
        data = copy.deepcopy(VALID)
        mutate(data)
        with self.assertRaises(ContractError):
            parse_job_request(data)

    def test_rejects_http_download(self):
        self._bad(lambda d: d["inputs"][0].update(downloadUrl="http://evil.test/x"))

    def test_rejects_non_https_callback(self):
        self._bad(lambda d: d.update(callbackUrl="file:///etc/passwd"))

    def test_rejects_bad_uuid(self):
        self._bad(lambda d: d.update(jobId="../../x"))

    def test_rejects_unknown_provider(self):
        self._bad(lambda d: d.update(provider="inria_original"))

    def test_rejects_bad_hash(self):
        self._bad(lambda d: d["inputs"][0].update(sha256="xyz"))

    def test_rejects_out_of_range_params(self):
        self._bad(lambda d: d["parameters"].update(maxGaussians=50_000_000))

    def test_rejects_wrong_version(self):
        self._bad(lambda d: d.update(contractVersion=2))

    def test_provider_stubs_are_not_silently_implemented(self):
        provider = get_provider("self_hosted_gsplat")
        with self.assertRaises(NotImplementedError):
            provider.run(parse_job_request(VALID), lambda stage, pct: None)


if __name__ == "__main__":
    unittest.main()
