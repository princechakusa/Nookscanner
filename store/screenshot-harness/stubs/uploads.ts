const MB = 1024 * 1024;
const parts = (n: number, done: number) =>
  Array.from({ length: n }, (_, i) => ({
    partNumber: i + 1,
    status: i < done ? 'uploaded' : 'pending',
  }));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const jobs: any[] = [
  {
    uploadId: 'u1',
    apartmentName: 'Harbour View 1204',
    sizeBytes: 1712 * MB,
    parts: parts(39, 24),
  },
  { uploadId: 'u2', apartmentName: 'Cedar Court 3B', sizeBytes: 968 * MB, parts: parts(22, 0) },
];
export const loadQueue = async () => jobs;
export const enqueueRecording = async () => {};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function runQueue(onProgress: (p: any) => void) {
  let sent = 1072 * MB;
  setInterval(() => {
    sent += 1.6 * MB; // about 5 MB/s, a typical home Wi-Fi upload
    onProgress({ uploadId: 'u1', partNumber: 25, sentBytes: sent, totalBytes: 1712 * MB });
  }, 300);
  return new Promise(() => {});
}
