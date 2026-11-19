import type { Metadata } from 'next';
import { SectionPlaceholder } from '../section-placeholder.tsx';

export const metadata: Metadata = { title: 'Appliances & instructions' };

export default function AppliancesPage() {
  return (
    <SectionPlaceholder
      title={'Appliances & instructions'}
      emptyTitle={'No appliances yet'}
      body={
        'Pin appliances in the 3D apartment and add verified, model-specific instructions. Available in Phase 8.'
      }
    />
  );
}
