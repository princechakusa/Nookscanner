import type { Metadata } from 'next';
import { SectionPlaceholder } from '../section-placeholder.tsx';

export const metadata: Metadata = { title: 'Scans' };

export default function ScansPage() {
  return (
    <SectionPlaceholder
      title={'Scans'}
      emptyTitle={'No scans yet'}
      body={
        'Guided captures and uploaded walkthrough videos, with their quality checks and processing status, appear here. Available in Phase 5.'
      }
    />
  );
}
