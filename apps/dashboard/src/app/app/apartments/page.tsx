import type { Metadata } from 'next';
import { SectionPlaceholder } from '../section-placeholder.tsx';

export const metadata: Metadata = { title: 'Apartments' };

export default function ApartmentsPage() {
  return (
    <SectionPlaceholder
      title={'Apartments'}
      emptyTitle={'No apartments yet'}
      body={
        'Add apartments to a property, answer a short layout questionnaire, then capture or upload a walkthrough. Available in Phase 4.'
      }
    />
  );
}
