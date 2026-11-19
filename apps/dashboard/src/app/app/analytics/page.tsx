import type { Metadata } from 'next';
import { SectionPlaceholder } from '../section-placeholder.tsx';

export const metadata: Metadata = { title: 'Analytics' };

export default function AnalyticsPage() {
  return (
    <SectionPlaceholder
      title={'Analytics'}
      emptyTitle={'No guest activity yet'}
      body={
        'See which rooms and appliances guests explore and what they search for. Available in Phase 10.'
      }
    />
  );
}
